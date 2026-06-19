export type StatusTone = 'positive' | 'warning' | 'neutral';

export type ZoomTier = 'overview' | 'graph' | 'detail' | 'pullback';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface ScenePill {
  id: string;
  label: string;
  icon?: 'spark' | 'person' | 'plus';
}

export interface AppBadge {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  tone: 'green' | 'purple' | 'outline';
}

export interface AppPlatform {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  motif: 'analytics' | 'automations' | 'products';
  badges: AppBadge[];
}

export interface SourceTile {
  id: string;
  label: string;
}

export interface SourcePlane {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'data' | 'logic' | 'systems';
  tiles: SourceTile[];
}

export interface ObjectNode {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  icon: 'plant' | 'warehouse' | 'customer' | 'order' | 'forecast' | 'line' | 'equipment' | 'material' | 'revenue' | 'model';
  accent: string;
}

export interface RelationshipChip {
  id: string;
  verb: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'neutral' | 'action' | 'automation';
}

export interface ActionChip {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'action' | 'automation' | 'neutral';
}

export interface GraphConnector {
  id: string;
  from: string;
  to: string;
  points?: Point[];
  tone: 'primary' | 'automation' | 'soft';
}

export interface DataCardRow {
  id: string;
  field: string;
  value: string;
  status: StatusTone;
  computed?: boolean;
}

export interface DataCard {
  id: string;
  nodeId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  rows: DataCardRow[];
}

export interface SceneDocument {
  version: 1;
  title: string;
  teamingTitle: string;
  teamingPills: ScenePill[];
  appPlatforms: AppPlatform[];
  sourcePlanes: SourcePlane[];
  objectNodes: ObjectNode[];
  relationships: RelationshipChip[];
  actionChips: ActionChip[];
  connectors: GraphConnector[];
  dataCards: DataCard[];
  selectedNodeId: string;
  zoomTier: ZoomTier;
}

export type TextTarget =
  | { kind: 'title' }
  | { kind: 'teamingTitle' }
  | { kind: 'teamingPill'; id: string }
  | { kind: 'appTitle'; id: string }
  | { kind: 'appBadge'; platformId: string; id: string }
  | { kind: 'sourceTitle'; id: string }
  | { kind: 'sourceTile'; sourceId: string; id: string }
  | { kind: 'nodeLabel'; id: string }
  | { kind: 'relationshipVerb'; id: string }
  | { kind: 'actionChip'; id: string }
  | { kind: 'cardTitle'; id: string }
  | { kind: 'cardRowField'; cardId: string; id: string };
