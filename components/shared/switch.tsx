"use client";

import type { ReactNode, Ref } from "react";
import { Switch as AriaSwitch } from "react-aria-components";
import type { SwitchProps as AriaSwitchProps } from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Two shapes × three sizes, plus off / on:
//   shape   pill        ("fully rounded") — track & thumb rounded-full
//           rectangle   — track radius/md-scale, thumb radius/xs-scale
//   size    sm 28×16 · md 42×24 · lg 56×32   (track w×h; thumb = h − 2·pad)
//
// Anatomy (all values 1:1 with the designs):
//   track   off → muted bg (no border)
//           on  → primary bg + an inset top highlight that scales with size.
//   thumb   theme-stable white gradient + contact shadow,
//           slides by (w − thumb − 2·pad) between states.
//
// The track visual lives in `SwitchTrack` so `Switch` and `SwitchCard` share it
// (mirrors how Checkbox / CheckboxCard share `CheckboxGlyph`). Built on
// react-aria Switch: native toggle semantics, keyboard support, focus-visible
// ring, optional label via `children`.

export type SwitchSize = "sm" | "md" | "lg";
export type SwitchShape = "pill" | "rectangle";

export const switchSizes = {
  sm: {
    track: "h-4 w-7",
    trackRadius: { pill: "rounded-full", rectangle: "rounded-[3px]" },
    onShadow: "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)]",
    thumb: "size-3",
    thumbRadius: { pill: "rounded-full", rectangle: "rounded-[1px]" },
    offset: "left-0.5 top-0.5",
    travel: "translate-x-3",
  },
  md: {
    track: "h-6 w-[42px]",
    trackRadius: { pill: "rounded-full", rectangle: "rounded-[4.5px]" },
    onShadow: "shadow-[inset_0_1.5px_0_0_rgb(255_255_255/0.25)]",
    thumb: "size-[18px]",
    thumbRadius: { pill: "rounded-full", rectangle: "rounded-[1.5px]" },
    offset: "left-[3px] top-[3px]",
    travel: "translate-x-[18px]",
  },
  lg: {
    track: "h-8 w-14",
    trackRadius: { pill: "rounded-full", rectangle: "rounded-md" },
    onShadow: "shadow-[inset_0_1.5px_0_0_rgb(255_255_255/0.25)]",
    thumb: "size-6",
    thumbRadius: { pill: "rounded-full", rectangle: "rounded-xs" },
    offset: "left-1 top-1",
    travel: "translate-x-6",
  },
};

export interface SwitchVisualState {
  isSelected: boolean;
  isDisabled: boolean;
  isFocusVisible: boolean;
}

/**
 * The track + thumb visual. Pure presentation — the react-aria Switch (in
 * `Switch` or `SwitchCard`) owns the input and passes its render state in.
 */
export function SwitchTrack({
  state,
  size = "md",
  shape = "pill",
}: {
  state: SwitchVisualState;
  size?: SwitchSize;
  shape?: SwitchShape;
}) {
  const s = switchSizes[size];

  return (
    <span
      aria-hidden
      // Plain join, not cn(): on/off colors are exclusive ternaries (the
      // source's cx() resolved them last-wins; cva concatenates, so stacking
      // both would leave the winner to stylesheet order instead).
      className={[
        "relative shrink-0 transition-colors duration-200 ease",
        s.track,
        s.trackRadius[shape],
        state.isSelected ? `bg-primary ${s.onShadow}` : "bg-muted",
        state.isDisabled ? "opacity-50" : "",
        state.isFocusVisible ? "ring-2 ring-ring ring-offset-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Thumb */}
      <span
        className={[
          "absolute",
          "bg-white",
          "shadow-[0_3px_3px_0_rgb(0_0_0/0.03),0_0.75px_0_0_rgb(0_0_0/0.05)]",
          "transition-transform duration-200 ease",
          s.thumb,
          s.thumbRadius[shape],
          s.offset,
          state.isSelected ? s.travel : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </span>
  );
}

export interface SwitchProps extends Omit<AriaSwitchProps, "children"> {
  children?: ReactNode;
  size?: SwitchSize;
  shape?: SwitchShape;
  ref?: Ref<HTMLLabelElement>;
}

const switchVariants = cva("group inline-flex items-center gap-2 select-none", {
  variants: {
    disabled: {
      true: "cursor-not-allowed",
      false: "cursor-pointer",
    },
  },
  defaultVariants: {
    disabled: false,
  },
});

export function Switch({ className, children, size = "md", shape = "pill", ref, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      ref={ref}
      {...props}
      className={(state) =>
        [
          switchVariants({ disabled: state.isDisabled }),
          cn(typeof className === "function" ? className(state) : className),
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      {(state) => (
        <>
          <SwitchTrack state={state} size={size} shape={shape} />
          {children != null && children !== false && (
            <span className="text-body-medium text-foreground">{children}</span>
          )}
        </>
      )}
    </AriaSwitch>
  );
}
