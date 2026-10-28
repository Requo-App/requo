/**
 * Shared visual recipe for menu surfaces.
 *
 * Select and Dropdown intentionally keep their distinct React Aria semantics
 * (single-value listbox vs. action menu), while consuming the same panel,
 * motion, and row treatments from here.
 */
export const MENU_POPOVER_SURFACE = [
  "motion-aria-popover max-w-[calc(100vw-32px)] overflow-y-auto",
  "rounded-2xl border border-[var(--overlay-surface-border)] bg-popover p-2.5 shadow-[var(--overlay-surface-shadow)]",
  "data-[placement=bottom]:origin-top-left data-[placement=top]:origin-bottom-left",
  "data-[placement=left]:origin-right data-[placement=right]:origin-left",
  "data-[placement=bottom]:data-[entering]:-translate-y-1 data-[placement=bottom]:data-[exiting]:-translate-y-1",
  "data-[placement=top]:data-[entering]:translate-y-1 data-[placement=top]:data-[exiting]:translate-y-1",
  "data-[placement=left]:data-[entering]:translate-x-1 data-[placement=left]:data-[exiting]:translate-x-1",
  "data-[placement=right]:data-[entering]:-translate-x-1 data-[placement=right]:data-[exiting]:-translate-x-1",
].join(" ");

export const MENU_POPOVER_WIDTH = "w-[266px]";

export const MENU_ITEMS_CONTAINER = "flex w-full flex-col gap-1 outline-none";

export const MENU_ITEM = [
  "motion-transition flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left",
  "text-foreground outline-none",
].join(" ");

export const MENU_ITEM_ACTIVE = "bg-accent";

export const MENU_ITEM_INTERACTIVE =
  "hover:bg-accent focus-visible:bg-accent";
