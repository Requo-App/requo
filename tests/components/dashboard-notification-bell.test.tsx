import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { channels, fakeSupabase, pendingRemovals } = vi.hoisted(() => {
  type FakeChannel = {
    joined: boolean;
    on: () => FakeChannel;
    subscribe: (callback?: (status: string) => void) => FakeChannel;
    topic: string;
  };

  const channels = new Map<string, FakeChannel>();
  const pendingRemovals: Array<() => void> = [];

  const fakeSupabase = {
    channel(topic: string) {
      const existing = channels.get(topic);

      if (existing) {
        return existing;
      }

      const channel: FakeChannel = {
        joined: false,
        topic,
        on() {
          // Mirrors @supabase/realtime-js: adding postgres_changes listeners to
          // a channel that is already subscribed throws.
          if (channel.joined) {
            throw new Error(
              `cannot add callbacks for ${topic} after subscribe()`,
            );
          }

          return channel;
        },
        subscribe(callback) {
          channel.joined = true;
          callback?.("SUBSCRIBED");
          return channel;
        },
      };

      channels.set(topic, channel);
      return channel;
    },
    realtime: {
      setAuth: async () => {},
    },
    removeChannel: (channel: FakeChannel) =>
      new Promise<string>((resolve) => {
        // Keep the channel registered until the test releases the removal,
        // reproducing the window where removeChannel() is still in flight.
        pendingRemovals.push(() => {
          channels.delete(channel.topic);
          resolve("ok");
        });
      }),
  };

  return { channels, fakeSupabase, pendingRemovals };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => fakeSupabase,
}));

vi.mock("@/features/notifications/actions", () => ({
  loadMoreBusinessNotificationsAction: vi.fn(),
  markBusinessNotificationReadAction: vi.fn(),
  markBusinessNotificationsReadAction: vi.fn(),
}));

const mobileState = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mobileState.isMobile,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { DashboardNotificationBell } from "@/features/notifications/components/dashboard-notification-bell";
import type { BusinessNotificationBellView } from "@/features/notifications/types";

const initialView: BusinessNotificationBellView = {
  items: [],
  unreadCount: 0,
  lastReadAt: null,
  hasMore: false,
};

function renderBell(view: BusinessNotificationBellView = initialView) {
  return render(
    <DashboardNotificationBell
      businessId="biz_1"
      businessSlug="acme"
      initialView={view}
      userId="user_1"
    />,
  );
}

beforeEach(() => {
  channels.clear();
  pendingRemovals.length = 0;
  mobileState.isMobile = false;

  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 0 });
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => ({
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        token: "realtime-token",
      }),
      ok: true,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();

  for (const release of pendingRemovals.splice(0)) {
    release();
  }
});

describe("DashboardNotificationBell realtime", () => {
  it("reconnects with fresh topics while an old channel removal is in flight", async () => {
    const firstRender = renderBell();

    await waitFor(() => expect(channels.size).toBe(3));
    const firstTopics = [...channels.keys()];

    // Unmount only the component. The fake client keeps its channels until
    // removeChannel() completes, which is the gap that previously made
    // channel(topic) return an already-subscribed channel.
    firstRender.unmount();

    renderBell();

    await waitFor(() => expect(channels.size).toBe(6));

    const newTopics = [...channels.keys()].filter(
      (topic) => !firstTopics.includes(topic),
    );
    expect(newTopics).toHaveLength(3);
  });
});

describe("DashboardNotificationBell mobile drawer", () => {
  it("uses one scroll container and drops hover-only timestamps", async () => {
    mobileState.isMobile = true;

    const user = userEvent.setup();
    renderBell({
      items: [
        {
          id: "notification_1",
          type: "public_inquiry_submitted",
          title: "New inquiry",
          summary: "A customer asked for a quote.",
          href: "/acme/inquiries/inq_1",
          createdAt: new Date().toISOString(),
          unread: true,
        },
      ],
      unreadCount: 1,
      lastReadAt: null,
      hasMore: false,
    });

    await user.click(
      screen.getByRole("button", { name: "1 unread notifications" }),
    );

    const sheetBody = document.querySelector('[data-slot="sheet-body"]');
    expect(sheetBody).toHaveClass("overflow-hidden");

    const scrollViewport = sheetBody?.querySelector(".overscroll-contain");
    expect(scrollViewport).toHaveClass("flex-1");
    expect(scrollViewport?.className).not.toContain("max-h-");

    // The desktop popover keeps the exact timestamp in a tooltip. Touch
    // devices cannot hover, so the mobile drawer must not mount one.
    expect(screen.getByText("Just now")).not.toHaveAttribute("data-state");
  });
});
