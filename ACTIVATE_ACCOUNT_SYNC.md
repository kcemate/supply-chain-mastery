# Activate Account Sync

This turns the static beta from browser-local progress into real per-user progress for 300+ users.

## Current State

- Current Cloudflare beta site: `https://scfc-advisor-test.pages.dev/?access=CANON80`
- Static site with latest meter-fit/stretch hotfix: `https://pure-fennel-3dq9.here.now/?access=CANON80&fresh=20260507fit2`
- Previous account-sync site: `https://frosty-mustard-94bf.here.now/?access=CANON80&fresh=20260507orig1`
- Backend progress API: `https://scfc-progress-api-production.up.railway.app`
- Clerk issuer: `https://sharp-seal-99.clerk.accounts.dev`
- Railway project: `scfc-progress-api`
- Frontend account sync: built and configured
- Frontend local state now includes diagnostic intake, first-run checklist, retrieval answers, saved Advisor notes, and mastery proof. These are intentionally part of the account progress blob and should migrate with a signed-in user.
- Backend progress API: deployed
- Database schema: applied
- Note: current here.now publish is anonymous and expires `2026-05-08T20:27:12.015Z` unless claimed.

## Clerk

Create a separate Clerk app for this product.

Recommended settings:

- App name: final product name, or `SCFC`
- Sign-in methods: Email, Google
- Add Apple later if this becomes iOS/native
- Authorized origins:
  - `https://ivory-juniper-2yvj.here.now`
  - `https://frosty-mustard-94bf.here.now`
  - `https://pure-fennel-3dq9.here.now` (needed for the 2026-05-07 meter-fit hotfix; not yet added because Railway CLI is logged out locally)
  - future permanent custom domain

Needed values:

- Publishable key: goes into `config.js`
- Frontend API / issuer URL: used for `CLERK_JWKS_URL` and `CLERK_ISSUER`

Do not put the Clerk secret key in the static site.

Security note: if a Clerk secret key is pasted into chat or logs, rotate it in Clerk. The SCFC backend verifies Clerk JWTs through JWKS and does not need the Clerk secret key.

## Database + API

Recommended fast path: Railway project with one Node service and one Postgres database.

After Railway login:

```bash
cd "/Users/giovanni/Documents/Codex/Supply Chain Mastery/backend"
railway init
railway add --database postgresql
railway variables --set "CLERK_JWKS_URL=https://your-clerk-frontend-api/.well-known/jwks.json"
railway variables --set "CLERK_ISSUER=https://your-clerk-frontend-api"
railway variables --set "ALLOWED_ORIGINS=https://noble-mosaic-vhex.here.now"
railway up --detach
railway run npm run apply-schema
```

Then get the public backend URL from Railway and verify:

```bash
curl https://your-scfc-api.up.railway.app/health
```

## Frontend Config

Update `config.js`:

```js
window.SCFC_CONFIG = {
  apiBaseUrl: "https://your-scfc-api.up.railway.app",
  clerkPublishableKey: "pk_live_or_test_..."
};
```

Then republish here.now:

```bash
cd "/Users/giovanni/.openclaw/workspace/tmp/scfc-fluency-canon-public"
rsync -a "/Users/giovanni/Documents/Codex/Supply Chain Mastery/config.js" .
/Users/giovanni/.openclaw/skills/here-now/scripts/publish.sh . --slug noble-mosaic-vhex --claim-token "$HERENOW_CLAIM_TOKEN" --client openclaw
```

## Acceptance Test

1. Open site in Browser A.
2. Sign in.
3. Complete Day 1 and play/pause audio.
4. Open site in Browser B or private window.
5. Sign in with the same account.
6. Confirm Day 1 completion and audio position hydrate from the server.
7. Confirm the diagnostic intake, retrieval answer, and one saved Advisor note also hydrate. This is the portability smoke for the new usefulness layer.

## Paid Gate Later

The current static code gate is still only a beta gate. Before paid launch, replace it with server-backed entitlement:

- `users.entitlement = beta | paid | comp | revoked`
- Backend checks entitlement on progress routes.
- Frontend hides app until authenticated + entitled.
