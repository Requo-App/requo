import "server-only";

import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getTableConfig, type AnyPgColumn } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

import { db } from "@/lib/db/client";
import { activityLogs, invoiceLineItems, invoices, payments, user } from "@/lib/db/schema";
import type { InvoiceDetail, InvoiceDetailCore, InvoiceLineItemView, InvoiceListFilters, InvoiceListItem, PaymentDetailView, PaymentListFilters, PaymentListItem, PaymentView } from "@/features/invoices/types";
import type { InvoiceStatus } from "@/lib/db/schema/invoices";
import { calculateInvoicePaymentState } from "@/features/invoices/utils";
import { getTodayUtcDateString } from "@/features/quotes/utils";
import { getBusinessInvoiceDetailCacheTags, getBusinessInvoiceListCacheTags, hotBusinessCacheLife } from "@/lib/cache/business-tags";

/**
 * Fully-qualified `"table"."column"` reference for use inside raw `sql`
 * fragments. Drizzle inlines columns unqualified there, which silently
 * rebinds correlated references to the inner table (e.g. `"id"` becomes
 * `payments.id` instead of `invoices.id`, zeroing every invoice balance).
 */
function qualified(column: AnyPgColumn) {
  const table = getTableConfig(column.table);
  const tableName = table.schema ? `"${table.schema}"."${table.name}"` : `"${table.name}"`;
  return sql.raw(`${tableName}."${column.name}"`);
}

/** Sum of non-voided payments for one invoice (same business). Single definition — admin reuses it. */
export const paidAmountSql = (invoiceIdColumn: AnyPgColumn = invoices.id) => sql<number>`coalesce((select sum(${qualified(payments.amountInCents)}) from ${payments} where ${qualified(payments.invoiceId)} = ${qualified(invoiceIdColumn)} and ${qualified(payments.businessId)} = ${qualified(invoices.businessId)} and ${qualified(payments.voidedAt)} is null), 0)`;

/**
 * Canonical effective status — mirrors `calculateInvoicePaymentState`.
 * UTC `today` (YYYY-MM-DD) must be passed explicitly; never use `current_date`.
 */
export function getEffectiveInvoiceStatusSql(today: string) {
  const paid = paidAmountSql();
  return sql<InvoiceStatus>`case
  when ${invoices.status} = 'draft' then 'draft'::invoice_status
  when ${invoices.status} = 'voided' then 'voided'::invoice_status
  when ${paid} >= ${invoices.totalInCents} then 'paid'::invoice_status
  when ${invoices.dueDate} < ${today}::date then 'overdue'::invoice_status
  when ${paid} > 0 then 'partially_paid'::invoice_status
  else 'unpaid'::invoice_status
end`;
}

function mapListRow(row: { id: string; invoiceNumber: string; title: string; customerName: string; customerEmail: string | null; currency: string; issueDate: string; dueDate: string; totalInCents: number; paidInCents: number; status: InvoiceStatus }, today: string): InvoiceListItem {
  const state = calculateInvoicePaymentState({ totalInCents: row.totalInCents, paidInCents: row.paidInCents, dueDate: row.dueDate, lifecycleStatus: row.status, today });
  return { ...row, ...state };
}

export async function getInvoiceListForBusiness({ businessId, filters, page = 1, pageSize = 20 }: { businessId: string; filters: InvoiceListFilters; page?: number; pageSize?: number }) {
  return getCachedInvoiceList({ businessId, filters, page, pageSize, today: getTodayUtcDateString() });
}

export async function getInvoiceListPageForBusiness({ businessId, filters, page = 1, pageSize = 20 }: { businessId: string; filters: Omit<InvoiceListFilters, "page">; page?: number; pageSize?: number }) {
  return getInvoiceListForBusiness({ businessId, filters: { ...filters, page }, page, pageSize });
}

export async function getInvoiceListCountForBusiness({ businessId, filters }: { businessId: string; filters: Omit<InvoiceListFilters, "page"> }) {
  return getInvoiceCountForBusiness({ businessId, filters: { ...filters, page: 1 } });
}

