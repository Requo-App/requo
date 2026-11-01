import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { getPublicBusinessProfileBySlug } from "@/features/businesses/queries";
import { getBusinessHomePath } from "@/features/businesses/routes";

type BusinessSlugIndexPageProps = {
  params: Promise<{ businessSlug: string }>;
};

export const instant = true;

/**
 * Businesses hub index page — non-blocking structural shell.
 *
 * Returns an empty shell synchronously and performs the redirect
 * inside a Suspense-wrapped child server component.
 */
export default function BusinessSlugIndexPage({
  params,
}: BusinessSlugIndexPageProps) {
  return (
    <Suspense fallback={null}>
      <BusinessSlugIndexRedirect params={params} />
    </Suspense>
  );
}

async function BusinessSlugIndexRedirect({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;

  if (!(await getPublicBusinessProfileBySlug(businessSlug))) {
    notFound();
  }

  redirect(getBusinessHomePath(businessSlug));

  // redirect() throws and never reaches here; explicit return satisfies the
  // ReactNode return type requirement for async server components.
  return null;
}
