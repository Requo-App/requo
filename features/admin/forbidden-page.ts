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
 * - Colours mirror the `--*` tokens in `app/globals.css`.
 *
 * The layout mirrors `app/not-found.tsx` (and the React boundary in
 * `app/forbidden.tsx`): same oversized ghost numeral, same centred copy
 * block, same breakpoint steps (640px, 768px) and the same negative top
 * margin that tucks the copy over the numeral. Only the font differs — this
 * page cannot request Inter, so it falls back to the system stack.
 */

/** Copy for the proxy HTML. Mirrors `app/forbidden.tsx` verbatim. */
export const ADMIN_FORBIDDEN_COPY = {
  status: "403",
  title: "Access forbidden",
  description: "You don't have permission to access this page.",
  backLabel: "Go home",
  backHref: "/",
} as const;

export function renderAdminForbiddenPageHtml(): string {
  const { status, title, description, backLabel, backHref } =
    ADMIN_FORBIDDEN_COPY;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>403 — Forbidden</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #1d1d1f;
    --muted-fg: #6e6e73;
    /* Same ghost numeral as the 404: text-foreground/[0.06]. */
    --numeral: rgb(29 29 31 / 0.06);
    --primary: #008060;
    --primary-fg: #f4fffb;
    --ring: #1b9b79;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1c1e;
      --fg: #f5f5f7;
      --muted-fg: #a1a1a6;
      --numeral: rgb(245 245 247 / 0.06);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100svh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5rem 1.5rem;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .status-code {
    margin: 0;
    font-size: 10rem;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.05em;
    color: var(--numeral);
    -webkit-user-select: none;
    user-select: none;
  }
  .status-copy {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-top: -3rem;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0;
    max-width: 24rem;
    font-size: 0.875rem;
    line-height: 1.625;
    color: var(--muted-fg);
  }
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 2rem;
    height: 2.25rem;
    padding: 0 1rem;
    border-radius: 0.6rem;
    background: var(--primary);
    color: var(--primary-fg);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
  }
  /* Flat values, not color-mix: this document targets the app's browserslist
     and must not depend on a CSS function older Firefox builds lack. */
  a:hover { background: #0d8668; }
  a:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    a:hover { background: #00785a; }
  }
  @media (min-width: 640px) {
    .status-code { font-size: 16rem; }
    .status-copy { margin-top: -4rem; }
    h1 { font-size: 1.875rem; }
  }
  @media (min-width: 768px) {
    .status-code { font-size: 20rem; }
    .status-copy { margin-top: -5rem; }
  }
</style>
</head>
<body>
<main>
  <p class="status-code" aria-hidden="true">${status}</p>
  <div class="status-copy">
    <h1>${title}</h1>
    <p>${description}</p>
    <a href="${backHref}">${backLabel}</a>
  </div>
</main>
</body>
</html>`;
}
