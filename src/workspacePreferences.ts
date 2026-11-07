import { defaultEngineDefaults } from './flywayEngine';
import type { EngineDefaults } from './flywayTypes';

export interface WorkspacePreferences {
  distance: 'miles'|'km'; grain:'daily'|'weekly'; serviceTarget:number; dieselCost:number; routingMode:'road'|'straight';
  engineOverrides?: Partial<EngineDefaults>;
}
export const initialPreferences:WorkspacePreferences={distance:'miles',grain:'weekly',serviceTarget:98,dieselCost:3.87,routingMode:'road'};
export function toEngineDefaults(preferences:WorkspacePreferences):EngineDefaults {
  return {...defaultEngineDefaults,...preferences.engineOverrides,distanceUnit:preferences.distance,defaultGrain:preferences.grain,serviceTarget:preferences.serviceTarget,dieselCostMicrosPerGallon:Math.round(preferences.dieselCost*1e6),routingMode:preferences.routingMode};
}
export function formatDistance(miles:number,unit:WorkspacePreferences['distance']) { return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(unit==='km'?miles*1.609344:miles)} ${unit==='km'?'km':'mi'}`; }
