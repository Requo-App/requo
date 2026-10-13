# Billing Setup

Requo uses Polar (polar.sh) only. Polar acts as the merchant of record and supports multiple currencies (USD, PHP, etc.) based on the customer's region.

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
2. Add env values to `.env`:

   ```env
   POLAR_ACCESS_TOKEN=polar_oat_...           # sandbox token
   POLAR_WEBHOOK_SECRET=polar_whs_...         # sandbox webhook secret
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

   Use the `npm run dev` ngrok URL (or any HTTPS tunnel) when testing locally.

4. Subscribe the webhook to these events. Other event types are recorded in `billing_events` with status `ignored` and ignored by the application.

   - `subscription.created`
   - `subscription.active`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.uncanceled`
   - `subscription.revoked`
   - `order.paid`
   - `order.updated`
   - `order.refunded`

5. `app/api/account/billing/checkout/route.ts` runs eligibility checks (auth, isPolarConfigured, already-active, missing email, product id resolution) then creates the Polar checkout session directly via `lib/billing/polar-client.ts` and returns `{ checkoutUrl }`. Webhook payloads are resolved back to a Requo business via `customer.externalId` first, then `business_subscriptions.providerCustomerId`, then `providerSubscriptionId`, with `metadata.businessId` as a tertiary legacy fallback.

## Production cutover

Cut over only after sandbox is fully validated end-to-end (checkout, webhook receipt, customer portal redirect, subscription state propagation). Production charges real money in USD; a misconfigured product id or webhook secret can result in user-visible billing errors or unrecoverable refund cases.

### Pre-cutover checklist

- Sandbox checkout end-to-end works in a local browser via the ngrok webhook endpoint.
- Sandbox webhook events land in `billing_events` with `status = "processed"` and the expected business id resolution.
- Sandbox subscription state changes (active, canceled with future period end, revoked) propagate to `business_subscriptions` and the denormalized `businesses.plan` cache.
- Sandbox customer portal redirect from `/api/billing/polar/customer-portal` works for a user with a non-null `providerCustomerId`.
- The deployment target's public origin is reachable over HTTPS and `NEXT_PUBLIC_APP_URL` is set to that origin (e.g. `https://requo.app`).

### Cutover steps

1. **Create production products in Polar.** In the production Polar dashboard (not sandbox), create four products: Pro monthly, Pro yearly, Business monthly, Business yearly. Set the prices in USD to match `lib/billing/plans.ts`. Copy each product id.
2. **Create a production webhook endpoint.** In the production Polar dashboard, create a webhook endpoint pointing at `https://<production-origin>/api/billing/polar/webhook`. Copy the signing secret. Subscribe to the same event list documented above for sandbox.
3. **Create a production access token.** In the production Polar dashboard, generate an access token with the scopes required for `checkouts:write`, `subscriptions:read`, `customer_portal:write`, and `customers:read`. Copy it once; it cannot be retrieved later.
4. **Replace env values in the production deployment.** Update the production environment variable store (Vercel, your CI secrets manager, etc.) — do **not** edit `.env` for production:

   ```env
   POLAR_SERVER=production
   POLAR_ACCESS_TOKEN=polar_oat_...           # production token from step 3
   POLAR_WEBHOOK_SECRET=polar_whs_...         # production webhook secret from step 2
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
- Restart the dev server after editing `.env`.
- Verify `POLAR_SERVER` matches the dashboard the access token was issued in. A sandbox token with `POLAR_SERVER=production` (or vice versa) will silently fail.

### Subscription does not activate after checkout

- Confirm product ids in `.env` match the Polar dashboard ids for the selected plan and interval, and the dashboard environment matches `POLAR_SERVER`.
- Verify the webhook signing secret matches the dashboard value.
- Inspect `billing_events` for entries with `status = "failed"` and a non-null `errorMessage`.
- Inspect `payment_attempts` to confirm the order event landed.

### Customer portal returns "No billing account found"

- The business has no `business_subscriptions` row, or the row's `providerCustomerId` is null. Trigger a checkout first; the `subscription.created` webhook populates `providerCustomerId` on the row.
