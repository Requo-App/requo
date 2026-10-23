import { NextResponse } from "next/server";

import { getPlanPriceLabel } from "@/lib/billing/plans";
import {
  annualBillingPromoCopy,
  planCatalog,
  proTrialSummary,
} from "@/lib/plans/catalog";
import { planTiers } from "@/lib/plans/plans";

/**
 * Machine-readable pricing mirror for agents (`/pricing.md`).
 *
 * Prices and plan facts come from the canonical catalogs (`lib/billing/plans`
 * for USD amounts, `lib/plans/catalog` for allowances and highlights) so this
 * file cannot drift from the pricing page. Schema visibility uses USD because
 * Polar bills in USD.
 */
function buildPricingMarkdown(): string {
  const lines: string[] = [
    "# Requo Pricing",
    "",
    "Quote software for service businesses. Subscriptions are billed per business in USD through Polar.",
    "",
    `${proTrialSummary}. When the trial ends, the business returns to Free and its data stays available.`,
    "",
    "## Plans",
    "",
  ];

  for (const plan of planTiers) {
    const entry = planCatalog[plan];
    lines.push(`### ${entry.label} — ${entry.audience}`);
    lines.push("");
    lines.push(entry.description);
    lines.push("");
    if (plan === "free") {
      lines.push("- Price: $0");
    } else {
      lines.push(
        `- Monthly: ${getPlanPriceLabel(plan, "USD", "monthly")}`,
        `- Yearly: ${getPlanPriceLabel(plan, "USD", "yearly")} (${annualBillingPromoCopy.toLowerCase()})`,
      );
    }
    for (const highlight of entry.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push("");
  }

  lines.push(
    "Annual billing includes two months free.",
    "See https://requo.app/pricing for the full comparison table.",
  );

  return `${lines.join("\n")}\n`;
}

export function GET() {
  return new NextResponse(buildPricingMarkdown(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
