import type { BusinessAuditLogItem } from "@/features/audit/types";
import {
  getAuditActionLabel,
  getAuditEntityLabel,
} from "@/features/audit/constants";
import {
  formatAuditActorLabel,
  formatAuditEventDetails,
  formatAuditTimestamp,
} from "@/features/audit/utils";

type BusinessAuditLogCardsProps = {
  items: BusinessAuditLogItem[];
};

/**
 * Mobile audit log cards shown below the `xl` breakpoint.
 *
 * Mirrors the inquiries mobile cards layout, but audit rows have no detail
 * route and no selection — so cards are plain non-interactive panels instead
 * of `MobileRecordRow` links.
 */
export function BusinessAuditLogCards({ items }: BusinessAuditLogCardsProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 xl:hidden">
      {items.map((item) => {
        const timestamp = formatAuditTimestamp(item);
        const actorLabel = formatAuditActorLabel(item);
        const actionLabel = getAuditActionLabel(item.action);
        const entityLabel = getAuditEntityLabel(item.entityType);
        const details = formatAuditEventDetails(item);

        return (
          <article
            key={item.id}
            className="rounded-xl border border-border/80 bg-background px-3.5 py-3 shadow-xs"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="break-words text-sm font-semibold tracking-tight text-foreground">
                {actionLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {actorLabel} · {entityLabel}
              </p>
              <p className="break-words text-xs leading-5 text-muted-foreground/90">
                {details}
              </p>
              <p className="text-xs text-muted-foreground/70" suppressHydrationWarning>
                {timestamp.absolute} · {timestamp.relative}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
