import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export async function fetchAllPages({ fetchPage, itemsFromPage, pageSize = 100, startPage = 1, maxPages = 1000 }) {
  const pages = [];
  const items = [];
  const seenPageFingerprints = new Set();
  for (let page = startPage; page < startPage + maxPages; page += 1) {
    const payload = await fetchPage(page, pageSize);
    const pageItems = itemsFromPage(payload);
    if (!Array.isArray(pageItems)) throw new Error(`Page ${page} did not return an item array`);
    const fingerprint = sha256(pageItems);
    if (pageItems.length && seenPageFingerprints.has(fingerprint)) throw new Error(`Pagination repeated page content at page ${page}`);
    seenPageFingerprints.add(fingerprint);
    pages.push({ page, count: pageItems.length, payload });
    items.push(...pageItems);
    if (pageItems.length < pageSize) return { items, pages, exhausted: true };
  }
  throw new Error(`Pagination did not exhaust within ${maxPages} pages`);
}

function safeTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('generatedAt must be a valid timestamp');
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

async function writeIfAbsent(file, contents) {
  try {
    await writeFile(file, contents, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
}

export async function preserveRawArtifact({ rootDir, sourceId, retrievedAt, parserVersion, sourceUrl, payload, pageCount, recordCount }) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const checksum = sha256(serialized);
  const directory = path.join(rootDir, sourceId);
  await mkdir(directory, { recursive: true });
  const artifactPath = path.join(directory, `${safeTimestamp(retrievedAt)}-${checksum}.json`);
  await writeIfAbsent(artifactPath, serialized);
  return {
    id: `artifact:${sourceId}:${checksum}`,
    sourceId,
    retrievedAt,
    checksumSha256: checksum,
    artifactUri: artifactPath,
    parserVersion,
    status: 'fetched',
    recordCount,
    pageCount,
    previousArtifactId: null,
    sourceUrl,
  };
}

export async function writeVersionedSnapshot({ currentPath, archiveDir, datasetId, snapshot }) {
  await mkdir(path.dirname(currentPath), { recursive: true });
  await mkdir(archiveDir, { recursive: true });
  try {
    const previous = await readFile(currentPath, 'utf8');
    const previousChecksum = sha256(previous);
    await writeIfAbsent(path.join(archiveDir, `legacy-${previousChecksum}.json`), previous);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const serialized = `${JSON.stringify(snapshot)}\n`;
  const checksum = sha256(serialized);
  const generatedAt = snapshot.generatedAt || snapshot.metadata?.generatedAt || new Date().toISOString();
  const versionPath = path.join(archiveDir, `${safeTimestamp(generatedAt)}-${checksum}.json`);
  await writeIfAbsent(versionPath, serialized);
  const temporaryPath = `${currentPath}.next`;
  await writeFile(temporaryPath, serialized);
  await rename(temporaryPath, currentPath);
  return { datasetId, checksumSha256: checksum, versionPath, currentPath };
}
