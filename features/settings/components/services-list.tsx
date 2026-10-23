"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "@/components/shared/notify";
import {
  ArchiveRestore,
  ArrowUpRight,
  Download,
  FileArchive,
  Link2,
  MoreHorizontal,
  PencilLine,
  PencilRuler,
  Plus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { MobileHeaderSlot, mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { DashboardActionsRow, DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  ResponsiveOverlayTrigger,
} from "@/components/ui/responsive-overlay";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ServiceDangerActionState,
  ServicesActionState,
  ServicesSettingsView,
} from "@/features/settings/types";
import { getBusinessServicePath } from "@/features/businesses/routes";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { hasFeatureAccess } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import type { PlanTier as plan } from "@/lib/plans/plans";
import { FeatureGate } from "@/features/entitlements";
import { useBusinessCheckout } from "@/features/billing/components/business-checkout-provider";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";

type ServicesListProps = {
  settings: ServicesSettingsView;
  createAction: (
    state: ServicesActionState,
    formData: FormData,
  ) => Promise<ServicesActionState>;
  unarchiveAction: (
    state: ServiceDangerActionState,
    formData: FormData,
  ) => Promise<ServiceDangerActionState>;
  plan: plan;
};

const initialState: ServicesActionState = {};

type ServiceStatusFilter = "all" | "active" | "inactive";
type ServiceSort = "name" | "newest" | "most-inquiries";

const statusFilterOptions = [
  { label: "All statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const sortOptions = [
  { label: "Name A–Z", value: "name" },
  { label: "Newest first", value: "newest" },
  { label: "Most inquiries", value: "most-inquiries" },
];

export function ServicesList({
  settings,
  createAction,
  unarchiveAction,
  plan,
}: ServicesListProps) {
  const businessCheckout = useBusinessCheckout();
  const [createState, createServiceFormAction, isCreatePending] =
    useActionStateWithSonner(createAction, initialState);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>("all");
  const [sort, setSort] = useState<ServiceSort>("name");
  const [, unarchiveServiceFormAction, isUnarchivePending] =
    useActionStateWithSonner(unarchiveAction, initialState);
  const effectivePlan = businessCheckout
    ? businessCheckout.currentPlan
    : plan;
  const nameError = createState.fieldErrors?.name?.[0];
  const activeServices = useMemo(
    () => settings.services.filter((service) => !service.archivedAt),
    [settings.services],
  );
  const archivedServices = settings.services.filter((service) => service.archivedAt);
  const liveServiceCount = activeServices.reduce(
    (count, service) => (service.publicInquiryEnabled ? count + 1 : count),
    0,
  );
  const liveServiceLimit = getUsageLimit(effectivePlan, "liveServicesPerBusiness");
  const atServiceLimit =
    liveServiceLimit !== null && liveServiceCount >= liveServiceLimit;
  const canCreateAdditionalServices =
    hasFeatureAccess(effectivePlan, "multipleServices") && !atServiceLimit;
  const serviceCountLabel =
    liveServiceLimit === null
      ? `${liveServiceCount} ${liveServiceCount === 1 ? "live service" : "live services"}`
      : `${liveServiceCount} of ${liveServiceLimit} live services`;

  const filteredServices = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const matches =
      statusFilter === "all"
        ? activeServices
        : activeServices.filter((service) =>
            statusFilter === "active"
              ? service.publicInquiryEnabled
              : !service.publicInquiryEnabled,
          );
    const searched = trimmedQuery
      ? matches.filter((service) =>
          `${service.name} ${service.slug}`.toLowerCase().includes(trimmedQuery),
        )
      : matches;
    return [...searched].sort((a, b) => {
      switch (sort) {
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "most-inquiries":
          return b.submittedInquiryCount - a.submittedInquiryCount;
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [activeServices, query, statusFilter, sort]);

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setSort("name");
  }

  const canClear =
    query.trim() !== "" || statusFilter !== "all" || sort !== "name";
  const resultLabel = `${filteredServices.length} of ${activeServices.length} ${activeServices.length === 1 ? "service" : "services"}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Actions row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {archivedServices.length > 0 ? (
            <ResponsiveOverlay
              open={isArchiveDialogOpen}
              onOpenChange={setIsArchiveDialogOpen}
            >
              <ResponsiveOverlayTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileArchive data-icon="inline-start" />
                  Archived ({archivedServices.length})
                </Button>
              </ResponsiveOverlayTrigger>
              <ResponsiveOverlayContent className="sm:max-w-xl">
                <ResponsiveOverlayHeader>
                  <ResponsiveOverlayTitle>
                    Archived services
                  </ResponsiveOverlayTitle>
                  <ResponsiveOverlayDescription>
                    These services are disabled and no longer accept new
                    submissions.
                  </ResponsiveOverlayDescription>
                </ResponsiveOverlayHeader>
                <ResponsiveOverlayBody className="gap-4">
                  {archivedServices.map((service) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/75 px-4 py-3"
                      key={service.id}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {service.name}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {service.slug}
                        </p>
                      </div>
                      <form action={unarchiveServiceFormAction}>
                        <input
                          type="hidden"
                          name="targetServiceId"
                          value={service.id}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUnarchivePending}
                        >
                          <ArchiveRestore
                            data-icon="inline-start"
                            className="size-3.5"
                          />
                          Unarchive
                        </Button>
                      </form>
                    </div>
                  ))}
                </ResponsiveOverlayBody>
              </ResponsiveOverlayContent>
            </ResponsiveOverlay>
          ) : null}
          {activeServices.length > 0 || liveServiceLimit !== null ? (
            <p className="truncate text-xs text-muted-foreground">
              {serviceCountLabel}
            </p>
          ) : null}
        </div>

        {canCreateAdditionalServices ? (
          <MobileHeaderSlot>
          <ResponsiveOverlay
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <ResponsiveOverlayTrigger asChild>
              <Button
                aria-label="Create service"
                title="Create service"
                size="sm"
                className={mobileNavbarIconButtonClassName}
              >
                <Plus data-icon="inline-start" />
                <span className="hidden lg:inline">Create</span>
              </Button>
            </ResponsiveOverlayTrigger>
            <ResponsiveOverlayContent className="sm:max-w-md">
              <ResponsiveOverlayHeader>
                <ResponsiveOverlayTitle>Create service</ResponsiveOverlayTitle>
                <ResponsiveOverlayDescription>
                  Add a new service and its public page for this business.
                </ResponsiveOverlayDescription>
              </ResponsiveOverlayHeader>

              <form action={createServiceFormAction}>
                <ResponsiveOverlayBody>
                  <FieldGroup>
                    <Field data-invalid={Boolean(nameError) || undefined}>
                      <FieldLabel htmlFor="service-create-name">
                        Service name
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          aria-invalid={Boolean(nameError) || undefined}
                          autoComplete="off"
                          disabled={isCreatePending}
                          id="service-create-name"
                          maxLength={80}
                          minLength={2}
                          name="name"
                          placeholder="Wholesale request"
                          required
                        />
                        <FieldError
                          errors={
                            nameError ? [{ message: nameError }] : undefined
                          }
                        />
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </ResponsiveOverlayBody>

                <ResponsiveOverlayFooter>
                  <Button
                    onClick={() => setIsCreateDialogOpen(false)}
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button disabled={isCreatePending} type="submit">
                    {isCreatePending ? (
                      <>
                        <Spinner
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus data-icon="inline-start" />
                        Create
                      </>
                    )}
                  </Button>
                </ResponsiveOverlayFooter>
              </form>
            </ResponsiveOverlayContent>
          </ResponsiveOverlay>
          </MobileHeaderSlot>
        ) : atServiceLimit && businessCheckout ? (
          <MobileHeaderSlot>
            <UpgradeButton
              className={mobileNavbarIconButtonClassName}
              currentPlan={effectivePlan}
              size="sm"
              targetPlan={effectivePlan === "free" ? "pro" : "business"}
              variant="outline"
              userId={businessCheckout.userId}
              businessId={businessCheckout.businessId}
              businessSlug={businessCheckout.businessSlug}
            >
              <Plus data-icon="inline-start" />
              <span className="hidden lg:inline">More services</span>
              <span className="sr-only lg:hidden">
                Upgrade for more live services
              </span>
            </UpgradeButton>
          </MobileHeaderSlot>
        ) : (
          <MobileHeaderSlot>
          <FeatureGate
            variant="action"
            feature="multipleServices"
            plan={effectivePlan}
            description="Create additional services for different offerings or audiences."
          >
            <Button
              aria-label="Create service"
              title="Create service"
              size="sm"
              className={mobileNavbarIconButtonClassName}
              disabled
            >
              <Plus data-icon="inline-start" />
              <span className="hidden lg:inline">Create</span>
            </Button>
          </FeatureGate>
          </MobileHeaderSlot>
        )}
      </div>

      {/* Results */}
      {activeServices.length === 0 ? (
        <DashboardEmptyState
          description="Create a service to publish a page for incoming inquiries."
          icon={PencilRuler}
          title="No active services"
          variant="section"
          action={
            <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
              <Plus data-icon="inline-start" />
              Create
            </Button>
          }
        />
      ) : (
        <div className="dashboard-table-shell" data-list-card>
          <div className="data-list-toolbar-strip">
            <div className="data-list-toolbar-grid">
              <Field className="min-w-0 flex-1">
                <FieldLabel className="sr-only" htmlFor="service-search">
                  Search services
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="service-search"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder="Search name or slug"
                    aria-label="Search services"
                    autoComplete="off"
                  />
                </FieldContent>
              </Field>
              <Field className="min-w-0 sm:max-w-44">
                <FieldLabel className="sr-only" htmlFor="service-status-filter">
                  Filter services by status
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    id="service-status-filter"
                    value={statusFilter}
                    onValueChange={(value) =>
                      setStatusFilter(value as ServiceStatusFilter)
                    }
                    options={statusFilterOptions}
                    placeholder="All statuses"
                    searchPlaceholder="Search statuses"
                  />
                </FieldContent>
              </Field>
              <Field className="min-w-0 sm:max-w-44">
                <FieldLabel className="sr-only" htmlFor="service-sort">
                  Sort services
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    id="service-sort"
                    value={sort}
                    onValueChange={(value) =>
                      setSort(value as ServiceSort)
                    }
                    options={sortOptions}
                    placeholder="Sort by"
                    searchPlaceholder="Search sorting"
                  />
                </FieldContent>
              </Field>
              <DashboardActionsRow className="data-list-toolbar-actions">
                <Button
                  aria-label="Clear filters"
                  className="size-9 shrink-0 px-0 sm:hidden"
                  disabled={!canClear}
                  onClick={clearFilters}
                  size="icon"
                  title="Clear filters"
                  type="button"
                  variant="ghost"
                >
                  <X />
                </Button>
                <Button
                  className="hidden shrink-0 sm:inline-flex"
                  size="sm"
                  disabled={!canClear}
                  onClick={clearFilters}
                  type="button"
                  variant="ghost"
                >
                  <X data-icon="inline-start" />
                  Clear
                </Button>
              </DashboardActionsRow>
            </div>

            <p className="data-list-toolbar-count">{resultLabel}</p>
          </div>

          {filteredServices.length > 0 ? (
            <>
              {/* Mobile list */}
              <div className="flex flex-col gap-2 p-3 sm:hidden">
                {filteredServices.map((service) => (
                  <Link
                    key={service.id}
                    href={getBusinessServicePath(
                      settings.slug,
                      service.slug,
                    )}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-background px-4 py-3.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
                      <PencilRuler className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{service.name}</p>
                        {service.isDefault ? (
                          <Badge
                            variant="secondary"
                            className="px-1.5 py-0 font-normal text-muted-foreground"
                          >
                            Default
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {service.submittedInquiryCount}{" "}
                        {service.submittedInquiryCount === 1
                          ? "inquiry"
                          : "inquiries"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge
                        tone={service.publicInquiryEnabled ? "success" : "neutral"}
                        label={service.publicInquiryEnabled ? "Active" : "Inactive"}
                      />
                    </div>
                  </Link>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto no-scrollbar sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Inquiries</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.map((service) => (
                      <TableRow key={service.id}>
                        <TableCell>
                          <Link
                            href={getBusinessServicePath(
                              settings.slug,
                              service.slug,
                            )}
                            className="group flex items-center gap-3 py-0.5"
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground transition-colors group-hover:border-border group-hover:text-foreground">
                              <PencilRuler className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium group-hover:underline">
                                  {service.name}
                                </span>
                                {service.isDefault ? (
                                  <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 font-normal text-muted-foreground"
                                  >
                                    Default
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={service.publicInquiryEnabled ? "success" : "neutral"}
                            label={service.publicInquiryEnabled ? "Active" : "Inactive"}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {service.submittedInquiryCount}
                        </TableCell>
                        <TableCell>
                          <ServiceRowActions
                            settingsSlug={settings.slug}
                            businessName={settings.name}
                            service={service}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="p-4">
              <DashboardEmptyState
                description="Try another search or clear the filters."
                icon={PencilRuler}
                title="No services match"
                variant="list"
                action={
                  <Button
                    disabled={!canClear}
                    onClick={clearFilters}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <X data-icon="inline-start" />
                    Clear filters
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ServiceRowActionsProps = {
  settingsSlug: string;
  businessName: string;
  service: ServicesListProps["settings"]["services"][number];
};

function ServiceRowActions({
  settingsSlug,
  businessName,
  service,
}: ServiceRowActionsProps) {
  const [isShareOpen, setIsShareOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link
              href={getBusinessServicePath(
                settingsSlug,
                service.slug,
              )}
            >
              <PencilLine className="mr-2 size-4" />
              Edit
            </Link>
          </DropdownMenuItem>
          {service.publicInquiryEnabled && (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href={
                    service.isDefault
                      ? getBusinessPublicInquiryUrl(settingsSlug)
                      : getBusinessPublicInquiryUrl(settingsSlug, service.slug)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowUpRight className="mr-2 size-4" />
                  Open public page
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsShareOpen(true)}>
                <Link2 className="mr-2 size-4" />
                Share
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {service.publicInquiryEnabled && (
        <ServiceShareDialog
          settingsSlug={settingsSlug}
          businessName={businessName}
          serviceSlug={service.slug}
          serviceName={service.name}
          isDefault={service.isDefault}
          open={isShareOpen}
          onOpenChange={setIsShareOpen}
        />
      )}
    </>
  );
}

function ServiceShareDialog({
  settingsSlug,
  businessName,
  serviceSlug,
  serviceName,
  isDefault,
  open,
  onOpenChange,
}: {
  settingsSlug: string;
  businessName: string;
  serviceSlug: string;
  serviceName: string;
  isDefault: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isClient = typeof window !== "undefined";
  // The default service lives at the canonical business URL; the per-service
  // path only permanent-redirects there, so share the canonical link.
  const publicPath = isDefault
    ? getBusinessPublicInquiryUrl(settingsSlug)
    : getBusinessPublicInquiryUrl(settingsSlug, serviceSlug);
  const url = isClient
    ? new URL(publicPath, window.location.origin).toString()
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const handleDownload = () => {
    const svgElement = document.getElementById(`qr-svg-${serviceSlug}`);
    if (!svgElement) return;

    const qrSize = 320;
    const paddingX = 48;
    const paddingTop = 56;
    const paddingBottom = 56;
    const textHeaderHeight = 90;
    const shadowMargin = 40;

    const cardWidth = qrSize + paddingX * 2;
    const cardHeight = qrSize + paddingTop + textHeaderHeight + paddingBottom;

    const finalWidth = cardWidth + shadowMargin * 2;
    const finalHeight = cardHeight + shadowMargin * 2;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    canvas.width = finalWidth;
    canvas.height = finalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, finalWidth, finalHeight);

    ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#ffffff";

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(shadowMargin, shadowMargin, cardWidth, cardHeight, 32);
    } else {
      ctx.rect(shadowMargin, shadowMargin, cardWidth, cardHeight);
    }
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const centerX = finalWidth / 2;
    const cardStartY = shadowMargin + paddingTop;

    ctx.fillStyle = "#111827";
    ctx.font =
      "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(businessName, centerX, cardStartY + 20);

    ctx.fillStyle = "#6B7280";
    ctx.font =
      "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(serviceName, centerX, cardStartY + 52);

    const img = new Image();
    img.onload = () => {
      const qrX = shadowMargin + paddingX;
      const qrY = cardStartY + textHeaderHeight;

      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      const logoBoxSize = 72;
      const logoX = qrX + (qrSize - logoBoxSize) / 2;
      const logoY = qrY + (qrSize - logoBoxSize) / 2;

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(logoX, logoY, logoBoxSize, logoBoxSize, 16);
      } else {
        ctx.rect(logoX, logoY, logoBoxSize, logoBoxSize);
      }
      ctx.fill();

      ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fill();

      const logoImg = new Image();
      logoImg.onload = () => {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        const logoSize = 48;
        const imgX = logoX + (logoBoxSize - logoSize) / 2;
        const imgY = logoY + (logoBoxSize - logoSize) / 2;
        ctx.drawImage(logoImg, imgX, imgY, logoSize, logoSize);

        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${serviceName.toLowerCase().replace(/\s+/g, "-")}-qr.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      };
      logoImg.src = "/logo.svg";
    };

    img.src =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Share service</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Share this service link or scan the QR code.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <ResponsiveOverlayBody className="items-center gap-6">
          <div className="relative mx-auto flex items-center justify-center rounded-xl border border-border/70 bg-white p-4">
            <QRCodeSVG
              id={`qr-svg-${serviceSlug}`}
              value={url}
              size={200}
              level="H"
              imageSettings={{
                src: "/logo.svg",
                height: 44,
                width: 44,
                excavate: true,
              }}
            />
          </div>
          <div className="flex w-full items-center gap-2">
            <code className="block flex-1 truncate rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {url}
            </code>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={handleCopy}
            >
              Copy
            </Button>
          </div>
        </ResponsiveOverlayBody>
        <ResponsiveOverlayFooter>
          <Button variant="outline" type="button" onClick={handleDownload}>
            <Download data-icon="inline-start" />
            Download QR
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
