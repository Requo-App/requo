"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Copy, Eye, EyeOff, Info, RefreshCcw, Star } from "lucide-react";

import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getStarterTemplateDefinition } from "@/features/businesses/starter-templates";
import type { BusinessType } from "@/features/inquiries/business-types";
import type {
  ServiceActionState,
  ServicesActionState,
} from "@/features/settings/types";

type ServiceManageCardProps = {
  applyPresetAction?: (
    state: ServiceActionState,
    formData: FormData,
  ) => Promise<ServiceActionState>;
  businessType?: BusinessType;
  /**
   * Publishing a service is an owner-level action on the server. Managers see
   * the control but it stays disabled with the reason spelled out.
   */
  canPublish?: boolean;
  duplicateAction: (
    state: ServicesActionState,
    formData: FormData,
  ) => Promise<ServicesActionState>;
  serviceId: string;
  isDefault: boolean;
  setDefaultAction: (
    state: ServicesActionState,
    formData: FormData,
  ) => Promise<ServicesActionState>;
  isPublicInquiryEnabled: boolean;
  togglePublicAction: (
    state: ServicesActionState,
    formData: FormData,
  ) => Promise<ServicesActionState>;
};

const initialFormsState: ServicesActionState = {};
const initialPresetState: ServiceActionState = {};
const noopPresetAction = async (
  state: ServiceActionState,
): Promise<ServiceActionState> => state;

