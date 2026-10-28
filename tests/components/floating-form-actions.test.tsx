import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingFormActions } from "@/components/shared/floating-form-actions";

describe("FloatingFormActions", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(["hidden", "closed"])(
    "makes every action inert when %s and preserves the submit restriction",
    (closingState) => {
      const props = {
        visible: true,
        state: "open" as const,
        isPending: false,
        disableSubmit: true,
        onCancel: vi.fn(),
        extraAction: <button type="button">Extra action</button>,
      };
      const { rerender } = render(<FloatingFormActions {...props} />);
      const save = screen.getByRole("button", { name: "Save changes" });
      const cancel = screen.getByRole("button", { name: "Cancel" });
      const extra = screen.getByRole("button", { name: "Extra action" });
      expect(save).toBeDisabled();
      expect(cancel.closest("[inert]")).toBeNull();

      rerender(
        <FloatingFormActions
          {...props}
          visible={closingState !== "hidden"}
          state={closingState === "closed" ? "closed" : "open"}
        />,
      );

      expect(save).toBeDisabled();
      for (const action of [save, cancel, extra]) {
        expect(action.closest("[inert]")).toHaveAttribute("data-state", "closed");
      }
      if (closingState === "hidden") {
        act(() => vi.advanceTimersByTime(199));
        expect(save).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1));
        expect(save).not.toBeInTheDocument();
      }
    },
  );
});
