export const voidReasonValues = [
  "duplicate_entry",
  "wrong_amount",
  "wrong_invoice",
  "not_received",
  "entered_by_mistake",
  "other",
] as const;

export type VoidReasonValue = (typeof voidReasonValues)[number];

/**
 * Display labels — single home so the void dialogs, the activity feed, and
 * the receipts agree. `not_received` reads for both a payment that never
 * arrived and an invoice the customer never received.
 */
export const voidReasonLabels: Record<VoidReasonValue, string> = {
  duplicate_entry: "Duplicate entry",
  wrong_amount: "Wrong amount",
  wrong_invoice: "Wrong invoice",
  not_received: "Not received",
  entered_by_mistake: "Entered by mistake",
  other: "Other",
};

export function getVoidReasonLabel(value: string | null | undefined) {
  if (!value) return "No reason given";
  const [head, ...rest] = value.split("|");
  const canonical = head.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const label = (voidReasonLabels as Record<string, string>)[canonical];
  const detail = rest.join("|").trim();
  if (!label) return value;
  return detail ? `${label} — ${detail}` : label;
}

/** Normalize a void reason to `enum` or `enum|details`, preserving legacy free text as `other|text`. */
export function normalizeVoidReason(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim().slice(0, 500);
  if (!trimmed) return null;
  const [head, ...rest] = trimmed.split("|");
  const canonical = head.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const detail = rest.join("|").trim().slice(0, 400);
  if ((voidReasonValues as readonly string[]).includes(canonical)) {
    return detail ? `${canonical}|${detail}` : canonical;
  }
  return detail ? `other|${`${head.trim()} ${detail}`.trim().slice(0, 400)}` : `other|${head.trim().slice(0, 400)}`;
}
