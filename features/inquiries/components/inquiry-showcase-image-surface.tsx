"use client";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  InquiryPageShowcaseImageCrop,
  InquiryPageShowcaseImageFrame,
} from "@/features/inquiries/page-config";
import { cn } from "@/lib/utils";

type InquiryShowcaseImageSurfaceProps = {
  alt: string;
  className?: string;
  crop?: InquiryPageShowcaseImageCrop;
  frame: InquiryPageShowcaseImageFrame;
  overlay?: ReactNode;
  url: string;
};

export function InquiryShowcaseImageSurface({
  alt,
  className,
  crop,
  frame,
  overlay,
  url,
}: InquiryShowcaseImageSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [mediaSize, setMediaSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const node = viewportRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setViewportSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const image = new window.Image();

    image.onload = () => {
      if (isCancelled) {
        return;
      }

      setMediaSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.src = url;

    return () => {
      isCancelled = true;
    };
  }, [url]);

  const imageStyle =
    mediaSize && viewportSize
      ? getShowcaseImageStyle({
          crop,
          mediaHeight: mediaSize.height,
          mediaWidth: mediaSize.width,
          viewportHeight: viewportSize.height,
          viewportWidth: viewportSize.width,
        })
      : undefined;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-[inset_0_1px_0_var(--surface-highlight)]",
        className,
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-muted/20",
          getShowcaseImageFrameClass(frame),
        )}
        ref={viewportRef}
      >
        {mediaSize && imageStyle ? (
          <Image
            alt={alt}
            className="absolute max-w-none select-none object-cover"
            src={url}
            style={imageStyle}
            draggable={false}
            width={mediaSize.width}
            height={mediaSize.height}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-muted/20" />
        )}

        {overlay ? <div className="absolute inset-0">{overlay}</div> : null}
      </div>
    </div>
  );
}

export function readInquiryShowcaseImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      reject(new Error("We couldn't open that image."));
    };

    image.src = url;
  });
}

export function getShowcaseImageFrameClass(frame: InquiryPageShowcaseImageFrame) {
  switch (frame) {
    case "wide":
      return "aspect-[16/9]";
    case "square":
      return "aspect-square";
    case "portrait":
      return "aspect-[4/5]";
    case "landscape":
    default:
      return "aspect-[4/3]";
  }
}

function getShowcaseImageStyle({
  crop,
  mediaHeight,
  mediaWidth,
  viewportHeight,
  viewportWidth,
}: {
  crop?: InquiryPageShowcaseImageCrop;
  mediaHeight: number;
  mediaWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const mediaAspect = mediaWidth / mediaHeight;
  const viewportAspect = viewportWidth / viewportHeight;
  const zoom = crop?.zoom ?? 1;

  let width = viewportWidth;
  let height = viewportHeight;

  if (mediaAspect > viewportAspect) {
    height = viewportHeight;
    width = height * mediaAspect;
  } else {
    width = viewportWidth;
    height = width / mediaAspect;
  }

  const xOffset = (crop?.x ?? 0) * viewportWidth;
  const yOffset = (crop?.y ?? 0) * viewportHeight;

  return {
    height,
    left: (viewportWidth - width) / 2 + xOffset,
    top: (viewportHeight - height) / 2 + yOffset,
    transform: `scale(${zoom})`,
    transformOrigin: "center center",
    width,
  } satisfies CSSProperties;
}
