import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { cn } from "@/lib/utils";

function getPlainTextNode(value: ReactNode) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const textParts = value.map((item) =>
      typeof item === "string" || typeof item === "number" ? String(item) : null,
    );

    if (textParts.every((item) => item !== null)) {
      return textParts.join("");
    }
  }

  return null;
}

type DashboardPageProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardPage({
  children,
  className,
}: DashboardPageProps) {
  return <div className={cn("dashboard-page", className)}>{children}</div>;
}

type DashboardStatsGridProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardStatsGrid({
  children,
  className,
}: DashboardStatsGridProps) {
  return <div className={cn("dashboard-stats", className)}>{children}</div>;
}

type DashboardDetailLayoutProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardDetailLayout({
  children,
  className,
}: DashboardDetailLayoutProps) {
  return <div className={cn("dashboard-detail-layout", className)}>{children}</div>;
}

type DashboardDetailHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  actionsClassName?: string;
};

export function DashboardDetailHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
  actionsClassName,
}: DashboardDetailHeaderProps) {
  const plainTitle = getPlainTextNode(title);
  const plainDescription = description ? getPlainTextNode(description) : null;

  return (
    <div className={cn("dashboard-detail-header", className)}>
      <div className="dashboard-detail-header-copy">
        <div className="flex flex-col gap-2">
          {eyebrow ? <span className="meta-label">{eyebrow}</span> : null}
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-xl font-semibold leading-tight tracking-tight text-balance sm:text-2xl">
              {plainTitle ? (
                <TruncatedTextWithTooltip text={plainTitle} lines={2} />
              ) : (
                title
              )}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
                {plainDescription ? (
                  <TruncatedTextWithTooltip text={plainDescription} lines={2} />
                ) : (
                  description
                )}
              </p>
            ) : null}
          </div>
        </div>

        {meta ? <div className="dashboard-detail-header-meta">{meta}</div> : null}
      </div>

      {actions ? (
        <DashboardActionsRow
          className={cn("dashboard-detail-header-actions", actionsClassName)}
        >
          {actions}
        </DashboardActionsRow>
      ) : null}
    </div>
  );
}

type DashboardSidebarStackProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardSidebarStack({
  children,
  className,
}: DashboardSidebarStackProps) {
  return <div className={cn("dashboard-side-stack", className)}>{children}</div>;
}

type DashboardActionsRowProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardActionsRow({
  children,
  className,
}: DashboardActionsRowProps) {
  return <div className={cn("dashboard-actions", className)}>{children}</div>;
}

type DashboardMetaPillProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardMetaPill({
  children,
  className,
}: DashboardMetaPillProps) {
  const plainChildren = getPlainTextNode(children);

  return (
    <span className={cn("dashboard-meta-pill min-w-0", className)}>
      {plainChildren ? (
        <TruncatedTextWithTooltip text={plainChildren} />
      ) : (
        children
      )}
    </span>
  );
}

type DashboardSectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
};

export function DashboardSection({
  title,
  description,
  action,
  children,
  footer,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: DashboardSectionProps) {
  const hasHeader = Boolean(title || description || action);

  return (
    <Card className={cn("gap-0", className)}>
      {hasHeader ? (
        <CardHeader className={cn("gap-2 pb-4", headerClassName)}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {description ? (
                <CardDescription className={cn(title ? "mt-1.5" : null)}>
                  {description}
                </CardDescription>
              ) : null}
            </div>
            {action ? (
              <DashboardActionsRow className="shrink-0 sm:justify-end">
                {action}
              </DashboardActionsRow>
            ) : null}
          </div>
        </CardHeader>
      ) : null}

      <CardContent
        className={cn(
          "dashboard-section-body",
          hasHeader ? "pt-0" : "pt-5",
          contentClassName,
        )}
      >
        {children}
      </CardContent>

      {footer ? (
        <CardFooter
          className={cn(
            "dashboard-actions w-full justify-start [&>*]:w-full sm:[&>*]:w-auto sm:justify-end",
            footerClassName,
          )}
        >
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

type DashboardTableContainerProps = {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
};

export function DashboardTableContainer({
  children,
  className,
  innerClassName,
}: DashboardTableContainerProps) {
  return (
    <div className={cn("dashboard-table-shell", className)} data-table-container>
      <div className={cn("dashboard-table-shell-inner", innerClassName)}>
        {children}
      </div>
    </div>
  );
}

type DashboardDetailFeedProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardDetailFeed({
  children,
  className,
}: DashboardDetailFeedProps) {
  return <div className={cn("dashboard-detail-feed", className)}>{children}</div>;
}

type DashboardDetailFeedItemProps = {
  avatar?: ReactNode;
  title?: ReactNode;
  titleLines?: 1 | 2 | 3 | 4 | 5 | 6 | "none";
  meta?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  metaClassName?: string;
  bodyClassName?: string;
};

export function DashboardDetailFeedItem({
  avatar,
  title,
  titleLines = 1,
  meta,
  action,
  children,
  className,
  titleClassName,
  metaClassName,
  bodyClassName,
}: DashboardDetailFeedItemProps) {
  const hasHeading = Boolean(avatar || title || meta || action);
  const plainTitle = title ? getPlainTextNode(title) : null;

  return (
    <div className={cn("dashboard-detail-feed-item", className)}>
      {hasHeading ? (
        <div className="dashboard-detail-feed-heading">
          {avatar ? <div className="shrink-0">{avatar}</div> : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <div className={cn("text-sm font-semibold text-foreground", titleClassName)}>
                {plainTitle && titleLines !== "none" ? (
                  <TruncatedTextWithTooltip lines={titleLines} text={plainTitle} />
                ) : (
                  title
                )}
              </div>
            ) : null}
            {meta ? (
              <div className={cn("dashboard-detail-feed-meta", metaClassName)}>
                {meta}
              </div>
            ) : null}
          </div>
          {action ? (
            <DashboardActionsRow className="shrink-0 sm:justify-end">
              {action}
            </DashboardActionsRow>
          ) : null}
        </div>
      ) : null}

      {children ? (
        <div className={cn("dashboard-detail-feed-body", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

type DashboardEmptyStateProps = {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  variant?: "page" | "section" | "flat" | "list";
};

const emptyStateVariantClassNames = {
  page: "",
  section: "border",
  flat: "rounded-none border-0 bg-transparent px-6 py-10",
  list: "data-list-empty-state",
} as const;

export function DashboardEmptyState({
  title,
  description,
  action,
  icon: Icon,
  className,
  variant = "page",
}: DashboardEmptyStateProps) {
  return (
    <Empty
      className={cn(emptyStateVariantClassNames[variant], className)}
    >
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
