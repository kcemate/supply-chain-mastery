---
colors:
  primary: "#145cd7"
  canvas: "#f3f5f7"
  surface: "#ffffff"
  surfaceSubtle: "#f7f8fa"
  ink: "#17212b"
  muted: "#65717e"
  line: "#dde3e8"
  positive: "#147758"
  warning: "#a65a08"
  danger: "#b52935"
  information: "#145cd7"
typography:
  display:
    fontFamily: "Manrope, 'DM Sans', sans-serif"
    fontSize: 30px
    lineHeight: 36px
    fontWeight: 700
  title:
    fontFamily: "Manrope, 'DM Sans', sans-serif"
    fontSize: 22px
    lineHeight: 28px
    fontWeight: 700
  ui:
    fontFamily: "'DM Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 14px
    lineHeight: 20px
    fontWeight: 500
  micro:
    fontFamily: "'DM Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 13px
    lineHeight: 18px
    fontWeight: 700
  data:
    fontFamily: "'SFMono-Regular', ui-monospace, monospace"
    fontSize: 13px
    lineHeight: 18px
    fontWeight: 600
rounded:
  panel: 16px
  control: 10px
  compact: 9px
  small: 8px
  micro: 6px
  pill: 999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 24px
  6: 32px
  7: 48px
elevation:
  panel: "0 16px 40px rgba(25, 39, 34, 0.10)"
  drawer: "-12px 0 48px rgba(16, 28, 24, 0.18)"
motion:
  quick: "150ms cubic-bezier(0.22, 1, 0.36, 1)"
  fast: "250ms cubic-bezier(0.22, 1, 0.36, 1)"
  drawerOpen: "400ms cubic-bezier(0.22, 1, 0.36, 1)"
  drawerClose: "350ms cubic-bezier(0.22, 1, 0.36, 1)"
---

# Flyway Design System

## Product bar

Flyway is an executive supply-chain control tower, not a generic admin dashboard. The first viewport must answer four questions quickly: what is the network posture, where is exposure concentrated, what changed, and which action deserves attention.

## Visual direction

The interface is calm, spatial, and evidence-aware. Cool neutral canvases and white surfaces support the established blue action accent without borrowing Chick-fil-A brand colors or trade dress. Green identifies public evidence, purple distinguishes modeled assumptions, and risk colors carry semantic meaning only. Maps, readable data, and decision language dominate decoration. UI text is 14 px and secondary labels are at least 13 px.

## Workspace hierarchy

The persistent navigation establishes product scope and opens as a compact rail. A short top bar carries context and global actions; a separate save-state strip distinguishes browser-only work, connected service revisions, and pending or failed writes. The Control Tower has three explicit modes: Public network, Planning model, and Compare scenarios. Public mode displays evidence coverage and unknowns only. Planning mode shows baseline operating assumptions. Compare uses frozen run inputs and measured results. A wide map and a 332 px desktop inspector lead the view; modeled product/period analysis and a paginated impact table follow below. Drawers preserve spatial context and protect editing focus.

## Network map

The primary workspace is a MapLibre atlas using bundled Census-derived state geometry with visible attribution; no raster tile API is required. It opens on the contiguous United States with explicit Hawaii and Alaska controls, and supports pan, zoom, map-click placement, draggable correction, and fit-to-country. Small green restaurant points are admitted only after an official location page provides a matching structured address and a validated directions coordinate. The accepted August snapshot supplies 16 directly named distribution facilities: solid squares represent 13 exact official addresses, dashed/hollow squares represent three city-level records with unresolved official address conflicts, and amber identifies launch/stand-up evidence. Collision-managed labels prioritize selection and expose precision without suggesting operational completeness. State tint communicates official location-page density only, never a service territory.

The default public mode hides the sample operating model, synthetic suppliers, and modeled lanes. They require an explicit switch to Planning or Compare. Clicking a public DC opens a read-only evidence drawer with official links, last verification, precision, lifecycle wording, and conflicts. A national list is an alternative to the map. No public layer implies supplier allocation, DC assignment, routes, capacity, current operating status, or territory where evidence is unavailable. Street routing remains an explicitly unconnected optional provider; manual geometry and modeled mileage are labeled accordingly.

