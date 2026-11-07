export function stripHtml(value: unknown): string;
export function discoverDirectFacilityJobs<T extends Record<string, unknown>>(entries: Array<T | { data: T }>): T[];
export function groupFacilityJobs<T extends Record<string, unknown>>(jobs: T[]): Map<string, T[]>;
export function selectStrongestFacilityJob<T extends Record<string, unknown>>(jobs: T[]): T;
