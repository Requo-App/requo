import { NextResponse } from "next/server";

import {
  formatPrice,
  getPlanPrice,
  getPlanPriceLabel,
} from "@/lib/billing/plans";
import { billingCurrencies } from "@/lib/billing/currencies";
import type { PaidPlan } from "@/lib/billing/types";
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
 * for all fixed local prices, `lib/plans/catalog` for allowances and
 * highlights) so this file cannot drift from the pricing page.
 */
function buildPricingMarkdown(): string {
  const currencyRows = billingCurrencies
    .map((currency) => {
      const price = (plan: PaidPlan, interval: "monthly" | "yearly") =>
        formatPrice(getPlanPrice(plan, currency, interval), currency);

      return `| ${currency} | ${price("pro", "monthly")} | ${price(
        "pro",
        "yearly",
      )} | ${price("business", "monthly")} | ${price(
        "business",
        "yearly",
      )} |`;
    })
    .join("\n");

  const lines: string[] = [
    "# Requo Pricing",
    "",
    "Quote software for service businesses. Subscriptions are billed per business in the fixed local currency shown at checkout. USD is the default for countries without a local price.",
    "",
    `${proTrialSummary}. When the trial ends, the business returns to Free and its data stays available.`,
    "",
    "## Currencies and prices",
    "",
    "| Currency | Pro monthly | Pro yearly | Business monthly | Business yearly |",
    "| --- | ---: | ---: | ---: | ---: |",
    currencyRows,
    "",
    "Annual billing is always 10× the monthly price (two months free). Prices are fixed per currency, not converted from USD at checkout.",
    "",
    "Taxes are calculated by Polar at checkout based on the billing country. Polar's default tax behavior is tax-exclusive in the United States, Canada, and India, and tax-inclusive elsewhere. The checkout total is the final amount charged.",
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
      lines.push("- Price: 0 in every supported currency");
    } else {
      lines.push(
        `- Monthly: ${getPlanPriceLabel(plan, "USD", "monthly")} in USD (see the currency table above for local prices)`,
        `- Yearly: ${getPlanPriceLabel(plan, "USD", "yearly")} in USD (${annualBillingPromoCopy.toLowerCase()})`,
      );
    }
    for (const highlight of entry.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push("");
  }

  lines.push(
    "Local pricing is available in the United Kingdom, Canada, Australia, the eurozone, New Zealand, Singapore, the United Arab Emirates, the Philippines, India, and South Africa.",
    "See https://requo.app/pricing for the full comparison table.",
  );

  return `${lines.join("\n")}\n`;
}

export function GET() {
  return new NextResponse(buildPricingMarkdown(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
