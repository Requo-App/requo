import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import {
  DetailHeaderFallback,
  DetailSectionFallback,
} from "@/components/shared/detail-section-fallback";
import {
  AdminDetailHeaderFallback,
  AdminDetailSectionFallback,
} from "@/features/admin/components/admin-detail-section-fallback";

function skeletons(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="skeleton"]'),
  );
}

describe("DetailSectionFallback", () => {
  it("renders the panel with a heading skeleton and three rows by default", () => {
    const { container } = render(<DetailSectionFallback />);

    const panel = container.firstElementChild;
    expect(panel?.className).toContain("section-panel");

    const [heading, ...rows] = skeletons(container);
    expect(heading.className).toContain("h-5");
    expect(heading.className).toContain("w-40");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.className).toContain("h-9");
      expect(row.className).toContain("w-full");
      expect(row.className).toContain("rounded-lg");
    }
  });

  it("respects a custom row count", () => {
    const { container } = render(<DetailSectionFallback rows={4} />);
    expect(skeletons(container)).toHaveLength(5);

    const { container: two } = render(<DetailSectionFallback rows={2} />);
    expect(skeletons(two)).toHaveLength(3);
  });
});

describe("DetailHeaderFallback", () => {
  it("renders the shared title and description widths by default", () => {
    const { container } = render(<DetailHeaderFallback />);

    expect(
      container.querySelector("header.dashboard-detail-header"),
    ).not.toBeNull();

    const [, title, description] = skeletons(container);
    expect(title.className).toContain("max-w-xl");
    expect(title.className).toContain("sm:h-6");
    expect(description.className).toContain("max-w-2xl");
  });
});

describe("AdminDetailSectionFallback", () => {
  it("delegates to the shared section fallback instead of duplicating markup", () => {
    const { container: admin } = render(<AdminDetailSectionFallback />);
    const { container: shared } = render(<DetailSectionFallback />);

    expect(admin.innerHTML).toBe(shared.innerHTML);
  });

  it("forwards a custom row count to the shared fallback", () => {
    const { container: admin } = render(
      <AdminDetailSectionFallback rows={4} />,
    );
    const { container: shared } = render(<DetailSectionFallback rows={4} />);

    expect(admin.innerHTML).toBe(shared.innerHTML);
    expect(skeletons(admin)).toHaveLength(5);
  });
});

describe("AdminDetailHeaderFallback", () => {
  it("preserves the admin title and description widths on the shared structure", () => {
    const { container } = render(<AdminDetailHeaderFallback />);

    expect(
      container.querySelector("header.dashboard-detail-header"),
    ).not.toBeNull();

    const [, title, description] = skeletons(container);
    expect(title.className).toContain("h-8");
    expect(title.className).toContain("w-64");
    expect(title.className).toContain("rounded-lg");
    expect(description.className).toContain("w-48");
    expect(description.className).toContain("max-w-full");
  });

  it("keeps the shared header shell (eyebrow, pills, actions) unchanged", () => {
    const { container: admin } = render(<AdminDetailHeaderFallback />);
    const { container: shared } = render(<DetailHeaderFallback />);

    const adminSkeletons = skeletons(admin);
    const sharedSkeletons = skeletons(shared);

    // Same skeleton count: eyebrow + title + description + 2 pills + 2 actions.
    expect(adminSkeletons).toHaveLength(sharedSkeletons.length);

    // Eyebrow, pills, and actions are identical; only title/description differ.
    expect(adminSkeletons[0].className).toBe(sharedSkeletons[0].className);
    expect(adminSkeletons[3].className).toBe(sharedSkeletons[3].className);
    expect(adminSkeletons[4].className).toBe(sharedSkeletons[4].className);
    expect(adminSkeletons[5].className).toBe(sharedSkeletons[5].className);
    expect(adminSkeletons[6].className).toBe(sharedSkeletons[6].className);
  });
});
