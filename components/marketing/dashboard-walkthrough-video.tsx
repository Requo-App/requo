"use client";

import { Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useIsDarkTheme } from "@/hooks/use-is-dark-theme";
import { usePageVisible } from "@/hooks/use-page-visible";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

// Recorded on the seeded local demo (see scripts/marketing/record-landing-walkthrough.mjs).
const WALKTHROUGH_MEDIA = {
  light: {
    src: "/marketing/requo-walkthrough-light.webm",
    poster: "/marketing/requo-walkthrough-light-poster.png",
  },
  dark: {
    src: "/marketing/requo-walkthrough-dark.webm",
    poster: "/marketing/requo-walkthrough-dark-poster.png",
  },
} as const;

type WalkthroughTheme = keyof typeof WALKTHROUGH_MEDIA;

/** Fraction of the stage that must be visible before the loop plays. */
const IN_VIEW_THRESHOLD = 0.35;
/** The video element mounts (and buffers) this far outside the viewport. */
const MOUNT_ROOT_MARGIN = "320px";

/**
 * Hero walkthrough stage: the recorded product walkthrough over its matching
 * poster still.
 *
 * Playback model:
 *
 * - The matching clip autoplays once the stage is in view on a capable
 *   client.
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
 *   and the first paint all agree on the poster still. Reduced motion, no
 *   JavaScript, and unsupported codecs keep it that way.
 * - Each theme plays its own recording and poster, so the video always
 *   matches the page surface it sits on. Once the video mounts, its poster
 *   covers the still immediately; a theme switch swaps both at the same time
 *   instead of flashing the old take.
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
  const isDarkTheme = useIsDarkTheme();
  const pageVisible = usePageVisible();
  const walkthroughTheme: WalkthroughTheme = isDarkTheme ? "dark" : "light";
  const media = WALKTHROUGH_MEDIA[walkthroughTheme];
  const motionAllowed = playable && !prefersReducedMotion;
  const [nearViewport, setNearViewport] = useState(false);
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [previousMotionAllowed, setPreviousMotionAllowed] =
    useState(motionAllowed);
  const [previousWalkthroughTheme, setPreviousWalkthroughTheme] =
    useState(walkthroughTheme);

  // The motion preference can close the gate while the stage is still
  // mounted. Clear the per-video state during the transition so opening it
  // again starts from the observer's fresh measurement instead of a stale
  // in-view/playing pair. Adjusting state during render is the supported
  // pattern for deriving state from a changed input.
  if (previousMotionAllowed !== motionAllowed) {
    setPreviousMotionAllowed(motionAllowed);

    if (!motionAllowed) {
      setNearViewport(false);
      setInView(false);
      setPlaying(false);
    }
  }

  // A theme switch swaps the source. Reset the playback flag while the new
  // element loads; a manual pause is the visitor's choice and survives the
  // swap. The video keeps its themed poster on screen throughout, so the old
  // recording never shows through.
  if (previousWalkthroughTheme !== walkthroughTheme) {
    setPreviousWalkthroughTheme(walkthroughTheme);
    setPlaying(false);
  }

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage || !motionAllowed || typeof IntersectionObserver === "undefined") {
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
  }, [
    inView,
    motionAllowed,
    nearViewport,
    pageVisible,
    userPaused,
    walkthroughTheme,
  ]);

  const handleTogglePlayback = useCallback(() => {
    setUserPaused(playing);
  }, [playing]);

  return (
    <div className="group/walkthrough relative h-full w-full" ref={stageRef}>
      {/*
        The exact first frame of each theme's recording. The theme bootstrap
        writes the `dark` class before paint, so CSS picks the matching poster
        on the first frame — no hydration round trip and no stale recreation
        flashing through. It is also the still image for no-JS and
        reduced-motion visitors, and the backdrop while the video buffers.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[url('/marketing/requo-walkthrough-light-poster.png')] bg-cover bg-top bg-no-repeat dark:bg-[url('/marketing/requo-walkthrough-dark-poster.png')]"
      />

      {motionAllowed && nearViewport ? (
        <>
          <video
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-top"
            disablePictureInPicture
            disableRemotePlayback
            key={walkthroughTheme}
            loop
            muted
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            playsInline
            poster={media.poster}
            preload="auto"
            ref={videoRef}
            src={media.src}
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
              className="pointer-events-auto flex scale-90 cursor-pointer items-center justify-center rounded-full opacity-0 outline-none transition-[opacity,transform,scale] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] focus-visible:scale-100 focus-visible:opacity-100 group-hover/walkthrough:scale-100 group-hover/walkthrough:opacity-100"
              onClick={handleTogglePlayback}
              type="button"
            >
              <span
                aria-hidden="true"
                className="flex size-28 items-center justify-center rounded-full bg-background/10 backdrop-blur-md"
              >
                <span className="flex size-20 items-center justify-center rounded-full border border-background/25 bg-foreground/55 text-background shadow-md backdrop-blur-sm transition-transform [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] group-hover/walkthrough:scale-[1.15]">
                  {playing ? (
                    <Pause className="size-8 fill-current transition-transform [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] group-hover/walkthrough:scale-105" />
                  ) : (
                    <Play className="size-8 fill-current transition-transform [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] group-hover/walkthrough:scale-105" />
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

function subscribeToNothing() {
  return () => {};
}
