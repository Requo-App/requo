import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { notFound } from "next/navigation";
import {
  Component,
  type ComponentProps,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RegionErrorBoundary,
  RegionErrorRetryButton,
} from "@/components/shared/region-error-boundary";

/**
 * The shared region boundary must stay a *region* boundary: it renders an
 * in-place failure for genuine errors, but lets Next's `notFound()` and
 * `redirect()` control flow reach the router, and it clears a stale failure
 * when the user navigates to another record.
 */

class OuterBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error) return <div>outer boundary caught</div>;
    return this.props.children;
  }
}

function Boom(): never {
  throw new Error("boom");
}

function Missing(): never {
  notFound();
}

function SometimesBoom({ fail }: { fail: boolean }) {
  if (fail) throw new Error("boom");
  return <div>record content</div>;
}

describe("RegionErrorBoundary", () => {
  beforeEach(() => {
    // React reports caught render errors to console.error; the assertions are
    // about the rendered tree, not the log.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the fallback for a genuine region error", () => {
    render(
      <RegionErrorBoundary fallback={<div>region failed</div>}>
        <Boom />
      </RegionErrorBoundary>,
    );

    expect(screen.getByText("region failed")).toBeInTheDocument();
  });

  it("rethrows notFound() instead of swallowing it", () => {
    render(
      <OuterBoundary>
        <RegionErrorBoundary fallback={<div>region failed</div>}>
          <Missing />
        </RegionErrorBoundary>
      </OuterBoundary>,
    );

    expect(screen.getByText("outer boundary caught")).toBeInTheDocument();
    expect(screen.queryByText("region failed")).not.toBeInTheDocument();
  });

  it("clears the error when the pathname changes", () => {
    const { rerender } = render(
      <PathnameContext.Provider value="/invoices/invoice-a">
        <RegionErrorBoundary fallback={<div>region failed</div>}>
          <SometimesBoom fail={true} />
        </RegionErrorBoundary>
      </PathnameContext.Provider>,
    );

    expect(screen.getByText("region failed")).toBeInTheDocument();

    rerender(
      <PathnameContext.Provider value="/invoices/invoice-b">
        <RegionErrorBoundary fallback={<div>region failed</div>}>
          <SometimesBoom fail={false} />
        </RegionErrorBoundary>
      </PathnameContext.Provider>,
    );

    expect(screen.getByText("record content")).toBeInTheDocument();
    expect(screen.queryByText("region failed")).not.toBeInTheDocument();
  });

  it("wires the retry button to the router refresh", () => {
    const refresh = vi.fn();

    function Fallback() {
      return <RegionErrorRetryButton />;
    }

    render(
      <AppRouterContext.Provider
        value={{ refresh } as unknown as ComponentProps<
          typeof AppRouterContext.Provider
        >["value"]}
      >
        <RegionErrorBoundary fallback={<Fallback />}>
          <Boom />
        </RegionErrorBoundary>
      </AppRouterContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
