/**
 * URL builders for analytics drill-downs.
 *
 * Analytics is a lens on the existing lists, so every metric link lands on
 * the matching filtered list (inquiries, quotes, invoices, follow-ups) rather
 * than a dead end. The query layer embeds hrefs on its ranked items; these
 * builders cover the links sections add themselves.
 */

import {
  getBusinessFollowUpsPath,
  getBusinessInquiriesPath,
  getBusinessInvoicesPath,
  getBusinessQuotesPath,
} from "@/features/businesses/routes";

import type { AnalyticsTab } from "@/features/analytics/lib/window";

type QueryValue = string | undefined | null;

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") search.set(key, value);
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Tabs and range live in the URL so the page is shareable and back-safe. */
export function getAnalyticsTabHref(
  businessSlug: string,
  tab: AnalyticsTab,
  params: {
    range?: string | null;
    from?: string | null;
    to?: string | null;
    compare?: string | null;
  } = {},
): string {
  return withQuery(`/${businessSlug}/analytics`, {
    tab: tab === "overview" ? null : tab,
    range: params.range && params.range !== "30d" ? params.range : null,
    from: params.from,
    to: params.to,
    compare: params.compare === "0" ? "0" : null,
  });
}

export function getInquiriesListHref(
  businessSlug: string,
  filters: {
    status?: QueryValue;
    form?: QueryValue;
    source?: QueryValue;
  } = {},
): string {
  return withQuery(getBusinessInquiriesPath(businessSlug), filters);
}

export function getQuotesListHref(
  businessSlug: string,
  filters: { status?: QueryValue } = {},
): string {
  return withQuery(getBusinessQuotesPath(businessSlug), filters);
}

export function getInvoicesListHref(
  businessSlug: string,
  filters: { status?: QueryValue } = {},
): string {
  return withQuery(getBusinessInvoicesPath(businessSlug), filters);
}

export function getFollowUpsListHref(
  businessSlug: string,
  filters: { status?: QueryValue; due?: QueryValue } = {},
): string {
  return withQuery(getBusinessFollowUpsPath(businessSlug), filters);
}
