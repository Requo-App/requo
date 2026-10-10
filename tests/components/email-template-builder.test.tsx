import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const result = [...arr];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
  }),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const refreshMock = vi.fn();

vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => ({ scheduleRefresh: refreshMock }),
}));

import { BusinessEmailTemplateForm } from "@/features/settings/components/business-email-template-form";
import { defaultQuoteEmailTemplate } from "@/features/settings/email-templates";

function makeSettings() {
  return {
    id: "biz_1",
    businessId: "biz_1",
    businessSlug: "acme",
    plan: "business",
    name: "Acme",
    slug: "acme",
    recordState: "active",
    archivedAt: null,
    deletedAt: null,
    activeBusinessCount: 1,
    countryCode: "US",
    shortDescription: null,
    contactEmail: "hello@acme.test",
    logoStoragePath: null,
    logoContentType: null,
    defaultEmailSignature: null,
    defaultQuoteNotes: null,
    defaultQuoteTerms: null,
    quoteEmailTemplate: defaultQuoteEmailTemplate(),
    defaultQuoteValidityDays: 14,
    sendInquiryAckEmail: true,
    autoDraftQuoteOnQualify: true,
    autoArchiveStaleInquiries: true,
    autoArchiveStaleInquiryDays: 14,
    autoFollowUpOnQuoteViewed: false,
    quoteViewedFollowUpDelayDays: 3,
    notifyInAppOnNewInquiry: true,
    notifyInAppOnQuoteSent: true,
    notifyInAppOnQuoteResponse: true,
    notifyInAppOnMemberInviteResponse: true,
    notifyPushOnNewInquiry: false,
    notifyPushOnQuoteSent: false,
    notifyPushOnQuoteResponse: false,
    notifyPushOnMemberInviteResponse: false,
    notifyInAppOnFollowUpReminder: true,
    notifyInAppOnQuoteExpiring: true,
    defaultCurrency: "USD",
    aiAgentEnabled: false,
    aiAgentTone: "friendly",
    updatedAt: new Date("2026-01-01"),
  } as unknown as Parameters<typeof BusinessEmailTemplateForm>[0]["settings"];
}

