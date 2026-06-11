# 04 — Technical Architecture

## Overview

```
┌─────────────────────────── Browser ───────────────────────────┐
│ React 19 + TypeScript (Vite)                                   │
│ ├─ App shell, panels, Inspector (design-system components)     │
│ ├─ Viewport: three.js via react-three-fiber + drei             │
│ ├─ State: zustand (UI) + parametric document store (undoable)  │
│ └─ Web Workers: component evaluation, OpenCascade.js (WASM)    │
└───────────────┬───────────────────────────────────────────────┘
                │ HTTPS / WebSocket
┌───────────────┴───────────────────────────────────────────────┐
│ API (Node + NestJS, TypeScript)                                │
│ ├─ Auth, projects, versions, share links                       │
│ ├─ Library service (core components versioned; Workshop CRUD)  │
│ ├─ Document service (cut list, BOM, drawings → PDF/CSV/DXF)    │
│ └─ Render service (job queue, webhooks, gallery)               │
├─ PostgreSQL (projects, users, library metadata, jobs)          │
├─ S3-compatible object store (documents, renders, thumbnails)   │
└─ Redis + BullMQ (render & export job queues)                   │
                │
┌───────────────┴───────────────────────────────────────────────┐
│ Workers (containerized, autoscaled)                            │
│ ├─ Render workers: headless Blender + Cycles (GPU nodes)       │
│ └─ Geometry workers: OCCT (exact booleans, STEP/DXF, drawings) │
└────────────────────────────────────────────────────────────────┘
```

## Frontend

- **React 19 + TypeScript + Vite.** Design-system components implement the UI standard
  (doc 03) as the single source of tokens (CSS variables, light/dark theme files).
- **Viewport:** three.js via react-three-fiber; WebGL2 baseline, WebGPU when available.
  PBR materials with image-based lighting so Design-workspace previews approximate the farm
  output. Screen-space outlines for selection/hover per UI standard §4.2.
- **Coordinate convention:** engine is Y-up (three.js); a single root transform maps to the
  user-facing Z-up, W/D/H convention. No other code converts axes ad hoc.
- **Parametric document store:** the model is a serializable JSON document (see Data model).
  All edits go through a command layer producing inverse operations → unlimited undo and a
  clean autosave/versioning stream. UI state (panels, camera) is separate and not undoable.
- **Evaluation in Web Workers:** component recipes evaluate off the main thread; results
  (meshes + metadata) transfer back as typed arrays. Budget: typical assembly re-evaluation
  < 100 ms (UI standard §7).
- **OpenCascade.js (WASM)** in a worker for client-side exact ops where needed (joinery
  booleans, edge profiles). Heavy/batch geometry (full-assembly STEP, drawing generation)
  runs on server OCCT workers with the same recipe interpreter to guarantee identical
  results.

## Parametric engine

- A **component** is a versioned *recipe*: typed parameters + a deterministic geometry
  generator + anchors + scaling rules + joinery interfaces (full schema in doc 05).
- A **project document** is a tree of component instances with parameter bindings
  (literals or expressions), joints between instances, materials, and Global Parameters.
- **Evaluation** is a dependency-ordered pass: expressions resolve → each instance's
  generator produces parts → joints apply boolean modifications to both mating parts →
  validation rules emit Design Check findings. Pure-functional and deterministic: same
  document + same library versions = identical geometry on client and server.
- **Expressions:** a small, sandboxed unit-aware language (`W/2 - 10mm`,
  `CounterHeight - 38mm`). No general scripting in v1.

## Rendering pipeline (Studio)

1. Client submits a render job: document version ID + Studio scene (environment, cameras,
   lights, resolution, still/turntable).
2. Render service enqueues to BullMQ; a render worker picks it up.
3. Worker evaluates the document server-side, exports glTF + a material map keyed to a
   curated **Blender material library** (each app material has a hand-built Cycles
   counterpart — wood shaders with grain direction, finishes, metals, fabrics).
4. A Blender Python script assembles the scene (environment HDRI, cameras, DOF) and renders
   with Cycles on GPU. Stills up to 8K (PNG/JPEG/EXR); turntables as MP4.
5. Outputs upload to S3; client gets WebSocket progress and a completion notification;
   results appear in the project Gallery.

Studio's in-browser preview uses a progressive ray-traced preview (three-gpu-pathtracer)
with the same HDRIs and material parameters, so what the user lights is what the farm
renders.

## Documents pipeline

- **Cut list / BOM:** computed client-side from the evaluated model (instant, live);
  CSV/PDF export rendered server-side for consistent typography. Sheet/board optimization
  runs as a worker job (guillotine/nesting heuristics).
- **Assembly drawings:** server OCCT generates hidden-line-removed orthographic and exploded
  views; a layout service applies auto-dimensioning rules and part balloons; output PDF.
- **DXF:** per-part 2D profiles with joinery features on standard layers (OUTLINE, POCKET,
  DRILL, ENGRAVE). **STEP:** AP214 per part or assembly, from the same OCCT evaluation.

## Data model (PostgreSQL + S3)

- `users`, `orgs` (orgs dormant until phase 3)
- `projects` → `document_versions` (append-only JSON documents; autosave compaction)
- `library_components` (core, semver-versioned, immutable per version) and
  `workshop_components` (per-user, same schema)
- `materials` (PBR definition + Cycles mapping + thumbnail)
- `render_jobs`, `export_jobs` (status, params, output object keys)
- `share_links` (capability tokens, view-only)

Documents pin the library versions they were built with; opening a project with newer
library versions prompts a reviewed upgrade, never a silent change.

## Cross-cutting

- **Autosave** every model-changing command batch (debounced 2 s) via WebSocket.
- **AuthN/AuthZ:** email + OAuth (Google/Apple); project-scoped ACLs ready for teams.
- **Telemetry:** anonymized command-level usage to validate the UX budgets in UI standard §7.
- **Testing:** golden-file tests for the recipe interpreter (client/server parity), visual
  regression for the design system, contrast checks in CI (UI standard §12), and a
  validation suite asserting cut-list dimensions match evaluated geometry exactly.
