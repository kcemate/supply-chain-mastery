import React from 'react';
import { toPng } from 'html-to-image';
import {
  Copy,
  Download,
  Focus,
  Home,
  Lock,
  Maximize2,
  Minus,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Unlock,
  ZoomIn,
} from 'lucide-react';
import { shareUrl } from './sceneHash';
import { useOntologyStore } from './ontologyStore';
import type {
  ActionChip,
  AppPlatform,
  DataCard,
  GraphConnector,
  ObjectNode,
  Point,
  RelationshipChip,
  SourcePlane,
  StatusTone,
  TextTarget,
  ZoomTier,
} from './ontologyTypes';

const SCENE_W = 3200;
const SCENE_H = 1800;
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 6.5;
const PRESENTATION_BEATS: ZoomTier[] = ['overview', 'graph', 'detail', 'pullback'];
const SVG_EMBEDDED_STYLES = `
button,input{font:inherit}
.editable-host,.status-host{align-items:stretch;display:flex;height:100%;width:100%}
.editable-input{background:transparent;border:0;border-radius:3px;color:currentColor;height:100%;line-height:1;min-width:0;overflow:hidden;padding:0 .12em;text-overflow:ellipsis;white-space:nowrap;width:100%}
.svg-editable-text,.svg-fixed-text{fill:currentColor;pointer-events:none}.editable-svg-label{cursor:text}.editable-svg-label.is-disabled{cursor:default}.svg-text-hit{fill:transparent}.svg-text-focus{fill:rgba(25,119,243,.06);opacity:0;stroke:rgba(25,119,243,.34);stroke-width:2}.editable-svg-label:focus-visible{outline:none}.editable-svg-label:focus-visible .svg-text-focus{opacity:1}.svg-edit-ghost{opacity:.18}
.align-left{text-align:left}.align-center{text-align:center}.align-right{text-align:right}.is-mono{font-family:"SF Mono","SFMono-Regular",ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.scene-title{color:#000;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;font-size:50px;font-weight:780;letter-spacing:0}
.teaming-title{color:#1d1f27;font-family:"Azeret Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:31px;font-weight:300}.teaming-glyphs{fill:none;pointer-events:none;stroke:#1d1f27;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}.teaming-glyphs .glyph-fill{fill:#1d1f27;stroke:none;opacity:.82}
.top-pill{fill:rgba(255,255,255,.54);stroke:#292b34;stroke-width:1.8}.top-pill.is-plus{fill:rgba(255,255,255,.28);stroke:transparent}
.pill-label{color:#22242c;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:22px;font-weight:430}
.pill-icon{fill:none;stroke:#22242c;stroke-width:1.8}.pill-icon-stroke{fill:none;stroke:#22242c;stroke-linecap:round;stroke-width:1.7}.parenthesis-line{fill:none;stroke:rgba(21,23,28,.18);stroke-width:2}
.slab-top{fill:rgba(255,255,255,.72);stroke:rgba(21,23,28,.42);stroke-width:2}.slab-edge{fill:rgba(255,255,255,.78);stroke:rgba(21,23,28,.42);stroke-width:2}.slab-shadow{fill:rgba(105,113,128,.1)}
.slab-blue .slab-top{fill:rgba(228,243,255,.62)}.slab-purple .slab-top{fill:rgba(237,233,255,.62)}.slab-green .slab-top{fill:rgba(232,241,236,.68)}
.hatch,.edge-hatch{fill:none;stroke:rgba(21,23,28,.16);stroke-width:1.2}.edge-hatch{stroke-width:1}
.platform-title,.source-title{color:#161820;font-family:"Azeret Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:31px;font-weight:300}
.line-art{fill:rgba(255,255,255,.62);stroke:rgba(20,23,29,.62);stroke-linecap:round;stroke-linejoin:round;stroke-width:2}.line-art circle{fill:#5b7cf7;stroke:rgba(20,23,29,.52)}.line-art .thin{stroke-width:1.3}.line-art .no-fill{fill:none}.line-art .blue-stroke{stroke:#358cff}.line-art .purple-stroke{stroke:#9880f0}.line-art .green-fill{fill:#5f8c7d;stroke:#5f8c7d}.line-art .screen-rule{stroke:rgba(20,23,29,.42);stroke-width:1.2}
.motif-accent{fill:#8e7bf4;stroke:rgba(20,23,29,.36)}.motif-cube{fill:rgba(142,123,244,.18);stroke:rgba(20,23,29,.65)}.motif-screen-fill{fill:rgba(255,255,255,.76)}
.app-badge{fill:rgba(255,255,255,.85);stroke:rgba(21,23,28,.38)}.app-badge.is-green{fill:#3f7d63;stroke:#3f7d63}.app-badge.is-purple{fill:#8e7bf4;stroke:#8e7bf4}
.app-badge-label{color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:13px;font-weight:760}.app-badge-label.is-outline-label{color:#333741}
.source-panel-glass{fill:rgba(255,255,255,.7);stroke:rgba(21,23,28,.34);stroke-width:2}.source-tile{fill:#d9eeff;stroke:#9dccf0;stroke-width:2}.source-logic .source-tile{fill:#eeeaff;stroke:#c9bfff}.source-systems .source-tile{fill:#d7e6df;stroke:#a7beb2}
.source-tile-label{color:#222832;font-family:"Azeret Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:21px;font-weight:560}
.connector-bundles path{fill:none;stroke:rgba(21,23,28,.46);stroke-linecap:round;stroke-width:1.8}.connector-bundles path.is-purple{stroke:rgba(142,123,244,.72);stroke-width:2.2}.connector-bundles circle{fill:#1d2029}.connector-bundles circle.is-purple{fill:#8e7bf4}
.central-plane{fill:rgba(255,255,255,.74);stroke:rgba(21,23,28,.42);stroke-width:2}.central-edge{fill:rgba(255,255,255,.82);stroke:rgba(21,23,28,.42);stroke-width:2}.central-shadow{fill:rgba(105,113,128,.11)}
.grid-lines path{fill:none;stroke:rgba(105,113,128,.22);stroke-width:1}.automation-route{fill:none;stroke:rgba(142,123,244,.72);stroke-linecap:round;stroke-linejoin:round;stroke-width:5}
.graph-line{fill:none;stroke:rgba(105,113,128,.46);stroke-dasharray:8 8;stroke-linecap:round;stroke-width:2}.graph-line.is-automation{stroke:rgba(142,123,244,.78);stroke-dasharray:none;stroke-width:3}.graph-line.is-primary{stroke:rgba(25,119,243,.72);stroke-dasharray:none;stroke-width:3}
.node-pad{fill:rgba(255,255,255,.86);stroke:rgba(21,23,28,.18);stroke-width:2}.object-node:focus-visible .node-pad{fill:rgba(232,243,255,.92);stroke:rgba(25,119,243,.58);stroke-width:3}
.node-focus-ring{fill:none;stroke:#1977f3;stroke-width:4;opacity:.42}
.node-icon{fill:rgba(255,255,255,.76);stroke:rgba(21,23,28,.7);stroke-linecap:round;stroke-linejoin:round;stroke-width:2.3}.node-label-back{fill:#1977f3}
.node-label{color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:15px;font-weight:720}
.relationship rect{fill:#8d95a1;opacity:.96}.relationship-label{color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:15px;font-weight:690}
.action-chip rect{fill:#3f7d63}.action-chip.is-automation rect{fill:#8e7bf4}.action-chip.is-neutral rect{fill:#8d95a1}.action-chip-label{color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:11px;font-weight:730}.bolt{fill:#fff;opacity:.9}
.data-card-shell{fill:rgba(255,255,255,.86);stroke:rgba(21,23,28,.56);stroke-width:2}.card-title{color:#22262f;font-family:"Azeret Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:17px;font-weight:650}
.card-field{color:#252a33;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:13px;font-weight:680}.card-value{color:#1c2129;font-size:13px;font-weight:720}
.card-rule,.card-row-rule{stroke:rgba(21,23,28,.18);stroke-width:1.2}.computed-fx{fill:#252a33;font-family:"SF Mono","SFMono-Regular",ui-monospace,Menlo,Consolas,monospace;font-size:11px;font-weight:700}.computed-mark{fill:none;stroke:#ee6b6a;stroke-linecap:round;stroke-linejoin:round;stroke-width:2}
.card-anchor-line{fill:none;stroke:rgba(25,119,243,.45);stroke-linecap:round;stroke-width:4}
.flow-pulse{fill:#1977f3;opacity:.72}.flow-pulse.is-purple{fill:#8e7bf4}.flow-pulse.is-green{fill:#3f7d63}
.status-dot-svg.is-positive{fill:#3f7d63}.status-dot-svg.is-warning{fill:#e67645}.status-dot-svg.is-neutral{fill:#8d95a1}
`;

interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

interface ViewSize {
  w: number;
  h: number;
}

interface SceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useElementSize<T extends HTMLElement>(ref: React.RefObject<T>) {
  const [size, setSize] = React.useState<ViewSize>({ w: 0, h: 0 });

