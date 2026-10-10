import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Badge } from "@/components/shared/badge";
import { Chip } from "@/components/shared/chip";
import { HintText } from "@/components/shared/hint-text";
import { Label } from "@/components/shared/label";

function classesOf(text: string): string[] {
  return screen.getByText(text).className.split(/\s+/);
}

describe("shared typography components keep style alongside color", () => {
  it("Badge keeps its type style with the variant color", () => {
    render(<Badge color="primary">3</Badge>);
    const classes = classesOf("3");

    expect(classes).toContain("text-caption-1-semibold");
    expect(classes).toContain("text-primary-foreground");
    expect(classes).toContain("bg-primary");
  });

  it("Badge gives a consumer font-size override precedence", () => {
    render(
      <Badge color="primary" className="text-xs">
        3
      </Badge>,
    );
    const classes = classesOf("3");

    expect(classes).toContain("text-xs");
    expect(classes).not.toContain("text-caption-1-semibold");
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("text-primary-foreground");
  });

  it("Chip keeps its type style with the variant color", () => {
    render(
      <Chip variant="bold" color="lime">
        New
      </Chip>,
    );
    const classes = classesOf("New");

    expect(classes).toContain("text-body-medium");
    expect(classes).toContain("text-status-lime-text");
    expect(classes).toContain("bg-status-lime-background");
  });

  it("Chip gives a consumer color override precedence over the variant", () => {
    render(
      <Chip variant="bold" color="lime" className="text-red-500">
        New
      </Chip>,
    );
    const classes = classesOf("New");

    expect(classes).toContain("text-body-medium");
    expect(classes).toContain("text-red-500");
    expect(classes).not.toContain("text-status-lime-text");
  });

  it("Label keeps its type style with the default color", () => {
    render(<Label htmlFor="name">Name</Label>);
    const classes = classesOf("Name");

    expect(classes).toContain("text-body-medium");
    expect(classes).toContain("text-foreground");
  });

  it("Label gives a consumer color override precedence", () => {
    render(
      <Label htmlFor="name" className="text-destructive">
        Name
      </Label>,
    );
    const classes = classesOf("Name");

    expect(classes).toContain("text-body-medium");
    expect(classes).toContain("text-destructive");
    expect(classes).not.toContain("text-foreground");
  });

  it("HintText keeps its type style with the default and invalid colors", () => {
    const { unmount } = render(<HintText>Optional</HintText>);
    expect(classesOf("Optional")).toContain("text-caption-1-medium");
    expect(classesOf("Optional")).toContain("text-muted-foreground");
    unmount();

    render(<HintText isInvalid>Required</HintText>);
    const invalidClasses = classesOf("Required");
    expect(invalidClasses).toContain("text-caption-1-medium");
    expect(invalidClasses).toContain("text-destructive");
    expect(invalidClasses).not.toContain("text-muted-foreground");
  });

  it("HintText gives a consumer font-size override precedence", () => {
    render(<HintText className="text-sm">Optional</HintText>);
    const classes = classesOf("Optional");

    expect(classes).toContain("text-sm");
    expect(classes).not.toContain("text-caption-1-medium");
    expect(classes).toContain("text-muted-foreground");
  });
});
