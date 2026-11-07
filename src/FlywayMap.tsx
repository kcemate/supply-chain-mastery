import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Lane, MapLayerState, PublicDistributionFacility, PublicDistributionFacilityRegistry, PublicFootprintSnapshot, TwinLocation } from './flywayTypes';

const CONTIGUOUS_US_BOUNDS: [[number, number], [number, number]] = [[-125.2, 24.1], [-66.4, 49.7]];
const HAWAII_BOUNDS: [[number, number], [number, number]] = [[-160.5, 18.7], [-154.5, 22.5]];
const ALASKA_BOUNDS: [[number, number], [number, number]] = [[-169, 53], [-130, 71.5]];
const OVERLAP_RADIUS_PX = 44;

type MapSelectionTarget = {
  key: string;
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  scope: 'modeled' | 'public';
  detail: string;
  selected: boolean;
};

type MarkerTarget = { marker: Marker; target: MapSelectionTarget };

function atlasStyle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    version: 8 as const,
    sources: {},
    layers: [{ id: 'atlas-water', type: 'background' as const, paint: { 'background-color': dark ? '#14212b' : '#e5edf1' } }],
  };
}

function fitAtlas(map: MapLibreMap, bounds = CONTIGUOUS_US_BOUNDS, duration = 0) {
  const { width, height } = map.getContainer().getBoundingClientRect();
  if (width < 80 || height < 100) return;
  map.fitBounds(bounds, { padding: { top: Math.min(92, height * .16), bottom: Math.min(130, height * .2), left: Math.min(48, width * .06), right: Math.min(48, width * .06) }, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration, maxZoom: 9 });
}

/** Labels compete for readable space; selected/focused facilities always win. */
function arrangeFacilityLabels(map: MapLibreMap, markers: Marker[]) {
  const container = map.getContainer().getBoundingClientRect();
  const occupied: Array<{left:number;top:number;right:number;bottom:number}> = [];
  const ordered = [...markers].sort((a,b) => Number(b.getElement().classList.contains('is-selected')) - Number(a.getElement().classList.contains('is-selected')));
  for (const marker of ordered) {
    const element = marker.getElement();
    const label = element.querySelector<HTMLElement>('.facility-map-marker-label');
    if (!label) continue;
    const point = map.project(marker.getLngLat());
    const w = label.offsetWidth, h = label.offsetHeight;
    const candidates = [[18,-h/2],[-w-18,-h/2],[-w/2,-h-18],[-w/2,18],[18,-h-10],[-w-18,10]];
    let chosen: number[] | undefined;
    for (const [x,y] of candidates) {
      const rect = {left:point.x+x-4,top:point.y+y-4,right:point.x+x+w+4,bottom:point.y+y+h+4};
      if (rect.left < 8 || rect.right > container.width-8 || rect.top < 74 || rect.bottom > container.height-80) continue;
      if (occupied.some(r => r.left<rect.right && r.right>rect.left && r.top<rect.bottom && r.bottom>rect.top)) continue;
      occupied.push(rect); chosen = [x,y]; break;
    }
    const priority = element.classList.contains('is-selected') || element.matches(':focus-within,:hover');
    label.style.visibility = chosen || priority ? 'visible' : 'hidden';
    if (chosen || priority) {
      const [x,y] = chosen || candidates[0];
      label.style.left = `${22+x}px`; label.style.top = `${22+y}px`; label.style.right = 'auto'; label.style.transform = 'none';
    }
  }
}

function laneGeoJson(locations: TwinLocation[], lanes: Lane[]) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  return {
    type: 'FeatureCollection' as const,
    features: lanes.filter((lane) => lane.status !== 'inactive').flatMap((lane) => {
      const origin = byId.get(lane.originId);
      const destination = byId.get(lane.destinationId);
      if (!origin || !destination) return [];
      return [{
        type: 'Feature' as const,
        properties: { id: lane.id, status: lane.status },
        geometry: { type: 'LineString' as const, coordinates: [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]] },
      }];
    }),
  };
}

