# Supply Chain Mastery Ontology System

A fully client-side React + TypeScript scene editor that rebuilds the supplied ontology architecture diagram as live SVG/DOM data. The reference PNG is not rendered in the app; every label, chip, metric, source tile, relationship verb, object name, and data-card field is editable structured scene data.

## What It Does

- Renders a no-brand, isometric SVG architecture scene with live vector text.
- Supports smooth pan, scroll zoom, touch pinch, pointer parallax, and guided presentation beats.
- Provides inline text editing, undo/redo, status-dot cycling, and a typed scene store.
- Encodes the compressed scene into the URL hash for read-only share links and editable copies.
- Exports the current framed scene as a retina PNG.

## Local Development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Project Layout

- `src/` contains the Vite/React ontology editor.
- `backend/` contains the optional progress-sync API.
- `scripts/`, `audio/`, `docs/`, and the PDFs contain the Supply Chain Mastery course/source content.
- `build/` contains project utility scripts.
- `tasks/` keeps working notes and review records; generated screenshots are ignored by Git.

Copy `config.example.js` to `config.js` for local frontend API settings.

## Verification

```bash
npm run verify
```

Smoke artifacts are saved under `tasks/ontology-scene-*.png`.
