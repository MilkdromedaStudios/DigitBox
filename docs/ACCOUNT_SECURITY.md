# Account security and rollout

The account API is now shared by the Next rewrite, Pages Functions and the
standalone Worker. Owner privileges come from `OWNER_USER_ID`, or the existing
trusted `deepforge_config.owner_user_id` row. Signup, login, names, email
addresses and clan membership cannot assign or replace that identity.

## Deploy these changes

1. Confirm the ID of the account you already control using its existing
   password. Do not choose an owner by display name. Set `OWNER_USER_ID` to
   that ID in **Cloudflare Pages → Settings → Variables and Secrets**, and
   on any other deployment that serves privileged API routes. This setting
   takes precedence over the old D1 owner row. It is an identifier, not a
   password; it must still be configured on the server, never from a request.
2. Deploy the same revision to every account API host, including any separate
   Worker and previews with production D1 bindings. Do not share the
   production database/secrets with untrusted preview builds.
3. In the D1 console, verify the old owner row and revoke the verified owner's
   old sessions. Replace the placeholder with the ID verified in step 1:

   ```sql
   SELECT value FROM deepforge_config WHERE key = 'owner_user_id';
   DELETE FROM auth_sessions WHERE user_id = 'YOUR_VERIFIED_OWNER_ID';
   ```

   This signs that account out everywhere. Sign in again after deployment.
   Newly created owner/admin sessions expire after eight hours. Regular
   account sessions retain their existing 30-day lifetime. Existing sessions
   are not silently deleted by the deployment.
4. If the legacy Supabase tables are still used, run
   [`supabase/sql/protect_profile_roles.sql`](../supabase/sql/protect_profile_roles.sql)
   in Supabase's SQL Editor as the database owner. Updating the GitHub file
   does **not** apply it to a live database. Review existing admin roles;
   the migration prevents new self-promotion but does not decide which
   existing administrators are legitimate.
5. Verify your own account can open `/admin`, an ordinary account receives
   403 from `/api/admin/session`, and the old owner-repair route returns 410.
   Do not test password guessing or destructive requests against production.

## Protections implemented

- The unauthenticated owner-repair handler is retired and its automatic
  workflow is removed. No public HTTP route writes `owner_user_id`.
- Every account entry point uses one authorization implementation. Owner
  and extra-admin IDs are compared to a user resolved from a valid session.
- Login attempts are limited in D1: 10 per normalized account and 30 per
  edge IP per 15 minutes. Signup is limited to 10 per account/IP in that
  window. Requests beyond the limit return 429 with `Retry-After`. Counters
  are atomic and shared across instances; stored counter keys are hashed.
  A missing trusted edge IP uses a shared fallback bucket. These limits can
  temporarily block a legitimate user targeted by repeated login attempts.
- Passwords remain salted PBKDF2-SHA256 hashes; session tokens are random
  256-bit values and only their SHA-256 digests are stored in D1. New password
  records identify their algorithm/cost. Legacy 100,000/120,000 iteration
  records are accepted on compatible runtimes and upgraded after login.
  Some Workers runtimes reject 120,000 iterations; accounts created with
  that legacy format need a trusted password-reset/migration procedure if
  their runtime cannot verify it. No password check is bypassed on failure.
- Signup requires 12–128 characters; existing passwords continue to work.
  Auth JSON is limited to 4 KiB of actual streamed data.
- Account saves, private clan details and clan changes require the matching
  account's session, including URL-encoded IDs. Guest cloud-save requests
  now require login; a player ID is not a credential.
- Public health checks no longer create test users, sessions or R2 objects.
- The Supabase migration protects profile roles and IDs against browser-side
  updates/inserts while allowing trusted server provisioning. Its admin
  helper avoids recursive row-level-security checks.
- The obsolete email-based admin helper and real project-specific values in
  the environment example are removed. Removing values does not erase Git
  history; any actual secret exposed in history must be revoked at its issuer.
- Next.js is updated to 15.5.28 and PostCSS to 8.5.31, including Next's nested
  PostCSS dependency. The build script removes a leftover temporary export
  marker that otherwise made the deployment packager omit the Edge APIs.

## Remaining security work

This patch does not make the site immune to compromise and does not add
encryption to every private field. Source-code secrecy is not an access control.

The browser currently stores its bearer token in `localStorage`. Legacy game
frames (`components/GameFrame.js`) run scripts with `allow-same-origin`, and
some game/content URLs serve executable HTML on the account site's origin.
Such scripts can access that origin's storage. **Do not treat untrusted game
HTML as safe for an owner session.** Separate game delivery onto an origin
that never hosts account/admin pages or credentials, and migrate game saves
before removing same-origin access. The newer `HubProjectFrame` already uses
an opaque-origin sandbox and a save-message bridge. This requires a hosting
and game-storage change; it is not solved by encrypting a token with a key
shipped to the same browser.

Move browser authentication to a reviewed HttpOnly-cookie session design with
CSRF protection after origin isolation, and add MFA/passkeys or a maintained
identity provider. The current account system has no MFA or verified-email
recovery flow. Enable MFA separately on GitHub and Cloudflare. Hosting secrets
such as GitHub, Stripe and AI credentials must remain server-only.

This review does not verify production D1/Supabase state, deployed secrets,
Git history/archive contents, every bundled game, or hosting access settings.

The production-dependency audit still reports seven findings (five high and
two moderate) in the Tailwind 3 build dependency chain, rooted in `braces`
and `postcss-selector-parser`. These require a separately tested Tailwind
upgrade; this patch does not claim a clean dependency audit. Do not process
untrusted CSS/glob patterns through these build tools. The legacy
`next-on-pages` adapter is also deprecated; plan a supported hosting-adapter
migration rather than assuming future framework upgrades will remain compatible.

## Verification

Run `npm run test:security` with Node 24 for the SQLite-backed account/API
regression suite, then `npm run typecheck` and `npm run build`.
`tests/security/profile-roles.sql` exercises the database migration in a
disposable PostgreSQL database with the documented fixture users. The role
guards, insert protection, ordinary profile edits, recursive policy behavior
and trusted role provisioning were also exercised using PGlite locally.

Cloudflare packaging was checked with:

```sh
CI=1 npm exec --yes --package=@cloudflare/next-on-pages@1.13.16 --package=vercel@47.0.4 -- next-on-pages
```

The output includes all 27 Edge API routes, including login and admin handlers.
Local Wrangler execution was blocked by this environment's network-interface
enumeration error, so live Cloudflare/D1 runtime behavior is not certified by
that packaging check. Apply the production smoke checks above after rollout.

Relevant upstream guidance:

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase column-level security](https://supabase.com/docs/guides/database/postgres/column-level-security)
- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Next.js October 14, 2026 security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
