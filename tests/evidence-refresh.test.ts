import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchAllPages, preserveRawArtifact, writeVersionedSnapshot } from '../scripts/evidence-refresh-core.mjs';

const records = Array.from({ length: 205 }, (_, index) => ({ id: index + 1 }));
const pagination = await fetchAllPages({
  pageSize: 100,
  fetchPage: async (page: number, pageSize: number) => ({ jobs: records.slice((page - 1) * pageSize, page * pageSize) }),
  itemsFromPage: (payload: { jobs: unknown[] }) => payload.jobs,
});
assert.equal(pagination.items.length, 205);
assert.equal(pagination.pages.length, 3);
assert.equal(pagination.exhausted, true);
assert.deepEqual(pagination.pages.map((page: { count: number }) => page.count), [100, 100, 5]);

await assert.rejects(fetchAllPages({
  pageSize: 2,
  maxPages: 3,
  fetchPage: async () => ({ jobs: [{ id: 1 }, { id: 2 }] }),
  itemsFromPage: (payload: { jobs: unknown[] }) => payload.jobs,
}), /repeated page content/);

const directory = await mkdtemp(path.join(tmpdir(), 'flyway-evidence-'));
const artifact = await preserveRawArtifact({
  rootDir: path.join(directory, 'artifacts'), sourceId: 'fixture-source', retrievedAt: '2026-09-04T12:00:00.000Z',
  parserVersion: 'fixture-v1', sourceUrl: 'https://example.test/data', payload: { records }, pageCount: 3, recordCount: records.length,
});
assert.match(artifact.checksumSha256, /^[a-f0-9]{64}$/);
assert.equal(JSON.parse(await readFile(artifact.artifactUri, 'utf8')).records.length, 205);

const currentPath = path.join(directory, 'current.json');
const archiveDir = path.join(directory, 'snapshots');
const first = await writeVersionedSnapshot({ currentPath, archiveDir, datasetId: 'fixture', snapshot: { generatedAt: '2026-09-04T12:00:00.000Z', records: [{ id: 1 }] } });
const second = await writeVersionedSnapshot({ currentPath, archiveDir, datasetId: 'fixture', snapshot: { generatedAt: '2026-09-05T12:00:00.000Z', records: [{ id: 2 }] } });
assert.notEqual(first.checksumSha256, second.checksumSha256);
assert.deepEqual(JSON.parse(await readFile(currentPath, 'utf8')).records, [{ id: 2 }]);
assert.deepEqual(JSON.parse(await readFile(first.versionPath, 'utf8')).records, [{ id: 1 }]);
assert.deepEqual(JSON.parse(await readFile(second.versionPath, 'utf8')).records, [{ id: 2 }]);

console.log('Evidence refresh core passed: pagination exhausts all pages, repeated-page loops fail closed, raw artifacts are checksummed, and historical snapshots remain readable.');
