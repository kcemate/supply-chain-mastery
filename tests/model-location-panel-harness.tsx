import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ModelLocationPanel, type ModelLocationSaveRequest, type ModelLocationSaveResult } from '../src/ModelLocationPanel';
import { initialLanes, initialLocations } from '../src/flywayData';
import { defaultEngineDefaults } from '../src/flywayEngine';

declare global { interface Window { __modelPanelSave?: ModelLocationSaveRequest; __modelPanelAttempts?: number } }

function Harness() {
  const [location, setLocation] = useState(initialLocations[0]);
  const [lanes, setLanes] = useState(initialLanes);
  const [revision, setRevision] = useState(7);
  const readOnly = new URL(window.location.href).searchParams.get('readonly') === '1';
  const onSave = async (request: ModelLocationSaveRequest): Promise<ModelLocationSaveResult> => {
    window.__modelPanelSave = request;
    window.__modelPanelAttempts = (window.__modelPanelAttempts || 0) + 1;
    if (window.__modelPanelAttempts === 1) return { ok: false, kind: 'storage', message: 'Storage is temporarily unavailable. Draft retained.' };
    if (window.__modelPanelAttempts === 2) return { ok: false, kind: 'revision-conflict', message: 'A newer workspace revision exists. Draft retained.', currentRevision: 8 };
    const nextRevision = revision + 1;
    setLocation(request.location);
    setLanes((current) => [...current.filter((lane) => !request.laneChanges.removals.includes(lane.id) && !request.laneChanges.updates.some((next) => next.id === lane.id)), ...request.laneChanges.updates, ...request.laneChanges.additions]);
    setRevision(nextRevision);
    return { ok: true, revision: nextRevision };
  };
  return <ModelLocationPanel open location={location} locations={initialLocations} lanes={lanes} revision={revision} defaults={defaultEngineDefaults} readOnly={readOnly} onClose={() => undefined} onSave={onSave} />;
}

createRoot(document.getElementById('root')!).render(<Harness />);