function buildInvoiceListConditions(businessId: string, filters: InvoiceListFilters, today: string) {
  const conditions = [eq(invoices.businessId, businessId), isNull(invoices.deletedAt)];
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(or(ilike(invoices.invoiceNumber, pattern), ilike(invoices.title, pattern), ilike(invoices.customerName, pattern), ilike(invoices.customerEmail, pattern))!);
  }
  if (filters.status !== "all") {
    conditions.push(sql`${getEffectiveInvoiceStatusSql(today)} = ${filters.status}::invoice_status`);
  }
  return conditions;
}

async function getCachedInvoiceList({ businessId, filters, page, pageSize, today }: { businessId: string; filters: InvoiceListFilters; page: number; pageSize: number; today: string }) {
  "use cache";
  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInvoiceListCacheTags(businessId));
  const paid = paidAmountSql();
  const conditions = buildInvoiceListConditions(businessId, filters, today);
  const orderBy = filters.sort === "oldest" ? asc(invoices.createdAt) : desc(invoices.createdAt);
  const rows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    title: invoices.title,
    customerName: invoices.customerName,
    customerEmail: invoices.customerEmail,
    currency: invoices.currency,
    issueDate: invoices.issueDate,
    dueDate: invoices.dueDate,
    totalInCents: invoices.totalInCents,
    paidInCents: paid,
    status: invoices.status,
  }).from(invoices).where(and(...conditions)).orderBy(orderBy).limit(pageSize).offset(Math.max(0, (page - 1) * pageSize));
  return rows.map((row) => mapListRow({ ...row, paidInCents: Number(row.paidInCents ?? 0) }, today));
}

export async function getInvoiceForBusiness({ businessId, invoiceId }: { businessId: string; invoiceId: string }): Promise<InvoiceDetail | null> {
  return getCachedInvoice({ businessId, invoiceId, today: getTodayUtcDateString() });
}

export type LinkedInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
};

export async function getInvoiceIdByQuoteId({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}): Promise<LinkedInvoiceSummary | null> {
  return getCachedInvoiceByQuote({ businessId, quoteId, today: getTodayUtcDateString() });
}

const getCachedInvoiceByQuote = cache(
  async ({ businessId, quoteId, today }: { businessId: string; quoteId: string; today: string }) => {
    "use cache";
    cacheLife(hotBusinessCacheLife);
    cacheTag(...getBusinessInvoiceListCacheTags(businessId));
    const [row] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        totalInCents: invoices.totalInCents,
        dueDate: invoices.dueDate,
        paidInCents: paidAmountSql(),
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, businessId),
          eq(invoices.quoteId, quoteId),
          isNull(invoices.deletedAt),
          sql`${invoices.status} <> 'voided'`,
        ),
      )
      .orderBy(desc(invoices.createdAt))
      .limit(1);
    if (!row) return null;
    const state = calculateInvoicePaymentState({
      totalInCents: row.totalInCents,
      paidInCents: Number(row.paidInCents ?? 0),
      dueDate: row.dueDate,
      lifecycleStatus: row.status,
      today,
    });
    return { id: row.id, invoiceNumber: row.invoiceNumber, status: state.status } as LinkedInvoiceSummary;
  },
);

/**
 * Cheap core of the invoice detail: the invoice row plus paid/balance
 * totals derived from a scalar payments sum. Paints the page header and
 * the status/amounts section while the line items and the recorded
 * payments stream behind their own boundaries.
 */
const getCachedInvoiceDetailCore = cache(
  async ({
    businessId,
    invoiceId,
    today,
  }: {
    businessId: string;
    invoiceId: string;
    today: string;
  }): Promise<InvoiceDetailCore | null> => {
    "use cache";
    cacheLife(hotBusinessCacheLife);
    cacheTag(...getBusinessInvoiceDetailCacheTags(businessId, invoiceId));
    const [row] = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      title: invoices.title,
      customerName: invoices.customerName,
      customerEmail: invoices.customerEmail,
      customerContactMethod: invoices.customerContactMethod,
      customerContactHandle: invoices.customerContactHandle,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalInCents: invoices.totalInCents,
      status: invoices.status,
      quoteId: invoices.quoteId,
      notes: invoices.notes,
      paymentTerms: invoices.paymentTerms,
      subtotalInCents: invoices.subtotalInCents,
      discountInCents: invoices.discountInCents,
      taxInCents: invoices.taxInCents,
      taxLabel: invoices.taxLabel,
      sentAt: invoices.sentAt,
      voidedAt: invoices.voidedAt,
      paidInCents: paidAmountSql(),
    }).from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId), isNull(invoices.deletedAt))).limit(1);
    if (!row) return null;
    const state = calculateInvoicePaymentState({ totalInCents: row.totalInCents, paidInCents: Number(row.paidInCents ?? 0), dueDate: row.dueDate, lifecycleStatus: row.status, today });
    return { ...row, paidInCents: state.paidInCents, balanceInCents: state.balanceInCents, status: state.status };
  },
);

