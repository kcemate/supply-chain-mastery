import { mkdir, writeFile } from 'node:fs/promises';

const SNAPSHOT_DATE = '2026-08-20';
const SITEMAP_INDEX = 'https://www.chick-fil-a.com/sitemap_index.xml';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'Flyway-Public-Footprint-Snapshot/1.0';
const US_CODES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function mapLimited(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

function xmlValues(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))].map((match) => match[1].replaceAll('&amp;', '&'));
}

function titleCase(slug) {
  return slug.split('-').filter(Boolean).map((word) => word.length <= 2 && /^i|sr|us$/.test(word) ? word.toUpperCase() : `${word[0]?.toUpperCase() || ''}${word.slice(1)}`).join(' ');
}

function officialRecord(url, lastModified) {
  const match = url.match(/\/locations\/([a-z]{2})\/([^/?#]+)/i);
  if (!match) return null;
  const state = match[1].toUpperCase();
  if (!US_CODES.has(state)) return null;
  return { id: `official-${state.toLowerCase()}-${match[2]}`, name: titleCase(match[2]), state, url, lastModified };
}

function pointFor(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const tags = element.tags || {};
  return {
    id: `osm-${element.type}-${element.id}`,
    name: tags.name || tags['official_name'] || 'Chick-fil-A',
    latitude,
    longitude,
    city: tags['addr:city'] || tags['addr:place'] || '',
    state: String(tags['addr:state'] || '').toUpperCase(),
    address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    postalCode: tags['addr:postcode'] || '',
    osmType: element.type,
    osmId: element.id,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}

function isInFiftyStatesOrDc(point) {
  const { latitude, longitude } = point;
  const contiguous = longitude >= -125 && longitude <= -66 && latitude >= 24 && latitude <= 50;
  const hawaii = longitude >= -161 && longitude <= -154 && latitude >= 18 && latitude <= 23;
  const alaska = longitude >= -180 && longitude <= -129 && latitude >= 50 && latitude <= 72;
  return contiguous || hawaii || alaska;
}

function dedupePoints(points) {
  const seen = new Map();
  for (const point of points) {
    const key = `${point.latitude.toFixed(3)}:${point.longitude.toFixed(3)}`;
    const existing = seen.get(key);
    if (!existing || (!existing.address && point.address)) seen.set(key, point);
  }
  return [...seen.values()].sort((a, b) => a.longitude - b.longitude || a.latitude - b.latitude);
}

const sitemapIndex = await fetchText(SITEMAP_INDEX);
const locationSitemaps = xmlValues(sitemapIndex, 'loc').filter((url) => /location-sitemap\d+\.xml$/.test(url));
if (!locationSitemaps.length) throw new Error('No official location sitemaps found.');

const sitemapXml = await mapLimited(locationSitemaps, 4, fetchText);
const officialRecords = sitemapXml.flatMap((xml) => {
  const urls = xmlValues(xml, 'loc');
  const modified = xmlValues(xml, 'lastmod');
  return urls.map((url, index) => officialRecord(url, modified[index] || SNAPSHOT_DATE)).filter(Boolean);
});

const officialByState = Object.fromEntries([...US_CODES].sort().map((state) => [state, officialRecords.filter((record) => record.state === state).length]));
const overpassQuery = '[out:json][timeout:300];area["ISO3166-1"="US"][admin_level=2]->.us;nwr["brand"="Chick-fil-A"](area.us);out center tags;';
const overpassResponse = await fetch(OVERPASS_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT }, body: new URLSearchParams({ data: overpassQuery }) });
if (!overpassResponse.ok) throw new Error(`${overpassResponse.status} ${OVERPASS_URL}`);
const overpass = await overpassResponse.json();
const rawPoints = overpass.elements.map(pointFor).filter(Boolean).filter(isInFiftyStatesOrDc);
const mappedLocations = dedupePoints(rawPoints);

const snapshot = {
  metadata: {
    snapshotDate: SNAPSHOT_DATE,
    generatedAt: new Date().toISOString(),
    officialRecordCount: officialRecords.length,
    officialSitemapCount: locationSitemaps.length,
    exactMappedCount: mappedLocations.length,
    rawOsmFeatureCount: rawPoints.length,
    officialByState,
    officialSource: SITEMAP_INDEX,
    mappingSource: 'https://www.openstreetmap.org/',
    mappingQuerySource: OVERPASS_URL,
    mappingLicense: 'Open Database License (ODbL)',
    methodology: 'Official Chick-fil-A location sitemaps define the 50-state and District of Columbia public record universe. Exact display coordinates come from openly licensed OpenStreetMap features tagged brand=Chick-fil-A within the same geography. Official records without an exact open-map match are counted but not assigned invented coordinates.',
    limitations: 'This is a point-in-time public snapshot, not an official operational master. Sitemap pages may include licensed, campus, planned, relocated, or recently changed records. OpenStreetMap coverage is community-maintained and may omit or duplicate locations.',
  },
  locations: mappedLocations,
};

await mkdir('public-site/data', { recursive: true });
await writeFile('public-site/data/chick-fil-a-public-footprint.json', `${JSON.stringify(snapshot)}\n`);
await writeFile('public-site/data/chick-fil-a-official-location-index.json', `${JSON.stringify({ snapshotDate: SNAPSHOT_DATE, byState: officialByState, records: officialRecords })}\n`);

console.log(JSON.stringify({ officialSitemaps: locationSitemaps.length, officialRecords: officialRecords.length, rawOsmFeatures: rawPoints.length, exactMappedLocations: mappedLocations.length, output: 'public-site/data/chick-fil-a-public-footprint.json' }, null, 2));
