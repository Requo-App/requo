"use client";

import Image from "next/image";
import { type Area } from "react-easy-crop";
import { useEffect, useRef, useState } from "react";

import { LazyCropper } from "@/components/shared/lazy-image-tools";

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
import { Spinner } from "@/components/ui/spinner";
import { ImagePlus, RotateCcw, Trash2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { businessLogoAccept } from "@/features/settings/utils";
import {
  createCroppedLogoFile,
  getLogoCoverZoom,
  loadLogoAsset,
  type LoadedLogoAsset,
} from "./logo-utils";

type BusinessLogoFieldProps = {
  businessName: string;
  disabled: boolean;
  fieldError?: string;
  initialPreviewUrl: string | null;
  onPendingChange: (hasPendingChange: boolean) => void;
  removeLogo: boolean;
  resetSignal: number;
  showRemoveToggle: boolean;
  onRemoveLogoChange: (nextValue: boolean) => void;
};

export function BusinessLogoField({
  businessName,
  disabled,
  fieldError,
  initialPreviewUrl,
  onPendingChange,
  removeLogo,
  resetSignal,
  showRemoveToggle,
  onRemoveLogoChange,
}: BusinessLogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftAsset, setDraftAsset] = useState<LoadedLogoAsset | null>(null);
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
      setPreviewUrl((currentPreviewUrlValue) => {
        if (currentPreviewUrlValue) {
          URL.revokeObjectURL(currentPreviewUrlValue);
        }

        return null;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setLocalError(null);
    });
  }, [resetSignal]);

  const currentPreviewUrl = !removeLogo ? previewUrl ?? initialPreviewUrl : null;

  async function handleLogoSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.currentTarget.files?.[0];

    setLocalError(null);

    if (!nextFile) {
      return;
    }

    try {
      const nextAsset = await loadLogoAsset(nextFile);
      const nextZoom = getLogoCoverZoom(nextAsset);

      setDraftAsset((currentAsset) => {
        if (currentAsset) {
          URL.revokeObjectURL(currentAsset.url);
        }

        return nextAsset;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(nextZoom);
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
      const croppedFile = await createCroppedLogoFile(
        draftAsset.file,
        draftAsset.url,
        croppedAreaPixels,
      );

      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      inputRef.current.files = transfer.files;

      setPreviewUrl((currentPreviewUrlValue) => {
        if (currentPreviewUrlValue) {
          URL.revokeObjectURL(currentPreviewUrlValue);
        }

        return URL.createObjectURL(croppedFile);
      });
      onRemoveLogoChange(false);
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
          : "We couldn't crop that logo right now.",
      );
    } finally {
      setIsApplying(false);
    }
  }

  function resetCrop() {
    setCrop({ x: 0, y: 0 });
    setZoom(draftAsset ? getLogoCoverZoom(draftAsset) : 1);
  }

  function clearPendingLogo() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setPreviewUrl((currentPreviewUrlValue) => {
      if (currentPreviewUrlValue) {
        URL.revokeObjectURL(currentPreviewUrlValue);
      }

      return null;
    });
    setLocalError(null);
  }

  const canRemove = Boolean(previewUrl ?? currentPreviewUrl);

  function handleRemoveClick() {
    if (previewUrl) {
      clearPendingLogo();
      return;
    }

    if (showRemoveToggle) {
      onRemoveLogoChange(!removeLogo);
    }
  }

  return (
    <>
      <div className="flex items-start gap-4">
        <input
          ref={inputRef}
          accept={businessLogoAccept}
          className="sr-only"
          disabled={disabled}
          id="settings-logo"
          name="logo"
          onChange={handleLogoSelection}
          type="file"
        />
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {currentPreviewUrl ? (
            <Image
              alt={`${businessName} logo`}
              className="h-full w-full object-cover"
              height={64}
              src={currentPreviewUrl}
              unoptimized
              width={64}
            />
          ) : (
            <span aria-hidden="true" className="text-muted-foreground">
              <ImagePlus className="size-5" />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline" disabled={disabled}>
              <label
                htmlFor="settings-logo"
                className={
                  disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
                }
              >
                <Upload data-icon="inline-start" aria-hidden="true" />
                Upload
              </label>
            </Button>
            <Button
              aria-pressed={removeLogo}
              disabled={disabled || !canRemove}
              onClick={handleRemoveClick}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              {previewUrl ? "Clear" : removeLogo ? "Keep" : "Remove"}
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Square JPG, PNG, or WEBP logos up to 2MB.
          </p>
          {localError || fieldError ? (
            <p className="text-xs leading-5 text-destructive-ink">
              {localError || fieldError}
            </p>
          ) : null}
        </div>
      </div>

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
            <DialogTitle>Crop logo</DialogTitle>
            <DialogDescription>
              Drag to reposition. Scroll or pinch to zoom — your logo appears
              as a rounded square across Requo.
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
                  cropShape="rect"
                  image={draftAsset.url}
                  objectFit="contain"
                  onCropChange={setCrop}
                  onCropComplete={(_, areaPixels) =>
                    setCroppedAreaPixels(areaPixels)
                  }
                  onZoomChange={setZoom}
                  showGrid={false}
                  style={{
                    cropAreaStyle: {
                      borderRadius: "1.5rem",
                    },
                  }}
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
              <label className="sr-only" htmlFor="logo-crop-zoom">
                Zoom
              </label>
              <input
                aria-valuetext={`${Math.round(zoom * 100)} percent`}
                className="h-11 flex-1 accent-primary"
                id="logo-crop-zoom"
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
                  <span className="size-11 overflow-hidden rounded-lg border border-border/70 bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={draftAsset.url}
                    />
                  </span>
                  <span className="size-7 overflow-hidden rounded-lg border border-border/70 bg-muted opacity-80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={draftAsset.url}
                    />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {draftAsset.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {draftAsset.width} × {draftAsset.height} • Square preview
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
                "Use logo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
