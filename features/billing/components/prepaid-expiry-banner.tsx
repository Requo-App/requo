import Link from "next/link";
import { QrCode } from "lucide-react";

const dayMs = 24 * 60 * 60 * 1000;

const planLabels = {
  pro: "Pro",
  business: "Business",
} as const;

function getDaysLeft(expiresAt: Date) {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / dayMs));
}

function hasExpired(expiresAt: Date) {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Dashboard banner shown near or after the end of a prepaid QR Ph term.
 *
 * QR Ph has no automatic renewal, so this is the in-app reminder to pay again.
 * It renders above the page content next to the trial banner.
 */
export function PrepaidExpiryBanner({
  expiresAt,
  plan,
  billingHref,
}: {
  expiresAt: Date;
  plan: "pro" | "business";
  billingHref: string;
}) {
  const expired = hasExpired(expiresAt);
  const daysLeft = getDaysLeft(expiresAt);
  const daysLabel =
    daysLeft === 0
      ? "ends today"
      : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  return (
    <div className="sticky top-[3.5rem] z-30 flex w-full items-center justify-between gap-3 border-b border-warning/25 bg-warning/10 px-4 py-2 text-foreground sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <QrCode
          className="size-3.5 shrink-0 text-warning-ink"
          aria-hidden="true"
        />
        <p className="truncate text-xs font-medium sm:text-sm">
          {planLabels[plan]} prepaid term ·{" "}
          {expired ? "ended" : daysLabel}.{" "}
          <span className="font-normal text-muted-foreground">
            QR Ph doesn&apos;t renew automatically. Renew to keep access.
          </span>
        </p>
      </div>
      <Link
        className="shrink-0 text-xs font-semibold text-primary-ink underline underline-offset-4 hover:text-primary-ink/80 sm:text-sm"
        href={billingHref}
      >
        Renew
      </Link>
    </div>
  );
}
