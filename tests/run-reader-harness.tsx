import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LocationImpact } from '../src/flywayTypes';
import type { RunPage, RunResultReader, RunScopeQuery, RunScopeResult } from '../src/runArtifacts';
import { useRunPage } from '../src/useRunPage';
import { useRunScope } from '../src/useRunScope';

type Pending<T> = { readerId: string; cursor?: string; query?: RunScopeQuery; resolve: (value: T) => void; reject: (reason: Error) => void };
const scopes: Array<Pending<RunScopeResult>> = [];
const impacts: Array<Pending<RunPage<LocationImpact>>> = [];
const readers = new Map<string, RunResultReader>();

function totals(stockoutUnits: number) { return { serviceLevel: stockoutUnits ? 90 : 100, stockoutUnits, affectedRestaurants: stockoutUnits ? 1 : 0, maxUtilization: 50, maxUtilizationLocationId: 'dc', totalDemand: 100, fulfilledDemand: 100 - stockoutUnits }; }
function readerFor(readerId: string) {
  const current = readers.get(readerId); if (current) return current;
  const reader = {
    summary: { runId: readerId }, locator: { kind: 'local', runId: readerId },
    scope(query: RunScopeQuery) { return new Promise<RunScopeResult>((resolve, reject) => scopes.push({ readerId, cursor: query.cursor, query, resolve, reject })); },
    impacts(cursor?: string) { return new Promise<RunPage<LocationImpact>>((resolve, reject) => impacts.push({ readerId, cursor, resolve, reject })); },
    recommendations: async () => ({ items: [], total: 0 }), warnings: async () => ({ items: [], total: 0 }), constraints: async () => ({ items: [], total: 0 }),
    input: async () => { throw new Error('unused'); }, metrics: async () => { throw new Error('unused'); },
  } as unknown as RunResultReader;
  readers.set(readerId, reader); return reader;
}

declare global { interface Window { runReaderHarness?: {
  counts: () => { scopes: number; impacts: number };
  scopeRequest: (index: number) => { readerId: string; cursor?: string; query?: RunScopeQuery };
  impactRequest: (index: number) => { readerId: string; cursor?: string };
  resolveScope: (index: number, marker: number, nextCursor?: string) => void;
  rejectScope: (index: number, message: string) => void;
  resolveImpact: (index: number, marker: number, nextCursor?: string) => void;
  rejectImpact: (index: number, message: string) => void;
}; } }

window.runReaderHarness = {
  counts: () => ({ scopes: scopes.length, impacts: impacts.length }),
  scopeRequest: (index) => ({ readerId: scopes[index].readerId, cursor: scopes[index].cursor, query: scopes[index].query }),
  impactRequest: (index) => ({ readerId: impacts[index].readerId, cursor: impacts[index].cursor }),
  resolveScope: (index, marker, nextCursor) => scopes[index].resolve({ baseline: totals(0), scenario: totals(marker), restaurants: { items: [{ locationId: `restaurant-${marker}`, name: `${scopes[index].readerId} scope ${marker}`, demand: 100, fulfilled: 100-marker, stockout: marker, baselineStockout: 0 }], total: 2, ...(nextCursor ? { nextCursor } : {}) }, incrementalStockoutLocationIds: [`restaurant-${marker}`], scope: { product: scopes[index].query!.product, period: scopes[index].query!.period, sort: scopes[index].query!.sort } }),
  rejectScope: (index, message) => scopes[index].reject(new Error(message)),
  resolveImpact: (index, marker, nextCursor) => impacts[index].resolve({ items: [{ locationId: `location-${marker}`, serviceDelta: -marker, stockoutUnits: marker, costDelta: marker, cause: `${impacts[index].readerId} impact ${marker}` }], total: 2, ...(nextCursor ? { nextCursor } : {}) }),
  rejectImpact: (index, message) => impacts[index].reject(new Error(message)),
};

function Harness() {
  const [readerId, setReaderId] = useState('A');
  const [product, setProduct] = useState<RunScopeQuery['product']>('all');
  const [period, setPeriod] = useState(0);
  const reader = useMemo(() => readerFor(readerId), [readerId]);
  const scope = useRunScope(reader, { product, period, sort: 'impact' });
  const page = useRunPage(reader, 'impacts');
  return <main>
    <label>Reader<select aria-label="Reader" value={readerId} onChange={(event) => setReaderId(event.target.value)}><option>A</option><option>B</option></select></label>
    <label>Product<select aria-label="Product" value={product} onChange={(event) => setProduct(event.target.value as RunScopeQuery['product'])}><option value="all">All</option><option value="Chicken">Chicken</option><option value="Produce">Produce</option></select></label>
    <label>Period<input aria-label="Period" type="number" value={period} onChange={(event) => setPeriod(Number(event.target.value))}/></label>
    <section><output data-testid="scope-loading">{scope.loading ? 'loading' : 'settled'}</output><output data-testid="scope-value">{scope.value ? `${scope.value.restaurants.items[0]?.name}|${scope.value.scenario.stockoutUnits}` : ''}</output><output data-testid="scope-error">{scope.error || ''}</output><output data-testid="scope-page">{scope.pageNumber}</output><button onClick={scope.previous} disabled={!scope.hasPrevious}>Scope previous</button><button onClick={scope.next} disabled={!scope.value?.restaurants.nextCursor}>Scope next</button><button onClick={scope.retry}>Scope retry</button></section>
    <section><output data-testid="page-loading">{page.loading ? 'loading' : 'settled'}</output><output data-testid="page-value">{page.page?.items[0]?.cause || ''}</output><output data-testid="page-error">{page.error || ''}</output><output data-testid="page-number">{page.pageNumber}</output><button onClick={page.previous} disabled={!page.hasPrevious}>Impact previous</button><button onClick={page.next} disabled={!page.page?.nextCursor}>Impact next</button><button onClick={page.retry}>Impact retry</button></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