function installLaneLayers(map: MapLibreMap, locations: TwinLocation[], lanes: Lane[], visible: boolean, selectedId?: string) {
  const scopedLanes = selectedId ? lanes.filter(lane => lane.originId === selectedId || lane.destinationId === selectedId) : lanes;
  const data = laneGeoJson(locations, scopedLanes);
  const source = map.getSource('flyway-lanes') as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource('flyway-lanes', { type: 'geojson', data });
    map.addLayer({ id: 'flyway-lane-shadow', type: 'line', source: 'flyway-lanes', paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': 4 } });
    map.addLayer({ id: 'flyway-lane-active', type: 'line', source: 'flyway-lanes', filter: ['!=', ['get', 'status'], 'recommended'], paint: { 'line-color': '#647789', 'line-opacity': 0.7, 'line-width': 1.7 } });
    map.addLayer({ id: 'flyway-lane-recommended', type: 'line', source: 'flyway-lanes', filter: ['==', ['get', 'status'], 'recommended'], paint: { 'line-color': '#145cd7', 'line-opacity': 0.9, 'line-width': 2, 'line-dasharray': [2.5, 2] } });
  }
  const visibility = visible ? 'visible' : 'none';
  for (const id of ['flyway-lane-shadow', 'flyway-lane-active', 'flyway-lane-recommended']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
  }
}

function installStateAtlasLayers(map: MapLibreMap, densityVisible: boolean) {
  if (!map.getSource('flyway-state-atlas')) {
    map.addSource('flyway-state-atlas', { type: 'geojson', data: '/data/us-state-atlas.geojson', attribution: 'State geometry: <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html">U.S. Census Bureau</a> · Bundled national atlas' });
    map.addLayer({ id:'flyway-state-land',type:'fill',source:'flyway-state-atlas',paint:{'fill-color':document.documentElement.dataset.theme === 'dark'?'#21313b':'#f7f9f7'} });
    map.addLayer({
      id: 'flyway-official-density',
      type: 'fill',
      source: 'flyway-state-atlas',
      paint: {
        'fill-color': ['step', ['get', 'officialLocationPages'], '#eef1ed', 10, '#dfe9e1', 40, '#c8dbcD', 100, '#a6c7ae', 200, '#7faa8a', 400, '#56836a'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0.7, 5.5, 0.34, 8, 0.08],
      },
    });
    map.addLayer({ id: 'flyway-state-boundaries', type: 'line', source: 'flyway-state-atlas', paint: { 'line-color': '#929e98', 'line-opacity': 0.62, 'line-width': ['interpolate', ['linear'], ['zoom'], 2.5, 0.7, 7, 1.2] } });
  }
  map.setLayoutProperty('flyway-official-density', 'visibility', densityVisible ? 'visible' : 'none');
}

function footprintGeoJson(snapshot: PublicFootprintSnapshot) {
  return {
    type: 'FeatureCollection' as const,
    features: snapshot.locations.map((location) => ({
      type: 'Feature' as const,
      properties: { id: location.id, name: location.name, city: location.city, state: location.state, address: location.address, postalCode: location.postalCode, sourceUrl: location.sourceUrl, evidenceClass: location.evidenceClass || 'verified-public', locationNumber: location.locationNumber || '' },
      geometry: { type: 'Point' as const, coordinates: [location.longitude, location.latitude] },
    })),
  };
}

function installFootprintLayers(map: MapLibreMap, snapshot: PublicFootprintSnapshot, visible: boolean) {
  const data = footprintGeoJson(snapshot);
  const source = map.getSource('public-restaurant-footprint') as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource('public-restaurant-footprint', { type: 'geojson', data });
    map.addLayer({
      id: 'public-footprint-points',
      type: 'circle',
      source: 'public-restaurant-footprint',
      paint: {
        'circle-color': '#426b58',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0.66, 7, 0.78, 11, 0.9],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2.5, 1.7, 5, 2.2, 8, 3.2, 12, 5],
        'circle-stroke-color': '#f7f9f6',
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 7, 0.75],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 7, 0.8, 12, 1.2],
      },
    });
    map.addLayer({ id: 'public-footprint-point-hit', type: 'circle', source: 'public-restaurant-footprint', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2.5, 4, 7, 8, 12, 12], 'circle-opacity': 0 } });
  }
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty('public-footprint-points', 'visibility', visibility);
  map.setLayoutProperty('public-footprint-point-hit', 'visibility', visibility);
}

function publicLocationPopup(properties: Record<string, unknown>) {
  const content = document.createElement('div');
  content.className = 'public-location-popup';
  const eyebrow = document.createElement('span');
  eyebrow.textContent = properties.evidenceClass === 'verified-public' ? 'Verified official location' : 'Corroborated public map record';
  const title = document.createElement('strong');
  title.textContent = String(properties.name || 'Chick-fil-A');
  const address = document.createElement('p');
  address.textContent = [properties.address, properties.city, properties.state, properties.postalCode].filter(Boolean).join(', ') || 'Address details unavailable in the source record';
  const source = document.createElement('a');
  source.href = String(properties.sourceUrl || 'https://www.chick-fil-a.com/locations/browse');
  source.target = '_blank';
  source.rel = 'noreferrer';
  source.textContent = properties.evidenceClass === 'verified-public' ? 'Open official location page' : 'Open public mapping record';
  content.append(eyebrow, title, address, source);
  return content;
}

