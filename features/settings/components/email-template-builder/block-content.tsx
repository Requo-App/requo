"use client";

import {
  getDefaultContentForBlockType,
  invoiceEmailSampleMergeValues,
  quoteEmailSampleMergeValues,
  replaceInvoiceMergeTags,
  replaceMergeTags,
  type EmailTemplateBlock,
  type EmailTemplateKind,
} from "@/features/settings/email-templates";
import { cn } from "@/lib/utils";

const SAMPLE_ITEMS = [
  { description: "Kitchen cabinet refacing", quantity: 1, total: "$1,800.00" },
  { description: "Quartz countertop install", quantity: 1, total: "$700.00" },
];

export function blockTextColor(color: unknown): string {
  if (color === "muted") return "var(--muted-foreground)";
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "var(--foreground)";
}

export function blockFontSize(size: unknown): string {
  if (size === "sm") return "0.8125rem";
  if (size === "lg") return "1.0625rem";
  return "0.9375rem";
}

export function blockAlign(align: unknown): "left" | "center" | "right" {
  if (align === "center" || align === "right") return align;
  return "left";
}

export function blockSpacing(spacing: unknown): string {
  if (spacing === "compact") return "0.5rem";
  if (spacing === "spacious") return "1.5rem";
  return "1rem";
}

function resolveText(
  raw: string | undefined,
  type: EmailTemplateBlock["type"],
  kind: EmailTemplateKind,
): string {
  const fallback = getDefaultContentForBlockType(type, kind);
  const source = raw?.trim() ? raw : fallback;
  if (kind === "invoice") {
    return replaceInvoiceMergeTags(source, invoiceEmailSampleMergeValues);
  }
  return replaceMergeTags(source, quoteEmailSampleMergeValues);
}

/**
 * Email-faithful visual rendering of a single block with sample data.
 * Shared by the canvas and the drag overlay. Production HTML stays in
 * `emails/templates/*` — this is the browser approximation that
 * shares block order, visibility, content, style values, and merge-tag
 * semantics with the production renderer.
 */
export function BlockContent({
  block,
  templateKind = "quote",
}: {
  block: EmailTemplateBlock;
  templateKind?: EmailTemplateKind;
}) {
  const align = blockAlign(block.style?.align);
  const marginTop = blockSpacing(block.style?.spacing);

  if (
    block.type === "greeting" ||
    block.type === "intro" ||
    block.type === "text" ||
    block.type === "closing"
  ) {
    const resolved = resolveText(block.content, block.type, templateKind);
    return (
      <p
        style={{
          marginTop,
          marginBottom: 0,
          color: blockTextColor(block.style?.textColor),
          fontSize: blockFontSize(block.style?.fontSize),
          lineHeight: 1.6,
          textAlign: align,
          whiteSpace: "pre-wrap",
        }}
      >
        {resolved}
      </p>
    );
  }

  if (block.type === "cta") {
    const resolved = resolveText(block.content, block.type, templateKind);
    const bg =
      block.style?.buttonColor &&
      /^#[0-9a-fA-F]{6}$/.test(block.style.buttonColor)
        ? block.style.buttonColor
        : "#008060";
    const fg =
      block.style?.buttonTextColor &&
      /^#[0-9a-fA-F]{6}$/.test(block.style.buttonTextColor)
        ? block.style.buttonTextColor
        : "#f4fffb";
    return (
      <div style={{ marginTop, textAlign: align }}>
        <span
          style={{
            display: "inline-block",
            borderRadius: 10,
            background: bg,
            color: fg,
            fontSize: 13,
            fontWeight: 700,
            padding: "10px 16px",
          }}
        >
          {resolved}
        </span>
      </div>
    );
  }

  if (block.type === "summary") {
    const isInvoice = templateKind === "invoice";
    return (
      <div
        className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
        style={{ marginTop }}
      >
        <p className="text-xs font-semibold text-foreground">
          {isInvoice ? "Invoice summary" : "Quote summary"}
        </p>
        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Reference</dt>
            <dd className="font-medium text-foreground">
              {isInvoice
                ? invoiceEmailSampleMergeValues.invoiceNumber
                : quoteEmailSampleMergeValues.quoteNumber}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Customer</dt>
            <dd className="font-medium text-foreground">
              {isInvoice
                ? invoiceEmailSampleMergeValues.customerName
                : quoteEmailSampleMergeValues.customerName}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{isInvoice ? "Due" : "Title"}</dt>
            <dd className="font-medium text-foreground">
              {isInvoice
                ? invoiceEmailSampleMergeValues.dueDate
                : quoteEmailSampleMergeValues.quoteTitle}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  if (block.type === "line-items") {
    return (
      <div
        className="overflow-hidden rounded-xl border border-border/60"
        style={{ marginTop }}
      >
        {SAMPLE_ITEMS.map((item) => (
          <div
            key={item.description}
            className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5 text-xs last:border-0"
          >
            <span className="font-medium text-foreground">
              {item.description}
            </span>
            <span className="text-muted-foreground">{item.total}</span>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "totals") {
    return (
      <div
        className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
        style={{ marginTop }}
      >
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-semibold text-foreground">$2,500.00</span>
        </div>
        <div className="mt-1.5 flex justify-between border-t border-border/50 pt-2 text-sm">
          <span className="font-bold text-foreground">Total</span>
          <span className="font-bold text-foreground">$2,500.00</span>
        </div>
        {templateKind === "invoice" ? (
          <div className="mt-1 flex justify-between text-xs">
            <span className="font-semibold text-foreground">Balance due</span>
            <span className="font-semibold text-foreground">
              {invoiceEmailSampleMergeValues.balanceDue}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  if (block.type === "notes") {
    return (
      <div
        className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground"
        style={{ marginTop }}
      >
        <p className="font-semibold text-foreground">Notes</p>
        <p className="mt-1">Includes materials and standard installation.</p>
      </div>
    );
  }

  if (block.type === "payment-terms") {
    return (
      <div
        className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground"
        style={{ marginTop }}
      >
        <p className="font-semibold text-foreground">Payment terms</p>
        <p className="mt-1">Due within 14 days. Bank transfer preferred.</p>
      </div>
    );
  }

  if (block.type === "signature") {
    return (
      <p className="text-xs text-muted-foreground" style={{ marginTop }}>
        Thanks,
        <br />
        {templateKind === "invoice"
          ? invoiceEmailSampleMergeValues.businessName
          : quoteEmailSampleMergeValues.businessName}
      </p>
    );
  }

  if (block.type === "divider") {
    return <hr className="border-border/60" style={{ marginTop }} />;
  }

  return (
    <div
      style={{
        height:
          block.style?.spacing === "compact"
            ? 8
            : block.style?.spacing === "spacious"
              ? 32
              : 18,
        marginTop: 0,
      }}
      aria-hidden="true"
      className={cn(block.type === "spacer" && "w-full")}
    />
  );
}