  React.useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function fitRect(size: ViewSize, rect: SceneRect, padding = 80, verticalBias = 0.5): CameraTransform {
  if (!size.w || !size.h) return { x: 0, y: 0, scale: 0.4 };
  const paddedW = rect.w + padding * 2;
  const paddedH = rect.h + padding * 2;
  const scale = clamp(Math.min(size.w / paddedW, size.h / paddedH), MIN_ZOOM, MAX_ZOOM);
  const extraY = size.h - rect.h * scale;
  return {
    x: (size.w - rect.w * scale) / 2 - rect.x * scale,
    y: (extraY > 0 ? extraY * verticalBias : extraY / 2) - rect.y * scale,
    scale,
  };
}

function fitTier(size: ViewSize, tier: ZoomTier, padding: number) {
  return fitRect(size, zoomTierRect(tier), tier === 'overview' ? 0 : padding, tier === 'overview' ? 0 : 0.5);
}

function zoomTierRect(tier: ZoomTier): SceneRect {
  switch (tier) {
    case 'graph':
      return { x: 720, y: 810, w: 1700, h: 520 };
    case 'detail':
      return { x: 565, y: 875, w: 820, h: 440 };
    case 'pullback':
      return { x: 500, y: 360, w: 2200, h: 1050 };
    case 'overview':
    default:
      return { x: 0, y: 0, w: SCENE_W, h: SCENE_H };
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('button,input,textarea,a,[contenteditable="true"]'));
}

function centerOf(node: ObjectNode): Point {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function curvePath(from: Point, to: Point, lift = 0.44) {
  const dy = to.y - from.y;
  const c1 = { x: from.x, y: from.y + dy * lift };
  const c2 = { x: to.x, y: to.y - dy * lift };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

function scenePath(points: Point[]) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

function EditableTextBox({
  value,
  target,
  x,
  y,
  w,
  h,
  className = '',
  align = 'center',
  mono = false,
  disabled = false,
}: {
  value: string;
  target: TextTarget;
  x: number;
  y: number;
  w: number;
  h: number;
  className?: string;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
  disabled?: boolean;
}) {
  const readonly = useOntologyStore((state) => state.readonly);
  const editText = useOntologyStore((state) => state.editText);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => setDraft(value), [value]);

  const startEditing = () => {
    if (!readonly && !disabled) setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) editText(target, draft);
  };

  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const textX = align === 'left' ? x + 2 : align === 'right' ? x + w - 2 : x + w / 2;
  const textY = y + h / 2;
  const groupClass = `editable-svg-label ${readonly || disabled ? 'is-disabled' : ''}`;
  const textClass = `svg-editable-text ${mono ? 'is-mono' : ''} ${className}`;

  return (
    <g
      className={groupClass}
      role={readonly || disabled ? undefined : 'button'}
      tabIndex={readonly || disabled ? undefined : 0}
      aria-label={readonly ? `${value}. Open a copy to edit.` : `Edit ${value}`}
      onClick={(event) => {
        event.stopPropagation();
        startEditing();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (isInteractiveTarget(event.target)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        startEditing();
      }}
    >
      <rect className="svg-text-hit" x={x} y={y} width={w} height={h} rx={3} />
      <rect className="svg-text-focus" x={x} y={y} width={w} height={h} rx={3} />
      <text
        className={`${textClass} ${editing ? 'svg-edit-ghost' : ''}`}
        x={textX}
        y={textY}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        aria-hidden={editing ? 'true' : undefined}
      >
        {value}
      </text>
      {editing && !readonly ? (
        <foreignObject x={x} y={y} width={w} height={h} className="editable-fo">
          <div className="editable-host">
          <input
            className={`editable-input align-${align} ${mono ? 'is-mono' : ''} ${className}`}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                setDraft(value);
                setEditing(false);
              }
            }}
          />
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}

function StatusDot({ status, x, y }: { status: StatusTone; x: number; y: number }) {
  return <circle className={`status-dot-svg is-${status}`} cx={x + 12} cy={y + 12} r={5} aria-hidden="true" />;
}

function TopTeaming() {
  const scene = useOntologyStore((state) => state.scene);
  const pillY = 272;
  let cursor = 940;

  return (
    <g className="depth depth-top">
      <g className="teaming-glyphs" aria-hidden="true">
        <path d="M 1386 216 l 8 -8 l 8 8 l -8 8 Z M 1410 198 l 6 -6 l 6 6 l -6 6 Z M 1418 229 l 4 -4 l 4 4 l -4 4 Z" />
        <path d="M 1400 194 v -8 M 1400 244 v -8 M 1376 220 h -8 M 1432 220 h -8" />
        <g transform="translate(1810 196)">
          <circle cx="8" cy="10" r="5" />
          <path d="M 8 17 v 29 M -2 26 h 20 M 2 46 v -17 M 14 46 v -17" />
          <circle cx="28" cy="10" r="5" />
          <path d="M 28 17 v 29 M 18 26 h 20 M 22 46 v -17 M 34 46 v -17" />
          <circle cx="48" cy="10" r="5" />
          <path d="M 48 17 v 29 M 38 26 h 20 M 42 46 v -17 M 54 46 v -17" />
          <path className="glyph-fill" d="M 6 4 h 4 v 8 h -4 Z M 26 4 h 4 v 8 h -4 Z M 46 4 h 4 v 8 h -4 Z" />
        </g>
      </g>
      <EditableTextBox
        value={scene.teamingTitle}
        target={{ kind: 'teamingTitle' }}
        x={1340}
        y={198}
        w={520}
        h={46}
        className="teaming-title"
      />
      {scene.teamingPills.map((pill) => {
        const width = pill.id === 'plus' ? 44 : pill.label.length > 10 ? 220 : 205;
        const item = (
          <g key={pill.id}>
            <rect className={`top-pill ${pill.id === 'plus' ? 'is-plus' : ''}`} x={cursor} y={pillY} width={width} height={48} rx={24} />
            {pill.icon === 'spark' ? <path className="pill-icon" d={`M ${cursor + 26} 286 l 7 7 l -7 7 l -7 -7 Z M ${cursor + 42} 281 l 4 4 l -4 4 l -4 -4 Z`} /> : null}
            {pill.icon === 'person' ? (
              <g className="pill-icon-stroke" transform={`translate(${cursor + 24} 286)`}>
                <circle cx="8" cy="7" r="6" />
                <path d="M 0 24 c 3 -9 19 -9 22 0" />
              </g>
            ) : null}
            <EditableTextBox
              value={pill.label}
              target={{ kind: 'teamingPill', id: pill.id }}
              x={cursor + (pill.id === 'plus' ? 0 : 28)}
              y={pillY + 4}
              w={pill.id === 'plus' ? width : width - 34}
              h={40}
              className="pill-label"
            />
          </g>
        );
        cursor += width + 14;
        return item;
      })}
      <path className="parenthesis-line" d="M 875 268 c -32 0 -32 60 0 60 M 902 268 c -32 0 -32 60 0 60 M 2350 268 c 32 0 32 60 0 60 M 2377 268 c 32 0 32 60 0 60" />
    </g>
  );
}

function Slab({
  x,
  y,
  w,
  h,
  skew = 64,
  tone = 'white',
  className = '',
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  skew?: number;
  tone?: 'white' | 'blue' | 'purple' | 'green';
  className?: string;
}) {
  const top = `${x} ${y + 56} ${x + w} ${y + 8} ${x + w + skew} ${y + h - 36} ${x + skew} ${y + h}`;
  const edge = `${x + skew} ${y + h} ${x + w + skew} ${y + h - 36} ${x + w + skew} ${y + h - 6} ${x + skew} ${y + h + 30}`;

  return (
    <g className={`slab slab-${tone} ${className}`}>
      <polygon className="slab-shadow" points={edge} />
      <polygon className="slab-top" points={top} />
      <polygon className="slab-edge" points={edge} />
      <path className="hatch" d={`M ${x + skew} ${y + h + 3} h ${w} M ${x + skew + 8} ${y + h + 8} h ${w - 16} M ${x + skew + 16} ${y + h + 13} h ${w - 32}`} />
      <g className="edge-hatch">
        {Array.from({ length: Math.max(8, Math.floor(w / 34)) }, (_, index) => {
          const hx = x + skew + 14 + index * 34;
          return <path key={index} d={`M ${hx} ${y + h + 3} l 13 14`} />;
        })}
      </g>
    </g>
  );
}

function AppMotif({ platform }: { platform: AppPlatform }) {
  const p = platform.x;
  const y = platform.y + 34;

  if (platform.motif === 'analytics') {
    return (
      <g className="line-art" transform="translate(-40 -34)">
        <rect className="motif-screen-fill" x={p + 90} y={y} width={206} height={96} rx={3} />
        <path className="screen-rule" d={`M ${p + 102} ${y + 14} h 176 M ${p + 102} ${y + 80} h 176 M ${p + 102} ${y + 26} v 52`} />
        <polyline className="no-fill blue-stroke" points={`${p + 112},${y + 70} ${p + 152},${y + 44} ${p + 190},${y + 58} ${p + 232},${y + 30} ${p + 270},${y + 22}`} />
        {[112, 152, 190, 232, 270].map((xPos, index) => (
          <circle key={xPos} cx={p + xPos} cy={y + [70, 44, 58, 30, 22][index]} r={6} />
        ))}

        <rect className="motif-screen-fill" x={p + 315} y={y + 8} width={198} height={116} rx={3} />
        <path className="screen-rule" d={`M ${p + 329} ${y + 23} h 148 M ${p + 329} ${y + 101} h 148 M ${p + 486} ${y + 20} v 86`} />
        <path className="no-fill purple-stroke thin" d={`M ${p + 334} ${y + 77} l 7 -42 l 7 58 l 8 -50 l 7 38 l 8 -66 l 8 54 l 7 -34 l 8 45 l 8 -58 l 8 73 l 8 -46 l 8 28 l 8 -39 l 8 26 l 8 -34 l 8 58`} />
        <rect x={p + 477} y={y + 42} width={22} height={13} rx={2} />
        <rect x={p + 477} y={y + 63} width={22} height={13} rx={2} />
        <rect x={p + 477} y={y + 84} width={22} height={13} rx={2} />

        <rect className="motif-screen-fill" x={p + 205} y={y + 62} width={206} height={126} rx={3} />
        <rect x={p + 222} y={y + 82} width={44} height={70} rx={2} />
        <path className="thin" d={`M ${p + 230} ${y + 104} c 20 -32 28 -10 35 -28 M ${p + 230} ${y + 114} c 18 -18 22 8 36 -12 M ${p + 230} ${y + 124} c 16 -8 26 6 36 -6`} />
        <path className="no-fill blue-stroke thin" d={`M ${p + 282} ${y + 100} l 8 32 l 8 -48 l 8 58 l 7 -33 l 8 22 l 8 -52 l 8 45 l 8 -24 l 7 40 l 8 -50 l 8 28 l 8 -20 l 8 30`} />
        <rect x={p + 282} y={y + 150} width={48} height={15} rx={2} />
        <rect x={p + 340} y={y + 150} width={52} height={15} rx={2} />
        <path d={`M ${p + 306} ${y + 188} v 22 M ${p + 274} ${y + 210} h 92`} />
      </g>
    );
  }

  if (platform.motif === 'automations') {
    return (
      <g className="line-art" transform="translate(-40 -34)">
        <rect className="motif-screen-fill" x={p + 75} y={y + 4} width={210} height={116} rx={3} />
        <rect className="motif-screen-fill" x={p + 320} y={y + 4} width={210} height={116} rx={3} />
        <path className="screen-rule" d={`M ${p + 90} ${y + 20} h 180 M ${p + 335} ${y + 20} h 180`} />
        {[0, 1, 2, 3].map((row) => (
          <g key={row}>
            <circle cx={p + 98} cy={y + 38 + row * 20} r={5} />
            <path d={`M ${p + 114} ${y + 38 + row * 20} h 122`} />
            <rect x={p + 246} y={y + 30 + row * 20} width={26} height={15} rx={1.5} />
            <circle cx={p + 342} cy={y + 38 + row * 20} r={5} />
            <path d={`M ${p + 358} ${y + 38 + row * 20} h 118`} />
            <rect x={p + 486} y={y + 30 + row * 20} width={26} height={15} rx={1.5} />
          </g>
        ))}
        {[0, 1, 2, 3].map((col) => (
          <g key={col}>
            <rect className="motif-screen-fill" x={p + 214 + col * 48} y={y + 78} width={44} height={96} rx={2.5} />
            {[0, 1, 2, 3, 4].map((row) => (
              <path key={row} className="thin" d={`M ${p + 224 + col * 48} ${y + 94 + row * 15} h 24`} />
            ))}
          </g>
        ))}
        <g transform={`translate(${p + 52} ${y + 162})`}>
          <rect width="58" height="42" rx="3" />
          <circle cx="17" cy="20" r="9" />
          <path d="M 34 12 h 14 M 34 22 h 14 M 34 32 h 14" />
        </g>
        <g transform={`translate(${p + 125} ${y + 172})`}>
          <rect width="90" height="42" rx="3" />
          {[0, 1, 2, 3].map((node) => (
            <circle key={node} cx={16 + node * 18} cy={node % 2 ? 28 : 14} r="4" />
          ))}
          <path className="thin" d="M 20 16 L 34 27 L 53 15 L 72 28" />
        </g>
        <g transform={`translate(${p + 405} ${y + 162})`}>
          <rect width="84" height="44" rx="3" />
          <circle cx="18" cy="18" r="6" />
          <circle cx="46" cy="13" r="4" />
          <circle cx="68" cy="29" r="5" />
          <path className="thin" d="M 23 18 h 17 M 50 15 l 14 11" />
        </g>
      </g>
    );
  }

  return (
    <g className="line-art" transform="translate(0 -44)">
      <rect className="motif-screen-fill" x={p + 92} y={y + 4} width={200} height={126} rx={3} />
      <rect className="motif-screen-fill" x={p + 320} y={y + 4} width={200} height={126} rx={3} />
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x={p + 112} y={y + 24 + row * 28} width={34} height={16} rx={2} />
          <rect x={p + 160} y={y + 24 + row * 28} width={34} height={16} rx={2} />
          <rect x={p + 208} y={y + 24 + row * 28} width={34} height={16} rx={2} />
        </g>
      ))}
      <path d={`M ${p + 350} ${y + 32} h 118 M ${p + 409} ${y + 32} v 28 M ${p + 374} ${y + 72} h 70 M ${p + 350} ${y + 100} h 118`} />
      <rect className="motif-accent" x={p + 408} y={y + 18} width={32} height={20} rx={2} />
      {[0, 1, 2, 3].map((node) => (
        <rect key={node} x={p + 348 + node * 38} y={y + 92 + (node % 2) * 18} width={30} height={15} rx={1.5} />
      ))}
      <path className="thin" d={`M ${p + 363} ${y + 92} v -20 M ${p + 401} ${y + 110} v -20 M ${p + 439} ${y + 92} v -20 M ${p + 477} ${y + 110} v -20`} />
      <path className="motif-cube" d={`M ${p + 292} ${y + 160} l 34 -20 l 34 20 l -34 22 Z M ${p + 326} ${y + 140} v 42 M ${p + 292} ${y + 160} v 42 l 34 20 l 34 -20 v -42`} />
      <g transform={`translate(${p + 142} ${y + 138})`}>
        <path d="M 0 38 c 0 -18 12 -32 31 -32 h 56 c 19 0 31 14 31 32 v 17 c 0 9 -8 15 -17 10 l -18 -11 h -48 l -18 11 c -9 5 -17 -1 -17 -10 Z" />
        <rect x="34" y="16" width="17" height="14" rx="2" />
        <rect x="67" y="16" width="17" height="14" rx="2" />
        <path className="thin" d="M 20 25 h 24 M 32 13 v 24 M 78 25 h 16" />
      </g>
      <g transform={`translate(${p + 390} ${y + 138})`}>
        <path d="M 0 38 c 0 -18 12 -32 31 -32 h 56 c 19 0 31 14 31 32 v 17 c 0 9 -8 15 -17 10 l -18 -11 h -48 l -18 11 c -9 5 -17 -1 -17 -10 Z" />
        <rect x="34" y="16" width="17" height="14" rx="2" />
        <rect x="67" y="16" width="17" height="14" rx="2" />
        <path className="thin" d="M 20 25 h 24 M 32 13 v 24 M 78 25 h 16" />
      </g>
    </g>
  );
}

