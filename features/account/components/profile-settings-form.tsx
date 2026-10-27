"use client";

import { type Area } from "react-easy-crop";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useFormStatus } from "react-dom";
import {
  KeyRound,
  LogOut,
  Monitor,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { LazyCropper } from "@/components/shared/lazy-image-tools";

import {
  FloatingFormActions,
  useFloatingUnsavedChanges,
} from "@/components/shared/floating-form-actions";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/features/auth/components/password-input";
import type {
  AccountDeleteActionState,
  AccountPasswordActionState,
  AccountProfileActionState,
  AccountProfileView,
  AccountSecurityView,
  AccountSessionActionState,
  AccountSessionView,
} from "@/features/account/types";
import {
  getDisplayFirstName,
  joinFullName,
  splitFullName,
} from "@/features/account/name";
import {
  profileAvatarAccept,
  profileAvatarAllowedMimeTypes,
  profileAvatarMaxSize,
} from "@/features/account/utils";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { cn } from "@/lib/utils";

type ProfileSettingsFormProps = {
  action: (
    state: AccountProfileActionState,
    formData: FormData,
  ) => Promise<AccountProfileActionState>;
  changePasswordAction: (
    state: AccountPasswordActionState,
    formData: FormData,
  ) => Promise<AccountPasswordActionState>;
  setPasswordAction: (
    state: AccountPasswordActionState,
    formData: FormData,
  ) => Promise<AccountPasswordActionState>;
  revokeSessionAction: (
    state: AccountSessionActionState,
    formData: FormData,
  ) => Promise<AccountSessionActionState>;
  revokeOtherSessionsAction: (
    state: AccountSessionActionState,
    formData: FormData,
  ) => Promise<AccountSessionActionState>;
  deleteAccountAction: (
    state: AccountDeleteActionState,
    formData: FormData,
  ) => Promise<AccountDeleteActionState>;
  profile: AccountProfileView;
  security: AccountSecurityView;
};

type LoadedAvatarAsset = {
  file: File;
  url: string;
  width: number;
  height: number;
};

const initialProfileState: AccountProfileActionState = {};

export function ProfileSettingsForm({
  action,
  changePasswordAction,
  setPasswordAction,
  revokeSessionAction,
  revokeOtherSessionsAction,
  deleteAccountAction,
  profile,
  security,
}: ProfileSettingsFormProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialProfileState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [hasPendingAvatar, setHasPendingAvatar] = useState(false);
  const [avatarResetSignal, setAvatarResetSignal] = useState(0);
  const initialName =
    profile.firstName || profile.lastName
      ? {
          firstName: (profile.firstName ?? "").trim(),
          lastName: (profile.lastName ?? "").trim(),
        }
      : splitFullName(profile.fullName);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const displayFirstName =
    getDisplayFirstName({
      firstName,
      fullName: profile.fullName,
      fallback: profile.fullName,
    }) || profile.fullName;
  const fullNameError = state.fieldErrors?.fullName?.[0];

  const hasNameChanges =
    firstName.trim() !== initialName.firstName ||
    lastName.trim() !== initialName.lastName;
  const hasUnsavedChanges =
    hasNameChanges || removeAvatar || hasPendingAvatar;
  const { shouldRenderFloatingActions, floatingActionsState } =
    useFloatingUnsavedChanges(hasUnsavedChanges);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    scheduleRefresh();
  }, [scheduleRefresh, state.success]);

  function handleCancelChanges() {
    formRef.current?.reset();
    setFirstName(initialName.firstName);
    setLastName(initialName.lastName);
    setRemoveAvatar(false);
    setHasPendingAvatar(false);
    setAvatarResetSignal((current) => current + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-[36rem] min-w-0 flex-col gap-10">
      <form action={formAction} ref={formRef}>
        <input name="removeAvatar" type="hidden" value={String(removeAvatar)} />
        <input
          name="fullName"
          type="hidden"
          value={joinFullName(firstName, lastName)}
        />

        <div className="flex flex-col gap-10">
          <AccountSection
            title="Picture"
          >
            <ProfileAvatarField
              disabled={isPending}
              displayName={displayFirstName}
              fieldError={state.fieldErrors?.avatar?.[0]}
              hasUploadedAvatar={Boolean(profile.avatarStoragePath)}
              initialAvatarSrc={profile.avatarSrc}
              onPendingChange={setHasPendingAvatar}
              oauthAvatarSrc={profile.oauthAvatarSrc}
              removeAvatar={removeAvatar}
              onRemoveAvatarChange={setRemoveAvatar}
              resetSignal={avatarResetSignal}
            />
            <p className="text-sm text-muted-foreground">
              We support square JPG, PNG, and WEBP avatars up to 2 MB.
            </p>
          </AccountSection>

          <AccountSection
            title="Name"
            description="Your first name is shown across Requo. Last name is optional."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="account-first-name"
                >
                  First Name
                </label>
                <Input
                  aria-invalid={Boolean(fullNameError) || undefined}
                  disabled={isPending}
                  id="account-first-name"
                  maxLength={60}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Mark"
                  value={firstName}
                />
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="account-last-name"
                >
                  Last Name{" "}
                  <span className="font-normal">(optional)</span>
                </label>
                <Input
                  aria-invalid={Boolean(fullNameError) || undefined}
                  disabled={isPending}
                  id="account-last-name"
                  maxLength={60}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Optional"
                  value={lastName}
                />
              </div>
            </div>
            <FieldError
              errors={fullNameError ? [{ message: fullNameError }] : undefined}
            />
          </AccountSection>

          <AccountSection
            title="Email"
            description="The email associated to your account"
          >
            <div className="grid gap-1.5">
              <label
                className="sr-only"
                htmlFor="account-email"
              >
                Email
              </label>
              <Input
                disabled
                id="account-email"
                readOnly
                value={profile.email}
              />
            </div>
          </AccountSection>
        </div>

        <FloatingFormActions
          disableSubmit={!hasUnsavedChanges}
          isPending={isPending}
          message="You have unsaved profile changes."
          onCancel={handleCancelChanges}
          state={floatingActionsState}
          submitLabel="Save profile"
          submitPendingLabel="Saving profile..."
          visible={shouldRenderFloatingActions}
        />
      </form>

      <PasswordSection
        changePasswordAction={changePasswordAction}
        hasPassword={security.hasPassword}
        setPasswordAction={setPasswordAction}
      />

      <DevicesSection
        revokeOtherSessionsAction={revokeOtherSessionsAction}
        revokeSessionAction={revokeSessionAction}
        sessions={security.activeSessions}
      />

      <DeleteAccountSection
        deleteAccountAction={deleteAccountAction}
        security={security}
      />
    </div>
  );
}

function AccountSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                     */
/* -------------------------------------------------------------------------- */

function ProfileAvatarField({
  disabled,
  displayName,
  fieldError,
  hasUploadedAvatar,
  initialAvatarSrc,
  onPendingChange,
  oauthAvatarSrc,
  removeAvatar,
  onRemoveAvatarChange,
  resetSignal,
}: {
  disabled: boolean;
  displayName: string;
  fieldError?: string;
  hasUploadedAvatar: boolean;
  initialAvatarSrc: string | null;
  onPendingChange: (hasPendingChange: boolean) => void;
  oauthAvatarSrc: string | null;
  removeAvatar: boolean;
  onRemoveAvatarChange: (nextValue: boolean) => void;
  resetSignal: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftAsset, setDraftAsset] = useState<LoadedAvatarAsset | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    return () => {
      if (draftAsset) {
        URL.revokeObjectURL(draftAsset.url);
      }
    };
  }, [draftAsset]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    onPendingChange(Boolean(previewUrl));
  }, [onPendingChange, previewUrl]);

  useEffect(() => {
    queueMicrotask(() => {
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      setCropOpen(false);
      setDraftAsset((currentAsset) => {
        if (currentAsset) {
          URL.revokeObjectURL(currentAsset.url);
        }

        return null;
      });
      setPreviewUrl((currentPreviewUrl) => {
        if (currentPreviewUrl) {
          URL.revokeObjectURL(currentPreviewUrl);
        }

        return null;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setLocalError(null);
    });
  }, [resetSignal]);

  const effectivePreviewUrl = previewUrl
    ? previewUrl
    : removeAvatar
      ? oauthAvatarSrc
      : initialAvatarSrc;

  async function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.currentTarget.files?.[0];

    setLocalError(null);

    if (!nextFile) {
      return;
    }

    try {
      const nextAsset = await loadAvatarAsset(nextFile);

      setDraftAsset((currentAsset) => {
        if (currentAsset) {
          URL.revokeObjectURL(currentAsset.url);
        }

        return nextAsset;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropOpen(true);
    } catch (error) {
      event.currentTarget.value = "";
      setLocalError(
        error instanceof Error
          ? error.message
          : "We couldn't open that image for cropping.",
      );
    }
  }

  function closeCropper() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setCropOpen(false);
    setDraftAsset((currentAsset) => {
      if (currentAsset) {
        URL.revokeObjectURL(currentAsset.url);
      }

      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }

  async function applyCrop() {
    if (!draftAsset || !croppedAreaPixels || !inputRef.current || isApplying) {
      return;
    }

    setLocalError(null);
    setIsApplying(true);

    try {
      const croppedFile = await createCroppedAvatarFile(
        draftAsset.file,
        draftAsset.url,
        croppedAreaPixels,
      );

      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      inputRef.current.files = transfer.files;

      setPreviewUrl((currentPreviewUrl) => {
        if (currentPreviewUrl) {
          URL.revokeObjectURL(currentPreviewUrl);
        }

        return URL.createObjectURL(croppedFile);
      });
      onRemoveAvatarChange(false);
      setCropOpen(false);
      setDraftAsset((currentAsset) => {
        if (currentAsset) {
          URL.revokeObjectURL(currentAsset.url);
        }

        return null;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "We couldn't crop that avatar right now.",
      );
    } finally {
      setIsApplying(false);
    }
  }

  function resetCrop() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  return (
    <>
      <div className="flex items-start gap-4">
        <input
          ref={inputRef}
          accept={profileAvatarAccept}
          className="sr-only"
          disabled={disabled}
          id="profile-avatar"
          name="avatar"
          onChange={handleAvatarSelection}
          type="file"
        />
        <Avatar className="size-16 shrink-0 rounded-full border border-border/70">
          <AvatarImage alt={`${displayName} avatar`} src={effectivePreviewUrl ?? undefined} />
          <AvatarFallback className="rounded-full text-lg">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Upload data-icon="inline-start" />
              Upload
            </Button>
            <Button
              aria-pressed={removeAvatar}
              disabled={disabled || (!hasUploadedAvatar && !previewUrl)}
              onClick={() => {
                if (previewUrl) {
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }

                  setPreviewUrl((currentPreviewUrl) => {
                    if (currentPreviewUrl) {
                      URL.revokeObjectURL(currentPreviewUrl);
                    }

                    return null;
                  });
                  onRemoveAvatarChange(false);
                } else {
                  onRemoveAvatarChange(!removeAvatar);
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 data-icon="inline-start" />
              {removeAvatar ? "Keep" : "Remove"}
            </Button>
          </div>
          {previewUrl ? (
            <p className="text-xs text-muted-foreground">
              Cropped photo ready — applies after save.
            </p>
          ) : removeAvatar ? (
            <p className="text-xs text-muted-foreground">
              {oauthAvatarSrc
                ? "Falls back to your sign-in photo after save."
                : "Falls back to your initials after save."}
            </p>
          ) : null}
        </div>
      </div>

      <FieldError
        errors={
          localError
            ? [{ message: localError }]
            : fieldError
              ? [{ message: fieldError }]
              : undefined
        }
      />

      <Dialog
        open={cropOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeCropper();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Crop profile photo</DialogTitle>
            <DialogDescription>
              Drag to reposition. Scroll or pinch to zoom — your photo appears
              as a circle across Requo.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="gap-4">
            <div
              data-padding="none"
              className="soft-panel relative mx-auto aspect-square w-full max-w-[20rem] overflow-hidden rounded-xl bg-muted/40 sm:max-w-[22rem]"
            >
              {draftAsset ? (
                <LazyCropper
                  aspect={1}
                  crop={crop}
                  cropShape="round"
                  image={draftAsset.url}
                  objectFit="cover"
                  onCropChange={setCrop}
                  onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                  onZoomChange={setZoom}
                  showGrid={false}
                  zoom={zoom}
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Drag to reposition • Scroll or pinch to zoom
              </p>
              <Button
                onClick={resetCrop}
                size="sm"
                type="button"
                variant="ghost"
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                Reset
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((current) => Math.max(1, Math.round((current - 0.25) * 100) / 100))}
                size="icon"
                type="button"
                variant="outline"
              >
                <ZoomOut aria-hidden="true" />
              </Button>
              <label className="sr-only" htmlFor="avatar-crop-zoom">
                Zoom
              </label>
              <input
                aria-valuetext={`${Math.round(zoom * 100)} percent`}
                className="h-11 flex-1 accent-primary"
                id="avatar-crop-zoom"
                max="4"
                min="1"
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
                step="0.01"
                type="range"
                value={zoom}
              />
              <Button
                aria-label="Zoom in"
                disabled={zoom >= 4}
                onClick={() => setZoom((current) => Math.min(4, Math.round((current + 0.25) * 100) / 100))}
                size="icon"
                type="button"
                variant="outline"
              >
                <ZoomIn aria-hidden="true" />
              </Button>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {draftAsset ? (
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
                <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
                  <Avatar className="size-11 rounded-full">
                    <AvatarImage
                      alt=""
                      src={draftAsset.url}
                    />
                    <AvatarFallback className="rounded-full text-xs">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <Avatar className="size-7 rounded-full opacity-80">
                    <AvatarImage
                      alt=""
                      src={draftAsset.url}
                    />
                    <AvatarFallback className="rounded-full text-xs">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {draftAsset.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {draftAsset.width} × {draftAsset.height} • Circle preview
                  </p>
                </div>
                <Button
                  onClick={() => inputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Change
                </Button>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button disabled={isApplying} onClick={closeCropper} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={!croppedAreaPixels || isApplying} onClick={applyCrop} type="button">
              {isApplying ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Applying...
                </>
              ) : (
                "Use photo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Password                                                                   */
/* -------------------------------------------------------------------------- */

const initialPasswordState: AccountPasswordActionState = {};

function PasswordSection({
  changePasswordAction,
  hasPassword: initialHasPassword,
  setPasswordAction,
}: {
  changePasswordAction: (
    state: AccountPasswordActionState,
    formData: FormData,
  ) => Promise<AccountPasswordActionState>;
  hasPassword: boolean;
  setPasswordAction: (
    state: AccountPasswordActionState,
    formData: FormData,
  ) => Promise<AccountPasswordActionState>;
}) {
  const [revokeAfterPasswordChange, setRevokeAfterPasswordChange] = useState(true);
  const [setPasswordState, setPasswordFormAction, isSetPasswordPending] =
    useActionStateWithSonner(setPasswordAction, initialPasswordState);
  const [changePasswordState, changePasswordFormAction, isChangePasswordPending] =
    useActionStateWithSonner(changePasswordAction, initialPasswordState);
  const hasPassword = initialHasPassword || Boolean(setPasswordState.success);

  return (
    <AccountSection
      title={hasPassword ? "Change Password" : "Set Password"}
      description={
        hasPassword
          ? "Update the password used for email sign-in."
          : "Add password sign-in to this account."
      }
    >
      {hasPassword ? (
        <form action={changePasswordFormAction} className="flex flex-col gap-3">
          <FieldGroup>
            <Field
              data-invalid={
                Boolean(changePasswordState.fieldErrors?.currentPassword) ||
                undefined
              }
            >
              <FieldLabel htmlFor="security-current-password">
                Current password
              </FieldLabel>
              <FieldContent>
                <PasswordInput
                  autoComplete="current-password"
                  disabled={isChangePasswordPending}
                  id="security-current-password"
                  name="currentPassword"
                  placeholder="Enter your current password"
                  required
                />
                <FieldError
                  errors={
                    changePasswordState.fieldErrors?.currentPassword?.[0]
                      ? [
                          {
                            message:
                              changePasswordState.fieldErrors.currentPassword[0],
                          },
                        ]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

            <Field
              data-invalid={
                Boolean(changePasswordState.fieldErrors?.newPassword) ||
                undefined
              }
            >
              <FieldLabel htmlFor="security-new-password">
                New password
              </FieldLabel>
              <FieldContent>
                <PasswordInput
                  autoComplete="new-password"
                  disabled={isChangePasswordPending}
                  id="security-new-password"
                  name="newPassword"
                  placeholder="At least 8 characters"
                  required
                />
                <FieldError
                  errors={
                    changePasswordState.fieldErrors?.newPassword?.[0]
                      ? [
                          {
                            message:
                              changePasswordState.fieldErrors.newPassword[0],
                          },
                        ]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

            <Field
              data-invalid={
                Boolean(changePasswordState.fieldErrors?.confirmPassword) ||
                undefined
              }
            >
              <FieldLabel htmlFor="security-confirm-password">
                Confirm password
              </FieldLabel>
              <FieldContent>
                <PasswordInput
                  autoComplete="new-password"
                  disabled={isChangePasswordPending}
                  id="security-confirm-password"
                  name="confirmPassword"
                  placeholder="Re-enter your new password"
                  required
                />
                <FieldError
                  errors={
                    changePasswordState.fieldErrors?.confirmPassword?.[0]
                      ? [
                          {
                            message:
                              changePasswordState.fieldErrors
                                .confirmPassword[0],
                          },
                        ]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldContent>
                <input
                  name="revokeOtherSessions"
                  type="hidden"
                  value={String(revokeAfterPasswordChange)}
                />
                <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
                  <span className="min-w-0 text-sm text-foreground">
                    Sign out other sessions
                    <span className="block text-xs text-muted-foreground">
                      End sessions on other devices after the password change.
                    </span>
                  </span>
                  <Switch
                    checked={revokeAfterPasswordChange}
                    disabled={isChangePasswordPending}
                    onCheckedChange={setRevokeAfterPasswordChange}
                  />
                </label>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex justify-start">
            <Button disabled={isChangePasswordPending} type="submit">
              {isChangePasswordPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Updating password...
                </>
              ) : (
                <>
                  <KeyRound data-icon="inline-start" />
                  Update password
                </>
              )}
            </Button>
          </div>
        </form>
      ) : (
        <form action={setPasswordFormAction} className="flex flex-col gap-3">
          <FieldGroup>
            <Field
              data-invalid={
                Boolean(setPasswordState.fieldErrors?.newPassword) || undefined
              }
            >
              <FieldLabel htmlFor="security-set-password">
                New password
              </FieldLabel>
              <FieldContent>
                <PasswordInput
                  autoComplete="new-password"
                  disabled={isSetPasswordPending}
                  id="security-set-password"
                  name="newPassword"
                  placeholder="At least 8 characters"
                  required
                />
                <FieldDescription>
                  This enables email + password sign-in in addition to any connected provider.
                </FieldDescription>
                <FieldError
                  errors={
                    setPasswordState.fieldErrors?.newPassword?.[0]
                      ? [
                          {
                            message:
                              setPasswordState.fieldErrors.newPassword[0],
                          },
                        ]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

            <Field
              data-invalid={
                Boolean(setPasswordState.fieldErrors?.confirmPassword) ||
                undefined
              }
            >
              <FieldLabel htmlFor="security-set-confirm-password">
                Confirm password
              </FieldLabel>
              <FieldContent>
                <PasswordInput
                  autoComplete="new-password"
                  disabled={isSetPasswordPending}
                  id="security-set-confirm-password"
                  name="confirmPassword"
                  placeholder="Re-enter your new password"
                  required
                />
                <FieldError
                  errors={
                    setPasswordState.fieldErrors?.confirmPassword?.[0]
                      ? [
                          {
                            message:
                              setPasswordState.fieldErrors.confirmPassword[0],
                          },
                        ]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex justify-start">
            <Button disabled={isSetPasswordPending} type="submit">
              {isSetPasswordPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Setting password...
                </>
              ) : (
                <>
                  <KeyRound data-icon="inline-start" />
                  Set password
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </AccountSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Devices                                                                    */
/* -------------------------------------------------------------------------- */

const initialSessionState: AccountSessionActionState = {};

function DevicesSection({
  revokeSessionAction,
  revokeOtherSessionsAction,
  sessions,
}: {
  revokeSessionAction: (
    state: AccountSessionActionState,
    formData: FormData,
  ) => Promise<AccountSessionActionState>;
  revokeOtherSessionsAction: (
    state: AccountSessionActionState,
    formData: FormData,
  ) => Promise<AccountSessionActionState>;
  sessions: AccountSessionView[];
}) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [revokedTokens, setRevokedTokens] = useState<string[]>([]);
  const [sessionState, sessionFormAction] = useActionStateWithSonner(
    revokeOtherSessionsAction,
    initialSessionState,
  );
  const [revokeSessionState, revokeSessionFormAction] = useActionStateWithSonner(
    revokeSessionAction,
    initialSessionState,
  );
  const othersRevoked = Boolean(sessionState.success);
  const visibleSessions = sessions.filter(
    (session) =>
      !revokedTokens.includes(session.token ?? "") &&
      (!othersRevoked || session.isCurrent),
  );

  useEffect(() => {
    if (sessionState.success || revokeSessionState.success) {
      scheduleRefresh();
    }
  }, [revokeSessionState.success, scheduleRefresh, sessionState.success]);

  function handleRevokeSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const token = formData.get("token");

    if (typeof token === "string" && token.length > 0) {
      setRevokedTokens((current) =>
        current.includes(token) ? current : [...current, token],
      );
    }
  }

  const hasOtherSessions = visibleSessions.some(
    (session) => !session.isCurrent,
  );

  return (
    <AccountSection
      title="Devices"
      description="Devices with an active session on your account"
    >
      <div className="flex flex-col gap-2">
        {visibleSessions.length > 0 ? (
          visibleSessions.map((session) => (
            <div
              className="flex items-center gap-3 rounded-xl border border-border/70 px-4 py-3"
              key={session.id}
            >
              {getSessionIcon(session.userAgent)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {formatDeviceTitle(session.userAgent)}{" "}
                  <span className="font-normal text-muted-foreground">
                    {getSessionMeta(session)}
                  </span>
                </p>
              </div>
              {session.isCurrent ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-ink">
                  <span aria-hidden="true" className="size-1 rounded-full bg-current" />
                  This device
                </span>
              ) : session.token ? (
                <form action={revokeSessionFormAction} onSubmit={handleRevokeSubmit}>
                  <input name="token" type="hidden" value={session.token} />
                  <SessionRowSignOutButton
                    label={`Sign out ${formatDeviceTitle(session.userAgent)}`}
                  />
                </form>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-border/70 px-4 py-3 text-sm text-muted-foreground">
            No active sessions were returned for this account.
          </div>
        )}
      </div>

      {revokeSessionState.error ? (
        <p className="text-sm text-destructive-ink">{revokeSessionState.error}</p>
      ) : null}

      {hasOtherSessions ? (
        <div className="flex justify-start">
          <form action={sessionFormAction}>
            <RevokeOtherSessionsSubmitButton />
          </form>
        </div>
      ) : null}
    </AccountSection>
  );
}

function SessionRowSignOutButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-label={label}
      disabled={pending}
      size="sm"
      type="submit"
      variant="ghost"
    >
      {pending ? (
        <>
          <Spinner data-icon="inline-start" aria-hidden="true" />
          Signing out...
        </>
      ) : (
        "Sign out"
      )}
    </Button>
  );
}

function RevokeOtherSessionsSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="outline" size="sm">
      {pending ? (
        <>
          <Spinner data-icon="inline-start" aria-hidden="true" />
          Signing out other sessions...
        </>
      ) : (
        <>
          <LogOut data-icon="inline-start" />
          Sign out other devices
        </>
      )}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Danger zone                                                                */
/* -------------------------------------------------------------------------- */

const initialDeleteState: AccountDeleteActionState = {};

function DeleteAccountSection({
  deleteAccountAction,
  security,
}: {
  deleteAccountAction: (
    state: AccountDeleteActionState,
    formData: FormData,
  ) => Promise<AccountDeleteActionState>;
  security: AccountSecurityView;
}) {
  const [deleteState, deleteFormAction, isDeletePending] = useActionStateWithSonner(
    deleteAccountAction,
    initialDeleteState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const accountDeletionBlocked = !security.deletion.allowed;

  return (
    <AccountSection
      title="Danger zone"
      description="Delete account and all the associated data"
    >
      <div className="flex justify-start">
        <Button
          className="border-destructive/40 text-destructive-ink hover:bg-destructive/10 hover:text-destructive-ink"
          onClick={() => setConfirmOpen(true)}
          type="button"
          variant="outline"
        >
          Delete account
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              {accountDeletionBlocked
                ? "Resolve business ownership or billing blockers before deleting this account."
                : "This action is permanent. Your profile, sessions, and account access will be permanently deleted."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            {accountDeletionBlocked ? (
              <div className="grid gap-2">
                {security.deletion.blockers.map((blocker, index) => (
                  <div
                    className="rounded-xl border border-border/70 px-4 py-3 text-sm"
                    key={`${blocker.code}-${index}`}
                  >
                    <p className="font-medium text-foreground">
                      <ShieldAlert
                        aria-hidden="true"
                        className="mr-1.5 inline size-4 text-destructive-ink"
                      />
                      {blocker.businessName ?? "Blocking relationship"}
                    </p>
                    <p className="mt-1 text-muted-foreground">{blocker.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <form action={deleteFormAction} className="flex flex-col gap-3">
                <FieldGroup>
                  <Field
                    data-invalid={
                      Boolean(deleteState.fieldErrors?.confirmation) || undefined
                    }
                  >
                    <FieldLabel htmlFor="security-delete-confirmation">
                      Type &quot;delete my account&quot; to confirm
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        autoComplete="off"
                        disabled={isDeletePending}
                        id="security-delete-confirmation"
                        name="confirmation"
                        placeholder="delete my account"
                        required
                      />
                      <FieldError
                        errors={
                          deleteState.fieldErrors?.confirmation?.[0]
                            ? [
                                {
                                  message:
                                    deleteState.fieldErrors.confirmation[0],
                                },
                              ]
                            : undefined
                        }
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                {deleteState.error ? (
                  <p className="text-sm text-destructive-ink">{deleteState.error}</p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setConfirmOpen(false)}
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={isDeletePending}
                    type="submit"
                    variant="destructive"
                  >
                    {isDeletePending ? (
                      <>
                        <Spinner data-icon="inline-start" aria-hidden="true" />
                        Deleting account...
                      </>
                    ) : (
                      <>
                        <Trash2 data-icon="inline-start" />
                        Delete account
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogBody>

          {accountDeletionBlocked ? (
            <DialogFooter>
              <Button
                onClick={() => setConfirmOpen(false)}
                type="button"
                variant="outline"
              >
                Close
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </AccountSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function loadAvatarAsset(file: File): Promise<LoadedAvatarAsset> {
  const url = URL.createObjectURL(file);

  try {
    const dimensions = await readImageDimensions(url);

    return {
      file,
      url,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      reject(
        new Error("Choose a JPG, PNG, or WEBP image that can be opened in the browser."),
      );
    };
    image.src = url;
  });
}

async function createCroppedAvatarFile(
  sourceFile: File,
  sourceUrl: string,
  cropAreaPixels: Area,
) {
  const image = await loadCanvasImage(sourceUrl);
  const outputMimeType = profileAvatarAllowedMimeTypes.includes(
    sourceFile.type as (typeof profileAvatarAllowedMimeTypes)[number],
  )
    ? sourceFile.type
    : "image/png";
  const outputExtension = getAvatarExtensionForMimeType(outputMimeType);

  for (const maxDimension of [768, 640, 512, 384]) {
    const scale = Math.min(
      1,
      maxDimension / Math.max(cropAreaPixels.width, cropAreaPixels.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropAreaPixels.width * scale));
    canvas.height = Math.max(1, Math.round(cropAreaPixels.height * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Your browser could not prepare that crop.");
    }

    context.drawImage(
      image,
      cropAreaPixels.x,
      cropAreaPixels.y,
      cropAreaPixels.width,
      cropAreaPixels.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        resolve,
        outputMimeType,
        outputMimeType === "image/jpeg" || outputMimeType === "image/webp"
          ? 0.92
          : undefined,
      );
    });

    if (!blob) {
      continue;
    }

    const croppedFile = new File(
      [blob],
      buildCroppedAvatarFileName(sourceFile.name, outputExtension),
      {
        lastModified: Date.now(),
        type: outputMimeType,
      },
    );

    if (croppedFile.size <= profileAvatarMaxSize) {
      return croppedFile;
    }
  }

  throw new Error("The cropped avatar is still larger than 2 MB. Try a tighter crop or a smaller source image.");
}

function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("We couldn't render that image for cropping."));
    image.src = url;
  });
}

function buildCroppedAvatarFileName(fileName: string, extension: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");

  return `${baseName || "profile-avatar"}-cropped${extension}`;
}

function getAvatarExtensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return ".png";
  }
}

function getInitials(value: string) {
  return (
    value
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase())
      .join("") || "?"
  );
}

function getSessionMeta(session: AccountSessionView) {
  const lastActive = session.updatedAt ?? session.createdAt;
  const relative = lastActive ? formatRelativeTime(lastActive) : null;
  const parts = [
    relative ? `Last active ${relative}` : null,
    session.ipAddress,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : "Session details unavailable";
}

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60 * 1000) {
    return "now";
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

function getSessionIcon(userAgent: string | null) {
  const isMobile =
    typeof userAgent === "string" &&
    /(iphone|ipad|ipod|android|mobile)/i.test(userAgent);
  const Icon = isMobile ? Smartphone : Monitor;

  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-muted-foreground")}
    />
  );
}

function formatDeviceTitle(userAgent: string | null) {
  const parsed = parseUserAgent(userAgent);

  if (!parsed.browser && !parsed.os) {
    return "Unknown device";
  }

  if (!parsed.browser) {
    return parsed.os;
  }

  if (!parsed.os) {
    return parsed.browser;
  }

  return `${parsed.browser} on ${parsed.os}`;
}

function parseUserAgent(userAgent: string | null) {
  const ua = typeof userAgent === "string" ? userAgent : "";

  return {
    browser: detectBrowser(ua),
    os: detectOs(ua),
  };
}

function detectBrowser(ua: string) {
  if (!ua) {
    return null;
  }

  if (/edg\//i.test(ua)) {
    return "Edge";
  }

  if (/chrome\//i.test(ua) && !/edg\//i.test(ua) && !/opr\//i.test(ua)) {
    return "Chrome";
  }

  if (/firefox\//i.test(ua)) {
    return "Firefox";
  }

  if (/safari\//i.test(ua) && !/chrome\//i.test(ua) && !/crios\//i.test(ua)) {
    return "Safari";
  }

  return null;
}

function detectOs(ua: string) {
  if (!ua) {
    return null;
  }

  if (/windows nt/i.test(ua)) {
    return "Windows";
  }

  if (/android/i.test(ua)) {
    return "Android";
  }

  if (/(iphone|ipad|ipod)/i.test(ua)) {
    return "iOS";
  }

  if (/mac os x/i.test(ua)) {
    return "macOS";
  }

  if (/linux/i.test(ua)) {
    return "Linux";
  }

  return null;
}
