# Agent Context — Flyway

## Purpose

- Build Flyway, an independent U.S. quick-service restaurant supply-chain digital twin for executive scenario planning.
- The product is inspired only by publicly available Chick-fil-A information and must clearly distinguish verified public records from editable sample estimates.

## Read first

- `docs/chick-fil-a-digital-twin-build-spec.md` — authoritative product, UI, modeling, architecture, and acceptance specification.
- `README.md` — local development and verification commands.
- `DESIGN.md` — active design tokens and interaction direction; update it when the product design changes.
- `tasks/todo.md` — current build checklist and verification review.

## Hard constraints

- Do not use Chick-fil-A logos, trade dress, private systems, confidential data, nonpublic relationships, or invented real supplier identities.
- Every unsupported operating value must remain visibly labeled as a sample estimate or user input.
- Preserve deterministic scenario results: identical frozen inputs and engine version must produce identical outputs.
- Do not replace typed simulation calculations with AI-generated numbers.
- Preserve unrelated user work already present in the dirty worktree.
- Do not touch secrets, credentials, paid services, external sends, production, deletes, or shared-service restarts without approval.

## Validation

- Primary: `npm run verify`
- Design: `npm run design:lint`
- Before reporting done, include real build, browser, responsive, and browser-health output plus inspected screenshots.

## Workflow

- For long build/refactor/test work, keep `tasks/flyway-goal-contract.md` current.
- Track material progress and review evidence in `tasks/todo.md`; do not store task progress here.
- Do not weaken, skip, narrow, or fake tests to make validation pass.
- Keep changes scoped to Flyway and use the specification's requirement IDs in tests where practical.
- For handoff/resume, record authoritative paths, validation output, and remaining gaps.

## Pitfalls

- The current repository began as ContinuityOS; stale procurement copy, tests, screenshots, and docs must not be mistaken for Flyway behavior.
- Public Chick-fil-A Supply announcements and job listings are evidence snapshots, not a complete current distribution-center registry.
- A national map must remain usable without external map or geocoding services; provider outages cannot block core workflows.
- Tablet support is required; phone authoring may be read-only, but primary actions cannot become inaccessible.

## Approval gates

- Ask before publishing, sending, spending, deleting material data, merging/deploying, restarting shared services, touching credentials, or changing production schedules.
