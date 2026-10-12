import { ReactNode } from "react";

import { BrandMark } from "@/components/shared/brand-mark";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthShellProps = {
  badge?: string;
  title: string;
  description?: string;
  children: ReactNode;
  layout?: "split" | "centered" | "signup";
};

export function AuthShell({
  badge,
  title,
  description,
  children,
  layout = "split",
}: AuthShellProps) {
  if (layout === "centered") {
    return (
      <div className="auth-page">
        <div className="mx-auto w-full max-w-[30rem]">
          <AuthFormCard badge={badge} title={title} description={description}>
            {children}
          </AuthFormCard>
        </div>
      </div>
    );
  }

  if (layout === "signup") {
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="flex w-full max-w-[24rem] flex-col gap-10">
          {/* Brand */}
          <div className="flex flex-col items-center gap-6">
            <BrandMark subtitle={null} />
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                {title}
              </h1>
              {description ? (
                <p className="text-sm leading-snug text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {/* Form */}
          <div>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-shell-grid">
        <div className="auth-story-panel">
          <div className="flex items-center gap-4">
            <BrandMark subtitle={null} />
          </div>

          <div className="flex max-w-2xl flex-col gap-5">
            <span className="eyebrow">Owner-led service workflow</span>
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-5xl font-semibold leading-[0.96] tracking-tight text-balance">
                Capture inquiries, qualify leads, and send quotes from one place.
              </h1>
              <p className="max-w-xl text-base leading-snug sm:leading-7 text-muted-foreground">
                Requo keeps inbound inquiries, pricing, and follow-up organized
                for owner-led service businesses and lean teams.
              </p>
            </div>
          </div>

          <div data-padding="none" className="soft-panel grid gap-3 p-5">
            {[
              "Collect scope, timing, budget, and files without extra back-and-forth.",
              "Qualify the lead before pricing and keep notes attached to the inquiry.",
              "Send professional quotes and keep the customer response in the same flow.",
            ].map((item) => (
              <div className="flex items-start gap-3" key={item}>
                <div className="mt-0.5 rounded-md bg-accent px-2 py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-accent-foreground">
                  Ready
                </div>
                <p className="text-sm leading-5 text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-form-shell">
          <AuthFormCard badge={badge} title={title} description={description}>
            {children}
          </AuthFormCard>
        </div>
      </div>
    </div>
  );
}

function AuthFormCard({
  badge,
  title,
  description,
  children,
}: Pick<AuthShellProps, "badge" | "title" | "description" | "children">) {
  return (
    <Card className="auth-form-card gap-0">
      <CardHeader className="gap-4 border-b border-border/70 bg-background/34 pb-6">
        <BrandMark subtitle={null} />
        <div className="flex flex-col gap-2.5">
          {badge ? <span className="eyebrow">{badge}</span> : null}
          <CardTitle className="text-[1.95rem] sm:text-[2.35rem]">{title}</CardTitle>
          {description ? (
            <CardDescription className="max-w-md text-sm leading-snug sm:leading-6">
              {description}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-6 sm:pt-7">{children}</CardContent>
    </Card>
  );
}

