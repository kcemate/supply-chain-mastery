---
colors:
  primary: "#1977f3"
  canvas: "#f6f8fb"
  surface: "#ffffff"
  glass: "rgba(255, 255, 255, 0.68)"
  ink: "#15171c"
  muted: "#697180"
  line: "#d9e0ea"
  accent: "#1977f3"
  positive: "#3f7d63"
  warning: "#e67645"
  neutral: "#8d95a1"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif"
    fontSize: 50px
    lineHeight: 62px
    fontWeight: 780
  ui:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: 15px
    lineHeight: 20px
    fontWeight: 680
  diagram:
    fontFamily: "'Azeret Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: 31px
    lineHeight: 40px
    fontWeight: 560
  mono:
    fontFamily: "'SF Mono', 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace"
    fontSize: 15px
    lineHeight: 24px
    fontWeight: 720
rounded:
  panel: 8px
  control: 999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 24px
  6: 32px
  7: 48px
elevation:
  stage: "0 30px 90px rgba(37, 45, 63, 0.12)"
motion:
  present: "1600ms cubic-bezier(.2,.82,.16,1)"
  quick: "180ms ease"
---

# Ontology System Design

## Product Bar

The app is a live architecture scene, not an image editor. Every label, metric, relationship, and status is structured data rendered as live SVG or DOM text. The default screen should be usable as a projected keynote slide while still supporting direct editing.

## Visual Direction

The stage is near-white, quiet, and spatial. Floating translucent planes create depth, a single blue accent carries focus, and status colors stay calm. Typography and alignment do the heavy lifting; decorative effects stay subordinate to the scene.

## Interaction

Editing is direct: click live text, type, commit. Exploration is fluid: pan, scroll zoom, pinch, minimap, and node focus. Presentation mode uses silent beat dots and eased camera movement; reduced motion removes parallax and motion-only cues.

## Signature Element

The `PLANT OBJECT` card is the jewel: anchored to its node, readable at full zoom, and editable row-by-row with status dots and computed-field markings.

## Guardrails

No vendor marks. No PNG-backed text. No Three.js, WebGL, or canvas renderer for the scene. No backend, accounts, database, or server-side persistence. Shared links are hash-encoded scene documents and open read-only until copied.