const getCachedInvoiceItems = cache(
  async ({
    businessId,
    invoiceId,
  }: {
    businessId: string;
    invoiceId: string;
  }): Promise<InvoiceLineItemView[]> => {
    "use cache";
    cacheLife(hotBusinessCacheLife);
    cacheTag(...getBusinessInvoiceDetailCacheTags(businessId, invoiceId));
    return db.select({ id: invoiceLineItems.id, description: invoiceLineItems.description, quantity: invoiceLineItems.quantity, unitPriceInCents: invoiceLineItems.unitPriceInCents, lineTotalInCents: invoiceLineItems.lineTotalInCents, position: invoiceLineItems.position }).from(invoiceLineItems).where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.businessId, businessId))).orderBy(invoiceLineItems.position);
  },
);

const getCachedInvoicePayments = cache(
  async ({
    businessId,
    invoiceId,
  }: {
    businessId: string;
    invoiceId: string;
  }): Promise<PaymentView[]> => {
    "use cache";
    cacheLife(hotBusinessCacheLife);
    cacheTag(...getBusinessInvoiceDetailCacheTags(businessId, invoiceId));
    const paymentRows = await db.select({ id: payments.id, paymentNumber: payments.paymentNumber, amountInCents: payments.amountInCents, paymentDate: payments.paymentDate, method: payments.method, reference: payments.reference, notes: payments.notes, createdAt: payments.createdAt, voidedAt: payments.voidedAt, voidReason: payments.voidReason, source: payments.source, createdByName: user.name }).from(payments).leftJoin(user, eq(payments.createdBy, user.id)).where(and(eq(payments.invoiceId, invoiceId), eq(payments.businessId, businessId))).orderBy(desc(payments.paymentDate), desc(payments.createdAt));
    return paymentRows as PaymentView[];
  },
);

/**
 * Core slice of the invoice detail, for the staged detail page.
 *
 * Shares `getBusinessInvoiceDetailCacheTags` with the aggregate below, so
 * every existing invoice mutation still invalidates it.
 */
export async function getInvoiceDetailCoreForBusiness({ businessId, invoiceId }: { businessId: string; invoiceId: string }): Promise<InvoiceDetailCore | null> {
  return getCachedInvoiceDetailCore({ businessId, invoiceId, today: getTodayUtcDateString() });
}

/** Line items for the invoice detail page's own streaming region. */
export async function getInvoiceItemsForBusiness({ businessId, invoiceId }: { businessId: string; invoiceId: string }): Promise<InvoiceLineItemView[]> {
  return getCachedInvoiceItems({ businessId, invoiceId });
}

/** Recorded payments for the invoice detail page's own streaming region. */
export async function getInvoicePaymentsForBusiness({ businessId, invoiceId }: { businessId: string; invoiceId: string }): Promise<PaymentView[]> {
  return getCachedInvoicePayments({ businessId, invoiceId });
}

/**
 * Whole-record invoice payload.
 *
 * Composes the staged slices above so the print page, the export route,
 * and the invoice actions keep resolving a single record in one call.
 */
const getCachedInvoice = cache(
  async ({ businessId, invoiceId, today }: { businessId: string; invoiceId: string; today: string }): Promise<InvoiceDetail | null> => {
    "use cache";
    cacheLife(hotBusinessCacheLife);
    cacheTag(...getBusinessInvoiceDetailCacheTags(businessId, invoiceId));
    const [core, items, payments] = await Promise.all([
      getCachedInvoiceDetailCore({ businessId, invoiceId, today }),
      getCachedInvoiceItems({ businessId, invoiceId }),
      getCachedInvoicePayments({ businessId, invoiceId }),
    ]);
    if (!core) return null;
    return { ...core, items, payments };
  },
);

