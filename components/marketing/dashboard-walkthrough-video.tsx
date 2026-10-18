"use client";

import { Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { MarketingDashboardPreview } from "@/components/marketing/marketing-dashboard-preview";
import { cn } from "@/lib/utils";

// Recorded on the seeded local demo (see scripts/marketing/record-landing-walkthrough.mjs).
const WALKTHROUGH_SRC = "/marketing/requo-walkthrough.webm";
const WALKTHROUGH_POSTER_SRC = "/marketing/requo-walkthrough-poster.png";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Fraction of the stage that must be visible before the loop plays. */
const IN_VIEW_THRESHOLD = 0.35;
/** The video element mounts (and buffers) this far outside the viewport. */
const MOUNT_ROOT_MARGIN = "320px";

/**
 * Hero walkthrough stage: the static dashboard recreation with the recorded
 * product walkthrough layered on top.
 *
 * Playback model:
 *
 * - The clip autoplays once the stage is in view on a capable client.
 * - It pauses by itself when the stage leaves the viewport or the tab is
 *   hidden, and picks back up when either returns — unless the visitor paused
 *   it by hand, which always wins.
 * - The single control is a play/pause disc that fades and scales in over the
 *   stage on hover (the Magic UI hover choreography, restyled with Requo
 *   tokens: the layer eases from 90% to 100%, the disc pops, the glyph
 *   nudges). Nothing else on the preview is clickable.
 *
 * Resource behavior — the preview is the hero's heaviest asset, so nothing
 * about it is unconditional:
 *
 * - Client capability and preferences come through `useSyncExternalStore`
 *   with static server snapshots, so the server render, the hydration render,
 *   and the first paint all agree on the static stage. Reduced motion, no
 *   JavaScript, and unsupported codecs keep it that way.
 * - The `<video>` element and its control mount only once the stage comes
 *   near the viewport, so layouts and scroll positions that never bring the
 *   art close do not pay for the clip at all.
 * - A hidden tab keeps muted videos decoding otherwise, so the loop is paused
 *   there too.
 */
export function DashboardWalkthroughVideo() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playable = useWalkthroughPlayable();
  const prefersReducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const motionAllowed = playable && !prefersReducedMotion;
  const [nearViewport, setNearViewport] = useState(false);
  const [inView, setInView] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;

    if (
      !stage ||
      !motionAllowed ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNearViewport(true);
          }

          setInView(entry.intersectionRatio >= IN_VIEW_THRESHOLD);
        }
      },
      {
        rootMargin: `${MOUNT_ROOT_MARGIN} 0px`,
        threshold: [0, IN_VIEW_THRESHOLD],
      },
    );

    observer.observe(stage);

    return () => observer.disconnect();
  }, [motionAllowed]);

  // Single playback gate: everything that should silence the loop lands here.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (motionAllowed && inView && pageVisible && !userPaused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [inView, motionAllowed, nearViewport, pageVisible, userPaused]);

  const handleTogglePlayback = useCallback(() => {
    setUserPaused(playing);
  }, [playing]);

  return (
    <div className="group/walkthrough relative h-full w-full" ref={stageRef}>
      {/*
        The recreation is a decorative mock: every control in it is drawn, not
        wired. `inert` keeps its fake buttons out of the tab order now that the
        stage carries a real one; the screen-reader description lives on the
        hero's `figcaption`.
      */}
      <div aria-hidden="true" inert>
        <MarketingDashboardPreview />
      </div>

      {motionAllowed && nearViewport ? (
        <>
          <video
            aria-hidden="true"
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500",
              canPlay ? "opacity-100" : "opacity-0",
            )}
            disablePictureInPicture
            disableRemotePlayback
            loop
            muted
            onCanPlay={() => setCanPlay(true)}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            playsInline
            poster={WALKTHROUGH_POSTER_SRC}
            preload="auto"
            ref={videoRef}
            src={WALKTHROUGH_SRC}
          />

          {/*
            Hover-revealed play/pause disc. The layer stays
            `pointer-events-none` so the preview itself is inert, and the
            control is dropped on coarse pointers, which have no hover to
            reveal it with.
          */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center pointer-coarse:hidden">
            <button
              aria-label={
                playing ? "Pause the walkthrough" : "Play the walkthrough"
              }
              className="pointer-events-auto flex scale-90 cursor-pointer items-center justify-center rounded-full opacity-0 outline-none transition-[opacity,transform,scale] duration-200 ease-out focus-visible:scale-100 focus-visible:opacity-100 group-hover/walkthrough:scale-100 group-hover/walkthrough:opacity-100"
              onClick={handleTogglePlayback}
              type="button"
            >
              <span
                aria-hidden="true"
                className="flex size-28 items-center justify-center rounded-full bg-background/10 backdrop-blur-md"
              >
                <span className="flex size-20 items-center justify-center rounded-full border border-background/25 bg-foreground/55 text-background shadow-md backdrop-blur-sm transition-transform duration-200 ease-out group-hover/walkthrough:scale-[1.15]">
                  {playing ? (
                    <Pause className="size-8 fill-current transition-transform duration-200 ease-out group-hover/walkthrough:scale-105" />
                  ) : (
                    <Play className="size-8 fill-current transition-transform duration-200 ease-out group-hover/walkthrough:scale-105" />
                  )}
                </span>
              </span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Whether this client can play the recorded walkthrough. The codec probe is
 * cached: it never changes for a given browser.
 */
function useWalkthroughPlayable() {
  return useSyncExternalStore(
    subscribeToNothing,
    canPlayWalkthrough,
    () => false,
  );
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false,
  );
}

function usePageVisible() {
  return useSyncExternalStore(
    subscribeToVisibilityChange,
    pageIsVisible,
    () => true,
  );
}

let canPlayWalkthroughCache: boolean | null = null;

function canPlayWalkthrough() {
  if (typeof document === "undefined") {
    return false;
  }

  canPlayWalkthroughCache ??=
    document.createElement("video").canPlayType('video/webm; codecs="vp9"') !==
    "";

  return canPlayWalkthroughCache;
}

function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function pageIsVisible() {
  return document.visibilityState === "visible";
}

function subscribeToNothing() {
  return () => {};
}

function subscribeToReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);

  media.addEventListener("change", onStoreChange);

  return () => media.removeEventListener("change", onStoreChange);
}

function subscribeToVisibilityChange(onStoreChange: () => void) {
  document.addEventListener("visibilitychange", onStoreChange);

  return () => document.removeEventListener("visibilitychange", onStoreChange);
}
