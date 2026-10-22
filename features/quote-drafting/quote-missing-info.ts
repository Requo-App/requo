import type { AiQuoteMissingInfoItem } from "@/features/quote-drafting/types";

const MAX_MISSING_INFO_ITEMS = 6;
const MAX_MISSING_INFO_LABEL_LENGTH = 80;
const MAX_MISSING_INFO_QUESTION_LENGTH = 240;
const MAX_CLARIFICATION_MESSAGE_LENGTH = 600;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit: number) {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function formatLabelForQuestion(label: string) {
  return label
    .replace(/[?.!]+$/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim()
    .toLowerCase();
}

function formatJoinedLabels(labels: string[]) {
  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function normalizeAiQuoteMissingInfo(
  items: AiQuoteMissingInfoItem[],
): AiQuoteMissingInfoItem[] {
  const normalizedItems: AiQuoteMissingInfoItem[] = [];
  const seenKeys = new Set<string>();

  for (const item of items) {
    const label = truncate(item.label, MAX_MISSING_INFO_LABEL_LENGTH);

    if (label.length < 2) {
      continue;
    }

    const question = truncate(
      item.question || `May I confirm the ${formatLabelForQuestion(label)}?`,
      MAX_MISSING_INFO_QUESTION_LENGTH,
    );
    const key = label.toLowerCase();

    if (!question || seenKeys.has(key)) {
      continue;
    }

    normalizedItems.push({
      label,
      question,
      critical: item.critical === true,
    });
    seenKeys.add(key);

    if (normalizedItems.length >= MAX_MISSING_INFO_ITEMS) {
      break;
    }
  }

  return normalizedItems;
}

export function buildQuoteClarificationMessage(
  missingInfo: AiQuoteMissingInfoItem[],
) {
  if (!missingInfo.length) {
    return null;
  }

  const labels = missingInfo
    .slice(0, 2)
    .map((item) => formatLabelForQuestion(item.label))
    .filter(Boolean);

  if (!labels.length) {
    return null;
  }

  return `Hi! Thanks for your inquiry. Before I send the final quote, may I confirm the ${formatJoinedLabels(labels)}?`;
}

export function normalizeAiQuoteClarificationMessage({
  message,
  missingInfo,
}: {
  message: string | null | undefined;
  missingInfo: AiQuoteMissingInfoItem[];
}) {
  if (!missingInfo.length) {
    return null;
  }

  const normalizedMessage =
    typeof message === "string"
      ? truncate(message, MAX_CLARIFICATION_MESSAGE_LENGTH)
      : "";

  return normalizedMessage || buildQuoteClarificationMessage(missingInfo);
}
