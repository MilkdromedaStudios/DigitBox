# Browser Console Triage Workflow

## Goal
Only treat errors from the app's own origin as actionable bugs. Ignore noise from browser extensions.

## Compare normal vs incognito
1. Open the app in a normal Chrome window and record console errors.
2. Open the same URL in an incognito window with extensions disabled and record console errors.
3. Compare both logs:
   - If an error appears only in normal mode and stack/frame URL starts with `chrome-extension://`, classify it as **extension noise**.
   - If an error appears in both modes or comes from your site origin (`http://localhost:*`, your production domain) classify it as **app issue**.

## Triage rules
- **Exclude** any error whose source URL begins with `chrome-extension://` from app bug tickets.
- **Keep** errors from:
  - application origin URLs
  - Next.js bundles (`/_next/static/...`)
  - app API routes
  - source-map resolution failures for app bundles

## Source maps
When investigating production-only client errors, use source maps to map minified stack traces back to source files.

This repository enables browser source maps in production builds via `productionBrowserSourceMaps` in `next.config.js`.
