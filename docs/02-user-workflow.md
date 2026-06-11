# 02 — User Workflow

The product is organized around three workspaces — **Design**, **Studio**, **Documents** —
switched from a single segmented control in the top bar. All three read the same live
parametric model; there is no export/import between them. The end-to-end workflow has seven
stages.

```
 Start → Build → Detail → Validate │ Stage → Render │ Document → Share
 └──────────── Design ────────────┘ └─── Studio ───┘ └── Documents ──┘
```

## Stage 1 — Start

- **New project** opens a template gallery first (tables, cabinets, seating, shelving, beds,
  blank). Templates are full parametric designs, not pictures: pick "Dining Table", get an
  editable table.
- Project setup asks exactly three things: project name, units (imperial fractional /
  metric), default material. Everything else has defaults and is changeable later.
- First-run users get a 60-second interactive tour on a template (see UI standard §10).

## Stage 2 — Build

The core loop of the Design workspace:

1. **Browse or search the Library** (left panel): curated core categories — Legs, Panels &
   Tops, Aprons & Stretchers, Carcasses, Drawers, Doors, Shelving, Hardware — plus the
   user's private **Workshop** tab of saved parts and sub-assemblies.
2. **Drag a component into the viewport.** While dragging, compatible **anchor points** on
   existing parts glow; releasing near one snaps and aligns the part and proposes a joint
   (e.g., dropping a leg on a tabletop corner proposes an apron-and-leg arrangement).
3. **Configure in the Inspector** (right panel): dimensions, counts, materials, options.
   Basic parameters (W/D/H, material) are always visible; advanced ones (joinery offsets,
   tolerances, grain direction) are collapsed under "Advanced".
4. **Scale parametrically.** Selecting the whole assembly (or any sub-assembly) shows W/D/H
   fields and a 3-axis scale gizmo. Changing any axis re-evaluates the model: components
   stretch, repeat, or stay fixed according to their scaling rules (see component standard
   §4). Example: widening a bookcase stretches shelves and top, re-spaces shelf pins, adds a
   center support when span exceeds its sag limit, and never changes board thickness.
5. **Use Global Parameters** (project panel) for named driving values — `CounterHeight`,
   `RevealGap` — that component parameters can reference in expressions (`H = CounterHeight - 38mm`).

## Stage 3 — Detail

- **Joinery:** selecting two touching parts (or clicking a proposed joint badge) opens the
  joint picker — mortise & tenon, domino, dowel, dado, rabbet, miter, pocket screw,
  fasteners. The joint modifies both parts' geometry and adds any hardware to the BOM.
- **Edge treatment:** roundovers, chamfers, profiles applied per edge or per part.
- **Materials:** drag a material from the material library onto a part or assign in the
  Inspector. Wood materials carry species, grain direction, and finish; the viewport preview
  uses the same PBR definitions the render farm uses.

## Stage 4 — Validate

A **Design Check** panel (always reachable, runs continuously, never blocks editing) flags:

- Part intersections / unintentional overlaps
- Unsupported spans beyond material sag limits
- Joinery conflicts (tenon too long for mortised part, screw breakout)
- Hardware clearance violations (drawer slide travel, hinge swing)
- Parts thinner than minimum machinable thickness
- Grain direction warnings on structural parts

Each finding zooms to the issue, explains it in shop language, and offers a one-click fix
where one exists. Findings are warnings, not locks — the maker decides.

## Stage 5 — Stage (Studio workspace)

The Studio is a separate dark-themed workspace (color accuracy; see UI standard §4.3):

- **Environments:** preset scenes — Photo Studio (seamless backdrop), Living Room, Dining
  Room, Workshop, Outdoor Patio — each with curated HDRI lighting and floor materials.
- **Lighting:** HDRI presets with intensity/rotation; optional extra key/fill lights with
  simple "softbox" controls. No raw light-parameter dumps.
- **Cameras:** preset angles (hero ¾, front, detail, top), focal length, depth of field with
  click-to-focus, saved camera list per project.
- **Preview:** the viewport shows a fast progressive ray-traced preview so lighting decisions
  are made against truthful feedback.

## Stage 6 — Render

- **Render queue:** pick saved cameras, resolution (up to 8K stills), still or turntable
  animation, and submit. Jobs run on the server-side path-tracing farm (headless Blender
  Cycles).
- The user keeps working while jobs render; progress shows in a queue tray, completion
  notifies in-app and by email. Outputs land in the project's **Gallery** (PNG/JPEG/EXR,
  MP4 turntables) for download or direct share link.

## Stage 7 — Document (Documents workspace)

All documents regenerate live from the current model:

- **Cut list & BOM:** every part with final dimensions in project units, material, grain,
  quantity; board-foot and sheet-good optimization layouts; hardware roll-up with counts;
  optional cost columns. Export CSV / PDF.
- **Assembly drawings:** auto-dimensioned orthographic views per sub-assembly, exploded
  isometric with step numbering and part balloons keyed to the cut list. Export PDF.
- **CNC / interop:** DXF per flat part (outline + joinery features on layers), STEP per part
  or full assembly.

## Share & iterate

- **Versions:** named snapshots plus continuous autosave history; any version can be
  restored or branched ("Walnut variant").
- **Share links:** view-only 3D link for clients (works on mobile), with optional gallery of
  renders. No account required to view.
- **Save to Workshop:** any part or sub-assembly can be saved to the private Workshop
  library with its parameters and joinery intact, becoming a reusable component.
