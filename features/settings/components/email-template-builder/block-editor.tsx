"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getMergeTagsForKind,
  type EmailTemplateBlock,
  type EmailTemplateKind,
} from "@/features/settings/email-templates";

import { EMAIL_BUILDER_BLOCK_META } from "./builder-types";

export function insertTagAtCursor(
  field: HTMLTextAreaElement | HTMLInputElement | null,
  currentValue: string,
  tag: string,
  onChange: (next: string) => void,
) {
  if (!field) {
    onChange(
      `${currentValue}${currentValue.endsWith(" ") || !currentValue ? "" : " "}${tag}`,
    );
    return;
  }
  const start = field.selectionStart ?? currentValue.length;
  const end = field.selectionEnd ?? currentValue.length;
  const next = `${currentValue.slice(0, start)}${tag}${currentValue.slice(end)}`;
  onChange(next);
  requestAnimationFrame(() => {
    field.focus();
    const cursor = start + tag.length;
    field.setSelectionRange(cursor, cursor);
  });
}

type BlockEditorProps = {
  block: EmailTemplateBlock;
  disabled?: boolean;
  templateKind?: EmailTemplateKind;
  onUpdate: (id: string, patch: Partial<EmailTemplateBlock>) => void;
  onDone?: () => void;
};

function MergeTagRow({
  disabled,
  templateKind = "quote",
  onInsert,
}: {
  disabled?: boolean;
  templateKind?: EmailTemplateKind;
  onInsert: (tag: string) => void;
}) {
  const tags = getMergeTagsForKind(templateKind);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Insert:</span>
      {tags.map((tag) => (
        <Button
          key={tag.tag}
          disabled={disabled}
          onClick={() => onInsert(tag.tag)}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDownCapture={(event) => event.stopPropagation()}
          size="sm"
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs"
        >
          {tag.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Plain-text editor for text-like blocks. No rich text, no contenteditable —
 * a normal Textarea/Input that replaces the display content while editing.
 */
export function BlockEditor({
  block,
  disabled,
  templateKind = "quote",
  onUpdate,
  onDone,
}: BlockEditorProps) {
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const meta = EMAIL_BUILDER_BLOCK_META[block.type];
  const contentValue = block.content ?? "";

  useEffect(() => {
    fieldRef.current?.focus();
  }, [block.id]);

  if (block.type === "cta") {
    return (
      <div onPointerDownCapture={(event) => event.stopPropagation()}>
        <label
          htmlFor={`email-block-cta-${block.id}`}
          className="meta-label mb-1.5 block"
        >
          Button label
        </label>
        <Input
          ref={(node) => {
            fieldRef.current = node;
          }}
          disabled={disabled}
          id={`email-block-cta-${block.id}`}
          maxLength={meta.contentMaxLength || 60}
          onBlur={onDone}
          onChange={(event) =>
            onUpdate(block.id, { content: event.currentTarget.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          placeholder="Review quote online"
          value={contentValue}
        />
      </div>
    );
  }

  return (
    <div onPointerDownCapture={(event) => event.stopPropagation()}>
      <label
        htmlFor={`email-block-content-${block.id}`}
        className="meta-label mb-1.5 block"
      >
        {block.type === "text" ? "Paragraph text" : `${meta.label} text`}
      </label>
      <Textarea
        ref={(node) => {
          fieldRef.current = node;
        }}
        disabled={disabled}
        id={`email-block-content-${block.id}`}
        maxLength={meta.contentMaxLength || 400}
        onBlur={onDone}
        onChange={(event) =>
          onUpdate(block.id, { content: event.currentTarget.value })
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        placeholder={
          block.type === "text"
            ? "Thanks for reaching out, {{customerName}}."
            : undefined
        }
        rows={block.type === "greeting" ? 2 : 3}
        value={contentValue}
        className="min-h-0"
      />
      <MergeTagRow
        disabled={disabled}
        templateKind={templateKind}
        onInsert={(tag) =>
          insertTagAtCursor(
            fieldRef.current as HTMLTextAreaElement | null,
            contentValue,
            tag,
            (next) => onUpdate(block.id, { content: next }),
          )
        }
      />
    </div>
  );
}
