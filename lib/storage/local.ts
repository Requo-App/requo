import "server-only";

import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

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
import { signStorageUploadToken } from "./upload-token";

const defaultRoot = ".data/storage";

const contentTypeByExtension: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function getRoot() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_STORAGE_ROOT?.trim() ||
      defaultRoot,
  );
}

function resolveObjectPath(bucket: string, objectPath: string) {
  const root = getRoot();
  const resolved = path.resolve(root, bucket, objectPath);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage path.");
  }

  return resolved;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function inferContentType(objectPath: string) {
  return (
    contentTypeByExtension[path.extname(objectPath).toLowerCase()] ?? null
  );
}

async function walkFiles(
  root: string,
  directory: string,
  bucket: string,
  results: StorageObject[],
  limit: number | undefined,
) {
  if (limit !== undefined && results.length >= limit) {
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (limit !== undefined && results.length >= limit) {
      return;
    }

    // Do not follow symlinks: a storage tree must not be able to escape its
    // root through a link.
    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walkFiles(root, absolute, bucket, results, limit);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const info = await stat(absolute);
    const relative = toPosixPath(path.relative(path.join(root, bucket), absolute));

    results.push({
      path: relative,
      name: entry.name,
      size: info.size,
      contentType: inferContentType(entry.name),
      createdAt: info.birthtimeMs > 0 ? info.birthtime : info.mtime,
    });
  }
}

export class LocalObjectStorage implements ObjectStorage {
  readonly driver = "local" as const;

  async createUploadTarget(input: CreateStorageUploadTargetInput) {
    const token = signStorageUploadToken({
      bucket: input.bucket,
      path: input.path,
      contentType: input.contentType,
      maxBytes: input.maxBytes,
      expiresAt: Math.floor(Date.now() / 1000) + input.expiresInSeconds,
    });

    return {
      url: `/api/storage/upload?token=${encodeURIComponent(token)}`,
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
    };
  }

  async put(input: PutStorageObjectInput) {
    const absolute = resolveObjectPath(input.bucket, input.path);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.body);
  }

  async head(input: StorageObjectRef): Promise<StorageHead | null> {
    try {
      const info = await stat(
        /* turbopackIgnore: true */ resolveObjectPath(
          input.bucket,
          input.path,
        ),
      );

      return {
        size: info.size,
        contentType: inferContentType(input.path),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async get(input: StorageObjectRef): Promise<StorageReadResult> {
    const body = await readFile(
      /* turbopackIgnore: true */ resolveObjectPath(input.bucket, input.path),
    );

    return {
      body: new Uint8Array(body),
      contentType: inferContentType(input.path),
      size: body.byteLength,
    };
  }

  async delete(input: StorageObjectRef) {
    await rm(resolveObjectPath(input.bucket, input.path), { force: true });
  }

  async deleteMany(input: {
    bucket: StorageObjectRef["bucket"];
    paths: string[];
  }) {
    await Promise.all(
      input.paths.map((objectPath) =>
        this.delete({ bucket: input.bucket, path: objectPath }),
      ),
    );
  }

  async list(input: ListStorageObjectsInput): Promise<StorageObject[]> {
    const root = getRoot();
    const bucketRoot = path.join(
      /* turbopackIgnore: true */ root,
      input.bucket,
    );
    const prefix = input.prefix?.replace(/^\/+/, "") ?? "";
    const start = prefix
      ? path.resolve(bucketRoot, prefix)
      : bucketRoot;

    if (start !== bucketRoot && !start.startsWith(`${bucketRoot}${path.sep}`)) {
      throw new Error("Invalid storage prefix.");
    }

    const results: StorageObject[] = [];

    try {
      const info = await stat(start);

      if (info.isFile()) {
        results.push({
          path: prefix,
          name: path.basename(start),
          size: info.size,
          contentType: inferContentType(start),
          createdAt: info.birthtimeMs > 0 ? info.birthtime : info.mtime,
        });

        return results;
      }

      if (input.recursive === false) {
        const entries = await readdir(start, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isFile() || entry.isSymbolicLink()) {
            continue;
          }

          const absolute = path.join(start, entry.name);
          const fileInfo = await stat(absolute);

          results.push({
            path: toPosixPath(
              path.relative(bucketRoot, absolute),
            ),
            name: entry.name,
            size: fileInfo.size,
            contentType: inferContentType(entry.name),
            createdAt:
              fileInfo.birthtimeMs > 0 ? fileInfo.birthtime : fileInfo.mtime,
          });

          if (input.limit !== undefined && results.length >= input.limit) {
            break;
          }
        }

        return results;
      }

      await walkFiles(bucketRoot, start, input.bucket, results, input.limit);
      return results;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async ping() {
    await mkdir(getRoot(), { recursive: true });
  }
}
