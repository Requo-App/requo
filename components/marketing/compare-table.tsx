import { InViewReveal } from "@/components/marketing/in-view-reveal";

export type CompareRow = {
  label: string;
  left: string;
  right: string;
};

export function CompareTable({
  leftHeader,
  rightHeader,
  rows,
}: {
  leftHeader: string;
  rightHeader: string;
  rows: readonly CompareRow[];
}) {
  return (
    <InViewReveal>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="w-[34%] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-8">
                Capability
              </th>
              <th className="w-[33%] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {leftHeader}
              </th>
              <th className="w-[33%] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-foreground">
                {rightHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-b border-border last:border-b-0"
                key={row.label}
              >
                <td className="px-5 py-3.5 font-medium text-foreground sm:px-8">
                  {row.label}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  {row.left}
                </td>
                <td className="px-4 py-3.5 text-foreground">{row.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InViewReveal>
  );
}
