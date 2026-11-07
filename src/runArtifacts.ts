import type { CostBreakdown, LocationImpact, PeriodProductMetric, ProductCategory, ProductMetric, Recommendation, RunInputV2, SavedScenario, ScenarioDefinition, ScenarioResult, SimulationDiagnostics, TwinMetrics } from './flywayTypes';

/** Shared immutable result contracts. Engine runId is deliberately distinct from a service job UUID. */
export interface RunArtifactReference { checksum: string; relativePath: string; byteLength: number }
export interface RunSummaryV2 {
  schemaVersion: 2;
  runId: string;
  engineVersion: string;
  inputHash: string;
  outputChecksum: string;
  completedAt: string;
  baseline: TwinMetrics;
  scenario: TwinMetrics;
  narrative: string;
  productMetrics?: ProductMetric[];
  baselineCostBreakdown?: CostBreakdown;
  costBreakdown?: CostBreakdown;
  impactCount: number;
  recommendationCount: number;
  diagnosticWarningCount: number;
  diagnosticsSummary?: Pick<SimulationDiagnostics, 'conservationDeltaByProduct'> & { invalidTargetCount: number };
  inputInfo: Pick<RunInputV2, 'engineBuildDigest' | 'baselineRevision' | 'startDate' | 'grain' | 'horizon' | 'sourceVersions' | 'routeVersions' | 'forecastVersions' | 'warningsAcknowledged'> & { locationCount: number; laneCount: number; serviceTarget: number; productWeights: Partial<Record<ProductCategory, number>> };
}
export type RunChunkKind = 'baseline' | 'scenario' | 'impacts' | 'recommendations' | 'warnings' | 'constraints';
export interface RunResultChunkPayloadV2<T = unknown> {
  schemaVersion: 2;
  format: 'flyway-run-chunk';
  kind: RunChunkKind;
  ordinal: number;
  rows: T[];
}
export interface RunResultChunkV2 {
  kind: RunChunkKind;
  ordinal: number;
  rowCount: number;
  periodFrom?: number;
  periodToExclusive?: number;
  artifact: RunArtifactReference;
}
export interface RunResultManifestV2 {
  schemaVersion: 2;
  format: 'flyway-run-manifest';
  summary: RunSummaryV2;
  inputArtifact: RunArtifactReference;
  chunks: RunResultChunkV2[];
  diagnostics: Pick<SimulationDiagnostics, 'invalidTargets' | 'conservationDeltaByProduct'>;
  artifactCount: number;
  chunkRowCount: number;
  chunkByteLength: number;
  logicalOutputChecksum: string;
  manifestChecksum: string;
}
export type RunLocator = { kind: 'service'; runId: string; workspaceId: string } | { kind: 'local'; runId: string };
export interface SavedScenarioReferenceV2 extends ScenarioDefinition {
  schemaVersion: 2;
  savedAt: string;
  latestRun: RunSummaryV2;
  resultRef: RunLocator;
}
export type StoredScenario = SavedScenario | SavedScenarioReferenceV2;
export function isScenarioReference(value: StoredScenario): value is SavedScenarioReferenceV2 { return 'schemaVersion' in value && value.schemaVersion === 2 && 'resultRef' in value; }
export type RunArtifactWriter = (value: unknown) => Promise<RunArtifactReference>;
export type RunArtifactReader = <T>(reference: RunArtifactReference) => Promise<T>;
export interface RunArtifactBuildOptions { maxRowsPerChunk?: number; maxBytesPerChunk?: number; tracePeriodSpan?: number; signal?: AbortSignal }
export interface PublishedRunArtifacts { manifest: RunResultManifestV2; manifestArtifact: RunArtifactReference }
export interface RunPage<T> { items: T[]; nextCursor?: string; total: number }
export interface RunQueryTotals {
  serviceLevel: number;
  stockoutUnits: number;
  affectedRestaurants: number;
  maxUtilization: number;
  maxUtilizationLocationId?: string;
  totalDemand: number;
  fulfilledDemand: number;
}
export interface RunMetricQuery {
  kind: 'baseline' | 'scenario'; product?: ProductCategory; locationType?: PeriodProductMetric['locationType']; locationId?: string;
  periodFrom?: number; periodToExclusive?: number; stockoutsOnly?: boolean; cursor?: string; limit?: number;
}
export interface RunMetricPage extends RunPage<PeriodProductMetric> { totals: RunQueryTotals; scope: Omit<RunMetricQuery, 'cursor' | 'limit'> }
/** Reporting-period index: daily=one modeled day, weekly=seven modeled days, and -1=the complete modeled horizon. */
export interface RunScopeQuery { product: ProductCategory | 'all'; period: number; sort: 'impact' | 'name'; cursor?: string; limit?: number }
export interface RunRestaurantImpact { locationId: string; name: string; demand: number; fulfilled: number; stockout: number; baselineStockout: number }
export interface RunScopeResult {
  baseline: RunQueryTotals; scenario: RunQueryTotals;
  restaurants: RunPage<RunRestaurantImpact>;
  incrementalStockoutLocationIds: string[];
  scope: Omit<RunScopeQuery, 'cursor' | 'limit'>;
}
export interface RunResultReader {
  summary: RunSummaryV2;
  locator: RunLocator;
  input(signal?: AbortSignal): Promise<RunInputV2>;
  scope(query: RunScopeQuery, signal?: AbortSignal): Promise<RunScopeResult>;
  metrics(query: RunMetricQuery, signal?: AbortSignal): Promise<RunMetricPage>;
  impacts(cursor?: string, signal?: AbortSignal): Promise<RunPage<LocationImpact>>;
  recommendations(cursor?: string, signal?: AbortSignal): Promise<RunPage<Recommendation>>;
  warnings(cursor?: string, signal?: AbortSignal): Promise<RunPage<string>>;
  constraints(cursor?: string, signal?: AbortSignal): Promise<RunPage<SimulationDiagnostics['bindingConstraints'][number]>>;
}
/** For legacy migration and explicit replay only, never a routine UI read. */
export type LegacyRunResult = ScenarioResult;
