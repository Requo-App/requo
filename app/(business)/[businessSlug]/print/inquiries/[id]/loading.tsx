import { PrintPageShell } from "@/components/shared/print-page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function InquiryPrintLoading() {
  return (
    <PrintPageShell
      backHref="#"
      backLabel="Back to inquiry"
      description="Loading a print-friendly view of this inquiry."
      title="Inquiry"
    >
      <Skeleton className="mx-auto h-96 w-full max-w-[58rem]" />
    </PrintPageShell>
  );
}
