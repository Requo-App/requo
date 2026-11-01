import { ErrorState } from "@/components/shared/error-state";
import { homePath, getBusinessHomePath } from "@/features/businesses/routes";
import { getCurrentBusinessRequestContext } from "@/lib/db/business-access";

export default async function DashboardNotFound() {
  const requestContext = await getCurrentBusinessRequestContext();
  const businessSlug = requestContext?.businessContext.business.slug;
  const overviewHref = businessSlug
    ? getBusinessHomePath(businessSlug)
    : homePath;

  return (
    <ErrorState
      homeHref={overviewHref}
      homeLabel="Go to dashboard"
      layout="inline"
      variant="not-found"
    />
  );
}