function AppPlatformView({ platform, parallax }: { platform: AppPlatform; parallax: Point }) {
  const offsetX = parallax.x * 6;
  const offsetY = parallax.y * -4;

  return (
    <g className="depth depth-app" transform={`translate(${offsetX} ${offsetY})`}>
      <EditableTextBox
        value={platform.title}
        target={{ kind: 'appTitle', id: platform.id }}
        x={platform.x + 18}
        y={platform.y - 70}
        w={platform.w}
        h={52}
        className="platform-title"
      />
      <Slab x={platform.x} y={platform.y + 58} w={platform.w} h={platform.h} tone="white" />
      <AppMotif platform={platform} />
      {platform.badges.map((badge) => (
        <g key={badge.id}>
          <rect
            className={`app-badge is-${badge.tone}`}
            x={platform.x + badge.x}
            y={platform.y + badge.y}
            width={badge.w}
            height={28}
            rx={badge.tone === 'outline' ? 14 : 3}
          />
          <EditableTextBox
            value={badge.label}
            target={{ kind: 'appBadge', platformId: platform.id, id: badge.id }}
            x={platform.x + badge.x + 4}
            y={platform.y + badge.y + 3}
            w={badge.w - 8}
            h={22}
            className={`app-badge-label ${badge.tone === 'outline' ? 'is-outline-label' : ''}`}
          />
        </g>
      ))}
    </g>
  );
}

