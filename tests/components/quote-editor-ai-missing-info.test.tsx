import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const {
  generateQuoteDraftActionMock,
  routerRefreshMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  generateQuoteDraftActionMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

vi.mock("@/features/ai/actions", () => ({
  generateQuoteDraftAction: generateQuoteDraftActionMock,
}));

vi.mock("@/components/shared/notify", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("next/dynamic", () => ({
  default: () => function DynamicStub() {
    return null;
  },
}));

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
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
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

import { AiMissingInfoPanel } from "@/features/quotes/components/ai-missing-info-panel";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";

const clipboardWriteTextMock = vi.fn();

function renderQuoteEditor() {
  return render(
    <QuoteEditor
      action={vi.fn(async () => ({}))}
      businessName="Brightside Events"
      businessSlug="brightside-events"
      canUseAiGenerator
      currency="USD"
      initialValues={{
        title: "Event catering quote",
        customerName: "Taylor Nguyen",
        customerEmail: "taylor@example.com",
        customerContactMethod: "email",
        customerContactHandle: "taylor@example.com",
        notes: "",
        terms: "",
        validUntil: "2026-06-15",
        discount: "",
        discountType: "amount",
        tax: "",
        taxType: "amount",
        taxLabel: "",
        items: [
          {
            id: "draft_item_1",
            description: "",
            quantity: "1",
            unitPrice: "",
          },
        ],
      }}
      linkedInquiry={{
        id: "inq_123",
        customerName: "Taylor Nguyen",
        customerEmail: "taylor@example.com",
        customerContactMethod: "email",
        customerContactHandle: "taylor@example.com",
        subject: "Event catering",
        requestedDeadline: null,
        status: "new",
        recordState: "active",
        details: "Catering for 50 guests.",
        budgetText: null,
      }}
      pricingLibrary={[]}
      submitLabel="Create draft quote"
      submitPendingLabel="Creating draft..."
    />,
  );
}

describe("QuoteEditor AI missing info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
    clipboardWriteTextMock.mockResolvedValue(undefined);
  });

  it("shows missing details after AI generation", async () => {
    const user = userEvent.setup();
    const clarificationMessage =
      "Hi! Thanks for your inquiry. Before I send the final quote, may I confirm the exact event date and number of guests?";

    generateQuoteDraftActionMock.mockResolvedValue({
      draft: {
        title: "Event catering quote",
        notes: null,
        items: [
          {
            description: "Catering package",
            quantity: 1,
            unitPriceInCents: 150000,
          },
        ],
        missingInfo: [
          {
            label: "Exact event date",
            question: "What date should we reserve?",
          },
          {
            label: "Number of guests",
            question: "How many guests should we quote for?",
          },
        ],
        clarificationMessage,
        model: "test-model",
        provider: "groq",
      },
    });

    renderQuoteEditor();

    await user.click(screen.getByRole("button", { name: "Generate with AI" }));

    expect(await screen.findByText("Missing details")).toBeVisible();
    expect(screen.getByText("Exact event date")).toBeVisible();
    expect(screen.getByText("Number of guests")).toBeVisible();
    expect(screen.getByText(clarificationMessage)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeVisible();
  });

  it("copies the suggested clarification message from the missing info panel", async () => {
    const user = userEvent.setup();
    const clarificationMessage =
      "Hi! Thanks for your inquiry. Before I send the final quote, may I confirm the exact event date and number of guests?";

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });

    render(
      <AiMissingInfoPanel
        clarificationMessage={clarificationMessage}
        missingInfo={[
          {
            label: "Exact event date",
            question: "What date should we reserve?",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy message" }));
    await waitFor(() =>
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(clarificationMessage),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Clarification message copied.",
    );
  });

  it("does not show the missing details panel when the AI returns none", async () => {
    const user = userEvent.setup();

    generateQuoteDraftActionMock.mockResolvedValue({
      draft: {
        title: "Event catering quote",
        notes: null,
        items: [
          {
            description: "Catering package",
            quantity: 1,
            unitPriceInCents: 150000,
          },
        ],
        missingInfo: [],
        clarificationMessage: null,
        model: "test-model",
        provider: "groq",
      },
    });

    renderQuoteEditor();

    await user.click(screen.getByRole("button", { name: "Generate with AI" }));

    await waitFor(() =>
      expect(generateQuoteDraftActionMock).toHaveBeenCalledWith(
        "brightside-events",
        {},
        expect.any(FormData),
      ),
    );
    expect(screen.queryByText("Missing details")).not.toBeInTheDocument();
  });
});
