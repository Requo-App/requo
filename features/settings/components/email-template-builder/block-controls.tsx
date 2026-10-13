"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  BlockSpacing,
  EmailTemplateBlock,
} from "@/features/settings/email-templates";
import { cn } from "@/lib/utils";

type StyleKey = keyof NonNullable<EmailTemplateBlock["style"]>;

function Segmented({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: React.ReactNode; title: string }>;
  value: string | undefined;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={label}
      onPointerDownCapture={(event) => event.stopPropagation()}
    >
      <span className="meta-label mr-1">{label}</span>
      {options.map((option) => {
        const active = (value ?? "") === option.value || (!value && option.value === "");
        return (
          <Button
            key={option.value}
            aria-label={`${label}: ${option.title}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            size="icon-xs"
            type="button"
            variant={active ? "secondary" : "ghost"}
            title={option.title}
            className={cn(active && "border-border/70")}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function SpacingControl({
  block,
  disabled,
  onUpdateStyle,
}: {
  block: EmailTemplateBlock;
  disabled?: boolean;
  onUpdateStyle: (id: string, key: StyleKey, value: string | undefined) => void;
}) {
  return (
    <Segmented
      label="Spacing"
      disabled={disabled}
      value={block.style?.spacing ?? ""}
      onChange={(next) =>
        onUpdateStyle(block.id, "spacing", (next || undefined) as BlockSpacing | undefined)
      }
      options={[
        { value: "", label: <span className="text-xs font-semibold">M</span>, title: "Comfortable" },
        { value: "compact", label: <span className="text-xs font-semibold">S</span>, title: "Compact" },
        { value: "spacious", label: <span className="text-xs font-semibold">L</span>, title: "Spacious" },
      ]}
    />
  );
}

/**
 * Hex color field that stays typeable: intermediate keystrokes are kept
 * locally while only empty or full `#rrggbb` values are committed upward.
 */
function HexColorInput({
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (next: string | undefined) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [prevValue, setPrevValue] = useState(value);
  // Adjust to external changes (e.g. swatch picker) while not editing.
  if (prevValue !== value) {
    setPrevValue(value);
    if (!focused) {
      setText(value);
    }
  }

  return (
    <Input
      aria-label={label}
      disabled={disabled}
      maxLength={7}
      onBlur={() => {
        setFocused(false);
        setText(value);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value.trim();
        if (!next || /^#[0-9a-fA-F]{0,6}$/.test(next)) {
          setText(next);
          onCommit(next.length === 7 ? next : undefined);
        }
      }}
      onFocus={() => {
        setFocused(true);
        setText(value);
      }}
      onPointerDownCapture={(event) => event.stopPropagation()}
      placeholder={placeholder}
      value={text}
      className="h-7 w-20 px-2 text-xs"
    />
  );
}

/**
 * Compact contextual controls shown under the selected block only.
 * Constrained style model: alignment, size, color, CTA colors, spacing.
 */
export function BlockControls({
  block,
  disabled,
  onUpdateStyle,
}: {
  block: EmailTemplateBlock;
  disabled?: boolean;
  onUpdateStyle: (id: string, key: StyleKey, value: string | undefined) => void;
}) {
  if (
    block.type === "greeting" ||
    block.type === "intro" ||
    block.type === "text" ||
    block.type === "closing"
  ) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
        aria-label={`${block.type} style controls`}
      >
        <Segmented
          label="Align"
          disabled={disabled}
          value={block.style?.align ?? ""}
          onChange={(next) => onUpdateStyle(block.id, "align", next || undefined)}
          options={[
            { value: "", label: <AlignLeft className="size-3.5" aria-hidden="true" />, title: "Left" },
            { value: "center", label: <AlignCenter className="size-3.5" aria-hidden="true" />, title: "Center" },
            { value: "right", label: <AlignRight className="size-3.5" aria-hidden="true" />, title: "Right" },
          ]}
        />
        <Segmented
          label="Size"
          disabled={disabled}
          value={block.style?.fontSize ?? ""}
          onChange={(next) => onUpdateStyle(block.id, "fontSize", next || undefined)}
          options={[
            { value: "sm", label: <span className="text-xs font-semibold">S</span>, title: "Small" },
            { value: "", label: <span className="text-xs font-semibold">M</span>, title: "Medium" },
            { value: "lg", label: <span className="text-xs font-semibold">L</span>, title: "Large" },
          ]}
        />
        <Segmented
          label="Color"
          disabled={disabled}
          value={block.style?.textColor ?? ""}
          onChange={(next) => onUpdateStyle(block.id, "textColor", next || undefined)}
          options={[
            { value: "", label: <span className="size-3.5 rounded-full bg-foreground" aria-hidden="true" />, title: "Default" },
            { value: "muted", label: <span className="size-3.5 rounded-full bg-muted-foreground" aria-hidden="true" />, title: "Muted" },
          ]}
        />
        <SpacingControl block={block} disabled={disabled} onUpdateStyle={onUpdateStyle} />
      </div>
    );
  }

  if (block.type === "cta") {
    return (
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
        aria-label="CTA style controls"
      >
        <Segmented
          label="Align"
          disabled={disabled}
          value={block.style?.align ?? ""}
          onChange={(next) => onUpdateStyle(block.id, "align", next || undefined)}
          options={[
            { value: "", label: <AlignLeft className="size-3.5" aria-hidden="true" />, title: "Left" },
            { value: "center", label: <AlignCenter className="size-3.5" aria-hidden="true" />, title: "Center" },
            { value: "right", label: <AlignRight className="size-3.5" aria-hidden="true" />, title: "Right" },
          ]}
        />
        <SpacingControl block={block} disabled={disabled} onUpdateStyle={onUpdateStyle} />
        <div
          className="flex items-center gap-1.5"
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <span className="meta-label">Button</span>
          <input
            aria-label="Pick button color"
            className="h-7 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-background"
            disabled={disabled}
            onChange={(event) => onUpdateStyle(block.id, "buttonColor", event.currentTarget.value)}
            type="color"
            value={
              /^#[0-9a-fA-F]{6}$/.test(block.style?.buttonColor ?? "")
                ? block.style?.buttonColor
                : "#008060"
            }
          />
          <HexColorInput
            label="Button color hex"
            disabled={disabled}
            placeholder="#008060"
            value={block.style?.buttonColor ?? ""}
            onCommit={(next) => onUpdateStyle(block.id, "buttonColor", next)}
          />
        </div>
        <div
          className="flex items-center gap-1.5"
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <span className="meta-label">Text</span>
          <input
            aria-label="Pick button text color"
            className="h-7 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-background"
            disabled={disabled}
            onChange={(event) =>
              onUpdateStyle(block.id, "buttonTextColor", event.currentTarget.value)
            }
            type="color"
            value={
              /^#[0-9a-fA-F]{6}$/.test(block.style?.buttonTextColor ?? "")
                ? block.style?.buttonTextColor
                : "#f4fffb"
            }
          />
          <HexColorInput
            label="Button text color hex"
            disabled={disabled}
            placeholder="#f4fffb"
            value={block.style?.buttonTextColor ?? ""}
            onCommit={(next) => onUpdateStyle(block.id, "buttonTextColor", next)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
      aria-label={`${block.type} style controls`}
    >
      {block.type === "signature" ||
      block.type === "notes" ||
      block.type === "payment-terms" ? (
        <span className="text-xs text-muted-foreground">
          {block.type === "signature"
            ? "Content comes from the business signature."
            : block.type === "payment-terms"
              ? "Content comes from the invoice payment terms."
              : "Content comes from the quote or invoice notes."}
        </span>
      ) : null}
      <SpacingControl block={block} disabled={disabled} onUpdateStyle={onUpdateStyle} />
    </div>
  );
}
