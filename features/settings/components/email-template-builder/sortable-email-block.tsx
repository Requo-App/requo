"use client";

import { type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  EmailTemplateBlock,
  EmailTemplateKind,
} from "@/features/settings/email-templates";
import { cn } from "@/lib/utils";

import { BlockContent } from "./block-content";
import {
  EMAIL_BUILDER_BLOCK_META,
  isDeletableBlockType,
} from "./builder-types";

export const EMAIL_CANVAS_SORTABLE_TRANSITION = {
  duration: 160,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
} as const;

const EDITABLE_TYPES: ReadonlySet<EmailTemplateBlock["type"]> = new Set([
  "greeting",
  "intro",
  "text",
  "closing",
  "cta",
]);

type SortableEmailBlockProps = {
  block: EmailTemplateBlock;
  index: number;
  selected: boolean;
  editing: boolean;
  isPending?: boolean;
  prefersReducedMotion?: boolean;
  templateKind?: EmailTemplateKind;
  onSelect: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onUpdate?: (id: string, patch: Partial<EmailTemplateBlock>) => void;
  onUpdateStyle?: (
    id: string,
    key: keyof NonNullable<EmailTemplateBlock["style"]>,
    value: string | undefined,
  ) => void;
  onToggleVisibility: (id: string) => void;
  onRemove: (id: string) => void;
};

/**
 * Display-only sortable row. Editing + style controls live in the side
 * inspector so selection never shifts drag positions or overlaps siblings.
 * The whole row is draggable (editor + controls stop propagation); the grip
 * stays always-visible for discoverability + touch.
 */
export function SortableEmailBlock({
  block,
  index,
  selected,
  editing,
  isPending,
  prefersReducedMotion,
  templateKind = "quote",
  onSelect,
  onEdit,
  onToggleVisibility,
  onRemove,
}: SortableEmailBlockProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    disabled: false,
    transition: prefersReducedMotion
      ? null
      : EMAIL_CANVAS_SORTABLE_TRANSITION,
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    willChange: isDragging ? "transform" : undefined,
  } satisfies CSSProperties;

  const meta = EMAIL_BUILDER_BLOCK_META[block.type];
  const hidden = block.visible === false;
  const deletable = isDeletableBlockType(block.type);
  const editable = EDITABLE_TYPES.has(block.type);
  const dragHandleLabel = meta.label
    ? `Reorder ${meta.label} block ${index + 1}`
    : `Reorder block ${index + 1}`;

  function handleContentClick() {
    if (isPending) return;
    onSelect(block.id);
    if (editable && !editing) {
      onEdit(block.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative cursor-grab rounded-lg px-9 py-2 transition-[box-shadow,background-color,opacity] active:cursor-grabbing",
        "hover:bg-muted/40 hover:shadow-[inset_0_0_0_1px_var(--border)]",
        selected &&
          "bg-muted/40 shadow-[inset_0_0_0_2px_var(--primary)]",
        isDragging && "z-10 bg-background opacity-0 shadow-lg",
        hidden && "opacity-70",
        isDragging && hidden && "opacity-0",
      )}
      data-block-id={block.id}
      data-block-type={block.type}
      onClick={(event) => {
        event.stopPropagation();
        if (!selected) onSelect(block.id);
      }}
    >
      <div className="pointer-events-auto absolute top-1/2 left-1 flex -translate-y-1/2 items-center">
        <Button
          aria-label={dragHandleLabel}
          className="cursor-grab touch-none bg-background shadow-sm active:cursor-grabbing"
          ref={setActivatorNodeRef}
          size="icon-xs"
          type="button"
          variant="outline"
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <GripVertical aria-hidden="true" />
        </Button>
      </div>

      <div className="pointer-events-auto absolute top-1 right-1 flex items-center gap-1">
        <Button
          aria-label={hidden ? `Show ${meta.label} block` : `Hide ${meta.label} block`}
          aria-pressed={hidden}
          className="bg-background shadow-sm"
          disabled={isPending || block.type === "cta"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisibility(block.id);
          }}
          onPointerDownCapture={(event) => event.stopPropagation()}
          size="icon-xs"
          title={block.type === "cta" ? "The CTA block must stay visible" : undefined}
          type="button"
          variant="outline"
        >
          {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
        {deletable ? (
          <Button
            aria-label={`Delete ${meta.label} block`}
            className="bg-background shadow-sm"
            disabled={isPending}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(block.id);
            }}
            onPointerDownCapture={(event) => event.stopPropagation()}
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className={cn(hidden && "opacity-60")}>
        {hidden ? (
          <p className="meta-label mb-1 inline-flex rounded-full bg-muted px-2 py-0.5">
            Hidden from email
          </p>
        ) : null}
        <div
          onClick={handleContentClick}
          onKeyDown={(event) => {
            if (editable && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              handleContentClick();
            }
          }}
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          aria-label={
            editable ? `Edit ${meta.label} block` : `${meta.label} block`
          }
          className={editable ? "cursor-text rounded-md" : undefined}
        >
          <BlockContent block={block} templateKind={templateKind} />
        </div>
        {selected ? (
          <p className="mt-1 text-caption-2-regular text-muted-foreground">
            Selected — edit in the inspector panel.
            {block.type === "cta"
              ? " One CTA per template. It moves and restyles, but stays visible."
              : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