function SourcePlaneView({ plane, parallax }: { plane: SourcePlane; parallax: Point }) {
  const offsetX = parallax.x * 2.5;
  const offsetY = parallax.y * 2;
  const tileW = (plane.w - 40) / 2;
  const tileH = 52;

  return (
    <g className={`depth depth-source source-${plane.tone}`} transform={`translate(${offsetX} ${offsetY})`}>
      <Slab x={plane.x - 25} y={plane.y - 28} w={plane.w + 25} h={plane.h + 46} tone={plane.tone === 'logic' ? 'purple' : plane.tone === 'systems' ? 'green' : 'blue'} />
      <rect className="source-panel-glass" x={plane.x} y={plane.y} width={plane.w} height={plane.h} rx={4} />
      {plane.tiles.map((tile, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = plane.x + 16 + col * (tileW + 8);
        const y = plane.y + 18 + row * (tileH + 20);
        return (
          <g key={tile.id}>
            <rect className="source-tile" x={x} y={y} width={tileW} height={tileH} rx={2} />
            <EditableTextBox
              value={tile.label}
              target={{ kind: 'sourceTile', sourceId: plane.id, id: tile.id }}
              x={x + 4}
              y={y + 8}
              w={tileW - 8}
              h={tileH - 16}
              className="source-tile-label"
            />
          </g>
        );
      })}
      <EditableTextBox
        value={plane.title}
        target={{ kind: 'sourceTitle', id: plane.id }}
        x={plane.x - 35}
        y={plane.y + plane.h + 50}
        w={plane.w + 90}
        h={56}
        className="source-title"
      />
    </g>
  );
}

function ConnectorBundles() {
  const bundle = ({
    count,
    startX,
    startY,
    startStep,
    endX,
    endY,
    endStep,
    purple = false,
  }: {
    count: number;
    startX: number;
    startY: number;
    startStep: number;
    endX: number;
    endY: number;
    endStep: number;
    purple?: boolean;
  }) => Array.from({ length: count }, (_, index) => ({
    start: { x: startX + index * startStep, y: startY },
    end: { x: endX + index * endStep, y: endY },
    purple,
  }));

  const topLines = [
    ...bundle({ count: 7, startX: 825, startY: 850, startStep: 68, endX: 720, endY: 680, endStep: 62 }),
    ...bundle({ count: 11, startX: 1360, startY: 850, startStep: 43, endX: 1350, endY: 675, endStep: 43, purple: true }),
    ...bundle({ count: 7, startX: 2025, startY: 850, startStep: 62, endX: 1985, endY: 680, endStep: 62 }),
  ];

  const bottomLines = [
    ...bundle({ count: 11, startX: 865, startY: 1282, startStep: 43, endX: 675, endY: 1410, endStep: 34 }),
    ...bundle({ count: 9, startX: 1480, startY: 1282, startStep: 52, endX: 1470, endY: 1410, endStep: 43 }),
    ...bundle({ count: 11, startX: 2028, startY: 1282, startStep: 40, endX: 2118, endY: 1410, endStep: 34 }),
  ];

  const dotAt = (from: Point, to: Point, ratio: number) => ({
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio + (ratio - 0.5) * 24,
  });

  return (
    <g className="connector-bundles" aria-hidden="true">
      {topLines.map(({ start, end, purple }, index) => {
        const dot = dotAt(start, end, 0.55);
        return (
        <g key={`top-${index}`}>
          <path className={purple ? 'is-purple' : ''} d={curvePath(start, end, 0.52)} />
          <circle className={purple ? 'is-purple' : ''} cx={dot.x} cy={dot.y - 8} r={2.3} />
        </g>
        );
      })}
      {bottomLines.map(({ start, end }, index) => {
        const dotA = dotAt(start, end, 0.35);
        const dotB = dotAt(start, end, 0.68);
        return (
        <g key={`bottom-${index}`}>
          <path d={curvePath(start, end, 0.52)} />
          <circle cx={dotA.x} cy={dotA.y + 8} r={2.2} />
          <circle cx={dotB.x} cy={dotB.y + 8} r={2.2} />
        </g>
        );
      })}
    </g>
  );
}

function CentralPlane({ parallax }: { parallax: Point }) {
  const x = 760 + parallax.x * 3;
  const y = 820 + parallax.y * -2;
  const w = 1580;
  const h = 430;
  const skew = 130;
  const clipId = 'central-plane-clip';
  const topPoints = `${x} ${y + 90} ${x + w} ${y + 36} ${x + w + skew} ${y + h - 50} ${x + skew} ${y + h + 12}`;

  return (
    <g className="depth depth-graph">
      <defs>
        <clipPath id={clipId}>
          <polygon points={topPoints} />
        </clipPath>
      </defs>
      <polygon className="central-shadow" points={`${x + skew} ${y + h + 12} ${x + w + skew} ${y + h - 50} ${x + w + skew} ${y + h - 18} ${x + skew} ${y + h + 45}`} />
      <polygon className="central-plane" points={topPoints} />
      <g className="grid-lines" clipPath={`url(#${clipId})`}>
        {Array.from({ length: 28 }, (_, index) => (
          <path key={`h-${index}`} d={`M ${x - 40} ${y + 90 + index * 18} L ${x + w + skew + 50} ${y + 36 + index * 18}`} />
        ))}
        {Array.from({ length: 34 }, (_, index) => (
          <path key={`v-${index}`} d={`M ${x + index * 58} ${y + 48} L ${x + skew + index * 58} ${y + h + 18}`} />
        ))}
      </g>
      <polyline className="automation-route" points="950,1264 1260,1264 1260,1192 1470,1192 1470,1118 1785,1118 1785,1074 2090,1074 2090,1148 2300,1148" />
      <path className="automation-route" d="M 900 1254 L 2290 1254 L 2266 1217" />
      <polygon className="central-edge" points={`${x + skew} ${y + h + 12} ${x + w + skew} ${y + h - 50} ${x + w + skew} ${y + h - 18} ${x + skew} ${y + h + 45}`} />
    </g>
  );
}

