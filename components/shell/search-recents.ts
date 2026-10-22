export type SearchRecordType =
  | "inquiry"
  | "quote"
  | "invoice"
  | "quote-library"
  | "service"
  | "follow-up";

export type RecentSearchRecord = {
  id: string;
  type: SearchRecordType;
  title: string;
  subtitle: string | null;
  href: string;
};

const MAX_RECENTS = 8;

const recentSearchRecordTypes = new Set<SearchRecordType>([
  "inquiry",
  "quote",
  "invoice",
  "quote-library",
  "service",
  "follow-up",
]);

function recentsKey(businessSlug: string) {
  return `requo:recent-records:${businessSlug}`;
}

function normalizeRecentRecord(value: unknown): RecentSearchRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record.type === "product" ? "quote-library" : record.type;
  const subtitle = record.subtitle;

  if (
    typeof record.id !== "string" ||
    typeof type !== "string" ||
    !recentSearchRecordTypes.has(type as SearchRecordType) ||
    typeof record.title !== "string" ||
    typeof record.href !== "string" ||
    (subtitle !== null && typeof subtitle !== "string")
  ) {
    return null;
  }

  return {
    id: record.id,
    type: type as SearchRecordType,
    title: record.title,
    subtitle,
    href: record.href,
  };
}

export function getRecentSearchRecords(
  businessSlug: string,
): RecentSearchRecord[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(recentsKey(businessSlug));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeRecentRecord)
      .filter((record): record is RecentSearchRecord => record !== null)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function recordRecentSearchRecord(
  businessSlug: string,
  record: RecentSearchRecord,
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const existing = getRecentSearchRecords(businessSlug).filter(
      (item) => !(item.id === record.id && item.type === record.type),
    );
    const next = [record, ...existing].slice(0, MAX_RECENTS);
    window.localStorage.setItem(recentsKey(businessSlug), JSON.stringify(next));
  } catch {
    // Storage full or unavailable — recents are best-effort.
  }
}

export function clearRecentSearchRecords(businessSlug: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(recentsKey(businessSlug));
  } catch {
    // Best-effort.
  }
}
