# Synthetic planning expansion verification

Request: add useful synthetic data to Flyway. Route: local repository tools, otto-os-rails, one bounded generator worker, and Impeccable Operate/Clarify on the existing Planning and Locations surfaces. No paid provider, credentials, private data, push, or deployment used.

## Delivered

- `src/syntheticNetwork.ts`: deterministic `sample-expansion-v1`, eight regional distribution hubs, 88 restaurants, 24 suppliers, 112 lanes, and all seven product categories. The serialized addition is 674,418 bytes. City-area coordinates are fictional and checked against their claimed U.S. state geometry. Supply, inventory, demand bands, calendars, lead times, freight and costs are explicit editable assumptions. Redundant product sourcing is modeled without claims about actual contracts.
- `src/SyntheticNetworkPanel.tsx` and app integration: choose **Planning model → Add synthetic network** or the same action in **Locations**. Additions go through the existing revision-checked workspace save. Stable reserved IDs and provenance prevent collisions/duplicates and preserve existing rows, including renamed sites and edited lanes. Saved scenario artifacts, decisions, preferences and starter records are not replaced. The success action opens a real modeled hub with the existing scenario builder.
- Dense planning maps keep hubs prominent and reduce non-selected, non-impacted restaurant/supplier symbols at national zoom. Full pointer and keyboard hit areas and the overlap chooser are retained. Public atlas files, counts, map behavior, and evidence sources are unchanged. All five bundled public data files match the prior GitHub blobs exactly.

## Engine evidence

`npm run test:synthetic-network` passes schema, state containment, seven-product topology, synthetic provenance, stable merge, edit preservation and real four-week scenarios. Isolated expansion results (case-equivalent units):

| Run | Service | Stockout units | Affected restaurants |
| --- | ---: | ---: | ---: |
| Baseline | 100.0% | 0 | 0 |
| Southeast hub outage | 86.3% | 164,980 | 11 |
| Redundant Southeast supplier failure | 100.0% | 0 | 0 |
| Local 65% demand surge | 99.8% | 2,011 | 1 |

Isolated baseline serves 1,206,020 units; its peak replenishment-day utilization reaches 100%. The combined starter workspace keeps its original constrained nodes, so the isolated baseline is not a promise of 100% service after appending to arbitrary existing data. Synthetic ID field evidence on lanes survives revisions to their mutable values.

## Browser and build evidence

The standalone browser run exercised keyboard installation, exact 132-location/124-lane totals, compact-marker overlap selection with a 44 px target, sample evidence inspection, a real one-week hub outage (+41,245 modeled shortage units), frozen scenario save, reload, no duplicate action, and unchanged public coverage. Dark 768 px tablet registry and desktop planning layouts fit. Two axe scans found zero violations. Inspected desktop and dark-tablet views; screenshot and interaction evidence lives in `tasks/browser-evidence/synthetic-network-*.png` and `tasks/browser-evidence/synthetic-network-browser-receipt.json`.

The feature browser exits 1 on two unfiltered headless WebGL ReadPixels warnings; no console errors, page errors, first-party failed requests, or HTTP errors. During integration `npm run verify` passed through the browser-only Decision Intelligence prototype, then exited 1 at the same strict warning check in the connected browser. No release gate was suppressed. Final `npm run build`, focused synthetic/data/platform checks, engine digest, design lint and `git diff --check` passed; existing Vite large-chunk advisory retained. Impeccable detector flagged existing style advisories and two new literal size/radius choices, which were aligned with the established UI scale. No general redesign or production-readiness claim.

Final `dist/index.html` SHA-256: `c7dddd1698582751967529eacfd582dfb3c5a3727bd87c1bd8bfa44d20fa19e2`. Local preview root and `src/syntheticNetwork.ts` both returned HTTP 200 and matched the expected Flyway title/version. No changes published; a remote push or deploy requires separate approval.
