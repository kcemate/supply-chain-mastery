# Build Specification: U.S. Quick-Service Restaurant Supply-Chain Digital Twin

**Working title:** ServiceFlow Twin\
**Product framing:** Independent educational and decision-support simulation inspired by publicly available information about Chick-fil-A\
**Specification status:** Implementation-ready v1.0\
**Prepared:** August 20, 2026\
**Primary user:** Supply-chain executive\
**Initial geography:** United States and Washington, D.C.; exclude international locations and Puerto Rico from the default model\
**Initial user model:** One authenticated or locally provisioned user per deployment; no collaboration in the first release\
**Target:** Production-grade operational software delivered through staged releases, beginning with a low-cost single-user foundation

**November 6 scope amendment:** The user's later confirmed selections add bounded autonomous planning-model changes, single-owner human approvals, and a real tool-using AI copilot with saved conversations and decisions. Section 26 supersedes earlier statements prohibiting all automatic mutation or approvals. It does not authorize real-world operating execution or waive production acceptance gates.

---

## 1. Executive Summary

ServiceFlow Twin is a map-and-dashboard application for modeling a U.S. restaurant supply network made of exactly three location types: restaurants, distribution centers, and suppliers. A user can add, edit, move, connect, deactivate, and delete locations; configure product flows, capacity, inventory, lead times, operating schedules, delivery constraints, and demand; create a saved scenario; simulate a change; and compare the outcome with a frozen baseline.

The application answers five executive questions:

1. Where should capacity or a facility be added?
2. Which suppliers and distribution centers should serve each restaurant?
3. What happens if a supplier or distribution center becomes unavailable?
4. How much inventory and throughput capacity should the network hold?
5. Which routes and service areas best protect service while controlling total landed cost?

The first release uses deterministic daily or weekly simulation. It recommends improvements but does not automatically mutate the network. Probabilistic simulation is a planned extension. The experience opens with a cited public-location network plus conspicuously labeled synthetic operational assumptions. Users can inspect the source, confidence, verification date, and edit history of every imported or estimated value.

The product must never imply that it is affiliated with, endorsed by, connected to, or operating on behalf of Chick-fil-A, Inc. It must not use Chick-fil-A logos, trade dress, proprietary imagery, or nonpublic information.

---

## 2. Binding Product Decisions

This section records the user's selections as build constraints.

| Area | Binding decision |
|---|---|
| Audience | Supply-chain executives |
| Primary use | Network visualization, scenario planning, disruption simulation, capacity/cost analysis, and education |
| Decisions | Facility placement, supplier allocation, disruption response, inventory/capacity, routes/service areas |
| Framing | Independent simulation inspired by public information |
| Branding | No Chick-fil-A logo; persistent non-affiliation disclosure |
| Sources | Official company sources, government datasets, credible journalism, trade publications, job listings, and public mapping sources |
| Provenance | Citation, confidence, and last-verified date are visible |
| First launch | Preloaded public locations with sample estimates |
| Geography | United States; no international support in v1 |
| Nodes | Restaurants, distribution centers, suppliers only |
| Location entry | Manual form and map click |
| Geocoding | Automatic with draggable correction |
| Products | Chicken, produce, buns/bakery, packaging, beverages, cooking oil, equipment |
| Connections | User-created plus system-recommended |
| Forecast | Restaurant-level, editable assumptions |
| DC model | Inventory and replenishment |
| Time grain | Daily or weekly, selected per scenario |
| Simulation | Deterministic in v1; probabilistic later |
| V1 scenarios | Add or close a location; supplier failure; distribution-center outage; demand surge; severe weather; price changes; capacity constraint |
| Transportation | Vehicle types, routes/mileage, delivery windows, travel and dwell time, fuel/freight cost, and driver constraints |
| Comparison | Baseline versus scenario, including explanations |
| Scenario persistence | Save |
| Experience | Responsive desktop/tablet control tower, light and dark modes |
| Complexity | Progressive disclosure |
| Accessibility | Keyboard and screen-reader basics are mandatory; implementation should target WCAG 2.2 AA where feasible |
| AI | Copilot grounded in active model state and cited sources |
| Collaboration | None in v1; workspace isolation later |
| Synthetic data | Permitted only when clearly labeled and editable |
| Delivery | Production-grade target with a low-cost initial operating posture |

### 2.1 Interpretation of apparent tensions

- **Single-user prototype versus production-grade system:** “Single-user” limits the first product experience, not engineering quality. The software uses durable storage, migrations, observability, deterministic runs, backups, security controls, and explicit interfaces. Multi-tenancy is deferred, not made impossible.
- **Low cost versus national scope:** The system stores national reference data but computes only the active scenario subgraph. Routing results are cached, simulations run asynchronously, and external services sit behind provider adapters.
- **Public facts versus an operational twin:** Public sources can establish many locations and general network characteristics, but not reliable site-level demand, contracts, inventory, throughput, or supplier allocation. Those fields begin as synthetic assumptions with visible provenance.

---

## 3. Public-Information Basis and Data Boundary

### 3.1 Facts the seed experience may represent

The official Chick-fil-A business page describes more than 3,000 locations across 48 states, Washington, D.C., Puerto Rico, and Canada. The official location browser publishes state-level restaurant listings, and the company page now describes a broader international footprint. Because this product's selected scope is the U.S., the seed importer must include only locations in the 50 states and Washington, D.C., while omitting Puerto Rico and other countries. Sources: [Chick-fil-A business page](https://www.chick-fil-a.com/do-business-with-us), [official location browser](https://www.chick-fil-a.com/locations/browse), and [company overview](https://www.chick-fil-a.com/about/company).

