import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Factory, MapPin, Navigation, Store, Warehouse, X } from 'lucide-react';
import { productCategories, syntheticEvidence } from './flywayData';
import type { LocationType, PublicDistributionFacilityRegistry, PublicFootprintSnapshot, TwinLocation } from './flywayTypes';
import { usePersistedState, reportStorageNotice } from './workspaceStorage';
import { duplicateLocations, findVerifiedAddress, stateAtPoint, US_STATE_CODES, type PlacementCandidate, type PlacementPoint, type StateAtlas } from './locationPlacement';
import { createEvidenceValue } from './evidence';

const blank = {type:'restaurant' as LocationType,name:'',address:'',city:'',state:'GA',point:null as PlacementPoint|null,confirmedPoint:'',candidate:null as PlacementCandidate|null,weeklyVolume:2800,inventoryDays:2,duplicateAccepted:false};
const pointKey=(point:PlacementPoint|null)=>point?`${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`:'';
export function AddLocationPanel({draftPoint,onPoint,onClose,onSave,open,locations,footprint,facilities,geocode}:{draftPoint:PlacementPoint|null;onPoint:(p:PlacementPoint)=>void;onClose:()=>void;onSave:(l:TwinLocation)=>Promise<void>;open:boolean;locations:TwinLocation[];footprint?:PublicFootprintSnapshot;facilities?:PublicDistributionFacilityRegistry;geocode?:(address:string)=>Promise<PlacementCandidate[]>}) {
  const [stored,setStored]=usePersistedState('flyway-location-draft',blank);
  const [draft,setDraft]=useState(stored),[draftStatus,setDraftStatus]=useState('Recovered browser draft');
  const [candidates,setCandidates]=useState<PlacementCandidate[]>([]),[error,setError]=useState(''),[finding,setFinding]=useState(false),[saving,setSaving]=useState(false);
  const [atlas,setAtlas]=useState<StateAtlas>();
  const [notice,setNotice]=useState('');
  const change=(changes:Partial<typeof draft>)=>{const next={...draft,...changes};setDraft(next);setDraftStatus('Saving draft…');void setStored(()=>next).then(ok=>setDraftStatus(ok?'Draft saved in this browser':'Draft not saved — keep this page open'));};
  useEffect(()=>{if(!draftPoint&&draft.point)onPoint(draft.point);},[]);
  useEffect(()=>{if(draftPoint&&pointKey(draftPoint)!==pointKey(draft.point))change({point:draftPoint,confirmedPoint:'',candidate:null});},[draftPoint?.latitude,draftPoint?.longitude]);
  useEffect(()=>{const abort=new AbortController();fetch('/data/us-state-atlas.geojson',{signal:abort.signal}).then(r=>r.json()).then(setAtlas).catch(e=>{if(e.name!=='AbortError')setNotice('State boundary validation is unavailable. Retry before saving.');});return()=>abort.abort();},[]);
  const find=async()=>{
    setError('');setNotice('');setFinding(true);
    try {
      if(!draft.address.trim()||!draft.city.trim()||!US_STATE_CODES.includes(draft.state.toUpperCase()))throw new Error('Enter a street address, city, and valid U.S. state first.');
      let matches=findVerifiedAddress(draft.address,draft.city,draft.state,footprint,facilities);
      if(!matches.length&&geocode)matches=await geocode(`${draft.address}, ${draft.city}, ${draft.state}`);
      setCandidates(matches);
      if(!matches.length)setNotice(geocode?'No supported address match was returned. Enter coordinates or place the marker manually.':'No exact match in the bundled public records. Connect the platform geocoder in Settings, or enter coordinates / place the marker manually. No approximate match has been substituted.');
    }catch(reason){setError(reason instanceof Error?reason.message:'The address lookup failed. Manual placement remains available.');}finally{setFinding(false);}
  };
  const pick=(candidate:PlacementCandidate)=>{onPoint(candidate);change({point:candidate,candidate,confirmedPoint:''});setCandidates([]);setNotice('Review the matched address and confirm the position.');};
  const duplicates=draftPoint?duplicateLocations({name:draft.name,...draftPoint,type:draft.type},locations):[];
  const save=async()=>{
    setError('');
    if(!draft.name.trim()||!draft.address.trim()||!draft.city.trim()||!US_STATE_CODES.includes(draft.state.toUpperCase())){setError('Enter a name, street address, city, and valid U.S. state.');return;}
    if(!draftPoint||draft.confirmedPoint!==pointKey(draftPoint)){setError('Confirm the map position before saving.');return;}
    if(!Number.isFinite(draft.weeklyVolume)||draft.weeklyVolume<0||!Number.isFinite(draft.inventoryDays)||draft.inventoryDays<0){setError('Demand, capacity, and inventory must be non-negative numbers.');return;}
    if(!atlas){setError('State boundaries are still loading. Retry shortly; the draft is saved.');return;}
    const state=stateAtPoint(draftPoint,atlas);
    if(!state){setError('The point is outside the supported U.S. state boundaries. Correct it before saving.');return;}
    if(state!==draft.state.toUpperCase()){setError(`The point is in ${state}, not ${draft.state.toUpperCase()}. Correct the state or map position.`);return;}
    if(duplicates.length&&!draft.duplicateAccepted){setError('Review the possible duplicate and acknowledge it before creating another record.');return;}
    setSaving(true);
    const id=crypto.randomUUID(),at=new Date().toISOString();
    const evidence={classification:'user-input' as const,confidence:null,sourceTitle:'User-confirmed modeled facility',publisher:'Workspace owner',verifiedAt:at,note:'User-supplied identity and confirmed placement. Not a verified company facility.'};
    const location:TwinLocation={id,type:draft.type,name:draft.name.trim(),address:draft.address.trim(),city:draft.city.trim(),state:draft.state.toUpperCase(),...draftPoint,status:'active',products:productCategories,evidence,mapPrecision:'model-only',operatingSchedule:'Monday–Saturday; editable modeled calendar',calendar:{operatingWeekdays:[1,2,3,4,5,6]},inventoryDays:draft.inventoryDays,...(draft.type==='restaurant'?{weeklyDemand:draft.weeklyVolume}:{weeklyCapacity:draft.weeklyVolume}),notes:'Created in the planning model. No real supplier relationship is asserted.'};
    const fields=['name','address','city','state','latitude','longitude','weeklyDemand','weeklyCapacity','inventoryDays'] as const;
    location.fieldEvidence=Object.fromEntries(fields.filter(field=>location[field]!=null).map(field=>[field,createEvidenceValue({id:crypto.randomUUID(),entityType:'location',entityId:id,fieldPath:field,value:location[field],classification:'user-input',confidence:null,sourceTitle:evidence.sourceTitle,sourcePublisher:evidence.publisher,verifiedAt:at,effectiveFrom:at,extractionMethod:'user-confirmation',extractorVersion:'flyway-authoring-2'})]));
    // Capabilities/calendar are explicit sample defaults until edited individually.
    location.fieldEvidence.products=createEvidenceValue({id:crypto.randomUUID(),entityType:'location',entityId:id,fieldPath:'products',value:productCategories,classification:'synthetic',confidence:0,sourceTitle:syntheticEvidence.sourceTitle,sourcePublisher:'Flyway',verifiedAt:at,effectiveFrom:at,extractionMethod:'labeled-sample-default',extractorVersion:'flyway-authoring-2'});
    try {await onSave(location);if(!await setStored(()=>blank))reportStorageNotice('flyway-location-draft','recovery','The location was saved, but its recovery draft could not be cleared. It may reappear; check the existing location before adding it again.');setDraft(blank);}catch(reason){setError(reason instanceof Error?reason.message:'Location was not saved. Your draft is retained.');}finally{setSaving(false);}
  };
  return <aside className="detail-drawer add-location-drawer t-panel-slide" data-open={open} role="dialog" aria-label="Add location"><div className="drawer-header"><div><h2>Add modeled location</h2><p>Public evidence is unchanged. {draftStatus}.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close add location"><X size={19}/></button></div><div className="drawer-body">
    {error&&<div className="form-error" role="alert"><AlertTriangle size={18}/>{error}</div>}
    <fieldset className="type-selector"><legend>Location type</legend>{([['restaurant',Store,'Restaurant'],['dc',Warehouse,'Distribution center'],['supplier',Factory,'Supplier']] as const).map(([type,Icon,label])=><label key={type} className={draft.type===type?'is-selected':''}><input type="radio" name="location-type" checked={draft.type===type} onChange={()=>change({type,weeklyVolume:type==='restaurant'?2800:12000,inventoryDays:type==='restaurant'?2:7})}/><Icon size={19}/><strong>{label}</strong></label>)}</fieldset>
    <div className="form-grid"><label className="field field-full"><span>Location name</span><input value={draft.name} onChange={e=>change({name:e.target.value,duplicateAccepted:false})}/></label><label className="field field-full"><span>Street address</span><input value={draft.address} onChange={e=>change({address:e.target.value,confirmedPoint:'',candidate:null})}/></label><label className="field"><span>City</span><input value={draft.city} onChange={e=>change({city:e.target.value,confirmedPoint:''})}/></label><label className="field"><span>State</span><select value={draft.state} onChange={e=>change({state:e.target.value,confirmedPoint:''})}>{US_STATE_CODES.map(code=><option key={code}>{code}</option>)}</select></label></div>
    <button type="button" className="button secondary wide" onClick={find} disabled={finding}><Navigation size={17}/>{finding?'Looking up address…':'Find on map'}</button>
    {notice&&<p className="placement-notice" role="status">{notice}</p>}{candidates.length>0&&<div className="geocode-candidates"><h3>Confirm an address match</h3>{candidates.map((candidate,i)=><button type="button" key={i} onClick={()=>pick(candidate)}><MapPin size={18}/><span><strong>{candidate.address}</strong><small>{candidate.provider} · {candidate.precision.split('-').join(' ')}</small></span></button>)}</div>}
    <details className="manual-coordinates" open><summary>Coordinates or manual map placement</summary><p>Click the map or enter coordinates, then drag to correct. Position is user input, not a verified company fact.</p><div className="form-grid"><label className="field"><span>Latitude</span><input type="number" step="0.00001" value={draftPoint?.latitude??''} onChange={e=>onPoint({latitude:Number(e.target.value),longitude:draftPoint?.longitude??-84.4})}/></label><label className="field"><span>Longitude</span><input type="number" step="0.00001" value={draftPoint?.longitude??''} onChange={e=>onPoint({latitude:draftPoint?.latitude??33.7,longitude:Number(e.target.value)})}/></label></div></details>
    {draftPoint&&<label className="position-confirmation"><input type="checkbox" checked={draft.confirmedPoint===pointKey(draftPoint)} onChange={e=>change({confirmedPoint:e.target.checked?pointKey(draftPoint):''})}/><span>I reviewed this position: {draftPoint.latitude.toFixed(5)}, {draftPoint.longitude.toFixed(5)}</span></label>}
    <div className="form-grid"><label className="field"><span>{draft.type==='restaurant'?'Weekly demand':'Weekly capacity'} · model units</span><input type="number" min="0" value={draft.weeklyVolume} onChange={e=>change({weeklyVolume:Number(e.target.value)})}/></label><label className="field"><span>Opening inventory days</span><input type="number" min="0" step="0.1" value={draft.inventoryDays} onChange={e=>change({inventoryDays:Number(e.target.value)})}/></label></div>
    <p className="field-help">Volumes start as editable sample estimates. Confirming your values records user input. Configure product-specific policies and connections after creating the location.</p>
    {duplicates.length>0&&<div className="duplicate-warning"><AlertTriangle size={17}/><div><strong>Possible duplicate</strong><p>{duplicates.map(l=>l.name).join(', ')}</p><label><input type="checkbox" checked={draft.duplicateAccepted} onChange={e=>change({duplicateAccepted:e.target.checked})}/>This is a distinct modeled facility</label></div></div>}
  </div><div className="drawer-footer"><button type="button" className="button secondary" onClick={onClose}>Keep draft & close</button><button type="button" className="button primary" disabled={saving} onClick={save}><Check size={17}/>Save location</button></div></aside>;
}
