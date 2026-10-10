import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const scheduleRefreshMock = vi.fn();

vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => ({
    scheduleRefresh: scheduleRefreshMock,
    refreshNow: vi.fn(),
  }),
}));

vi.mock("@/components/shared/notify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "@/components/shared/notify";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";

describe("useOptimisticMutation", () => {
  beforeEach(() => {
    scheduleRefreshMock.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("applies optimistic state and schedules refresh on success", async () => {
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const mutation = vi.fn(async () => ({ success: "Saved" }));

    const { result } = renderHook(() => useOptimisticMutation());

    await act(async () => {
      result.current.runMutation({
        applyOptimistic,
        revertOptimistic,
        mutation,
      });
      await Promise.resolve();
    });

    expect(applyOptimistic).toHaveBeenCalledTimes(1);
    expect(revertOptimistic).not.toHaveBeenCalled();
    expect(scheduleRefreshMock).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Saved");
  });

  it("reverts optimistic state and shows an error toast on failure", async () => {
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const mutation = vi.fn(async () => ({ error: "Could not save" }));

    const { result } = renderHook(() => useOptimisticMutation());

    await act(async () => {
      result.current.runMutation({
        applyOptimistic,
        revertOptimistic,
        mutation,
        refreshOnSuccess: true,
      });
      await Promise.resolve();
    });

    expect(applyOptimistic).toHaveBeenCalledTimes(1);
    expect(revertOptimistic).toHaveBeenCalledTimes(1);
    expect(scheduleRefreshMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not save");
  });

  it("reverts optimistic state when affected count is zero", async () => {
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const mutation = vi.fn(async () => ({
      success: "0 quotes deleted.",
      affected: 0,
      skipped: 2,
    }));

    const { result } = renderHook(() => useOptimisticMutation());

    await act(async () => {
      result.current.runMutation({
        applyOptimistic,
        revertOptimistic,
        mutation,
      });
      await Promise.resolve();
    });

    expect(revertOptimistic).toHaveBeenCalledTimes(1);
    expect(scheduleRefreshMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
