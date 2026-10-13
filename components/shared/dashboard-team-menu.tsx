"use client";

import { useSyncExternalStore, useState, type ComponentType, type ReactNode } from "react";
import {
  RiBankCardLine,
  RiBankLine,
  RiBox3Line,
  RiFolder6Line,
  RiGroupLine,
  RiLogoutBoxRLine,
  RiMessage2Line,
  RiNotification3Line,
  RiSchoolLine,
  RiShieldUserLine,
} from "@remixicon/react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/shared/avatar";
import { Badge } from "@/components/shared/badge";
import { ChevronDownSmall } from "@/components/shared/chevrons";

/**
 * Dropdown opened from the sidebar's "Board team" card. Floats to the right of
 * the sidebar: white panel, 1px border, radius 16, p 10, dropdown shadow.
 * Header (team avatar + name/email), three grouped sections of sidebar-style
 * rows separated by full-bleed dividers, and a "BoardUI" + version footer.
 * Rows mirror the sidebar nav item pattern (icon + label + optional counter)
 * but use the menu tokens (primary label, hover background + the selected row).
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

type MenuRow = {
  icon: IconComponent;
  label: string;
  badge?: string;
  isSelected?: boolean;
};

type MenuGroup = {
  id: string;
  label?: string;
  items: MenuRow[];
};

const GROUPS: MenuGroup[] = [
  {
    id: "workspace",
    items: [
      { icon: RiBankLine, label: "View team profile" },
      { icon: RiFolder6Line, label: "Folders" },
      { icon: RiMessage2Line, label: "Messages", badge: "94" },
      { icon: RiGroupLine, label: "People" },
    ],
  },
  {
    id: "company",
    label: "Company",
    items: [
      { icon: RiBankCardLine, label: "Billing" },
      { icon: RiSchoolLine, label: "Company Details" },
      { icon: RiBox3Line, label: "Integrations" },
    ],
  },
  {
    id: "personal",
    label: "Personal",
    items: [
      { icon: RiNotification3Line, label: "Notifications" },
      { icon: RiShieldUserLine, label: "Account Details" },
      { icon: RiLogoutBoxRLine, label: "Sign out" },
    ],
  },
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

const teamMenuItemVariants = cva(
  "flex w-full items-center gap-2.5 rounded-md p-2 outline-none transition-colors",
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

const teamMenuTriggerVariants = cva(
  "flex cursor-pointer items-center overflow-hidden outline-none border-2 border-transparent hover:border-sidebar-border transition-[width,background-color,border-color,padding] duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2",
  {
    variants: {
      collapsed: {
        true: "size-9 justify-start rounded-full bg-transparent p-0",
        false: "w-full justify-between rounded-xl bg-sidebar-accent py-2 pr-4 pl-2.5",
      },
    },
    defaultVariants: {
      collapsed: false,
    },
  },
);

const teamMenuPopoverVariants = cva(
  "w-[16.5625rem] max-w-[calc(100vw-2rem)] origin-bottom-left overflow-y-auto rounded-2xl border border-border bg-card p-2.5 shadow-[var(--overlay-surface-shadow)] transition duration-150 ease-out data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px] data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
  {
    variants: {},
  },
);

/** Label/chevron slot on the trigger: blurs + fades away as the rail collapses. */
function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span className={collapsibleVariants({ collapsed })}>
      {children}
    </span>
  );
}

function TeamMenuItem({ icon: Icon, label, badge, isSelected, onSelect }: MenuRow & { onSelect: () => void }) {
  return (
    <a
      href="#"
      aria-current={isSelected ? "page" : undefined}
      onClick={onSelect}
      className={teamMenuItemVariants({ selected: isSelected })}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-body-medium text-foreground">{label}</span>
      </span>
      {badge && (
        <Badge color="neutral">
          {badge}
        </Badge>
      )}
    </a>
  );
}

export function DashboardTeamMenu({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
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
        aria-label="Board team"
        className={cn(teamMenuTriggerVariants({ collapsed }), className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Avatar size="md" color="blue" src="/brand/boardui_logo_circle.webp" alt="Board team" />
          <Collapsible collapsed={collapsed}>
            <span className="flex min-w-0 flex-col items-start justify-center">
              <span className="text-body-medium whitespace-nowrap text-foreground">Board team</span>
              <span className="text-body-regular whitespace-nowrap text-muted-foreground">hi@boardui.com</span>
            </span>
          </Collapsible>
        </span>
        <Collapsible collapsed={collapsed}>
          <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-card">
            <ChevronDownSmall
              className={cn("size-4 text-muted-foreground transition-transform duration-200 ease", isOpen && "rotate-180")}
            />
          </span>
        </Collapsible>
      </AriaButton>

      <AriaPopover
        placement={isMobile ? "bottom start" : "right bottom"}
        offset={8}
        className={teamMenuPopoverVariants()}
      >
        <AriaDialog aria-label="Board team menu" className="flex flex-col gap-[0.4375rem] outline-none">
          {/* Header */}
          <div className="flex w-full items-center gap-2 px-2 pt-1">
            <Avatar size="md" color="blue" src="/brand/boardui_logo_circle.webp" alt="Board team" />
            <div className="flex min-w-0 flex-col items-start justify-center">
              <span className="text-body-medium whitespace-nowrap text-foreground">Board team</span>
              <span className="text-body-regular whitespace-nowrap text-muted-foreground">hi@boardui.com</span>
            </div>
          </div>

          {/* Grouped sidebar-style rows */}
          <div className="flex w-full flex-col">
            {GROUPS.map((group, index) => (
              <Group key={group.id} group={group} showDivider={index > 0} onSelect={() => setIsOpen(false)} />
            ))}
          </div>

          {/* Footer */}
          <div className="flex w-full items-center justify-between px-2 pt-1 pb-2">
            <span className="text-body-2-medium whitespace-nowrap text-muted-foreground">BoardUI</span>
            <span className="inline-flex items-center justify-center rounded-sm bg-muted px-1 py-px text-body-2-medium whitespace-nowrap text-muted-foreground">
              v1.0.1
            </span>
          </div>
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}

function Group({ group, showDivider, onSelect }: { group: MenuGroup; showDivider: boolean; onSelect: () => void }) {
  return (
    <>
      {showDivider && <div className="-mx-2.5 my-2.5 h-px bg-border" />}
      <div className={cn("flex w-full flex-col gap-1", group.label && "gap-1.5 pt-1")}>
        {group.label && (
          <span className="px-2 text-body-medium text-muted-foreground">{group.label}</span>
        )}
        <div className="flex w-full flex-col gap-1">
          {group.items.map((item) => (
            <TeamMenuItem key={item.label} {...item} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </>
  );
}
