import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  deleteMany: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getObjectStorage: () => ({
    list: mocks.list,
    deleteMany: mocks.deleteMany,
  }),
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));

import {
  publicInquiryAttachmentBucket,
  publicInquiryAttachmentUploadRoot,
} from "@/features/inquiries/attachments";
import { cleanupOrphanedInquiryAttachments } from "@/features/inquiries/attachment-cleanup";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.where.mockResolvedValue([]);
  mocks.deleteMany.mockResolvedValue(undefined);
});

describe("inquiry attachment cleanup", () => {
  it("removes only old objects that no inquiry attachment references", async () => {
    const old = new Date("2020-01-01T00:00:00.000Z");

    mocks.list.mockResolvedValue([
      {
        path: "uploads/folder/old.pdf",
        name: "old.pdf",
        size: 10,
        contentType: "application/pdf",
        createdAt: old,
      },
      {
        path: "uploads/folder/attached.pdf",
        name: "attached.pdf",
        size: 10,
        contentType: "application/pdf",
        createdAt: old,
      },
      {
        path: "uploads/folder/recent.pdf",
        name: "recent.pdf",
        size: 10,
        contentType: "application/pdf",
        createdAt: new Date(),
      },
    ]);
    mocks.where.mockResolvedValue([
      { storagePath: "uploads/folder/attached.pdf" },
    ]);

    const summary = await cleanupOrphanedInquiryAttachments();

    expect(mocks.list).toHaveBeenCalledWith({
      bucket: publicInquiryAttachmentBucket,
      prefix: `${publicInquiryAttachmentUploadRoot}/`,
      recursive: true,
      limit: 1000,
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      bucket: publicInquiryAttachmentBucket,
      paths: ["uploads/folder/old.pdf"],
    });
    expect(summary).toMatchObject({
      scanned: 2,
      removed: 1,
      removedPaths: ["uploads/folder/old.pdf"],
    });
  });

  it("scans one bounded flat prefix instead of paginating folders", async () => {
    mocks.list.mockResolvedValue([]);

    await cleanupOrphanedInquiryAttachments();

    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        recursive: true,
        limit: 1000,
      }),
    );
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("returns an empty summary when the bucket has no uploads", async () => {
    mocks.list.mockResolvedValue([]);

    await expect(cleanupOrphanedInquiryAttachments()).resolves.toEqual({
      scanned: 0,
      removed: 0,
      removedPaths: [],
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
