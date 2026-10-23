# Billing Setup

Requo uses Polar (polar.sh) only. Polar acts as the merchant of record. Polar reports currencies as lowercase ISO 4217 codes; Requo normalizes them to its uppercase `USD` / `PHP` enum. Unsupported currencies are logged and recorded as USD rather than failing the webhook.

## Data model

Run migrations before testing billing:

```bash
npm run db:migrate
```

Billing tables:

- `business_subscriptions`: source of truth for business subscription status
- `billing_events`: idempotent webhook event log
- `payment_attempts`: checkout and payment history
- `refunds`: read-only after the canonical-Polar refactor; refunds are issued in the customer portal and reflected via `subscription.canceled` / `subscription.revoked` events

`businesses.plan` is a denormalized cache synchronized by `lib/billing/subscription-service.ts`.
It holds the *effective* plan, not the requested one: every subscription status
change rewrites it in the same transaction as the subscription row, so a revoked,
expired, or still-pending business cannot keep a paid plan in the cache.
Entitlement-sensitive reads should resolve the plan from `business_subscriptions`
(the business shell and the inquiry surfaces both do) rather than trusting the
column.

Subscription lifecycle rules:

- `past_due` keeps paid access for a **7-day local grace window** after
  `current_period_end`. A scheduled job expires past-due rows after the window even
  if Polar dunning never recovers; entitlement reads enforce the same cutoff.
- `paused` resolves to the free plan until Polar sends `subscription.resumed`.
- `canceled` keeps paid access until `current_period_end`, then becomes free.
- Webhook writes carry the provider event's occurrence timestamp
  (`business_subscriptions.provider_event_at`). Older or out-of-order deliveries are
  ignored so a stale retry cannot roll back newer state.
- A `failed` webhook event is reclaimed on the next delivery, and a `processing`
  event older than five minutes is treated as abandoned and reclaimed. `processed`
  and `ignored` events are terminal.

## Pricing

Pricing is defined in `lib/billing/plans.ts` and uses USD cents:

- Pro monthly: `$9.00` (900 cents)
- Pro yearly: `$90.00` (9000 cents)
- Business monthly: `$24.00` (2400 cents)
- Business yearly: `$240.00` (24000 cents)

Annual billing provides two months free (10 months for the price of 12).

## Polar setup (sandbox)

Always wire sandbox first. Production cutover is documented below; do not skip sandbox validation.

1. Create products in the Polar **sandbox** dashboard for Pro and Business at both monthly and yearly cadence. Copy each product's id.
2. Add env values to `.env.local`:

   ```env
   POLAR_ACCESS_TOKEN=polar_oat_...           # sandbox token
   POLAR_WEBHOOK_SECRET=whsec_...             # sandbox webhook secret (raw also accepted)
   POLAR_SERVER=sandbox                       # default
   POLAR_PRO_PRODUCT_ID=
   POLAR_PRO_YEARLY_PRODUCT_ID=
   POLAR_BUSINESS_PRODUCT_ID=
   POLAR_BUSINESS_YEARLY_PRODUCT_ID=
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   `POLAR_SERVER` must be `sandbox` (default) for the sandbox dashboard or `production` for live charges. The access token must come from the same dashboard.

3. Configure a webhook endpoint in the sandbox Polar dashboard pointing to:

   ```text
   {NEXT_PUBLIC_APP_URL}/api/billing/polar/webhook
   ```

   The endpoint URL must include `/api/billing/polar/webhook`; pointing the
   dashboard at the tunnel root returns 404/405 for every delivery. Use the
   ngrok URL printed by `npm run dev:tunnel` or
   `npm run dev:docker:tunnel` (or any HTTPS tunnel). Set `NGROK_DOMAIN` to a
   reserved domain if you want the endpoint URL to survive restarts.

   Set the endpoint's API version to **`2026-10`**, which is the versioned SDK
   bundled with `@polar-sh/nextjs@1.1.0`. A dashboard endpoint pinned to a newer
   schema can change event payloads before the adapter validates them.

4. Subscribe the webhook to these events. Recognized events the application does
   not act on are recorded in `billing_events` with status `ignored`. Event types
   unknown to the SDK adapter are acknowledged with 200 before dispatch and are not
   recorded.

   - `subscription.created`
   - `subscription.active`
   - `subscription.updated`
   - `subscription.past_due`
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.cycled`
   - `subscription.canceled`
   - `subscription.uncanceled`
   - `subscription.revoked`
   - `order.paid`
   - `order.updated`
   - `order.refunded`

5. `app/api/billing/checkout/route.ts` runs eligibility checks (auth, owner role,
   isPolarConfigured, already-active, missing email, product id resolution), creates
   the Polar checkout session via `lib/billing/polar-client.ts`, and returns
   `{ checkoutUrl }`. Checkout and customer-portal access are owner-only; managers
   and staff receive 403 even though they can view the business. Webhook payloads
   are resolved back to a Requo business via `customer.external_id` first, then
   `business_subscriptions.providerCustomerId`, then `providerSubscriptionId`, with
   `metadata.businessId` as the final legacy fallback.

## Production cutover

Cut over only after sandbox is fully validated end-to-end (checkout, webhook receipt, customer portal redirect, subscription state propagation). Production charges real money in USD; a misconfigured product id or webhook secret can result in user-visible billing errors or unrecoverable refund cases.

### Pre-cutover checklist

