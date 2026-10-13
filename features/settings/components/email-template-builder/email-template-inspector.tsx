"use client";

import type {
  EmailTemplateBlock,
  EmailTemplateKind,
} from "@/features/settings/email-templates";

import { BlockControls } from "./block-controls";
import { BlockEditor } from "./block-editor";
import { EMAIL_BUILDER_BLOCK_META } from "./builder-types";

const EDITABLE_TYPES: ReadonlySet<EmailTemplateBlock["type"]> = new Set([
  "greeting",
  "intro",
  "text",
  "closing",
  "cta",
]);

type EmailTemplateInspectorProps = {
  block: EmailTemplateBlock | null;
  templateKind?: EmailTemplateKind;
  disabled?: boolean;
  onUpdate: (id: string, patch: Partial<EmailTemplateBlock>) => void;
  onUpdateStyle: (
    id: string,
    key: keyof NonNullable<EmailTemplateBlock["style"]>,
    value: string | undefined,
  ) => void;
  onDone?: () => void;
};

/**
 * Stable side panel for the selected block. Keeps text editing + style
 * controls out of the sortable canvas so selection never shifts drag
 * positions or overlaps sibling blocks.
 */
export function EmailTemplateInspector({
  block,
  templateKind = "quote",
  disabled,
  onUpdate,
  onUpdateStyle,
  onDone,
}: EmailTemplateInspectorProps) {
  if (!block) {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
        <p className="text-sm font-medium text-foreground">Inspector</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a block in the canvas to edit its text and style. Drag blocks
          by their grip or anywhere on the row to reorder.
        </p>
      </div>
    );
  }

  const meta = EMAIL_BUILDER_BLOCK_META[block.type];
  const editable = EDITABLE_TYPES.has(block.type);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm"
      aria-label={`${meta.label} inspector`}
    >
      <div>
        <p className="text-sm font-medium text-foreground">{meta.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {meta.description}
        </p>
      </div>

      {editable ? (
        <BlockEditor
          block={block}
          disabled={disabled}
          templateKind={templateKind}
          onUpdate={onUpdate}
          onDone={onDone}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          This block renders from your {templateKind === "invoice" ? "invoice" : templateKind === "follow-up" ? "quote" : "quote"} data — no text to edit.
        </p>
      )}

      <BlockControls
        block={block}
        disabled={disabled}
        onUpdateStyle={onUpdateStyle}
      />

      {block.type === "cta" ? (
        <p className="text-xs text-muted-foreground">
          One CTA per template. It moves and restyles, but stays visible.
        </p>
      ) : null}
    </div>
  );
}
