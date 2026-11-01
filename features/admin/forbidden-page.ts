/**
 * The 403 page served by `proxy.ts` for a signed-in non-admin hitting `/admin`.
 *
 * This is a plain string, not a React component, because the proxy has to return
 * a real `403` **before** the route renders — with `cacheComponents` the admin
 * layout's static shell streams first, so a status set any later is already lost.
 * That rules out rendering a Next page here.
 *
 * Constraints that follow from being returned from the proxy:
 *
 * - **Self-contained.** No stylesheet, font, or script request: the response
 *   bypasses the app's CSS entirely, so everything is inline.
 * - **No interpolated input.** The only variables are static copy, so there is
 *   nothing to escape and no injection surface.
 * - **Theme-aware** via `prefers-color-scheme`, matching `app/global-error.tsx`,
 *   which is inline-styled for the same reason.
 *
 * It renders the same document as `app/global-error.tsx` — faint oversized
 * status numeral, headline, one sentence, primary and ghost actions — using
 * the shared `errorStateDocumentCss`. The React counterpart is
 * `app/forbidden.tsx`; both read their copy from the same wording as the
 * `forbidden` variant in `components/shared/error-state.tsx`.
 */
import { errorStateDocumentCss } from "@/components/shared/error-state-document";
import { legalConfig } from "@/features/legal/config";

/** Copy for the proxy HTML. Mirrors the `forbidden` error-state variant. */
export const ADMIN_FORBIDDEN_COPY = {
  status: "403",
  title: "You don't have access",
  description:
    "Your account doesn't have permission to view this. If that seems wrong, ask the business owner to update your access.",
  homeLabel: "Go to Requo",
  homeHref: "/",
  supportLabel: "Contact support",
  supportHref: `mailto:${legalConfig.supportEmail}`,
} as const;

export function renderAdminForbiddenPageHtml(): string {
  const {
    status,
    title,
    description,
    homeLabel,
    homeHref,
    supportLabel,
    supportHref,
  } = ADMIN_FORBIDDEN_COPY;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${title} · Requo</title>
<style>${errorStateDocumentCss}</style>
</head>
<body>
<main class="error-doc">
  <div class="error-doc-column">
    <p class="error-doc-numeral" aria-hidden="true">${status}</p>
    <h1 class="error-doc-title">${title}</h1>
    <p class="error-doc-description">${description}</p>
    <div class="error-doc-actions">
      <a class="error-doc-primary" href="${homeHref}">${homeLabel}</a>
      <a class="error-doc-secondary" href="${supportHref}">${supportLabel}</a>
    </div>
  </div>
</main>
</body>
</html>`;
}
