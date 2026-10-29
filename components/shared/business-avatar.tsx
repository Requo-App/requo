import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

type BusinessAvatarProps = {
  name: string;
  logoUrl?: string | null;
  /** `xs` is the 20px sidebar-header avatar with 10px initials. */
  size?: "xs" | "sm" | "default" | "lg";
  className?: string;
  /** Set to "eager" for above-the-fold avatars (header). Default is "lazy". */
  loading?: "eager" | "lazy";
};

/**
 * BusinessAvatar — rounded-square avatar for businesses.
 * Shows the business logo when available, otherwise falls back to initials.
 */
export function BusinessAvatar({
  name,
  logoUrl,
  size = "default",
  className,
  loading = "lazy",
}: BusinessAvatarProps) {
  const isExtraSmall = size === "xs";

  return (
    <Avatar
      size={isExtraSmall ? "default" : size}
      className={cn(
        "rounded-lg",
        isExtraSmall && "size-5 rounded-md",
        className,
      )}
    >
      {logoUrl ? (
        <AvatarImage
          src={logoUrl}
          alt={`${name} logo`}
          className={cn("rounded-lg", isExtraSmall && "rounded-md")}
          loading={loading}
          decoding="async"
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "rounded-lg text-center text-xs font-semibold uppercase leading-none",
          isExtraSmall && "rounded-md text-[10px]",
        )}
      >
        {getBusinessInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function getBusinessInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}
