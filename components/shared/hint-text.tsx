"use client";

import type { ReactNode, Ref } from "react";
import type { TextProps as AriaTextProps } from "react-aria-components";
import { Text as AriaText } from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Caption text rendered below a field. Wraps `react-aria-components`' Text
// so the parent `TextField` automatically wires `aria-describedby` (when
// `slot="description"`) or `aria-errormessage` (when `slot="errorMessage"`).
//
// Visuals:
//   - Inter Medium 12/16, letter-spacing 0.15px
//   - muted text color (default) or destructive (invalid)
//   - 1px top padding to align with the field's bottom edge

export interface HintTextProps extends AriaTextProps {
  children: ReactNode;
  isInvalid?: boolean;
  ref?: Ref<HTMLElement>;
}

// Boolean variant keeps the two text colors exclusive — the source's cx()
// resolved muted-vs-destructive last-wins; cva concatenates, so stacking both
// would leave the winner to stylesheet order instead.
const hintTextVariants = cva("pt-px text-caption-1-medium", {
  variants: {
    invalid: {
      true: "text-destructive-ink",
      false: "text-muted-foreground",
    },
  },
  defaultVariants: {
    invalid: false,
  },
});

export function HintText({
  isInvalid = false,
  className,
  ...props
}: HintTextProps) {
  return (
    <AriaText
      slot={isInvalid ? "errorMessage" : "description"}
      {...props}
      className={cn(hintTextVariants({ invalid: isInvalid }), className)}
    />
  );
}
