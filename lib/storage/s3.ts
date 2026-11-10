import "server-only";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { env } from "@/lib/env";
import type {
  CreateStorageUploadTargetInput,
  ListStorageObjectsInput,
  ObjectStorage,
  PutStorageObjectInput,
  StorageHead,
  StorageObject,
  StorageObjectRef,
  StorageReadResult,
} from "./types";

let client: S3Client | null = null;

function getBucket() {
  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET is required when REQUO_STORAGE_DRIVER=s3.");
  }

  return env.S3_BUCKET;
}

function getClient() {
  if (client) {
    return client;
  }

  if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when REQUO_STORAGE_DRIVER=s3.",
    );
  }

  client = new S3Client({
    region: env.S3_REGION ?? "auto",
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    ...(env.S3_FORCE_PATH_STYLE === "1" ||
    env.S3_FORCE_PATH_STYLE === "true"
      ? { forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });

  return client;
}

function getKeyPrefix() {
  const prefix = env.S3_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/` : "";
}

function toKey(bucket: string, objectPath: string) {
  return `${getKeyPrefix()}${bucket}/${objectPath.replace(/^\/+/, "")}`;
}

function fromKey(bucket: string, key: string) {
  const prefix = `${getKeyPrefix()}${bucket}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function isNotFound(error: unknown) {
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate?.name === "NotFound" ||
    candidate?.name === "NoSuchKey" ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}

export class S3ObjectStorage implements ObjectStorage {
  readonly driver = "s3" as const;

  async createUploadTarget(input: CreateStorageUploadTargetInput) {
    // A presigned POST policy can enforce both the content type and the byte
    // range. A presigned PUT cannot express an upper bound, which would let a
    // caller reuse the URL for an arbitrarily large object.
    const { url, fields } = await createPresignedPost(getClient(), {
      Bucket: getBucket(),
      Key: toKey(input.bucket, input.path),
      Expires: input.expiresInSeconds,
      Fields: { "Content-Type": input.contentType },
      Conditions: [
        ["content-length-range", 1, input.maxBytes],
        ["eq", "$Content-Type", input.contentType],
      ],
    });

    return {
      url,
      method: "POST" as const,
      fields,
    };
  }

  async put(input: PutStorageObjectInput) {
    await getClient().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: toKey(input.bucket, input.path),
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async head(input: StorageObjectRef): Promise<StorageHead | null> {
    try {
      const result = await getClient().send(
        new HeadObjectCommand({
          Bucket: getBucket(),
          Key: toKey(input.bucket, input.path),
        }),
      );

      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  async get(input: StorageObjectRef): Promise<StorageReadResult> {
    const result = await getClient().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: toKey(input.bucket, input.path),
      }),
    );

    if (!result.Body) {
      throw new Error("S3 returned an empty object.");
    }

    const body = await result.Body.transformToByteArray();

    return {
      body,
      contentType: result.ContentType ?? null,
      size: result.ContentLength ?? body.byteLength,
    };
  }

  async delete(input: StorageObjectRef) {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: toKey(input.bucket, input.path),
      }),
    );
  }

  async deleteMany(input: {
    bucket: StorageObjectRef["bucket"];
    paths: string[];
  }) {
    for (let index = 0; index < input.paths.length; index += 1000) {
      const chunk = input.paths.slice(index, index + 1000);

      if (chunk.length === 0) {
        continue;
      }

      const result = await getClient().send(
        new DeleteObjectsCommand({
          Bucket: getBucket(),
          Delete: {
            Objects: chunk.map((objectPath) => ({
              Key: toKey(input.bucket, objectPath),
            })),
            Quiet: true,
          },
        }),
      );

      if (result.Errors?.length) {
        throw new Error(
          `S3 failed to delete ${result.Errors.length} object(s).`,
        );
      }
    }
  }

  async list(input: ListStorageObjectsInput): Promise<StorageObject[]> {
    const results: StorageObject[] = [];
    const prefix = toKey(input.bucket, input.prefix ?? "");
    const relativePrefix = (input.prefix ?? "").replace(/^\/+|\/+$/g, "");
    let continuationToken: string | undefined;

    do {
      const page = await getClient().send(
        new ListObjectsV2Command({
          Bucket: getBucket(),
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );

      for (const object of page.Contents ?? []) {
        if (!object.Key || object.Key.endsWith("/")) {
          continue;
        }

        const objectPath = fromKey(input.bucket, object.Key);
        const relativePath = relativePrefix
          ? objectPath.slice(relativePrefix.length + 1)
          : objectPath;

        if (input.recursive === false && relativePath.includes("/")) {
          continue;
        }

        results.push({
          path: objectPath,
          name: objectPath.split("/").pop() ?? objectPath,
          size: object.Size ?? null,
          contentType: null,
          createdAt: object.LastModified ?? null,
        });

        if (input.limit !== undefined && results.length >= input.limit) {
          return results;
        }
      }

      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return results;
  }

  async ping() {
    await getClient().send(new HeadBucketCommand({ Bucket: getBucket() }));
  }
}
