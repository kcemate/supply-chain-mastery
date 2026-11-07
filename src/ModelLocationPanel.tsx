import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ExternalLink,
  MapPin,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { productCategories, syntheticEvidence } from "./flywayData";
import type {
  EngineDefaults,
  EvidenceClass,
  Lane,
  LocationProductPolicy,
  ProductCategory,
  TwinLocation,
} from "./flywayTypes";
import "./model-location-panel.css";

export interface ModelLocationSaveRequest {
  expectedRevision: number;
  location: TwinLocation;
  laneChanges: { additions: Lane[]; updates: Lane[]; removals: string[] };
}
export type ModelLocationSaveResult =
  | { ok: true; revision: number }
  | {
      ok: false;
      kind: "validation" | "revision-conflict" | "storage" | "unknown";
      message: string;
      currentRevision?: number;
    };
export interface ModelLocationPanelProps {
  open: boolean;
  location: TwinLocation;
  locations: TwinLocation[];
  lanes: Lane[];
  revision: number;
  defaults?: EngineDefaults;
  readOnly?: boolean;
  onClose: () => void;
  onCreateScenario?: () => void;
  onSave: (
    request: ModelLocationSaveRequest,
  ) => Promise<ModelLocationSaveResult>;
}

type Tab = "summary" | "edit";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const connected = (id: string, lanes: Lane[]) =>
  lanes.filter((lane) => lane.originId === id || lane.destinationId === id);
const finiteNonnegative = (value: number | undefined) =>
  value == null || (Number.isFinite(value) && value >= 0);
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const labelForEvidence = (classification: EvidenceClass) =>
  ({
    "verified-public": "Verified public",
    corroborated: "Corroborated public",
    "user-input": "User input",
    derived: "Derived",
    synthetic: "Sample estimate",
  })[classification];

function validate(
  location: TwinLocation,
  laneDrafts: Lane[],
  allLocations: TwinLocation[],
) {
  const errors: Record<string, string> = {};
  if (!location.name.trim()) errors.name = "Enter a location name.";
  if (!location.address.trim())
    errors.address = "Enter an address or a clearly labeled modeled location.";
  if (!location.city.trim()) errors.city = "Enter a city.";
  if (!/^[A-Z]{2}$/.test(location.state))
    errors.state = "Use a two-letter U.S. state code.";
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90)
    errors.latitude = "Latitude must be between −90 and 90.";
  if (
    !Number.isFinite(location.longitude) ||
    Math.abs(location.longitude) > 180
  )
    errors.longitude = "Longitude must be between −180 and 180.";
  if (location.calendar && !location.calendar.operatingWeekdays.length)
    errors.calendar = "Select at least one operating day.";
  const numericFields = [
    "weeklyDemand",
    "weeklyCapacity",
    "inventoryDays",
    "serviceRadiusMiles",
    "inboundCapacityPerDay",
    "outboundCapacityPerDay",
    "storageCapacity",
    "servicePriority",
  ] as const;
  for (const field of numericFields)
    if (!finiteNonnegative(location[field]))
      errors[field] = "Enter zero or a positive number.";
  if (
    location.reliability != null &&
    (!Number.isFinite(location.reliability) ||
      location.reliability < 0 ||
      location.reliability > 1)
  )
    errors.reliability = "Reliability must be between 0% and 100%.";
  if (
    location.type === "restaurant" &&
    location.assignedDcId &&
    !allLocations.some(
      (item) => item.id === location.assignedDcId && item.type === "dc",
    )
  )
    errors.assignedDcId = "Choose an available distribution center.";
  for (const policy of location.productPolicies || []) {
    const prefix = `product-${policy.product}`;
    const values = [
      policy.weeklyDemand,
      policy.weeklyProductionCapacity,
      policy.openingInventory,
      policy.storageCapacity,
      policy.safetyStock,
      policy.reorderPoint,
      policy.orderUpTo,
      policy.leadTimeDays,
      policy.reviewPeriodDays,
      policy.minimumOrderQuantity,
      policy.orderMultiple,
      policy.eventMultiplier,
      policy.purchaseCostMicros,
      policy.handlingCostMicros,
      policy.carryingCostMicrosPerUnitDay,
    ];
    if (values.some((value) => !finiteNonnegative(value)))
      errors[prefix] = "Product values must be zero or positive.";
    if (
      policy.growthRatePerPeriod != null &&
      (!Number.isFinite(policy.growthRatePerPeriod) ||
        policy.growthRatePerPeriod < -1)
    )
      errors[prefix] = "Growth cannot be below −100% per period.";
    if (
      policy.seasonalityByWeekday &&
      (policy.seasonalityByWeekday.length !== 7 ||
        policy.seasonalityByWeekday.some((value) => !finiteNonnegative(value)))
    )
      errors[prefix] =
        "Seasonality requires seven non-negative weekday weights.";
    if (
      policy.reviewPeriodDays != null &&
      (!Number.isInteger(policy.reviewPeriodDays) || policy.reviewPeriodDays < 1)
    )
      errors[prefix] =
        "Review period must be a whole number of at least one day.";
    if (
      policy.reorderPoint != null &&
      policy.orderUpTo != null &&
      policy.reorderPoint > policy.orderUpTo
    )
      errors[prefix] = "Reorder point cannot exceed order-up-to quantity.";
    if (
      policy.openingInventory != null &&
      policy.storageCapacity != null &&
      policy.openingInventory > policy.storageCapacity
    )
      errors[prefix] = "Opening inventory cannot exceed storage capacity.";
  }
  const ids = new Set(allLocations.map((item) => item.id));
  for (const lane of laneDrafts) {
    const key = `lane-${lane.id}`;
    if (
      !ids.has(lane.originId) ||
      !ids.has(lane.destinationId) ||
      lane.originId === lane.destinationId
    )
      errors[key] = "Choose two existing, different endpoints.";
    else if (!lane.products.length)
      errors[key] = "Select at least one product.";
    else if (
      ![
        lane.miles,
        lane.transitHours,
        lane.deliveriesPerWeek,
        lane.costPerMile,
        lane.weeklyCapacity,
        lane.dwellHours,
        lane.maxDriverHours,
        lane.vehicleCapacity,
      ].every((value) => finiteNonnegative(value))
    )
      errors[key] = "Lane values must be zero or positive.";
    else if (
      lane.deliveryWindow &&
      lane.deliveryWindow.startHour >= lane.deliveryWindow.endHour
    )
      errors[key] = "Delivery-window start must be before end.";
  }
  return errors;
}

