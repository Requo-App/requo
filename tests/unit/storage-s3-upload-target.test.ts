import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: mocks.createPresignedPost,
}));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: vi.fn(),
  DeleteObjectsCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadBucketCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  PutObjectCommand: vi.fn(),
  S3Client: class {
    send = mocks.send;
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_BUCKET: "test-bucket",
    S3_ENDPOINT: undefined,
    S3_FORCE_PATH_STYLE: undefined,
    S3_PREFIX: "requo",
    S3_REGION: "us-east-1",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
  },
}));

import { S3ObjectStorage } from "@/lib/storage/s3";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPresignedPost.mockResolvedValue({
    fields: {
      "Content-Type": "application/pdf",
      key: "requo/inquiry-attachments/uploads/upload-1/plan.pdf",
    },
    url: "https://test-bucket.s3.us-east-1.amazonaws.com/",
  });
});

describe("S3 upload targets", () => {
  it("uses a presigned POST bounded by the requested byte limit", async () => {
    const target = await new S3ObjectStorage().createUploadTarget({
      bucket: "inquiry-attachments",
      contentType: "application/pdf",
      expiresInSeconds: 600,
      maxBytes: 25 * 1024 * 1024,
      path: "uploads/upload-1/plan.pdf",
    });

    expect(target).toMatchObject({
      method: "POST",
      url: "https://test-bucket.s3.us-east-1.amazonaws.com/",
    });
    expect(mocks.createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Bucket: "test-bucket",
        Conditions: [
          ["content-length-range", 1, 25 * 1024 * 1024],
          ["eq", "$Content-Type", "application/pdf"],
        ],
        Expires: 600,
        Fields: { "Content-Type": "application/pdf" },
        Key: "requo/inquiry-attachments/uploads/upload-1/plan.pdf",
      }),
    );
  });
});
