import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

const deleteChunkSize = 100;

/**
 * Supabase Storage adapter. Keeps the existing bucket/path contract and the
 * signed-upload flow; nothing outside this file imports the Supabase storage
 * API.
 */
export class SupabaseObjectStorage implements ObjectStorage {
  readonly driver = "supabase" as const;

  private get client() {
    return createSupabaseAdminClient();
  }

  async createUploadTarget(input: CreateStorageUploadTargetInput) {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .createSignedUploadUrl(input.path);

    if (error || !data?.signedUrl) {
      throw new Error(
        `Failed to create a signed ${input.bucket} upload URL: ${error?.message ?? "no URL"}`,
      );
    }

    return {
      url: data.signedUrl,
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
    };
  }

  async put(input: PutStorageObjectInput) {
    const { error } = await this.client.storage
      .from(input.bucket)
      .upload(input.path, input.body, {
        contentType: input.contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload to ${input.bucket}: ${error.message}`);
    }
  }

  async head(input: StorageObjectRef): Promise<StorageHead | null> {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .info(input.path);

    if (error || !data) {
      return null;
    }

    return {
      size: data.size ?? 0,
      contentType:
        data.contentType ??
        (data.metadata as { mimetype?: string } | null)?.mimetype ??
        null,
    };
  }

  async get(input: StorageObjectRef): Promise<StorageReadResult> {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .download(input.path);

    if (error || !data) {
      throw new Error(
        `Failed to download from ${input.bucket}: ${error?.message ?? "no data"}`,
      );
    }

    const body = new Uint8Array(await data.arrayBuffer());

    return {
      body,
      contentType: data.type || null,
      size: body.byteLength,
    };
  }

  async delete(input: StorageObjectRef) {
    const { error } = await this.client.storage
      .from(input.bucket)
      .remove([input.path]);

    if (error) {
      throw new Error(`Failed to delete from ${input.bucket}: ${error.message}`);
    }
  }

  async deleteMany(input: {
    bucket: StorageObjectRef["bucket"];
    paths: string[];
  }) {
    for (let index = 0; index < input.paths.length; index += deleteChunkSize) {
      const chunk = input.paths.slice(index, index + deleteChunkSize);

      if (chunk.length === 0) {
        continue;
      }

      const { error } = await this.client.storage
        .from(input.bucket)
        .remove(chunk);

      if (error) {
        throw new Error(
          `Failed to delete from ${input.bucket}: ${error.message}`,
        );
      }
    }
  }

  async list(input: ListStorageObjectsInput): Promise<StorageObject[]> {
    const results: StorageObject[] = [];
    const prefix = (input.prefix ?? "").replace(/^\/+|\/+$/g, "");
    const queue = [prefix];

    while (queue.length > 0) {
      if (input.limit !== undefined && results.length >= input.limit) {
        break;
      }

      const current = queue.shift() ?? "";
      const { data, error } = await this.client.storage
        .from(input.bucket)
        .list(current, {
          limit: 100,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) {
        throw new Error(
          `Failed to list ${input.bucket}: ${error.message}`,
        );
      }

      for (const entry of data ?? []) {
        const entryPath = current ? `${current}/${entry.name}` : entry.name;
        // Supabase marks folders with a null id and file entries with one.
        const isFolder = entry.id === null;

        if (isFolder) {
          if (input.recursive !== false) {
            queue.push(entryPath);
          }
          continue;
        }

        results.push({
          path: entryPath,
          name: entry.name,
          size: entry.metadata?.size ?? null,
          contentType: entry.metadata?.mimetype ?? null,
          createdAt: entry.created_at ? new Date(entry.created_at) : null,
        });

        if (input.limit !== undefined && results.length >= input.limit) {
          break;
        }
      }
    }

    return results;
  }

  async ping() {
    const { error } = await this.client.storage.listBuckets();

    if (error) {
      throw new Error(`Supabase Storage is unavailable: ${error.message}`);
    }
  }
}
