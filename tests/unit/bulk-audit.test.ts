import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockWriteAuditLog, state, fakeTx, fakeDb } = vi.hoisted(() => {
  const state = {
    updateReturning: [] as Array<Record<string, unknown>>,
    selectRowsQueue: [] as Array<Array<Record<string, unknown>>>,
    outsideSelectQueue: [] as Array<Array<Record<string, unknown>>>,
    insertedValues: [] as Array<unknown>,
  };
  const mockWriteAuditLog = vi.fn(async (..._args: Array<unknown>) => {});
  const makeWhereResult = (rows: Array<Record<string, unknown>>) => {
    const promise = Promise.resolve(rows) as Promise<
      Array<Record<string, unknown>>
    > &
      Record<string, unknown>;
    promise.limit = async () => rows;
    promise.groupBy = async () => rows;
    return promise;
  };
  const fakeTx = {
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: async () => state.updateReturning,
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: async (vals: unknown) => {
        state.insertedValues.push(vals);
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => makeWhereResult(state.selectRowsQueue.shift() ?? []),
      }),
    })),
  };
  const fakeDb = {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(fakeTx)),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: async () => state.updateReturning,
        }),
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => makeWhereResult(state.outsideSelectQueue.shift() ?? []),
      }),
    })),
    insert: vi.fn(() => ({
      values: async (vals: unknown) => {
        state.insertedValues.push(vals);
      },
    })),
  };
  return { mockWriteAuditLog, state, fakeTx, fakeDb };
});

vi.mock("@/lib/db/client", () => ({
  get db() {
    return fakeDb;
  },
}));

vi.mock("@/features/audit/mutations", () => ({
  writeAuditLog: mockWriteAuditLog,
}));

import {
  bulkArchiveInquiriesForBusiness,
  bulkChangeInquiryStatusForBusiness,
  bulkDeleteInquiriesForBusiness,
  bulkUnarchiveInquiriesForBusiness,
} from "@/features/inquiries/mutations";
import { bulkVoidInvoicesForBusiness } from "@/features/invoices/mutations";
import {
  bulkArchiveQuotesForBusiness,
  bulkDeleteDraftQuotesForBusiness,
  bulkRestoreQuotesForBusiness,
  bulkVoidQuotesForBusiness,
} from "@/features/quotes/mutations";

function reset() {
  vi.clearAllMocks();
  state.updateReturning = [];
  state.selectRowsQueue = [];
  state.outsideSelectQueue = [];
  state.insertedValues = [];
}

function flatInserted(): Array<Record<string, unknown>> {
  return state.insertedValues.flatMap((vals) =>
    Array.isArray(vals) ? vals : [vals],
  ) as Array<Record<string, unknown>>;
}

