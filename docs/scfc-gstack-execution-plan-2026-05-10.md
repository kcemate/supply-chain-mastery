# SCFC Execution System Plan - 2026-05-10

## Purpose

Use gstack's operating model as methodology for SCFC without blindly adopting its Claude Code routing.

SCFC becomes the pilot project for a disciplined Giovanni/OpenClaw execution loop:

Think -> Plan -> Build -> Review -> QA -> Ship -> Reflect

Current non-negotiable product baseline:

- Preserve the original beige machine / green LCD SCFC interface.
- Treat the Field Notes notebook UI as an experiment, not the product default.
- Preserve the `scfc-masters-v3` state shape, account sync adapter, audio deck, progress model, and v3/v3.1 curriculum.

## Goal

Turn SCFC from a strong static learning artifact into a reliable hosted product path:

- Stable machine/LCD UI
- Account progress sync
- Audio playback persistence
- Clerk/Railway user isolation
- Real mobile geometry verification
- Clear release checklist
- No regressions back to Field Notes

## Dispatch Policy

### Simple

Use for one-file copy, typo, or documentation fixes.

Gate:

- Read affected file.
- Patch.
- Run smallest relevant check.

### Medium

Use for small behavior or styling changes touching `app.js`, `app.css`, `README.md`, or `build/verify.mjs`.

Gate:

- Write a short implementation note.
- Update verifier if behavior is product-critical.
- Run:
  - `node --check app.js`
  - `node --check build/verify.mjs`
  - `node build/verify.mjs`

### Heavy

Use for account sync, auth, backend, deployment, or mobile layout work.

Gate:

- Create/assign Mission Control ticket before work.
- Read `README.md`, `tasks/todo.md`, `tasks/lessons.md`, and this plan.
- Preserve latest product baseline.
- Run frontend, backend, and browser smoke checks.
- Update `tasks/todo.md` or `tasks/lessons.md` when lessons change.

### Full Pipeline

Use for launch readiness and meaningful product changes.

Stages:

1. Office Hours: define the user pain and narrow wedge.
2. CEO Review: cut scope to the highest-leverage release.
3. Eng Review: map state, auth, backend, deployment, failure modes.
4. Design Review: protect machine/LCD visual identity.
5. Build: smallest production increment.
6. Review: code and product regression review.
7. QA: local + hosted + mobile + auth/user isolation where credentials allow.
8. Ship: deploy or prepare handoff with exact blockers.
9. Retro: write what broke, what improved, and what to gate next time.

## SCFC Next Full Pipeline

Recommended sprint:

**SCFC Account Sync Release Candidate**

Outcome:

- A single hosted SCFC URL where the original machine/LCD UI loads with `CANON80`.
- Account sync is either verified end-to-end or explicitly marked local-only with the exact external blocker.
- User A/User B isolation is browser-tested if Clerk/Railway credentials are available.
- Audio, day completion, Day 60 Mastery unlock, source links, and mobile VU meter geometry are verified.

## Verification Contract

Always run:

```bash
node --check app.js
node --check build/verify.mjs
node build/verify.mjs
cd backend && npm run check
```

For hosted releases, also verify:

```bash
curl -I 'https://<host>/?access=CANON80'
curl -I 'https://<host>/audio/day-11.mp3'
curl 'https://<api>/health'
```

Browser smoke must check:

- Access gate accepts `CANON80`.
- Original machine shell is visible.
- Green LCD panel is visible.
- `TOTAL LANDED COST` appears on Today.
- Field Notes `.view-today` is not active as the default Today UI.
- Audio deck is visible and playable.
- Continue/action button is visible.
- Mobile domain meter does not scroll internally or stretch after viewport changes.

## Release Blockers To Track

- Fresh here.now anonymous URLs expire unless claimed or moved to a durable host.
- New frontend origins must be added to Railway `ALLOWED_ORIGINS`.
- Real Clerk/Railway user-isolation smoke requires working credentials.
- Kyle pasted a Clerk secret key in chat previously; rotate it before production trust.
- Railway CLI auth should be checked with `HOME=/Users/giovanni` before calling it blocked.

## Definition Of Done

SCFC work is done only when:

- The original machine/LCD UI is still the default.
- Verifier passes.
- Browser smoke passes.
- Hosted URL and backend URL are recorded.
- Account sync state is explicitly one of:
  - verified end-to-end, or
  - local-only with exact external blocker.
- `tasks/todo.md`, `tasks/lessons.md`, and this doc are updated if the execution contract changes.
