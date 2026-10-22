/**
 * Agent Tools Registry
 *
 * Central export for all agent tools.
 */

import { searchKnowledgeTool } from "./search-knowledge";
import { getBusinessInfoTool } from "./get-business-info";
import { getServicesTool } from "./get-services";
import { proposeInquiryTool } from "./propose-inquiry";

export const agentTools = {
  search_knowledge: searchKnowledgeTool,
  get_business_info: getBusinessInfoTool,
  get_services: getServicesTool,
  propose_inquiry: proposeInquiryTool,
};

export type AgentTools = typeof agentTools;
