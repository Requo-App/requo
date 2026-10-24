import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

import { ScrollToTop } from "@/components/shared/scroll-to-top";

const scrollToMock = vi.fn();

describe("ScrollToTop", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    scrollToMock.mockReset();
    vi.stubGlobal("scrollTo", scrollToMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not scroll when the boundary mounts after the page is interactive", () => {
    usePathnameMock.mockReturnValue("/brightside-print-studio/home");

    render(<ScrollToTop />);

    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("scrolls to the top when the pathname changes", () => {
    usePathnameMock.mockReturnValue("/brightside-print-studio/home");
    const { rerender } = render(<ScrollToTop />);

    usePathnameMock.mockReturnValue("/brightside-print-studio/inquiries");
    rerender(<ScrollToTop />);

    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledWith({
      top: 0,
      behavior: "instant",
    });
  });
});
