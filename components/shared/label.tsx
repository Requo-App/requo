"use client";

import type { ReactNode, Ref } from "react";
import { RiInformationFill } from "@remixicon/react";
import type { LabelProps as AriaLabelProps } from "react-aria-components";
import { Label as AriaLabel } from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Field label. Wraps `react-aria-components`' Label so the parent `TextField`
// automatically wires `htmlFor` / `aria-labelledby`.
//
// Visuals:
//   - Inter Medium 14/20, primary text color
//   - 2px gap between label + required asterisk + info icon
//   - asterisk is destructive (red/500)
//   - info icon is 16×16, muted
//
// Pass `isRequired` to show the asterisk. Pass `tooltip` to show the info
// icon (currently a static glyph — when the Tooltip component lands it'll
// wire up here).

export interface LabelProps extends AriaLabelProps {
  children: ReactNode;
  isRequired?: boolean;
  /** Reserved for invalid-aware styling (asterisk color, etc.) once we need it. */
  isInvalid?: boolean;
  /** Show the info icon next to the label. */
  tooltip?: boolean | string;
  ref?: Ref<HTMLLabelElement>;
}

const labelVariants = cva("flex cursor-default items-center gap-0.5 text-body-medium text-foreground");

export function Label({
  isRequired = false,
  isInvalid: _isInvalid,
  tooltip,
  className,
  children,
  ...props
}: LabelProps) {
  void _isInvalid;
  return (
    <AriaLabel
      data-label="true"
      {...props}
      className={cn(labelVariants(), className)}
    >
      {children}
      {isRequired && (
        <span
          aria-hidden="true"
          className="text-body-medium text-destructive"
        >
          *
        </span>
      )}
      {tooltip && (
        <RiInformationFill
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </AriaLabel>
  );
}
