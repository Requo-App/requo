import { startImpersonationAction } from "@/features/admin/mutations";
import { redirectToPath } from "@/lib/routing/redirects";

/**
 * POST /admin/users/[userId]/impersonate
 *
 * Starts an impersonation session for the given user. Expects a
 * form-encoded body with a single `confirmToken` field issued by
 * `issuePasswordConfirmTokenAction` in the admin UI's confirm-password
 * dialog.
 *
 * The access gate + token consumption + audit logging all live inside
 * `startImpersonationAction` per the design doc, so this handler stays
 * thin: parse the body, delegate, and redirect based on the result.
 *
 * Success → 303 See Other to `/home` so the browser follows
 * with GET and lands on the impersonated user's business hub.
 *
 * Failure → 303 back to the user detail page with the safe error
 * message in a query param so the admin UI can render an inline alert.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;

  const formData = await request.formData().catch(() => null);
  const confirmTokenRaw = formData?.get("confirmToken");
  const confirmToken =
    typeof confirmTokenRaw === "string" ? confirmTokenRaw : "";

  const result = await startImpersonationAction({
    targetUserId: userId,
    confirmToken,
  });

  if (result.ok) {
    return redirectToPath("/home", 303);
  }

  return redirectToPath(
    `/admin/users/${encodeURIComponent(userId)}?error=${encodeURIComponent(result.error)}`,
    303,
  );
}