describe("bulk mutation audit logging", () => {
  beforeEach(() => {
    reset();
  });

  it("logs activity and audit per archived inquiry", async () => {
    state.updateReturning = [
      { id: "inq_1", status: "new", customerName: "Ada" },
      { id: "inq_2", status: "quoted", customerName: "Bo" },
    ];

    const result = await bulkArchiveInquiriesForBusiness({
      businessId: "biz_1",
      inquiryIds: ["inq_1", "inq_2"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 2, skipped: 0 });
    const activities = flatInserted();
    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({
      businessId: "biz_1",
      inquiryId: "inq_1",
      actorUserId: "user_1",
      type: "inquiry.archived",
    });
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_1",
        actorUserId: "user_1",
        entityType: "request",
        entityId: "inq_1",
        action: "request.archived",
      }),
    );
  });

  it("logs only successful rows on partial bulk archive", async () => {
    state.updateReturning = [{ id: "inq_1", status: "new", customerName: "Ada" }];

    const result = await bulkArchiveInquiriesForBusiness({
      businessId: "biz_1",
      inquiryIds: ["inq_1", "missing", "other-biz"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 1, skipped: 2 });
    expect(flatInserted()).toHaveLength(1);
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog.mock.calls[0][1]).toMatchObject({ entityId: "inq_1" });
  });

  it("emits no events when every requested inquiry is skipped", async () => {
    state.updateReturning = [];

    const result = await bulkArchiveInquiriesForBusiness({
      businessId: "biz_1",
      inquiryIds: ["gone_1", "gone_2"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 0, skipped: 2 });
    expect(flatInserted()).toHaveLength(0);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("propagates bulk failures without partial events", async () => {
    fakeTx.update.mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            throw new Error("db down");
          },
        }),
      }),
    }));

    await expect(
      bulkDeleteInquiriesForBusiness({
        businessId: "biz_1",
        inquiryIds: ["inq_1"],
        actorUserId: "user_1",
      }),
    ).rejects.toThrow("db down");
    expect(flatInserted()).toHaveLength(0);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("logs bulk inquiry deletes with matching audit payloads", async () => {
    state.updateReturning = [{ id: "inq_9", status: "won", customerName: "Cy" }];

    const result = await bulkDeleteInquiriesForBusiness({
      businessId: "biz_1",
      inquiryIds: ["inq_9"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 1, skipped: 0 });
    expect(flatInserted()[0]).toMatchObject({ type: "inquiry.deleted" });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "request.deleted", entityId: "inq_9" }),
    );
  });

  it("logs status changes only for rows that actually changed", async () => {
    state.selectRowsQueue = [
      [
        { id: "inq_1", status: "new" },
        { id: "inq_2", status: "quoted" },
      ],
    ];
    state.updateReturning = [{ id: "inq_1" }, { id: "inq_2" }];

    const result = await bulkChangeInquiryStatusForBusiness({
      businessId: "biz_1",
      inquiryIds: ["inq_1", "inq_2"],
      actorUserId: "user_1",
      targetStatus: "quoted",
    });

    // Contract preserved: both rows count as affected, but only the
    // genuinely changed row receives a success event.
    expect(result).toEqual({ affected: 2, skipped: 0 });
    const activities = flatInserted();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      inquiryId: "inq_1",
      type: "inquiry.status_changed",
    });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("logs bulk unarchives without audit events", async () => {
    state.selectRowsQueue = [[{ id: "inq_1", status: "new" }]];
    state.updateReturning = [{ id: "inq_1" }];

    const result = await bulkUnarchiveInquiriesForBusiness({
      businessId: "biz_1",
      inquiryIds: ["inq_1"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 1, skipped: 0 });
    expect(flatInserted()[0]).toMatchObject({ type: "inquiry.unarchived" });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("logs bulk quote voids with activity and audit per quote", async () => {
    state.updateReturning = [
      {
        id: "q_1",
        inquiryId: "inq_1",
        quoteNumber: "Q-0001",
        title: "Roof",
        customerName: "Ada",
      },
    ];

    const result = await bulkVoidQuotesForBusiness({
      businessId: "biz_1",
      quoteIds: ["q_1", "q_draft"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 1, skipped: 1 });
    expect(flatInserted()[0]).toMatchObject({
      quoteId: "q_1",
      type: "quote.voided",
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "quote",
        entityId: "q_1",
        action: "quote.voided",
      }),
    );
  });

  it("logs bulk draft deletions and skips non-draft quotes", async () => {
    state.updateReturning = [
      {
        id: "q_d1",
        inquiryId: null,
        quoteNumber: "Q-0002",
        title: "Draft",
        customerName: "Bo",
      },
    ];

    const result = await bulkDeleteDraftQuotesForBusiness({
      businessId: "biz_1",
      quoteIds: ["q_d1", "q_sent"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 1, skipped: 1 });
    expect(flatInserted()[0]).toMatchObject({ type: "quote.deleted_draft" });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "quote.draft_deleted" }),
    );
  });

  it("skips success events for already-archived quotes", async () => {
    state.selectRowsQueue = [
      [
        { id: "q_a1", archivedAt: null },
        { id: "q_a2", archivedAt: new Date("2026-01-01") },
      ],
    ];
    state.updateReturning = [
      {
        id: "q_a1",
        inquiryId: null,
        quoteNumber: "Q-0003",
        status: "sent",
        validUntil: "2099-01-01",
      },
      {
        id: "q_a2",
        inquiryId: null,
        quoteNumber: "Q-0004",
        status: "sent",
        validUntil: "2099-01-01",
      },
    ];

    const result = await bulkArchiveQuotesForBusiness({
      businessId: "biz_1",
      quoteIds: ["q_a1", "q_a2"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 2, skipped: 0 });
    const activities = flatInserted();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ quoteId: "q_a1", type: "quote.archived" });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("keeps bulk quote archive/restore as activity-only", async () => {
    state.selectRowsQueue = [[{ id: "q_a1", archivedAt: null }]];
    state.updateReturning = [
      {
        id: "q_a1",
        inquiryId: null,
        quoteNumber: "Q-0003",
        status: "sent",
        validUntil: "2099-01-01",
      },
    ];

    const archived = await bulkArchiveQuotesForBusiness({
      businessId: "biz_1",
      quoteIds: ["q_a1"],
      actorUserId: "user_1",
    });
    expect(archived).toEqual({ affected: 1, skipped: 0 });
    expect(flatInserted()[0]).toMatchObject({ type: "quote.archived" });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();

    reset();
    state.updateReturning = [
      {
        id: "q_a1",
        inquiryId: null,
        quoteNumber: "Q-0003",
        status: "sent",
        validUntil: "2099-01-01",
      },
    ];

    const restored = await bulkRestoreQuotesForBusiness({
      businessId: "biz_1",
      quoteIds: ["q_a1"],
      actorUserId: "user_1",
    });
    expect(restored).toEqual({ affected: 1, skipped: 0 });
    expect(flatInserted()[0]).toMatchObject({ type: "quote.unarchived" });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("logs bulk invoice voids only for eligible invoices", async () => {
    state.outsideSelectQueue = [
      [
        { id: "inv_1", status: "sent" },
        { id: "inv_2", status: "sent" },
      ],
      [{ invoiceId: "inv_2", total: 5000 }],
    ];
    state.updateReturning = [{ id: "inv_1", invoiceNumber: "INV-000001" }];

    const result = await bulkVoidInvoicesForBusiness({
      businessId: "biz_1",
      invoiceIds: ["inv_1", "inv_2"],
      actorUserId: "user_1",
    });

    expect(result).toEqual({ affected: 1, skipped: 1 });
    expect(flatInserted()[0]).toMatchObject({ type: "invoice.voided" });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "invoice",
        entityId: "inv_1",
        action: "invoice.voided",
      }),
    );
  });

  it("emits no invoice events when nothing is eligible", async () => {
    state.outsideSelectQueue = [[{ id: "inv_9", status: "voided" }]];
    state.updateReturning = [];

    const result = await bulkVoidInvoicesForBusiness({
      businessId: "biz_1",
      invoiceIds: ["inv_9"],
      actorUserId: "user_1",
    });

    expect(result.affected).toBe(0);
    expect(flatInserted()).toHaveLength(0);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});
