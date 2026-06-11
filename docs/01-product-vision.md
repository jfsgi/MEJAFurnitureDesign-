# 01 — Product Vision

## Vision statement

Give professional furniture makers the modeling power of Fusion 360 / SolidWorks without the
CAD learning curve. The user thinks in furniture — legs, aprons, panels, drawers, joinery —
and the software handles the geometry. One tool carries a piece from first idea to marketing
photo to shop floor.

## Who it is for

**Primary persona — Marta, custom furniture maker (1–3 person shop).**
Designs and builds commissioned pieces. Skilled at joinery and material selection; has tried
SketchUp and bounced off Fusion 360. Needs: fast concept-to-quote, client-ready renders,
accurate cut lists. Success metric: a quoted design with renders in under one hour.

**Secondary persona — Dev, production manager (10–25 person shop with CNC).**
Runs repeatable product lines with size variants. Needs: parametric resizing of proven
designs, DXF/STEP for the CNC router, BOM with hardware counts, drawings the bench team can
build from. Success metric: a size variant of an existing design produced — renders, drawings,
DXF — in under fifteen minutes.

## Product pillars

1. **Furniture language, not CAD language.** Every label, tool, and error message uses shop
   vocabulary. No "extrude", "mate", or "constraint" anywhere in the primary UI.
2. **Smart components do the work.** Parts carry their own joinery, scaling, and adaptation
   rules. Resizing a cabinet re-spaces the shelves, resizes the doors, and keeps material
   thicknesses fixed — automatically.
3. **One model, every output.** The same parametric model drives the viewport, the photoreal
   render, the cut list, the drawings, and the CNC files. Nothing is redrawn twice.
4. **The render is the product.** Marketing-grade output is a first-class workflow (the
   Studio), not an export afterthought.
5. **Never lose work, never get stuck.** Continuous autosave, unlimited undo, and no modal
   dead-ends. Any state the user reaches has a visible way back.

## In scope (v1)

- Component-parametric assembly modeling with X/Y/Z parametric scaling
- Curated core component library (~50 components at launch) + private Workshop library
- Joinery system (mortise & tenon, dowel, domino, dado, rabbet, miter, pocket screw, fasteners)
- PBR material library: wood species, finishes, metals, fabrics, stone
- Studio staging with environment presets, HDRI lighting, camera tools
- Server-side path-traced renders up to 8K stills + turntable animations
- Cut list & BOM with board/sheet optimization; CSV/PDF export
- Auto-dimensioned assembly drawings with exploded views; PDF export
- DXF per part, STEP per assembly/part
- Per-project imperial (fractional) or metric units
- Accounts, projects, autosave, version history, view-only share links

## Out of scope (v1) — explicit non-goals

- Sketch/constraint-solver modeling (re-evaluate in phase 3 as a "custom part" editor)
- Real-time multi-user co-editing (phase 3)
- Public component marketplace (phase 3; data model must not preclude it)
- CAM toolpath generation (we export DXF/STEP; the CNC's own CAM consumes them)
- Mobile/tablet authoring (view-only share links must work on mobile)
- Pricing/quoting engine beyond BOM cost roll-up

## Phased roadmap

| Phase | Theme | Key deliverables |
|---|---|---|
| 0 — Foundation (8–10 wks) | Prove the core loop | Viewport, component runtime, 10 components, inspector, parametric scaling, save/load |
| 1 — Design MVP | A real design tool | 50+ components, joinery system, materials, Workshop library, cut list & BOM, design validation |
| 2 — Studio & Documents | The full promise | Render farm + Studio workspace, assembly drawings, DXF/STEP, version history, share links |
| 3 — Growth | Scale & community | Custom part editor, team collaboration, shared/marketplace library, configurator embeds |

## Success criteria for v1

- A new user completes the onboarding template and gets a render in their first session.
- Marta's one-hour quote loop and Dev's fifteen-minute variant loop both pass usability tests.
- Cut list dimensions match the model to the unit precision (1/32″ or 0.5 mm) with zero
  discrepancies across the validation suite.
- Final renders are accepted by a marketing reviewer as catalog-quality at 4K.
