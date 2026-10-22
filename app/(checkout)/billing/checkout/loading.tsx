import { Spinner } from "@/components/ui/spinner";

/**
 * Brief loading shell for the post-checkout return page. The page
 * itself does a server-side redirect, so users see this only for the
 * RTT to our origin before being bounced back to where they upgraded
 * from.
 */
export default function CheckoutLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
