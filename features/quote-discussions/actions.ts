"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  getValidationActionState,
} from "@/lib/action-state";
import {
  getBusinessQuoteDiscussionCacheTags,
  getBusinessQuoteDetailCacheTags,
  invalidateCacheTags,
} from "@/lib/cache/business-tags";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { sendQuoteDiscussionReplyEmail } from "@/lib/email/transactional";
import { sendPushQuoteDiscussionMessageEvent } from "@/lib/inngest/send";
import { assertPublicActionRateLimit } from "@/lib/rate-limit/redis-rate-limiter";
import { hashOpaqueToken } from "@/lib/security/tokens";
import {
  getBusinessDiscussionPath,
  getBusinessDiscussionsPath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";
import {
  ensureQuoteDiscussionGuestSessionHash,
} from "@/features/quote-discussions/guest-session";
import {
  markQuoteDiscussionRead,
  sendBusinessQuoteDiscussionMessage,
  sendPublicQuoteDiscussionMessage,
} from "@/features/quote-discussions/mutations";
import { publicQuoteDiscussionRateLimit } from "@/features/quote-discussions/rate-limits";
import {
  quoteDiscussionIdSchema,
  quoteDiscussionMessageSchema,
  quoteDiscussionReadAtSchema,
} from "@/features/quote-discussions/schemas";
import type { QuoteDiscussionActionState } from "@/features/quote-discussions/types";
import { getPublicQuoteUrl } from "@/features/quotes/utils";
import { quotePublicTokenSchema } from "@/features/quotes/schemas";
import { env } from "@/lib/env";

function mapDiscussionFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
) {
  return {
    senderName: fieldErrors.senderName,
    body: fieldErrors.body,
  };
}

export async function postPublicQuoteDiscussionMessageAction(
  token: string,
  _previousState: QuoteDiscussionActionState,
  formData: FormData,
): Promise<QuoteDiscussionActionState> {
  const parsedToken = quotePublicTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    return { error: "This quote link is not valid." };
  }

  const parsed = quoteDiscussionMessageSchema.safeParse({
    senderName: formData.get("senderName"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return getValidationActionState(
      parsed.error,
      "Check your message and try again.",
      mapDiscussionFieldErrors,
    );
  }

  const allowed = await assertPublicActionRateLimit({
    action: "public-quote-discussion",
    scope: hashOpaqueToken(parsedToken.data),
    ...publicQuoteDiscussionRateLimit,
  });

  if (!allowed) {
    return {
      error: "Too many messages were sent from here. Wait a few minutes and try again.",
    };
  }

  try {
    const guestSessionHash = await ensureQuoteDiscussionGuestSessionHash(
      parsedToken.data,
    );
    const result = await sendPublicQuoteDiscussionMessage({
      token: parsedToken.data,
      senderName: parsed.data.senderName,
      body: parsed.data.body,
      guestSessionHash,
    });

    if (!result.ok) {
      return {
        error:
          result.reason === "closed"
            ? "This quote is closed, so its discussion is read-only."
            : "This quote discussion is not available.",
      };
    }

    after(async () => {
      await sendPushQuoteDiscussionMessageEvent({
        businessId: result.businessId,
        businessSlug: result.businessSlug,
        quoteId: result.quoteId,
        quoteNumber: result.quoteNumber,
        discussionId: result.discussionId,
        customerName: result.customerName,
      }).catch((error) => {
        console.error("Failed to send quote discussion push.", error);
      });
    });

    revalidatePath(`/quote/${parsedToken.data}`);

    return { success: "Message sent." };
  } catch (error) {
    console.error("Failed to send public quote discussion message.", error);

    return {
      error: "We couldn't send your message right now. Try again.",
    };
  }
}

export async function sendQuoteDiscussionReplyAction(
  businessSlug: string,
  discussionId: string,
  _previousState: QuoteDiscussionActionState,
  formData: FormData,
): Promise<QuoteDiscussionActionState> {
  const access = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
  });

  if (!access.ok) {
    return { error: access.error };
  }

  const parsedId = quoteDiscussionIdSchema.safeParse(discussionId);

  if (!parsedId.success) {
    return { error: "That discussion could not be found." };
  }

  const submittedSenderName = formData.get("senderName");
  const senderName =
    typeof submittedSenderName === "string" && submittedSenderName.trim()
      ? submittedSenderName
      : access.businessContext.business.name;

  const parsed = quoteDiscussionMessageSchema.safeParse({
    senderName,
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return getValidationActionState(
      parsed.error,
      "Check your reply and try again.",
      mapDiscussionFieldErrors,
    );
  }

  try {
    const result = await sendBusinessQuoteDiscussionMessage({
      businessId: access.businessContext.business.id,
      discussionId: parsedId.data,
      actorUserId: access.user.id,
      senderName: parsed.data.senderName,
      body: parsed.data.body,
    });

    if (!result.ok) {
      return {
        error:
          result.reason === "closed"
            ? "This quote is closed, so its discussion is read-only."
            : "That discussion could not be found.",
      };
    }

    if (result.customerEmail && result.publicToken) {
      const publicQuoteUrl = new URL(
        getPublicQuoteUrl(result.publicToken),
        env.BETTER_AUTH_URL,
      ).toString();

      after(async () => {
        await sendQuoteDiscussionReplyEmail({
          discussionId: result.discussionId,
          messageId: result.messageId,
          businessId: result.businessId,
          businessName: result.businessName,
          customerName: result.customerName,
          customerEmail: result.customerEmail,
          quoteNumber: result.quoteNumber,
          replyPreview: parsed.data.body,
          publicQuoteUrl,
        }).catch((error) => {
          console.error("Failed to send quote discussion reply email.", error);
        });
      });
    }

    invalidateCacheTags([
      ...getBusinessQuoteDiscussionCacheTags(
        result.businessId,
        result.discussionId,
      ),
      ...getBusinessQuoteDetailCacheTags(result.businessId, result.quoteId),
    ]);
    revalidatePath(getBusinessDiscussionsPath(businessSlug));
    revalidatePath(
      getBusinessDiscussionPath(businessSlug, result.discussionId),
    );
    revalidatePath(getBusinessQuotePath(businessSlug, result.quoteId));

    return { success: "Reply sent." };
  } catch (error) {
    console.error("Failed to send quote discussion reply.", error);

    return { error: "We couldn't send your reply right now. Try again." };
  }
}

export async function markQuoteDiscussionReadAction(
  businessSlug: string,
  discussionId: string,
  lastMessageAt: string,
): Promise<{ ok: boolean }> {
  const access = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
  });

  if (!access.ok) {
    return { ok: false };
  }

  const parsedId = quoteDiscussionIdSchema.safeParse(discussionId);
  const parsedLastMessageAt =
    quoteDiscussionReadAtSchema.safeParse(lastMessageAt);

  if (!parsedId.success || !parsedLastMessageAt.success) {
    return { ok: false };
  }

  try {
    const result = await markQuoteDiscussionRead({
      businessId: access.businessContext.business.id,
      discussionId: parsedId.data,
      userId: access.user.id,
      readThrough: new Date(parsedLastMessageAt.data),
    });

    if (!result.ok) {
      return { ok: false };
    }

    revalidatePath(getBusinessDiscussionsPath(businessSlug));
    revalidatePath(getBusinessDiscussionPath(businessSlug, parsedId.data));

    return { ok: true };
  } catch (error) {
    console.error("Failed to mark quote discussion as read.", error);
    return { ok: false };
  }
}

