import { z } from "zod";

import { knowledgeCategories } from "@/lib/db/schema/knowledge";
import {
  KNOWLEDGE_CONTENT_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
} from "@/features/knowledge/types";

export const knowledgeEntryInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Give the entry a short title.")
    .max(
      KNOWLEDGE_TITLE_MAX_LENGTH,
      `Titles must be ${KNOWLEDGE_TITLE_MAX_LENGTH} characters or fewer.`,
    ),
  content: z
    .string()
    .trim()
    .min(10, "Add at least a sentence of detail.")
    .max(
      KNOWLEDGE_CONTENT_MAX_LENGTH,
      `Entries must be ${KNOWLEDGE_CONTENT_MAX_LENGTH} characters or fewer.`,
    ),
  category: z.enum(knowledgeCategories).default("business_rules"),
});

export type KnowledgeEntryInput = z.infer<typeof knowledgeEntryInputSchema>;

export const knowledgeEntryUpdateSchema = z.object({
  title: knowledgeEntryInputSchema.shape.title.optional(),
  content: knowledgeEntryInputSchema.shape.content.optional(),
  category: knowledgeEntryInputSchema.shape.category.optional(),
  position: z.number().int().min(0).optional(),
});

export type KnowledgeEntryUpdate = z.infer<typeof knowledgeEntryUpdateSchema>;

export const knowledgeFileUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Choose a file to upload.")
    .max(255, "File names must be 255 characters or fewer."),
  mimeType: z.string().trim().min(1).max(120),
  byteSize: z
    .number()
    .int("File size must be a whole number of bytes.")
    .min(1, "The file is empty.")
    .max(5 * 1024 * 1024, "Files must be 5 MB or smaller."),
  content: z.instanceof(ArrayBuffer).or(z.instanceof(Uint8Array)),
});

export type KnowledgeFileUploadInput = z.infer<typeof knowledgeFileUploadSchema>;
