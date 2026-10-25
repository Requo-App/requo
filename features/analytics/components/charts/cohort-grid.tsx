import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/features/analytics/format";
import type { AnalyticsCohortRow } from "@/features/analytics/types";

/**
 * Monthly inquiry cohorts with a token alpha heat scale on the conversion
 * cell. Server-rendered: no chart library for a table, and the heat tint is
 * a background layer so the number keeps full text contrast.
 */
export function CohortGrid({ cohorts }: { cohorts: AnalyticsCohortRow[] }) {
  if (cohorts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Cohorts appear once inquiries start arriving.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Inquiries</TableHead>
          <TableHead className="text-right">Quoted</TableHead>
          <TableHead className="text-right">Won</TableHead>
          <TableHead className="text-right">Conversion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cohorts.map((cohort) => (
          <TableRow key={cohort.monthKey}>
            <TableCell className="font-medium text-foreground">{cohort.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {cohort.size.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cohort.quoted.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cohort.won.toLocaleString()}
            </TableCell>
            <TableCell className="text-right">
              <span className="relative inline-flex min-w-14 items-center justify-end">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-md"
                  style={{
                    backgroundColor: "var(--chart-1)",
                    opacity: 0.08 + Math.min(cohort.conversionRate, 1) * 0.35,
                  }}
                />
                <span className="relative font-medium tabular-nums text-foreground">
                  {cohort.size > 0 ? formatPercent(cohort.conversionRate) : "—"}
                </span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