Planning and Locations offer a compact synthetic expansion panel with counts and a visible fictional-data label. Adding appends the missing modeled records through the current workspace's revisioned save path; it does not replace data, create decision history, or appear in the public atlas. The installed action opens a sample hub so users can inspect its assumptions or create a real scenario. The panel wraps at tablet widths using existing action, surface, and evidence styles. Dense planning maps use smaller overview symbols for restaurants and suppliers, with full touch targets, overlap selection, and larger symbols on zoom or focus. Hubs, selected sites, and impacted sites retain visual priority.

Map markers must retain the mapping engine's absolute positioning; component styles cannot place them in document flow. When facilities occupy the same screen area, a nonmodal "Choose a location" list names each public or modeled entity explicitly. Selection never makes its coincident peers unreachable. The chooser uses touch-sized native buttons, sits above markers, and restores focus on Escape.

## Evidence language

Field evidence distinguishes verified identity from assumed capacity, inventory, and transport. Edited values become user inputs without replacing the original public source. Review actions retain actor, time, reason, candidate artifacts, and publication lineage. Results expose the complete frozen input, actual engine-source digest, SHA-256 input identity, output checksum, product-period trace, cost reconciliation, and limitations. The copilot explicitly separates calculated Model tools from configured AI + model tools. It names its current or frozen context, displays saved conversations and actual tool traces, and exposes setup or provider failure states without a fake AI fallback. Proposed changes pass the same deterministic domain policy in either mode.

## Decision Intelligence

Decision Intelligence is an operating workspace within the existing visual system: a compact decision summary, Human queue / Decision history / Autonomy policy navigation, a searchable two-column decision list, and a selected detail panel. The detail leads with status and decision authority, then measured before/after impact, proposed changes, policy routing, immutable calculation evidence and event history. Large or structural changes require a reasoned approve, defer or reject action. Low-risk automatic applications are labeled as policy automation, not proof that an LLM reasoned about or executed them. A persistent planning-only boundary explains that approvals do not execute real operating actions, and capacity investment costs are outside modeled landed cost.

The policy editor can tighten, not exceed, hard prototype ceilings. Loading locks prevent duplicate action submissions; failures preserve the reason or draft. No sample decision history is invented. Empty queues explain how to run analysis. Tablet layouts stack the detail below the list without hiding approval controls. Long identifiers wrap; metrics use tabular figures. Copilot remains a focused drawer with a fixed composer and scrolling, persisted history.

The policy editor explains the mandatory measured benefit over doing nothing. Scenario results show shortage-unit and shortage-cost changes separately; the cost is the modeled shortage penalty, not an allocation of shared freight or facility costs. Out-of-radius contingency cards label the exception and human approval requirement. Opening a response draft is explicitly a what-if calculation, not an approval or baseline update.

Saved-result pages show explicit loading, failure, retry, and pagination states. Product/period totals cover the complete selected scope, not only the visible table page; cost remains clearly labeled as the full frozen horizon. Failed reads never substitute live-model values. A completed result that cannot be persisted remains visibly unsaved in memory, protects tab closure, and blocks workspace replacement until a successful save. Exact frozen-input JSON and detailed diagnostics are progressively disclosed.

## Responsive behavior

Desktop supports the full map-and-insight composition. Tablet stacks the decision rail below the map, increases touch targets, and converts dense grids into fewer columns. Drawers remain full-height and bounded to the viewport. Phone layouts are a readable fallback, not a version-one optimization target. Narrow-screen copilot form controls intentionally use 16px text to prevent automatic browser zoom when focused.

## Interaction and accessibility

Primary actions are visible; advanced controls use progressive disclosure. Focus indicators are never removed. Shape, icon, label, and color jointly communicate status. Motion respects reduced-motion settings. Semantic landmarks, headings, controls, tables, and live regions support basic keyboard and screen-reader use.

## Guardrails

Do not add Chick-fil-A logos, proprietary visual assets, invented public claims, or unlabeled estimates. Do not imply live operational accuracy. Avoid ornamental charts, dense modal stacks, hidden destructive actions, and recommendations without causal explanations.
