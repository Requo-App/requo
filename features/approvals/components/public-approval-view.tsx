import {
  PublicApprovalDecideForms,
  PublicChangeOrderDecideForms,
} from "@/features/approvals/components/public-approval-forms";

export function formatSubjectKind(kind: string) {
  return kind.replace(/_/g, " ");
}

const decidedStateMessages = {
  approved: "Thank you.",
  changes_requested: "Thank you.",
  expired: "Please ask the business for a new link.",
  superseded: "Please use the latest link.",
} as const;

function DecidedStateBanner({
  state,
  approverName,
}: {
  state: keyof typeof decidedStateMessages;
  approverName: string | null;
}) {
  let message: string = decidedStateMessages[state];

  if (state === "approved") {
    message = `Approved${approverName ? ` by ${approverName}` : ""}. ${message}`;
  } else if (state === "changes_requested") {
    message = `Feedback sent to the business. ${message}`;
  } else if (state === "expired") {
    message = `This request expired. ${message}`;
  } else if (state === "superseded") {
    message = `A newer version of this request exists. ${message}`;
  }

  return <p className="soft-panel text-sm text-foreground">{message}</p>;
}

export type ChangeOrderDelta = {
  targetKind: string;
  change: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** Presentational body for the public approval page. Data fetching stays in the route. */
export function PublicApprovalView({
  token,
  title,
  subjectKind,
  version,
  expiresAt,
  state,
  approverName,
  changeOrder,
  decided,
}: {
  token: string;
  title: string;
  subjectKind: string;
  version: number;
  expiresAt: Date | null;
  state: string;
  approverName: string | null;
  changeOrder: {
    displayNumber: string;
    reason: string;
    customerExplanation: string | null;
    deltas: ChangeOrderDelta[];
  } | null;
  decided: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="meta-label">
          Review request · {formatSubjectKind(subjectKind)}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Version {version} of this request.
          {expiresAt
            ? ` Respond by ${expiresAt.toLocaleDateString()}.`
            : ""}
        </p>
      </header>

      {state !== "pending" ? (
        <DecidedStateBanner
          state={state as keyof typeof decidedStateMessages}
          approverName={approverName}
        />
      ) : null}

      {changeOrder ? (
        <ChangeOrderDeltaView
          token={token}
          displayNumber={changeOrder.displayNumber}
          reason={changeOrder.reason}
          customerExplanation={changeOrder.customerExplanation}
          deltas={changeOrder.deltas}
          decided={decided}
        />
      ) : null}

      {!decided && !changeOrder ? (
        <PublicApprovalDecideForms token={token} />
      ) : null}

      <p className="text-xs text-muted-foreground">
        This link is personal to you — please don&apos;t forward it.
      </p>
    </main>
  );
}

function ChangeOrderDeltaView({
  token,
  displayNumber,
  reason,
  customerExplanation,
  deltas,
  decided,
}: {
  token: string;
  displayNumber: string;
  reason: string;
  customerExplanation: string | null;
  deltas: ChangeOrderDelta[];
  decided: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="soft-panel flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Change {displayNumber}
        </h2>
        <p className="text-sm text-muted-foreground">{reason}</p>
        {customerExplanation ? (
          <p className="text-sm text-foreground">{customerExplanation}</p>
        ) : null}
      </section>

      <section className="soft-panel flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">What changed</h3>
        <ul className="flex flex-col gap-2">
          {deltas.map((delta, index) => (
            <li key={index} className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {delta.targetKind.replace("_", " ")} · {delta.change}
              </span>
              <DeltaPreview before={delta.before} after={delta.after} />
            </li>
          ))}
        </ul>
      </section>

      {!decided ? <PublicChangeOrderDecideForms token={token} /> : null}
    </div>
  );
}

function DeltaPreview({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const summarize = (value: Record<string, unknown> | null) => {
    if (!value) return "—";
    const description = value["description"] ?? value["label"] ?? value["kind"];
    const quantity = value["quantity"] ?? value["position"];
    return (
      [description, quantity]
        .filter((part) => part !== undefined && part !== null)
        .join(" · ")
        .slice(0, 160) || "—"
    );
  };

  return (
    <span className="block text-xs">
      {String(summarize(before))} → {String(summarize(after))}
    </span>
  );
}
