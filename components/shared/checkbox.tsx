"use client";

import type { ReactNode, Ref } from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import type { CheckboxProps as AriaCheckboxProps } from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CheckboxGlyph } from "./checkbox-glyph";
import type { CheckboxSize } from "./checkbox-glyph";

// radius/sm (4px). Two sizes:
//   md  16×16, label Body 1/Medium (14)
//   sm  14×14, label Body 2/Medium (13)
//
// States:
//   default        card bg, 1px input border, xs shadow
//   hover          border darkens to muted
//   checked /      primary bg with the checkbox inner highlight, white 2px
//   indeterminate  rounded stroke glyph; on hover the bg lightens
//
// Built on react-aria Checkbox: keyboard toggling, aria-checked="mixed" for
// indeterminate, label association when `children` is passed.

export interface CheckboxProps extends Omit<AriaCheckboxProps, "children"> {
  children?: ReactNode;
  size?: CheckboxSize;
  ref?: Ref<HTMLLabelElement>;
}

const checkboxVariants = cva("group inline-flex items-center select-none", {
  variants: {
    size: {
      md: "gap-2",
      sm: "gap-1.5",
    },
    disabled: {
      true: "cursor-not-allowed",
      false: "cursor-pointer",
    },
  },
  defaultVariants: {
    size: "md",
    disabled: false,
  },
});

// Label text: single string (not cn-merged) so the text style survives next to
// the text color — stock tailwind-merge would drop one of them.
const checkboxLabelVariants = cva("", {
  variants: {
    size: {
      md: "text-body-medium text-foreground",
      sm: "text-body-2-medium text-foreground",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function Checkbox({ className, children, size = "md", ref, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      ref={ref}
      {...props}
      className={(state) =>
        [
          checkboxVariants({ size, disabled: state.isDisabled }),
          cn(typeof className === "function" ? className(state) : className),
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      {(state) => (
        <>
          <CheckboxGlyph state={state} size={size} />
          {children !== undefined && children !== null && (
            <span className={checkboxLabelVariants({ size })}>{children}</span>
          )}
        </>
      )}
    </AriaCheckbox>
  );
}
