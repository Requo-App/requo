import type { InquiryStatus } from "@/features/inquiries/types";
import type {
  QuoteStatus,
} from "@/features/quotes/types";

export type CustomerHistoryInquiryItem = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  subject: string | null;
  status: InquiryStatus;
  submittedAt: Date;
};

export type CustomerHistoryQuoteItem = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  totalInCents: number;
  currency: string;
  createdAt: Date;
};

export type CustomerHistoryLatestOutcome =
  | {
      kind: "inquiry";
      status: InquiryStatus;
    }
  | {
      kind: "quote";
      status: QuoteStatus;
    };

export type CustomerHistoryData = {
  customerEmail: string;
  inquiryCount: number;
  quoteCount: number;
  latestOutcome: CustomerHistoryLatestOutcome | null;
  inquiries: CustomerHistoryInquiryItem[];
  quotes: CustomerHistoryQuoteItem[];
};
