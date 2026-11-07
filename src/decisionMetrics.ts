import type { PeriodProductMetric, ProductCategory, TwinMetrics } from './flywayTypes';

export type ProductScope = ProductCategory | 'all';

export function periodRows(
  rows: PeriodProductMetric[] | undefined,
  product: ProductScope,
  period: number,
  daysPerPeriod: number,
) {
  return (rows || []).filter((row) =>
    (product === 'all' || row.product === product)
    && (period < 0 || Math.floor(row.periodIndex / daysPerPeriod) === period),
  );
}

export function scopedMetrics(rows: PeriodProductMetric[], fallback: TwinMetrics): TwinMetrics {
  if (!rows.length) return fallback;
  const restaurants = rows.filter((row) => row.locationType === 'restaurant');
  const demand = restaurants.reduce((sum, row) => sum + row.requestedDemand, 0);
  const fulfilled = restaurants.reduce((sum, row) => sum + row.fulfilledDemand, 0);
  const bottleneck = rows.reduce<PeriodProductMetric | undefined>((best, row) => {
    const utilization = Math.max(row.inboundUtilization, row.outboundUtilization, row.storageUtilization);
    const bestUtilization = best ? Math.max(best.inboundUtilization, best.outboundUtilization, best.storageUtilization) : -1;
    return utilization > bestUtilization ? row : best;
  }, undefined);
  return {
    ...fallback,
    totalDemand: demand,
    fulfilledDemand: fulfilled,
    serviceLevel: demand ? 100 * fulfilled / demand : 100,
    stockoutUnits: restaurants.reduce((sum, row) => sum + row.stockoutQuantity, 0),
    affectedRestaurants: new Set(restaurants.filter((row) => row.stockoutQuantity > 0).map((row) => row.locationId)).size,
    maxUtilization: bottleneck ? Math.max(bottleneck.inboundUtilization, bottleneck.outboundUtilization, bottleneck.storageUtilization) : 0,
    maxUtilizationLocationId: bottleneck?.locationId || '',
  };
}

function stockoutsByLocation(rows: PeriodProductMetric[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.locationType !== 'restaurant') continue;
    totals.set(row.locationId, (totals.get(row.locationId) || 0) + row.stockoutQuantity);
  }
  return totals;
}

export function incrementalStockoutLocationIds(
  scenarioRows: PeriodProductMetric[],
  baselineRows: PeriodProductMetric[],
) {
  const scenario = stockoutsByLocation(scenarioRows);
  const baseline = stockoutsByLocation(baselineRows);
  return [...scenario.entries()]
    .filter(([locationId, quantity]) => quantity > (baseline.get(locationId) || 0))
    .map(([locationId]) => locationId);
}

export function topologyDayForSelection(period: number, daysPerPeriod: number, horizonDays: number) {
  if (horizonDays <= 0) return 0;
  return period < 0 ? horizonDays - 1 : Math.min(period * daysPerPeriod, horizonDays - 1);
}
