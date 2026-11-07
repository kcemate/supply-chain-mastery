import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { EvidenceWorkbench } from '../src/EvidenceWorkbench';
import { createBundledEvidenceLedger, quarantineRefresh, type EvidenceLedger, type EvidencePublication } from '../src/evidence';
import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot } from '../src/flywayTypes';
import footprintJson from '../public-site/data/chick-fil-a-verified-locations.json';
import facilityJson from '../public-site/data/chick-fil-a-public-distribution-facilities.json';
import '../src/flyway.css';

const footprint = footprintJson as PublicFootprintSnapshot;
const facilities = facilityJson as PublicDistributionFacilityRegistry;

function Harness() {
  const initialLedger = useMemo(() => {
    const bundled = createBundledEvidenceLedger(footprint, facilities);
    return quarantineRefresh({
      ledger: bundled,
      datasetId: 'fixture-facilities',
      artifact: {
        id: 'artifact:fixture:2026-09-04', sourceId: bundled.sources[1].id, retrievedAt: '2026-09-04T00:00:00.000Z',
        checksumSha256: 'f'.repeat(64), artifactUri: '/fixtures/facilities.json', parserVersion: 'fixture-v1', status: 'parsed',
        recordCount: 1, pageCount: 1, previousArtifactId: null,
      },
      candidates: [{ stableKey: 'fixture:facility', record: { stableKey: 'fixture:facility', name: 'Fixture Facility', latitude: 33.75, longitude: -84.39, mapPrecision: 'exact-public-address' } }],
      currentRecords: [],
      materialFields: ['name', 'latitude', 'longitude', 'mapPrecision'],
      entityType: 'public-distribution-facility', sourceTitle: 'Fixture official facility source', sourcePublisher: 'Fixture publisher',
      sourceUrl: 'https://example.test/official-facility', classification: 'verified-public', confidence: 0.95,
      createdAt: '2026-09-04T00:00:00.000Z', extractorVersion: 'fixture-v1',
    });
  }, []);
  const [ledger, setLedger] = useState<EvidenceLedger>(initialLedger);
  const [publication, setPublication] = useState<EvidencePublication | null>(null);
  const [attempts, setAttempts] = useState(0);
  const persist = async (next: EvidenceLedger) => {
    const attempt = attempts + 1;
    setAttempts(attempt);
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (attempt === 1) return false;
    setLedger(next);
    return true;
  };
  return <div className="flyway-app"><output aria-live="polite">{publication ? `Published ${publication.id}` : 'No publication created'} · Save attempts {attempts}</output><EvidenceWorkbench footprint={footprint} facilities={facilities} ledger={ledger} onLedger={persist} onPublish={setPublication} now="2026-09-04T00:00:00.000Z" actorId="browser-reviewer" /></div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
