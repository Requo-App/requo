/**
 * Assistant tool authorization.
 *
 * Tools respect the acting member's role server-side: a Tool the member's
 * role does not permit returns a refusal, it is never merely hidden in UI.
 */

import {
  hasBusinessRoleAccess,
  type BusinessMemberRole,
} from "@/lib/business-members";
import type { ErrorResult } from "./types";

function asRole(value: string): BusinessMemberRole | null {
  return value === "owner" || value === "manager" || value === "staff"
    ? value
    : null;
}

/**
 * Minimum roles per write Tool. Reads are available to every member.
 * Sending a Quote notifies a customer on the business's behalf, so it
 * requires a manager or owner; drafting (inquiry/quote creation, status
 * preparation) is day-to-day work open to staff.
 */
const toolMinimumRoles: Record<string, BusinessMemberRole> = {
  create_inquiry: "staff",
  create_quote: "staff",
  update_inquiry_status: "staff",
  send_quote: "manager",
};

export function requireToolRole(
  userRole: string,
  toolName: string,
): ErrorResult | null {
  const minimum = toolMinimumRoles[toolName];
  if (!minimum) return null;

  const role = asRole(userRole);
  if (!role || !hasBusinessRoleAccess(role, minimum)) {
    return {
      type: "error",
      error: "PERMISSION_DENIED",
      message: `Your role does not permit the ${toolName} action. Ask a manager or owner to do this.`,
      summary: "Action refused: insufficient role",
      retryable: false,
    };
  }

  return null;
}

/** Convert integer cents to dollars for model-facing display. Never show raw cents as dollars. */
export function centsToDollars(cents: number | null | undefined): number {
  return Math.round((Number(cents ?? 0) / 100) * 100) / 100;
}
