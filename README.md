# Supply Chain Mastery

Supply Chain Mastery is a React + TypeScript learning app for exploring supply-chain concepts through an editable ontology scene, guided content, and optional progress sync.

The app rebuilds the supplied architecture diagram as structured SVG/DOM data instead of rendering a static reference image. Every label, chip, metric, source tile, relationship verb, object name, and data-card field can be edited as live scene data.

## What It Demonstrates

- Product thinking for a complex knowledge domain: supply chain, ontology design, and guided learning.
- A polished local-first interface with pan, zoom, touch gestures, inline editing, undo/redo, and export.
- Structured state management for shareable scenes, including compressed URL-hash snapshots.
- Practical frontend engineering with React, TypeScript, Zustand, Vite, SVG, and browser-based smoke tests.
- Optional backend work for account/progress sync without making the frontend depend on a server.

## Product Capabilities

- Renders a no-brand, isometric SVG architecture scene with live vector text.
- Supports smooth pan, scroll zoom, touch pinch, pointer parallax, and guided presentation beats.
- Provides inline text editing, undo/redo, status-dot cycling, and a typed scene store.
- Encodes the compressed scene into the URL hash for read-only share links and editable copies.
- Exports the current framed scene as a retina PNG.
- Includes course/source content, audio assets, and research notes used to shape the learning experience.

## Stack

| Area | Tools |
| --- | --- |
| Frontend | React 18, TypeScript, Vite |
| State and scene data | Zustand, structured TypeScript models, URL-hash compression |
| Visual layer | SVG, DOM overlays, html-to-image export |
| Verification | TypeScript build, Playwright smoke test, design lint |
| Optional backend | Node/Express progress-sync API |

## Local Development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

Copy `config.example.js` to `config.js` for local frontend API settings when testing against a backend.

## Verification

```bash
npm run verify
```

This runs the production build and browser smoke test. Smoke artifacts are saved under `tasks/ontology-scene-*.png`.

## Project Layout

- `src/` contains the Vite/React ontology editor.
- `backend/` contains the optional progress-sync API.
- `scripts/`, `audio/`, `docs/`, and the PDFs contain the Supply Chain Mastery course/source content.
- `build/` contains project utility scripts.
- `tasks/` keeps working notes and review records; generated screenshots are ignored by Git.
