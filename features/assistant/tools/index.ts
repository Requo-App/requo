/**
 * Assistant Tools
 *
 * Centralized export of all assistant tools.
 */

import { searchInquiriesTool } from "./search-inquiries";
import { getInquiryStatsTool } from "./get-inquiry-stats";
import { searchQuotesTool } from "./search-quotes";
import { getQuoteStatsTool } from "./get-quote-stats";
import { searchCustomersTool } from "./search-customers";
import { getConversionAnalyticsTool } from "./get-conversion-analytics";
import { searchKnowledgeTool } from "./search-knowledge";
import { getFollowUpStatsTool } from "./get-follow-up-stats";
import { createInquiryTool } from "./create-inquiry";
import { createQuoteTool } from "./create-quote";
import { updateInquiryStatusTool } from "./update-inquiry-status";
import { sendQuoteTool } from "./send-quote";

// All tools as a record (required by AI SDK streamText)
export const assistantTools = {
  search_inquiries: searchInquiriesTool,
  get_inquiry_stats: getInquiryStatsTool,
  search_quotes: searchQuotesTool,
  get_quote_stats: getQuoteStatsTool,
  search_customers: searchCustomersTool,
  get_conversion_analytics: getConversionAnalyticsTool,
  search_knowledge: searchKnowledgeTool,
  get_follow_up_stats: getFollowUpStatsTool,
  create_inquiry: createInquiryTool,
  create_quote: createQuoteTool,
  update_inquiry_status: updateInquiryStatusTool,
  send_quote: sendQuoteTool,
};

export type AssistantTools = typeof assistantTools;
