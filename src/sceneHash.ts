import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { defaultScene } from './defaultOntologyScene';
import type {
  ActionChip,
  AppBadge,
  AppPlatform,
  DataCard,
  DataCardRow,
  GraphConnector,
  ObjectNode,
  RelationshipChip,
  SceneDocument,
  ScenePill,
  SourcePlane,
  SourceTile,
  ZoomTier,
} from './ontologyTypes';

const HASH_KEY = 'scene';
const READONLY_KEY = 'readonly';
const zoomTiers = ['overview', 'graph', 'detail', 'pullback'] as const satisfies readonly ZoomTier[];
const pillIcons = ['spark', 'person', 'plus'] as const;
const badgeTones = ['green', 'purple', 'outline'] as const;
const platformMotifs = ['analytics', 'automations', 'products'] as const;
const sourceTones = ['data', 'logic', 'systems'] as const;
const nodeIcons = ['plant', 'warehouse', 'customer', 'order', 'forecast', 'line', 'equipment', 'material', 'revenue', 'model'] as const;
const relationshipTones = ['neutral', 'action', 'automation'] as const;
const actionTones = ['action', 'automation', 'neutral'] as const;
const connectorTones = ['primary', 'automation', 'soft'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function byId<T extends { id: string }>(
  defaults: T[],
  incoming: unknown,
  normalize: (base: T, patch: Record<string, unknown>) => T,
) {
  const patches = new Map<string, Record<string, unknown>>();
  if (Array.isArray(incoming)) {
    incoming.forEach((item) => {
      if (isRecord(item) && typeof item.id === 'string') patches.set(item.id, item);
    });
  }
  return defaults.map((base) => normalize(base, patches.get(base.id) ?? {}));
}

function normalizeBadge(base: AppBadge, patch: Record<string, unknown>): AppBadge {
  return {
    ...base,
    label: text(patch.label, base.label),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    tone: oneOf(patch.tone, badgeTones, base.tone),
  };
}

function normalizeScene(input: unknown): SceneDocument {
  const scene = structuredClone(defaultScene);
  if (!isRecord(input)) return scene;

  scene.title = text(input.title, scene.title);
  scene.teamingTitle = text(input.teamingTitle, scene.teamingTitle);
  scene.selectedNodeId = text(input.selectedNodeId, scene.selectedNodeId);
  scene.zoomTier = oneOf(input.zoomTier, zoomTiers, scene.zoomTier);

  scene.teamingPills = byId<ScenePill>(defaultScene.teamingPills, input.teamingPills, (base, patch) => ({
    ...base,
    label: text(patch.label, base.label),
    icon: oneOf(patch.icon, pillIcons, base.icon ?? 'spark'),
  }));

  scene.appPlatforms = byId<AppPlatform>(defaultScene.appPlatforms, input.appPlatforms, (base, patch) => ({
    ...base,
    title: text(patch.title, base.title),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    h: finite(patch.h, base.h),
    accent: text(patch.accent, base.accent),
    motif: oneOf(patch.motif, platformMotifs, base.motif),
    badges: byId(base.badges, patch.badges, normalizeBadge),
  }));

  scene.sourcePlanes = byId<SourcePlane>(defaultScene.sourcePlanes, input.sourcePlanes, (base, patch) => ({
    ...base,
    title: text(patch.title, base.title),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    h: finite(patch.h, base.h),
    tone: oneOf(patch.tone, sourceTones, base.tone),
    tiles: byId<SourceTile>(base.tiles, patch.tiles, (tile, tilePatch) => ({
      ...tile,
      label: text(tilePatch.label, tile.label),
    })),
  }));

  scene.objectNodes = byId<ObjectNode>(defaultScene.objectNodes, input.objectNodes, (base, patch) => ({
    ...base,
    label: text(patch.label, base.label),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    h: finite(patch.h, base.h),
    icon: oneOf(patch.icon, nodeIcons, base.icon),
    accent: text(patch.accent, base.accent),
  }));

  if (!scene.objectNodes.some((node) => node.id === scene.selectedNodeId)) {
    scene.selectedNodeId = defaultScene.selectedNodeId;
  }

  scene.relationships = byId<RelationshipChip>(defaultScene.relationships, input.relationships, (base, patch) => ({
    ...base,
    verb: text(patch.verb, base.verb),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    h: finite(patch.h, base.h),
    tone: oneOf(patch.tone, relationshipTones, base.tone),
  }));

  scene.actionChips = byId<ActionChip>(defaultScene.actionChips, input.actionChips, (base, patch) => ({
    ...base,
    label: text(patch.label, base.label),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    h: finite(patch.h, base.h),
    tone: oneOf(patch.tone, actionTones, base.tone),
  }));

  scene.connectors = byId<GraphConnector>(defaultScene.connectors, input.connectors, (base, patch) => ({
    ...base,
    from: text(patch.from, base.from),
    to: text(patch.to, base.to),
    tone: oneOf(patch.tone, connectorTones, base.tone),
  }));

  scene.dataCards = byId<DataCard>(defaultScene.dataCards, input.dataCards, (base, patch) => ({
    ...base,
    nodeId: text(patch.nodeId, base.nodeId),
    title: text(patch.title, base.title),
    x: finite(patch.x, base.x),
    y: finite(patch.y, base.y),
    w: finite(patch.w, base.w),
    rows: byId<DataCardRow>(base.rows, patch.rows, (row, rowPatch) => ({
      ...row,
      field: text(rowPatch.field, row.field),
      value: row.value,
      status: row.status,
      computed: row.computed,
    })),
  }));

  return scene;
}

export function encodeSceneHash(scene: SceneDocument, readonly: boolean) {
  const packed = compressToEncodedURIComponent(JSON.stringify({ version: 1, scene }));
  const params = new URLSearchParams();
  params.set(HASH_KEY, packed);
  if (readonly) params.set(READONLY_KEY, '1');
  return params.toString();
}

export function shareUrl(scene: SceneDocument) {
  return `${window.location.origin}${window.location.pathname}#${encodeSceneHash(scene, true)}`;
}

export function loadSceneFromHash(): { scene: SceneDocument; readonly: boolean; invalidHash: boolean } {
  const rawHash = window.location.hash.replace(/^#/, '');
  if (!rawHash) return { scene: defaultScene, readonly: false, invalidHash: false };

  try {
    const params = new URLSearchParams(rawHash);
    const packed = params.get(HASH_KEY);
    if (!packed || packed.length > 12000) {
      return { scene: defaultScene, readonly: false, invalidHash: true };
    }

    const json = decompressFromEncodedURIComponent(packed);
    if (!json) return { scene: defaultScene, readonly: false, invalidHash: true };

    const parsed = JSON.parse(json) as { version?: number; scene?: SceneDocument };
    if (parsed.version !== 1 || parsed.scene?.version !== 1) {
      return { scene: defaultScene, readonly: false, invalidHash: true };
    }

    return {
      scene: normalizeScene(parsed.scene),
      readonly: params.get(READONLY_KEY) === '1',
      invalidHash: false,
    };
  } catch {
    return { scene: defaultScene, readonly: false, invalidHash: true };
  }
}

export function replaceHash(scene: SceneDocument, readonly: boolean) {
  const next = `${window.location.pathname}#${encodeSceneHash(scene, readonly)}`;
  window.history.replaceState(null, '', next);
}
