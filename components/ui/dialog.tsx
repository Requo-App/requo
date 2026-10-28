"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  overlayBodyClassName,
  overlayFooterClassName,
  overlayHeaderClassName,
} from "@/components/ui/overlay-layout"
import {
  useControllableOpenState,
  useOverlayPresence,
} from "@/components/ui/overlay-state"

type DialogStateContextValue = {
  modal: boolean
  open: boolean
  present: boolean
}

const DialogStateContext = React.createContext<DialogStateContextValue | null>(
  null
)

function useDialogStateContext(componentName: string) {
  const context = React.useContext(DialogStateContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Dialog.`)
  }

  return context
}

function Dialog({
  defaultOpen = false,
  modal = true,
  onOpenChange,
  open: openProp,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [open, setOpen] = useControllableOpenState({
    defaultOpen,
    onOpenChange,
    open: openProp,
  })
  const present = useOverlayPresence(open)
  const contextValue = React.useMemo(
    () => ({
      modal,
      open,
      present,
    }),
    [modal, open, present]
  )

  return (
    <DialogStateContext.Provider value={contextValue}>
      <DialogPrimitive.Root
        data-slot="dialog"
        defaultOpen={defaultOpen}
        modal={modal}
        onOpenChange={setOpen}
        open={open}
        {...props}
      />
    </DialogStateContext.Provider>
  )
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { modal, open, present } = useDialogStateContext("DialogOverlay")

  if (!modal || !present) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      data-state={open ? "open" : "closed"}
      data-slot="dialog-overlay"
      className={cn(
        "modal-backdrop modal-layer-overlay motion-overlay fixed inset-0 pointer-events-auto",
        !open && "pointer-events-none",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  children,
  className,
  showCloseButton = true,
  overlayClassName,
  surface = "overlay",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  overlayClassName?: string
  /** Full-screen previews render the page itself, not a floating panel. */
  surface?: "overlay" | "page"
}) {
  const { open, present } = useDialogStateContext("DialogContent")
  const isClosing = !open && present

  if (!present) {
    return null
  }

  return (
    <DialogPortal forceMount>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "modal-layer-content motion-dialog-panel fixed bottom-2 left-1/2 top-auto flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl -translate-x-1/2 translate-y-0 flex-col overflow-y-auto rounded-xl border text-popover-foreground sm:bottom-auto sm:top-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:-translate-y-1/2 sm:overflow-hidden",
          surface === "overlay" && "overlay-surface",
          isClosing && "pointer-events-none",
          className
        )}
        forceMount
        onInteractOutside={isClosing ? (e) => e.preventDefault() : props.onInteractOutside}
        onEscapeKeyDown={isClosing ? (e) => e.preventDefault() : props.onEscapeKeyDown}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button className="absolute top-3 right-3 sm:top-5 sm:right-5" size="icon-sm" variant="ghost">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(overlayHeaderClassName, className)}
      data-slot="dialog-header"
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(overlayBodyClassName, className)}
      data-slot="dialog-body"
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(overlayFooterClassName, className)}
      data-slot="dialog-footer"
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-heading text-base font-semibold text-foreground", className)}
      data-slot="dialog-title"
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-5 text-muted-foreground", className)}
      data-slot="dialog-description"
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