export type InvoiceExportRow = {
  invoiceNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  status: InvoiceStatus;
  quoteId: string | null;
  issueDate: string;
  dueDate: string;
  totalInCents: number;
  paidInCents: number;
  balanceInCents: number;
  currency: string;
  sentAt: Date | null;
  createdAt: Date;
};

export async function getInvoiceExportRowsForBusiness({
  businessId,
  filters,
}: {
  businessId: string;
  filters: InvoiceListFilters;
}): Promise<InvoiceExportRow[]> {
  const today = getTodayUtcDateString();
  const paid = paidAmountSql();
  const conditions = buildInvoiceListConditions(businessId, filters, today);
  const orderBy = filters.sort === "oldest" ? asc(invoices.createdAt) : desc(invoices.createdAt);
  const rows = await db
    .select({
      invoiceNumber: invoices.invoiceNumber,
      title: invoices.title,
      customerName: invoices.customerName,
      customerEmail: invoices.customerEmail,
      status: invoices.status,
      quoteId: invoices.quoteId,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalInCents: invoices.totalInCents,
      paidInCents: paid,
      currency: invoices.currency,
      sentAt: invoices.sentAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(5000);
  return rows.map((row) => {
    const state = calculateInvoicePaymentState({
      totalInCents: row.totalInCents,
      paidInCents: Number(row.paidInCents ?? 0),
      dueDate: row.dueDate,
      lifecycleStatus: row.status,
      today,
    });
    return { ...row, paidInCents: state.paidInCents, balanceInCents: state.balanceInCents, status: state.status };
  });
}

export async function getInvoiceCountForBusiness({ businessId, filters }: { businessId: string; filters: InvoiceListFilters }) {
  "use cache";
  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInvoiceListCacheTags(businessId));
  const today = getTodayUtcDateString();
  const conditions = buildInvoiceListConditions(businessId, filters, today);
  const [row] = await db.select({ value: sql<number>`count(*)` }).from(invoices).where(and(...conditions));
  return Number(row?.value ?? 0);
}

/* -------------------------------------------------------------------------- */
/*  Payments — operational list, detail, receipt, activity                     */
/* -------------------------------------------------------------------------- */

function buildPaymentListConditions(businessId: string, filters: Omit<PaymentListFilters, "page">) {
  const conditions = [eq(payments.businessId, businessId)];
  if (filters.status === "recorded") conditions.push(isNull(payments.voidedAt));
  if (filters.status === "voided") conditions.push(sql`${payments.voidedAt} is not null`);
  if (filters.method !== "all") conditions.push(eq(payments.method, filters.method));
  if (filters.from) conditions.push(sql`${payments.paymentDate} >= ${filters.from}`);
  if (filters.to) conditions.push(sql`${payments.paymentDate} <= ${filters.to}`);
  if (filters.invoiceId) conditions.push(eq(payments.invoiceId, filters.invoiceId));
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(payments.paymentNumber, pattern),
        ilike(payments.reference, pattern),
        ilike(invoices.invoiceNumber, pattern),
        ilike(invoices.customerName, pattern),
      )!,
    );
  }
  return conditions;
}

export type PaymentListPage = {
  items: PaymentListItem[];
  total: number;
};

export async function getPaymentListForBusiness({
  businessId,
  filters,
  page = 1,
  pageSize = 20,
}: {
  businessId: string;
  filters: PaymentListFilters;
  page?: number;
  pageSize?: number;
}): Promise<PaymentListPage> {
  "use cache";
  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInvoiceListCacheTags(businessId));
  const { page: _page, ...where } = filters;
  const conditions = buildPaymentListConditions(businessId, where);
  const [rows, [count]] = await Promise.all([
    db
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        customerName: invoices.customerName,
        currency: invoices.currency,
        amountInCents: payments.amountInCents,
        paymentDate: payments.paymentDate,
        method: payments.method,
        reference: payments.reference,
        voidedAt: payments.voidedAt,
        recordedByName: user.name,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.businessId, businessId)))
      .leftJoin(user, eq(payments.createdBy, user.id))
      .where(and(...conditions))
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(pageSize)
      .offset(Math.max(0, (page - 1) * pageSize)),
    db
      .select({ value: sql<number>`count(*)` })
      .from(payments)
      .innerJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.businessId, businessId)))
      .where(and(...conditions)),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      status: row.voidedAt ? ("voided" as const) : ("recorded" as const),
    })),
    total: Number(count?.value ?? 0),
  };
}

