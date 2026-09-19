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

## Stripe environments

DigitBox does **not** require Stripe test mode or a Stripe sandbox. The backend is environment-agnostic: Stripe determines the environment from the credentials and Price IDs you configure.

You may configure DigitBox directly with live Stripe values:

- live secret key: `sk_live_...`
- live monthly Price ID: `price_...`
- live yearly Price ID: `price_...`
- live webhook signing secret: `whsec_...`

All Stripe resources used together must belong to the same environment. Do not mix a live secret key with sandbox/test Price IDs or a sandbox/test webhook secret.

Sandbox/test mode remains optional if you want to verify the purchase flow without creating real charges.

## 1. Create the Stripe product and Prices

In the Stripe environment you intend to use (live is supported directly):

1. Create a product named **DigitBox Pro**.
2. Add a recurring monthly Price for **$1.99 USD**, billed monthly.
3. Add a recurring yearly Price, billed yearly, at the annual amount you choose.
4. Copy both `price_...` IDs.

The app uses hosted Stripe Checkout, so no Stripe publishable key is required for this integration.

## 2. Cloudflare Pages runtime variables

This project currently deploys through Cloudflare's Git integration. GitHub repository secrets are not automatically exposed to the live Pages Functions. Configure these in the DigitBox Cloudflare Pages project's runtime variables/secrets:

### Secrets

- `STRIPE_SECRET_KEY` — use the secret key for your chosen Stripe environment. For direct production setup, use the live `sk_live_...` key.
- `STRIPE_WEBHOOK_SECRET` — the `whsec_...` secret for the webhook endpoint created in step 3 in that same environment.

### Variables

- `STRIPE_PRICE_ID_MONTHLY` — monthly `$1.99` Stripe Price ID from the same Stripe environment.
- `STRIPE_PRICE_ID_YEARLY` — yearly Stripe Price ID from the same Stripe environment.
- `DIGITBOX_SITE_URL=https://digitbox.dev`

Do not put `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in source code, `.env.local.example`, Nexus Sidebar, or any browser bundle.

## 3. Add the Stripe webhook

Create a webhook endpoint in the same Stripe environment as the configured secret key:

`https://digitbox.pages.dev/v1/billing/webhook`

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy that endpoint's signing secret (`whsec_...`) into the Cloudflare `STRIPE_WEBHOOK_SECRET` secret.

The webhook is the source of truth for updating the D1 subscription record. Returning from Checkout alone does not grant Pro.

## 4. Configure Stripe Customer Portal

Enable Stripe Customer Portal for the same Stripe environment. At minimum allow customers to:

- update payment methods;
- view billing history;
- cancel subscriptions.

Configure subscription cancellation for **at the end of the billing period**, not immediate cancellation. DigitBox will continue to grant Pro while the subscription remains active through that paid period.

The DigitBox profile page creates Portal sessions server-side for existing Pro subscribers.

## 5. Live setup

You can launch directly in Stripe live mode:

1. Activate your Stripe account for live payments if Stripe requires any remaining business/account details.
2. Create the live DigitBox Pro product and live monthly/yearly Prices.
3. Configure Cloudflare with the live `sk_live_...` key and live `price_...` IDs.
4. Create the webhook in Stripe's live environment and configure its live `whsec_...` in Cloudflare.
5. Configure Customer Portal in the live environment.
6. Log into a normal DigitBox account and open `/profile`.
7. Choose the monthly or yearly DigitBox Pro plan and complete Checkout with a real payment method.
8. Confirm `/v1/billing/status` reports `plan: "pro"` and feature `nexus_pro` for that account.
9. Reload Nexus Sidebar and confirm the full Nexus feature set unlocks.

A direct live checkout creates a real Stripe customer/subscription and can create a real charge. If you want a no-charge rehearsal first, use Stripe's sandbox/test environment with a complete matching set of sandbox/test keys, Prices, webhook, and Portal configuration, then swap the entire set to live values afterward.

## API routes

- `GET /v1/billing/status` — current DigitBox account's entitlement and billing configuration state.
- `POST /v1/billing/checkout` — creates a monthly/yearly hosted Stripe Checkout session. Requires the existing DigitBox Bearer token.
- `POST /v1/billing/portal` — creates a Stripe Customer Portal session. Requires the existing DigitBox Bearer token.
- `POST /v1/billing/webhook` — Stripe webhook receiver with signature verification.

The billing database table is created automatically in the existing D1 database when the billing API first runs.
