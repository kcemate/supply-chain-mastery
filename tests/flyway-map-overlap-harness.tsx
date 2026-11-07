import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FlywayMap } from '../src/FlywayMap';
import { initialLocations } from '../src/flywayData';
import '../src/flyway.css';
import '../src/enterprise-workspace.css';

const cartersville = initialLocations.find((location) => location.id === 'dc-cartersville')!;
const locations = initialLocations.filter((location) => ['dc-cartersville', 'rest-atlanta-midtown'].includes(location.id)).map((location) => location.id === 'rest-atlanta-midtown'
  ? { ...location, latitude: cartersville.latitude + .02, longitude: cartersville.longitude + .02 }
  : location);

function Harness() {
  const [selectedId, setSelectedId] = useState<string>();
  const [selectionCount, setSelectionCount] = useState(0);
  return <main style={{ height: '720px', width: '700px' }}>
    <FlywayMap
      locations={locations}
      lanes={[]}
      selectedId={selectedId}
      layerState={{ officialDensity: false, publicRestaurants: false, publicFacilities: false, sampleModel: true, sampleLanes: false, risk: false, facilityLabels: false }}
      placementMode={false}
      fitRequest={0}
      onSelect={(id) => { setSelectedId(id); setSelectionCount((count) => count + 1); }}
      onPublicFacilitySelect={() => undefined}
    />
    <output aria-live="polite">Selected {selectedId || 'none'} · {selectionCount} selections</output>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
