# DigitBox Pro — Stripe setup

DigitBox Pro uses the existing DigitBox account/session system. Stripe billing lives only in the DigitBox Cloudflare backend; Nexus Sidebar never receives Stripe credentials.

## Plans

- Product name: **DigitBox Pro**
- Monthly recurring price: **$1.99 USD / month**
- Yearly recurring price: create a yearly Stripe Price at the annual amount you want to charge, then configure its `price_...` ID below.
- No free trial is configured by the application.
- A signed-in account without Pro has the same Nexus feature limits as Guest mode.
- Pro remains enabled while Stripe reports `active`, `trialing`, or `past_due`.
- If a subscription is scheduled to cancel, Pro remains enabled through the paid billing period.
- Pro is disabled when the Stripe subscription is no longer entitled (for example `unpaid` or `canceled`).

## 1. Create the Stripe product and Prices

In Stripe **test mode** first:

1. Create a product named **DigitBox Pro**.
2. Add a recurring monthly Price for **$1.99 USD**, billed monthly.
3. Add a recurring yearly Price, billed yearly, at the annual amount you choose.
4. Copy both `price_...` IDs.

The app uses hosted Stripe Checkout, so no Stripe publishable key is required for this integration.

## 2. Cloudflare Pages runtime variables

This project currently deploys through Cloudflare's Git integration. GitHub repository secrets are not automatically exposed to the live Pages Functions. Configure these in the DigitBox Cloudflare Pages project's runtime variables/secrets:

### Secrets

- `STRIPE_SECRET_KEY` — start with the Stripe test-mode `sk_test_...` key.
- `STRIPE_WEBHOOK_SECRET` — the `whsec_...` secret for the webhook endpoint created in step 3.

### Variables

- `STRIPE_PRICE_ID_MONTHLY` — monthly `$1.99` Stripe Price ID.
- `STRIPE_PRICE_ID_YEARLY` — yearly Stripe Price ID.
- `DIGITBOX_SITE_URL=https://digitbox.dev`

Do not put `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in source code, `.env.local.example`, Nexus Sidebar, or any browser bundle.

## 3. Add the Stripe webhook

Create a webhook endpoint in the same Stripe mode as the configured secret key:

`https://digitbox.pages.dev/v1/billing/webhook`

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy that endpoint's signing secret (`whsec_...`) into the Cloudflare `STRIPE_WEBHOOK_SECRET` secret.

The webhook is the source of truth for updating the D1 subscription record. Returning from Checkout alone does not grant Pro.

## 4. Configure Stripe Customer Portal

Enable Stripe Customer Portal for the same Stripe mode. At minimum allow customers to:

- update payment methods;
- view billing history;
- cancel subscriptions.

Configure subscription cancellation for **at the end of the billing period**, not immediate cancellation. DigitBox will continue to grant Pro while the subscription remains active through that paid period.

The DigitBox profile page creates Portal sessions server-side for existing Pro subscribers.

## 5. Test before going live

1. Deploy DigitBox with the test-mode Cloudflare values.
2. Log into a normal DigitBox account.
3. Open `/profile` and choose the monthly or yearly DigitBox Pro plan.
4. Complete Stripe Checkout with a Stripe test payment method.
5. Confirm `/v1/billing/status` reports `plan: "pro"` and feature `nexus_pro` for that account.
6. Reload Nexus Sidebar and confirm the full Nexus feature set unlocks.
7. Cancel in Customer Portal and confirm Pro remains enabled until the current period end.
8. Test a failed-payment lifecycle and confirm `past_due` retains Pro while `unpaid`/`canceled` does not.

After the complete flow is verified, create/use the live Product/Prices and webhook, then replace the Cloudflare test values with live-mode values (`sk_live_...`, live `price_...` IDs, and the live webhook's `whsec_...`).

## API routes

- `GET /v1/billing/status` — current DigitBox account's entitlement and billing configuration state.
- `POST /v1/billing/checkout` — creates a monthly/yearly hosted Stripe Checkout session. Requires the existing DigitBox Bearer token.
- `POST /v1/billing/portal` — creates a Stripe Customer Portal session. Requires the existing DigitBox Bearer token.
- `POST /v1/billing/webhook` — Stripe webhook receiver with signature verification.

The billing database table is created automatically in the existing D1 database when the billing API first runs.
