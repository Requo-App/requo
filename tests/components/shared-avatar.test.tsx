import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Avatar } from "@/components/shared/avatar";

function classesOf(text: string): string[] {
  const value = screen.getByText(text).getAttribute("class") ?? "";
  return value.split(/\s+/).filter(Boolean);
}

describe("Avatar keeps typography, color, and structure", () => {
  it("renders default variant with typography, color, and sizing", () => {
    render(<Avatar initials="ML" />);
    const classes = classesOf("ML");

    expect(classes).toContain("size-8");
    expect(classes).toContain("text-headline-semibold");
    expect(classes).toContain("bg-muted");
    expect(classes).toContain("text-muted-foreground");
    expect(classes).toContain("rounded-full");
  });

  it("keeps custom typography alongside a variant color", () => {
    render(
      <Avatar size="sm" color="blue" initials="ML" />,
    );
    const classes = classesOf("ML");

    expect(classes).toContain("text-caption-1-semibold");
    expect(classes).toContain("text-primary");
    expect(classes).toContain("bg-primary/10");
    expect(classes).toContain("size-6");
  });

  it("gives a bg-transparent override deterministic precedence", () => {
    render(
      <Avatar className="size-8 rounded-full border-0 bg-transparent" initials="ML" />,
    );
    const classes = classesOf("ML");

    expect(classes).toContain("bg-transparent");
    expect(classes).not.toContain("bg-muted");
    expect(classes).toContain("text-headline-semibold");
    expect(classes).toContain("text-muted-foreground");
  });

  it("gives a consumer text color deterministic precedence", () => {
    render(<Avatar className="text-destructive" initials="ML" />);
    const classes = classesOf("ML");

    expect(classes).toContain("text-headline-semibold");
    expect(classes).toContain("text-destructive");
    expect(classes).not.toContain("text-muted-foreground");
  });

  it("follows last-class-wins for a conflicting font size", () => {
    render(<Avatar className="text-sm" initials="ML" />);
    const classes = classesOf("ML");

    expect(classes).toContain("text-sm");
    expect(classes).not.toContain("text-headline-semibold");
    expect(classes).toContain("text-muted-foreground");
  });

  it("resolves size and shape overrides through the component API", () => {
    render(
      <Avatar size="lg" className="size-20 rounded-xl" initials="ML" />,
    );
    const classes = classesOf("ML");

    expect(classes).toContain("size-20");
    expect(classes).not.toContain("size-9");
    expect(classes).toContain("rounded-xl");
    expect(classes).not.toContain("rounded-full");
  });

  it("renders a photo instead of initials when src is given", () => {
    render(<Avatar src="/photo.jpg" alt="Morgan Lee" initials="ML" />);
    const image = screen.getByRole("img", { name: "Morgan Lee" });

    expect(image).toHaveAttribute("src", "/photo.jpg");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(screen.queryByText("ML")).toBeNull();
  });
});
