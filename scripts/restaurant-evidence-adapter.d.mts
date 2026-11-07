export interface RestaurantManifestRecord { id: number; slug: string; link: string; modified_gmt: string; title?: { rendered?: string } }
export function insideUsScope(latitude: number, longitude: number): boolean;
export function extractRestaurantCandidate(input: { record: RestaurantManifestRecord; html: string; finalUrl: string; retrievedAt: string; sourceArtifactId: string; extractorVersion: string; httpStatus?: number }): Record<string, unknown> & { status: 'verified_public' | 'needs_review'; id?: string; reason?: string };
