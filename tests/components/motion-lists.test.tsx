import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useAnimatedList } from "@/hooks/use-animated-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => "/demo/inquiries",
}));

type Row = { id: string; label: string };

const INITIAL: Row[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

function ListHarness({ serverItems }: { serverItems: Row[] }) {
  const { items, getMotionState, getItemRef, removeItem, removeItems } =
    useAnimatedList(serverItems);
  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          ref={getItemRef(item.id)}
          data-testid={`row-${item.id}`}
          data-motion-state={getMotionState(item.id)}
        >
          {item.label}
          <button type="button" onClick={() => removeItem(item.id)}>
            remove-{item.id}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => removeItems(items.map((item) => item.id))}
      >
        remove-all
      </button>
    </div>
  );
}

// React 19 reverts an optimistic update when its transition finishes without
// a base-state change, so removal tests must simulate the server refresh
// (new serverItems, as router.refresh would deliver) to settle the list —
// mirroring production, where the Server Action + refresh always follow.
describe("useAnimatedList removal lifecycle", () => {
  it("plays the exit state before removing the row", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ListHarness serverItems={INITIAL} />);

    await user.click(screen.getByRole("button", { name: "remove-a" }));
    expect(screen.getByTestId("row-a").getAttribute("data-motion-state")).toBe(
      "exiting",
    );

    rerender(
      <ListHarness
        serverItems={INITIAL.filter((item) => item.id !== "a")}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("row-a")).toBeNull();
    });
    expect(screen.getByTestId("row-b")).toBeDefined();
    expect(screen.getByTestId("row-c")).toBeDefined();
  });

  it("handles two quick removals without cancelling either", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ListHarness serverItems={INITIAL} />);

    await user.click(screen.getByRole("button", { name: "remove-a" }));
    await user.click(screen.getByRole("button", { name: "remove-b" }));

    expect(screen.getByTestId("row-a").getAttribute("data-motion-state")).toBe(
      "exiting",
    );
    expect(screen.getByTestId("row-b").getAttribute("data-motion-state")).toBe(
      "exiting",
    );

    rerender(
      <ListHarness
        serverItems={INITIAL.filter((item) => item.id === "c")}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("row-a")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("row-b")).toBeNull();
    });
    expect(screen.getByTestId("row-c")).toBeDefined();
  });

  it("removes a bulk selection together", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ListHarness serverItems={INITIAL} />);

    await user.click(screen.getByRole("button", { name: "remove-all" }));

    for (const id of ["a", "b", "c"]) {
      expect(
        screen.getByTestId(`row-${id}`).getAttribute("data-motion-state"),
      ).toBe("exiting");
    }

    rerender(<ListHarness serverItems={[]} />);
    await waitFor(() => {
      expect(screen.queryByTestId("row-a")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("row-b")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("row-c")).toBeNull();
    });
  });

  it("does not animate ordinary server refreshes", async () => {
    const { rerender } = render(<ListHarness serverItems={INITIAL} />);

    rerender(
      <ListHarness
        serverItems={[
          { id: "a", label: "Alpha (updated)" },
          { id: "b", label: "Beta" },
          { id: "c", label: "Gamma" },
        ]}
      />,
    );

    for (const id of ["a", "b", "c"]) {
      expect(
        screen.getByTestId(`row-${id}`).getAttribute("data-motion-state"),
      ).toBeNull();
    }
    expect(screen.getByText("Alpha (updated)")).toBeDefined();
  });
});
