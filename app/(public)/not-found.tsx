import { ErrorState } from "@/components/shared/error-state";

/**
 * Dead or disabled public links (quotes, inquiries, approvals, agent chat).
 *
 * One generic message covers unknown and disabled links on purpose: it must not
 * reveal whether a link ever existed. `audience="public"` removes every app
 * action — the person reading this is the business's customer, not a Requo user
 * — and leaves only the quiet "Powered by Requo" footer.
 */
export default function PublicNotFound() {
  return <ErrorState audience="public" layout="page" variant="public-link" />;
}