An official July 2024 article stated that Chick-fil-A Supply would operate nine distribution centers by the end of 2024, in Georgia, North Carolina, Tennessee, Missouri, Ohio, Kansas, and Texas, and would deliver to more than 1,000 restaurants. It also stated that the wider distribution network includes partner distributors. This is a dated historical snapshot, not proof of the current 2026 network. Source: [Five Things to Know About Chick-fil-A Supply](https://www.chick-fil-a.com/press-room/chick-fil-a-supply-five-years-supporting-restaurants).

Current Chick-fil-A Supply career listings identify operational or recruiting locations in multiple U.S. cities and describe Chick-fil-A Supply as a wholly owned distribution service provider for restaurants. Individual postings may include facility addresses, inventory-control responsibilities, food-safety practices, fleet operations, contingency planning, and distribution scale. Job postings can corroborate a candidate facility but do not constitute a complete facility registry. Sources: [Chick-fil-A Supply career locations](https://careers.chick-fil-a.com/supply/jobs/locations), [Cartersville facility example](https://careers.chick-fil-a.com/corporate/jobs/19443), [Charlotte-area facility example](https://careers.chick-fil-a.com/supply/jobs/19756?lang=en-us), and [Salt Lake City operations example](https://careers.chick-fil-a.com/supply/jobs/17753?lang=en-us).

An official Chick-fil-A technology job listing described a supply chain with more than 10 distribution partners and more than 20 production facilities, without identifying the complete supplier network. The product may use this only as evidence that the real network is larger and more complex than the public named-facility list; it must not invent identities or relationships from that aggregate statement. Source: [Supply Chain Technology role](https://careers.chick-fil-a.com/jobs/20191-internal?lang=en-us).

### 3.2 Facts the seed experience must not claim

Unless a source directly supports the exact value, do not present any of the following as verified Chick-fil-A facts:

- supplier identity, address, contract status, price, allocation, or production volume;
- restaurant sales, demand, inventory, safety stock, order frequency, or stockouts;
- distribution-center capacity, inventory, throughput, utilization, costs, or restaurant assignments;
- delivery routes, fleet size, route schedules, delivery windows, dwell times, or driver rosters;
- product recipes, bills of material, proprietary specifications, yield, waste, or shelf-life requirements;
- internal resilience plans, target service levels, or sourcing strategy.

These values may exist as synthetic examples only. The UI must label them **Sample estimate** at the field, record, scenario, result, and copilot-response level.

### 3.3 Provenance taxonomy

Every material fact is stored as an `EvidenceValue`, not as an unqualified scalar.

| Classification | Meaning | UI label | Default confidence |
|---|---|---|---:|
| Verified public | Exact claim supported by a first-party or authoritative government source | Verified public | 0.90–1.00 |
| Corroborated public | Supported by at least two credible public sources or a source not intended as a registry | Corroborated | 0.70–0.89 |
| User supplied | Entered or edited by the user | User input | Not scored |
| Derived | Computed from cited inputs and a named formula | Derived | Inherits lowest input confidence |
| Synthetic | Illustrative assumption with no claim of real-world accuracy | Sample estimate | 0.00 |
| Stale | Previously sourced but beyond its refresh threshold | Needs review | Existing score minus staleness penalty |

Required evidence fields:

```text
value
unit
classification
confidence (0.00–1.00 or null for user input)
source_id
source_url
source_title
source_publisher
source_published_at
verified_at
effective_from / effective_to
extraction_method
extractor_version
review_status
review_note
```

### 3.4 Refresh and review policy

- Restaurant locations: check weekly; mark stale after 30 days.
- Distribution-center candidates from official announcements or job listings: check monthly; mark stale after 90 days.
- Government price series: refresh on the source's publication cadence.
- Active weather alerts: refresh at least every five minutes while the disruption layer is enabled.
- User-entered data: never overwrite during refresh. Offer a side-by-side conflict review.
- Removed public records: soft-retire; do not delete from saved baselines or historical scenarios.
- Any automated extraction with an address or entity-name change enters `needs_review` before replacing a verified record.

---

## 4. Product Goals, Non-Goals, and Success Measures

### 4.1 Goals

1. Let an executive understand the modeled network posture in under 60 seconds.
2. Let a user add a valid restaurant, distribution center, or supplier in under 90 seconds.
3. Let a user create, run, understand, and save a deterministic scenario without training.
4. Make every recommendation traceable to model inputs, constraints, and formulas.
5. Prevent synthetic assumptions from being mistaken for verified company facts.
6. Produce repeatable scenario results from an immutable input snapshot.
7. Support national reference data while keeping interactive map and simulation latency acceptable.

### 4.2 Non-goals for v1

- Real-time vehicle telematics or dispatch execution.
- Purchase-order, warehouse-management, ERP, or restaurant POS integration.
- Automatic supplier onboarding or contract optimization.
- Multi-user editing, approvals, comments, organization administration, or sharing.
- International networks or currency conversion.
- Probabilistic/Monte Carlo results.
- Route turn-by-turn navigation.
- Exact reconstruction of Chick-fil-A's private network.
- Autonomous changes to inventory, allocation, routes, or facilities.

### 4.3 Product success measures

| Measure | Target |
|---|---:|
| First-run guided scenario completion | ≥80% of usability-test participants without facilitator help |
| Median add-location completion | ≤90 seconds |
| Scenario result reproducibility | 100% for identical snapshot, engine version, and seed |
| Unsupported factual claims in seeded data | 0 |
| Material results with visible input lineage | 100% |
| Desktop initial interactive load on representative production data | p75 ≤3.0 s on a modern laptop and broadband |
| Map pan/zoom | 55–60 fps target; never block input for >100 ms |
| Scenario run for 3,500 restaurants, 25 DCs, 100 suppliers, seven product groups, weekly horizon | p95 ≤60 s |
| Saved scenario recovery after service restart | 100% |

---

## 5. User and Jobs to Be Done

### 5.1 Primary persona

**Executive network sponsor**

- Reviews service, stockout exposure, landed cost, and utilization.
- Wants exceptions and decisions, not warehouse-level transaction detail.
- Needs a defensible explanation before accepting a recommendation.
- Uses a desktop for analysis and a tablet for review.
- May not know GIS conventions or optimization terminology.

### 5.2 Primary jobs

- “Show me where the network is constrained.”
- “If this supplier or DC is unavailable, which restaurants are affected?”
- “Would a new DC improve service enough to justify its modeled cost?”
- “Which restaurants should be reassigned to another DC?”
- “How much safety stock is needed to cover the modeled lead time?”
- “What assumptions drove this result, and which are synthetic?”
- “Save this scenario so I can return to it later.”

---

## 6. Experience Principles and Visual System

### 6.1 Experience principles

1. **Decision before detail:** Lead with status, change, impact, and recommended action.
2. **Map as workspace:** The map is where users select, add, connect, and understand facilities.
3. **Evidence is part of the interface:** Provenance is never hidden in an appendix.
4. **Progressive disclosure:** Show executive defaults first; reveal model controls when asked.
5. **One scenario truth:** Always show whether the user is viewing Baseline, Draft scenario, Running, or Results.
6. **No unexplained red:** Every exception must state what failed, what is affected, and what action is available.
7. **Human confirmation:** Recommendations are proposals with “Apply to draft,” never silent edits.

### 6.2 Brand and legal presentation

- Product name and iconography must be original.
- Do not reproduce Chick-fil-A logos, cow campaign art, proprietary photographs, menu imagery, or signature red-and-white trade dress.
- The persistent footer or About panel must state: “Independent educational simulation built from public sources and editable sample assumptions. Not affiliated with or endorsed by Chick-fil-A, Inc.”
- The onboarding disclosure requires acknowledgment before the seeded network is opened the first time.
- References to Chick-fil-A appear only in descriptive copy, source titles, and source-linked dataset labels.

### 6.3 Design tokens

Use a modern, restrained control-tower aesthetic.

| Token | Light | Dark | Usage |
|---|---|---|---|
| Canvas | `#F4F6F8` | `#0E1116` | App background |
| Surface | `#FFFFFF` | `#171B22` | Panels and drawers |
| Elevated | `#FFFFFF` | `#1E242D` | Menus and dialogs |
| Text primary | `#17202A` | `#F2F5F7` | Essential text |
| Text secondary | `#5B6673` | `#AAB4C0` | Supporting text |
| Border | `#D9E0E7` | `#313946` | Dividers and controls |
| Action | `#1769E0` | `#6EA8FF` | Primary actions and focus |
| Healthy | `#16825D` | `#52C99A` | In-tolerance status |
| Warning | `#B76100` | `#FFB45B` | Capacity or service warning |
| Critical | `#B4232C` | `#FF777F` | Failure or stockout |
| Synthetic | `#7257C7` | `#B7A2FF` | Sample-estimate identity |

- Typeface: Inter or system sans; tabular figures for metrics.
- Base font: 15–16 px desktop, 16 px form controls, never below 12 px for secondary metadata.
- Headings: maximum 32 px on primary dashboard; avoid marketing-scale headlines.
- Grid: 8 px base; page gutters 24 px desktop, 16 px tablet.
- Control height: 40 px desktop; 44 px tablet/touch.
- Radius: 8 px controls, 10 px panels, 12 px dialogs.
- Focus: 2 px action-color outline with 2 px offset; never remove native focus without replacement.
- Motion: 160–220 ms for drawers and filters; simulation state transitions may use progress motion but must honor reduced-motion settings.

### 6.4 Stable visual encoding

- Restaurant: circular marker with fork/knife or storefront glyph.
- Distribution center: square marker with warehouse glyph.
- Supplier: diamond marker with factory/box glyph.
- Manual/user data: solid marker.
- Verified public: solid marker plus small check in details, not on every map point.
- Synthetic: striped or dotted marker interior and “Sample estimate” in details.
- Disrupted: critical outer ring plus disruption glyph.
- Selected: action-color halo and high-contrast outline.
- Connection: neutral line; product selection colors the active line only.
- Recommended connection: dashed action-color line until applied.
- Never encode meaning by color alone; pair color with shape, icon, line style, and text.

---

## 7. Information Architecture

Primary navigation contains five destinations:

1. **Control Tower** — default map-and-dashboard workspace.
2. **Scenarios** — saved scenarios, status, and comparison entry points.
3. **Locations** — searchable table of restaurants, DCs, and suppliers.
4. **Data & Sources** — provenance, refresh history, assumptions, and conflicts.
5. **Settings** — units, appearance, routing provider, model defaults, and data management.

The Copilot is a global right-side panel opened from the top bar; it is not a sixth navigation destination.

### 7.1 Global object hierarchy

```text
Workspace
├── Baseline network
│   ├── Locations
│   │   ├── Restaurants
│   │   ├── Distribution centers
│   │   └── Suppliers
│   ├── Products
│   ├── Connections and lanes
│   ├── Demand assumptions
│   ├── Inventory policies
│   └── Evidence and sources
├── Saved scenarios
│   ├── Immutable input snapshot
│   ├── Scenario changes
│   ├── Simulation runs
│   └── Recommendations
└── Settings
```

---

## 8. Detailed UI Specification

## 8.1 Application shell

### Desktop, ≥1280 px

- Top bar: 64 px high, fixed within the application.
- Left rail: 232 px expanded; collapsible to 64 px. Navigation labels remain visible by default.
- Main content: fills remaining width and height.
- Right drawers: 400 px for location and scenario details; 440 px for Copilot. Only one persistent right drawer is open at a time. A modal confirmation may appear above it.
- Bottom status strip over the map: content-sized, not full height.

Top-bar order:

1. Product wordmark.
2. Scenario context control: `Baseline` or saved scenario name.
3. Status chip: `Viewing baseline`, `Draft`, `Running`, `Results`, or `Unsaved changes`.
4. Time-grain control: Daily / Weekly when relevant.
5. Data freshness button: opens source health popover.
6. Theme button.
7. Copilot button with text label.
8. User/settings menu.

### Tablet, 768–1279 px

- Top bar: 64 px.
- Navigation becomes a 72 px icon rail in landscape and a slide-over menu in portrait.
- Dashboard insight rail collapses into a bottom sheet with three snap states: closed summary, half, and nearly full.
- Detail drawers occupy min(440 px, 88% viewport width).
- Hover-only behavior is prohibited. Every hover tooltip has an equivalent tap/focus action.

### Unsupported phone behavior

Widths below 768 px show a usable read-only summary and a message recommending tablet or desktop for editing. Critical dialogs must not become inaccessible, but full network authoring is not a v1 acceptance target.

## 8.2 First-run onboarding

The first-run experience is a four-step, non-skippable-at-step-1 flow.

### Step 1 — Product boundary

- Heading: “Explore a public-data supply network.”
- Two short paragraphs explain independent status and synthetic assumptions.
- Display the non-affiliation disclosure in a bordered neutral notice.
- Checkbox: “I understand this is not an official Chick-fil-A system.”
- Continue remains disabled until checked.

### Step 2 — Choose starting network

- Option A, selected: “Public locations + sample operating assumptions.”
- Option B: “Empty network.”
- Each option states node counts, source snapshot date, and whether synthetic values are included.
- “Preview data sources” opens an inline disclosure, not a new tab.

### Step 3 — Executive priorities

- Four reorderable or selectable priorities: service level, stockouts, total landed cost, capacity utilization.
- Defaults: service level, stockouts, cost, utilization.
- These weights affect ranking and recommendation explanations, not raw metric calculations.

### Step 4 — Guided scenario

- Offer “Run the 5-minute guided DC outage scenario” and “Go to Control Tower.”
- The guided scenario spotlights: select DC, create scenario, mark unavailable, run, compare, apply a recommendation to draft, save.
- Progress is persistent if the user exits.

## 8.3 Control Tower — primary screen

### Layout

Desktop uses a 70/30 split:

- Left 70%: map workspace.
- Right 30%, minimum 360 px and maximum 440 px: executive insight rail.
- At widths below 1100 px, insight rail becomes a bottom sheet.

### Header band

Immediately below the top bar, show a 56 px decision band:

- Left: current context and effective date, e.g. `Baseline • Week of Aug 17, 2026`.
- Center: active filters summarized as removable tokens.
- Right: `Add location` secondary button and `Create scenario` primary button.

### Map toolbar

Vertically stacked at the upper-left of the map:

- Zoom in/out.
- Fit network.
- Layer button.
- Map style button.
- Measurement tool only when advanced controls are expanded.

Layer popover:

- Locations: Restaurants, Distribution centers, Suppliers.
- Network: Active lanes, Recommended lanes, Service areas.
- Risk: Weather alerts, Disruptions, Capacity pressure, Stockout exposure.
- Labels: Names, Status, Utilization.
- Each group has a master checkbox and individual checkboxes.
- The layer menu shows the source timestamp for live/public overlays.

### Search

- Search field sits at the upper center of the map, max width 420 px.
- Searches location name, address, city, state, and internal identifier.
- Results group by location type, then show name, locality, status, and provenance label.
- Arrow keys navigate; Enter selects and zooms; Escape closes.
- Do not use the public Nominatim endpoint for client-side autocomplete. A production geocoder adapter must use a commercial provider or self-hosted service. The public Nominatim policy prohibits heavy use and client autocomplete and imposes strict rate and attribution requirements: [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

### Map interactions

- Single click/tap a marker: select, center if partly obscured, open compact detail drawer.
- Double click: zoom one level and retain selection.
- Shift-click: multi-select locations for comparison or connection.
- Click empty map while `Add location` is active: place draft marker and open creation drawer.
- Drag is disabled for existing locations until Edit mode is explicitly entered.
- Lasso selection is an advanced control.
- Cluster markers at national zoom. Cluster label shows total count; cluster ring segments summarize location types.
- Clicking a cluster zooms to bounds; it never opens a 100-row popover.
- At closer zoom, overlapping nodes spiderfy or offset without changing stored coordinates.

### Map bottom status strip

Show:

- visible location count / total count;
- active product filter;
- route-calculation source and timestamp;
- `Public facts` and `Sample estimates` legend controls;
- a “Map data attribution” link.

### Executive insight rail

Order is fixed by decision value:

1. **Network posture:** one sentence, e.g. “Service is within target; two DCs exceed modeled weekly capacity.”
2. **Four metric cards:** service level, projected stockouts, total landed cost, DC utilization. Each contains current value, target, and baseline delta if viewing a scenario.
3. **Decisions needed:** maximum five ranked items with severity, business impact, recommendation, and `Review` action.
4. **Capacity pressure:** compact ranked bars for DCs; selecting one filters and zooms the map.
5. **Source health:** collapsed by default; shows stale, conflicting, and synthetic material inputs.

Metric cards are buttons. Activating one changes the map layer and opens its explanation; it does not navigate away.

## 8.4 Add Location workflow

Entry points:

- `Add location` in the Control Tower decision band.
- Context menu on the map.
- `New location` in the Locations page.

The workflow is a right drawer, not a centered modal, so the map remains visible.

### Step A — Select type

Three large radio choices with stable icons:

- Restaurant.
- Distribution center.
- Supplier.

Explain downstream consequences in one line per type. Type cannot change after the location is saved if flows or inventory records exist; the user must create a replacement.

### Step B — Find or place

Two tabs:

- **Address:** name and street-address fields; `Find on map` geocodes.
- **Map:** instruction “Click the map to place this location.”

Geocoding states:

- Searching: inline spinner and nonblocking status.
- One high-confidence match: place draft marker and show standardized address.
- Multiple matches: list up to five with locality and confidence; user selects one.
- No match: preserve typed address, allow manual map placement, and set `geocode_status=manual`.
- Service failure: state that the address was not lost; allow retry or manual placement.

Once placed, the marker is draggable. While dragging, show latitude/longitude and a guideline to the original geocode. On release, reverse-geocode if the provider permits it. A `Reset to matched address` action remains until save.

### Step C — Core details

Common fields:

- Location name, required, 2–100 characters.
- External or internal ID, optional, unique if present.
- Full address, required unless latitude/longitude are explicitly marked authoritative.
- Latitude and longitude, required, valid U.S. bounds, six-decimal storage precision.
- Time zone, derived from coordinates, editable.
- Status: Planned, Active, Temporarily unavailable, or Closed.
- Operating schedule: seven-day editor with copy-to-weekdays and closed-day toggles.
- Evidence classification: defaults to User input for new records.
- Notes, optional, maximum 2,000 characters.

Type-specific fields use progressive sections.

**Restaurant**

- Service format: free-standing, mall/in-line, campus/licensed, airport, other, unknown.
- Daily/weekly demand by product group.
- Demand profile template and growth factor.
- Receiving windows.
- On-hand days and target service level.

**Distribution center**

- Ambient, chilled, frozen, secure/equipment storage capabilities.
- Inbound and outbound throughput capacity by day/week.
- Storage capacity by product group and unit.
- Initial inventory and safety-stock policy.
- Default dwell time.
- Fleet/vehicle types available.
- Service radius: time or miles; displayed as an indicative circle/isochrone, not a promised route boundary.

**Supplier**

- Supported product groups.
- Production capacity by day/week.
- Minimum order quantity.
- Lead time and lead-time unit.
- Reliability percentage.
- Shipping days and pickup windows.
- Storage/temperature compatibility.

### Step D — Review and save

- Map preview with marker and address.
- Required-field summary.
- Assumption/provenance summary.
- Potential duplicate warning based on normalized name/address and 100 m proximity.
- `Save location` creates the node.
- If a draft scenario is active, prompt: “Add to this scenario only” or “Add to baseline.” Default to scenario only. Adding to baseline requires explicit confirmation because it affects future scenarios.

Validation is inline and summarized at the top after a failed submit. Focus moves to the summary, whose links focus individual fields.

## 8.5 Location detail drawer

Header:

- Type icon, name, status, evidence badge.
- More menu: Edit, Duplicate, Add to scenario, Deactivate, Delete.
- Delete is unavailable when referenced by saved runs; offer Close/Deactivate instead.

Tabs:

1. **Overview:** address, schedule, capacity/demand summary, service assignment, disruptions, source summary.
2. **Products:** one row per product with demand/capacity, inventory, storage type, lead time, and warning state.
3. **Connections:** inbound/outbound lanes with source, destination, product, frequency, transit time, cost, and status.
4. **Forecast:** historical/synthetic profile, editable drivers, daily/weekly forecast chart, confidence labeling.
5. **Evidence:** field-level source, classification, confidence, verified date, source excerpt, and change history.

Footer actions:

- `Edit` secondary.
- Contextual primary: `Create scenario from location`, or `Apply changes` in edit mode.

## 8.6 Create and manage connections

Connections are directed lanes. A lane may carry multiple product groups, but each product has independent allocation, capacity use, frequency, and cost.

Creation methods:

- Multi-select two compatible nodes and choose `Connect`.
- Use `Add connection` from a location's Connections tab.
- Accept a system recommendation.

Compatibility rules:

- Supplier → Distribution center is valid.
- Distribution center → Restaurant is valid.
- Supplier → Restaurant is disabled in v1 unless an advanced `direct ship` flag is explicitly enabled in system settings.
- Restaurant → Distribution center and Restaurant → Supplier are invalid.
- Closed nodes cannot receive a new active lane.

Connection editor fields:

- Origin and destination.
- Product groups.
- Allocation percentage.
- Vehicle type.
- Delivery frequency and selected weekdays.
- Delivery window.
- Route distance and time: provider-derived, cached, and user-overridable with evidence.
- Dwell time.
- Variable cost per mile, fixed stop cost, driver cost, and optional toll estimate.
- Maximum shipment quantity/weight/volume.
- Active dates and status.

Allocation validation:

- Restaurant demand allocations for each product should total 100% across inbound lanes.
- The editor permits an incomplete draft but marks the product `Unallocated` and blocks a production-quality run unless the user accepts “Treat unallocated demand as stockout.”
- Over-allocation is an error, not automatically normalized.

Recommended lanes render dashed. The review drawer explains:

- reason for recommendation;
- expected service, stockout, cost, and utilization effects;
- violated or newly satisfied constraints;
- source/confidence of distance and capacity inputs;
- `Apply to draft` and `Dismiss` actions.

## 8.7 Locations page

Purpose: exact management and audit, complementary to the map.

Header:

- Title and total.
- Segmented counts for Restaurant / DC / Supplier.
- `New location` action.

Filters:

- Type, status, state, product, evidence class, source freshness, utilization band, disruption state.
- Search is debounced locally/server-side as appropriate.
- Filters are reflected in the URL.

Table columns:

- Name.
- Type.
- City/state.
- Status.
- Primary assignment.
- Demand or throughput.
- Utilization.
- Evidence.
- Last updated.
- Row actions.

Users can choose columns, but Name, Type, Status, and Evidence cannot all be hidden. Sort state persists locally. Selecting a row opens the detail drawer and highlights the location on a mini-map when space allows.

## 8.8 Demand Forecast workspace

The forecast is available inside restaurant detail and as an advanced Control Tower overlay.

Default model:

```text
forecast[r,p,t] = base_demand[r,p]
                  × day_or_week_seasonality[r,t]
                  × growth_factor[r,t]
                  × event_factor[r,t]
                  × scenario_demand_multiplier[r,p,t]
```

UI:

- Product tabs.
- Daily/weekly toggle inherited from scenario.
- Line chart: baseline forecast and scenario forecast.
- Driver table: base demand, weekday/week seasonality, annualized growth, event multiplier.
- Every driver has value, unit, evidence badge, and reset action.
- Bulk editing is out of scope for v1; a “Use for similar restaurants” operation may be designed later.
- Changes in baseline require confirmation; changes within a scenario update only the draft.

## 8.9 Inventory and replenishment UI

Distribution-center Products tab shows:

- on-hand inventory;
- available inventory;
- safety stock;
- inbound confirmed/modelled supply;
- outbound allocated demand;
- projected days of supply;
- projected stockout date;
- storage and throughput utilization.

Replenishment policy editor:

- Policy type: min/max, reorder point/order-up-to, or scheduled replenishment.
- Lead time.
- Review period.
- Safety-stock value or service-based calculation.
- Minimum order quantity.
- Order multiple.
- Maximum storage.

The UI previews a 12-period inventory curve and highlights stockouts. It states the formula and distinguishes physical storage capacity from throughput capacity.

## 8.10 Scenario creation and builder

### Create Scenario dialog

Fields:

- Name, required.
- Description, optional.
- Baseline snapshot, default current baseline.
- Time grain, Daily or Weekly.
- Horizon: 7–90 days or 4–26 weeks.
- Effective start date.
- Copy current map selection into scenario, optional.

Creating a scenario freezes the baseline revision and input source versions. Later baseline changes do not silently alter it.

### Scenario builder layout

- Left, 280 px: change stack.
- Center: map.
- Right, 360–420 px: configuration drawer or impact preview.
- Bottom: validation/status bar and `Run scenario` button.

Change-stack cards show order, type, target, effective dates, and validation state. Supported change types:

1. Add location.
2. Close or reopen location.
3. Supplier failure or recovery.
4. Distribution-center outage or recovery.
5. Demand surge or reduction.
6. Severe-weather disruption.
7. Product or fuel price change.
8. Capacity increase or reduction.
9. Add, remove, or modify connection.
10. Change inventory policy.

Users can reorder compatible changes. The engine applies changes in effective-time order, then explicit list order for ties. The UI warns when changes conflict, such as closing and increasing capacity at the same site on the same date.

### Scenario validation

Before enabling Run:

- all referenced nodes exist in the snapshot;
- location and lane status transitions are valid;
- demand has a valid supply path or explicit stockout treatment;
- units convert successfully;
- required capacities and costs have values or an accepted default;
- horizon includes each change's effective date;
- no allocation exceeds 100%;
- product/storage compatibility is satisfied;
- synthetic inputs are acknowledged if they materially drive results.

Errors block run. Warnings require a one-time acknowledgment recorded with the run.

## 8.11 Scenario run state

Run is asynchronous and cancellable.

Progress stages:

1. Freeze inputs.
2. Validate network.
3. Calculate/retrieve route matrix.
4. Forecast demand.
5. Allocate supply.
6. Simulate inventory and replenishment.
7. Calculate costs and metrics.
8. Generate recommendations and explanations.

The progress surface displays current stage, elapsed time, and last completed stage. Closing the browser does not cancel a run. Reopening Scenarios restores status. Cancellation retains logs but produces no decision-ready result.

## 8.12 Results and baseline comparison

### Results header

- Scenario name and run timestamp.
- Run status and engine version.
- Baseline revision and source-snapshot date.
- `Save` primary action if not already saved.
- `Rerun` and `View inputs` secondary actions.

### Executive comparison

Four primary metrics appear in a consistent order:

1. Service level.
2. Stockout units/restaurant-periods.
3. Total landed cost.
4. Capacity utilization.

Each shows Baseline, Scenario, absolute delta, percentage delta where valid, directionality, and target. A change is never called “better” solely from direction; it is evaluated against configured priorities and thresholds.

### Decision narrative

One generated but deterministic/template-backed summary:

```text
The scenario protects 98.1% modeled service, down 0.7 points from baseline.
Thirty-two restaurants experience at least one product-period stockout.
Reassigning the highlighted restaurants to two alternate DCs restores 0.5 points
of service and adds an estimated $18,400 per week in landed cost.
```

Every sentence has an `Explain` affordance revealing formulas, inputs, and affected entities.

### Map comparison modes

- Scenario state, default.
- Baseline state.
- Difference mode: only changed nodes, lanes, service areas, and affected restaurants.
- Side-by-side is available on ≥1440 px only; maps synchronize pan/zoom with a visible unlink control.

### Impact table

Rows are affected restaurants, DCs, suppliers, or lanes. Columns:

- Entity.
- Change.
- Service delta.
- Stockout exposure.
- Cost delta.
- Utilization delta.
- Primary cause.
- Recommendation.

The table defaults to material impact descending. Selecting a row focuses the map and opens details.

### Recommendation cards

Each recommendation contains:

- action in imperative language;
- affected entities and products;
- expected metric deltas;
- constraints considered;
- why it ranked above alternatives;
- confidence and synthetic-input warning;
- `Apply to draft` action that creates a new draft revision, never alters completed results.

## 8.13 Scenarios page

One table/list, because v1 supports one user and no folders.

Columns:

- Scenario name.
- Baseline revision.
- Last run status.
- Service delta.
- Stockout delta.
- Cost delta.
- Updated date.
- Actions: Open, Duplicate, Rename, Delete.

Only scenarios are saved; individual ad hoc result views are run revisions beneath a scenario. Deleting a scenario is destructive and requires its exact name when completed runs exist. Soft-delete for 30 days in production deployments.

## 8.14 Data & Sources page

Tabs:

1. **Source register:** publisher, dataset, source type, cadence, last success, next refresh, record count, license/terms note.
2. **Assumptions:** all synthetic and user-supplied material inputs, sortable by impact and age.
3. **Conflicts:** proposed source changes awaiting review.
4. **Refresh history:** job status, duration, added/changed/retired counts, errors, extractor version.

Source detail shows:

- canonical URL;
- retrieved and verified dates;
- parser/extractor version;
- stored source artifact checksum;
- terms and attribution note;
- field mappings;
- recent changes;
- affected model records.

The user can accept, reject, or defer a conflict. Acceptance creates a new baseline revision; saved scenarios remain pinned to older evidence.

## 8.15 Grounded Copilot

The Copilot opens in a 440 px right drawer and retains the active scenario/map selection as visible context chips.

Suggested prompts:

- “What is driving stockouts in this scenario?”
- “Which DC is the best modeled backup for the selected restaurants?”
- “What changes if I increase this supplier's capacity by 20%?”
- “Which inputs are synthetic?”
- “Show the sources for this distribution center.”

Copilot response structure:

1. Direct answer, maximum three short paragraphs.
2. Metric evidence table when numerical comparison is involved.
3. Sources and assumptions.
4. Proposed action, if any.

The Copilot may call read-only model tools by default. Mutating tools such as `create_scenario_change` require a confirmation card showing the exact proposed changes. The Copilot cannot save, delete, or modify the baseline without a second explicit user action.

Grounding requirements:

- Use the active immutable scenario snapshot and source register.
- Cite entity IDs, run ID, engine version, and evidence sources.
- Never treat model prose as the source of a metric; numbers come from typed application tools.
- If a requested fact is absent, say it is unknown and offer to create an editable assumption.
- Attach `Sample estimate` to any statement materially derived from synthetic values.
- Log prompt, tool calls, retrieved record IDs, output citations, latency, and user confirmation decisions, subject to retention policy.

OpenAI implementation option: use the Responses API with function tools for application queries and structured outputs for action proposals; official OpenAI documentation states that Responses can call custom code and built-in file search, and file-search output can carry file citations. Source: [OpenAI Responses API reference](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create). Keep the provider behind an `AIProvider` interface so deployments can disable or replace it.

## 8.16 Settings

Sections:

- Appearance: light, dark, system; reduced motion.
- Units: miles, hours, cases/pallets/weight, USD.
- Model defaults: time grain, service target, stockout treatment, utilization warning thresholds.
- Cost assumptions: fuel, driver, fixed stop, handling, inventory carrying rate.
- Routing: provider, cache age, traffic policy; API secret is server-side and never displayed.
- Copilot: enabled, provider/model configuration reference, retention, clear history.
- Data: current baseline revision, refresh controls, clear synthetic sample, restore sample.
- About: version, license notices, map attribution, source register, non-affiliation disclosure.

## 8.17 Empty, loading, error, and offline states

- Empty baseline: map shows U.S. extent, a concise explanation, and `Add first location`.
- Empty filter result: preserve filters, state “No locations match,” and offer `Clear filters`.
- Map tiles unavailable: retain node list and metrics; show retry. Do not blank the entire application.
- Routing unavailable: permit save; mark lane distance pending; block only runs that require missing route values.
- Simulation error: identify failed stage, preserve scenario, provide correlation ID, retry, and viewable diagnostic summary.
- Copilot unavailable: the core product remains fully usable; no primary action depends on AI.
- Stale public data: show warning and dates; do not silently hide records.

## 8.18 Keyboard and screen-reader behavior

- Skip link targets main content.
- Navigation, map toolbar, filters, drawers, tabs, tables, and dialogs use native semantic controls.
- Marker list is available as an accessible companion to the canvas/WebGL map. Arrow keys move within the list; Enter selects/focuses the map location.
- Opening a drawer moves focus to its heading; closing returns focus to the invoking control.
- Dialogs trap focus and close on Escape unless a destructive operation is executing.
- Map status changes announce through a polite live region; errors use assertive announcements sparingly.
- Charts have text summaries and accessible tables.
- Status never depends only on hue.
- Touch targets are at least 44 × 44 px on tablet.

---

## 9. Functional Requirements

### 9.1 Location and network management

- **FR-LOC-001:** Create restaurant, distribution-center, and supplier nodes manually.
- **FR-LOC-002:** Create a node by clicking the map.
- **FR-LOC-003:** Geocode an entered address, show candidate confidence, and allow draggable correction.
- **FR-LOC-004:** Edit common and type-specific attributes with unit validation.
- **FR-LOC-005:** Soft-close or temporarily disable a node without deleting history.
- **FR-LOC-006:** Detect probable duplicate locations.
- **FR-LOC-007:** Display field-level evidence and change history.
- **FR-NET-001:** Create directed supplier→DC and DC→restaurant lanes.
- **FR-NET-002:** Assign products, allocations, schedules, vehicles, capacity, time, and cost to lanes.
- **FR-NET-003:** Validate allocation totals and product/storage compatibility.
- **FR-NET-004:** Generate explainable lane recommendations.

### 9.2 Demand, inventory, and capacity

- **FR-DEM-001:** Store restaurant demand by product and day/week.
- **FR-DEM-002:** Apply editable seasonality, growth, event, and scenario multipliers.
- **FR-INV-001:** Store DC inventory by product and condition/storage class.
- **FR-INV-002:** Support min/max, reorder-point, and scheduled replenishment policies.
- **FR-CAP-001:** Enforce supplier production, DC storage, inbound/outbound throughput, lane, and vehicle constraints.
- **FR-CAP-002:** Distinguish hard constraints from warning thresholds.

### 9.3 Scenarios and results

- **FR-SCN-001:** Create a scenario from an immutable baseline revision.
- **FR-SCN-002:** Support all selected v1 change types.
- **FR-SCN-003:** Run deterministic daily or weekly simulation.
- **FR-SCN-004:** Persist scenario definition, run inputs, status, logs, outputs, and engine version.
- **FR-SCN-005:** Compare service, stockouts, landed cost, and utilization to baseline.
- **FR-SCN-006:** Save, reopen, rerun, duplicate, rename, and delete a scenario.
- **FR-REC-001:** Recommend feasible improvements and quantify modeled effects.
- **FR-REC-002:** Require user confirmation before applying a recommendation to a draft.

### 9.4 Data and provenance

- **FR-DAT-001:** Seed public restaurant and candidate distribution-center locations from approved sources.
- **FR-DAT-002:** Label synthetic values at field and aggregate-result level.
- **FR-DAT-003:** Store source artifact, checksum, retrieval time, verification time, extractor version, and field mapping.
- **FR-DAT-004:** Preserve historical source versions referenced by saved scenarios.
- **FR-DAT-005:** Route material source changes through conflict review.

### 9.5 Copilot

- **FR-AI-001:** Answer questions using typed application tools and active snapshot context.
- **FR-AI-002:** Cite sources, assumptions, run ID, and relevant entities.
- **FR-AI-003:** Reject or qualify unsupported claims.
- **FR-AI-004:** Require confirmation for any proposed mutation.
- **FR-AI-005:** Function independently of the simulation engine; an AI outage cannot prevent normal use.

---

## 10. Domain and Data Model

Use PostgreSQL with PostGIS. All identifiers are UUIDs. All mutable domain tables include `created_at`, `updated_at`, `created_by`, `revision`, and optional `retired_at`.

### 10.1 Core entities

| Entity | Key fields |
|---|---|
| `workspace` | id, name, default_units, settings_json; one row in v1 |
| `baseline_revision` | id, parent_id, status, effective_at, created_reason, source_snapshot_id |
| `location` | id, stable_key, type, name, status, external_id, timezone, geometry(Point, 4326), address_id, baseline_revision_id |
| `restaurant_profile` | location_id, format, receiving_windows, target_service_level |
| `dc_profile` | location_id, service_radius_type/value, default_dwell_minutes, storage_capabilities |
| `supplier_profile` | location_id, reliability_rate, shipping_calendar, min_order_rules |
| `product` | id, code, name, category, base_unit, temperature_class, shelf_life_days nullable |
| `location_product` | location_id, product_id, role, capacity, inventory, safety_stock, storage_capacity, evidence refs |
| `lane` | id, origin_id, destination_id, status, direct_ship, route_version_id, baseline_revision_id |
| `lane_product` | lane_id, product_id, allocation_pct, max_quantity, frequency, delivery_calendar, cost_policy_id |
| `vehicle_type` | id, name, weight/volume/case capacity, fixed_cost, variable_cost, driver rules |
| `operating_calendar` | owner_type/id, timezone, weekly_schedule, exceptions |
| `demand_profile` | restaurant_id, product_id, grain, base_quantity, seasonality_json, growth_rate, evidence refs |
| `inventory_policy` | dc_id, product_id, policy_type, reorder_point, order_up_to, min_order, order_multiple, review_period |
| `route_version` | origin/destination, provider, distance_m, duration_s, toll_cost, polyline, retrieved_at, request_hash |
| `scenario` | id, name, description, baseline_revision_id, grain, horizon_start/end, current_draft_revision_id |
| `scenario_revision` | id, scenario_id, revision_no, changes_json, validation_json, created_at |
| `simulation_run` | id, scenario_revision_id, status, engine_version, input_hash, started/completed_at, warning_ack_json |
| `simulation_metric` | run_id, entity_scope/id, product_id nullable, period, metric_code, value, unit |
| `recommendation` | run_id, rank, type, action_json, rationale_json, effect_json, confidence |
| `source` | id, publisher, title, canonical_url, source_type, cadence, terms_note |
| `source_artifact` | source_id, retrieved_at, checksum, object_uri, parser_version, status |
| `evidence_value` | entity_type/id, field_path, typed_value_json, unit, classification, confidence, source_artifact_id, verified_at |
| `change_event` | aggregate_type/id, revision, actor, action, before_json, after_json, occurred_at, correlation_id |

### 10.2 Time and version semantics

- Store timestamps in UTC; render in location or user time zone.
- Operating calendars are local-time rules with explicit daylight-saving handling.
- Scenario periods use half-open intervals `[start, end)`.
- Baseline revisions are immutable after publication.
- Scenario drafts are mutable revisions; a run always references a frozen revision.
- Route versions, source artifacts, and evidence values referenced by a run cannot be physically deleted.
- Computed output uses decimal/fixed-point quantities for money and inventory. Do not use binary floating point for currency.

### 10.3 Units

Persist canonical units and convert at boundaries:

- distance: meters;
- duration: seconds;
- money: integer micros or decimal USD;
- weight: kilograms;
- volume: cubic meters;
- product quantity: product-specific base unit such as case, pallet, or each;
- percentages: decimal 0–1;
- coordinates: WGS84 / EPSG:4326.

---

## 11. Deterministic Simulation Specification

## 11.1 Inputs

- Immutable baseline revision.
- Ordered scenario changes.
- Time grain and horizon.
- Demand profile by restaurant/product/period.
- Supplier and DC calendars, capacities, inventories, policies, and reliability status.
- Lane allocation, capacity, route time, schedule, vehicle, and cost.
- Product storage class, shelf-life if known, and base unit.
- Model defaults and warning acknowledgments.

## 11.2 Execution model

For each period:

1. Apply effective scenario events.
2. Produce restaurant demand forecast.
3. Carry forward DC opening inventory and scheduled receipts.
4. Determine supplier available capacity.
5. Create replenishment orders from inventory policies.
6. Allocate supplier capacity to DC orders by explicit allocation, then priority rule.
7. Observe production, lane, calendar, and receiving constraints.
8. Receive shipments whose modeled lead time has elapsed.
9. Allocate DC available inventory to restaurant demand by lane allocation and service priority.
10. Record fulfilled demand, backorder/stockout, lost demand policy, closing inventory, utilization, and costs.
11. Schedule outbound/inbound movements for future periods.

Within a tie, use stable IDs to ensure reproducibility. Document every priority rule.

## 11.3 Default allocation policy

1. Honor fixed user allocations.
2. Preserve minimum target service across restaurants before maximizing any one restaurant.
3. Within the same service deficit, prioritize earliest receiving-window need.
4. Within the same need, choose lowest incremental landed cost.
5. Use stable location ID as the final tie-breaker.

The user can inspect but not customize the full policy in v1. A future rules editor may replace it.

## 11.4 Metric definitions

### Service level

Primary metric is fill rate:

```text
service_level = fulfilled_quantity / requested_quantity
```

Calculate by product, restaurant, period, scenario, and aggregate. Do not average percentages without weighting by requested quantity.

### Stockouts

- `stockout_quantity`: unmet requested quantity.
- `stockout_restaurant_periods`: count of restaurant/product/period combinations with unmet demand.
- `restaurants_affected`: distinct restaurants with ≥1 stockout.

### Total landed cost

```text
purchase_cost
+ linehaul_variable_cost
+ vehicle_fixed_cost
+ driver_time_cost
+ stop_cost
+ handling_cost
+ inventory_carrying_cost
+ modeled_tolls
+ modeled_shortage_penalty (reported separately and included only when enabled)
```

Every component is separately persisted. Synthetic components are labeled; do not hide a shortage penalty inside freight cost.

### Capacity utilization

Report supplier production, DC storage, DC inbound throughput, DC outbound throughput, and lane/vehicle utilization separately. Executive “DC utilization” is the maximum binding utilization dimension for the period, with the dimension named in its explanation.

## 11.5 Severe-weather scenario

The v1 weather scenario is user-controlled, even when initialized from a public alert:

- Select alert polygon or manually drawn area.
- Select affected nodes and lanes.
- Choose capacity reduction, closure, route-time multiplier, and effective period.
- Preview impact set before applying.

The NWS supports active alert queries by point or zone; use the official API and preserve alert identifiers and timestamps. Source: [NWS alert request guidance](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf).

FEMA declarations are suitable for historical context and back-testing, not fast operational warning. OpenFEMA provides disaster declaration summaries and an API endpoint with refresh metadata. Source: [OpenFEMA Disaster Declarations Summaries](https://www.fema.gov/about/openfema/disaster-declarations-summaries).

## 11.6 Price-change scenario

- Product price changes apply to selected suppliers/products for a period.
- Fuel-price changes apply to regional or all routes.
- Government benchmarks provide context, not private contract price.
- USDA Market News offers API access to published agricultural market reports and covers livestock, poultry, grain, fruits, vegetables, and specialty crops. Sources: [USDA Market News](https://www.ams.usda.gov/market-news) and [MyMarketNews API](https://mymarketnews.ams.usda.gov/mymarketnews-api).
- EIA publishes weekly regional on-highway diesel prices. Source: [EIA petroleum data](https://www.eia.gov/petroleum/data.php).

## 11.7 Reproducibility

Persist:

- engine semantic version and build checksum;
- input snapshot and canonical hash;
- route/source artifact versions;
- model defaults;
- ordered changes;
- warning acknowledgments;
- deterministic seed, reserved for future stochastic features;
- output checksum.

Re-running the same input with the same engine version must produce the same output checksum.

---

## 12. Recommendation Engine

Recommendations are generated after the deterministic run using constrained candidate evaluation, not free-form AI.

### 12.1 Candidate actions

- Reassign selected restaurant/product allocation to another active compatible DC.
- Add or increase a supplier→DC lane.
- Increase a lane's scheduled frequency within vehicle/receiving constraints.
- Increase safety stock or reorder point.
- Add modeled capacity to a DC or supplier.
- Add a candidate DC at a user-selected or algorithm-suggested location.
- Reopen a disabled lane or location if the scenario permits recovery.

### 12.2 Candidate generation

1. Identify root constraints from unmet demand and utilization.
2. Generate only topology- and product-compatible actions.
3. Use cached route matrix to shortlist nearest feasible alternates.
4. Apply hard feasibility filters.
5. Run bounded delta simulations for candidates.
6. Remove dominated recommendations.
7. Rank remaining candidates.

### 12.3 Ranking

Use a transparent weighted score configured from onboarding priorities:

```text
score = w_service × normalized_service_gain
      + w_stockout × normalized_stockout_reduction
      - w_cost × normalized_incremental_cost
      - w_utilization × normalized_capacity_risk
      - assumption_penalty
```

Display raw deltas alongside the score. Do not show the composite score as a universal truth. Penalize candidates whose material inputs are synthetic or stale, but do not silently discard them.

### 12.4 Facility-location recommendation

For new DC suggestions:

- Generate candidate regions from demand-weighted clusters and existing freight/geographic zones.
- Use p-median or capacitated facility-location optimization on representative centroids.
- Refine shortlisted candidates with actual route matrix calls.
- Require the user to place/confirm the exact site; never imply real estate availability.
- Present the result as “modeled candidate area,” not a recommended address.

The Bureau of Transportation Statistics Freight Analysis Framework provides public U.S. freight-flow context by region, commodity, and mode, but it is not a substitute for Chick-fil-A shipment data. Source: [BTS Freight Analysis Framework](https://www.bts.gov/faf).

---

## 13. Pragmatic Technical Architecture

### 13.1 Recommended stack

| Layer | Recommendation | Reason |
|---|---|---|
| Web client | React + TypeScript, Vite or Next.js app shell | Mature UI ecosystem; strong typing; responsive SPA behavior |
| UI primitives | Radix-style accessible primitives plus a project token system | Keyboard/focus behavior without imposing brand styling |
| Mapping | MapLibre GL JS with licensed vector tiles | Capable national map, clustering, layers, lines, polygons; provider flexibility |
| Server API | Python FastAPI | Strong validation and compatibility with optimization/data tooling |
| Domain validation | Pydantic | Typed request, response, and simulation schemas |
| Database | PostgreSQL + PostGIS | Durable relational model, revisions, spatial queries |
| Jobs | Redis-backed worker initially; interface compatible with a managed queue later | Low-cost asynchronous runs and refresh jobs |
| Simulation | Python package using NumPy/Pandas selectively; pure typed domain core | Deterministic modeling and testability |
| Optimization | OR-Tools | Allocation and facility-location solvers |
| Object storage | S3-compatible bucket | Source artifacts, run bundles, diagnostics |
| Observability | OpenTelemetry + structured logs + error tracking | Cross-service correlation and production diagnosis |
| AI | Provider adapter; OpenAI Responses API implementation optional | Grounded function tools and structured action proposals |
| Deployment | Containers; one web/API service, one worker, managed PostgreSQL, managed Redis | Simple initial topology with scale path |

Use current supported stable releases at implementation kickoff; pin exact versions in lockfiles and record them in the architecture decision log.

### 13.2 Component topology

```text
Browser
  ├── Application UI
  ├── Map renderer
  └── Accessible list/table companions
          │ HTTPS/SSE
API service
  ├── Auth/session boundary
  ├── Location/network service
  ├── Scenario service
  ├── Evidence/source service
  ├── Copilot tool gateway
  └── Routing/geocoding provider adapters
          │
  ┌───────┼───────────┐
Postgres/PostGIS   Redis/Queue   Object storage
                      │
                   Worker
                      ├── Simulation engine
                      ├── Recommendation engine
                      └── Source refresh/import jobs
```

### 13.3 Architectural rules

- The simulation engine is a standalone package with no web-framework imports.
- External services are accessed through typed adapters.
- Scenario runs never query mutable “current” values after freezing inputs.
- API endpoints return domain IDs and evidence summaries, not raw ORM models.
- Every write carries an idempotency key and expected revision where applicable.
- The UI uses server-authoritative revisions to prevent lost updates, even with one user.
- Long-running jobs emit stage events over Server-Sent Events; polling is the fallback.
- The map receives simplified viewport-appropriate geometry; never ship all lane polylines at national zoom.

### 13.4 Low-cost operating posture

- Begin with one modest API container and one worker that can scale to zero/low idle where supported.
- Use managed PostgreSQL with PostGIS and automated backups.
- Cache geocodes and routes permanently where provider terms allow; key by normalized request and provider version.
- Precompute restaurant clusters and common route pairs.
- Partition material simulation metrics by run and period only when table size warrants it.
- Store large run bundles and raw sources in object storage, not database blobs.
- Disable live traffic and high-cost route refinement by default; use static road travel time for baseline modeling.

---

## 14. API Contract Outline

Version all endpoints under `/api/v1`.

### Locations

```text
GET    /locations?type=&status=&bbox=&query=&cursor=
POST   /locations
GET    /locations/{id}
PATCH  /locations/{id}
POST   /locations/{id}/status-transitions
GET    /locations/{id}/evidence
POST   /geocodes
POST   /geocodes/{id}/confirm
```

### Network

```text
GET    /lanes?bbox=&product_id=&status=
POST   /lanes
PATCH  /lanes/{id}
POST   /lanes/{id}/route-refresh
POST   /network/recommendations/connections
```

### Baseline and scenarios

```text
GET    /baseline
POST   /baseline/revisions
GET    /scenarios
POST   /scenarios
GET    /scenarios/{id}
PATCH  /scenarios/{id}
POST   /scenarios/{id}/revisions
POST   /scenarios/{id}/validate
POST   /scenarios/{id}/runs
GET    /runs/{id}
GET    /runs/{id}/events
POST   /runs/{id}/cancel
GET    /runs/{id}/metrics
GET    /runs/{id}/impacts
GET    /runs/{id}/recommendations
POST   /recommendations/{id}/apply-to-draft
```

### Sources

```text
GET    /sources
GET    /sources/{id}
POST   /sources/{id}/refresh
GET    /source-refreshes/{id}
GET    /evidence/conflicts
POST   /evidence/conflicts/{id}/decisions
GET    /assumptions
```

### Copilot

```text
POST   /copilot/responses
GET    /copilot/responses/{id}/events
POST   /copilot/proposals/{id}/confirm
POST   /copilot/proposals/{id}/reject
```

### API behaviors

- Cursor pagination for location and evidence lists.
- Bbox endpoints cap records and return cluster/summary forms at national zoom.
- `ETag` or revision field supports conditional reads/writes.
- Errors use RFC 9457-style problem details with `code`, `message`, `field_errors`, `correlation_id`, and `retryable`.
- Simulation-run creation returns `202 Accepted` and job/run URL.
- Idempotency keys required for location creation, baseline publication, run creation, and recommendation application.

---

## 15. Data Ingestion Plan

### 15.1 Approved source register

| Dataset/purpose | Source | Treatment |
|---|---|---|
| Restaurant names and addresses | Official Chick-fil-A location browser | Verified public when parsed directly and checked; respect site terms and rate limits |
| Company footprint context | Official company/business pages | Narrative/aggregate evidence only |
| Distribution-center candidate locations | Official announcements and Chick-fil-A Supply career listings | Verified or corroborated per record; never assume completeness |
| Supplier placeholders | No comprehensive public registry | Synthetic by default; real identities only when independently verified |
| U.S. boundaries and geographic identifiers | U.S. Census TIGER/Line | Authoritative geography; [TIGER/Line geodatabases](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-geodatabase-file.html) |
| Freight-flow context | BTS Freight Analysis Framework | Regional context only; not company flow |
| Severe-weather alerts | NOAA/NWS API | Live overlay and scenario initializer |
| Historical disasters | OpenFEMA | Historical context and test scenarios |
| Agricultural price context | USDA Market News / MyMarketNews API | Benchmark, not contract price |
| Diesel benchmark | EIA | Regional weekly benchmark |
| Route matrix | Configurable commercial routing provider | Provider-derived, cached, cited |
| Geocoding | Configurable commercial or self-hosted provider | Avoid public Nominatim for production autocomplete/bulk use |

### 15.2 Ingestion pipeline

```text
Discover → Fetch → Preserve raw artifact → Parse → Normalize → Match/dedupe
→ Validate → Diff against current baseline → Confidence/classification
→ Human review if material/conflicting → Publish new baseline revision
```

### 15.3 Source adapter contract

Each adapter must expose:

```text
source_metadata()
fetch(cursor/checkpoint) -> RawArtifact[]
parse(artifact) -> CandidateRecord[]
validate(candidate) -> ValidationResult
fingerprint(candidate) -> stable hash
```

Adapters cannot write domain tables directly. They emit candidate records to the review/publish pipeline.

### 15.4 Restaurant matching

Stable matching priority:

1. Official location identifier if public and stable.
2. Normalized exact address plus normalized name.
3. Fuzzy name/address plus proximity under 100 m.
4. Manual review.

Do not merge only because two locations share a mall, airport, campus, or street address.

### 15.5 Seed synthetic assumptions

The sample generator must:

- use deterministic seed and version;
- derive demand bands from transparent templates, not claim sales;
- assign supplier placeholders such as “Sample Poultry Supplier A,” never a real unverified company;
- create plausible but explicitly synthetic capacities, inventory, costs, lead times, and allocations;
- guarantee initial network feasibility except for intentional guided-demo exceptions;
- store every generated field as `Synthetic` with generator version and formula;
- allow the entire synthetic layer to be cleared without deleting verified locations.

---

## 16. Security, Privacy, and Safety

### 16.1 Authentication and authorization

- A local/demo deployment may use a securely generated owner credential.
- Production deployments use OIDC with one owner role in v1.
- All API routes require authentication except health checks and static assets.
- Preserve `workspace_id` on every tenant-bound table now; enforce a single workspace in v1 and row-level isolation in the multi-user phase.

### 16.2 Data protection

- TLS in transit; managed encryption at rest.
- Secrets in a secret manager, never source control or client bundles.
- API keys are server-side and scoped/restricted by provider.
- Daily database backups; point-in-time recovery where supported.
- Object storage versioning for source artifacts and run bundles.
- Audit log for baseline, scenario, source-review, and copilot proposal actions.
- No customer, employee, driver, or personal information is required. Reject personal data in structured fields; warn against adding it in notes.

### 16.3 Application security

- Strict input validation and output encoding.
- CSRF protection when cookie sessions are used.
- Content Security Policy and secure headers.
- Rate limits on geocoding, route, run, source-refresh, and AI endpoints.
- SSRF allowlist for source connectors; users cannot supply arbitrary fetch URLs in v1.
- Malware scanning is required if file upload is later added.
- Dependency and container scanning in CI.
- Threat model before production launch and after adding multi-tenancy.

### 16.4 AI safety

- Treat source documents and user notes as untrusted data, not instructions.
- Tool authorization is enforced server-side; model requests cannot bypass it.
- Read tools and write tools have separate schemas and policies.
- Proposals show a deterministic diff before confirmation.
- No AI-generated metric is persisted as an engine output.
- Red-team prompt injection, unsupported factual claims, hidden synthetic assumptions, tool-argument tampering, and cross-scenario data leakage.

---

## 17. Nonfunctional Requirements

### Reliability

- API monthly availability target: 99.9%, excluding scheduled maintenance.
- Scenario job completion target: 99.5% for valid inputs, excluding upstream routing-provider failure when uncached routes are required.
- Retry idempotent external calls with exponential backoff and jitter.
- Circuit-break provider failures; surface degraded mode.
- Worker crash resumes or safely restarts from an immutable input snapshot.

### Performance

- `GET /locations` viewport query p95 ≤500 ms from warm database.
- Location create/update p95 ≤750 ms excluding geocoder latency.
- Search results p95 ≤400 ms.
- Copilot first streamed text target ≤4 s when provider is healthy.
- Client JavaScript initial bundle budget defined and enforced; map code may load after the shell.

### Scalability baseline

- 5,000 restaurant nodes.
- 100 distribution centers.
- 500 suppliers.
- 50,000 lanes.
- Seven initial product groups, extensible to 100 products.
- 26-week weekly or 90-day daily horizon.
- 25 concurrent queued runs, even though v1 UI is single-user.

### Accessibility

- Automated axe checks on primary routes.
- Full keyboard completion of onboarding, add location, create scenario, run, compare, save.
- Screen-reader test with at least VoiceOver/Safari and NVDA/Chrome before launch.
- Text alternatives for maps and charts.

### Observability

- Correlation ID from browser action through API, queue, worker, external providers, and logs.
- Metrics: request latency/error, job queue age, run duration by stage, source refresh age/error, geocode/route cache hit, provider spend, AI token/tool usage, database saturation.
- Traces for scenario runs and ingestion.
- Alerts on failed refresh, stale core source, queue age, elevated 5xx, backup failure, and repeated run-stage failure.

---

## 18. Agentic Team Delivery Specification

The build should be executed by a coordinated agentic team with one accountable lead agent and narrow specialist agents. Each workstream produces versioned artifacts and cannot cross a gate without evidence.

### 18.1 Team topology

| Agent | Primary ownership | Required outputs |
|---|---|---|
| Lead/Integrator | Architecture, plan, dependency order, review, merge gates | ADRs, integrated plan, release evidence |
| Product/UX | Flows, states, content, responsive/accessibility design | Wireframes, interaction specs, component inventory, usability scripts |
| Public Data Research | Source register, terms, extraction, confidence | Source catalog, extraction tests, provenance rules |
| Domain/Data | PostGIS schema, revisions, units, migrations | ERD, migrations, seed contracts, invariants |
| Simulation | Demand, inventory, allocation, costs, metrics | Engine package, golden scenarios, reproducibility report |
| Optimization | Lane/facility candidates and ranking | Solver formulation, feasibility tests, explanation payloads |
| Frontend | App shell, map, forms, tables, results, tablet behavior | UI implementation, Storybook/examples, accessibility tests |
| Backend/API | Services, APIs, jobs, providers, persistence | OpenAPI, adapters, job orchestration, integration tests |
| AI/Copilot | Grounded tools, citations, confirmations, evals | Tool schemas, policies, eval set, trace viewer |
| Security/Reliability | Threat model, auth, secrets, SLOs, observability | Threat model, load/failure tests, dashboards, runbooks |
| QA/Release | Test strategy, regression, acceptance, deployment | Test matrix, release checklist, signed verification report |

An agent may own more than one role in a small team, but the review role for security, simulation correctness, and data provenance must be independent of the implementing role.

### 18.2 Shared operating rules

1. Every task references requirement IDs and acceptance tests.
2. Every schema/API change updates the canonical contract before implementation.
3. Every public fact added to seed data includes an evidence record.
4. Every simulation change adds or updates a golden scenario.
5. Every UI feature includes loading, empty, error, keyboard, and tablet states.
6. No agent may replace deterministic business logic with LLM output.
7. No material mutation is merged without a visible before/after diff and test evidence.
8. Integrator resolves contract conflicts; specialist agents do not silently fork schemas.
9. Generated code is reviewed for simplicity, security, and operational ownership.

### 18.3 Delivery sequence and gates

#### Gate 0 — Research and legal boundary

Deliver:

- approved source register;
- non-affiliation language;
- source terms/attribution review;
- verified/synthetic examples;
- public-data retention and refresh policy.

Exit criteria: no proposed seed field lacks a classification rule.

#### Gate 1 — Executable product contract

Deliver:

- clickable wireframes for all primary flows;
- canonical domain model;
- OpenAPI draft;
- simulation input/output schema;
- model formula specification;
- accessibility acceptance script.

Exit criteria: a location can be represented end-to-end from form to database to frozen run input.

#### Gate 2 — Vertical foundation

Build one thin slice:

```text
Add restaurant → geocode → drag → save → display on map
→ create scenario → change demand → run minimal deterministic engine
→ compare service/stockout → save scenario
```

Exit criteria: deployed environment, migrations, backups, logs, CI, and end-to-end test all pass.

#### Gate 3 — Network modeling

Add all node types, products, lanes, route cache, capacity, inventory, replenishment, calendars, evidence, and seed import.

Exit criteria: golden feasible and infeasible networks produce expected diagnostics.

#### Gate 4 — Full scenario engine

Add selected scenario types, metrics, results UI, difference map, and saved-run recovery.

Exit criteria: deterministic output checksums pass across repeated runs and worker restarts.

#### Gate 5 — Recommendations and Copilot

Add constrained candidate evaluation, explanations, grounded Copilot tools, citations, and confirmation flows.

Exit criteria: Copilot factuality/action eval passes; it cannot mutate without confirmation; recommendations reproduce expected deltas.

#### Gate 6 — Production hardening

Complete load, accessibility, threat-model, backup-restore, provider-failure, cost, and disaster-recovery tests.

Exit criteria: release checklist signed by QA, security, data provenance, and simulation reviewers.

### 18.4 Agent handoff contract

Every completed work item includes:

- requirement IDs;
- files/contracts changed;
- assumptions made;
- data classifications affected;
- tests run and results;
- screenshots for UI work;
- performance impact;
- unresolved risks;
- rollback procedure.

---

## 19. Test Strategy

### 19.1 Test pyramid

- Unit tests: domain validation, units, calendars, formulas, allocation, inventory, costs, ranking.
- Property tests: conservation of flow, nonnegative inventory, allocation bounds, unit round trips, deterministic tie-breaking.
- Contract tests: API schemas and provider adapters.
- Integration tests: PostGIS queries, migrations, jobs, object storage, frozen snapshots.
- Golden scenarios: small networks with hand-calculated outputs.
- End-to-end tests: onboarding, add/edit/move location, connect, create/run/save scenario, compare, source review, Copilot confirmation.
- Visual regression: core desktop/light, desktop/dark, tablet landscape, tablet portrait.
- Accessibility: automated plus manual keyboard/screen-reader scripts.
- Performance: national seed map, location search, route cache, 3,500-node run.
- Resilience: worker termination, Redis restart, route-provider timeout, AI outage, stale source, database failover where supported.
- Security: SAST, dependency/container scans, authz, CSRF, SSRF, injection, rate limit, prompt injection.

### 19.2 Golden simulation cases

1. One supplier → one DC → one restaurant, fully feasible.
2. Supplier capacity below replenishment need.
3. DC outage with feasible alternate.
4. DC outage with no alternate, producing explicit stockouts.
5. Demand surge that binds outbound throughput but not storage.
6. Product storage incompatibility.
7. Delivery calendar causes lead-time crossing.
8. Allocation totals below 100%, accepted as stockout.
9. Price increase changes cost but not physical flow.
10. Identical run repeated after worker restart produces same checksum.

Each fixture includes hand-calculated period tables and expected explanations.

### 19.3 Copilot evaluation set

At least 100 prompts spanning:

- metric explanation;
- root-cause analysis;
- source request;
- synthetic-assumption identification;
- unknown/private fact request;
- scenario comparison;
- mutation proposal;
- prompt injection in a source note;
- conflicting source records;
- stale evidence;
- attempted cross-scenario reference.

Pass conditions:

- 100% of numerical answers match tool output within formatting tolerance.
- 100% of material public claims have a valid source or are explicitly unknown.
- 100% of synthetic-derived claims are labeled.
- 0 unconfirmed mutations.
- 0 cross-scenario or cross-workspace leakage.

---

## 20. Release Acceptance Criteria

The production target is acceptable only when all statements below are demonstrably true.

### Data and trust

- Public restaurant records show citation, confidence, and verification date.
- Candidate DC records do not overstate historical or job-post evidence as a complete current network.
- No real supplier is invented.
- Every synthetic capacity, demand, cost, inventory, lead time, or allocation is visibly labeled.
- The non-affiliation disclosure appears in onboarding and About.

### Core workflow

- A user can add each of the three node types by address and map click.
- A user can correct geocoding by dragging before save and edit coordinates later.
- A user can create compatible lanes and receives specific validation for incompatible ones.
- A user can configure daily and weekly demand, capacity, inventory, and replenishment.
- All selected scenario types can be created and validated.
- A user can run, leave, return, compare, and save a scenario.
- Baseline and scenario results show service, stockouts, total landed cost, and utilization with explanations.

### Correctness and reliability

- Golden scenarios pass.
- Same input/engine produces the same output checksum.
- No run reads mutable data after snapshot freeze.
- Worker interruption does not corrupt a scenario or produce a false completed status.
- Backup restoration has been tested in a nonproduction environment.

### UI and accessibility

- Desktop and tablet layouts have no clipped primary controls or horizontal page overflow.
- Full primary workflow is keyboard completable.
- Drawers and dialogs manage focus correctly.
- Maps and charts have list/table/text equivalents.
- Light and dark modes meet contrast requirements for essential content.

### AI

- Copilot is grounded in typed tools and cited evidence.
- It labels synthetic inputs and admits missing information.
- It cannot mutate baseline or scenarios without confirmation.
- Core application remains usable when AI is disabled or unavailable.

### Operations

- SLO dashboards, alerts, structured logs, traces, and correlation IDs are live.
- Provider rate limits and spending controls are configured.
- Runbooks cover job failure, stale source, route/geocode outage, AI outage, database recovery, and rollback.

---

## 21. Phased Delivery Scope

No fixed timeline is imposed. Progress is controlled by gates and verified capability.

### Release A — Trusted network foundation

- App shell, onboarding, public/synthetic boundary.
- Map, location list, add/edit/move locations.
- Three node types and products.
- Evidence/source registry.
- Baseline revisioning.
- Authentication, persistence, backups, logs.

### Release B — Deterministic twin

- Lanes, routes, calendars, vehicles.
- Demand forecast.
- DC inventory/replenishment.
- Supplier and DC capacity.
- Deterministic daily/weekly simulation.
- Four executive metrics.
- Scenario save/reopen.

### Release C — Decision support

- All selected disruptions and price/capacity changes.
- Difference map and impact table.
- Recommendation engine.
- Facility candidate regions.
- Grounded Copilot.

### Release D — Production hardening

- Full source-refresh workflow.
- Accessibility and performance closure.
- Threat-model remediation.
- Failure recovery and cost controls.
- Formal launch review.

### Later releases

- Probabilistic/Monte Carlo uncertainty.
- Multi-user workspaces and roles.
- Comments, approvals, and sharing.
- Data import/export and enterprise integrations.
- Internationalization and multi-currency.
- Real-time traffic/telematics and operational execution, if ever authorized.

---

## 22. Risks and Required Mitigations

| Risk | Consequence | Required mitigation |
|---|---|---|
| Public location source changes or restricts automated use | Stale/incomplete seed | Terms review, cached artifacts, adapter isolation, manual refresh fallback |
| Job listings are mistaken for a facility registry | False network claims | Candidate classification, cross-check, dated evidence, human review |
| Synthetic assumptions appear authoritative | Misleading decisions | Persistent labels, evidence inheritance, result-level warnings |
| National route matrix becomes expensive | Uncontrolled spend/latency | Shortlist by geodesic distance, cache, batch, static routes, quotas |
| Optimization recommends infeasible action | Loss of trust | Hard feasibility checks and delta simulation before ranking |
| LLM invents explanation or number | Misleading answer | Typed tools, citations, deterministic numbers, evals, no direct writes |
| Daily national simulation grows too large | Slow runs | Active subgraph, vectorized engine, asynchronous jobs, profiling, weekly default |
| Future multi-tenancy requires redesign | Costly migration | Workspace key, authorization boundary, tenant-aware storage from day one |
| Trademark/trade-dress confusion | Legal/reputation exposure | Original product identity, no logos, disclosure, legal review before public release |

---

## 23. Decisions Deferred but Architecturally Reserved

These do not block Release A but require an architecture placeholder:

- commercial map tile, geocoding, and routing provider selection;
- deployment cloud/vendor;
- authentication provider;
- exact product base units and conversion rules;
- whether direct supplier→restaurant shipment should be supported;
- shortage penalty inclusion in the executive total-cost headline;
- source terms approval for automated official-location ingestion;
- maximum historical run retention;
- model/provider selection and retention policy for the Copilot;
- multi-tenant isolation implementation and data residency.

---

## 24. Source Register for Initial Research

All sources must be rechecked at implementation kickoff and stored with retrieval timestamps.

### Chick-fil-A public sources

1. [Official location search](https://www.chick-fil-a.com/locations)
2. [Official state location browser](https://www.chick-fil-a.com/locations/browse)
3. [Company overview](https://www.chick-fil-a.com/about/company)
4. [Do Business With Us / footprint statement](https://www.chick-fil-a.com/do-business-with-us)
5. [Five Things to Know About Chick-fil-A Supply, July 22, 2024](https://www.chick-fil-a.com/press-room/chick-fil-a-supply-five-years-supporting-restaurants)
6. [What is Chick-fil-A Supply?](https://www.chick-fil-a.com/customer-support/who-we-are/subsidiaries-and-innovations/what-is-chick-fil-a-supply)
7. [Chick-fil-A Supply career locations](https://careers.chick-fil-a.com/supply/jobs/locations)
8. [Example supply-chain technology listing describing network scale](https://careers.chick-fil-a.com/jobs/20191-internal?lang=en-us)
9. [Example Cartersville distribution-center listing](https://careers.chick-fil-a.com/corporate/jobs/19443)
10. [Example Charlotte/Kannapolis distribution-center listing](https://careers.chick-fil-a.com/supply/jobs/19756?lang=en-us)
11. [Example Salt Lake City operations listing](https://careers.chick-fil-a.com/supply/jobs/17753?lang=en-us)

### Government and technical sources

12. [U.S. Census TIGER/Line geodatabases](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-geodatabase-file.html)
13. [BTS Freight Analysis Framework](https://www.bts.gov/faf)
14. [USDA Market News](https://www.ams.usda.gov/market-news)
15. [USDA MyMarketNews API](https://mymarketnews.ams.usda.gov/mymarketnews-api)
16. [EIA petroleum and diesel data](https://www.eia.gov/petroleum/data.php)
17. [NWS alert geolocation/API guidance](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf)
18. [OpenFEMA Disaster Declarations Summaries](https://www.fema.gov/about/openfema/disaster-declarations-summaries)
19. [OpenStreetMap Foundation Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
20. [Google Routes API reference as one possible commercial routing adapter](https://developers.google.com/maps/documentation/routes/reference/rest)
21. [OpenAI Responses API reference for grounded tool/file-search implementation](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create)

---

## 25. Definition of Done for the Agentic Team

The team is done only when the software—not merely the specification or UI—can prove the full chain below in a production-like environment:

```text
Cited public/synthetic seed
→ inspect evidence
→ add and correct a location
→ connect the network
→ configure demand, inventory, capacity, route, and cost
→ freeze a baseline
→ create a disruption/capacity/price scenario
→ validate and run deterministically
→ compare service, stockouts, landed cost, and utilization
→ inspect recommendation causes and assumptions
→ ask the grounded Copilot for an explanation
→ confirm an action into a new draft
→ save, restart services, reopen, and reproduce the result
```

Every arrow must have automated or documented verification evidence. A polished dashboard without this traceable chain is not a digital twin and does not satisfy the specification.

## 26. Confirmed Decision Intelligence and Copilot Extension — November 6, 2026

This extension implements the user's selected authority model inside the independent planning simulation. Public facility evidence remains separate from operating assumptions. The production-grade target is unchanged; a working single-owner prototype is a milestone, not certification of all enterprise requirements.

| ID | Required behavior | Prototype verification |
|---|---|---|
| DI-01 | Analyze an explicit no-change, frozen planning baseline. The deterministic engine calculates every candidate and stores before/after metrics, source and candidate input hashes, output checksums, engine version and reopenable run references. AI must not supply substitute impact numbers. | Domain, service and full-app decision tests |
| DI-02 | Automatically apply only immediate capacity increases on synthetic or user-input capacity fields, within at most 5% capacity, 2% landed-cost increase, one affected location, nonnegative service gain and no increased shortages. Also require a measurable reduction in shortages, increase in service, or reduction in landed cost compared with no action. User rules may tighten but not expand these ceilings. A prior automatic change at a location prevents repeated automatic increments there. | Domain policy/provenance/idempotency tests |
| DI-03 | Queue larger capacity and supported structural changes for a person. Approve, reject and defer require a reason. Recheck the complete relevant network identity before approval; changed inputs supersede the decision without applying it. Applied/rejected/superseded decisions cannot be reversed by replay. Unsupported temporary or non-persistable proposals must be rejected before entering an unresolvable queue. | Domain and authenticated service tests |
| DI-04 | Commit the applied model change and its decision record atomically. Preserve facility identity evidence and existing workspace preferences. Retain actor, timestamp, reason, authority, risk, policy reasons, proposal and event history. Do not invent sample completed decisions. | Domain, service restart and full-app persistence tests |
| DI-05 | Provide a dedicated searchable Human queue, Decision history and Autonomy policy workspace; selected detail includes measured impacts, proposed changes, routing explanation, full readable lineage, reasoned resolution and copilot/run navigation. Support desktop/tablet, light/dark, keyboard and screen readers. | UI contract, browser, axe and screenshot review |
| DI-06 | When no in-radius alternate improves a modeled DC outage, evaluate feasible out-of-radius contingencies using frozen inputs and label their modeled assumptions and human approval requirement. The response opens a separate what-if draft and never changes the planning baseline. Report shortage-unit deltas separately from shortage-penalty dollars and keep legacy saved results readable. | Engine, policy, saved-artifact, and result-to-draft browser regressions |
| CP-01 | Explicitly separate Model tools from AI + model tools. Real AI uses a server-side Responses provider with bounded calls, tool dispatch, output and timeouts; credentials never enter client storage or a static build. Show setup-required or failure states, not a fabricated provider response. | Fake-upstream protocol/service and connected UI tests; live provider verification remains separate |
| CP-02 | Copilot can query public facility sources, modeled locations, saved metrics and decisions; calculate and save supported scenarios; compare saved scenarios; analyze and draft evaluated capacity actions; explain authority and evidence. Frozen run context must not silently substitute live operating assumptions. Distinguish calculated tools from language-model narration and disclose comparison limitations. | Service and full-app local/connected journeys |
| CP-03 | Persist conversations and tool traces with the correct workspace. Restore after browser reload/service restart. Use revision checks and idempotency, reject cross-context late responses, keep questions on failure, and disclose that a tool action may have saved even when the final provider response failed. | Storage/context, service and connected browser tests |

UI language must make clear that a policy-controlled automatic application is not proof an LLM independently decided or executed it. Human approval changes the planning model only. Capacity investment and implementation costs are excluded from modeled landed cost. The single-owner prototype is not multi-user separation of duties. National-scale memory/transport, complete modeling contracts, deployed security/recovery, AI quality evaluation and live provider acceptance remain explicit enterprise gates.