function NodeIcon({ node }: { node: ObjectNode }) {
  const cx = node.x + node.w / 2;
  const cy = node.y - 48;
  const blue = '#358cff';
  const green = '#5f8c7d';
  const purple = '#9880f0';

  switch (node.id) {
    case 'upper-left-stack':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.72) translate(${-cx} ${-cy})`}>
          {[0, 1, 2, 3, 4].map((index) => (
            <g key={index} transform={`translate(${cx - 38 + index * 8} ${cy - 28 + index * 8})`}>
              <path fill={index % 2 ? '#d8d8d8' : '#ffffff'} d="M 0 9 l 34 -10 l 30 10 l -34 12 Z" />
              <path fill={index > 2 ? '#202020' : 'none'} stroke="none" d="M 6 12 l 24 -7 l 21 8 l -24 8 Z" />
              <path d="M 0 9 v 10 l 30 12 l 34 -12 v -10 M 30 21 v 10" />
            </g>
          ))}
        </g>
      );
    case 'warehouse-process':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.72) translate(${-cx} ${-cy})`}>
          <path fill="#ffffff" d={`M ${cx - 48} ${cy + 8} l 54 -30 l 58 28 l -54 32 Z`} />
          <path d={`M ${cx - 48} ${cy + 8} v 18 l 58 28 l 54 -32 v -16 M ${cx + 10} ${cy + 38} v 16`} />
          {[0, 1, 2, 3].map((index) => (
            <rect key={index} x={cx - 22 + index * 17} y={cy - 7 + (index % 2) * 9} width={14} height={16} rx={2} fill={index === 1 ? '#d9eeff' : '#ffffff'} />
          ))}
          <path fill="#111820" stroke="none" d={`M ${cx + 4} ${cy - 36} l 14 26 l -22 3 Z`} />
          <path d={`M ${cx - 38} ${cy + 2} h 26 M ${cx + 20} ${cy + 6} h 34`} />
        </g>
      );
    case 'plant':
      return (
        <g className="node-icon">
          <path fill="#ffffff" d={`M ${cx - 34} ${cy - 18} l 34 -20 l 34 20 v 46 h -68 Z`} />
          <path d={`M ${cx - 34} ${cy - 18} l 34 18 l 34 -18 M ${cx} ${cy} v 28 M ${cx - 22} ${cy + 28} v -22 h 16 v 22 M ${cx + 12} ${cy + 28} v -26 h 16 v 26`} />
          <rect x={cx - 45} y={cy + 12} width={18} height={20} rx={2} fill="#d9eeff" />
          <circle cx={cx - 40} cy={cy + 6} r={4.5} fill={blue} stroke="none" />
          <circle cx={cx - 29} cy={cy + 3} r={3} fill={blue} stroke="none" />
        </g>
      );
    case 'warehouse':
      return (
        <g className="node-icon">
          <path fill="#ffffff" d={`M ${cx - 24} ${cy + 14} l 24 -56 l 24 56 Z`} />
          <path fill="#111820" stroke="none" d={`M ${cx - 24} ${cy + 14} l 16 -38 l 10 48 Z`} />
          <path fill="#358cff" stroke="none" d={`M ${cx - 4} ${cy - 39} l 14 15 l -8 23 l -15 -17 Z`} />
          <path fill="#f2c34a" stroke="none" d={`M ${cx + 10} ${cy - 24} l 14 38 l -24 0 Z`} />
          <path d={`M ${cx - 24} ${cy + 14} l 24 -56 l 24 56 Z M ${cx - 8} ${cy - 23} l 18 19 M ${cx + 2} ${cy} l 16 14`} />
        </g>
      );
    case 'staff':
      return (
        <g className="node-icon">
          <g transform={`translate(${cx - 7} ${cy + 18}) scale(0.78)`}>
            <path fill="#ffffff" d="M -40 0 l 28 -17 l 50 22 l -28 18 Z" />
            <path fill="#d7d7d7" d="M -40 0 l 50 23 v 42 l -50 -23 Z" />
            <path fill="#ececec" d="M 10 23 l 28 -18 v 42 l -28 18 Z" />
            <path fill="#111820" stroke="none" d="M -32 13 l 31 14 v 9 l -31 -14 Z" />
            <path d="M -40 0 l 28 -17 l 50 22 l -28 18 Z M -40 0 v 42 l 50 23 l 28 -18 v -42 M 10 23 v 42" />
            <path className="thin" d="M 17 33 l 14 -9 M 17 41 l 14 -9 M 17 49 l 14 -9 M 17 57 l 14 -9" />
            <path fill="#111820" stroke="none" d="M -10 -21 l 10 -6 l 15 7 l -10 6 Z" />
          </g>
        </g>
      );
    case 'supplier':
      return (
        <g className="node-icon">
          <path fill="#ffffff" d={`M ${cx - 38} ${cy + 22} v -45 l 38 -22 l 38 22 v 45 Z`} />
          <path d={`M ${cx - 38} ${cy - 23} l 38 20 l 38 -20 M ${cx} ${cy - 3} v 25`} />
          <rect x={cx - 12} y={cy - 34} width={13} height={13} rx={1.5} fill="#111820" stroke="none" />
          <path d={`M ${cx - 23} ${cy + 22} v -22 h 18 v 22 M ${cx + 12} ${cy + 22} v -24 h 18 v 24`} />
        </g>
      );
    case 'inventory':
      return (
        <g className="node-icon">
          <g transform={`translate(${cx + 15} ${cy - 22}) scale(0.68)`}>
            <path fill="#ffffff" d="M 0 23 l 18 -14 l 28 11 l -18 15 Z" />
            <path fill="#202020" stroke="none" d="M 4 23 l 15 -10 l 20 8 l -15 11 Z" />
            <path fill="#ffffff" d="M 24 32 l 16 -10 l 12 7 l -16 11 Z" />
            <path d="M 0 23 l 18 -14 l 28 11 l -18 15 Z M 0 23 v 18 l 28 14 l 18 -16 v -19 M 28 35 v 20" />
            <path fill="#202020" stroke="none" d="M 31 34 h 6 v 29 h -6 Z M 41 29 h 5 v 25 h -5 Z" />
            <path d="M 7 47 l 9 -5 M 13 50 l 9 -5 M 50 36 l 8 -4" />
          </g>
        </g>
      );
    case 'quality':
      return (
        <g className="node-icon">
          {[
            { x: -42, y: -4 },
            { x: -10, y: -18 },
            { x: 20, y: -2 },
          ].map((box, index) => (
            <g key={index} transform={`translate(${cx + box.x} ${cy + box.y})`}>
              <path fill={index === 1 ? '#d9eeff' : '#ffffff'} d="M 0 16 l 24 -12 l 24 12 l -24 13 Z" />
              <path d="M 0 16 v 28 l 24 13 l 24 -13 v -28 M 24 29 v 28" />
            </g>
          ))}
        </g>
      );
    case 'shipment':
      return (
        <g className="node-icon">
          {[
            { x: -43, y: -25, accent: true },
            { x: -10, y: -20, accent: false },
          ].map((truck, index) => (
            <g key={index} transform={`translate(${cx + truck.x} ${cy + truck.y}) scale(0.78)`}>
              <path fill="#ffffff" d="M 0 22 h 15 l 7 -15 h 31 l 13 12 v 18 h -66 Z" />
              <path d="M 22 7 l 12 15 h 32 M 31 12 h 14 M 7 28 h 23 M 39 28 h 19" />
              <circle cx="14" cy="40" r="5.5" />
              <circle cx="51" cy="40" r="5.5" />
              <circle cx="14" cy="40" r="2" fill="#ffffff" />
              <circle cx="51" cy="40" r="2" fill="#ffffff" />
              {truck.accent ? <rect x="25" y="12" width="13" height="9" rx="1.5" fill="#d9eeff" /> : null}
            </g>
          ))}
        </g>
      );
    case 'dock':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.78) translate(${-cx} ${-cy})`}>
          {[
            { x: -42, y: -14, blue: true },
            { x: -7, y: -25, blue: true },
            { x: 28, y: -9, blue: false },
            { x: -3, y: 8, blue: false },
          ].map((block, index) => (
            <g key={index} transform={`translate(${cx + block.x} ${cy + block.y})`}>
              <path fill="#ffffff" d="M 0 17 l 22 -11 l 24 12 l -23 12 Z" />
              <path fill={block.blue ? '#d9eeff' : '#ffffff'} d="M 7 16 l 14 -7 l 15 8 l -15 8 Z" />
              <path d="M 0 17 v 20 l 23 12 l 23 -13 v -18 M 23 30 v 19" />
            </g>
          ))}
          <path className="blue-stroke" d={`M ${cx - 24} ${cy - 2} l 20 -13 l 27 12 M ${cx - 6} ${cy + 20} l 28 -16`} />
        </g>
      );
    case 'contract':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.72) translate(${-cx} ${-cy})`}>
          {[0, 1, 2, 3].map((index) => (
            <g key={index} transform={`translate(${cx - 46 + index * 16} ${cy - 28 + index * 5})`}>
              <path fill={index === 1 ? '#eef3f1' : '#ffffff'} d="M 0 12 l 15 -8 l 15 8 v 58 l -15 9 l -15 -9 Z" />
              <path d="M 15 4 v 75 M 0 12 l 15 9 l 15 -9 M 6 27 h 17 M 6 40 h 17 M 6 53 h 17" />
              <circle cx="3" cy="74" r="2.5" fill="#202020" stroke="none" />
              <circle cx="27" cy="74" r="2.5" fill="#202020" stroke="none" />
            </g>
          ))}
          <path fill="#111820" stroke="none" d={`M ${cx + 21} ${cy - 39} l 22 15 l -18 10 l -22 -15 Z`} />
          <circle cx={cx + 42} cy={cy - 28} r={4.5} fill={blue} stroke="none" />
        </g>
      );
    case 'model':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.82) translate(${-cx} ${-cy})`}>
          {[0, 1, 2, 3].map((index) => (
            <g key={index} transform={`translate(${cx - 34 + index * 9} ${cy - 18 + index * 5})`}>
              <path fill={index === 2 ? '#eef3f1' : '#ffffff'} d="M 0 11 l 28 -9 l 27 10 l -28 11 Z" />
              <path d="M 0 11 v 13 l 27 11 l 28 -11 v -12 M 27 23 v 12" />
              <path className="thin" d="M 8 12 l 19 -6 M 16 18 l 22 -7" />
            </g>
          ))}
          <path fill="#111820" stroke="none" d={`M ${cx - 8} ${cy - 21} l 18 16 l -22 8 Z`} />
          <circle cx={cx + 32} cy={cy - 2} r={4.5} fill={blue} stroke="none" />
        </g>
      );
    case 'channel':
      return (
        <g className="node-icon" style={{ strokeWidth: 1.8 }} transform={`translate(${cx} ${cy}) scale(0.68) translate(${-cx} ${-cy})`}>
          {[
            { x: -64, y: -42 },
            { x: 4, y: -20 },
          ].map((group, groupIndex) => (
            <g key={groupIndex} transform={`translate(${cx + group.x} ${cy + group.y})`}>
              {[0, 1, 2, 3, 4].map((index) => (
                <g key={index} transform={`translate(${index * 11} ${index % 2 ? 4 : 0})`}>
                  <path fill={index === 1 || index === 3 ? '#eef3f1' : '#ffffff'} d="M 0 8 l 8 -4 l 8 4 v 50 l -8 5 l -8 -5 Z" />
                  <path className="thin" d="M 8 4 v 59 M 0 8 l 8 5 l 8 -5 M 4 27 h 8 M 4 43 h 8" />
                  <circle cx="2" cy="61" r="2" fill="#202020" stroke="none" />
                  <circle cx="14" cy="61" r="2" fill="#202020" stroke="none" />
                </g>
              ))}
            </g>
          ))}
        </g>
      );
    case 'revenue':
      return (
        <g className="node-icon">
          {[0, 1, 2, 3].map((index) => (
            <g key={index} transform={`translate(${cx - 42 + index * 18} ${cy - 20 - index * 5})`}>
              <path fill={index === 3 ? '#d9eeff' : '#ffffff'} d="M 0 10 l 26 -10 l 26 10 l -26 11 Z" />
              <path d="M 0 10 v 16 l 26 11 l 26 -11 v -16" />
            </g>
          ))}
          <path stroke={green} d={`M ${cx - 46} ${cy + 32} h 92`} />
        </g>
      );
    case 'customer-activity':
      return (
        <g className="node-icon" style={{ strokeWidth: 2.1 }} transform={`translate(${cx} ${cy}) scale(0.58) translate(${-cx} ${-cy})`}>
          {[
            { x: -48, y: -2, cut: true },
            { x: -23, y: 18 },
            { x: 5, y: -3 },
            { x: 34, y: 17 },
          ].map((item, index) => (
            <g key={index} transform={`translate(${cx + item.x} ${cy + item.y})`}>
              <path fill="#ffffff" d="M 0 -28 c -10 8 -8 19 2 25 c 9 6 9 16 0 24 h 15 c 9 -11 8 -21 -2 -29 c -8 -7 -8 -14 1 -20 Z" />
              <path d="M 0 -28 c -10 8 -8 19 2 25 c 9 6 9 16 0 24 h 15 c 9 -11 8 -21 -2 -29 c -8 -7 -8 -14 1 -20" />
              <path fill="#111820" stroke="none" d={item.cut ? "M 3 28 l 20 -40 l 24 41 Z" : "M 0 28 l 20 -40 l 27 42 Z"} />
              <path stroke="#ffffff" strokeWidth="3" d="M 20 3 v 15" />
              <circle cx="20" cy="23" r="2.4" fill="#ffffff" stroke="none" />
            </g>
          ))}
        </g>
      );
    case 'schedule-docs':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.62) translate(${-cx} ${-cy})`}>
          {[0, 1, 2].map((index) => (
            <g key={index} transform={`translate(${cx - 32 + index * 25} ${cy - 32 + index * 2})`}>
              <path fill={index === 1 ? '#eef3f1' : '#ffffff'} d="M 0 0 h 24 l 9 9 v 70 h -33 Z" />
              <path d="M 24 0 v 9 h 9 M 7 17 h 15 M 7 31 h 19 M 7 45 h 15 M 7 59 h 19" />
              <circle cx="25" cy="58" r="3.5" fill={purple} stroke="none" />
            </g>
          ))}
        </g>
      );
    case 'forecast-bars':
      return (
        <g className="node-icon" transform={`translate(${cx} ${cy}) scale(0.58) translate(${-cx} ${-cy})`}>
          {[0, 1, 2, 3].map((index) => (
            <g key={index} transform={`translate(${cx - 31 + index * 8} ${cy - 20 + index})`}>
              <path fill={index === 1 ? '#d9eeff' : '#ffffff'} d="M 0 9 l 12 -7 l 13 7 v 56 l -13 8 l -12 -8 Z" />
              <path d="M 12 2 v 71 M 0 9 l 12 8 l 13 -8 M 5 25 h 15 M 5 40 h 15 M 5 55 h 15" />
            </g>
          ))}
          <path stroke={green} d={`M ${cx - 32} ${cy + 43} h 72`} />
        </g>
      );
  }

  switch (node.icon) {
    case 'warehouse':
      return (
        <g className="node-icon">
          <path d={`M ${cx - 42} ${cy + 30} v -44 l 42 -28 l 42 28 v 44 Z`} />
          <path d={`M ${cx - 20} ${cy + 30} v -26 h 40 v 26 M ${cx - 42} ${cy - 14} h 84`} />
        </g>
      );
    case 'customer':
      return (
        <g className="node-icon">
          <path fill="#ffffff" d={`M ${cx - 22} ${cy + 28} c -22 -18 -22 -50 0 -66 c 22 16 22 48 0 66 Z`} />
          <path fill="#ffffff" d={`M ${cx + 18} ${cy + 28} c -22 -18 -22 -50 0 -66 c 22 16 22 48 0 66 Z`} />
          <path d={`M ${cx - 22} ${cy + 28} c -22 -18 -22 -50 0 -66 c 22 16 22 48 0 66 Z M ${cx + 18} ${cy + 28} c -22 -18 -22 -50 0 -66 c 22 16 22 48 0 66 Z`} />
          <circle cx={cx - 2} cy={cy - 5} r={10} fill="#ffffff" />
        </g>
      );
    case 'order':
      return (
        <g className="node-icon">
          <rect x={cx - 34} y={cy - 36} width={68} height={72} rx={5} />
          <path d={`M ${cx - 18} ${cy - 14} h 36 M ${cx - 18} ${cy + 4} h 36 M ${cx - 18} ${cy + 22} h 26`} />
        </g>
      );
    case 'forecast':
      return (
        <g className="node-icon">
          {[-28, 8].map((offset, index) => (
            <g key={offset} transform={`translate(${cx + offset} ${cy - 19})`}>
              <path fill="#72b9ff" d="M 0 8 l 10 -6 l 10 6 l -10 6 Z" />
              <path fill={index === 0 ? '#358cff' : '#4597ff'} d="M 0 8 l 10 6 v 28 l -10 -6 Z" />
              <path fill="#2f86f3" d="M 20 8 l -10 6 v 28 l 10 -6 Z" />
              <path d="M 0 8 l 10 -6 l 10 6 v 28 l -10 6 l -10 -6 Z M 10 14 v 28" />
            </g>
          ))}
        </g>
      );
    case 'revenue':
      return (
        <g className="node-icon">
          <rect x={cx - 40} y={cy - 28} width={80} height={48} rx={5} />
          <path d={`M ${cx - 22} ${cy - 2} h 44 M ${cx - 8} ${cy - 18} v 32 M ${cx + 8} ${cy - 18} v 32`} />
        </g>
      );
    default:
      return (
        <g className="node-icon">
          <ellipse cx={cx} cy={cy} rx={42} ry={28} />
          <path d={`M ${cx - 24} ${cy} h 48 M ${cx} ${cy - 22} v 44`} />
        </g>
      );
  }
}

