import Link from "next/link";
import { Sparkles } from "lucide-react";

const dayMs = 24 * 60 * 60 * 1000;

function getDaysLeft(trialEndsAt: Date) {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / dayMs));
}

/**
 * Dashboard banner shown while the business is inside its Pro trial.
 * Renders above the page content, next to the archived-business banner slot.
 */
export function TrialBanner({
  trialEndsAt,
  billingHref,
}: {
  trialEndsAt: Date;
  billingHref: string;
}) {
  const daysLeft = getDaysLeft(trialEndsAt);
  const daysLabel =
    daysLeft === 0
      ? "ends today"
      : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  return (
    <div className="sticky top-[3.5rem] z-30 flex w-full items-center justify-between gap-3 border-b border-primary/25 bg-primary/8 px-4 py-2 text-foreground sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
        <p className="truncate text-xs font-medium sm:text-sm">
          Pro trial · {daysLabel}.{" "}
          <span className="font-normal text-muted-foreground">
            Choose a plan to keep Pro features.
          </span>
        </p>
      </div>
      <Link
        className="shrink-0 text-xs font-semibold text-primary-ink underline underline-offset-4 hover:text-primary-ink/80 sm:text-sm"
        href={billingHref}
      >
        View plans
      </Link>
    </div>
  );
}
