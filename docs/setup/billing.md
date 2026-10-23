# Billing Setup

Requo uses Polar (polar.sh) only. Polar acts as the merchant of record. Polar reports currencies as lowercase ISO 4217 codes; Requo normalizes them to its uppercase `billing_currency` enum. Supported currencies are USD, PHP, GBP, CAD, AUD, EUR, NZD, SGD, AED, INR, and ZAR. Unsupported currencies are logged and recorded as USD rather than failing the webhook.

## Data model

Run migrations before testing billing:

```bash
npm run db:migrate
```

Migration `0043_expand_billing_currencies` adds the local billing currencies to the `billing_currency` enum. Apply it before deploying code that can write a new currency; the migrations are ordered and must not be edited after they are committed.

Migration `0044_enable_rls_business_trial_claims` enables row-level security on `business_trial_claims` and adds the default-deny policy used by the rest of the schema. Drizzle's direct connection bypasses RLS; the policy closes access through Supabase's PostgREST roles.

Billing tables:

- `business_subscriptions`: source of truth for business subscription status,
  including the local Pro trial window (`trial_ends_at`)
- `business_trial_claims`: one row per owner that has used the one-time Pro
  trial. `business_id` is intentionally not a foreign key so deleting the
  business cannot reset trial eligibility.
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

- `trialing` grants the Pro plan until `trial_ends_at`. Trial rows have no
  Polar subscription and no payment method. Entitlement reads resolve the plan
  from the trial timestamp, so a business falls back to Free on the next
  entitlement read after the window passes even if the daily expiry job has not
  run. The expiry job then flips the row to `expired` and applies the Free
  live-service allowance.
- Trials are one per owner, recorded in `business_trial_claims`. The owner’s
  first active business claims the trial during creation; an existing Free
  business can start it from Billing (owner-only). The trial row stores the
  visitor's detected billing currency (the same market signal checkout uses),
  not the business's quote currency. Subscribing during the trial clears
  `trial_ends_at` and activates the paid subscription.
- When a status change lowers the effective plan, the subscription write also
  unpublishes live services above the new plan's `liveServicesPerBusiness`
  allowance in the same transaction. The default service and the oldest
  services stay live; excess services remain in the dashboard and can be
  republished after an upgrade. This covers trial expiry, downgrades, pausing,
  and revocation.
- `hasPaidBusinessSubscriptionSql()` deliberately excludes `trialing`, so the
  trial business still occupies the owner’s one-Free-business slot after the
  trial ends.
- `past_due` keeps paid access for a **7-day local grace window** after
  `current_period_end`. A scheduled job expires past-due rows after the window even
  if Polar dunning never recovers; entitlement reads enforce the same cutoff.
- `paused` resolves to the free plan until Polar sends `subscription.resumed`.
- `canceled` keeps paid access until `current_period_end`, then becomes free.
- Webhook writes carry the provider event's occurrence timestamp
  (`business_subscriptions.provider_event_at`). Older or out-of-order deliveries are
  ignored so a stale retry cannot roll back newer state. Starting a local trial
  records the trial start in `provider_event_at`; provider events timestamped
  before that barrier belong to a previous term and are ignored.
- A `failed` webhook event is reclaimed on the next delivery, and a `processing`
  event older than five minutes is treated as abandoned and reclaimed. `processed`
  and `ignored` events are terminal.

## Pricing

Prices live in `lib/billing/plans.ts`; display metadata (symbol, locale grouping, and home-market tax default) lives in `lib/billing/currencies.ts`. Requo charges a fixed local price in each supported currency; it does not convert a USD base at runtime. Polar products must carry a price in every currency below, and Polar selects the customer's currency from their IP at checkout.

| Currency | Pro monthly | Pro yearly | Business monthly | Business yearly |
| --- | ---: | ---: | ---: | ---: |
| USD | $9 | $90 | $24 | $240 |
| PHP | ₱499 | ₱4,990 | ₱1,299 | ₱12,990 |
| GBP | £9 | £90 | £24 | £240 |
| CAD | CA$12 | CA$120 | CA$32 | CA$320 |
| AUD | A$14 | A$140 | A$36 | A$360 |
| EUR | €9 | €90 | €24 | €240 |
| NZD | NZ$18 | NZ$180 | NZ$48 | NZ$480 |
| SGD | S$12 | S$120 | S$32 | S$320 |
| AED | AED 35 | AED 350 | AED 89 | AED 890 |
| INR | ₹499 | ₹4,990 | ₹1,299 | ₹12,990 |
| ZAR | R129 | R1,290 | R329 | R3,290 |

Annual billing is always ten times the monthly price (two months free). The price table is checked in unit tests for completeness and for that relationship.

### Country mapping

`lib/billing/region.ts` reads Vercel's `x-vercel-ip-country` header and maps the country to a display currency:

