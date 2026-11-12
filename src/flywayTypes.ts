import type { EvidenceValue } from './evidence/types';

export type LocationType = 'restaurant' | 'dc' | 'supplier';
export type LocationStatus = 'active' | 'planned' | 'unavailable' | 'closed';
export type MapPrecision = 'exact-public-address' | 'city-level-public-evidence' | 'model-only';
export type EvidenceClass = 'verified-public' | 'corroborated' | 'user-input' | 'derived' | 'synthetic';
export type ProductCategory =
  | 'Chicken'
  | 'Produce'
  | 'Buns & bakery'
  | 'Packaging'
  | 'Beverages'
  | 'Cooking oil'
  | 'Equipment';

export type QuantityUnit = 'case-equivalent' | 'case' | 'each' | 'pallet';
export type DistanceUnit = 'miles' | 'km';

export interface OperatingCalendar {
  operatingWeekdays: number[];
  exceptions?: Array<{ date: string; open: boolean }>;
}

export interface LocationProductPolicy {
  product: ProductCategory;
  baseUnit: QuantityUnit;
  weeklyDemand?: number;
  weeklyProductionCapacity?: number;
  openingInventory?: number;
  storageCapacity?: number;
  safetyStock?: number;
  reorderPoint?: number;
  orderUpTo?: number;
  leadTimeDays?: number;
  replenishmentPolicy?: 'min-max' | 'reorder-point' | 'scheduled';
  reviewPeriodDays?: number;
  minimumOrderQuantity?: number;
  orderMultiple?: number;
  scheduledReplenishment?: Array<{ weekday: number; quantity: number }>;
  seasonalityByWeekday?: number[];
  growthRatePerPeriod?: number;
  eventMultiplier?: number;
  purchaseCostMicros?: number;
  handlingCostMicros?: number;
  carryingCostMicrosPerUnitDay?: number;
}

export interface Evidence {
  classification: EvidenceClass;
  confidence: number | null;
  sourceTitle: string;
  sourceUrl?: string;
  publisher: string;
  verifiedAt: string;
  note?: string;
}

export interface TwinLocation {
  id: string;
  type: LocationType;
  name: string;
  city: string;
  state: string;
  address: string;
  latitude: number;
  longitude: number;
  status: LocationStatus;
  products: ProductCategory[];
  weeklyDemand?: number;
  weeklyCapacity?: number;
  inventoryDays?: number;
  serviceRadiusMiles?: number;
  reliability?: number;
  assignedDcId?: string;
  evidence: Evidence;
  operatingSchedule: string;
  notes?: string;
  mapPrecision?: MapPrecision;
  timezone?: string;
  calendar?: OperatingCalendar;
  productPolicies?: LocationProductPolicy[];
  inboundCapacityPerDay?: number;
  outboundCapacityPerDay?: number;
  storageCapacity?: number;
  servicePriority?: number;
  fieldEvidence?: Record<string, EvidenceValue<unknown>>;
}

export interface MapLayerState {
  officialDensity: boolean;
  publicRestaurants: boolean;
  publicFacilities: boolean;
  sampleModel: boolean;
  sampleLanes: boolean;
  risk: boolean;
  facilityLabels: boolean;
}

export interface Lane {
  id: string;
  originId: string;
  destinationId: string;
  products: ProductCategory[];
  miles: number;
  transitHours: number;
  deliveriesPerWeek: number;
  costPerMile: number;
  status: 'active' | 'recommended' | 'inactive';
  evidence: Evidence;
  weeklyCapacity?: number;
  operatingDays?: number[];
  productPolicies?: Array<{
    product: ProductCategory;
    maxQuantityPerDay?: number;
    allocationPct?: number;
    variableCostMicrosPerUnit?: number;
  }>;
  fixedDispatchCostMicros?: number;
  driverCostMicrosPerHour?: number;
  tollCostMicros?: number;
  vehicleCapacity?: number;
  vehicleType?: { id: string; name: string; capacity: number; fixedCostMicros: number };
  dwellHours?: number;
  maxDriverHours?: number;
  deliveryWindow?: { startHour: number; endHour: number };
  receivingWindow?: { startHour: number; endHour: number };
  fuelEconomyMpg?: number;
  fieldEvidence?: Record<string, EvidenceValue<unknown>>;
}

