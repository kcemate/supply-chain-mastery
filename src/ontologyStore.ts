import { create } from 'zustand';
import { loadSceneFromHash, replaceHash } from './sceneHash';
import { defaultScene } from './defaultOntologyScene';
import type { SceneDocument, TextTarget, ZoomTier } from './ontologyTypes';

const loaded = typeof window === 'undefined'
  ? { scene: undefined as unknown as SceneDocument, readonly: false, invalidHash: false }
  : loadSceneFromHash();

function cloneScene(scene: SceneDocument): SceneDocument {
  return structuredClone(scene);
}

function syncHash(scene: SceneDocument, readonly: boolean) {
  if (typeof window === 'undefined') return;
  replaceHash(scene, readonly);
}

function mutateText(scene: SceneDocument, target: TextTarget, value: string) {
  const text = value.trim() || 'Untitled';

  switch (target.kind) {
    case 'title':
      scene.title = text;
      break;
    case 'teamingTitle':
      scene.teamingTitle = text;
      break;
    case 'teamingPill':
      scene.teamingPills.find((item) => item.id === target.id)!.label = text;
      break;
    case 'appTitle':
      scene.appPlatforms.find((item) => item.id === target.id)!.title = text;
      break;
    case 'appBadge':
      scene.appPlatforms.find((item) => item.id === target.platformId)!.badges.find((badge) => badge.id === target.id)!.label = text;
      break;
    case 'sourceTitle':
      scene.sourcePlanes.find((item) => item.id === target.id)!.title = text;
      break;
    case 'sourceTile':
      scene.sourcePlanes.find((item) => item.id === target.sourceId)!.tiles.find((tile) => tile.id === target.id)!.label = text;
      break;
    case 'nodeLabel':
      scene.objectNodes.find((item) => item.id === target.id)!.label = text;
      break;
    case 'relationshipVerb':
      scene.relationships.find((item) => item.id === target.id)!.verb = text;
      break;
    case 'actionChip':
      scene.actionChips.find((item) => item.id === target.id)!.label = text;
      break;
    case 'cardTitle':
      scene.dataCards.find((item) => item.id === target.id)!.title = text;
      break;
    case 'cardRowField':
      scene.dataCards.find((item) => item.id === target.cardId)!.rows.find((row) => row.id === target.id)!.field = text;
      break;
  }
}

interface OntologyState {
  scene: SceneDocument;
  readonly: boolean;
  invalidHash: boolean;
  past: SceneDocument[];
  future: SceneDocument[];
  presentation: boolean;
  editText: (target: TextTarget, value: string) => void;
  selectNode: (nodeId: string) => void;
  setZoomTier: (tier: ZoomTier) => void;
  setPresentation: (active: boolean) => void;
  hydrateFromHash: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  openEditableCopy: () => void;
}

export const useOntologyStore = create<OntologyState>((set, get) => ({
  scene: loaded.scene,
  readonly: loaded.readonly,
  invalidHash: loaded.invalidHash,
  past: [],
  future: [],
  presentation: false,

  editText: (target, value) => {
    const state = get();
    if (state.readonly) return;
    const next = cloneScene(state.scene);
    mutateText(next, target, value);
    syncHash(next, false);
    set({ scene: next, past: [...state.past, state.scene], future: [] });
  },

  selectNode: (nodeId) => {
    const state = get();
    const hasCard = state.scene.dataCards.some((card) => card.nodeId === nodeId);
    const zoomTier: ZoomTier = hasCard ? 'detail' : 'graph';
    const next = { ...state.scene, selectedNodeId: nodeId, zoomTier };
    syncHash(next, state.readonly);
    set({ scene: next });
  },

  setZoomTier: (tier) => {
    const state = get();
    const next = { ...state.scene, zoomTier: tier };
    syncHash(next, state.readonly);
    set({ scene: next });
  },

  setPresentation: (active) => set({ presentation: active }),

  hydrateFromHash: () => {
    const next = loadSceneFromHash();
    set({
      scene: next.scene,
      readonly: next.readonly,
      invalidHash: next.invalidHash,
      past: [],
      future: [],
      presentation: false,
    });
  },

  undo: () => {
    const state = get();
    if (state.readonly || !state.past.length) return;
    const previous = state.past[state.past.length - 1];
    syncHash(previous, false);
    set({
      scene: previous,
      past: state.past.slice(0, -1),
      future: [state.scene, ...state.future],
    });
  },

  redo: () => {
    const state = get();
    if (state.readonly || !state.future.length) return;
    const next = state.future[0];
    syncHash(next, false);
    set({
      scene: next,
      past: [...state.past, state.scene],
      future: state.future.slice(1),
    });
  },

  reset: () => {
    const state = get();
    if (state.readonly) return;
    syncHash(defaultScene, false);
    set({ scene: cloneScene(defaultScene), past: [], future: [] });
  },

  openEditableCopy: () => {
    const state = get();
    syncHash(state.scene, false);
    set({ readonly: false, past: [], future: [] });
  },
}));
