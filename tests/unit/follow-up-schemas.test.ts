import { describe, it, expect } from "vitest";

import {
  followUpBulkActionSchema,
  followUpCompleteSchema,
  followUpCreateSchema,
  followUpEditSchema,
  followUpListFiltersSchema,
  followUpReassignSchema,
  followUpRescheduleSchema,
  followUpSnoozeSchema,
} from "@/features/follow-ups/schemas";

const validCreate = {
  title: "Call about the quote",
  reason: "The customer asked for a call back tomorrow.",
  channel: "email",
  category: "sales",
  sendMode: "manual",
  dueDate: "2026-01-20",
  recurrence: "none",
  recurrenceLimit: null,
  terminationCondition: null,
};

describe("features/follow-ups/schemas — create", () => {
  it("accepts a valid follow-up", () => {
    const result = followUpCreateSchema.safeParse(validCreate);

    expect(result.success).toBe(true);
  });

  it("rejects a short title or reason", () => {
    expect(
      followUpCreateSchema.safeParse({ ...validCreate, title: "a" }).success,
    ).toBe(false);
    expect(
      followUpCreateSchema.safeParse({ ...validCreate, reason: "b" }).success,
    ).toBe(false);
  });

  it("rejects an unknown channel", () => {
    expect(
      followUpCreateSchema.safeParse({ ...validCreate, channel: "carrier-pigeon" })
        .success,
    ).toBe(false);
  });

  it("rejects an impossible due date", () => {
    expect(
      followUpCreateSchema.safeParse({ ...validCreate, dueDate: "2026-02-30" })
        .success,
    ).toBe(false);
  });

  it("requires a limit when the series ends after a count", () => {
    const result = followUpCreateSchema.safeParse({
      ...validCreate,
      recurrence: "weekly",
      terminationCondition: "count",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "recurrenceLimit")).toBe(
        true,
      );
    }
  });

  it("rejects a limit without a repeating pattern", () => {
    const result = followUpCreateSchema.safeParse({
      ...validCreate,
      recurrence: "none",
      recurrenceLimit: 3,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a count-limited series", () => {
    expect(
      followUpCreateSchema.safeParse({
        ...validCreate,
        recurrence: "weekly",
        terminationCondition: "count",
        recurrenceLimit: 3,
      }).success,
    ).toBe(true);
  });
});

describe("features/follow-ups/schemas — edit", () => {
  it("applies the same recurrence rules as create", () => {
    expect(
      followUpEditSchema.safeParse({
        ...validCreate,
        recurrence: "weekly",
        terminationCondition: "count",
      }).success,
    ).toBe(false);

    expect(
      followUpEditSchema.safeParse({
        ...validCreate,
        recurrence: "weekly",
        terminationCondition: "count",
        recurrenceLimit: 2,
      }).success,
    ).toBe(true);
  });
});

describe("features/follow-ups/schemas — list filters", () => {
  it("defaults to the unfiltered list", () => {
    const result = followUpListFiltersSchema.safeParse({});

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.status).toBe("all");
      expect(result.data.due).toBe("all");
      expect(result.data.sort).toBe("due_asc");
      expect(result.data.page).toBe(1);
    }
  });

  it("falls back to page 1 for a non-numeric page", () => {
    const result = followUpListFiltersSchema.safeParse({ page: "abc" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.page).toBe(1);
    }
  });

  it("falls back to page 1 for a negative or zero page", () => {
    for (const page of ["0", "-3", "1e999"]) {
      const result = followUpListFiltersSchema.safeParse({ page });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.page).toBe(1);
      }
    }
  });

  it("keeps a valid page", () => {
    const result = followUpListFiltersSchema.safeParse({ page: "4" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.page).toBe(4);
    }
  });

  it("falls back to the default status for an unknown status", () => {
    const result = followUpListFiltersSchema.safeParse({ status: "nope" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.status).toBe("all");
    }
  });
});

describe("features/follow-ups/schemas — other inputs", () => {
  it("rejects an empty assignee", () => {
    expect(followUpReassignSchema.safeParse({ assignedToUserId: "" }).success).toBe(
      false,
    );
    expect(
      followUpReassignSchema.safeParse({ assignedToUserId: "user_1" }).success,
    ).toBe(true);
  });

  it("rejects an invalid reschedule date", () => {
    expect(
      followUpRescheduleSchema.safeParse({ dueDate: "2026-13-01" }).success,
    ).toBe(false);
    expect(
      followUpRescheduleSchema.safeParse({ dueDate: "2026-01-20" }).success,
    ).toBe(true);
  });

  it("caps the completion note and reports the failure", () => {
    expect(
      followUpCompleteSchema.safeParse({ completionNote: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      followUpCompleteSchema.safeParse({ completionNote: "left a voicemail" })
        .success,
    ).toBe(true);
  });

  it("accepts a missing or null completion note", () => {
    // The board's quick "Done" action submits no note at all, and
    // `FormData.get` returns null for an absent key.
    expect(followUpCompleteSchema.safeParse({}).success).toBe(true);
    expect(followUpCompleteSchema.safeParse({ completionNote: null }).success).toBe(
      true,
    );
    expect(followUpCompleteSchema.safeParse({ completionNote: "" }).success).toBe(
      true,
    );
  });

  it("requires a business-local snooze date/time", () => {
    expect(
      followUpSnoozeSchema.safeParse({ snoozedUntil: "2026-01-20T09:00" }).success,
    ).toBe(true);
    expect(followUpSnoozeSchema.safeParse({ snoozedUntil: "tomorrow" }).success).toBe(
      false,
    );
    expect(followUpSnoozeSchema.safeParse({ snoozedUntil: "" }).success).toBe(false);
  });

  it("caps the bulk selection", () => {
    expect(
      followUpBulkActionSchema.safeParse({ followUpIds: Array(51).fill("id") })
        .success,
    ).toBe(false);
    expect(
      followUpBulkActionSchema.safeParse({ followUpIds: ["a", "b"] }).success,
    ).toBe(true);
    expect(followUpBulkActionSchema.safeParse({ followUpIds: [] }).success).toBe(
      false,
    );
  });
});