export interface PublicFootprintLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  address: string;
  postalCode: string;
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
  wpPostId?: number;
  locationNumber?: string;
  evidenceClass?: 'verified-public' | 'corroborated';
  modifiedAt?: string;
  retrievedAt?: string;
  sourceChecksum?: string;
  extractorVersion?: string;
  sourceUrl: string;
}

export interface PublicFootprintMetadata {
  snapshotDate: string;
  generatedAt: string;
  officialRecordCount: number;
  officialSitemapCount?: number;
  exactMappedCount: number;
  rawOsmFeatureCount?: number;
  needsReviewCount?: number;
  officialByState: Record<string, number>;
  officialSource: string;
  mappingSource?: string;
  mappingQuerySource?: string;
  mappingLicense?: string;
  methodology: string;
  limitations: string;
}

export interface PublicFootprintSnapshot {
  metadata: PublicFootprintMetadata;
  locations: PublicFootprintLocation[];
  needsReview?: Array<{ wpPostId: number; slug: string; sourceUrl: string; modifiedAt: string; status: 'needs_review'; reason: string; httpStatus: number }>;
}

export type PublicFacilityMapPrecision = 'exact-public-address' | 'city-level-public-evidence' | 'not-plotted';
export type PublicFacilityLifecycle = 'current-career-evidence' | 'launch-or-standup' | 'mixed-lifecycle-language' | 'announced' | 'operating-at-source-date';
export type PublicFacilityClaim = 'facility-exists' | 'city-state' | 'street-address' | 'announced' | 'operating-at-source-date' | 'current-career-evidence' | 'launch-or-standup' | 'historical-aggregate';

export interface PublicFacilityEvidence {
  id: string;
  facilityId?: string;
  sourceKind: 'official-announcement' | 'official-career-page' | 'official-careers-api' | 'official-faq';
  publisher: 'Chick-fil-A, Inc.';
  title: string;
  sourceUrl: string;
  publishedAt?: string;
  retrievedAt: string;
  verifiedAt: string;
  sourceChecksum: string;
  reviewMethod: 'systematic-official-source-audit-v1';
  supportedClaims: PublicFacilityClaim[];
  supportSummary: string;
}

export interface PublicDistributionFacility {
  id: string;
  stableKey: string;
  name: string;
  city: string;
  state: string;
  country: 'US';
  address?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  mapPrecision: PublicFacilityMapPrecision;
  coordinateSource: 'official-careers-api' | 'official-city-coordinate' | 'unplotted';
  coordinateEvidenceId?: string;
  evidenceIds: string[];
  directEvidenceJobIds: string[];
  lifecycle: PublicFacilityLifecycle;
  lifecycleSummary: string;
  reviewNote?: string;
  lastVerifiedAt: string;
}

export interface PublicDistributionFacilityRegistry {
  schemaVersion: 1;
  snapshotDate: string;
  generatedAt: string;
  facilityCount: number;
  plottedFacilityCount: number;
  exactAddressCount: number;
  cityLevelCount: number;
  launchOrStandupCount: number;
  addressConflictCount: number;
  evidenceCount: number;
  currentOfficialJobCount: number;
  historicalReportedCount: number;
  methodology: string;
  limitations: string;
  officialCareersApi: string;
  facilities: PublicDistributionFacility[];
  evidence: PublicFacilityEvidence[];
  needsReview: Array<{ candidateKey: string; reason: string; sourceUrl?: string }>;
  exclusions: Array<{ candidate: string; reason: string }>;
}

