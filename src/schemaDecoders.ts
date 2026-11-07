import type { EvidenceLedger } from "./evidence/types";
import type {
  EngineDefaults,
  Lane,
  RunInputV2,
  SavedScenario,
  ScenarioDefinition,
  ScenarioResult,
  TwinLocation,
} from "./flywayTypes";
import type { WorkspacePreferences } from "./workspacePreferences";
import { decodeStoredScenario } from "./runArtifactDecoders";
import { isIntelligenceState } from "./decisionIntelligence";

export type DecodeResult<T> =
  { ok: true; value: T } | { ok: false; errors: Record<string, string> };
type Errors = Record<string, string>;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const nonempty = (value: unknown): value is string =>
  text(value) && value.trim().length > 0;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number =>
  finite(value) && value >= 0;
const integer = (value: unknown): value is number => Number.isInteger(value);
const optional = (value: unknown, predicate: (item: unknown) => boolean) =>
  value === undefined || predicate(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(text);
const oneOf = (value: unknown, choices: readonly string[]) =>
  text(value) && choices.includes(value);
const add = (errors: Errors, path: string, valid: boolean, message: string) => {
  if (!valid) errors[path] = message;
};
const jsonSafe = (value: unknown): boolean =>
  value === null ||
  text(value) ||
  typeof value === "boolean" ||
  finite(value) ||
  (Array.isArray(value) && value.every(jsonSafe)) ||
  (record(value) && Object.values(value).every(jsonSafe));
const result = <T>(value: unknown, errors: Errors): DecodeResult<T> =>
  Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: value as T };

const products = [
  "Chicken",
  "Produce",
  "Buns & bakery",
  "Packaging",
  "Beverages",
  "Cooking oil",
  "Equipment",
] as const;
const units = ["case-equivalent", "case", "each", "pallet"] as const;
const evidenceClasses = [
  "verified-public",
  "corroborated",
  "user-input",
  "derived",
  "synthetic",
] as const;
const scenarioTypes = [
  "dc-outage",
  "supplier-failure",
  "demand-surge",
  "severe-weather",
  "price-change",
  "capacity-constraint",
  "location-closure",
] as const;

