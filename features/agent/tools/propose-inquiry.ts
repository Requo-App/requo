/**
 * Propose Inquiry Tool
 *
 * The model has lost commit authority: this tool stages a Proposed Inquiry on
 * the Agent Session and returns it — it commits nothing. The only path from
 * proposal to Inquiry is the visitor-approved server action, which consumes
 * the proposal exactly once.
 *
 * A session holds at most one proposal — a revision supersedes rather than
 * versions.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { createInquiryParamsSchema } from "@/features/agent/schemas";
import type { AgentToolContext } from "@/features/agent/tools/types";
import type { ProposedInquiry } from "@/features/agent/types";
import { prefixedId } from "@/lib/ids";
import {
  stageProposedInquiry,
  updateSessionState,
  REQUIRED_QUALIFICATION_FIELDS,
} from "@/features/agent/session-service";

type ProposeInquiryInput = z.infer<typeof createInquiryParamsSchema>;

export const proposeInquiryTool = tool<
  ProposeInquiryInput,
  { proposal: ProposedInquiry; message: string }
>({
  description:
    "Propose an inquiry when you have collected all required information from the visitor: name, contact method and handle, service (a live service slug from get_services), and project details. This stages the proposal for the visitor to review and send — it does not create anything yet. Only call this when you have complete information. Optional details like budget and deadline can be left for the visitor to fill in on the card.",
  inputSchema: createInquiryParamsSchema,
  execute: async (params, options: ToolExecutionOptions) => {
    const context = options.experimental_context as AgentToolContext;

    const { sessionId, state } = context;

    const proposal: ProposedInquiry = {
      id: prefixedId("prop"),
      values: {
        customerName: params.customerName,
        customerEmail: params.customerEmail ?? null,
        customerContactMethod: params.customerContactMethod,
        customerContactHandle: params.customerContactHandle,
        serviceSlug: params.serviceSlug,
        details: params.details,
        budgetText: params.budgetText,
        requestedDeadline: params.requestedDeadline,
        additionalFields: params.additionalFields,
      },
      proposedAt: new Date().toISOString(),
      status: "pending",
    };

    await stageProposedInquiry({ sessionId, proposal });

    // Advance qualification: everything required is now collected. The
    // proposal (not the session) carries pending/approved state — the
    // session's own lifecycle is unchanged until approval completes it.
    const collected: Record<string, boolean> = { ...state.collected };
    for (const field of REQUIRED_QUALIFICATION_FIELDS) {
      collected[field] = true;
    }
    await updateSessionState({
      sessionId,
      state: {
        collected,
        values: {
          ...state.values,
          customerName: params.customerName,
          customerEmail: params.customerEmail ?? null,
          customerContactMethod: params.customerContactMethod,
          customerContactHandle: params.customerContactHandle,
          serviceSlug: params.serviceSlug,
          details: params.details,
        },
        missing: [],
        proposedInquiry: proposal,
      },
    });

    return {
      proposal,
      message:
        "I've put together what I'll send — review it below and press send when it looks right.",
    };
  },
});
