# 05 — Parametric Component Standard

Every component — core library and user Workshop alike — conforms to this standard. It is
what makes assemblies scale intelligently on X/Y/Z and lets parts cooperate (snapping,
joinery, BOM) without the user managing geometry.

## 1. Component anatomy

```jsonc
{
  "id": "core/legs/tapered-leg",
  "version": "1.2.0",                  // semver; published versions are immutable
  "category": "Legs",
  "name": "Tapered leg",
  "tags": ["table", "mid-century"],
  "parameters": { ... },               // §2
  "anchors": [ ... ],                  // §3
  "scaling": { ... },                  // §4
  "generator": "tapered-leg@1",        // deterministic geometry recipe (see doc 04)
  "materialSlots": ["body"],
  "validation": [ ... ],               // §5
  "bom": { ... }                       // §6
}
```

## 2. Parameters

Typed, unit-aware, and the only way a component varies:

| Type | Example | Notes |
|---|---|---|
| `length` | `width: 89mm` | Stored mm; displayed per project units; min/max/step required |
| `count` | `shelfCount: 4` | Integer with min/max |
| `enum` | `taper: "two-side" \| "four-side"` | Rendered as visual picker when options are visual |
| `boolean` | `chamferFoot: true` | Toggle |
| `material` | `body: walnut` | Binds a material slot |

Rules:
- Every parameter declares `min`, `max`, and a shop-sensible `default`. Inputs outside the
  range are rejected with a message, never clamped silently (UI standard §6).
- Parameters may be **bound to expressions** referencing assembly dimensions (`W`, `D`, `H`
  of the parent) and Global Parameters. Bindings are stored on the *instance*, not the
  component.
- Parameter visibility tiers: `basic` (always shown in Inspector) or `advanced`. A component
  may declare at most 5 basic parameters — this cap is enforced at publish time and is what
  keeps the Inspector approachable.

## 3. Anchors

Anchors are named, oriented attachment points that drive drag-snapping and joinery:

```jsonc
{ "name": "top", "position": "[0, 0, H]", "normal": "+Z",
  "accepts": ["apron-end", "tabletop-corner"], "jointDefaults": ["mortise-tenon", "dowel"] }
```

- Positions are expressions of the component's own parameters, so anchors track resizing.
- `accepts` declares compatible anchor classes; during a library drag, compatible anchors on
  existing parts glow (UI standard §4.2) and snapping aligns position + orientation.
- When two compatible anchors connect, the joint picker proposes `jointDefaults` first.

## 4. Scaling behavior (the X/Y/Z rules)

When a user resizes an instance or its parent assembly, each component re-evaluates per-axis
rules — never a visual mesh stretch. Per axis (W/D/H), one behavior:

| Behavior | Meaning | Example |
|---|---|---|
| `fixed` | Dimension never changes with parent | Board thickness; leg cross-section |
| `stretch` | Dimension follows parent (with min/max) | Tabletop width; shelf depth |
| `zone-stretch` | Fixed end zones, stretching middle (3D nine-patch) | Turned/tapered legs keep foot & shoulder profiles, stretch the straight middle |
| `repeat` | Child instances array with min/max spacing; count recomputes | Shelves, slats, drawer rows, shelf-pin holes |
| `step` | Snaps to discrete sizes | Hardware (slides come in 12″/14″/16″...) |

Assembly-level rules compose: widening a bookcase *stretches* the top/shelves (W), keeps
side panels *fixed* in thickness, *repeats* vertical shelf spacing, and a declared
constraint (`maxSpan` on the shelf) can inject a center support when exceeded. Authors
declare these once; users just type a new width.

Limits: every `stretch`/`zone-stretch` axis declares `min`/`max`. Resizing past a limit
stops at the limit and raises a Design Check note explaining which part limited it.

## 5. Validation hooks

Components contribute their own Design Check rules (doc 02 §4): expression-based predicates
with severity (`warning` only in v1 — never blocking) and a shop-language message:

```jsonc
{ "when": "span > material.maxSpan(thickness)",
  "message": "This shelf will sag over {span}. Add a support or thicken to {suggested}.",
  "fix": "insert:core/shelving/center-support" }
```

## 6. BOM contract

Each generated part reports: finished dimensions (L×W×T with grain along L), material slot,
quantity, and any hardware items (with SKUs where defined). Joints add their hardware and
machining features to *both* mated parts. The cut list is therefore a pure projection of the
evaluated model — no manual editing of quantities or sizes (annotations/cost columns are
editable; dimensions are not).

## 7. Joints

Joints are first-class objects between two anchors, not features of either part:

- Catalog (v1): mortise & tenon, dowel, domino/loose tenon, dado, rabbet, miter, pocket
  screw, threaded fasteners (bolts/inserts), butt + screws.
- A joint declares: required anchor classes, its parameters (e.g., tenon thickness defaults
  to ⅓ of the mortised part, shoulder offsets), the boolean modifications applied to each
  part, hardware contributed to the BOM, and the DXF features (POCKET/DRILL layers) it
  exports.
- Joint parameters follow §2 rules and surface in the Inspector when the joint is selected.

## 8. Workshop (user-saved) components

- "Save to Workshop" packages any part or sub-assembly with its parameters, internal joints,
  anchors (auto-derived from exposed faces, user-editable), and a generated thumbnail.
- Workshop components use the exact schema above, so they snap, scale, validate, and BOM
  identically to core components.
- Saved components are private to the user in v1; the schema's versioning and immutability
  rules are what make phase-3 sharing/marketplace possible without migration.

## 9. Publishing rules (core library)

- Semver; published versions immutable; documents pin versions (doc 04).
- Publish-time checks: ≤ 5 basic parameters; all lengths have min/max/default; all axes have
  a scaling behavior; anchors named and classed; thumbnail present; terminology lint on all
  user-visible strings (UI standard §11); golden-file geometry test committed.