export type ScenarioType =
  | 'dc-outage'
  | 'supplier-failure'
  | 'demand-surge'
  | 'severe-weather'
  | 'price-change'
  | 'capacity-constraint'
  | 'location-closure';

interface ScenarioChangeBase {
  id: string;
  effectiveDay: number;
  durationDays?: number;
  note?: string;
}

export type ScenarioChange =
  | (ScenarioChangeBase & { kind: 'set-location-status'; locationId: string; status: LocationStatus })
  | (ScenarioChangeBase & { kind: 'adjust-demand'; locationId: string; product?: ProductCategory; multiplier: number })
  | (ScenarioChangeBase & { kind: 'adjust-capacity'; locationId: string; product?: ProductCategory; multiplier: number })
  | (ScenarioChangeBase & { kind: 'adjust-price'; locationId?: string; product?: ProductCategory; multiplier: number })
  | (ScenarioChangeBase & { kind: 'adjust-lane'; laneId: string; capacityMultiplier?: number; transitTimeMultiplier?: number; costMultiplier?: number; status?: Lane['status'] })
  | (ScenarioChangeBase & { kind: 'weather-disruption'; locationIds: string[]; laneIds: string[]; capacityMultiplier: number; transitTimeMultiplier: number; costMultiplier: number })
  | (ScenarioChangeBase & { kind: 'reassign-restaurant'; restaurantId: string; dcId: string })
  | (ScenarioChangeBase & { kind: 'add-location'; location: TwinLocation })
  | (ScenarioChangeBase & { kind: 'add-lane'; lane: Lane })
  | (ScenarioChangeBase & { kind: 'remove-lane'; laneId: string })
  | (ScenarioChangeBase & { kind: 'set-inventory-policy'; dcId: string; product: ProductCategory; openingInventory?: number; safetyStock?: number; reorderPoint?: number; orderUpTo?: number; replenishmentPolicy?: LocationProductPolicy['replenishmentPolicy']; reviewPeriodDays?: number; minimumOrderQuantity?: number; orderMultiple?: number; scheduledReplenishment?: LocationProductPolicy['scheduledReplenishment'] });

export interface EngineDefaults {
  schemaVersion: 2;
  serviceTarget: number;
  distanceUnit: DistanceUnit;
  defaultGrain: 'daily' | 'weekly';
  dieselCostMicrosPerGallon: number;
  routingMode: 'road' | 'straight';
  startDate: string;
  includeShortagePenalty: boolean;
  productWeights: Record<ProductCategory, number>;
  defaultSeasonalityByWeekday: number[];
  defaultSafetyStockDays: number;
  defaultOrderUpToDays: number;
  defaultLeadTimeDays: number;
  defaultVehicleCapacity: number;
  fixedStopCostMicros: number;
  driverCostMicrosPerHour: number;
  handlingCostMicrosPerUnit: number;
  carryingCostMicrosPerUnitDay: number;
  purchaseCostMicrosByProduct: Record<ProductCategory, number>;
  shortagePenaltyMicrosByProduct: Record<ProductCategory, number>;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  type: ScenarioType;
  targetId: string;
  magnitude: number;
  grain: 'daily' | 'weekly';
  horizon: number;
  createdAt: string;
  baselineRevision: string;
  startDate?: string;
  changes?: ScenarioChange[];
}

export interface TwinMetrics {
  serviceLevel: number;
  stockoutUnits: number;
  affectedRestaurants: number;
  totalLandedCost: number;
  maxUtilization: number;
  maxUtilizationLocationId: string;
  totalDemand: number;
  fulfilledDemand: number;
  quantityUnit?: QuantityUnit;
  stockoutRestaurantPeriods?: number;
  serviceTarget?: number;
}

export interface CostBreakdown {
  purchaseMicros: number;
  linehaulVariableMicros: number;
  vehicleFixedMicros: number;
  driverTimeMicros: number;
  stopMicros: number;
  handlingMicros: number;
  inventoryCarryingMicros: number;
  tollMicros: number;
  shortagePenaltyMicros: number;
  totalMicros: number;
}