function ObjectNodeView({ node }: { node: ObjectNode }) {
  const selectNode = useOntologyStore((state) => state.selectNode);
  const selectedNodeId = useOntologyStore((state) => state.scene.selectedNodeId);
  const selected = selectedNodeId === node.id;
  const focusCx = node.x + node.w / 2;
  const focusCy = node.y - 28;

  return (
    <g
      className={`object-node ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Select ${node.label || node.id}`}
      onClick={() => selectNode(node.id)}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectNode(node.id);
      }}
    >
      <ellipse className="node-pad" cx={focusCx} cy={focusCy} rx={node.w * 0.86} ry={node.h * 1.3} />
      <NodeIcon node={node} />
      {node.label ? (
        <>
          <rect className="node-label-back" x={node.x} y={node.y} width={node.w} height={node.h} rx={node.h / 2} />
          <EditableTextBox value={node.label} target={{ kind: 'nodeLabel', id: node.id }} x={node.x + 4} y={node.y + 5} w={node.w - 8} h={node.h - 10} className="node-label" />
        </>
      ) : null}
    </g>
  );
}

function GraphConnectors({ connectors, nodes }: { connectors: GraphConnector[]; nodes: ObjectNode[] }) {
  return (
    <g className="graph-connectors">
      {connectors.map((connector) => {
        const from = nodes.find((node) => node.id === connector.from);
        const to = nodes.find((node) => node.id === connector.to);
        if (!from || !to) return null;
        const start = centerOf(from);
        const end = centerOf(to);
        const path = connector.points?.length ? scenePath(connector.points) : curvePath(start, end, 0.18);
        return <path key={connector.id} className={`graph-line is-${connector.tone}`} d={path} />;
      })}
    </g>
  );
}

function RelationshipView({ relationship }: { relationship: RelationshipChip }) {
  return (
    <g className={`relationship is-${relationship.tone}`}>
      <rect x={relationship.x} y={relationship.y} width={relationship.w} height={relationship.h} rx={relationship.h / 2} />
      <EditableTextBox
        value={relationship.verb}
        target={{ kind: 'relationshipVerb', id: relationship.id }}
        x={relationship.x + 5}
        y={relationship.y + 4}
        w={relationship.w - 10}
        h={relationship.h - 8}
        className="relationship-label"
      />
    </g>
  );
}

function ActionChipView({ chip }: { chip: ActionChip }) {
  const isAutomation = chip.tone === 'automation';
  const labelX = chip.x + (isAutomation ? 21 : 7);
  const labelW = chip.w - (isAutomation ? 25 : 14);

  return (
    <g className={`action-chip is-${chip.tone}`}>
      <rect x={chip.x} y={chip.y} width={chip.w} height={chip.h} rx={chip.h / 2} />
      {isAutomation ? <path className="bolt" d={`M ${chip.x + 12} ${chip.y + 5} l -4 6 h 5 l -3 7 l 9 -10 h -6 l 4 -3 Z`} /> : null}
      <EditableTextBox
        value={chip.label}
        target={{ kind: 'actionChip', id: chip.id }}
        x={labelX}
        y={chip.y + 4}
        w={labelW}
        h={chip.h - 8}
        className="action-chip-label"
      />
    </g>
  );
}

