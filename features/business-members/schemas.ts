import { z } from "zod";

import { businessMemberAssignableRoles, businessMemberRoles } from "@/lib/business-members";

const inviteRoleSchema = z.enum(businessMemberAssignableRoles);

export const businessMemberInviteSchema = z.object({
  email: z.string().trim().max(320).email("Enter a valid email address."),
  role: inviteRoleSchema.default("staff"),
});

export const businessMemberInviteIdSchema = z
  .string()
  .trim()
  .min(1, "That invite could not be found.");

export const businessMembershipIdSchema = z
  .string()
  .trim()
  .min(1, "That member could not be found.");

export const businessMemberRoleUpdateSchema = z.object({
  membershipId: businessMembershipIdSchema,
  role: z.enum(businessMemberRoles),
});