function evidence(value: unknown, path: string, errors: Errors) {
  add(errors, path, record(value), "Evidence must be an object.");
  if (!record(value)) return;
  add(
    errors,
    `${path}.classification`,
    oneOf(value.classification, evidenceClasses),
    "Unsupported evidence classification.",
  );
  add(
    errors,
    `${path}.confidence`,
    value.confidence === null ||
      (finite(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 1),
    "Confidence must be null or between 0 and 1.",
  );
  for (const field of ["sourceTitle", "publisher", "verifiedAt"] as const)
    add(errors, `${path}.${field}`, text(value[field]), "Must be text.");
  add(
    errors,
    `${path}.sourceUrl`,
    optional(value.sourceUrl, text),
    "Must be a URL string when present.",
  );
}

function evidenceValue(value: unknown, path: string, errors: Errors) {
  add(errors, path, record(value), "Field evidence must be an object.");
  if (!record(value)) return;
  for (const field of [
    "id",
    "entityType",
    "entityId",
    "fieldPath",
    "sourceTitle",
    "sourcePublisher",
    "verifiedAt",
    "effectiveFrom",
    "extractionMethod",
    "extractorVersion",
    "reviewStatus",
  ] as const)
    add(errors, `${path}.${field}`, text(value[field]), "Must be text.");
  add(
    errors,
    `${path}.classification`,
    oneOf(value.classification, evidenceClasses),
    "Unsupported classification.",
  );
  add(
    errors,
    `${path}.confidence`,
    value.confidence === null ||
      (finite(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 1),
    "Must be null or 0–1.",
  );
  for (const field of [
    "sourceId",
    "sourceArtifactId",
    "sourceUrl",
    "sourcePublishedAt",
    "effectiveTo",
    "reviewNote",
    "supersedesId",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      value[field] === null || text(value[field]),
      "Must be text or null.",
    );
}

export function decodeLocation(
  value: unknown,
  path = "location",
): DecodeResult<TwinLocation> {
  const errors: Errors = {};
  add(errors, path, record(value), "Must be an object.");
  if (!record(value)) return result(value, errors);
  for (const field of [
    "id",
    "name",
    "city",
    "state",
    "address",
    "operatingSchedule",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      nonempty(value[field]),
      "Non-empty text is required.",
    );
  add(
    errors,
    `${path}.type`,
    oneOf(value.type, ["restaurant", "dc", "supplier"]),
    "Unsupported location type.",
  );
  add(
    errors,
    `${path}.status`,
    oneOf(value.status, ["active", "planned", "unavailable", "closed"]),
    "Unsupported location status.",
  );
  add(
    errors,
    `${path}.latitude`,
    finite(value.latitude) && value.latitude >= -90 && value.latitude <= 90,
    "Must be between -90 and 90.",
  );
  add(
    errors,
    `${path}.longitude`,
    finite(value.longitude) &&
      value.longitude >= -180 &&
      value.longitude <= 180,
    "Must be between -180 and 180.",
  );
  add(
    errors,
    `${path}.products`,
    Array.isArray(value.products) &&
      value.products.length > 0 &&
      value.products.every((item) => oneOf(item, products)) &&
      new Set(value.products).size === value.products.length,
    "Must contain unique supported products.",
  );
  evidence(value.evidence, `${path}.evidence`, errors);
  for (const field of [
    "weeklyDemand",
    "weeklyCapacity",
    "inventoryDays",
    "serviceRadiusMiles",
    "inboundCapacityPerDay",
    "outboundCapacityPerDay",
    "storageCapacity",
    "servicePriority",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      optional(value[field], nonnegative),
      "Must be non-negative when present.",
    );
  add(
    errors,
    `${path}.reliability`,
    optional(
      value.reliability,
      (item) => finite(item) && item >= 0 && item <= 1,
    ),
    "Must be between 0 and 1.",
  );
  add(
    errors,
    `${path}.assignedDcId`,
    optional(value.assignedDcId, text),
    "Must be text when present.",
  );
  if (value.calendar !== undefined) {
    add(
      errors,
      `${path}.calendar`,
      record(value.calendar),
      "Must be an object.",
    );
    if (record(value.calendar)) {
      add(
        errors,
        `${path}.calendar.operatingWeekdays`,
        Array.isArray(value.calendar.operatingWeekdays) &&
          value.calendar.operatingWeekdays.every(
            (day) => integer(day) && day >= 0 && day <= 6,
          ) &&
          new Set(value.calendar.operatingWeekdays).size ===
            value.calendar.operatingWeekdays.length,
        "Must contain unique weekdays 0–6.",
      );
      add(
        errors,
        `${path}.calendar.exceptions`,
        optional(
          value.calendar.exceptions,
          (items) =>
            Array.isArray(items) &&
            items.every(
              (item) =>
                record(item) &&
                text(item.date) &&
                typeof item.open === "boolean",
            ),
        ),
        "Calendar exceptions are invalid.",
      );
    }
  }
  if (value.productPolicies !== undefined) {
    add(
      errors,
      `${path}.productPolicies`,
      Array.isArray(value.productPolicies),
      "Must be an array.",
    );
    if (Array.isArray(value.productPolicies))
      value.productPolicies.forEach((policy, index) => {
        const key = `${path}.productPolicies[${index}]`;
        add(errors, key, record(policy), "Must be an object.");
        if (!record(policy)) return;
        add(
          errors,
          `${key}.product`,
          oneOf(policy.product, products) &&
            Array.isArray(value.products) &&
            value.products.includes(policy.product),
          "Must reference a product enabled at this location.",
        );
        add(
          errors,
          `${key}.baseUnit`,
          oneOf(policy.baseUnit, units),
          "Unsupported unit.",
        );
        for (const field of [
          "weeklyDemand",
          "weeklyProductionCapacity",
          "openingInventory",
          "storageCapacity",
          "safetyStock",
          "reorderPoint",
          "orderUpTo",
          "leadTimeDays",
          "minimumOrderQuantity",
          "orderMultiple",
          "eventMultiplier",
          "purchaseCostMicros",
          "handlingCostMicros",
          "carryingCostMicrosPerUnitDay",
        ] as const)
          add(
            errors,
            `${key}.${field}`,
            optional(policy[field], nonnegative),
            "Must be non-negative when present.",
          );
        add(
          errors,
          `${key}.growthRatePerPeriod`,
          optional(
            policy.growthRatePerPeriod,
            (item) => finite(item) && item >= -1,
          ),
          "Must be at least -1.",
        );
        add(
          errors,
          `${key}.reviewPeriodDays`,
          optional(
            policy.reviewPeriodDays,
            (item) => integer(item) && item >= 1,
          ),
          "Must be a positive whole day count.",
        );
        add(
          errors,
          `${key}.replenishmentPolicy`,
          optional(policy.replenishmentPolicy, (item) =>
            oneOf(item, ["min-max", "reorder-point", "scheduled"]),
          ),
          "Unsupported replenishment policy.",
        );
        add(
          errors,
          `${key}.seasonalityByWeekday`,
          optional(
            policy.seasonalityByWeekday,
            (items) =>
              Array.isArray(items) &&
              items.length === 7 &&
              items.every(nonnegative),
          ),
          "Must contain seven non-negative weights.",
        );
        add(
          errors,
          `${key}.scheduledReplenishment`,
          optional(
            policy.scheduledReplenishment,
            (items) =>
              Array.isArray(items) &&
              items.every(
                (item) =>
                  record(item) &&
                  integer(item.weekday) &&
                  item.weekday >= 0 &&
                  item.weekday <= 6 &&
                  nonnegative(item.quantity),
              ),
          ),
          "Scheduled replenishment is invalid.",
        );
      });
  }
  if (value.fieldEvidence !== undefined) {
    add(
      errors,
      `${path}.fieldEvidence`,
      record(value.fieldEvidence),
      "Must be an evidence record.",
    );
    if (record(value.fieldEvidence))
      Object.entries(value.fieldEvidence).forEach(([field, item]) =>
        evidenceValue(item, `${path}.fieldEvidence.${field}`, errors),
      );
  }
  return result<TwinLocation>(value, errors);
}

export function decodeLane(
  value: unknown,
  locationIds?: Set<string>,
  path = "lane",
): DecodeResult<Lane> {
  const errors: Errors = {};
  add(errors, path, record(value), "Must be an object.");
  if (!record(value)) return result(value, errors);
  for (const field of ["id", "originId", "destinationId"] as const)
    add(
      errors,
      `${path}.${field}`,
      nonempty(value[field]),
      "Non-empty text is required.",
    );
  if (locationIds) {
    add(
      errors,
      `${path}.originId`,
      text(value.originId) && locationIds.has(value.originId),
      "Must reference an existing location.",
    );
    add(
      errors,
      `${path}.destinationId`,
      text(value.destinationId) && locationIds.has(value.destinationId),
      "Must reference an existing location.",
    );
  }
  add(
    errors,
    `${path}.endpoints`,
    value.originId !== value.destinationId,
    "Origin and destination must differ.",
  );
  add(
    errors,
    `${path}.products`,
    Array.isArray(value.products) &&
      value.products.length > 0 &&
      value.products.every((item) => oneOf(item, products)) &&
      new Set(value.products).size === value.products.length,
    "Must contain unique supported products.",
  );
  add(
    errors,
    `${path}.status`,
    oneOf(value.status, ["active", "recommended", "inactive"]),
    "Unsupported lane status.",
  );
  evidence(value.evidence, `${path}.evidence`, errors);
  for (const field of [
    "miles",
    "transitHours",
    "deliveriesPerWeek",
    "costPerMile",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      nonnegative(value[field]),
      "Must be non-negative.",
    );
  for (const field of [
    "weeklyCapacity",
    "fixedDispatchCostMicros",
    "driverCostMicrosPerHour",
    "tollCostMicros",
    "vehicleCapacity",
    "dwellHours",
    "maxDriverHours",
    "fuelEconomyMpg",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      optional(value[field], nonnegative),
      "Must be non-negative when present.",
    );
  add(
    errors,
    `${path}.operatingDays`,
    optional(
      value.operatingDays,
      (items) =>
        Array.isArray(items) &&
        items.every((day) => integer(day) && day >= 0 && day <= 6),
    ),
    "Operating days are invalid.",
  );
  for (const field of ["deliveryWindow", "receivingWindow"] as const)
    add(
      errors,
      `${path}.${field}`,
      optional(
        value[field],
        (window) =>
          record(window) &&
          finite(window.startHour) &&
          finite(window.endHour) &&
          window.startHour >= 0 &&
          window.endHour <= 24 &&
          window.startHour < window.endHour,
      ),
      "Window must be within 0–24 with start before end.",
    );
  if (value.vehicleType !== undefined)
    add(
      errors,
      `${path}.vehicleType`,
      record(value.vehicleType) &&
        nonempty(value.vehicleType.id) &&
        nonempty(value.vehicleType.name) &&
        finite(value.vehicleType.capacity) &&
        value.vehicleType.capacity > 0 &&
        nonnegative(value.vehicleType.fixedCostMicros),
      "Vehicle type is invalid.",
    );
  if (value.productPolicies !== undefined)
    add(
      errors,
      `${path}.productPolicies`,
      Array.isArray(value.productPolicies) &&
        value.productPolicies.every(
          (policy) =>
            record(policy) &&
            oneOf(policy.product, products) &&
            (!Array.isArray(value.products) ||
              value.products.includes(policy.product)) &&
            optional(policy.maxQuantityPerDay, nonnegative) &&
            optional(
              policy.allocationPct,
              (item) => finite(item) && item >= 0 && item <= 100,
            ) &&
            optional(policy.variableCostMicrosPerUnit, nonnegative),
        ),
      "Lane product policies are invalid.",
    );
  if (value.fieldEvidence !== undefined) {
    add(
      errors,
      `${path}.fieldEvidence`,
      record(value.fieldEvidence),
      "Must be an evidence record.",
    );
    if (record(value.fieldEvidence))
      Object.entries(value.fieldEvidence).forEach(([field, item]) =>
        evidenceValue(item, `${path}.fieldEvidence.${field}`, errors),
      );
  }
  return result<Lane>(value, errors);
}

export function decodeEngineDefaults(
  value: unknown,
  partial = false,
  path = "defaults",
): DecodeResult<EngineDefaults> {
  const errors: Errors = {};
  add(errors, path, record(value), "Must be an object.");
  if (!record(value)) return result(value, errors);
  const required = (field: string, predicate: (item: unknown) => boolean) =>
    add(
      errors,
      `${path}.${field}`,
      partial ? optional(value[field], predicate) : predicate(value[field]),
      "Invalid engine default.",
    );
  required("schemaVersion", (item) => item === 2);
  required("serviceTarget", (item) => finite(item) && item >= 0 && item <= 100);
  required("distanceUnit", (item) => oneOf(item, ["miles", "km"]));
  required("defaultGrain", (item) => oneOf(item, ["daily", "weekly"]));
  required("routingMode", (item) => oneOf(item, ["road", "straight"]));
  required("startDate", text);
  required("includeShortagePenalty", (item) => typeof item === "boolean");
  for (const field of [
    "dieselCostMicrosPerGallon",
    "defaultSafetyStockDays",
    "defaultOrderUpToDays",
    "defaultLeadTimeDays",
    "defaultVehicleCapacity",
    "fixedStopCostMicros",
    "driverCostMicrosPerHour",
    "handlingCostMicrosPerUnit",
    "carryingCostMicrosPerUnitDay",
  ] as const)
    required(field, nonnegative);
  required(
    "defaultSeasonalityByWeekday",
    (items) =>
      Array.isArray(items) && items.length === 7 && items.every(nonnegative),
  );
  for (const field of [
    "productWeights",
    "purchaseCostMicrosByProduct",
    "shortagePenaltyMicrosByProduct",
  ] as const)
    required(
      field,
      (map) =>
        record(map) &&
        products.every((product) =>
          partial
            ? map[product] === undefined || nonnegative(map[product])
            : nonnegative(map[product]),
        ),
    );
  return result<EngineDefaults>(value, errors);
}

export function decodePreferences(
  value: unknown,
  path = "preferences",
): DecodeResult<WorkspacePreferences> {
  const errors: Errors = {};
  add(errors, path, record(value), "Must be an object.");
  if (!record(value)) return result(value, errors);
  add(
    errors,
    `${path}.distance`,
    oneOf(value.distance, ["miles", "km"]),
    "Unsupported distance unit.",
  );
  add(
    errors,
    `${path}.grain`,
    oneOf(value.grain, ["daily", "weekly"]),
    "Unsupported grain.",
  );
  add(
    errors,
    `${path}.serviceTarget`,
    finite(value.serviceTarget) &&
      value.serviceTarget >= 0 &&
      value.serviceTarget <= 100,
    "Must be 0–100.",
  );
  add(
    errors,
    `${path}.dieselCost`,
    nonnegative(value.dieselCost),
    "Must be non-negative.",
  );
  add(
    errors,
    `${path}.routingMode`,
    oneOf(value.routingMode, ["road", "straight"]),
    "Unsupported routing mode.",
  );
  if (value.engineOverrides !== undefined)
    Object.assign(
      errors,
      decodeEngineDefaults(
        value.engineOverrides,
        true,
        `${path}.engineOverrides`,
      ).ok
        ? {}
        : (
            decodeEngineDefaults(
              value.engineOverrides,
              true,
              `${path}.engineOverrides`,
            ) as { ok: false; errors: Errors }
          ).errors,
    );
  return result<WorkspacePreferences>(value, errors);
}

function scenarioChanges(value: unknown, path: string, errors: Errors) {
  add(errors, path, Array.isArray(value), "Must be an array.");
  if (!Array.isArray(value)) return;
  value.forEach((change, index) => {
    const key = `${path}[${index}]`;
    add(errors, key, record(change), "Must be an object.");
    if (!record(change)) return;
    add(errors, `${key}.id`, nonempty(change.id), "A change ID is required.");
    add(errors, `${key}.effectiveDay`, integer(change.effectiveDay) && change.effectiveDay >= 0, "Must be a non-negative whole day.");
    add(errors, `${key}.durationDays`, optional(change.durationDays, (item) => integer(item) && item > 0), "Must be a positive whole-day duration.");
    switch (change.kind) {
      case "set-location-status":
        add(errors, `${key}.locationId`, nonempty(change.locationId), "Location is required."); add(errors, `${key}.status`, oneOf(change.status, ["active", "planned", "unavailable", "closed"]), "Unsupported status."); break;
      case "adjust-demand": case "adjust-capacity":
        add(errors, `${key}.locationId`, nonempty(change.locationId), "Location is required."); add(errors, `${key}.product`, optional(change.product, (item) => oneOf(item, products)), "Unsupported product."); add(errors, `${key}.multiplier`, nonnegative(change.multiplier), "Multiplier must be non-negative."); break;
      case "adjust-price":
        add(errors, `${key}.locationId`, optional(change.locationId, text), "Location must be text."); add(errors, `${key}.product`, optional(change.product, (item) => oneOf(item, products)), "Unsupported product."); add(errors, `${key}.multiplier`, nonnegative(change.multiplier), "Multiplier must be non-negative."); break;
      case "adjust-lane":
        add(errors, `${key}.laneId`, nonempty(change.laneId), "Lane is required."); for (const field of ["capacityMultiplier", "transitTimeMultiplier", "costMultiplier"] as const) add(errors, `${key}.${field}`, optional(change[field], nonnegative), "Must be non-negative."); add(errors, `${key}.status`, optional(change.status, (item) => oneOf(item, ["active", "recommended", "inactive"])), "Unsupported lane status."); break;
      case "weather-disruption":
        add(errors, `${key}.locationIds`, strings(change.locationIds), "Must be location IDs."); add(errors, `${key}.laneIds`, strings(change.laneIds), "Must be lane IDs."); for (const field of ["capacityMultiplier", "transitTimeMultiplier", "costMultiplier"] as const) add(errors, `${key}.${field}`, nonnegative(change[field]), "Must be non-negative."); break;
      case "reassign-restaurant":
        add(errors, `${key}.restaurantId`, nonempty(change.restaurantId), "Restaurant is required."); add(errors, `${key}.dcId`, nonempty(change.dcId), "Distribution center is required."); break;
      case "add-location": {
        const decoded = decodeLocation(change.location, `${key}.location`); if (!decoded.ok) Object.assign(errors, decoded.errors); break;
      }
      case "add-lane": {
        const decoded = decodeLane(change.lane, undefined, `${key}.lane`); if (!decoded.ok) Object.assign(errors, decoded.errors); break;
      }
      case "remove-lane": add(errors, `${key}.laneId`, nonempty(change.laneId), "Lane is required."); break;
      case "set-inventory-policy":
        add(errors, `${key}.dcId`, nonempty(change.dcId), "Distribution center is required."); add(errors, `${key}.product`, oneOf(change.product, products), "Unsupported product."); for (const field of ["openingInventory", "safetyStock", "reorderPoint", "orderUpTo", "reviewPeriodDays", "minimumOrderQuantity", "orderMultiple"] as const) add(errors, `${key}.${field}`, optional(change[field], nonnegative), "Must be non-negative."); add(errors, `${key}.replenishmentPolicy`, optional(change.replenishmentPolicy, (item) => oneOf(item, ["min-max", "reorder-point", "scheduled"])), "Unsupported replenishment policy."); break;
      default: errors[`${key}.kind`] = "Unsupported scenario change kind.";
    }
  });
}

function scenarioDefinition(
  value: unknown,
  locations: TwinLocation[] | null,
  path: string,
  errors: Errors,
) {
  add(errors, path, record(value), "Must be an object.");
  if (!record(value)) return;
  for (const field of ["id", "name"] as const)
    add(
      errors,
      `${path}.${field}`,
      nonempty(value[field]),
      "Non-empty text is required.",
    );
  add(
    errors,
    `${path}.type`,
    oneOf(value.type, scenarioTypes),
    "Unsupported scenario type.",
  );
  add(
    errors,
    `${path}.targetId`,
    nonempty(value.targetId),
    "Target is required.",
  );
  add(
    errors,
    `${path}.magnitude`,
    finite(value.magnitude) && value.magnitude >= 0 && value.magnitude <= 1000,
    "Must be 0–1000.",
  );
  add(
    errors,
    `${path}.grain`,
    oneOf(value.grain, ["daily", "weekly"]),
    "Unsupported grain.",
  );
  add(
    errors,
    `${path}.horizon`,
    integer(value.horizon) && value.horizon >= 1 && value.horizon <= 366,
    "Must be 1–366.",
  );
  if (locations && text(value.targetId) && value.targetId !== "network") {
    const target = locations.find((item) => item.id === value.targetId);
    add(
      errors,
      `${path}.targetId`,
      Boolean(target),
      "Must reference a location in the applicable model snapshot.",
    );
    if (
      (value.type === "dc-outage" || value.type === "capacity-constraint") &&
      target
    )
      add(
        errors,
        `${path}.targetId`,
        target.type === "dc",
        "Requires a distribution center.",
      );
    if (value.type === "supplier-failure" && target)
      add(
        errors,
        `${path}.targetId`,
        target.type === "supplier",
        "Requires a supplier.",
      );
    if (value.type === "demand-surge" && target)
      add(
        errors,
        `${path}.targetId`,
        target.type === "restaurant",
        "Requires a restaurant.",
      );
  }
  if (value.changes !== undefined) scenarioChanges(value.changes, `${path}.changes`, errors);
}

export function decodeScenarioDefinition(
  value: unknown,
  locations: TwinLocation[] | null,
  path = "scenario",
): DecodeResult<ScenarioDefinition> {
  const errors: Errors = {};
  scenarioDefinition(value, locations, path, errors);
  return result(value, errors);
}

function metrics(value: unknown) {
  return (
    record(value) &&
    [
      "serviceLevel",
      "stockoutUnits",
      "totalLandedCost",
      "maxUtilization",
    ].every((field) => finite(value[field])) &&
    ["affectedRestaurants", "totalDemand", "fulfilledDemand", "stockoutRestaurantPeriods", "serviceTarget"].every((field) => optional(value[field], finite)) &&
    optional(value.maxUtilizationLocationId, text) &&
    optional(value.quantityUnit, (item) => oneOf(item, units))
  );
}

function costBreakdown(value: unknown) {
  return record(value) && ["purchaseMicros", "linehaulVariableMicros", "vehicleFixedMicros", "driverTimeMicros", "stopMicros", "handlingMicros", "inventoryCarryingMicros", "tollMicros", "shortagePenaltyMicros", "totalMicros"].every((field) => nonnegative(value[field]));
}
function runInput(value: unknown, path: string, errors: Errors) {
  add(errors, path, record(value), "Frozen input must be an object.");
  if (!record(value)) return;
  add(
    errors,
    `${path}.schemaVersion`,
    value.schemaVersion === 2,
    "Unsupported run input version.",
  );
  for (const field of [
    "engineVersion",
    "engineBuildDigest",
    "baselineRevision",
    "startDate",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      nonempty(value[field]),
      "Non-empty text is required.",
    );
  add(
    errors,
    `${path}.grain`,
    oneOf(value.grain, ["daily", "weekly"]),
    "Unsupported grain.",
  );
  add(
    errors,
    `${path}.horizon`,
    integer(value.horizon) && value.horizon > 0,
    "Must be positive.",
  );
  add(
    errors,
    `${path}.locations`,
    Array.isArray(value.locations),
    "Must be an array.",
  );
  const decodedLocations = Array.isArray(value.locations)
    ? value.locations.flatMap((item, index) => {
        const decoded = decodeLocation(item, `${path}.locations[${index}]`);
        if (!decoded.ok) Object.assign(errors, decoded.errors);
        return decoded.ok ? [decoded.value] : [];
      })
    : [];
  const ids = new Set(decodedLocations.map((item) => item.id));
  add(errors, `${path}.lanes`, Array.isArray(value.lanes), "Must be an array.");
  if (Array.isArray(value.lanes))
    value.lanes.forEach((item, index) => {
      const decoded = decodeLane(item, ids, `${path}.lanes[${index}]`);
      if (!decoded.ok) Object.assign(errors, decoded.errors);
    });
  scenarioDefinition(
    value.scenario,
    decodedLocations,
    `${path}.scenario`,
    errors,
  );
  const defaults = decodeEngineDefaults(
    value.defaults,
    false,
    `${path}.defaults`,
  );
  if (!defaults.ok) Object.assign(errors, defaults.errors);
  scenarioChanges(value.changes, `${path}.changes`, errors);
  for (const field of [
    "sourceVersions",
    "routeVersions",
    "forecastVersions",
    "warningsAcknowledged",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      strings(value[field]),
      "Must be a string array.",
    );
}

export function decodeRunInput(
  value: unknown,
  path = "input",
): DecodeResult<RunInputV2> {
  const errors: Errors = {};
  runInput(value, path, errors);
  return result<RunInputV2>(value, errors);
}

export function decodeScenarioResult(
  value: unknown,
  path = "result",
): DecodeResult<ScenarioResult> {
  const errors: Errors = {};
  add(errors, path, record(value), "Must be an object.");
  if (!record(value)) return result(value, errors);
  add(
    errors,
    `${path}.baseline`,
    metrics(value.baseline),
    "Baseline metrics are invalid.",
  );
  add(
    errors,
    `${path}.scenario`,
    metrics(value.scenario),
    "Scenario metrics are invalid.",
  );
  add(
    errors,
    `${path}.inputHash`,
    nonempty(value.inputHash),
    "Input hash is required.",
  );
  for (const field of [
    "runId",
    "engineVersion",
    "completedAt",
    "narrative",
    "outputChecksum",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      optional(value[field], text),
      "Must be text when present.",
    );
  add(
    errors,
    `${path}.impacts`,
    Array.isArray(value.impacts) &&
      value.impacts.every(
        (item) =>
          record(item) &&
          nonempty(item.locationId) &&
          finite(item.serviceDelta) &&
          nonnegative(item.stockoutUnits) &&
          finite(item.costDelta) &&
          text(item.cause),
      ),
    "Impacts are invalid.",
  );
  add(
    errors,
    `${path}.recommendations`,
    Array.isArray(value.recommendations) &&
      value.recommendations.every(
        (item) =>
          record(item) &&
          ["id", "title", "action", "rationale"].every((field) =>
            nonempty(item[field]),
          ) &&
          finite(item.serviceDelta) &&
          finite(item.costDelta) &&
          oneOf(item.confidence, ["High", "Medium", "Low"]) &&
          strings(item.affectedLocationIds) &&
          optional(item.constraintsConsidered, strings) &&
          optional(item.rejectedAlternatives, strings),
      ),
    "Recommendations are invalid.",
  );
  if (Array.isArray(value.recommendations)) value.recommendations.forEach((item, index) => {
    if (record(item) && item.proposal !== undefined) scenarioChanges(item.proposal, `${path}.recommendations[${index}].proposal`, errors);
  });
  if (value.input !== undefined) runInput(value.input, `${path}.input`, errors);
  for (const field of ["baselinePeriodMetrics", "periodMetrics"] as const)
    add(
      errors,
      `${path}.${field}`,
      optional(
        value[field],
        (items) =>
          Array.isArray(items) &&
          items.every(
            (item) =>
              record(item) &&
              integer(item.periodIndex) &&
              text(item.date) &&
              text(item.locationId) &&
              oneOf(item.locationType, ["restaurant", "dc", "supplier"]) &&
              oneOf(item.product, products) &&
              oneOf(item.unit, units) &&
              [
                "openingInventory",
                "receipts",
                "requestedDemand",
                "fulfilledDemand",
                "stockoutQuantity",
                "closingInventory",
                "production",
                "inboundQuantity",
                "outboundQuantity",
                "storageUtilization",
                "inboundUtilization",
                "outboundUtilization",
              ].every((name) => finite(item[name])),
          ),
      ),
      "Period traces are invalid.",
    );
  add(errors, `${path}.productMetrics`, optional(value.productMetrics, (items) => Array.isArray(items) && items.every((item) => record(item) && oneOf(item.product, products) && oneOf(item.unit, units) && ["requestedDemand", "fulfilledDemand", "stockoutQuantity", "serviceLevel"].every((field) => finite(item[field])))), "Product metrics are invalid.");
  for (const field of ["baselineCostBreakdown", "costBreakdown"] as const) add(errors, `${path}.${field}`, optional(value[field], costBreakdown), "Cost breakdown is invalid.");
  add(errors, `${path}.diagnostics`, optional(value.diagnostics, (diagnostics) => record(diagnostics) && strings(diagnostics.warnings) && strings(diagnostics.invalidTargets) && record(diagnostics.conservationDeltaByProduct) && Object.values(diagnostics.conservationDeltaByProduct).every(finite) && Array.isArray(diagnostics.bindingConstraints) && diagnostics.bindingConstraints.every((item) => record(item) && integer(item.periodIndex) && text(item.locationId) && optional(item.product, (product) => oneOf(product, products)) && oneOf(item.dimension, ["supplier-production", "dc-storage", "dc-inbound", "dc-outbound", "lane"]) && finite(item.utilization))), "Diagnostics are invalid.");
  return result<ScenarioResult>(value, errors);
}

export function decodeSavedScenario(
  value: unknown,
  currentLocations: TwinLocation[] | null,
  path = "scenario",
): DecodeResult<SavedScenario> {
  const errors: Errors = {};
  const savedResult = record(value)
    ? decodeScenarioResult(value.result, `${path}.result`)
    : {
        ok: false as const,
        errors: { [`${path}.result`]: "Result is required." },
      };
  if (!savedResult.ok) Object.assign(errors, savedResult.errors);
  let targetLocations: TwinLocation[] | null = currentLocations;
  if (savedResult.ok && savedResult.value.input)
    targetLocations = savedResult.value.input.locations;
  else if (
    record(value) &&
    record(value.result) &&
    value.result.input === undefined
  )
    targetLocations = null;
  scenarioDefinition(value, targetLocations, path, errors);
  return result<SavedScenario>(value, errors);
}

export function decodeEvidenceLedger(
  value: unknown,
  path = "evidenceLedger",
): DecodeResult<EvidenceLedger> {
  const errors: Errors = {};
  add(
    errors,
    path,
    record(value) && value.schemaVersion === 1,
    "Must be EvidenceLedger version 1.",
  );
  if (!record(value)) return result(value, errors);
  for (const field of [
    "sources",
    "artifacts",
    "snapshots",
    "values",
    "conflicts",
  ] as const)
    add(
      errors,
      `${path}.${field}`,
      Array.isArray(value[field]),
      "Must be an array.",
    );
  if (Array.isArray(value.sources))
    value.sources.forEach((item, index) =>
      add(
        errors,
        `${path}.sources[${index}]`,
        record(item) &&
          [
            "id",
            "publisher",
            "title",
            "canonicalUrl",
            "sourceType",
            "termsNote",
          ].every((field) => text(item[field])) &&
          nonnegative(item.cadenceDays) &&
          nonnegative(item.staleAfterDays),
        "Source is invalid.",
      ),
    );
  if (Array.isArray(value.artifacts))
    value.artifacts.forEach((item, index) =>
      add(
        errors,
        `${path}.artifacts[${index}]`,
        record(item) &&
          [
            "id",
            "sourceId",
            "retrievedAt",
            "artifactUri",
            "parserVersion",
            "status",
          ].every((field) => text(item[field])) &&
          nonnegative(item.recordCount) &&
          nonnegative(item.pageCount) &&
          (item.checksumSha256 === null || text(item.checksumSha256)) &&
          (item.previousArtifactId === null || text(item.previousArtifactId)),
        "Artifact is invalid.",
      ),
    );
  if (Array.isArray(value.snapshots))
    value.snapshots.forEach((item, index) =>
      add(
        errors,
        `${path}.snapshots[${index}]`,
        record(item) &&
          ["id", "datasetId", "createdAt"].every((field) =>
            text(item[field]),
          ) &&
          strings(item.artifactIds) &&
          strings(item.recordIds) &&
          strings(item.reviewConflictIds),
        "Snapshot is invalid.",
      ),
    );
  if (Array.isArray(value.values))
    value.values.forEach((item, index) =>
      evidenceValue(item, `${path}.values[${index}]`, errors),
    );
  if (Array.isArray(value.conflicts))
    value.conflicts.forEach((item, index) =>
      add(
        errors,
        `${path}.conflicts[${index}]`,
        record(item) &&
          [
            "id",
            "entityType",
            "entityId",
            "fieldPath",
            "reason",
            "status",
            "createdAt",
          ].every((field) => text(item[field])) &&
          Array.isArray(item.decisions) &&
          item.decisions.every(
            (decision) =>
              record(decision) &&
              [
                "id",
                "conflictId",
                "action",
                "actorId",
                "decidedAt",
                "reason",
              ].every((field) => text(decision[field])),
          ),
        "Conflict is invalid.",
      ),
    );
  if (value.publications !== undefined)
    add(
      errors,
      `${path}.publications`,
      Array.isArray(value.publications) &&
        value.publications.every(
          (publication) =>
            record(publication) &&
            ["id", "datasetId", "createdAt", "createdBy", "reason", "checksumSha256"].every((field) => text(publication[field])) &&
            (publication.previousPublicationId === null || text(publication.previousPublicationId)) &&
            strings(publication.sourceArtifactIds) &&
            strings(publication.acceptedConflictIds) &&
            Array.isArray(publication.records) &&
            publication.records.every((item) => record(item) && nonempty(item.stableKey) && oneOf(item.status, ["published", "retired"]) && strings(item.evidenceValueIds) && text(item.publishedAt) && (item.retiredAt === null || text(item.retiredAt)) && jsonSafe(item.data)),
        ),
      "Publications are invalid.",
    );
  return result<EvidenceLedger>(value, errors);
}

export function decodeWorkspaceDocument(value: unknown): DecodeResult<unknown> {
  const errors: Errors = {};
  add(
    errors,
    "workspace",
    record(value) &&
      value.schemaVersion === 1 &&
      integer(value.revision) &&
      value.revision >= 0,
    "Workspace envelope is invalid.",
  );
  if (!record(value)) return result(value, errors);
  if(value.intelligence!==undefined)add(errors,"intelligence",isIntelligenceState(value.intelligence),"Decision intelligence state is invalid.");
  const locations: TwinLocation[] = [];
  add(errors, "locations", Array.isArray(value.locations), "Must be an array.");
  if (Array.isArray(value.locations))
    value.locations.forEach((item, index) => {
      const decoded = decodeLocation(item, `locations[${index}]`);
      if (decoded.ok) locations.push(decoded.value);
      else Object.assign(errors, decoded.errors);
    });
  add(
    errors,
    "locations.ids",
    new Set(locations.map((item) => item.id)).size === locations.length,
    "Location IDs must be unique.",
  );
  const ids = new Set(locations.map((item) => item.id));
  add(errors, "lanes", Array.isArray(value.lanes), "Must be an array.");
  if (Array.isArray(value.lanes))
    value.lanes.forEach((item, index) => {
      const decoded = decodeLane(item, ids, `lanes[${index}]`);
      if (!decoded.ok) Object.assign(errors, decoded.errors);
    });
  add(errors, "scenarios", Array.isArray(value.scenarios), "Must be an array.");
  if (Array.isArray(value.scenarios))
    value.scenarios.forEach((item, index) => {
      const decoded = decodeStoredScenario(item, `scenarios[${index}]`);
      if (!decoded.ok) Object.assign(errors, decoded.errors);
    });
  const preferences = decodePreferences(value.preferences);
  if (!preferences.ok) Object.assign(errors, preferences.errors);
  if (value.evidenceLedger !== undefined) {
    const ledger = decodeEvidenceLedger(value.evidenceLedger);
    if (!ledger.ok) Object.assign(errors, ledger.errors);
  }
  return result(value, errors);
}

export function decodeWorkspaceReplacement(
  value: unknown,
): DecodeResult<unknown> {
  if (!record(value))
    return { ok: false, errors: { body: "Must be an object." } };
  const errors: Errors = {};
  const locations: TwinLocation[] = [];
  add(errors, "locations", Array.isArray(value.locations), "Must be an array.");
  if (Array.isArray(value.locations))
    value.locations.forEach((item, index) => {
      const decoded = decodeLocation(item, `locations[${index}]`);
      if (decoded.ok) locations.push(decoded.value);
      else Object.assign(errors, decoded.errors);
    });
  add(errors, "locations.ids", new Set(locations.map((item) => item.id)).size === locations.length, "Location IDs must be unique.");
  const ids = new Set(locations.map((item) => item.id));
  add(errors, "lanes", Array.isArray(value.lanes), "Must be an array.");
  if (Array.isArray(value.lanes)) value.lanes.forEach((item, index) => { const decoded = decodeLane(item, ids, `lanes[${index}]`); if (!decoded.ok) Object.assign(errors, decoded.errors); });
  add(errors, "scenarios", value.scenarios === undefined || Array.isArray(value.scenarios), "Must be an array when present.");
  if (Array.isArray(value.scenarios)) value.scenarios.forEach((item, index) => { const decoded = decodeStoredScenario(item, `scenarios[${index}]`); if (!decoded.ok) Object.assign(errors, decoded.errors); });
  if (value.evidenceLedger !== undefined) { const ledger = decodeEvidenceLedger(value.evidenceLedger); if (!ledger.ok) Object.assign(errors, ledger.errors); }
  if (record(value.defaults)) {
    const { workspacePreferences: _workspacePreferences, ...engineDefaults } =
      value.defaults;
    const engine = decodeEngineDefaults(engineDefaults, true, "defaults");
    if (!engine.ok) Object.assign(errors, engine.errors);
    if (_workspacePreferences !== undefined) add(errors, "defaults.workspacePreferences", jsonSafe(_workspacePreferences), "Must contain JSON-safe preferences.");
  } else errors.defaults = "Must be an object.";
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value };
}
