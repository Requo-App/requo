import Image from "next/image";

import { BrandWordmark } from "@/components/shared/brand-wordmark";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type BrandLoadingScreenProps = React.ComponentProps<"div">;

/**
 * The Requo entry screen. Used for the full-page overlay on a fresh document
 * navigation and as the first-entry fallback while a business route resolves.
 */
export function BrandLoadingScreen({
  className,
  ...props
}: BrandLoadingScreenProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-background px-6",
        className,
      )}
      {...props}
    >
      <BrandLoadingMark />
    </div>
  );
}

export function BrandLoadingMark() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex items-center gap-4">
        <Image
          src="/logo.svg"
          alt="Requo"
          width={64}
          height={64}
          className="size-16 object-contain"
        />
        <BrandWordmark size="hero" />
      </div>
      <Spinner className="size-5 text-primary-ink" />
    </div>
  );
}