/**
 * Page slice of the payment list — mirrors `getInvoiceListPageForBusiness`
 * so the payments page can prefetch a cached page window like the other
 * list pages. Thin wrapper over `getPaymentListForBusiness` (shared cache).
 */
export async function getPaymentListPageForBusiness({ businessId, filters, page = 1, pageSize = 20 }: { businessId: string; filters: Omit<PaymentListFilters, "page">; page?: number; pageSize?: number }): Promise<PaymentListItem[]> {
  const { items } = await getPaymentListForBusiness({ businessId, filters: { ...filters, page }, page, pageSize });
  return items;
}

/** Result count for the payment list's toolbar and pagination. */
export async function getPaymentListCountForBusiness({ businessId, filters }: { businessId: string; filters: Omit<PaymentListFilters, "page"> }): Promise<number> {
  const { total } = await getPaymentListForBusiness({ businessId, filters: { ...filters, page: 1 }, page: 1, pageSize: 1 });
  return total;
}

export async function getPaymentDetailForBusiness({
  businessId,
  paymentId,
}: {
  businessId: string;
  paymentId: string;
}): Promise<PaymentDetailView | null> {
  "use cache";
  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInvoiceListCacheTags(businessId));
  const [row] = await db
    .select({
      id: payments.id,
      paymentNumber: payments.paymentNumber,
      invoiceId: payments.invoiceId,
      invoiceNumber: invoices.invoiceNumber,
      invoiceTitle: invoices.title,
      customerName: invoices.customerName,
      customerEmail: invoices.customerEmail,
      currency: invoices.currency,
      invoiceTotalInCents: invoices.totalInCents,
      invoiceStatus: invoices.status,
      invoiceDueDate: invoices.dueDate,
      amountInCents: payments.amountInCents,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      notes: payments.notes,
      source: payments.source,
      createdAt: payments.createdAt,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
      recordedByName: user.name,
    })
    .from(payments)
    .innerJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.businessId, businessId)))
    .leftJoin(user, eq(payments.createdBy, user.id))
    .where(and(eq(payments.id, paymentId), eq(payments.businessId, businessId)))
    .limit(1);
  if (!row) return null;
  const [paid] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)` })
    .from(payments)
    .where(and(eq(payments.invoiceId, row.invoiceId), eq(payments.businessId, businessId), isNull(payments.voidedAt)));
  const state = calculateInvoicePaymentState({
    totalInCents: row.invoiceTotalInCents,
    paidInCents: Number(paid?.total ?? 0),
    dueDate: row.invoiceDueDate,
    lifecycleStatus: row.invoiceStatus,
  });
  const { invoiceDueDate: _due, ...rest } = row;
  return {
    ...rest,
    createdByName: row.recordedByName,
    invoicePaidInCents: state.paidInCents,
    invoiceBalanceInCents: state.balanceInCents,
    invoiceStatus: state.status,
  };
}

export type InvoiceActivityItem = {
  id: string;
  type: string;
  summary: string;
  metadata: Record<string, unknown>;
  actorName: string | null;
  createdAt: Date;
};

export async function getInvoiceActivityForBusiness({
  businessId,
  invoiceId,
  limit = 50,
}: {
  businessId: string;
  invoiceId: string;
  limit?: number;
}): Promise<InvoiceActivityItem[]> {
  "use cache";
  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInvoiceDetailCacheTags(businessId, invoiceId));
  const rows = await db
    .select({
      id: activityLogs.id,
      type: activityLogs.type,
      summary: activityLogs.summary,
      metadata: activityLogs.metadata,
      actorName: user.name,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(user, eq(activityLogs.actorUserId, user.id))
    .where(and(eq(activityLogs.businessId, businessId), sql`${activityLogs.metadata}->>'invoiceId' = ${invoiceId}`))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, metadata: (row.metadata ?? {}) as Record<string, unknown> }));
}