export interface PeriodProductMetric {
  periodIndex: number;
  date: string;
  locationId: string;
  locationType: LocationType;
  product: ProductCategory;
  unit: QuantityUnit;
  openingInventory: number;
  receipts: number;
  requestedDemand: number;
  fulfilledDemand: number;
  stockoutQuantity: number;
  closingInventory: number;
  production: number;
  inboundQuantity: number;
  outboundQuantity: number;
  storageUtilization: number;
  inboundUtilization: number;
  outboundUtilization: number;
}

export interface ProductMetric {
  product: ProductCategory;
  unit: QuantityUnit;
  requestedDemand: number;
  fulfilledDemand: number;
  stockoutQuantity: number;
  serviceLevel: number;
}

export interface SimulationDiagnostics {
  warnings: string[];
  invalidTargets: string[];
  conservationDeltaByProduct: Partial<Record<ProductCategory, number>>;
  bindingConstraints: Array<{ periodIndex: number; locationId: string; product?: ProductCategory; dimension: 'supplier-production' | 'dc-storage' | 'dc-inbound' | 'dc-outbound' | 'lane'; utilization: number }>;
}

export interface RunInputV2 {
  schemaVersion: 2;
  engineVersion: string;
  engineBuildDigest: string;
  baselineRevision: string;
  startDate: string;
  grain: 'daily' | 'weekly';
  horizon: number;
  locations: TwinLocation[];
  lanes: Lane[];
  scenario: ScenarioDefinition;
  changes: ScenarioChange[];
  defaults: EngineDefaults;
  sourceVersions: string[];
  routeVersions: string[];
  forecastVersions: string[];
  warningsAcknowledged: string[];
}

export interface LocationImpact {
  locationId: string;
  serviceDelta: number;
  stockoutUnits: number;
  /** Change in unmet restaurant demand versus baseline, in the location's quantity unit. Absent on artifacts produced before engine 2.0.2. */
  stockoutUnitsDelta?: number;
  /** Change in modeled shortage-penalty cost at this restaurant versus baseline, in whole dollars (0 when the shortage penalty is excluded). Shared lane and DC costs are not attributed to a single restaurant. */
  costDelta: number;
  cause: string;
}

export interface Recommendation {
  id: string;
  title: string;
  action: string;
  rationale: string;
  serviceDelta: number;
  costDelta: number;
  confidence: 'High' | 'Medium' | 'Low';
  affectedLocationIds: string[];
  proposal?: ScenarioChange[];
  candidateInputHash?: string;
  candidateOutputChecksum?: string;
  constraintsConsidered?: string[];
  rejectedAlternatives?: string[];
  /** True when the proposal assigns restaurants to a DC beyond that DC's modeled service radius. */
  exceedsServiceRadius?: boolean;
  /** True when the response must never be applied without explicit human approval. */
  requiresHumanApproval?: boolean;
}

export interface ScenarioResult {
  runId: string;
  engineVersion: string;
  inputHash: string;
  completedAt: string;
  baseline: TwinMetrics;
  scenario: TwinMetrics;
  impacts: LocationImpact[];
  recommendations: Recommendation[];
  narrative: string;
  input?: RunInputV2;
  outputChecksum?: string;
  baselinePeriodMetrics?: PeriodProductMetric[];
  periodMetrics?: PeriodProductMetric[];
  productMetrics?: ProductMetric[];
  baselineCostBreakdown?: CostBreakdown;
  costBreakdown?: CostBreakdown;
  diagnostics?: SimulationDiagnostics;
}

export interface SavedScenario extends ScenarioDefinition {
  result: ScenarioResult;
}

export type ViewId = 'control-tower' | 'decisions' | 'locations' | 'scenarios' | 'sources' | 'settings';