- Sandbox checkout end-to-end works in a local browser via the ngrok webhook endpoint.
- Sandbox webhook events land in `billing_events` with `status = "processed"` and the expected business id resolution.
- Sandbox subscription state changes (active, past due, paused, resumed, canceled with future period end, revoked) propagate to `business_subscriptions` and the denormalized `businesses.plan` cache.
- A stale or out-of-order duplicate delivery does not overwrite newer subscription state.
- Sandbox customer portal redirect from `/api/billing/polar/customer-portal` works for the business owner with a non-null `providerCustomerId`; manager/staff requests return 403.
- The deployment target's public origin is reachable over HTTPS and `NEXT_PUBLIC_APP_URL` is set to that origin (e.g. `https://requo.app`).

### Cutover steps

1. **Create production products in Polar.** In the production Polar dashboard (not sandbox), create four products: Pro monthly, Pro yearly, Business monthly, Business yearly. Set the prices in USD to match `lib/billing/plans.ts`. Copy each product id.
2. **Create a production webhook endpoint.** In the production Polar dashboard, create a webhook endpoint pointing at `https://<production-origin>/api/billing/polar/webhook`. Copy the signing secret. Subscribe to the same event list documented above for sandbox.
3. **Create a production access token.** In the production Polar dashboard, generate an access token with the scopes required for `checkouts:write`, `subscriptions:read`, `customer_portal:write`, and `customers:read`. Copy it once; it cannot be retrieved later.
4. **Replace env values in the production deployment.** Update the production environment variable store (Vercel, your CI secrets manager, etc.) — do **not** edit `.env.local` for production:

   ```env
   POLAR_SERVER=production
   POLAR_ACCESS_TOKEN=polar_oat_...           # production token from step 3
   POLAR_WEBHOOK_SECRET=whsec_...             # production webhook secret from step 2
   POLAR_PRO_PRODUCT_ID=                      # production product id (Pro monthly)
   POLAR_PRO_YEARLY_PRODUCT_ID=               # production product id (Pro yearly)
   POLAR_BUSINESS_PRODUCT_ID=                 # production product id (Business monthly)
   POLAR_BUSINESS_YEARLY_PRODUCT_ID=          # production product id (Business yearly)
   NEXT_PUBLIC_APP_URL=https://<production-origin>
   ```

5. **Deploy and verify.** Trigger a production deploy, then verify the production environment can reach Polar:
   - Hit `/pricing` from the production origin and confirm the upgrade button reaches the Polar checkout page.
   - Run a small test purchase with a real card you own (refund it via the customer portal afterward) and confirm:
     - `business_subscriptions` row activates for the business
     - `payment_attempts` row records the order with `status = "succeeded"`
     - `billing_events` row for `subscription.created` is `processed` with non-null `processedAt`
     - `businesses.plan` updates for the subscribed business
   - Open `/api/billing/polar/customer-portal` and confirm the Polar portal redirect works.
6. **Monitor for the first 24 hours.** Watch `billing_events` for `failed` rows and the application logs for webhook signature errors. Polar's dashboard also shows webhook delivery success and retry counts.

### Rollback

If a production cutover fails, set `POLAR_SERVER=sandbox` plus the sandbox `POLAR_*` values in the production env store and redeploy. New checkouts will route to sandbox, which prevents further live charges. Existing production subscriptions in Polar are unaffected — the customer portal still works against the production Polar API regardless of `POLAR_SERVER` (the access token determines the dashboard, not just the env flag), so plan rollback to also rotate the production access token if you want to fully sever traffic.

## Troubleshooting

### Checkout says billing is not configured

- Confirm `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, and at least one `POLAR_*_PRODUCT_ID` are set.
- Restart the dev server after editing `.env.local`.
- Verify `POLAR_SERVER` matches the dashboard the access token was issued in. A sandbox token with `POLAR_SERVER=production` (or vice versa) will silently fail.

### Subscription does not activate after checkout

- Confirm product ids in `.env.local` match the Polar dashboard ids for the selected plan and interval, and the dashboard environment matches `POLAR_SERVER`.
- Verify the webhook signing secret matches the dashboard value.
- Inspect `billing_events` for entries with `status = "failed"` and a non-null `errorMessage`.
- Inspect `payment_attempts` to confirm the order event landed.

### Webhook returns 404/405 or never reaches the app

- Confirm the Polar endpoint URL includes `/api/billing/polar/webhook`. A tunnel
  root URL is not a valid webhook endpoint.
- Check the tunnel is running: open http://localhost:4040 for the ngrok
  inspector, or inspect the `ngrok` compose service logs when using the
  `tunnel` profile. Confirm the Polar endpoint uses the tunnel URL plus
  `/api/billing/polar/webhook`.

### Webhook returns 400 or stops after a Polar API upgrade

- Check the endpoint's API version in the Polar dashboard. This codebase validates
  events with the `2026-10` schema bundled into `@polar-sh/nextjs@1.1.0`; pin the
  endpoint to that version.
- A 403 is a signature/secret mismatch. A 400 is a malformed or version-mismatched
  payload. `billing_events.errorMessage` records local processing failures.

### Customer portal returns 403

- Only the business owner can create a customer-portal session or change the
  plan. Managers and staff can view the billing page read-only.

### Customer portal returns "No billing account found"

- The business has no `business_subscriptions` row, or the row's `providerCustomerId` is null. Complete a checkout; the `subscription.active` / `subscription.cycled` webhook (or the post-checkout sync) writes the row with the Polar customer id.
