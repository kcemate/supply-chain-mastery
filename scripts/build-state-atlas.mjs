import { readFile, writeFile } from 'node:fs/promises';
import { feature } from 'topojson-client';

const fipsToState = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

const topology = JSON.parse(await readFile('node_modules/us-atlas/states-10m.json', 'utf8'));
const footprint = JSON.parse(await readFile('public-site/data/chick-fil-a-public-footprint.json', 'utf8'));
const states = feature(topology, topology.objects.states);
const features = states.features.flatMap((stateFeature) => {
  const state = fipsToState[String(stateFeature.id).padStart(2, '0')];
  if (!state) return [];
  const officialLocationPages = footprint.metadata.officialByState[state] || 0;
  return [{
    ...stateFeature,
    properties: {
      state,
      name: stateFeature.properties?.name || state,
      officialLocationPages,
      evidence: 'Official Chick-fil-A location sitemap snapshot',
      snapshotDate: footprint.metadata.snapshotDate,
    },
  }];
});

await writeFile('public-site/data/us-state-atlas.geojson', `${JSON.stringify({ type: 'FeatureCollection', features })}\n`);
console.log(JSON.stringify({ states: features.length, officialLocationPages: features.reduce((sum, item) => sum + item.properties.officialLocationPages, 0), output: 'public-site/data/us-state-atlas.geojson' }, null, 2));
