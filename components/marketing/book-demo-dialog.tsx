"use client";

import type { VariantProps } from "class-variance-authority";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/shared/notify";

import {
  requestDemo,
  type RequestDemoState,
} from "@/features/marketing/actions/request-demo";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const initialState: RequestDemoState = {};

/**
 * Self-contained "Book a demo" dialog trigger.
 *
 * The trigger button is always rendered here, inside this client component,
 * from serializable props only. Never `cloneElement` a caller-passed element:
 * `MarketingHero` is a server component, so a `<Button>` child would cross
 * the RSC boundary and render differently during SSR prerender versus client
 * hydration (empty button / mismatched classes on `/`, see issue #72).
 */

/** Label for the trigger button. Keep to plain text so SSR and hydration agree. */
type BookDemoDialogProps = {
  children?: ReactNode;
  size?: VariantProps<typeof buttonVariants>["size"];
  variant?: VariantProps<typeof buttonVariants>["variant"];
  className?: string;
};

export function BookDemoDialog({
  children = "Book a demo",
  size = "lg",
  variant = "outline",
  className,
}: BookDemoDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    requestDemo,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = useId();

  // Handle success / error feedback
  useEffect(() => {
    if (state.success) {
      toast.success("Request sent! We'll be in touch soon.");
    } else if (state.error && !state.fieldErrors) {
      toast.error(state.error);
    }
  }, [state]);

  // Close dialog on success after a brief delay
  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => setOpen(false), 1500);

      return () => clearTimeout(timer);
    }
  }, [state.success]);

  // Reset form when dialog reopens
  useEffect(() => {
    if (open) {
      formRef.current?.reset();
    }
  }, [open]);

  // Single render path: the trigger is this component's own `<Button>`,
  // driven by serializable props, so SSR prerender and hydration emit the
  // same `<button>` markup. No Radix Trigger/Slot and no cloning involved.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {children}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a demo</DialogTitle>
          <DialogDescription>
            Tell us a bit about your business and we&rsquo;ll reach out to
            schedule a walkthrough.
          </DialogDescription>
        </DialogHeader>

        {state.success ? (
          <DialogBody className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-10 text-primary" />
            <p className="text-sm font-medium text-foreground">
              We&rsquo;ve received your request!
            </p>
            <p className="text-xs text-muted-foreground">
              We&rsquo;ll get back to you shortly.
            </p>
          </DialogBody>
        ) : (
          <BookDemoForm
            formAction={formAction}
            formRef={formRef}
            idPrefix={idPrefix}
            isPending={isPending}
            onCancel={() => setOpen(false)}
            state={state}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BookDemoForm({
  formAction,
  formRef,
  idPrefix,
  isPending,
  onCancel,
  state,
}: {
  formAction: (formData: FormData) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
  idPrefix: string;
  isPending: boolean;
  onCancel: () => void;
  state: RequestDemoState;
}) {
  const nameId = `${idPrefix}-demo-name`;
  const emailId = `${idPrefix}-demo-email`;
  const messageId = `${idPrefix}-demo-message`;

  return (
    <form ref={formRef} action={formAction}>
      <DialogBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id={nameId}
            name="name"
            placeholder="Your name"
            required
            autoFocus
            aria-invalid={!!state.fieldErrors?.name}
          />
          {state.fieldErrors?.name?.[0] && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.name[0]}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={emailId}>
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            placeholder="you@company.com"
            required
            aria-invalid={!!state.fieldErrors?.email}
          />
          {state.fieldErrors?.email?.[0] && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={messageId}>
            Message <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={messageId}
            name="message"
            placeholder="Tell us about your business or what you'd like to see..."
            rows={3}
            aria-invalid={!!state.fieldErrors?.message}
          />
          {state.fieldErrors?.message?.[0] && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.message[0]}
            </p>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Spinner className="size-4" />
              Sending…
            </>
          ) : (
            "Send request"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
