import React from 'react';
import { createRoot } from 'react-dom/client';
import type { SavedScenarioReferenceV2 } from '../src/runArtifacts';
import { useWorkspace } from '../src/useWorkspace';

declare global {
  interface Window {
    workspaceReferenceHarness?: {
      revision: () => number;
      save: (reference: SavedScenarioReferenceV2, expectedRevision?: number) => Promise<boolean>;
      scenarios: () => unknown[];
      error: () => string;
    };
  }
}

function Harness() {
  const workspace = useWorkspace();
  window.workspaceReferenceHarness = {
    revision: () => workspace.document.revision,
    save: workspace.saveScenarioReference,
    scenarios: () => workspace.document.scenarios,
    error: () => workspace.error,
  };
  return <output data-testid="ready">revision {workspace.document.revision}</output>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
