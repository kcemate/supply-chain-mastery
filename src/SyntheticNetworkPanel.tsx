import { CheckCircle2, ChevronRight, Plus } from 'lucide-react';
import type { Lane, TwinLocation } from './flywayTypes';
import { syntheticNetwork } from './syntheticNetwork';

interface Props {
  locations: TwinLocation[];
  lanes: Lane[];
  adding: boolean;
  blocked: boolean;
  onAdd: () => void;
  onExplore: () => void;
}

const counts = {
  restaurants: syntheticNetwork.locations.filter(location => location.type === 'restaurant').length,
  hubs: syntheticNetwork.locations.filter(location => location.type === 'dc').length,
  suppliers: syntheticNetwork.locations.filter(location => location.type === 'supplier').length,
  lanes: syntheticNetwork.lanes.length,
};

export function SyntheticNetworkPanel({ locations, lanes, adding, blocked, onAdd, onExplore }: Props) {
  const locationIds = new Set(locations.map(location => location.id));
  const laneIds = new Set(lanes.map(lane => lane.id));
  const remainingLocations = syntheticNetwork.locations.filter(location => !locationIds.has(location.id)).length;
  const remainingLanes = syntheticNetwork.lanes.filter(lane => !laneIds.has(lane.id)).length;
  const loaded = remainingLocations === 0 && remainingLanes === 0;
  const partial = remainingLocations !== syntheticNetwork.locations.length || remainingLanes !== syntheticNetwork.lanes.length;

  return <section className="synthetic-network-panel" aria-label="Synthetic network expansion">
    <div className="synthetic-network-copy">
      <div className="synthetic-network-heading">
        <h2>Synthetic network expansion</h2>
        <span className="evidence-badge is-synthetic">Fictional data</span>
      </div>
      <p className="synthetic-network-counts">{counts.restaurants} restaurants · {counts.hubs} distribution centers · {counts.suppliers} suppliers · {counts.lanes} lanes</p>
      <p>{loaded ? 'Included in this planning model. Try a hub outage, supplier failure, or demand surge.' : 'Add editable demand, inventory, capacity, and freight assumptions. Existing data and the public map stay unchanged.'}</p>
      <span className="sr-only" role="status">{adding ? 'Saving synthetic network' : loaded ? 'Synthetic network added to this planning model' : ''}</span>
    </div>
    <button type="button" className="button secondary synthetic-network-action" disabled={adding || blocked} onClick={loaded ? onExplore : onAdd}>
      {loaded ? <CheckCircle2 size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
      {adding ? 'Adding synthetic data…' : loaded ? 'Inspect sample hub' : partial ? 'Add missing sample data' : 'Add synthetic network'}
      {loaded && <ChevronRight size={16} aria-hidden="true" />}
    </button>
  </section>;
}
