import assert from 'node:assert/strict';
import { contentHash, canonicalStringify } from '../src/engine/canonical';
import { initialLanes, initialLocations } from '../src/flywayData';
import { runScenario } from '../src/flywayEngine';
import type { RunArtifactReference, SavedScenarioReferenceV2 } from '../src/runArtifacts';
import { persistRunResult } from '../src/runArtifactRepository';
import { decodeRunArtifactReference, decodeRunManifest, decodeRunSummary, decodeSavedScenarioReference, decodeStoredScenario } from '../src/runArtifactDecoders';
import { decodeScenarioResult } from '../src/schemaDecoders';

const scenario = {
  id: 'decoder-run', name: 'Decoder run', description: 'Immutable artifact decoder fixture', type: 'dc-outage' as const,
  targetId: 'dc-cartersville', magnitude: 100, grain: 'weekly' as const, horizon: 1,
  createdAt: '2026-09-04T18:00:00.000Z', baselineRevision: 'decoder:r1', startDate: '2026-09-07',
};
const result = runScenario(initialLocations, initialLanes, scenario);
const artifacts = new Map<string, unknown>();
const write = async (value: unknown): Promise<RunArtifactReference> => {
  const checksum = contentHash(value);
  const reference = { checksum, relativePath: `fixture/${checksum}.json`, byteLength: new TextEncoder().encode(canonicalStringify(value)).byteLength };
  artifacts.set(reference.relativePath, structuredClone(value));
  return reference;
};
const inputArtifact = await write(result.input);
const publication = await persistRunResult(result, inputArtifact, write, { maxRowsPerChunk: 40, maxBytesPerChunk: 30_000, tracePeriodSpan: 2 });

assert.equal(decodeRunArtifactReference(publication.manifestArtifact).ok, true);
assert.equal(decodeRunSummary(publication.manifest.summary).ok, true);
assert.equal(decodeRunManifest(publication.manifest).ok, true);

const reference: SavedScenarioReferenceV2 = { ...scenario, schemaVersion: 2, savedAt: '2026-09-04T18:01:00.000Z', latestRun: publication.manifest.summary, resultRef: { kind: 'local', runId: result.runId } };
assert.equal(decodeSavedScenarioReference(reference).ok, true);
assert.equal(decodeStoredScenario(reference).ok, true);
assert.equal(decodeStoredScenario({ ...scenario, result }).ok, true, 'legacy embedded results remain valid during migration');
assert.ok(result.impacts.length > 0);
const legacyResult = { ...result, impacts: result.impacts.map(({ stockoutUnitsDelta: _delta, ...impact }) => impact), recommendations: result.recommendations.map(({ exceedsServiceRadius: _radius, requiresHumanApproval: _approval, ...recommendation }) => recommendation) };
assert.equal(decodeScenarioResult(legacyResult).ok, true, 'Saved results without the new fields stay readable.');
assert.equal(decodeScenarioResult({ ...result, impacts: [{ ...result.impacts[0], stockoutUnitsDelta: '4' }] }).ok, false, 'Shortage unit delta must be numeric when present.');
const taggedRecommendation = { id: 'decoder-contingency', title: 'Contingency', action: 'Model a response', rationale: 'Modeled recovery', serviceDelta: 1, costDelta: 2, confidence: 'Low', affectedLocationIds: [result.impacts[0].locationId], exceedsServiceRadius: true, requiresHumanApproval: true };
assert.equal(decodeScenarioResult({ ...result, recommendations: [taggedRecommendation] }).ok, true);
assert.equal(decodeScenarioResult({ ...result, recommendations: [{ ...taggedRecommendation, requiresHumanApproval: 'true' }] }).ok, false, 'Approval metadata must be boolean.');

assert.equal(decodeRunArtifactReference({ ...publication.manifestArtifact, relativePath: '../escape' }).ok, false);
assert.equal(decodeRunSummary({ ...publication.manifest.summary, impactCount: -1 }).ok, false);
assert.equal(decodeSavedScenarioReference({ ...reference, resultRef: { kind: 'local', runId: 'different' } }).ok, false);
assert.equal(decodeSavedScenarioReference({ ...reference, resultRef: { kind: 'service', runId: result.runId } }).ok, false, 'service locator requires workspace isolation');
assert.equal(decodeSavedScenarioReference({ ...reference, resultRef: { kind: 'service', runId: 'service-job-uuid', workspaceId: 'workspace-1' } }).ok, true, 'service job UUID is intentionally distinct from the engine logical run ID');
assert.equal(decodeRunManifest({ ...publication.manifest, chunkRowCount: publication.manifest.chunkRowCount + 1 }).ok, false);
assert.equal(decodeRunManifest({ ...publication.manifest, chunks: publication.manifest.chunks.map((chunk, index) => index === 0 ? { ...chunk, artifact: { ...chunk.artifact, byteLength: chunk.artifact.byteLength + 1 } } : chunk) }).ok, false);
assert.equal(decodeRunManifest({ ...publication.manifest, narrative: 'tamper' }).ok, false, 'manifest identity rejects any unchecksummed field');

assert.ok(publication.manifest.chunks.every((chunk) => chunk.rowCount <= 40));
assert.ok(publication.manifest.chunks.every((chunk) => chunk.artifact.byteLength <= 30_000));
assert.equal(publication.manifest.chunkRowCount, publication.manifest.chunks.reduce((sum, chunk) => sum + chunk.rowCount, 0));
assert.equal(artifacts.has(publication.manifestArtifact.relativePath), true);

console.log('Run artifact decoder QA passed: strict references, summaries, manifests, StoredScenario union, checksum identity, and bounded chunk metadata.');
