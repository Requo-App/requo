import type { Metadata } from "next";

import { ErrorState } from "@/components/shared/error-state";

export const metadata: Metadata = {
  title: { absolute: "Page not found · Requo" },
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <ErrorState layout="page" variant="not-found" />;
}
