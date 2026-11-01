import { BrandLoadingScreen } from "@/components/shared/brand-loading-screen";

/**
 * First entry into a business dashboard.
 *
 * The shell chrome depends on the resolved business context, so show the
 * Requo loading screen while it streams instead of mocking the dashboard.
 * In-app navigation keeps the instant shell and per-page skeletons.
 */
export default function BusinessSlugLoading() {
  return <BrandLoadingScreen />;
}
