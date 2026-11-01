import { Spinner } from "@/components/ui/spinner";

/**
 * Brief loading shell for the PayMongo QR Ph return page. The page activates
 * the paid intent and redirects, so users see this only for the RTT to our
 * origin before landing back in the dashboard.
 */
export default function PaymongoReturnLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
