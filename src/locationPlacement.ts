import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot, TwinLocation } from './flywayTypes';
export type PlacementPoint = {latitude:number;longitude:number};
export type PlacementCandidate = PlacementPoint & {address:string;precision:'verified-source-match'|'address-interpolated';provider:string;sourceUrl:string;matchedAt:string};
export const US_STATE_CODES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function findVerifiedAddress(address:string,city:string,state:string,footprint?:PublicFootprintSnapshot,facilities?:PublicDistributionFacilityRegistry):PlacementCandidate[] {
  if(!address.trim()||!city.trim()||!state.trim())return [];
  const candidates=[...(footprint?.locations||[]).map(l=>({address:l.address,city:l.city,state:l.state,latitude:l.latitude,longitude:l.longitude,sourceUrl:l.sourceUrl,matchedAt:l.retrievedAt||footprint!.metadata.snapshotDate})),...(facilities?.facilities||[]).filter(f=>f.mapPrecision==='exact-public-address'&&f.latitude!=null&&f.longitude!=null).map(f=>({address:f.address||'',city:f.city,state:f.state,latitude:f.latitude!,longitude:f.longitude!,sourceUrl:facilities!.evidence.find(e=>e.id===f.coordinateEvidenceId)?.sourceUrl||facilities!.evidence.find(e=>f.evidenceIds.includes(e.id))?.sourceUrl||'',matchedAt:f.lastVerifiedAt}))];
  const query=normalized(address);
  return candidates.filter(c=>normalized(c.city)===normalized(city)&&c.state.toUpperCase()===state.toUpperCase()&&(normalized(c.address)===query||normalized(c.address)===normalized(`${address} ${city} ${state}`))).map(c=>({...c,precision:'verified-source-match',provider:'Bundled official location evidence'}));
}
export function haversineMiles(a:PlacementPoint,b:PlacementPoint) {
  const radians=(v:number)=>v*Math.PI/180;
  const dl=radians(b.latitude-a.latitude),dn=radians(b.longitude-a.longitude);
  const h=Math.sin(dl/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dn/2)**2;
  return 3958.7613*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function duplicateLocations(candidate:Pick<TwinLocation,'name'|'latitude'|'longitude'|'type'>,locations:TwinLocation[]) {
  return locations.filter(location=>location.type===candidate.type&&(normalized(location.name)===normalized(candidate.name)||haversineMiles(location,candidate)<.1));
}
type Geometry={type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]};
export type StateAtlas={features:Array<{properties:{state:string};geometry:Geometry}>};
function inRing(point:number[],ring:number[][]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
export function stateAtPoint(point:PlacementPoint,atlas:StateAtlas) {
  const xy=[point.longitude,point.latitude];
  return atlas.features.find(feature=>{
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as number[][][]]:feature.geometry.coordinates as number[][][][];
    return polygons.some(rings=>inRing(xy,rings[0])&&!rings.slice(1).some(hole=>inRing(xy,hole)));
  })?.properties.state;
}