function DataCardView({ card }: { card: DataCard; node?: ObjectNode }) {
  const height = 58 + card.rows.length * 31;
  const fieldX = card.x + 12;
  const statusX = card.x + card.w - 119;
  const valueX = card.x + card.w - 93;

  return (
    <g className="data-card">
      <rect className="data-card-shell" x={card.x} y={card.y} width={card.w} height={height} rx={8} />
      <EditableTextBox value={card.title} target={{ kind: 'cardTitle', id: card.id }} x={card.x + 12} y={card.y + 12} w={card.w - 24} h={28} className="card-title" align="left" />
      <line className="card-rule" x1={card.x} y1={card.y + 48} x2={card.x + card.w} y2={card.y + 48} />
      {card.rows.map((row, index) => {
        const y = card.y + 58 + index * 31;
        return (
          <g key={row.id}>
            <line className="card-row-rule" x1={card.x} y1={y + 25} x2={card.x + card.w} y2={y + 25} />
            <EditableTextBox
              value={row.field}
              target={{ kind: 'cardRowField', cardId: card.id, id: row.id }}
              x={fieldX}
              y={y}
              w={row.computed ? statusX - fieldX - 36 : statusX - fieldX - 14}
              h={24}
              className="card-field"
              align="left"
            />
            {row.computed ? <text className="computed-fx" x={statusX - 34} y={y + 17}>(fx)</text> : null}
            <StatusDot status={row.status} x={statusX} y={y + 2} />
            <text className="svg-fixed-text card-value is-mono" x={valueX + 2} y={y + 12} dominantBaseline="middle">
              {row.value}
            </text>
            {row.computed ? <path className="computed-mark" d={`M ${valueX + 34} ${y + 15} c 8 -12 20 0 0 10 c -20 -10 -8 -22 0 -10`} /> : null}
          </g>
        );
      })}
    </g>
  );
}

function FlowPulses() {
  return (
    <g className="flow-pulses" aria-hidden="true">
      <circle className="flow-pulse is-purple" r="7">
        <animateMotion path="M 950 1264 L 1260 1264 L 1260 1192 L 1470 1192 L 1470 1118 L 1785 1118 L 1785 1074 L 2090 1074 L 2090 1148 L 2300 1148" dur="9s" repeatCount="indefinite" />
      </circle>
      <circle className="flow-pulse is-green" r="6">
        <animateMotion path="M 980 1160 C 1110 1040, 1340 1010, 1580 940" dur="7.5s" begin="-2s" repeatCount="indefinite" />
      </circle>
      <circle className="flow-pulse" r="6">
        <animateMotion path="M 1620 1190 C 1790 1120, 2010 1110, 2240 1190" dur="8.5s" begin="-4s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function ObjectGraph({ parallax, reducedMotion }: { parallax: Point; reducedMotion: boolean }) {
  const scene = useOntologyStore((state) => state.scene);
  void reducedMotion;

  return (
    <g transform={`translate(${parallax.x * 3} ${parallax.y * -2})`}>
      <CentralPlane parallax={{ x: 0, y: 0 }} />
      <GraphConnectors connectors={scene.connectors} nodes={scene.objectNodes} />
      {scene.objectNodes.map((node) => <ObjectNodeView key={node.id} node={node} />)}
      {scene.relationships.map((relationship: RelationshipChip) => <RelationshipView key={relationship.id} relationship={relationship} />)}
      {scene.actionChips.map((chip) => <ActionChipView key={chip.id} chip={chip} />)}
      {scene.dataCards.map((card) => <DataCardView key={card.id} card={card} node={scene.objectNodes.find((node) => node.id === card.nodeId)} />)}
    </g>
  );
}

function SceneSvg({ parallax, reducedMotion }: { parallax: Point; reducedMotion: boolean }) {
  const scene = useOntologyStore((state) => state.scene);

  return (
    <svg className="ontology-svg" width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label="Editable ontology system architecture scene">
      <defs>
        <linearGradient id="top-wash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ece8ff" />
          <stop offset="0.58" stopColor="#f7f5ff" />
          <stop offset="1" stopColor="#f6f8fb" />
        </linearGradient>
      </defs>
      <style>{SVG_EMBEDDED_STYLES}</style>
      <rect width={SCENE_W} height={SCENE_H} fill="#f6f8fb" />
      <rect width={SCENE_W} height={120} fill="#ffffff" />
      <rect y={120} width={SCENE_W} height={470} fill="url(#top-wash)" />
      <EditableTextBox value={scene.title} target={{ kind: 'title' }} x={35} y={32} w={460} h={62} className="scene-title" align="left" />
      <TopTeaming />
      <ConnectorBundles />
      {scene.appPlatforms.map((platform: AppPlatform) => <AppPlatformView key={platform.id} platform={platform} parallax={parallax} />)}
      <ObjectGraph parallax={parallax} reducedMotion={reducedMotion} />
      {scene.sourcePlanes.map((plane: SourcePlane) => <SourcePlaneView key={plane.id} plane={plane} parallax={parallax} />)}
    </svg>
  );
}

function useCameraController(size: ViewSize, reducedMotion: boolean) {
  const scene = useOntologyStore((state) => state.scene);
  const presentation = useOntologyStore((state) => state.presentation);
  const [beat, setBeat] = React.useState(0);
  const [camera, setCamera] = React.useState<CameraTransform>(() => fitTier(size, 'overview', 48));
  const [manual, setManual] = React.useState(false);

  React.useEffect(() => {
    if (!size.w || !size.h || manual || presentation) return;
    setCamera(fitTier(size, scene.zoomTier, scene.zoomTier === 'overview' ? 44 : 90));
  }, [manual, presentation, scene.zoomTier, size]);

  React.useEffect(() => {
    if (!size.w || !size.h) return;
    setCamera(fitTier(size, scene.zoomTier, scene.zoomTier === 'overview' ? 44 : 90));
    setManual(false);
  }, [size.w, size.h]);

  React.useEffect(() => {
    if (!presentation) return undefined;
    setManual(false);
    setBeat(0);
    if (reducedMotion) return undefined;
    const timer = window.setInterval(() => setBeat((current) => (current + 1) % PRESENTATION_BEATS.length), 3200);
    return () => window.clearInterval(timer);
  }, [presentation, reducedMotion]);

  React.useEffect(() => {
    if (!presentation || !size.w || !size.h) return;
    setCamera(fitTier(size, PRESENTATION_BEATS[beat], beat === 0 ? 44 : 86));
  }, [beat, presentation, size]);

  const setPresentationBeat = React.useCallback((nextBeat: number) => {
    setManual(false);
    setBeat(clamp(Math.round(nextBeat), 0, PRESENTATION_BEATS.length - 1));
  }, []);

  return { camera, setCamera, manual, setManual, beat, setPresentationBeat };
}

function ViewportMinimap({ camera, size }: { camera: CameraTransform; size: ViewSize }) {
  if (!size.w || !size.h) return null;

  const viewW = clamp(size.w / camera.scale, 72, SCENE_W);
  const viewH = clamp(size.h / camera.scale, 72, SCENE_H);
  const viewX = clamp(-camera.x / camera.scale, 0, Math.max(0, SCENE_W - viewW));
  const viewY = clamp(-camera.y / camera.scale, 0, Math.max(0, SCENE_H - viewH));

  return (
    <div className="minimap" data-export-hidden="true" aria-hidden="true">
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} focusable="false">
        <rect className="minimap-page" x="0" y="0" width={SCENE_W} height={SCENE_H} rx="34" />
        <path className="minimap-band minimap-apps" d="M 650 570 L 2585 425 L 2705 660 L 770 805 Z" />
        <path className="minimap-band minimap-graph" d="M 760 910 L 2410 856 L 2540 1200 L 890 1265 Z" />
        <rect className="minimap-band minimap-card" x="660" y="955" width="290" height="244" rx="18" />
        <rect className="minimap-band minimap-sources" x="610" y="1390" width="480" height="240" rx="18" />
        <rect className="minimap-band minimap-sources" x="1335" y="1390" width="560" height="240" rx="18" />
        <rect className="minimap-band minimap-sources" x="2170" y="1390" width="480" height="240" rx="18" />
        <rect className="minimap-view" x={viewX} y={viewY} width={viewW} height={viewH} rx="18" />
      </svg>
    </div>
  );
}

function PresentationBeatDots({ beat, onBeat }: { beat: number; onBeat: (beat: number) => void }) {
  return (
    <div className="beat-dots" data-export-hidden="true" aria-hidden="false">
      {PRESENTATION_BEATS.map((tier, index) => (
        <button
          key={tier}
          type="button"
          className={index === beat ? 'active' : ''}
          aria-label={`Presentation beat ${index + 1}: ${tier}`}
          onClick={() => onBeat(index)}
        />
      ))}
    </div>
  );
}

