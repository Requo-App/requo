import { formatQuoteMoney } from "@/features/quotes/utils";
import type {
  PublicQuotePaymentSchedule,
  PublicQuoteView,
} from "@/features/quotes/types";
import { cn } from "@/lib/utils";

export type QuoteScopeBlock = PublicQuoteView["scopeBlocks"][number];

type QuoteScopeListProps = {
  blocks: QuoteScopeBlock[];
  paymentSchedule?: PublicQuotePaymentSchedule | null;
  currency: string;
  /** Extra classes for each rendered block section. */
  blockClassName?: string;
  /** Extra classes for the block heading. */
  titleClassName?: string;
};

const scopeBlockTitles: Record<QuoteScopeBlock["kind"], string> = {
  deliverables: "Included work",
  exclusions: "Not included",
  assumptions: "Assumptions",
  allowances: "Allowances",
  revision_cap: "Revisions",
  acceptance_criteria: "Approval criteria",
  usage_rights: "Usage rights",
  client_responsibilities: "Customer responsibilities",
  timeline: "Timeline",
  payment_schedule: "Payment schedule",
};

/**
 * Single renderer for customer-visible scope. Used by the public quote page,
 * both owner previews, and the print/PDF document so the contract the
 * customer accepts cannot drift between surfaces.
 */
export function QuoteScopeList({
  blocks,
  paymentSchedule,
  currency,
  blockClassName,
  titleClassName,
}: QuoteScopeListProps) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => (
        <QuoteScopeBlockSection
          block={block}
          blockClassName={blockClassName}
          currency={currency}
          key={`${block.kind}-${index}`}
          paymentSchedule={paymentSchedule}
          titleClassName={titleClassName}
        />
      ))}
    </div>
  );
}

function QuoteScopeBlockSection({
  block,
  paymentSchedule,
  currency,
  blockClassName,
  titleClassName,
}: {
  block: QuoteScopeBlock;
  paymentSchedule?: PublicQuotePaymentSchedule | null;
  currency: string;
  blockClassName?: string;
  titleClassName?: string;
}) {
  const content = block.content;

  // An empty timeline has nothing to say: do not render a heading for it.
  if (block.kind === "timeline") {
    const milestones = asRecordArray(content.milestones);
    const note = typeof content.note === "string" ? content.note.trim() : "";

    if (!milestones.length && !note) return null;

    return (
      <BlockSection
        blockClassName={blockClassName}
        kind={block.kind}
        titleClassName={titleClassName}
      >
        {milestones.length ? (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {milestones.map((milestone, index) => (
              <li key={`${String(milestone.label)}-${index}`}>
                {String(milestone.label)}
                {milestone.date ? ` · ${String(milestone.date)}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {note ? (
          <p className="text-sm leading-5 text-muted-foreground">{note}</p>
        ) : null}
      </BlockSection>
    );
  }

  if (block.kind === "payment_schedule") {
    if (!paymentSchedule?.items.length) return null;

    return (
      <BlockSection
        blockClassName={blockClassName}
        kind={block.kind}
        titleClassName={titleClassName}
      >
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {paymentSchedule.items.map((item) => (
            <li className="flex flex-wrap justify-between gap-2" key={item.id}>
              <span>
                {item.label}
                {item.dueCondition ? ` · ${item.dueCondition}` : ""}
                {item.dueDate ? ` · due ${item.dueDate}` : ""}
              </span>
              <span>{formatQuoteMoney(item.amountCents, currency)}</span>
            </li>
          ))}
        </ul>
      </BlockSection>
    );
  }

  const items = asRecordArray(content.items);

  return (
    <BlockSection
      blockClassName={blockClassName}
      kind={block.kind}
      titleClassName={titleClassName}
    >
      {block.kind === "allowances" ? (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {items.map((item, index) => (
            <li
              className="flex flex-wrap justify-between gap-2"
              key={`${String(item.label)}-${index}`}
            >
              <span>
                {String(item.label)}
                {item.brand ? ` · ${String(item.brand)}` : ""}
              </span>
              <span>
                {formatQuoteMoney(Number(item.amountCents ?? 0), currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {block.kind === "acceptance_criteria" ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-muted-foreground">
          {items.map((item, index) => {
            const criterion = String(item.criterion ?? item.label ?? "");
            const reviewer = item.reviewer
              ? `reviewed by ${String(item.reviewer)}`
              : null;
            const responseDays =
              typeof item.responseDays === "number"
                ? `${item.responseDays} day${item.responseDays === 1 ? "" : "s"} to respond`
                : null;
            const detail = [reviewer, responseDays].filter(Boolean).join(" · ");

            return (
              <li key={`${criterion}-${index}`}>
                {criterion}
                {detail ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    ({detail})
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {block.kind === "client_responsibilities" ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${String(item.label)}-${index}`}>
              {String(item.label)}
              {item.due ? ` · ${String(item.due)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {block.kind === "deliverables" ||
      block.kind === "exclusions" ||
      block.kind === "assumptions" ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${String(item.label)}-${index}`}>
              {String(item.label)}
            </li>
          ))}
        </ul>
      ) : null}

      {block.kind === "revision_cap" ? (
        <div className="flex flex-col gap-1 text-sm leading-5 text-muted-foreground">
          <p>{Number(content.rounds ?? 0)} included revision rounds</p>
          {typeof content.overageCents === "number" ? (
            <p>
              Additional round:{" "}
              {formatQuoteMoney(content.overageCents, currency)}
            </p>
          ) : null}
          {typeof content.consolidationRule === "string" ? (
            <p>{content.consolidationRule}</p>
          ) : null}
          {typeof content.deemedApprovalDays === "number" &&
          content.deemedApprovalDays > 0 ? (
            <p>Approval response window: {content.deemedApprovalDays} days</p>
          ) : null}
        </div>
      ) : null}

      {block.kind === "usage_rights" ? (
        <>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {asRecordArray(content.matrix).map((right, index) => (
              <li key={`${String(right.media)}-${index}`}>
                {String(right.media)} · {String(right.term)} ·{" "}
                {String(right.territory)}
              </li>
            ))}
          </ul>
          {Array.isArray(content.carveouts) && content.carveouts.length ? (
            <p className="text-sm leading-5 text-muted-foreground">
              Exclusions: {(content.carveouts as string[]).join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </BlockSection>
  );
}

function BlockSection({
  kind,
  children,
  blockClassName,
  titleClassName,
}: {
  kind: QuoteScopeBlock["kind"];
  children: React.ReactNode;
  blockClassName?: string;
  titleClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", blockClassName)}>
      <h3 className={cn("text-sm font-semibold text-foreground", titleClassName)}>
        {scopeBlockTitles[kind]}
      </h3>
      {children}
    </section>
  );
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}
