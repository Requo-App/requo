"use client";

import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  Group as AriaGroup,
  Input as AriaInput,
  TextField as AriaTextField,
} from "react-aria-components";
import type {
  InputProps as AriaInputProps,
  TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Label } from "@/components/shared/label";
import { HintText } from "@/components/shared/hint-text";

/**
 * Input — the styled field shell plus its label/hint composition.
 *
 * Architecture (mirrors the Untitled UI / React Aria pattern):
 *
 *   InputBase   — the styled field shell. Renders <AriaGroup> + adornments
 *                 + <AriaInput>. State (hover / focus / disabled / invalid)
 *                 arrives as render-prop booleans from Aria.
 *   TextField   — wraps <AriaTextField> and a TextFieldContext so size /
 *                 classes can flow from the composer down into InputBase
 *                 without prop drilling.
 *   Input       — opinionated composition: TextField → Label → InputBase
 *                 → HintText. The component most consumers use.
 *
 * Why React Aria:
 *   - Label ↔ input ↔ hint association via aria-labelledby / aria-describedby
 *   - aria-required, aria-invalid auto-applied
 *   - Form library / native validation integration
 *   - i18n, RTL, autofill edge cases handled
 *   - Render-prop state surfaces `isFocusWithin`, `isHovered`, `isDisabled`,
 *     `isInvalid`, `isRequired` — no CSS pseudo gymnastics
 *
 * Visuals stay 1:1 with the original — see `app/globals.css` for the tokens.
 */

export type InputSize = "medium" | "small";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/* -------------------------------------------------------------------------- */
/*  TextFieldContext                                                           */
/* -------------------------------------------------------------------------- */

export interface TextFieldContextValue {
  size?: InputSize;
  fieldClassName?: string;
  inputClassName?: string;
}

/**
 * Shared by every field that wants Input's shell — `Textarea` reads the same
 * size and class overrides out of it, so a composed form stays consistent.
 */
export const TextFieldContext = createContext<TextFieldContextValue>({});

/* -------------------------------------------------------------------------- */
/*  TextField                                                                  */
/* -------------------------------------------------------------------------- */

export interface TextFieldProps
  extends Omit<AriaTextFieldProps, "className">,
    TextFieldContextValue {
  className?: string;
  children?: ReactNode | ((state: { isRequired: boolean; isInvalid: boolean; isDisabled: boolean; isReadOnly: boolean }) => ReactNode);
}

export function TextField({
  size = "medium",
  fieldClassName,
  inputClassName,
  className,
  children,
  ...props
}: TextFieldProps) {
  return (
    <TextFieldContext.Provider value={{ size, fieldClassName, inputClassName }}>
      <AriaTextField
        {...props}
        data-input-size={size}
        className={cn(
          "group flex h-max w-full flex-col items-start gap-1",
          className,
        )}
      >
        {children as never /* RAC accepts render-prop children */}
      </AriaTextField>
    </TextFieldContext.Provider>
  );
}

TextField.displayName = "TextField";

/* -------------------------------------------------------------------------- */
/*  InputBase                                                                  */
/* -------------------------------------------------------------------------- */

export interface InputBaseProps extends Omit<AriaInputProps, "size" | "className"> {
  size?: InputSize;
  className?: string;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  /** Custom element rendered in the leading slot (Phone basic uses this). */
  leadingAddon?: ReactNode;
  /** Class for the field shell. */
  fieldClassName?: string;
  /** Ref to the <input> element. */
  ref?: Ref<HTMLInputElement>;
  /** Ref to the field shell wrapper. */
  groupRef?: Ref<HTMLDivElement>;
}

const inputFieldVariants = cva(
  [
    "relative flex w-full items-center",
    "rounded-md",
    "bg-muted text-muted-foreground",
    "ring-2 ring-inset ring-transparent",
    "transition-[background-color,box-shadow,color] duration-[var(--input-transition-ms)] ease",
  ].join(" "),
  {
    variants: {
      // medium: 8px all sides → h auto = 36. small: 32 / 6 / 8.
      // The `-addon` keys are the tightened-left-padding shell used when a
      // leadingAddon is present (Phone basic): medium 36 / 4 / 8 / 8.
      size: {
        medium: "p-2",
        small: "h-8 px-1.5 py-2",
        "medium-addon": "h-9 pl-1 pr-2 py-2",
        "small-addon": "h-8 pl-1 pr-1.5 py-2",
      },
    },
    defaultVariants: {
      size: "medium",
    },
  },
);

