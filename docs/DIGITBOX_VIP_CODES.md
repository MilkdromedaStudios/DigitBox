# DigitBox VIP codes

DigitBox has **one shared VIP code** configured in the **Cloudflare Pages production secret named `CODES`**. The code never belongs in GitHub, a `NEXT_PUBLIC_*` variable, or frontend JavaScript.

## Setup

1. In Cloudflare, open **Workers & Pages → your DigitBox Pages project → Settings → Variables and Secrets** (the UI may call this **Environment variables**).
2. Add a **Secret** with name **`CODES`**, and its value as your chosen code. Use a high-entropy random value (ideally **16 or more unpredictable characters**). Enter the raw code, not JSON or quotes.
3. Apply the secret to **Production**. If you also test on preview deployments, configure the preview environment separately.
4. Save and redeploy your Pages project so the new secret is available to the server-side function. Make sure the existing Cloudflare D1 binding **`DB`** is still configured.
5. Log in to DigitBox, visit **/profile → DigitBox Pro**, and click the small **Have a VIP code?** button.

## Behavior

- There is only **one currently accepted code** for the website: the current `CODES` secret.
- You may share the same code with multiple friends. Each signed-in DigitBox account can redeem a code **one time total**, even if you change the secret later.
- Each successful redemption unlocks the existing DigitBox Pro entitlements, including the Pro AI model and limits, for **30 days (720 hours)** starting at redemption.
- When the 30 days end, access returns to free unless a separate paid Stripe subscription is active. Promo access **never creates a Stripe subscription** and does not auto-renew.
- Past redemptions remain valid through their original expiration if you rotate `CODES`; changing it only affects new redemptions.
- Accounts with an active paid Stripe Pro subscription are prevented from wasting a code.
- Server-side checks require a valid DigitBox D1 session; a user cannot unlock Pro with browser localStorage changes alone.
- The backend rejects more than five redemption attempts per account within an hour. Use a hard-to-guess code as the primary protection against brute forcing across many newly registered accounts.

## Implementation

- Cloudflare Pages endpoint: `POST /v1/billing/redeem` (logged-in Bearer session, JSON `{"code":"..."}`)
- Entitlement reporting: `GET /v1/billing/status`
- D1 tables created automatically by the billing function: `promo_redemptions` and `promo_attempts`.
- Backend code: `functions/v1/billing/[[path]].js`
- AI access is enforced server-side in `lib/aiServer.js`, so expired codes cannot continue to access Pro models.
- The code itself is never returned by an endpoint or stored in D1; only its SHA-256 digest is stored for the redemption record.

> The GitHub connector can edit code but cannot set Cloudflare project secrets. Add `CODES` privately in Cloudflare.
