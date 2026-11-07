import { sha256 } from './evidence-refresh-core.mjs';

const normalizeUrl = (value) => String(value || '').replace(/\/$/, '').toLowerCase();
const decodeHtml = (value) => String(value || '').replaceAll('&amp;', '&').replaceAll('&#038;', '&').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&apos;', "'");

export function insideUsScope(latitude, longitude) {
  const contiguous = longitude >= -125 && longitude <= -66 && latitude >= 24 && latitude <= 50;
  const hawaii = longitude >= -161 && longitude <= -154 && latitude >= 18 && latitude <= 23;
  const alaska = longitude >= -180 && longitude <= -129 && latitude >= 50 && latitude <= 72;
  return contiguous || hawaii || alaska;
}

function findRestaurant(value) {
  if (!value || typeof value !== 'object') return null;
  const type = value['@type'];
  if (type === 'Restaurant' || (Array.isArray(type) && type.includes('Restaurant'))) return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) { const match = findRestaurant(item); if (match) return match; }
    } else if (child && typeof child === 'object') {
      const match = findRestaurant(child); if (match) return match;
    }
  }
  return null;
}

function parseRestaurantJsonLd(html, canonicalUrl) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const restaurant = findRestaurant(JSON.parse(decodeHtml(script[1]).trim()));
      if (restaurant && normalizeUrl(restaurant.url) === normalizeUrl(canonicalUrl)) return restaurant;
    } catch { /* unrelated malformed JSON-LD is not evidence */ }
  }
  return null;
}

function parseCoordinates(html) {
  const matches = [...html.matchAll(/google\.com\/maps\/dir\/Current(?:\+|%20)Location\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gi)].map((match) => [Number(match[1]), Number(match[2])]);
  return [...new Map(matches.map(([latitude, longitude]) => [`${latitude.toFixed(7)},${longitude.toFixed(7)}`, { latitude, longitude }])).values()];
}

function parseLocationNumber(html) {
  return html.match(/locationNumber(?:&quot;|"|%22)\s*(?::|%3A)\s*(?:&quot;|"|%22)(\d+)/i)?.[1] || html.match(/[?&]locationNumber=(\d+)/i)?.[1] || '';
}

const review = (record, reason, httpStatus = 0, artifactId = null) => ({ wpPostId: record.id, slug: record.slug, sourceUrl: record.link, modifiedAt: record.modified_gmt, status: 'needs_review', reason, httpStatus, sourceArtifactId: artifactId });

export function extractRestaurantCandidate({ record, html, finalUrl, retrievedAt, sourceArtifactId, extractorVersion, httpStatus = 200 }) {
  const expectedUrl = new URL(record.link);
  const canonical = new URL(finalUrl);
  if (canonical.hostname !== 'www.chick-fil-a.com' || !canonical.pathname.startsWith('/locations/')) return review(record, 'canonical_redirect_mismatch', httpStatus, sourceArtifactId);
  const restaurant = parseRestaurantJsonLd(html, record.link);
  if (!restaurant) return review(record, 'missing_matching_restaurant_jsonld', httpStatus, sourceArtifactId);
  const address = restaurant.address || {};
  const state = expectedUrl.pathname.split('/')[2]?.toUpperCase() || '';
  if (String(address.addressCountry || '').toUpperCase() !== 'US' || String(address.addressRegion || '').toUpperCase() !== state) return review(record, 'address_scope_mismatch', httpStatus, sourceArtifactId);
  const coordinates = parseCoordinates(html);
  if (coordinates.length !== 1) return review(record, coordinates.length ? 'ambiguous_coordinates' : 'missing_coordinates', httpStatus, sourceArtifactId);
  const [{ latitude, longitude }] = coordinates;
  if (!insideUsScope(latitude, longitude)) return review(record, 'coordinate_outside_scope', httpStatus, sourceArtifactId);
  return {
    id: `official-${record.id}`, wpPostId: record.id, locationNumber: parseLocationNumber(html),
    name: decodeHtml(restaurant.name || record.title?.rendered || record.slug), latitude, longitude,
    address: decodeHtml(address.streetAddress || ''), city: decodeHtml(address.addressLocality || ''), state,
    postalCode: decodeHtml(address.postalCode || ''), phone: decodeHtml(restaurant.telephone || ''), sourceUrl: record.link,
    modifiedAt: record.modified_gmt, retrievedAt, sourceChecksum: sha256(html), sourceArtifactId,
    extractorVersion, status: 'verified_public', evidenceClass: 'verified-public',
  };
}