- `GB`, `IM`, `JE`, `GG` → GBP
- `CA` → CAD
- `AU` → AUD
- Ireland and eurozone countries (`AT`, `BE`, `BG`, `CY`, `DE`, `EE`, `ES`, `FI`, `FR`, `GR`, `HR`, `IE`, `IT`, `LT`, `LU`, `LV`, `MT`, `NL`, `PT`, `SI`, `SK`), plus `AD`, `MC`, `ME`, `SM`, `VA`, `XK` → EUR
- `NZ` → NZD
- `SG` → SGD
- `AE` → AED
- `PH` → PHP
- `IN` → INR
- `ZA` → ZAR
- Every other country, a missing header, or an unknown code → USD

The header exists only on Vercel. Local development and non-Vercel deployments fall back to USD unless a proxy sets the same header. The pricing page streams the geo-aware cards and product structured data inside a Suspense boundary; metadata and the static fallback stay USD so the route remains cacheable.

In-app plan prices use the subscription's billing currency when one exists; a business without a subscription uses the same geo header as checkout. This keeps the plan sheet, billing card, and Polar checkout on one market instead of falling back to USD.

### Tax

Polar is the merchant of record and calculates tax from the customer's billing location, not from the displayed currency. Polar's default tax behavior is **exclusive** in the United States, Canada, and India, and **inclusive** elsewhere. The checkout total is the final amount; Requo does not calculate, store, or remit tax itself. A customer in a country without a local price is charged in USD but still gets the tax treatment for their location. If tax settings change in Polar, update the customer-facing copy and this document together.

### Checkout currency

`app/api/billing/checkout/route.ts` forwards the client IP as `customer_ip_address`. The Polar `CheckoutCreate` payload has no explicit currency field, so the product must have a price in the local currency for Polar to select it. Set the Polar organization's **default presentment currency** to USD as the fallback for countries without a local price. A product missing a currency price falls back to that default, which can make checkout differ from the displayed local price.

## Polar setup (sandbox)

Always wire sandbox first. Production cutover is documented below; do not skip sandbox validation.

1. Create products in the Polar **sandbox** dashboard for Pro and Business at both monthly and yearly cadence. For each product, add a fixed price in every supported currency using the table above. Set the organization's default presentment currency to USD. Copy each product's id.
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

Cut over only after sandbox is fully validated end-to-end (checkout, webhook receipt, customer portal redirect, subscription state propagation). Production charges real money in the checkout currency; a misconfigured product id, missing local price, or webhook secret can result in user-visible billing errors or unrecoverable refund cases.

### Pre-cutover checklist

- Sandbox checkout end-to-end works in a local browser via the ngrok webhook endpoint.
- Sandbox webhook events land in `billing_events` with `status = "processed"` and the expected business id resolution.
- Sandbox subscription state changes (active, past due, paused, resumed, canceled with future period end, revoked) propagate to `business_subscriptions` and the denormalized `businesses.plan` cache.
- A stale or out-of-order duplicate delivery does not overwrite newer subscription state.
- Sandbox customer portal redirect from `/api/billing/polar/customer-portal` works for the business owner with a non-null `providerCustomerId`; manager/staff requests return 403.
- The deployment target's public origin is reachable over HTTPS and `NEXT_PUBLIC_APP_URL` is set to that origin (e.g. `https://requo.app`).

### Cutover steps

1. **Create production products in Polar.** In the production Polar dashboard (not sandbox), create four products: Pro monthly, Pro yearly, Business monthly, Business yearly. Add a fixed price in every supported currency using the table above and set the organization's default presentment currency to USD. Copy each product id.
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
   - Hit `/pricing` from the production origin and confirm the upgrade button reaches the Polar checkout page. Check at least one supported local market and one unsupported market: the cards should show that market's fixed currency and the Polar checkout should present the same currency, with USD as the fallback.
   - Run a small test purchase with a real card you own (refund it via the customer portal afterward) and confirm:
     - `business_subscriptions` row activates for the business with the expected `billing_currency`
     - `payment_attempts` row records the order with `status = "succeeded"` and the checkout currency
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

### Pricing page or checkout shows USD in a supported market

- Confirm the deployment runs on Vercel or that the proxy sets `x-vercel-ip-country` to the visitor's ISO country code. Locally the header is absent, so `/pricing` intentionally falls back to USD.
- Confirm the country is in the mapping above. Countries outside the supported markets intentionally use USD.
- Confirm the Polar product has a price in the expected currency. Checkout has no explicit currency parameter; Polar selects from `customer_ip_address`, then falls back to the organization's default presentment currency (USD) when the local price is missing.
- If the page displays the local price but checkout shows another currency, compare the forwarding IP with the visitor's real IP and audit the product's currency prices first.

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
