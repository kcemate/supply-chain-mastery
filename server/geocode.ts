export interface GeocodeCandidate {
  address: string;
  latitude: number;
  longitude: number;
  precision: 'address-interpolated';
  provider: 'U.S. Census Geocoder';
  sourceUrl: string;
  matchedAt: string;
}

export interface GeocodeResponse {
  candidates: GeocodeCandidate[];
  warning?: string;
}

interface CensusResponse {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: string;
      coordinates?: { x?: number; y?: number };
    }>;
  };
}

export interface CensusGeocoderOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

const CENSUS_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const CENSUS_SOURCE = 'https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf';

export class CensusGeocoder {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { expiresAt: number; response: GeocodeResponse }>();
  private readonly pending = new Map<string, Promise<GeocodeResponse>>();

  constructor(options: CensusGeocoderOptions = {}) {
    this.fetcher = options.fetch || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || 6_000;
    this.cacheTtlMs = options.cacheTtlMs || 30 * 24 * 60 * 60 * 1_000;
    this.now = options.now || Date.now;
  }

  async search(rawAddress: string): Promise<GeocodeResponse> {
    const address = rawAddress.replace(/\s+/g, ' ').trim();
    if (address.length < 3 || address.length > 500) throw new Error('Address must contain 3 to 500 characters.');
    const key = address.toLocaleLowerCase('en-US');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return structuredClone(cached.response);
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing);
    const request = this.fetchCensus(address).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    const response = await request;
    this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, response });
    return structuredClone(response);
  }

  private async fetchCensus(address: string): Promise<GeocodeResponse> {
    const url = new URL(CENSUS_ENDPOINT);
    url.searchParams.set('address', address);
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('format', 'json');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'Flyway-Digital-Twin/1.0 public-geocoder' },
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`Census Geocoder returned ${response.status}.`);
      const payload = await response.json() as CensusResponse;
      const matchedAt = new Date(this.now()).toISOString();
      const candidates = (payload.result?.addressMatches || []).flatMap((match): GeocodeCandidate[] => {
        const latitude = match.coordinates?.y;
        const longitude = match.coordinates?.x;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') return [];
        // Version one is a U.S.-only product. This broad envelope includes Alaska
        // and Hawaii while rejecting malformed or non-U.S. provider output.
        if (latitude < 18 || latitude > 72 || longitude < -180 || longitude > -60) return [];
        return [{
          address: match.matchedAddress || address,
          latitude,
          longitude,
          precision: 'address-interpolated',
          provider: 'U.S. Census Geocoder',
          sourceUrl: CENSUS_SOURCE,
          matchedAt,
        }];
      }).slice(0, 5);
      return candidates.length ? { candidates } : { candidates: [], warning: 'No validated U.S. address match was returned. Use explicit manual placement and confirm its precision.' };
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new Error('Census Geocoder timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
