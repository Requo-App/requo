import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CircleCheck } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
} from "@/components/shared/breadcrumb";
import { CloseButton } from "@/components/shared/close-button";
import {
  IconButton,
  IconLinkButton,
} from "@/components/shared/icon-button";

function classesOf(element: HTMLElement): string[] {
  const value = element.getAttribute("class") ?? "";
  return value.split(/\s+/).filter(Boolean);
}

describe("BreadcrumbItem branches keep typography alongside color", () => {
  it("current branch retains type style, color, and structure", () => {
    render(
      <Breadcrumb>
        <BreadcrumbItem current>Dashboard</BreadcrumbItem>
      </Breadcrumb>,
    );
    const item = screen.getByText("Dashboard");

    expect(item.tagName).toBe("LI");
    expect(item).toHaveAttribute("aria-current", "page");
    const classes = classesOf(item);
    expect(classes).toContain("text-caption-1-medium");
    expect(classes).toContain("text-foreground");
  });

  it("interactive branch retains type style with link semantics", () => {
    render(
      <Breadcrumb>
        <BreadcrumbItem href="/home">Home</BreadcrumbItem>
      </Breadcrumb>,
    );
    const item = screen.getByText("Home");

    expect(item.tagName).toBe("A");
    expect(item).toHaveAttribute("href", "/home");
    const classes = classesOf(item);
    expect(classes).toContain("text-caption-1-medium");
    expect(classes).toContain("text-muted-foreground");
  });

  it("interactive button branch keeps pointer affordance", () => {
    const onClick = () => {};
    render(
      <Breadcrumb>
        <BreadcrumbItem onClick={onClick}>Reports</BreadcrumbItem>
      </Breadcrumb>,
    );
    const item = screen.getByText("Reports");

    expect(item.tagName).toBe("BUTTON");
    const classes = classesOf(item);
    expect(classes).toContain("cursor-pointer");
    expect(classes).toContain("text-caption-1-medium");
    expect(classes).toContain("text-muted-foreground");
  });

  it("preserves unrelated consumer classes on the current branch", () => {
    render(
      <Breadcrumb>
        <BreadcrumbItem current className="mt-1">
          Dashboard
        </BreadcrumbItem>
      </Breadcrumb>,
    );
    const classes = classesOf(screen.getByText("Dashboard"));

    expect(classes).toContain("mt-1");
    expect(classes).toContain("text-caption-1-medium");
    expect(classes).toContain("text-foreground");
  });
});

describe("CloseButton keeps sizing, structure, and accessibility", () => {
  it("renders the required accessible name and glyph", () => {
    render(<CloseButton size="xs" aria-label="Dismiss" />);
    const button = screen.getByRole("button", { name: "Dismiss" });

    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelector("svg")).not.toBeNull();
    const classes = classesOf(button);
    expect(classes).toContain("size-5");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("bg-muted");
  });

  it("coexists with consumer classes", () => {
    render(<CloseButton size="xs" aria-label="Dismiss" className="ml-2" />);
    const classes = classesOf(screen.getByRole("button", { name: "Dismiss" }));

    expect(classes).toContain("ml-2");
    expect(classes).toContain("size-5");
  });
});

describe("IconButton keeps size classes and accessibility", () => {
  it("renders the button variant with icon and name", () => {
    render(<IconButton size="medium" icon={CircleCheck} aria-label="Add" />);
    const button = screen.getByRole("button", { name: "Add" });

    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelector("svg")).not.toBeNull();
    const classes = classesOf(button);
    expect(classes).toContain("size-9");
    expect(classes).toContain("bg-card");
    expect(classes).toContain("text-foreground");
  });

  it("renders the anchor variant with small sizing", () => {
    render(
      <IconLinkButton
        size="small"
        icon={CircleCheck}
        aria-label="Open"
        href="/home"
      />,
    );
    const link = screen.getByRole("link", { name: "Open" });
    const classes = classesOf(link);

    expect(classes).toContain("size-8");
    expect(classes).toContain("bg-card");
  });

  it("coexists with consumer classes", () => {
    render(
      <IconButton
        size="medium"
        icon={CircleCheck}
        aria-label="Add"
        className="ml-2"
      />,
    );
    const classes = classesOf(screen.getByRole("button", { name: "Add" }));

    expect(classes).toContain("ml-2");
    expect(classes).toContain("size-9");
  });
});
