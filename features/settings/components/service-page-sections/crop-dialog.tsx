"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import type {
  InquiryPageShowcaseImageCrop,
  InquiryPageShowcaseImageFrame,
} from "@/features/inquiries/page-config";

export type CropDialogProps = {
  isOpen: boolean;
  showcaseImageUrl: string;
  showcaseImageFrame: InquiryPageShowcaseImageFrame;
  showcaseImageCrop: InquiryPageShowcaseImageCrop;
  onClose: () => void;
  onApply: (crop: InquiryPageShowcaseImageCrop) => void;
};

export function CropDialog({
  isOpen,
  showcaseImageUrl,
  showcaseImageFrame,
  showcaseImageCrop,
  onClose,
  onApply,
}: CropDialogProps) {
  const [cropDraft, setCropDraft] = useState({ x: 0, y: 0 });
  const [cropZoomDraft, setCropZoomDraft] = useState(1);
  const [cropViewportSize, setCropViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const node = cropViewportRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setCropViewportSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);

    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !cropViewportSize) {
      return;
    }

    const nextCropDraft = {
      x: showcaseImageCrop.x * cropViewportSize.width,
      y: showcaseImageCrop.y * cropViewportSize.height,
    };
    const frame = window.requestAnimationFrame(() => {
      setCropDraft(nextCropDraft);
      setCropZoomDraft(showcaseImageCrop.zoom);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [cropViewportSize, isOpen, showcaseImageCrop]);

  function handleClose() {
    onClose();
    setCropViewportSize(null);
  }

  function handleApply() {
    const nextViewportWidth =
      cropViewportSize?.width ?? cropViewportRef.current?.clientWidth ?? 0;
    const nextViewportHeight =
      cropViewportSize?.height ?? cropViewportRef.current?.clientHeight ?? 0;

    if (nextViewportWidth <= 0 || nextViewportHeight <= 0) {
      setCropError("Wait a moment for the crop area to finish loading.");
      return;
    }

    onApply({
      x: cropDraft.x / nextViewportWidth,
      y: cropDraft.y / nextViewportHeight,
      zoom: cropZoomDraft,
    });
    setCropError(null);
    handleClose();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-5xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>
            Adjust the image inside the selected frame.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid min-h-0 flex-1 gap-6 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex flex-col gap-4">
            <div
              className="soft-panel relative min-h-[26rem] overflow-hidden bg-muted/25"
              ref={cropViewportRef}
            >
              {showcaseImageUrl.trim() ? (
                <Cropper
                  aspect={getCropAspectRatio(showcaseImageFrame)}
                  crop={cropDraft}
                  cropShape="rect"
                  image={showcaseImageUrl.trim()}
                  objectFit="cover"
                  onCropChange={setCropDraft}
                  onZoomChange={setCropZoomDraft}
                  showGrid={false}
                  zoom={cropZoomDraft}
                />
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground">Drag and zoom to fit.</p>
            {cropError ? (
              <FieldError errors={[{ message: cropError }]} />
            ) : null}
          </div>

          <div className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="showcase-image-crop-zoom">Zoom</FieldLabel>
                <FieldContent>
                    <input
                      className="h-8 w-full accent-primary"
                    id="showcase-image-crop-zoom"
                    max="4"
                    min="1"
                    onChange={(event) =>
                      setCropZoomDraft(Number(event.currentTarget.value))
                    }
                    step="0.01"
                    type="range"
                    value={cropZoomDraft}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="soft-panel text-sm shadow-none">
              <p className="font-medium text-foreground">Crop</p>
              <p className="mt-1 text-muted-foreground">
                Uses the frame selected above.
              </p>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button onClick={handleClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={handleApply} type="button">
              Crop
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getCropAspectRatio(frame: InquiryPageShowcaseImageFrame) {
  switch (frame) {
    case "wide":
      return 16 / 9;
    case "square":
      return 1;
    case "portrait":
      return 4 / 5;
    case "landscape":
    default:
      return 4 / 3;
  }
}
