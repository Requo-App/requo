/**
 * Styles for error documents that cannot use the app's stylesheet:
 * `app/global-error.tsx` (replaces the root layout) and the proxy's 403
 * (`features/admin/forbidden-page.ts`, returned before React renders).
 *
 * Both documents inline this string in a `<style>` tag, so the two paths stay
 * visually identical and the React `ErrorState` remains the reference design:
 * one centred column, a faint oversized HTTP-status numeral, the heading
 * tucked over its lower edge, then description and actions. There is no
 * logomark, status pill, illustration or background decoration.
 *
 * The values mirror the `--*` tokens in `app/globals.css`; a document with no
 * stylesheet has no `var()` to read them from. Keep them in step with the
 * light and dark values of `--background`, `--foreground`,
 * `--muted-foreground`, `--primary`, `--primary-foreground` and `--ring`.
 * Button metrics mirror the shared `Button` primary and ghost variants at
 * `size="lg"` (height, padding, radius, border, shadow, type).
 */
export const errorStateDocumentCss = `
:root {
  color-scheme: light dark;
  --error-bg: #ffffff;
  --error-fg: #1d1d1f;
  --error-muted: #6e6e73;
  --error-numeral: rgb(29 29 31 / 0.06);
  --error-primary: #008060;
  --error-primary-fg: #f4fffb;
  --error-primary-border: color-mix(in srgb, var(--error-primary) 85%, white);
  --error-primary-hover: #0d8668;
  --error-ring: #1b9b79;
  --error-hover: rgb(0 0 0 / 0.03);
}
@media (prefers-color-scheme: dark) {
  :root {
    --error-bg: #1c1c1e;
    --error-fg: #f5f5f7;
    --error-muted: #a1a1a6;
    --error-numeral: rgb(245 245 247 / 0.06);
    --error-primary-border: color-mix(in srgb, var(--error-primary) 76%, black);
    --error-primary-hover: #00785a;
    --error-hover: rgb(255 255 255 / 0.06);
  }
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--error-bg);
  color: var(--error-fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.error-doc {
  display: flex;
  min-height: 100svh;
  align-items: center;
  justify-content: center;
  padding: 4rem 1.5rem;
}
.error-doc-column {
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.error-doc-numeral {
  margin: 0 0 -0.25em;
  color: var(--error-numeral);
  font-family: inherit;
  font-size: 10rem;
  font-weight: 900;
  letter-spacing: -0.05em;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}
.error-doc-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 2rem;
  text-wrap: balance;
}
.error-doc-description {
  margin: 0.75rem 0 0;
  color: var(--error-muted);
  font-size: 0.875rem;
  line-height: 1.5rem;
  text-wrap: balance;
}
.error-doc-reference {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 1.25rem;
  color: var(--error-muted);
  font-size: 0.75rem;
}
.error-doc-reference code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.7rem;
}
.error-doc-copy {
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
}
.error-doc-copy:hover { background: var(--error-hover); color: var(--error-fg); }
.error-doc-actions {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 2rem;
}
.error-doc-primary,
.error-doc-secondary {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 1rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  transition-property: transform, background-color, border-color, color, box-shadow;
  transition-duration: 150ms;
  transition-timing-function: ease;
}
.error-doc-primary {
  border-color: var(--error-primary-border);
  background: var(--error-primary);
  color: var(--error-primary-fg);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.18),
    inset 0 -1px 0 rgb(0 0 0 / 0.16),
    0 1px 2px rgb(0 0 0 / 0.08),
    0 10px 18px -14px color-mix(in srgb, var(--error-primary) 38%, transparent);
}
.error-doc-primary:hover {
  background: color-mix(in srgb, var(--error-primary) 95%, white);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.2),
    inset 0 -1px 0 rgb(0 0 0 / 0.2),
    0 1px 2px rgb(0 0 0 / 0.08),
    0 14px 24px -16px color-mix(in srgb, var(--error-primary) 42%, transparent);
}
.error-doc-secondary {
  border-color: transparent;
  background: transparent;
  color: var(--error-muted);
  box-shadow: none;
}
.error-doc-secondary:hover {
  background: var(--error-hover);
  color: var(--error-fg);
}
.error-doc-primary:focus-visible,
.error-doc-secondary:focus-visible,
.error-doc-copy:focus-visible {
  outline: 2px solid var(--error-ring);
  outline-offset: 2px;
}
.error-doc-footer {
  margin-top: 2.5rem;
  color: var(--error-muted);
  font-size: 0.75rem;
}
.error-doc-footer a { color: inherit; text-underline-offset: 3px; }
.error-doc-footer a:hover { color: var(--error-fg); }
@media (min-width: 640px) {
  .error-doc-numeral { font-size: 16rem; }
  .error-doc-title { font-size: 1.875rem; line-height: 2.25rem; }
  .error-doc-description { font-size: 0.9375rem; line-height: 1.75rem; }
  .error-doc-actions { flex-direction: row; justify-content: center; gap: 0.75rem; }
  .error-doc-primary,
  .error-doc-secondary { height: 2.25rem; width: auto; }
}
@media (min-width: 768px) {
  .error-doc-numeral { font-size: 20rem; }
}
@media (prefers-color-scheme: dark) {
  .error-doc-primary {
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.07),
      inset 0 -1px 0 rgb(0 0 0 / 0.34),
      0 1px 2px rgb(0 0 0 / 0.32),
      0 10px 18px -14px color-mix(in srgb, var(--error-primary) 18%, transparent);
  }
  .error-doc-primary:hover {
    background: color-mix(in srgb, var(--error-primary) 94%, black);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.09),
      inset 0 -1px 0 rgb(0 0 0 / 0.38),
      0 1px 2px rgb(0 0 0 / 0.34),
      0 14px 24px -16px color-mix(in srgb, var(--error-primary) 22%, transparent);
  }
}
@media (prefers-reduced-motion: no-preference) {
  .error-doc-column {
    animation: error-doc-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}
@media (prefers-reduced-motion: reduce) {
  .error-doc-primary,
  .error-doc-secondary { transition: none; }
}
@keyframes error-doc-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
`;