const fieldValue = (value: number | undefined) => value ?? "";
const updatedPolicy = (
  location: TwinLocation,
  product: ProductCategory,
  patch: Partial<LocationProductPolicy>,
) => {
  const policies = [...(location.productPolicies || [])];
  const index = policies.findIndex((item) => item.product === product);
  const current =
    index >= 0
      ? policies[index]
      : { product, baseUnit: "case-equivalent" as const };
  const next = { ...current, ...patch };
  if (index >= 0) policies[index] = next;
  else policies.push(next);
  return { ...location, productPolicies: policies };
};

export function ModelLocationPanel({
  open,
  location,
  locations,
  lanes,
  revision,
  defaults,
  readOnly = false,
  onClose,
  onCreateScenario,
  onSave,
}: ModelLocationPanelProps) {
  const [tab, setTab] = useState<Tab>("summary");
  const [draft, setDraft] = useState(() => clone(location));
  const [laneDrafts, setLaneDrafts] = useState(() =>
    clone(connected(location.id, lanes)),
  );
  const [original, setOriginal] = useState(() => clone(location));
  const [originalLanes, setOriginalLanes] = useState(() =>
    clone(connected(location.id, lanes)),
  );
  const [baseRevision, setBaseRevision] = useState(revision);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success" | "warning";
    text: string;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [newLaneTarget, setNewLaneTarget] = useState("");
  const dirty = useMemo(
    () =>
      JSON.stringify(draft) !== JSON.stringify(original) ||
      JSON.stringify(laneDrafts) !== JSON.stringify(originalLanes),
    [draft, laneDrafts, original, originalLanes],
  );
  const byId = useMemo(
    () => new Map(locations.map((item) => [item.id, item])),
    [locations],
  );
  const compatibleTargets = locations.filter(
    (item) =>
      item.id !== draft.id &&
      (draft.type === "dc" ? item.type !== "dc" : item.type === "dc"),
  );

  useEffect(() => {
    setDraft(clone(location));
    setOriginal(clone(location));
    const nextLanes = clone(connected(location.id, lanes));
    setLaneDrafts(nextLanes);
    setOriginalLanes(clone(nextLanes));
    setBaseRevision(revision);
    setErrors({});
    setMessage(null);
    setDiscardPrompt(false);
    setTab("summary");
  }, [location.id]); // Deliberately retain a dirty draft when the same record changes remotely.

  useEffect(() => {
    if (revision === baseRevision) return;
    if (dirty)
      setMessage({
        kind: "warning",
        text: `Workspace revision ${revision} is newer than this draft. Your changes are retained; review the latest record before saving again.`,
      });
    else {
      const nextLanes = clone(connected(location.id, lanes));
      setDraft(clone(location));
      setOriginal(clone(location));
      setLaneDrafts(nextLanes);
      setOriginalLanes(clone(nextLanes));
      setBaseRevision(revision);
    }
  }, [revision, baseRevision, dirty, location, lanes]);

  const provenance = (path: string) => {
    const edited =
      JSON.stringify((draft as unknown as Record<string, unknown>)[path]) !==
      JSON.stringify((original as unknown as Record<string, unknown>)[path]);
    const evidence = draft.fieldEvidence?.[path];
    const identityFields = new Set([
      "name",
      "address",
      "city",
      "state",
      "latitude",
      "longitude",
    ]);
    return edited
      ? "Unsaved user input"
      : evidence
        ? labelForEvidence(evidence.classification)
        : identityFields.has(path)
          ? labelForEvidence(draft.evidence.classification)
          : "Sample estimate";
  };
  const patchDraft = (patch: Partial<TwinLocation>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setErrors({});
  };
  const patchLane = (id: string, patch: Partial<Lane>) => {
    setLaneDrafts((current) =>
      current.map((lane) => (lane.id === id ? { ...lane, ...patch } : lane)),
    );
    setMessage(null);
    setErrors({});
  };
  const requestClose = () => {
    if (dirty && !readOnly) setDiscardPrompt(true);
    else onClose();
  };
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, dirty, readOnly, onClose]);
  useEffect(() => {
    if (!dirty || readOnly) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [dirty, readOnly]);
  const discard = () => {
    setDraft(clone(original));
    setLaneDrafts(clone(originalLanes));
    setDiscardPrompt(false);
    setErrors({});
    setMessage(null);
    onClose();
  };
  const addLane = () => {
    const target = byId.get(newLaneTarget);
    if (!target) return;
    const origin = draft.type === "restaurant" ? target : draft;
    const destination = draft.type === "restaurant" ? draft : target;
    const shared = productCategories.filter(
      (product) =>
        origin.products.includes(product) &&
        destination.products.includes(product),
    );
    const id = `lane-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    setLaneDrafts((current) => [
      ...current,
      {
        id,
        originId: origin.id,
        destinationId: destination.id,
        products: shared,
        miles: 0,
        transitHours: 0,
        deliveriesPerWeek: 1,
        costPerMile: 0,
        status: "active",
        evidence: syntheticEvidence,
      },
    ]);
    if (draft.type === "restaurant" && target.type === "dc")
      patchDraft({ assignedDcId: target.id });
    setNewLaneTarget("");
  };
  const save = async () => {
    if (readOnly || saving) return;
    const validation = validate(draft, laneDrafts, locations);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setMessage({
        kind: "error",
        text: "Correct the highlighted fields. Your draft has not been discarded.",
      });
      setTab("edit");
      return;
    }
    const oldById = new Map(originalLanes.map((lane) => [lane.id, lane]));
    const newById = new Map(laneDrafts.map((lane) => [lane.id, lane]));
    const additions = laneDrafts.filter((lane) => !oldById.has(lane.id));
    const updates = laneDrafts.filter(
      (lane) =>
        oldById.has(lane.id) &&
        JSON.stringify(oldById.get(lane.id)) !== JSON.stringify(lane),
    );
    const removals = originalLanes
      .filter((lane) => !newById.has(lane.id))
      .map((lane) => lane.id);
    setSaving(true);
    setMessage(null);
    try {
      const result = await onSave({
        expectedRevision: baseRevision,
        location: clone(draft),
        laneChanges: {
          additions: clone(additions),
          updates: clone(updates),
          removals,
        },
      });
      if (!result.ok) {
        setMessage({
          kind: result.kind === "revision-conflict" ? "warning" : "error",
          text: result.message,
        });
        return;
      }
      setOriginal(clone(draft));
      setOriginalLanes(clone(laneDrafts));
      setBaseRevision(result.revision);
      setMessage({
        kind: "success",
        text: `Saved as workspace revision ${result.revision}.`,
      });
      setErrors({});
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "The workspace could not save this draft. Retry when storage is available.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      className="model-location-panel"
      data-open={open}
      aria-labelledby="model-location-title"
    >
      <header className="mlp-header">
        <div>
          <div className="mlp-title-row">
            <span className={`mlp-type is-${draft.type}`}>
              {draft.type === "dc" ? "Distribution center" : draft.type}
            </span>
            <span className={`mlp-status is-${draft.status}`}>
              {draft.status}
            </span>
          </div>
          <h2 id="model-location-title">{draft.name}</h2>
          <p>
            <MapPin size={16} aria-hidden="true" />
            {draft.city}, {draft.state}
          </p>
        </div>
        <button
          type="button"
          className="mlp-icon-button"
          onClick={requestClose}
          aria-label="Close location panel"
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <div
        className="mlp-tabs"
        role="tablist"
        aria-label="Location record views"
      >
        <button
          id="mlp-summary-tab"
          type="button"
          role="tab"
          aria-controls="mlp-summary"
          aria-selected={tab === "summary"}
          onClick={() => setTab("summary")}
        >
          Summary
        </button>
        <button
          id="mlp-edit-tab"
          type="button"
          role="tab"
          aria-controls="mlp-edit"
          aria-selected={tab === "edit"}
          onClick={() => setTab("edit")}
        >
          Model editor{dirty ? " •" : ""}
        </button>
      </div>
      <div className="mlp-messages">
        {readOnly && (
          <div className="mlp-notice is-warning" role="status">
            <AlertTriangle aria-hidden="true" />
            <span>
              <strong>Frozen comparison</strong>This run’s inputs are read-only.
              Return to the live workspace to edit them.
            </span>
          </div>
        )}
        {message && (
          <div
            className={`mlp-notice is-${message.kind}`}
            role={message.kind === "error" ? "alert" : "status"}
          >
            <AlertTriangle aria-hidden="true" />
            <span>{message.text}</span>
          </div>
        )}
      </div>
      <div className="mlp-scroll">
        {tab === "summary" && (
          <div
            id="mlp-summary"
            role="tabpanel"
            aria-labelledby="mlp-summary-tab"
            className="mlp-summary"
          >
            {defaults && (
              <section>
                <h3>Active engine inheritance</h3>
                <div className="mlp-default-note">
                  <strong>
                    Blank product overrides use the frozen workspace defaults.
                  </strong>
                  <span>
                    {defaults.defaultLeadTimeDays} day lead time ·{" "}
                    {defaults.defaultSafetyStockDays} demand days of safety
                    stock · {defaults.defaultOrderUpToDays} demand days
                    order-up-to ·{" "}
                    {number.format(defaults.defaultVehicleCapacity)} unit
                    vehicle capacity.
                  </span>
                </div>
              </section>
            )}
            <section>
              <h3>Location record</h3>
              <dl className="mlp-facts">
                <div>
                  <dt>Address</dt>
                  <dd>{draft.address}</dd>
                </div>
                <div>
                  <dt>Geometry</dt>
                  <dd>
                    {draft.latitude.toFixed(4)}, {draft.longitude.toFixed(4)}
                    <small>
                      {draft.mapPrecision === "exact-public-address"
                        ? "Exact public geometry"
                        : draft.mapPrecision === "city-level-public-evidence"
                          ? "City-level public evidence"
                          : "Modeled user placement"}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>{draft.operatingSchedule}</dd>
                </div>
                <div>
                  <dt>Reliability</dt>
                  <dd>
                    {draft.reliability == null
                      ? "Not set"
                      : `${number.format(draft.reliability * 100)}%`}
                  </dd>
                </div>
                {draft.type === "restaurant" && (
                  <div>
                    <dt>Primary DC</dt>
                    <dd>
                      {draft.assignedDcId
                        ? byId.get(draft.assignedDcId)?.name || "Missing record"
                        : "Unassigned"}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section>
              <h3>Capacity and inventory</h3>
              <dl className="mlp-facts">
                <div>
                  <dt>
                    {draft.type === "restaurant"
                      ? "Weekly demand"
                      : "Weekly capacity"}
                  </dt>
                  <dd>
                    {number.format(
                      draft.type === "restaurant"
                        ? draft.weeklyDemand || 0
                        : draft.weeklyCapacity || 0,
                    )}{" "}
                    units
                    <small>
                      {provenance(
                        draft.type === "restaurant"
                          ? "weeklyDemand"
                          : "weeklyCapacity",
                      )}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Inventory cover</dt>
                  <dd>
                    {number.format(draft.inventoryDays || 0)} days
                    <small>{provenance("inventoryDays")}</small>
                  </dd>
                </div>
                <div>
                  <dt>Inbound / outbound</dt>
                  <dd>
                    {number.format(draft.inboundCapacityPerDay || 0)} /{" "}
                    {number.format(draft.outboundCapacityPerDay || 0)} per day
                  </dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>{number.format(draft.storageCapacity || 0)} units</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3>Product flow</h3>
              <div className="mlp-product-summary">
                {draft.products.map((product) => {
                  const policy = draft.productPolicies?.find(
                    (item) => item.product === product,
                  );
                  return (
                    <div key={product}>
                      <strong>{product}</strong>
                      <span>
                        {draft.type === "restaurant"
                          ? `${number.format(policy?.weeklyDemand ?? 0)} demand / week`
                          : `${number.format(policy?.weeklyProductionCapacity ?? 0)} capacity / week`}
                      </span>
                      <span>
                        {number.format(policy?.openingInventory ?? 0)} opening ·{" "}
                        {number.format(policy?.reorderPoint ?? 0)} reorder ·{" "}
                        {number.format(policy?.orderUpTo ?? 0)} order-up-to
                      </span>
                    </div>
                  );
                })}
                {!draft.products.length && (
                  <p>No product flows are enabled for this location.</p>
                )}
              </div>
            </section>
            <section>
              <h3>Connections</h3>
              <div className="mlp-lane-summary">
                {laneDrafts.map((lane) => {
                  const other = byId.get(
                    lane.originId === draft.id
                      ? lane.destinationId
                      : lane.originId,
                  );
                  return (
                    <div key={lane.id}>
                      <span>
                        <strong>{other?.name || "Missing endpoint"}</strong>
                        <small>
                          {lane.originId === draft.id ? "Outbound" : "Inbound"}{" "}
                          · {lane.status}
                        </small>
                      </span>
                      <span>
                        {number.format(lane.miles)} mi ·{" "}
                        {number.format(lane.transitHours)} hr ·{" "}
                        {number.format(lane.deliveriesPerWeek)} / week
                      </span>
                    </div>
                  );
                })}
                {!laneDrafts.length && (
                  <p>No lanes connect this location to the active model.</p>
                )}
              </div>
            </section>
            <section>
              <h3>Record provenance</h3>
              <div className="mlp-provenance">
                <span
                  className={`mlp-evidence is-${draft.evidence.classification}`}
                >
                  {labelForEvidence(draft.evidence.classification)}
                </span>
                <div>
                  <strong>{draft.evidence.sourceTitle}</strong>
                  <p>
                    {draft.evidence.note ||
                      "No additional source note is recorded."}
                  </p>
                  <small>
                    {draft.evidence.publisher} · checked{" "}
                    {draft.evidence.verifiedAt}
                  </small>
                  {draft.evidence.sourceUrl && (
                    <a
                      href={draft.evidence.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open public source{" "}
                      <ExternalLink size={15} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
        {tab === "edit" && (
          <form
            id="mlp-edit"
            role="tabpanel"
            aria-labelledby="mlp-edit-tab"
            className="mlp-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <section>
              <div className="mlp-section-heading">
                <div>
                  <h3>Identity and placement</h3>
                  <p>
                    Public evidence stays attached; changed identity or geometry
                    is saved as user input.
                  </p>
                </div>
                <span className="mlp-evidence is-user-input">
                  Editable model
                </span>
              </div>
              <div className="mlp-grid">
                <Field
                  label="Location name"
                  error={errors.name}
                  wide
                  provenance={provenance("name")}
                >
                  <input
                    value={draft.name}
                    maxLength={160}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({ name: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Address"
                  error={errors.address}
                  wide
                  provenance={provenance("address")}
                >
                  <input
                    value={draft.address}
                    maxLength={240}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({ address: event.target.value })
                    }
                  />
                </Field>
                <Field label="City" error={errors.city}>
                  <input
                    value={draft.city}
                    maxLength={100}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({ city: event.target.value })
                    }
                  />
                </Field>
                <Field label="State" error={errors.state}>
                  <input
                    value={draft.state}
                    maxLength={2}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({ state: event.target.value.toUpperCase() })
                    }
                  />
                </Field>
                <Field
                  label="Latitude"
                  error={errors.latitude}
                  provenance={provenance("latitude")}
                >
                  <input
                    type="number"
                    step="any"
                    value={draft.latitude}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        latitude: Number(event.target.value),
                        mapPrecision: "model-only",
                      })
                    }
                  />
                </Field>
                <Field
                  label="Longitude"
                  error={errors.longitude}
                  provenance={provenance("longitude")}
                >
                  <input
                    type="number"
                    step="any"
                    value={draft.longitude}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        longitude: Number(event.target.value),
                        mapPrecision: "model-only",
                      })
                    }
                  />
                </Field>
              </div>
            </section>
            <section>
              <h3>Operating model</h3>
              <div className="mlp-grid">
                <Field label="Status">
                  <select
                    value={draft.status}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        status: event.target.value as TwinLocation["status"],
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="planned">Planned</option>
                    <option value="unavailable">Unavailable</option>
                    <option value="closed">Closed</option>
                  </select>
                </Field>
                <Field
                  label="Reliability"
                  hint="Percent"
                  error={errors.reliability}
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={
                      draft.reliability == null ? "" : draft.reliability * 100
                    }
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        reliability:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value) / 100,
                      })
                    }
                  />
                </Field>
                <Field
                  label={
                    draft.type === "restaurant"
                      ? "Weekly demand"
                      : "Weekly capacity"
                  }
                  error={
                    errors[
                      draft.type === "restaurant"
                        ? "weeklyDemand"
                        : "weeklyCapacity"
                    ]
                  }
                >
                  <input
                    type="number"
                    min="0"
                    value={fieldValue(
                      draft.type === "restaurant"
                        ? draft.weeklyDemand
                        : draft.weeklyCapacity,
                    )}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft(
                        draft.type === "restaurant"
                          ? { weeklyDemand: Number(event.target.value) }
                          : { weeklyCapacity: Number(event.target.value) },
                      )
                    }
                  />
                </Field>
                <Field
                  label="Inventory cover"
                  hint="Days"
                  error={errors.inventoryDays}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={fieldValue(draft.inventoryDays)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({ inventoryDays: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field
                  label="Inbound capacity"
                  hint="Units / day"
                  error={errors.inboundCapacityPerDay}
                >
                  <input
                    type="number"
                    min="0"
                    value={fieldValue(draft.inboundCapacityPerDay)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        inboundCapacityPerDay: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Outbound capacity"
                  hint="Units / day"
                  error={errors.outboundCapacityPerDay}
                >
                  <input
                    type="number"
                    min="0"
                    value={fieldValue(draft.outboundCapacityPerDay)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        outboundCapacityPerDay: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Storage capacity"
                  hint="Model units"
                  error={errors.storageCapacity}
                >
                  <input
                    type="number"
                    min="0"
                    value={fieldValue(draft.storageCapacity)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        storageCapacity: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Service radius"
                  hint="Miles"
                  error={errors.serviceRadiusMiles}
                >
                  <input
                    type="number"
                    min="0"
                    value={fieldValue(draft.serviceRadiusMiles)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({
                        serviceRadiusMiles: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                {draft.type === "restaurant" && (
                  <Field
                    label="Primary distribution center"
                    error={errors.assignedDcId}
                    wide
                  >
                    <select
                      value={draft.assignedDcId || ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchDraft({
                          assignedDcId: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {locations
                        .filter((item) => item.type === "dc")
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field label="Operating schedule label" wide>
                  <input
                    value={draft.operatingSchedule}
                    maxLength={180}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchDraft({ operatingSchedule: event.target.value })
                    }
                  />
                </Field>
              </div>
              <fieldset className="mlp-weekdays">
                <legend>
                  <CalendarDays size={17} aria-hidden="true" />
                  Operating calendar
                </legend>
                {weekdays.map((day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={(
                        draft.calendar?.operatingWeekdays || []
                      ).includes(index)}
                      disabled={readOnly}
                      onChange={(event) => {
                        const days = new Set(
                          draft.calendar?.operatingWeekdays || [],
                        );
                        if (event.target.checked) days.add(index);
                        else days.delete(index);
                        patchDraft({
                          calendar: {
                            ...draft.calendar,
                            operatingWeekdays: [...days].sort(),
                          },
                        });
                      }}
                    />
                    <span>{day}</span>
                  </label>
                ))}
                {errors.calendar && (
                  <p className="mlp-field-error">{errors.calendar}</p>
                )}
              </fieldset>
            </section>
            <section>
              <div className="mlp-section-heading">
                <div>
                  <h3>Product policies</h3>
                  <p>
                    Explicit values override weighted location defaults in the
                    simulation engine.
                  </p>
                </div>
              </div>
              <div className="mlp-product-editor">
                {productCategories.map((product) => {
                  const enabled = draft.products.includes(product);
                  const policy = draft.productPolicies?.find(
                    (item) => item.product === product,
                  ) || { product, baseUnit: "case-equivalent" as const };
                  return (
                    <details key={product} open={enabled}>
                      <summary
                        onClick={(event) => {
                          event.preventDefault();
                          if (!readOnly)
                            patchDraft({
                              products: enabled
                                ? draft.products.filter(
                                    (item) => item !== product,
                                  )
                                : [...draft.products, product],
                              productPolicies: enabled
                                ? (draft.productPolicies || []).filter(
                                    (item) => item.product !== product,
                                  )
                                : draft.productPolicies,
                            });
                        }}
                        aria-label={`${enabled ? "Remove" : "Add"} ${product} ${enabled ? "from" : "to"} this location`}
                      >
                        <span>
                          <span
                            className={`mlp-product-toggle${enabled ? " is-checked" : ""}`}
                            aria-hidden="true"
                          >
                            {enabled && <Check size={14} />}
                          </span>
                          <span>
                            <strong>{product}</strong>
                            <small>
                              {enabled
                                ? "Included in modeled flow"
                                : "Not modeled at this location"}
                            </small>
                          </span>
                        </span>
                        <ArrowRight size={17} aria-hidden="true" />
                      </summary>
                      {enabled && (
                        <div className="mlp-policy-grid">
                          <Field label="Base unit">
                            <select
                              value={policy.baseUnit}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    baseUnit: event.target
                                      .value as LocationProductPolicy["baseUnit"],
                                  }),
                                )
                              }
                            >
                              <option value="case-equivalent">
                                Case equivalent
                              </option>
                              <option value="case">Case</option>
                              <option value="each">Each</option>
                              <option value="pallet">Pallet</option>
                            </select>
                          </Field>
                          <Field
                            label={
                              draft.type === "restaurant"
                                ? "Weekly demand"
                                : "Weekly production capacity"
                            }
                          >
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(
                                draft.type === "restaurant"
                                  ? policy.weeklyDemand
                                  : policy.weeklyProductionCapacity,
                              )}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(
                                    draft,
                                    product,
                                    draft.type === "restaurant"
                                      ? {
                                          weeklyDemand: Number(
                                            event.target.value,
                                          ),
                                        }
                                      : {
                                          weeklyProductionCapacity: Number(
                                            event.target.value,
                                          ),
                                        },
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label="Opening inventory">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.openingInventory)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    openingInventory: Number(
                                      event.target.value,
                                    ),
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Storage capacity">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.storageCapacity)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    storageCapacity: Number(event.target.value),
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Safety stock">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.safetyStock)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    safetyStock: Number(event.target.value),
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Reorder point">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.reorderPoint)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    reorderPoint: Number(event.target.value),
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Order up to">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.orderUpTo)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    orderUpTo: Number(event.target.value),
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Lead time" hint="Days">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.leadTimeDays)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    leadTimeDays: Number(event.target.value),
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Replenishment policy">
                            <select
                              value={policy.replenishmentPolicy || "reorder-point"}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(
                                  updatedPolicy(draft, product, {
                                    replenishmentPolicy: event.target
                                      .value as LocationProductPolicy["replenishmentPolicy"],
                                  }),
                                )
                              }
                            >
                              <option value="reorder-point">Reorder point</option>
                              <option value="min-max">Min / max</option>
                              <option value="scheduled">Scheduled</option>
                            </select>
                          </Field>
                          <Field label="Review period" hint="Days">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.reviewPeriodDays)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(updatedPolicy(draft, product, { reviewPeriodDays: Number(event.target.value) }))
                              }
                            />
                          </Field>
                          <Field label="Minimum order quantity">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.minimumOrderQuantity)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(updatedPolicy(draft, product, { minimumOrderQuantity: Number(event.target.value) }))
                              }
                            />
                          </Field>
                          <Field label="Order multiple">
                            <input
                              type="number"
                              min="0"
                              value={fieldValue(policy.orderMultiple)}
                              disabled={readOnly}
                              onChange={(event) =>
                                setDraft(updatedPolicy(draft, product, { orderMultiple: Number(event.target.value) }))
                              }
                            />
                          </Field>
                          {policy.replenishmentPolicy === "scheduled" && (
                            <fieldset className="mlp-schedule-grid mlp-wide">
                              <legend>Scheduled replenishment by weekday</legend>
                              {weekdays.map((day, weekday) => {
                                const scheduled = policy.scheduledReplenishment?.find((item) => item.weekday === weekday);
                                return <label key={day}><span>{day}</span><input aria-label={`${product} ${day} scheduled quantity`} type="number" min="0" value={scheduled?.quantity ?? ""} disabled={readOnly} onChange={(event) => {
                                  const schedule = (policy.scheduledReplenishment || []).filter((item) => item.weekday !== weekday);
                                  if (event.target.value !== "") schedule.push({ weekday, quantity: Number(event.target.value) });
                                  setDraft(updatedPolicy(draft, product, { scheduledReplenishment: schedule.sort((a, b) => a.weekday - b.weekday) }));
                                }} /></label>;
                              })}
                            </fieldset>
                          )}
                          {errors[`product-${product}`] && (
                            <p className="mlp-field-error mlp-wide">
                              {errors[`product-${product}`]}
                            </p>
                          )}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </section>
            <section>
              <div className="mlp-section-heading">
                <div>
                  <h3>Manual lanes and assignment</h3>
                  <p>
                    Lane edits are committed atomically with this location
                    revision.
                  </p>
                </div>
              </div>
              <div className="mlp-add-lane">
                <select
                  aria-label="New lane endpoint"
                  value={newLaneTarget}
                  disabled={readOnly}
                  onChange={(event) => setNewLaneTarget(event.target.value)}
                >
                  <option value="">Choose a compatible endpoint</option>
                  {compatibleTargets
                    .filter(
                      (target) =>
                        !laneDrafts.some(
                          (lane) =>
                            lane.originId === target.id ||
                            lane.destinationId === target.id,
                        ),
                    )
                    .map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={readOnly || !newLaneTarget}
                  onClick={addLane}
                >
                  <Plus size={17} aria-hidden="true" />
                  Add lane
                </button>
              </div>
              <div className="mlp-lane-editor">
                {laneDrafts.map((lane) => {
                  const other = byId.get(
                    lane.originId === draft.id
                      ? lane.destinationId
                      : lane.originId,
                  );
                  return (
                    <details key={lane.id}>
                      <summary>
                        <span>
                          <strong>{other?.name || "Missing endpoint"}</strong>
                          <small>
                            {lane.originId === draft.id
                              ? "Outbound"
                              : "Inbound"}{" "}
                            · {lane.status} · {lane.products.length} products
                          </small>
                        </span>
                        <ArrowRight size={17} aria-hidden="true" />
                      </summary>
                      <div className="mlp-grid">
                        <Field label="Status">
                          <select
                            value={lane.status}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                status: event.target.value as Lane["status"],
                              })
                            }
                          >
                            <option value="active">Active</option>
                            <option value="recommended">Recommended</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </Field>
                        <Field label="Distance" hint="Miles">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={lane.miles}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                miles: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Transit time" hint="Hours">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={lane.transitHours}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                transitHours: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Dwell time" hint="Hours">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={fieldValue(lane.dwellHours)}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                dwellHours: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Deliveries per week">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={lane.deliveriesPerWeek}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                deliveriesPerWeek: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Weekly capacity">
                          <input
                            type="number"
                            min="0"
                            value={fieldValue(lane.weeklyCapacity)}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                weeklyCapacity: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Freight cost" hint="$ / mile">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={lane.costPerMile}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                costPerMile: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Driver limit" hint="Hours">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={fieldValue(lane.maxDriverHours)}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                maxDriverHours: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Vehicle capacity">
                          <input
                            type="number"
                            min="0"
                            value={fieldValue(lane.vehicleCapacity)}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchLane(lane.id, {
                                vehicleCapacity: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Delivery window" hint="Start / end hour">
                          <div className="mlp-inline-inputs">
                            <input
                              aria-label="Delivery window start hour"
                              type="number"
                              min="0"
                              max="23"
                              value={lane.deliveryWindow?.startHour ?? ""}
                              disabled={readOnly}
                              onChange={(event) =>
                                patchLane(lane.id, {
                                  deliveryWindow: {
                                    startHour: Number(event.target.value),
                                    endHour: lane.deliveryWindow?.endHour ?? 24,
                                  },
                                })
                              }
                            />
                            <input
                              aria-label="Delivery window end hour"
                              type="number"
                              min="1"
                              max="24"
                              value={lane.deliveryWindow?.endHour ?? ""}
                              disabled={readOnly}
                              onChange={(event) =>
                                patchLane(lane.id, {
                                  deliveryWindow: {
                                    startHour:
                                      lane.deliveryWindow?.startHour ?? 0,
                                    endHour: Number(event.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                        </Field>
                        <fieldset className="mlp-lane-products mlp-wide">
                          <legend>Products on lane</legend>
                          {productCategories
                            .filter(
                              (product) =>
                                draft.products.includes(product) &&
                                (other?.products || []).includes(product),
                            )
                            .map((product) => (
                              <label key={product}>
                                <input
                                  type="checkbox"
                                  checked={lane.products.includes(product)}
                                  disabled={readOnly}
                                  onChange={(event) =>
                                    patchLane(lane.id, {
                                      products: event.target.checked
                                        ? [...lane.products, product]
                                        : lane.products.filter(
                                            (item) => item !== product,
                                          ),
                                    })
                                  }
                                />
                                {product}
                              </label>
                            ))}
                        </fieldset>
                        {errors[`lane-${lane.id}`] && (
                          <p className="mlp-field-error mlp-wide">
                            {errors[`lane-${lane.id}`]}
                          </p>
                        )}
                        <button
                          type="button"
                          className="mlp-remove-lane mlp-wide"
                          disabled={readOnly}
                          onClick={() =>
                            setLaneDrafts((current) =>
                              current.filter((item) => item.id !== lane.id),
                            )
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          Remove lane from draft
                        </button>
                      </div>
                    </details>
                  );
                })}
                {!laneDrafts.length && (
                  <p className="mlp-empty">
                    No lanes are connected. Add a compatible endpoint to create
                    one.
                  </p>
                )}
              </div>
            </section>
          </form>
        )}
      </div>
      <footer className="mlp-footer">
        {discardPrompt ? (
          <div className="mlp-discard" role="alert">
            <span>
              <strong>Discard unsaved changes?</strong>Your location and lane
              draft will be lost.
            </span>
            <button type="button" onClick={() => setDiscardPrompt(false)}>
              Keep editing
            </button>
            <button type="button" className="is-danger" onClick={discard}>
              Discard and close
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="mlp-secondary"
              onClick={requestClose}
            >
              Close
            </button>
            {onCreateScenario && (
              <button
                type="button"
                className="mlp-secondary"
                onClick={onCreateScenario}
                disabled={dirty || saving}
                title={dirty ? "Save or discard your model edits before creating a scenario." : undefined}
              >
                Create scenario
              </button>
            )}
            <button
              type="button"
              className="mlp-primary"
              disabled={readOnly || saving || !dirty}
              onClick={() => void save()}
            >
              <Save size={17} aria-hidden="true" />
              {saving ? "Saving revision…" : "Save model revision"}
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}

function Field({
  label,
  hint,
  error,
  provenance,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  provenance?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`mlp-field${wide ? " mlp-wide" : ""}${error ? " has-error" : ""}`}
    >
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      {children}
      {provenance && <em>{provenance}</em>}
      {error && <em className="mlp-field-error">{error}</em>}
    </label>
  );
}
