"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import {
  overlayBodyClassName,
  overlayFooterClassName,
  overlayHeaderClassName,
} from "@/components/ui/overlay-layout"
import {
  useControllableOpenState,
  useOverlayPresence,
} from "@/components/ui/overlay-state"

type SheetStateContextValue = {
  open: boolean
  present: boolean
}

const SheetStateContext = React.createContext<SheetStateContextValue | null>(null)

function useSheetStateContext(componentName: string) {
  const context = React.useContext(SheetStateContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Sheet.`)
  }

  return context
}

function Sheet({
  defaultOpen = false,
  onOpenChange,
  open: openProp,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [open, setOpen] = useControllableOpenState({
    defaultOpen,
    onOpenChange,
    open: openProp,
  })
  const present = useOverlayPresence(open)
  const contextValue = React.useMemo(
    () => ({
      open,
      present,
    }),
    [open, present]
  )

  return (
    <SheetStateContext.Provider value={contextValue}>
      <SheetPrimitive.Root
        data-slot="sheet"
        defaultOpen={defaultOpen}
        onOpenChange={setOpen}
        open={open}
        {...props}
      />
    </SheetStateContext.Provider>
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { open, present } = useSheetStateContext("SheetOverlay")

  if (!present) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      data-state={open ? "open" : "closed"}
      data-slot="sheet-overlay"
      className={cn(
        "modal-backdrop modal-layer-overlay motion-overlay fixed inset-0 pointer-events-auto",
        !open && "pointer-events-none",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  overlayClassName,
  motionPreset = "default",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  overlayClassName?: string
  motionPreset?: "default" | "sidebar"
}) {
  const { open, present } = useSheetStateContext("SheetContent")
  const isClosing = !open && present
  const baseClasses =
    "overlay-surface modal-layer-content fixed flex max-h-[100dvh] flex-col gap-0 overflow-hidden border bg-clip-padding text-sm text-popover-foreground data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:max-h-[calc(100dvh-1rem)] data-[side=bottom]:rounded-t-xl data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-[92vw] data-[side=left]:max-w-[calc(100vw-0.75rem)] data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-[92vw] data-[side=right]:max-w-[calc(100vw-0.75rem)] data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:max-h-[calc(100dvh-1rem)] data-[side=top]:rounded-b-xl data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm"

  const motionClasses = "motion-sheet-panel transform-gpu"

  if (!present) {
    return null
  }

  return (
    <SheetPortal forceMount>
      <SheetOverlay
        className={cn(
          motionPreset === "sidebar" &&
            "supports-backdrop-filter:backdrop-blur-none",
          overlayClassName
        )}
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          baseClasses,
          motionClasses,
          isClosing && "pointer-events-none",
          className
        )}
        forceMount
        onInteractOutside={isClosing ? (e) => e.preventDefault() : props.onInteractOutside}
        onEscapeKeyDown={isClosing ? (e) => e.preventDefault() : props.onEscapeKeyDown}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3 sm:top-5 sm:right-5"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(overlayHeaderClassName, className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(overlayBodyClassName, className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(overlayFooterClassName, className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm leading-5 text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
