import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function MadeWithRequo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center justify-center gap-2.5 rounded-full border border-border/70 bg-card/90 px-4 py-2 shadow-sm backdrop-blur-md transition-shadow hover:bg-card/100 hover:shadow-md",
        className,
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        <Image
          src="/logo.svg"
          alt="Requo Logo"
          width={24}
          height={24}
          className="size-5 opacity-90"
        />
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">
        Made with Requo
      </span>
    </Link>
  );
}
