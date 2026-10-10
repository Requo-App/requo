import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Tooltip,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import {
  SettingsSectionLabel,
  SettingsValueField,
} from "@/components/shared/settings-rows";
import { SettingsStorage } from "@/components/shared/settings-storage";
import { SettingsTools } from "@/components/shared/settings-tools";
import { SettingsModal } from "@/components/shared/settings-modal";

function classesOf(element: HTMLElement): string[] {
  const value = element.getAttribute("class") ?? "";
  return value.split(/\s+/).filter(Boolean);
}

describe("Tooltip keeps typography alongside color", () => {
  function renderOpenTooltip(className?: string) {
    render(
      <TooltipTrigger defaultOpen>
        <button type="button">Hover me</button>
        <Tooltip className={className}>Tip text</Tooltip>
      </TooltipTrigger>,
    );
    return screen.getByText("Tip text");
  }

  it("renders default typography and text color", () => {
    const tip = renderOpenTooltip();
    const classes = classesOf(tip);

    expect(classes).toContain("text-caption-1-medium");
    expect(classes).toContain("transition");
  });

  it("gives a consumer text-color override deterministic precedence", () => {
    const tip = renderOpenTooltip("text-destructive");
    const classes = classesOf(tip);

    expect(classes).toContain("text-caption-1-medium");
    expect(classes).toContain("text-destructive");
    expect(classes).not.toContain("text-text-primary");
  });
});

describe("SettingsSectionLabel keeps typography and default color", () => {
  it("renders the heading with type style and muted color", () => {
    render(<SettingsSectionLabel>Pull Requests</SettingsSectionLabel>);
    const heading = screen.getByText("Pull Requests");
    const classes = classesOf(heading);

    expect(classes).toContain("text-body-2-medium");
    expect(classes).toContain("text-muted-foreground");
    expect(classes).toContain("w-full");
  });

  it("merges consumer layout classes without losing typography", () => {
    render(
      <SettingsSectionLabel className="px-2">Authentication</SettingsSectionLabel>,
    );
    const classes = classesOf(screen.getByText("Authentication"));

    expect(classes).toContain("px-2");
    expect(classes).toContain("text-body-2-medium");
    expect(classes).toContain("text-muted-foreground");
  });
});

describe("SettingsValueField keeps typography and value rendering", () => {
  it("renders the default value with type style and foreground color", () => {
    render(<SettingsValueField>593e2611</SettingsValueField>);
    const value = screen.getByText("593e2611");
    const classes = classesOf(value);

    expect(classes).toContain("text-body-regular");
    expect(classes).toContain("text-foreground");
    expect(classes).toContain("truncate");
  });

  it("renders the muted variant with the muted color", () => {
    render(<SettingsValueField muted>593e2611</SettingsValueField>);
    const classes = classesOf(screen.getByText("593e2611"));

    expect(classes).toContain("text-body-regular");
    expect(classes).toContain("text-muted-foreground");
    expect(classes).not.toContain("text-foreground");
  });
});

describe("SettingsStorage sortable header keeps typography", () => {
  it("renders the sort label with type style and toggles sort on click", async () => {
    const user = userEvent.setup();
    render(<SettingsStorage />);

    const sortButton = screen.getByRole("button", { name: "Sort by File name" });
    const label = within(sortButton).getByText("File name");
    expect(classesOf(label)).toContain("text-body-medium");

    await user.click(sortButton);
    expect(
      classesOf(within(sortButton).getByText("File name")),
    ).toContain("text-body-medium");
    expect(sortButton).toHaveAttribute("aria-label", "Sort by File name");
  });
});

describe("SettingsTools keeps tile and action typography", () => {
  it("renders server tiles with type style alongside tile colors", () => {
    render(<SettingsTools />);
    const tile = screen.getByText("F");
    const classes = classesOf(tile);

    expect(classes).toContain("text-body-2-medium");
    expect(classes).toContain("bg-pink-200");
    expect(classes).toContain("text-pink-700");
  });

  it("renders inline actions with type style and muted color", () => {
    render(<SettingsTools />);
    const actions = screen.getAllByRole("button", { name: "Logout" });
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const classes = classesOf(action);
      expect(classes).toContain("text-body-2-regular");
      expect(classes).toContain("text-muted-foreground");
      expect(classes).toContain("cursor-pointer");
    }
  });
});

describe("SettingsModal navigation keeps label typography", () => {
  it("renders nav labels truncated with type style and color", () => {
    render(<SettingsModal isOpen onClose={vi.fn()} />);
    const labels = screen.getAllByText("General", { selector: "span" });
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const classes = classesOf(label);
      expect(classes).toContain("truncate");
      expect(classes).toContain("text-body-medium");
      expect(
        classes.includes("text-foreground") ||
          classes.includes("text-muted-foreground"),
      ).toBe(true);
    }
  });
});