function SceneViewport({ stageRef }: { stageRef: React.MutableRefObject<HTMLDivElement | null> }) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const size = useElementSize(viewportRef);
  const reducedMotion = useReducedMotion();
  const presentation = useOntologyStore((state) => state.presentation);
  const setPresentation = useOntologyStore((state) => state.setPresentation);
  const { camera, setCamera, setManual, beat, setPresentationBeat } = useCameraController(size, reducedMotion);
  const pointerMap = React.useRef(new Map<number, Point>());
  const dragRef = React.useRef<{ id: number; x: number; y: number; camera: CameraTransform } | null>(null);
  const pinchRef = React.useRef<{ distance: number; scale: number; scenePoint: Point } | null>(null);
  const [, setPointer] = React.useState<Point>({ x: 0, y: 0 });

  const zoomAt = React.useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setManual(true);
    setPresentation(false);
    setCamera((current) => {
      const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const sceneX = (px - current.x) / current.scale;
      const sceneY = (py - current.y) / current.scale;
      return { x: px - sceneX * scale, y: py - sceneY * scale, scale };
    });
  }, [setCamera, setManual, setPresentation]);

  const fitHome = React.useCallback(() => {
    setManual(false);
    setPresentation(false);
    setCamera(fitTier(size, 'overview', 44));
  }, [setCamera, setManual, setPresentation, size]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.key === '0') fitHome();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fitHome]);

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = Math.exp(-event.deltaY * 0.0011);
    zoomAt(event.clientX, event.clientY, camera.scale * delta);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (isInteractiveTarget(event.target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setManual(true);
    setPresentation(false);

    if (pointerMap.current.size === 2) {
      const points = [...pointerMap.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const mid = { x: (points[0].x + points[1].x) / 2 - rect.left, y: (points[0].y + points[1].y) / 2 - rect.top };
      pinchRef.current = {
        distance,
        scale: camera.scale,
        scenePoint: { x: (mid.x - camera.x) / camera.scale, y: (mid.y - camera.y) / camera.scale },
      };
      dragRef.current = null;
      return;
    }

    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) {
      setPointer({
        x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2, -1, 1),
        y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2, -1, 1),
      });
    }

    if (pointerMap.current.has(event.pointerId)) pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointerMap.current.size === 2 && pinchRef.current && rect) {
      const points = [...pointerMap.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const mid = { x: (points[0].x + points[1].x) / 2 - rect.left, y: (points[0].y + points[1].y) / 2 - rect.top };
      const scale = clamp(pinchRef.current.scale * (distance / Math.max(1, pinchRef.current.distance)), MIN_ZOOM, MAX_ZOOM);
      setCamera({
        x: mid.x - pinchRef.current.scenePoint.x * scale,
        y: mid.y - pinchRef.current.scenePoint.y * scale,
        scale,
      });
      return;
    }

    if (!dragRef.current || dragRef.current.id !== event.pointerId) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setCamera({ ...dragRef.current.camera, x: dragRef.current.camera.x + dx, y: dragRef.current.camera.y + dy });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerMap.current.delete(event.pointerId);
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
    if (pointerMap.current.size < 2) pinchRef.current = null;
  };

  const parallax = { x: 0, y: 0 };

  return (
    <section
      className={`scene-viewport ${presentation ? 'is-presenting' : ''}`}
      ref={(node: HTMLDivElement | null) => {
        viewportRef.current = node;
        stageRef.current = node;
      }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="scene-frame">
        <div
          className="scene-transform"
          style={{
            width: SCENE_W,
            height: SCENE_H,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transition: presentation && !reducedMotion ? 'transform 1600ms cubic-bezier(.2,.82,.16,1)' : reducedMotion ? 'none' : undefined,
          }}
        >
          <SceneSvg parallax={parallax} reducedMotion={reducedMotion} />
        </div>
      </div>
      <div className="zoom-tools" data-export-hidden="true">
        <button type="button" className="icon-tool" aria-label="Zoom in" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, camera.scale * 1.22)}><ZoomIn size={17} /></button>
        <button type="button" className="icon-tool" aria-label="Zoom out" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, camera.scale / 1.22)}><Minus size={17} /></button>
        <button type="button" className="icon-tool" aria-label="Fit scene" onClick={fitHome}><Home size={17} /></button>
      </div>
      {presentation ? (
        <PresentationBeatDots beat={beat} onBeat={setPresentationBeat} />
      ) : (
        <ViewportMinimap camera={camera} size={size} />
      )}
    </section>
  );
}

function Topbar({ stageRef }: { stageRef: React.RefObject<HTMLDivElement> }) {
  const { scene, readonly, invalidHash, past, future, presentation } = useOntologyStore();
  const undo = useOntologyStore((state) => state.undo);
  const redo = useOntologyStore((state) => state.redo);
  const setZoomTier = useOntologyStore((state) => state.setZoomTier);
  const setPresentation = useOntologyStore((state) => state.setPresentation);
  const openEditableCopy = useOntologyStore((state) => state.openEditableCopy);
  const reset = useOntologyStore((state) => state.reset);
  const [copyState, setCopyState] = React.useState('Copy link');
  const [exportState, setExportState] = React.useState('Export PNG');

  const copyLink = async () => {
    const url = shareUrl(scene);
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('Copied');
    } catch {
      window.prompt('Copy this read-only link', url);
      setCopyState('Copy failed');
    }
    window.setTimeout(() => setCopyState('Copy link'), 1400);
  };

  const exportPng = async () => {
    if (!stageRef.current) return;
    setExportState('Rendering');
    document.body.classList.add('is-exporting');
    try {
      const dataUrl = await toPng(stageRef.current, {
        cacheBust: true,
        pixelRatio: Math.max(2, Math.min(3, window.devicePixelRatio || 2)),
        backgroundColor: '#f6f8fb',
        filter: (node) => !(node instanceof HTMLElement && node.dataset.exportHidden === 'true'),
        fontEmbedCSS: '',
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${scene.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'ontology-system'}.png`;
      link.click();
      setExportState('Saved');
      window.setTimeout(() => setExportState('Export PNG'), 1400);
    } catch {
      setExportState('Export failed');
      window.setTimeout(() => setExportState('Export PNG'), 1800);
    } finally {
      document.body.classList.remove('is-exporting');
    }
  };

  return (
    <header className="ontology-topbar" data-export-hidden="true">
      <div className="brand-block">
        <span className="brand-kicker"><Sparkles size={15} /> Live architecture</span>
        {invalidHash ? <span className="hash-warning">Shared link was invalid, so the default scene opened.</span> : null}
      </div>
      <div className="toolbar">
        {readonly ? (
          <button className="tool-button primary-tool" type="button" onClick={openEditableCopy}>
            <Unlock size={16} /> <span className="button-label">Open a copy to edit</span>
          </button>
        ) : (
          <>
            <button className="icon-tool" type="button" onClick={undo} disabled={!past.length} aria-label="Undo"><RotateCcw size={16} /></button>
            <button className="icon-tool" type="button" onClick={redo} disabled={!future.length} aria-label="Redo"><RotateCw size={16} /></button>
            <button className="icon-tool" type="button" onClick={reset} aria-label="Reset"><Maximize2 size={16} /></button>
          </>
        )}
        <div className="segmented" role="group" aria-label="Zoom beat">
          {(['overview', 'graph', 'detail'] as ZoomTier[]).map((tier) => (
            <button key={tier} type="button" className={scene.zoomTier === tier ? 'active' : ''} onClick={() => setZoomTier(tier)}>
              <Focus size={14} /> <span className="button-label beat-label">{tier}</span>
            </button>
          ))}
        </div>
        <button className="tool-button" type="button" onClick={() => setPresentation(!presentation)} aria-label={presentation ? 'Exit presentation' : 'Start presentation'}>
          {presentation ? <Maximize2 size={16} /> : <Play size={16} />} <span className="button-label">{presentation ? 'Exit' : 'Present'}</span>
        </button>
        <button className="tool-button" type="button" onClick={copyLink} aria-label={copyState}><Copy size={16} /> <span className="button-label">{copyState}</span></button>
        <button className="tool-button dark-tool" type="button" onClick={exportPng} aria-label={exportState}><Download size={16} /> <span className="button-label">{exportState}</span></button>
      </div>
    </header>
  );
}

export function OntologyApp() {
  const readonly = useOntologyStore((state) => state.readonly);
  const presentation = useOntologyStore((state) => state.presentation);
  const setPresentation = useOntologyStore((state) => state.setPresentation);
  const hydrateFromHash = useOntologyStore((state) => state.hydrateFromHash);
  const undo = useOntologyStore((state) => state.undo);
  const redo = useOntologyStore((state) => state.redo);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    window.addEventListener('hashchange', hydrateFromHash);
    return () => window.removeEventListener('hashchange', hydrateFromHash);
  }, [hydrateFromHash]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && presentation) {
        event.preventDefault();
        setPresentation(false);
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [presentation, redo, setPresentation, undo]);

  return (
    <main className={`ontology-shell ${presentation ? 'is-stage-presenting' : ''}`}>
      <Topbar stageRef={stageRef} />
      {readonly ? (
        <div className="readonly-strip" data-export-hidden="true">
          <Lock size={16} /> Read-only shared scene
        </div>
      ) : null}
      <SceneViewport stageRef={stageRef} />
    </main>
  );
}