function readBlocks(container: HTMLElement) {
  const input = container.querySelector(
    'input[name="blocks"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error("blocks hidden input not found");
  return JSON.parse(input.value) as Array<{
    id: string;
    type: string;
    content?: string;
    visible?: boolean;
    style?: Record<string, string>;
  }>;
}

async function addRepeatableViaEndMenu(
  user: ReturnType<typeof userEvent.setup>,
  typeName: "Text" | "Divider" | "Spacer",
) {
  await user.click(screen.getByRole("button", { name: "Add block" }));
  await user.click(screen.getByRole("button", { name: typeName }));
}

describe("email template builder (direct canvas)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderForm() {
    return render(
      <BusinessEmailTemplateForm action={vi.fn(async () => ({}))} settings={makeSettings()} />,
    );
  }

  it("renders all blocks directly inside a single email canvas with no separate preview", () => {
    const { container } = renderForm();
    expect(screen.queryByText("Start from:")).toBeNull();
    // Single editing surface.
    expect(
      screen.getByRole("region", { name: "Email canvas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Email content")).toBeInTheDocument();
    // No separate preview pane.
    expect(screen.queryByText("Live preview")).toBeNull();
    expect(
      container.querySelector('[aria-label="Live preview"]'),
    ).toBeNull();
    // Canvas shows the actual email with sample data.
    expect(screen.getByText("Hi Alex Rivera,")).toBeInTheDocument();
    expect(screen.getAllByText("Quote summary").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Review quote online")).toBeInTheDocument();
    expect(screen.getAllByText("$2,500.00").length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ["Edit Greeting block", "Greeting text", "Hello there,"],
    ["Edit Intro block", "Intro text", "A fresh intro line."],
    ["Edit Closing block", "Closing text", "Talk soon!"],
  ])("edits %s directly in the canvas", async (editName, fieldName, next) => {
    const user = userEvent.setup();
    renderForm();
    // Display mode shows resolved email text, not a form field.
    expect(screen.queryByLabelText(fieldName)).toBeNull();
    await user.click(screen.getByRole("button", { name: editName }));
    const box = screen.getByLabelText(fieldName) as HTMLTextAreaElement;
    await user.clear(box);
    await user.type(box, next);
    expect(box.value).toContain(next);
  });

  it("edits the CTA label directly in the canvas", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByLabelText("Button label")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit CTA block" }));
    const ctaInput = screen.getByLabelText("Button label") as HTMLInputElement;
    await user.clear(ctaInput);
    await user.type(ctaInput, "Open your quote");
    expect(ctaInput.value).toBe("Open your quote");
  });

  it("adds text, divider, and spacer blocks and never offers singletons", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    await addRepeatableViaEndMenu(user, "Text");
    expect(
      screen.getByRole("button", { name: "Delete Text block" }),
    ).toBeInTheDocument();

    await addRepeatableViaEndMenu(user, "Divider");
    expect(
      container.querySelector('[data-block-type="divider"]'),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Add block" }));
    expect(screen.queryByRole("button", { name: "Greeting" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CTA" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Spacer" }));
    expect(
      container.querySelector('[data-block-type="spacer"]'),
    ).not.toBeNull();
  });

  it("inserts a block at the hovered position between blocks", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    const gapButtons = screen.getAllByRole("button", {
      name: /Add block at position/,
    });
    expect(gapButtons.length).toBeGreaterThan(0);
    await user.click(gapButtons[0]);
    await user.click(screen.getByRole("button", { name: "Text" }));
    const blocks = readBlocks(container);
    expect(blocks).toHaveLength(10);
    expect(blocks[0]?.type).toBe("text");
  });

  it("deletes a repeatable block but not singletons", async () => {
    const user = userEvent.setup();
    renderForm();
    await addRepeatableViaEndMenu(user, "Text");
    const deleteButtons = screen.getAllByRole("button", { name: /Delete .* block/ });
    expect(deleteButtons.length).toBeGreaterThan(0);
    // Singleton blocks expose no delete button.
    expect(screen.queryByRole("button", { name: "Delete Greeting block" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete CTA block" })).toBeNull();
    await user.click(deleteButtons[0]);
    expect(screen.getByText(/of 20 blocks used/)).toBeInTheDocument();
  });

  it("hides a block but keeps it in the canvas", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    await user.click(screen.getByRole("button", { name: "Hide Intro block" }));
    expect(
      screen.getByRole("button", { name: "Show Intro block" }),
    ).toBeInTheDocument();
    // Hidden block stays in the editor, muted with a badge.
    expect(container.querySelector('[data-block-id="intro"]')).not.toBeNull();
    expect(screen.getByText("Hidden from email")).toBeInTheDocument();
  });

  it("updates alignment, spacing, and CTA colors visually", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    await user.click(screen.getByRole("button", { name: "Edit Greeting block" }));
    await user.click(screen.getByRole("button", { name: "Align: Center" }));
    expect(
      screen.getByRole("button", { name: "Align: Center" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Spacing: Compact" }));
    const greeting = readBlocks(container).find((block) => block.id === "greeting");
    expect(greeting?.style?.align).toBe("center");
    expect(greeting?.style?.spacing).toBe("compact");

    await user.click(screen.getByRole("button", { name: "Edit CTA block" }));
    const hex = screen.getByLabelText("Button color hex") as HTMLInputElement;
    await user.clear(hex);
    await user.type(hex, "#ff0000");
    const cta = readBlocks(container).find((block) => block.type === "cta");
    expect(cta?.style?.buttonColor).toBe("#ff0000");
  });

  it("inserts a merge tag into a text block", async () => {
    const user = userEvent.setup();
    renderForm();
    await addRepeatableViaEndMenu(user, "Text");
    // New text blocks open directly in editing mode.
    const textareas = screen.getAllByLabelText("Paragraph text");
    const target = textareas[textareas.length - 1] as HTMLTextAreaElement;
    await user.click(target);
    await user.click(screen.getByRole("button", { name: "Customer name" }));
    expect(target.value).toContain("{{customerName}}");
  });

  it("disables adding at the 20-block limit", async () => {
    const { AddBlock } = await import(
      "@/features/settings/components/email-template-builder/add-block"
    );
    const { unmount } = render(
      <AddBlock index={20} blockCount={20} variant="end" onInsert={vi.fn()} />,
    );
    expect(screen.getByText(/Block limit reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add block" })).toBeDisabled();
    unmount();

    // Adding a block updates the usage count.
    const user = userEvent.setup();
    renderForm();
    await addRepeatableViaEndMenu(user, "Text");
    expect(screen.getByText(/10 of 20 blocks used/)).toBeInTheDocument();
  });

  it("exposes drag handles with accessible labels and stable block ids", () => {
    const { container } = renderForm();
    const handles = screen.getAllByRole("button", { name: /Reorder .* block/ });
    expect(handles).toHaveLength(9);
    expect(
      screen.getByRole("button", { name: /Reorder Greeting block/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reorder CTA block/ }),
    ).toBeInTheDocument();
    const ids = readBlocks(container).map((block) => block.id);
    expect(ids).toContain("greeting");
    expect(ids).toContain("cta");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps CTA visible (no hide control enabled)", () => {
    renderForm();
    const canvas = screen.getByRole("region", { name: "Email canvas" });
    const hideCta = within(canvas).queryByRole("button", {
      name: "Hide CTA block",
    });
    // The CTA hide button exists for discoverability but stays disabled.
    expect(hideCta).not.toBeNull();
    expect(hideCta).toBeDisabled();
  });

  it("shows validation errors for subject and blocks", () => {
    render(
      <BusinessEmailTemplateForm
        action={vi.fn(async () => ({
          error: "Check the email template settings and try again.",
          fieldErrors: {
            subject: ["Enter a subject line."],
            blocks: ["The template needs exactly one call-to-action block."],
          },
        }))}
        settings={makeSettings()}
      />,
    );
    expect(screen.getByLabelText("Subject line")).toBeInTheDocument();
  });

  it("switches between quote, invoice, and follow-up templates", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByRole("tab", { name: /Quote email/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: /Invoice email/ }));
    expect(screen.getByRole("tab", { name: /Invoice email/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("{{invoiceNumber}}")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Quote follow-up/ }));
    expect(
      screen.getByRole("tab", { name: /Quote follow-up/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/View quote/)).toBeInTheDocument();
  });

  it("edits the selected block in the inspector without shifting the canvas", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByText(/Select a block/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Edit Greeting block/ }));
    expect(screen.getByText("Greeting")).toBeInTheDocument();
    expect(
      screen.getByText(/edit in the inspector/i),
    ).toBeInTheDocument();
  });

  it("deep-links email template tabs through the URL hash", async () => {
    const user = userEvent.setup();
    window.location.hash = "";
    renderForm();
    await user.click(screen.getByRole("tab", { name: /Invoice email/ }));
    expect(window.location.hash).toBe("#invoice");
    window.location.hash = "";
  });

  it("selects the email template tab from the URL hash on load", () => {
    window.location.hash = "#follow-up";
    try {
      renderForm();
      expect(
        screen.getByRole("tab", { name: /Quote follow-up/ }),
      ).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText(/View quote/)).toBeInTheDocument();
    } finally {
      window.location.hash = "";
    }
  });
});
