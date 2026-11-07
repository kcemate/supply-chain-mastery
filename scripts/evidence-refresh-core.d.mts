export interface PaginationOptions<TPage, TItem> {
  fetchPage: (page: number, pageSize: number) => Promise<TPage>;
  itemsFromPage: (page: TPage) => TItem[];
  pageSize?: number;
  startPage?: number;
  maxPages?: number;
}
export function sha256(value: unknown): string;
export function fetchAllPages<TPage, TItem>(options: PaginationOptions<TPage, TItem>): Promise<{ items: TItem[]; pages: Array<{ page: number; count: number; payload: TPage }>; exhausted: true }>;
export function preserveRawArtifact(options: { rootDir: string; sourceId: string; retrievedAt: string; parserVersion: string; sourceUrl: string; payload: unknown; pageCount: number; recordCount: number }): Promise<{ id: string; sourceId: string; retrievedAt: string; checksumSha256: string; artifactUri: string; parserVersion: string; status: 'fetched'; recordCount: number; pageCount: number; previousArtifactId: null; sourceUrl: string }>;
export function writeVersionedSnapshot(options: { currentPath: string; archiveDir: string; datasetId: string; snapshot: Record<string, unknown> }): Promise<{ datasetId: string; checksumSha256: string; versionPath: string; currentPath: string }>;
