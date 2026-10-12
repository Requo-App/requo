import { PrintPageShell } from "@/components/shared/print-page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function QuotePrintLoading() {
  return (
    <PrintPageShell
      backHref="#"
      backLabel="Back to quote"
      description="Loading a print-friendly view of this quote."
      title="Quote"
    >
      <Skeleton className="mx-auto h-96 w-full max-w-[58rem]" />
    </PrintPageShell>
  );
}