function markerElement(location: TwinLocation, selected: boolean, impacted: boolean, showLabel: boolean) {
  const button = document.createElement('button');
  button.type = 'button';
  // Marker elements are positioned by MapLibre. The marker component styles use
  // positioned descendants, so keep the marker itself out of document flow.
  button.style.position = 'absolute';
  button.className = ['real-map-node', 'is-sample-layer', `is-${location.type}`, selected ? 'is-selected' : '', impacted ? 'is-impacted' : '', location.evidence.classification === 'synthetic' ? 'is-synthetic' : ''].filter(Boolean).join(' ');
  button.setAttribute('aria-label', `${location.name}, ${location.type === 'dc' ? 'Distribution center' : location.type === 'restaurant' ? 'Restaurant' : 'Supplier'}, ${location.status}`);
  const glyph = document.createElement('span');
  glyph.className = 'real-map-node-glyph';
  glyph.textContent = location.type === 'dc' ? 'DC' : location.type === 'restaurant' ? 'R' : 'S';
  button.append(glyph);
  if (showLabel) {
    const label = document.createElement('span');
    label.className = 'real-map-node-label';
    label.textContent = location.name;
    button.append(label);
  }
  return button;
}

function publicFacilityElement(location: PublicDistributionFacility, selected: boolean, showLabel: boolean) {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.position = 'absolute';
  const exact = location.mapPrecision === 'exact-public-address';
  const placementClass = `facility-${location.id.split(':').pop()}`;
  button.className = ['facility-map-marker', placementClass, exact ? 'is-exact' : 'is-city-level', location.lifecycle === 'launch-or-standup' ? 'is-launching' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  button.setAttribute('aria-label', `${location.name}, publicly evidenced distribution facility, ${exact ? 'exact public address' : 'city-level evidence'}`);
  const glyph = document.createElement('span');
  glyph.className = 'facility-map-marker-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'facility-map-marker-label';
  const name = document.createElement('strong');
  name.textContent = location.name.replace(' Distribution Center', ' DC');
  const precision = document.createElement('small');
  precision.textContent = location.lifecycle === 'launch-or-standup' ? 'Launch / stand-up evidence' : exact ? 'Exact public address' : 'City-level public evidence';
  label.append(name, precision);
  button.append(glyph);
  if (showLabel) button.append(label);
  return button;
}

export function FlywayMap({
  locations,
  lanes,
  selectedId,
  impactedIds = [],
  layerState,
  addPoint,
  placementMode,
  fitRequest,
  publicFootprint,
  publicFacilities,
  selectedPublicFacilityId,
  focusPoint,
  onSelect,
  onPublicFacilitySelect,
  onAddPoint,
  onDraftMove,
}: {
  locations: TwinLocation[];
  lanes: Lane[];
  selectedId?: string;
  impactedIds?: string[];
  layerState: MapLayerState;
  addPoint?: { latitude: number; longitude: number } | null;
  placementMode: boolean;
  fitRequest: number;
  publicFootprint?: PublicFootprintSnapshot;
  publicFacilities?: PublicDistributionFacilityRegistry;
  selectedPublicFacilityId?: string;
  focusPoint?: { latitude: number; longitude: number; id: string } | null;
  onSelect: (id: string) => void;
  onPublicFacilitySelect: (id: string) => void;
  onAddPoint?: (point: { latitude: number; longitude: number }) => void;
  onDraftMove?: (point: { latitude: number; longitude: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const stateLabelsRef = useRef<Marker[]>([]);
  const userCameraRef = useRef(false);
  const focusMarkerRef = useRef<Marker | null>(null);
  const draftMarkerRef = useRef<Marker | null>(null);
  const markerTargetsRef = useRef<MarkerTarget[]>([]);
  const overlapTriggerRef = useRef<HTMLElement | null>(null);
  const overlapPickerRef = useRef<HTMLElement | null>(null);
  const callbacksRef = useRef({ onSelect, onPublicFacilitySelect, onAddPoint, onDraftMove });
  const dataRef = useRef({ locations, lanes, layerState });
  const footprintInteractionsRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [tileWarning, setTileWarning] = useState(false);
  const [overlapPicker, setOverlapPicker] = useState<MapSelectionTarget[] | null>(null);
  callbacksRef.current = { onSelect, onPublicFacilitySelect, onAddPoint, onDraftMove };
  dataRef.current = { locations, lanes, layerState };

  const selectTarget = (target: MapSelectionTarget) => {
    setOverlapPicker(null);
    if (target.scope === 'public') callbacksRef.current.onPublicFacilitySelect(target.id);
    else callbacksRef.current.onSelect(target.id);
  };

  const activateTarget = (target: MapSelectionTarget, trigger: HTMLElement) => {
    const map = mapRef.current;
    if (!map) return selectTarget(target);
    const origin = map.project([target.longitude, target.latitude]);
    const nearby = markerTargetsRef.current
      .map(({ target: candidate }) => ({ candidate, point: map.project([candidate.longitude, candidate.latitude]) }))
      .filter(({ point }) => Math.hypot(point.x - origin.x, point.y - origin.y) <= OVERLAP_RADIUS_PX)
      .map(({ candidate }) => candidate)
      .sort((left, right) => Number(right.key === target.key) - Number(left.key === target.key) || left.name.localeCompare(right.name) || left.key.localeCompare(right.key));
    if (nearby.length < 2) return selectTarget(target);
    overlapTriggerRef.current = trigger;
    setOverlapPicker(nearby);
  };

  const closeOverlapPicker = () => {
    setOverlapPicker(null);
    const trigger = overlapTriggerRef.current;
    overlapTriggerRef.current = null;
    if (trigger?.isConnected) window.requestAnimationFrame(() => trigger.focus());
  };

  useEffect(() => {
    if (!overlapPicker) return;
    overlapPickerRef.current?.querySelector<HTMLButtonElement>('.map-overlap-option')?.focus();
  }, [overlapPicker]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: atlasStyle(),
      center: [-96.5, 38.2],
      zoom: 3.15,
      minZoom: 1.2,
      maxZoom: 15,
      maxBounds: [[-179, 12], [-52, 74]],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Flyway evidence atlas' }), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
    map.on('load', () => {
      installStateAtlasLayers(map, dataRef.current.layerState.officialDensity);
      installLaneLayers(map, dataRef.current.locations, dataRef.current.lanes, dataRef.current.layerState.sampleModel && dataRef.current.layerState.sampleLanes);
      fitAtlas(map);
      setReady(true);
    });
    map.on('movestart', event => { if (event.originalEvent) userCameraRef.current = true; });
    map.on('move', () => arrangeFacilityLabels(map, markersRef.current));
    map.on('error', (event) => {
      if (String(event.error?.message || '').toLowerCase().includes('source')) setTileWarning(true);
    });
    map.on('click', (event) => {
      if (!callbacksRef.current.onAddPoint) return;
      const interactiveLayers = ['public-footprint-point-hit'].filter((id) => Boolean(map.getLayer(id)));
      if (interactiveLayers.length && map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length) return;
      callbacksRef.current.onAddPoint({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    });
    const observer = new ResizeObserver(() => { map.resize(); if (map.isStyleLoaded() && !userCameraRef.current) fitAtlas(map); arrangeFacilityLabels(map, markersRef.current); });
    observer.observe(containerRef.current);
    const themeObserver = new MutationObserver(() => {
      if (!map.isStyleLoaded()) return;
      const dark = document.documentElement.dataset.theme === 'dark';
      map.setPaintProperty('atlas-water','background-color',dark ? '#14212b' : '#e5edf1');
      if (map.getLayer('flyway-state-land')) map.setPaintProperty('flyway-state-land','fill-color',dark ? '#21313b' : '#f7f9f7');
      if (map.getLayer('flyway-state-boundaries')) map.setPaintProperty('flyway-state-boundaries','line-color',dark ? '#748893' : '#9aa9a4');
    });
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      stateLabelsRef.current.forEach(marker => marker.remove());
      markersRef.current.forEach((marker) => marker.remove());
      markerTargetsRef.current = [];
      focusMarkerRef.current?.remove();
      draftMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    installStateAtlasLayers(map, layerState.officialDensity);
    installLaneLayers(map, locations, lanes, layerState.sampleModel && layerState.sampleLanes, selectedId);
  }, [locations, lanes, selectedId, layerState.officialDensity, layerState.sampleModel, layerState.sampleLanes, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const abort = new AbortController();
    fetch('/data/us-state-atlas.geojson',{signal:abort.signal}).then(response => response.json()).then((atlas: {features:Array<{properties:{state:string};geometry:{type:string;coordinates:unknown}}>}) => {
      if (abort.signal.aborted) return;
      stateLabelsRef.current = atlas.features.flatMap(feature => {
        if (['DC','RI','DE','MA','CT','NJ','MD'].includes(feature.properties.state)) return [];
        const rings = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        const polygons = rings as number[][][][];
        const largest = [...polygons].sort((a,b) => b[0].length-a[0].length)[0]?.[0];
        if (!largest?.length) return [];
        const xs = largest.map(p=>p[0]), ys=largest.map(p=>p[1]);
        const element = document.createElement('span'); element.className='atlas-state-label'; element.textContent=feature.properties.state; element.setAttribute('aria-hidden','true');
        return [new maplibregl.Marker({element}).setLngLat([(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2]).addTo(map)];
      });
    }).catch(error => { if (error.name !== 'AbortError') setTileWarning(true); });
    return () => { abort.abort(); stateLabelsRef.current.forEach(marker=>marker.remove()); };
  },[ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !publicFootprint) return;
    installFootprintLayers(map, publicFootprint, layerState.publicRestaurants);
    if (footprintInteractionsRef.current) return;
    footprintInteractionsRef.current = true;
    map.on('click', 'public-footprint-point-hit', (event) => {
      const feature = event.features?.[0];
      const coordinates = (feature?.geometry as { coordinates?: [number, number] } | undefined)?.coordinates;
      if (!feature?.properties || !coordinates) return;
      new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 9 }).setLngLat(coordinates).setDOMContent(publicLocationPopup(feature.properties)).addTo(map);
    });
    for (const layer of ['public-footprint-point-hit']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = placementMode ? 'crosshair' : ''; });
    }
  }, [publicFootprint, layerState.publicRestaurants, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    markerTargetsRef.current = [];
    setOverlapPicker(null);
    const verifiedFacilities = (publicFacilities?.facilities || []).filter((facility) => facility.mapPrecision !== 'not-plotted' && Number.isFinite(facility.latitude) && Number.isFinite(facility.longitude));
    const sampleLocations = layerState.sampleModel
      ? locations
      : [];
    const facilityMarkerTargets = layerState.publicFacilities ? verifiedFacilities.map((location) => {
      const selected = selectedPublicFacilityId === location.id;
      const element = publicFacilityElement(location, selectedPublicFacilityId === location.id, layerState.facilityLabels);
      element.style.zIndex = selected ? '32' : '12';
      const target: MapSelectionTarget = {
        key: `public:${location.id}`,
        id: location.id,
        name: location.name,
        latitude: location.latitude!,
        longitude: location.longitude!,
        scope: 'public',
        detail: `Public facility · ${location.mapPrecision === 'exact-public-address' ? 'exact address evidence' : 'city-level evidence'}`,
        selected,
      };
      element.addEventListener('click', (event) => { event.stopPropagation(); activateTarget(target, element); });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateTarget(target, element); }
      });
      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([location.longitude!, location.latitude!]).addTo(map);
      return { marker, target };
    }) : [];
    const modelMarkerTargets = sampleLocations.map((location) => {
      const impacted = impactedIds.includes(location.id);
      const selected = selectedId === location.id;
      const showLabel = selectedId === location.id || (impacted && impactedIds.indexOf(location.id) === 0);
      const element = markerElement(location, selected, impacted, showLabel);
      element.style.zIndex = selected ? '31' : impacted ? '21' : '11';
      const target: MapSelectionTarget = {
        key: `modeled:${location.id}`,
        id: location.id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        scope: 'modeled',
        detail: `Modeled ${location.type === 'dc' ? 'distribution center' : location.type} · operating assumptions`,
        selected,
      };
      element.addEventListener('click', (event) => { event.stopPropagation(); activateTarget(target, element); });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateTarget(target, element); }
      });
      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([location.longitude, location.latitude]).addTo(map);
      return { marker, target };
    });
    markerTargetsRef.current = [...facilityMarkerTargets, ...modelMarkerTargets];
    markersRef.current = markerTargetsRef.current.map(({ marker }) => marker);
    arrangeFacilityLabels(map, markersRef.current);
    const arrange = () => arrangeFacilityLabels(map, markersRef.current);
    window.requestAnimationFrame(arrange);
  }, [locations, publicFacilities, selectedId, selectedPublicFacilityId, impactedIds.join('|'), layerState.publicFacilities, layerState.facilityLabels, layerState.sampleModel, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    if (!addPoint) return;
    const element = document.createElement('button');
    element.type = 'button';
    element.style.position = 'absolute';
    element.className = 'real-map-draft-node';
    element.setAttribute('aria-label', 'Draft location marker. Drag to correct its position.');
    const pin = document.createElement('span');
    pin.textContent = '+';
    const label = document.createElement('span');
    label.textContent = 'Drag to correct';
    element.append(pin, label);
    element.addEventListener('click', (event) => event.stopPropagation());
    const marker = new maplibregl.Marker({ element, anchor: 'center', draggable: true }).setLngLat([addPoint.longitude, addPoint.latitude]).addTo(map);
    marker.on('dragend', () => {
      const point = marker.getLngLat();
      callbacksRef.current.onDraftMove?.({ latitude: point.lat, longitude: point.lng });
    });
    draftMarkerRef.current = marker;
  }, [addPoint?.latitude, addPoint?.longitude, ready]);

  useEffect(() => {
    if (!mapRef.current || !ready || fitRequest === 0) return;
    userCameraRef.current = false;
    fitAtlas(mapRef.current, CONTIGUOUS_US_BOUNDS, 250);
  }, [fitRequest, ready]);

  useEffect(() => {
    if (!mapRef.current || !ready || !focusPoint) return;
    userCameraRef.current = true;
    mapRef.current.flyTo({ center: [focusPoint.longitude, focusPoint.latitude], zoom: 8, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350 });
    focusMarkerRef.current?.remove();
    const element = document.createElement('span');
    element.className = 'focused-public-map-point';
    element.setAttribute('aria-label', 'Focused public restaurant record');
    focusMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([focusPoint.longitude, focusPoint.latitude]).addTo(mapRef.current);
  }, [focusPoint?.id, ready]);

  return (
    <div className={`network-map real-network-map${placementMode ? ' is-placement-mode' : ''}`} data-testid="network-map">
      <div ref={containerRef} className="maplibre-host" aria-label={layerState.sampleModel?`Interactive U.S. planning map with ${locations.length} modeled locations. Operating values and connections are assumptions.`:`Interactive U.S. evidence atlas with ${publicFootprint?.metadata.officialRecordCount || 0} official location pages, ${publicFacilities?.facilityCount || 0} publicly evidenced distribution facilities, and no verified service territories`} />
      {!ready && <div className="map-loading" role="status"><span />Loading bundled U.S. atlas…</div>}
      {tileWarning && <div className="map-tile-warning" role="status">Geography could not load. Records remain available in the network list. Reload to retry.</div>}
      {placementMode && <div className="placement-banner">Click the map to place the location, then drag the marker to correct it</div>}
      {overlapPicker && <section ref={overlapPickerRef} className="map-overlap-picker" style={{ zIndex: 40 }} role="dialog" aria-modal="false" aria-labelledby="map-overlap-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeOverlapPicker(); } }}>
        <div className="map-overlap-heading"><div><h2 id="map-overlap-title">Choose a location</h2><p>{overlapPicker.length} markers share this map area.</p></div><button type="button" className="map-overlap-close" aria-label="Close overlapping locations" onClick={closeOverlapPicker}>×</button></div>
        <div className="map-overlap-options">{overlapPicker.map((target) => <button type="button" className="map-overlap-option" key={target.key} onClick={() => selectTarget(target)}><strong>{target.name}</strong><span>{target.detail}</span></button>)}</div>
      </section>}
      <div className="map-region-insets" aria-label="United States map extent">{[['USA',CONTIGUOUS_US_BOUNDS],['HI',HAWAII_BOUNDS],['AK',ALASKA_BOUNDS]].map(([label,bounds])=><button type="button" key={String(label)} aria-label={`View ${label === 'USA'?'contiguous United States':label==='HI'?'Hawaii':'Alaska'}`} onClick={()=>{ if(mapRef.current){userCameraRef.current=label!=='USA';fitAtlas(mapRef.current,bounds as typeof CONTIGUOUS_US_BOUNDS,250);} }}><strong>{String(label)}</strong></button>)}</div>
      <p className="sr-only" aria-live="polite">{layerState.sampleModel?'Planning view. All suppliers, connections, quantities, and operating outcomes are modeled assumptions, not company actuals.':'Public evidence view. No suppliers, routes, assignments, or service territories are shown because complete public evidence is unavailable.'}</p>
    </div>
  );
}