const inputContentClassName = "flex w-full items-center gap-2 min-w-0";
const inputLeftSectionClassName = "flex flex-1 items-center gap-0.5 min-w-0";

const inputElementClassName = [
  "min-w-0 flex-1 bg-transparent border-0 outline-none p-0 m-0",
  "font-sans text-body-regular text-foreground pl-1",
  "placeholder:text-muted-foreground",
  "focus:placeholder:text-muted-foreground",
  "disabled:text-muted-foreground disabled:placeholder:text-muted-foreground/70",
  "disabled:cursor-not-allowed",
  "aria-invalid:placeholder:text-destructive-ink",
].join(" ");

const inputIconClassName = "size-5 shrink-0";

export function InputBase({
  size: sizeProp,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  leadingAddon,
  fieldClassName,
  className,
  ref,
  groupRef,
  ...inputProps
}: InputBaseProps) {
  const ctx = useContext(TextFieldContext);
  const size: InputSize = sizeProp ?? ctx.size ?? "medium";
  const hasAddon = leadingAddon !== undefined && leadingAddon !== null;

  return (
    <AriaGroup
      ref={groupRef}
      className={({ isFocusWithin, isHovered, isDisabled, isInvalid }) =>
        cn(
          inputFieldVariants({
            size: hasAddon
              ? (`${size}-addon` as "medium-addon" | "small-addon")
              : size,
          }),
          // Hover: idle, no focus, no disabled, no invalid
          isHovered &&
            !isFocusWithin &&
            !isDisabled &&
            !isInvalid &&
            "ring-border",
          // Focus wins over hover
          isFocusWithin &&
            !isDisabled &&
            !isInvalid &&
            "ring-ring",
          // Disabled
          isDisabled &&
            "bg-muted text-muted-foreground",
          // Invalid
          isInvalid && "bg-destructive/10 text-destructive-ink",
          ctx.fieldClassName,
          fieldClassName,
        )
      }
    >
      <div className={inputContentClassName}>
        <div className={inputLeftSectionClassName}>
          {hasAddon ? (
            leadingAddon
          ) : Leading ? (
            <Leading className={inputIconClassName} aria-hidden />
          ) : null}
          <AriaInput
            ref={ref}
            {...inputProps}
            className={cn(inputElementClassName, ctx.inputClassName, className)}
          />
        </div>
        {Trailing ? (
          <Trailing className={inputIconClassName} aria-hidden />
        ) : null}
      </div>
    </AriaGroup>
  );
}

InputBase.displayName = "InputBase";

/* -------------------------------------------------------------------------- */
/*  Input (composed)                                                           */
/* -------------------------------------------------------------------------- */

export interface InputProps
  extends Omit<TextFieldProps, "children">,
    Pick<
      InputBaseProps,
      | "leadingIcon"
      | "trailingIcon"
      | "leadingAddon"
      | "fieldClassName"
      | "groupRef"
      | "ref"
    > {
  label?: ReactNode;
  hint?: ReactNode;
  /** Show an info icon next to the label. Replace with tooltip when Tooltip lands. */
  tooltip?: boolean | string;
  placeholder?: string;
}

export function Input({
  label,
  hint,
  tooltip,
  placeholder,
  leadingIcon,
  trailingIcon,
  leadingAddon,
  fieldClassName,
  ref,
  groupRef,
  className,
  ...textFieldProps
}: InputProps) {
  return (
    <TextField
      {...textFieldProps}
      className={className}
      // Don't clobber an explicit aria-label; fall back to the placeholder
      // only for unlabelled fields that don't provide one.
      aria-label={
        textFieldProps["aria-label"] ??
        (!label && typeof placeholder === "string" ? placeholder : undefined)
      }
    >
      {({ isRequired, isInvalid }) => (
        <>
          {label && (
            <Label
              isRequired={isRequired}
              isInvalid={isInvalid}
              tooltip={tooltip}
            >
              {label}
            </Label>
          )}
          <InputBase
            ref={ref}
            groupRef={groupRef}
            placeholder={placeholder}
            leadingIcon={leadingIcon}
            trailingIcon={trailingIcon}
            leadingAddon={leadingAddon}
            fieldClassName={fieldClassName}
          />
          {hint && <HintText isInvalid={isInvalid}>{hint}</HintText>}
        </>
      )}
    </TextField>
  );
}

Input.displayName = "Input";
