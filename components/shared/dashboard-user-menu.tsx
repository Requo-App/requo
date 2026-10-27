"use client";

import { useSyncExternalStore, useState, type ReactNode } from "react";
import { RiAddFill, RiEqualizer3Line } from "@remixicon/react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { cva } from "class-variance-authority";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/shared/button";
import { ChevronUpDownSmall } from "@/components/shared/chevrons";

/**
 * Dropdown opened from the sidebar's business switcher (avatar + name +
 * chevron) at the top. Floats to the right of the sidebar with the same panel
 * surface and appear animation as the team menu: white, 1px border, radius 16,
 * p 10, dropdown shadow. Lists the users with access (20px tinted-initial
 * avatars + name), a full-bleed divider, then "Add user" / "Manage" actions.
 */

type AvatarColor = "neutral" | "lime" | "pink";

type UserRow = {
  initials: string;
  color: AvatarColor;
  name: string;
  isSelected?: boolean;
};

const USERS: UserRow[] = [
  { initials: "M", color: "neutral", name: "Mertcan Esmergul" },
  { initials: "S", color: "lime", name: "Steven Raule" },
  { initials: "L", color: "pink", name: "Lauren Proso" },
];

const collapsibleVariants = cva(
  "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out",
  {
    variants: {
      collapsed: {
        true: "max-w-0 opacity-0 blur-[3px]",
        false: "max-w-40 opacity-100 blur-0",
      },
    },
    defaultVariants: {
      collapsed: false,
    },
  },
);

const userMenuItemVariants = cva(
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors",
  {
    variants: {
      selected: {
        true: "bg-accent",
        false: "hover:bg-accent focus-visible:bg-accent",
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

const userMenuTriggerVariants = cva(
  "relative flex min-w-0 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40 before:pointer-events-none before:absolute before:-inset-y-[0.3125rem] before:rounded-full before:border-2 before:border-transparent before:transition-colors before:duration-150",
  {
    variants: {
      hoverable: {
        true: "hover:before:border-border",
        false: "",
      },
      // `gap` and the pill's horizontal inset live in the branches (not the
      // base above) so only one of each ever reaches the DOM.
      collapsed: {
        true: "w-9 justify-center gap-0 before:-inset-x-[0.1875rem]",
        false: "gap-2 before:-inset-x-1.5",
      },
    },
    defaultVariants: {
      hoverable: true,
      collapsed: false,
    },
  },
);

const userMenuPopoverVariants = cva(
  "w-[16.5625rem] max-w-[calc(100vw-2rem)] origin-top-left overflow-y-auto rounded-2xl border border-[var(--overlay-surface-border)] bg-popover p-2.5 shadow-[var(--overlay-surface-shadow)] transition duration-150 ease-out data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px] data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
  {
    variants: {},
  },
);

/** Label slot on the trigger: blurs + fades away as the rail collapses. */
function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span className={collapsibleVariants({ collapsed })}>
      {children}
    </span>
  );
}

function UserMenuItem({ initials, color, name, isSelected, onSelect }: UserRow & { onSelect: () => void }) {
  return (
    <a
      href="#"
      aria-current={isSelected ? "page" : undefined}
      onClick={onSelect}
      className={userMenuItemVariants({ selected: isSelected })}
    >
      <Avatar size="xs" color={color} initials={initials} />
      <span className="truncate text-body-medium text-foreground">{name}</span>
    </a>
  );
}

/** The dropdown's contents — users-with-access list + Add user/Manage
 *  actions — split out so other triggers (e.g. the calendar template's
 *  inbox icon) can open the same panel without duplicating it. */
export function AccountMenuContent({ onSelect }: { onSelect: () => void }) {
  return (
    <>
      {/* Users with access */}
      <div className="flex w-full flex-col gap-1.5 pt-[0.3125rem]">
        <span className="px-2 text-body-medium text-muted-foreground">Users with access</span>
        <div className="flex w-full flex-col gap-1">
          {USERS.map((user) => (
            <UserMenuItem key={user.name} {...user} onSelect={onSelect} />
          ))}
        </div>
      </div>

      {/* Divider centered in the 28px gap between the list and the actions */}
      <div className="-mx-2.5 my-3.5 h-px bg-border" />

      {/* Actions — pb-2 makes the space below the buttons match their
          left/right inset (panel p-2.5 + row px-2 = 18px on every side). */}
      <div className="flex w-full items-center gap-3 px-2 pb-2">
        <Button variant="secondary" size="small" leadingIcon={RiAddFill} className="flex-1" onClick={onSelect}>
          Add user
        </Button>
        <Button
          variant="secondary"
          size="small"
          leadingIcon={RiEqualizer3Line}
          className="flex-1"
          onClick={onSelect}
        >
          Manage
        </Button>
      </div>
    </>
  );
}

export function DashboardUserMenu({
  collapsed = false,
  suppressHover = false,
  onHoverSuppressionEnd,
  avatarClassName,
}: {
  collapsed?: boolean;
  /** Prevents expansion from creating a hover state under a stationary pointer. */
  suppressHover?: boolean;
  /** Re-arms hover after the pointer fully leaves the trigger. */
  onHoverSuppressionEnd?: () => void;
  avatarClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // "right" placement assumes room to the sidebar's right (true in-flow on
  // desktop) — on mobile the sidebar can span the full viewport, so the
  // 265px panel would render off-screen. Below sm, drop into a plain
  // dropdown under the trigger instead.
  const isMobile = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    // Server snapshot: desktop layout, matching the pre-hydration default.
    () => false,
  );

  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <AriaButton
        aria-label="Mertcan Esmergul"
        onPointerLeave={() => {
          if (suppressHover) onHoverSuppressionEnd?.();
        }}
        // Collapsed, the trigger takes the rail's own 36px column and centres
        // the 32px avatar in it, instead of sizing to the avatar plus a gap
        // held open for a label that's shrunk to nothing. That gap made the
        // button 42px wide in a 36px rail, which pushed its hover pill
        // off-centre and into the rail's clip.
        //
        // The pill's insets go square too: 36×32 plus the expanded 6/5 reach
        // is a 48×42 stadium, not the circle the avatar wants. 3/5 lands it
        // on 42×42.
        className={userMenuTriggerVariants({ hoverable: !suppressHover, collapsed })}
      >
        <Avatar size="md" color="neutral" initials="M" className={avatarClassName} />
        <Collapsible collapsed={collapsed}>
          <span className="flex items-center gap-0.5">
            <span className="text-body-medium whitespace-nowrap text-foreground">Mertcan Esmergul</span>
            <ChevronUpDownSmall className="size-4 shrink-0 text-muted-foreground" />
          </span>
        </Collapsible>
      </AriaButton>

      <AriaPopover
        placement={isMobile ? "bottom start" : "right top"}
        offset={8}
        className={userMenuPopoverVariants()}
      >
        <AriaDialog aria-label="Account menu" className="flex flex-col outline-none">
          <AccountMenuContent onSelect={() => setIsOpen(false)} />
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