export function ServiceManageCard({
  applyPresetAction,
  businessType,
  canPublish = true,
  duplicateAction,
  serviceId,
  isDefault,
  setDefaultAction,
  isPublicInquiryEnabled,
  togglePublicAction,
}: ServiceManageCardProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [, duplicateFormAction, isDuplicatePending] =
    useActionStateWithSonner(duplicateAction, initialFormsState);
  const [defaultState, defaultFormAction, isDefaultPending] = useActionStateWithSonner(
    setDefaultAction,
    initialFormsState,
  );
  const [publicState, publicFormAction, isPublicPending] = useActionStateWithSonner(
    togglePublicAction,
    initialFormsState,
  );
  const [presetState, presetFormAction, isPresetPending] = useActionStateWithSonner(
    applyPresetAction ?? noopPresetAction,
    initialPresetState,
  );
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false);

  const starterTemplate = businessType ? getStarterTemplateDefinition(businessType) : null;
  const isDefaultAndPublic = isDefault && isPublicInquiryEnabled;

  useEffect(() => {
    if (!defaultState.success && !publicState.success && !presetState.success) {
      return;
    }

    scheduleRefresh();
  }, [defaultState.success, presetState.success, publicState.success, scheduleRefresh]);

  return (
    <>
      <Card size="sm" className="gap-0 border-border/75 bg-card/97 shadow-xs">
        <CardHeader className="gap-1 border-b border-border/70 p-4 sm:p-5">
          <CardTitle className="font-heading text-sm font-semibold tracking-tight sm:text-base">
            Service publishing &amp; defaults
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed sm:text-sm">
            Manage visibility, default routing, starter templates, and duplication.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 p-0">
          {/* Public Page Visibility */}
          <SettingsRow
            description={
              isPublicInquiryEnabled
                ? "This service is live and accepts inquiries from anyone with your public URL."
                : "This service is saved as a draft and hidden from public visitors."
            }
            label="Public page status"
            status={
              <Badge variant={isPublicInquiryEnabled ? "secondary" : "outline"}>
                {isPublicInquiryEnabled ? "Live" : "Draft"}
              </Badge>
            }
            action={
              isDefaultAndPublic ? (
                <div className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs leading-normal text-muted-foreground">
                  <Info
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>
                    The default service stays live. Set another default before unpublishing.
                  </span>
                </div>
              ) : !canPublish ? (
                <div className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs leading-normal text-muted-foreground">
                  <Info
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>Only the business owner can publish a service.</span>
                </div>
              ) : (
                <form action={publicFormAction}>
                  <input name="targetServiceId" type="hidden" value={serviceId} />
                  <input
                    name="publicInquiryEnabled"
                    type="hidden"
                    value={String(!isPublicInquiryEnabled)}
                  />
                  <Button
                    disabled={isPublicPending}
                    size="sm"
                    type="submit"
                    variant={isPublicInquiryEnabled ? "outline" : "default"}
                  >
                    {isPublicPending ? (
                      <>
                        <Spinner data-icon="inline-start" aria-hidden="true" />
                        Saving...
                      </>
                    ) : isPublicInquiryEnabled ? (
                      <>
                        <EyeOff data-icon="inline-start" />
                        Unpublish service
                      </>
                    ) : (
                      <>
                        <Eye data-icon="inline-start" />
                        Publish service
                      </>
                    )}
                  </Button>
                </form>
              )
            }
          />

          {/* Default Service */}
          <SettingsRow
            description="The service that receives inquiries from your default business inquiry link."
            label="Default service"
            status={
              <Badge variant={isDefault ? "secondary" : "outline"}>
                {isDefault ? "Default" : "Standard"}
              </Badge>
            }
            action={
              isDefault ? (
                <span className="text-xs font-medium text-muted-foreground">
                  Active default
                </span>
              ) : !isPublicInquiryEnabled ? (
                <div className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs leading-normal text-muted-foreground">
                  <Info
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>Publish this service before making it the default.</span>
                </div>
              ) : (
                <form action={defaultFormAction}>
                  <input name="targetServiceId" type="hidden" value={serviceId} />
                  <Button
                    disabled={isDefaultPending}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    {isDefaultPending ? (
                      <>
                        <Spinner data-icon="inline-start" aria-hidden="true" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Star data-icon="inline-start" />
                        Set as default
                      </>
                    )}
                  </Button>
                </form>
              )
            }
          />

          {/* Template Defaults Reset */}
          {starterTemplate && applyPresetAction ? (
            <SettingsRow
              description={`Rebuild this service's fields and page copy from the ${starterTemplate.label} starter template.`}
              label="Template"
              status={
                <Badge variant="outline">
                  {starterTemplate.label}
                </Badge>
              }
              action={
                <Button
                  disabled={isPresetPending}
                  onClick={() => setIsPresetDialogOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCcw data-icon="inline-start" />
                  Apply defaults
                </Button>
              }
            />
          ) : null}

          {/* Duplicate Service */}
          <SettingsRow
            description="Create an exact copy of this service with all fields and copy preserved."
            label="Duplicate service"
            action={
              <form action={duplicateFormAction}>
                <input name="targetServiceId" type="hidden" value={serviceId} />
                <Button
                  disabled={isDuplicatePending}
                  size="sm"
                  type="submit"
                  variant="outline"
                >
                  {isDuplicatePending ? (
                    <>
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                      Copying...
                    </>
                  ) : (
                    <>
                      <Copy data-icon="inline-start" />
                      Duplicate
                    </>
                  )}
                </Button>
              </form>
            }
          />
        </CardContent>
      </Card>

      {/* Preset Dialog */}
      {starterTemplate ? (
        <Dialog open={isPresetDialogOpen} onOpenChange={setIsPresetDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Reset to template defaults?</DialogTitle>
              <DialogDescription>
                This will replace your current fields and page copy with the{" "}
                {starterTemplate.label} template defaults.
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">What gets replaced</p>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    Inquiry form fields and labels
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    Page headline, description, and copy
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    Supporting cards and layout
                  </li>
                </ul>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                onClick={() => setIsPresetDialogOpen(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <form action={presetFormAction}>
                <input name="businessType" type="hidden" value={businessType} />
                <Button
                  disabled={isPresetPending}
                  onClick={() => setIsPresetDialogOpen(false)}
                  type="submit"
                >
                  {isPresetPending ? (
                    <>
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                      Applying...
                    </>
                  ) : (
                    "Apply defaults"
                  )}
                </Button>
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function SettingsRow({
  action,
  description,
  label,
  status,
}: {
  action: ReactNode;
  description?: string;
  label: string;
  status?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {status}
        </div>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-start sm:self-center">{action}</div> : null}
    </div>
  );
}
