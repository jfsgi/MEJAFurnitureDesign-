# 03 — UI Design Standard

This is the binding standard for all UI built in this application. Any screen, panel, or
control that does not conform must be brought into conformance or have an exception recorded
in this document. The goal it serves: **a professional furniture maker with no CAD experience
must never feel lost.**

---

## 1. Design principles

1. **Furniture language, not CAD language.** UI text uses the terminology table in §11.
   If a furniture maker wouldn't say the word at the bench, it doesn't appear in the UI.
2. **The canvas is the hero.** The 3D viewport is always the largest element on screen. All
   panels collapse; no workflow requires a panel to stay open. Nothing ever fully covers the
   viewport except the template gallery and modal confirmations.
3. **Progressive disclosure.** Every panel shows the 20% of options used 80% of the time;
   the rest sits behind an "Advanced" expander, collapsed by default and remembered per user.
4. **Direct manipulation first, numbers always available.** Anything draggable in the
   viewport (move, scale, joint position) has a synchronized numeric field in the Inspector.
   Dragging updates the field live; typing updates the geometry live.
5. **Never block, never dead-end.** Long operations run in the background with progress;
   validation warns but never locks; every state has a visible exit; Esc always cancels the
   current tool and returns to Select.
6. **Undo everything.** Every model-changing action — including material assignment, joint
   edits, and parametric scaling — is one undo step. Unlimited depth within a session.
7. **One way in is not enough.** Every command is reachable by at least two of: toolbar,
   right-click context menu, command palette (Ctrl/Cmd+K), keyboard shortcut. Shortcuts are
   accelerators, never the only path.
8. **Show, don't quiz.** Prefer visual pickers (joint diagrams, material swatches, camera
   thumbnails) over dropdowns of words wherever the option set is visual.

## 2. Application layout

Fixed shell, all dimensions in px at 1× density:

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar (48)  logo · project name · [Design|Studio|Documents]│
│               · command palette · render queue · share · user│
├────────────┬────────────────────────────────────┬────────────┤
│ Left panel │                                    │ Right panel│
│ 300 wide   │            3D VIEWPORT             │ 320 wide   │
│ Library /  │   (floating contextual toolbar,    │ Inspector /│
│ Outline    │    top-center, only when a tool    │ Design     │
│ tabs       │    or selection needs it)          │ Check tabs │
├────────────┴────────────────────────────────────┴────────────┤
│ Status bar (28)  units · snap toggles · view presets · zoom  │
└──────────────────────────────────────────────────────────────┘
```

- Panels collapse to 40 px icon rails (left: Library, Outline icons; right: Inspector,
  Design Check icons). Collapsed state persists per user per workspace.
- Workspace switching is a cross-fade; panel contents change per workspace (Studio's left
  panel = Environments/Cameras; Documents' left panel = document list) but the shell
  geometry never changes.
- Minimum supported viewport: 1280 × 800. Below 1440 wide, panels default to collapsed.

## 3. Spacing, sizing, radius, elevation

- **Base unit 4 px.** All spacing/sizing from the scale: 4, 8, 12, 16, 24, 32, 48, 64.
- **Control heights:** 32 default, 28 compact (dense tables), 40 primary actions. Minimum
  click/touch target 32 × 32; status-bar toggles may render 28 but hit-test at 32.
- **Corner radius:** 6 controls/inputs, 10 cards/panels/popovers, 999 (pill) for chips and
  the workspace switcher.
- **Elevation:** flat UI; shadows only on floating layers.
  Popover/menu: `0 4px 16px rgba(43,39,34,0.12)`. Modal: `0 8px 32px rgba(43,39,34,0.18)`.
  Never shadow in-shell panels — they separate with borders.

## 4. Color

### 4.1 Light theme (default, Design & Documents workspaces)

Warm-neutral grays chosen to flatter wood tones; a single teal accent (complementary to
wood's oranges, and distinct from the red/green/blue axis colors).

| Token | Hex | Use |
|---|---|---|
| `bg/canvas` | `#E9E5DE` | Viewport background (subtle vertical gradient to `#F2EFEA` allowed) |
| `bg/surface` | `#FFFFFF` | Panels, top bar, cards |
| `bg/surface-2` | `#F6F4F0` | Nested sections, table stripes, input wells |
| `border/default` | `#E2DDD4` | Panel and control borders |
| `border/strong` | `#C9C2B6` | Focused tables, dividers needing emphasis |
| `text/primary` | `#2B2722` | Headings, values |
| `text/secondary` | `#6E675C` | Labels, captions |
| `text/disabled` | `#A8A095` | Disabled controls |
| `accent/default` | `#0F766E` | Primary buttons, active states, links, selection |
| `accent/hover` | `#115E59` | Hover on accent elements |
| `accent/subtle` | `#E4F2F0` | Selected list rows, active tab fills |
| `success` | `#15803D` | Valid states, passed checks |
| `warning` | `#B45309` | Design Check warnings, non-blocking issues |
| `danger` | `#B91C1C` | Destructive actions, errors |
| `info` | `#1D4ED8` | Informational toasts/banners |

### 4.2 Viewport semantic colors (identical in both themes)

| Token | Hex | Use |
|---|---|---|
| `axis/x` | `#E5484D` | X axis & gizmo handle (Width) |
| `axis/y` | `#46A758` | Y axis & gizmo handle (Depth) |
| `axis/z` | `#3E63DD` | Z axis & gizmo handle (Height) |
| `selection/outline` | `#14B8A6` | Selected part outline (2 px screen-space) |
| `hover/outline` | `#14B8A6` @ 50% | Hovered part outline (1 px) |
| `snap/anchor` | `#F59E0B` | Glowing anchor points during drag |
| `joint/badge` | `#0F766E` | Joint indicators on assemblies |
| `check/warning` | `#B45309` | Design Check highlight overlay |

### 4.3 Dark theme (Studio workspace — always; optional app-wide)

The Studio is **always dark** regardless of user theme, so renders are judged against a
neutral dark surround.

| Token | Hex |
|---|---|
| `bg/canvas` | `#1A1A1E` |
| `bg/surface` | `#232328` |
| `bg/surface-2` | `#2B2B31` |
| `border/default` | `#3A3A41` |
| `text/primary` | `#EDEDF0` |
| `text/secondary` | `#A0A0A8` |
| `accent/default` | `#2DD4BF` |
| `accent/subtle` | `#143D39` |

**Rules:** color is never the sole carrier of meaning (pair with icon/text). All text/border
combinations must meet WCAG 2.2 AA (§9).

## 5. Typography

- **Family:** Inter (UI), with `font-feature-settings: "tnum"` on every numeric/dimension
  display so digits align in tables and fields. No second family in v1.
- **Scale:**

| Token | Size/Line | Weight | Use |
|---|---|---|---|
| `display` | 24/32 | 600 | Empty states, onboarding |
| `title` | 18/26 | 600 | Modal titles, workspace headers |
| `heading` | 14/20 | 600 | Panel section headers |
| `body` | 13/20 | 400 | Default UI text, inputs |
| `label` | 12/16 | 500 | Field labels, tabs, chips |
| `caption` | 11/16 | 400 | Hints, units, statuses |

- Sentence case everywhere (buttons, titles, labels). Never all-caps except 2-letter axis
  badges (W/D/H, X/Y/Z).

## 6. Core components

- **Buttons:** Primary (accent fill, white text) — at most one per view region. Secondary
  (surface fill, border). Ghost (text only) for toolbars. Destructive (danger fill) only
  inside confirmation surfaces. Icon-only buttons always have tooltips (300 ms delay,
  include shortcut, e.g. "Frame selection — F").
- **Dimension input** (the signature control, used for every length):
  - Accepts: `3/4`, `1-1/2`, `1 1/2"`, `0.75in`, `19mm`, `2'6"`, and expressions
    (`W/2 - 10mm`, references to Global Parameters). Parsing is unit-aware; bare numbers
    take project units.
  - Displays in project units: imperial as fractional inches to 1/32″, metric as mm (one
    decimal max).
  - Label is drag-to-scrub (←→ changes value); arrow keys step ±1 unit (imperial: 1/16″),
    Shift = ×10, Alt = fine (1/64″ / 0.1 mm).
  - A linked/driven value shows a formula chip (`= W/2 - 10mm`) instead of an editable
    number; clicking the chip edits the expression. Invalid input shakes once, shows the
    parse error in caption text, and keeps the previous value — never silently clamps.
- **Inspector pattern:** title row (component name, editable inline) → Basic section (always
  open: W/D/H, material, count) → option sections → "Advanced" expander (collapsed). Multi-
  select shows shared parameters; mixed values display "—" and edit applies to all.
- **Library cards:** 3D-thumbnail (orbits on hover), name, and W/D/H summary. Drag to
  canvas is the primary action; double-click drops at scene center.
- **Tables (cut list/BOM):** 28 px compact rows, sticky header, tabular numerals,
  right-aligned dimensions, row hover highlights the part in the viewport (and vice versa).
- **Toasts:** bottom-left above status bar, max 3 stacked, auto-dismiss 5 s (errors
  persist), every model-changing toast carries an Undo action.
- **Empty states:** every empty panel teaches: one-line explanation + primary action
  ("No saved cameras yet — Add camera from current view").
- **Modals:** confirmations and project setup only. Never for property editing. One primary
  action, Esc cancels, destructive confirmations name the object ("Delete 'Walnut Dining
  Table'?") with the destructive verb on the danger button.

## 7. Viewport interaction standard

- **Camera:** scroll = zoom to cursor · right-drag = orbit · middle-drag or Space+drag =
  pan · double-click empty canvas = frame all · `F` = frame selection. A view cube
  (top-right) and a Home button always provide non-shortcut navigation. Standard views on
  number keys (1 front, 3 right, 7 top, 0 hero ¾).
- **Selection model:** click = part · double-click = step into sub-assembly (breadcrumb
  appears top-left; click-out or Esc steps back up) · Shift+click = add/remove ·
  drag-rectangle = box select · Esc = clear. Hover always pre-highlights what a click would
  select.
- **Gizmo:** combined move/scale gizmo on selection, axis-colored per §4.2. Assembly scale
  handles perform **parametric** scaling (re-evaluates rules) — never visual mesh stretch.
  Dragging shows a live dimension readout near the cursor in project units.
- **Snapping:** on by default — anchors, face contact, centerlines, increments (1/16″ /
  1 mm). Status-bar toggles; Alt temporarily suspends while dragging. Active snap shows the
  amber anchor glow plus a caption ("Snapped: leg top → tabletop corner").
- **Performance budget (UX-binding):** parameter edit reflected in viewport < 100 ms for
  typical assemblies; library drag preview at 60 fps; if re-evaluation exceeds 300 ms the
  affected parts show a subtle shimmer rather than freezing the UI.

## 8. Motion

- Durations: 120 ms micro (hover, toggles) · 200 ms panels/popovers · 300 ms workspace
  cross-fade. Easing: `cubic-bezier(0.2, 0, 0, 1)` (ease-out) for entering, ease-in for
  exiting.
- Camera animations (frame, view presets) ≤ 400 ms. Geometry parameter changes are **not**
  animated — the model snaps to truth.
- Honor `prefers-reduced-motion`: replace movement with opacity fades.

## 9. Accessibility

- WCAG 2.2 AA: text contrast ≥ 4.5:1, large text & UI graphics ≥ 3:1, verified for both
  themes in CI.
- Full keyboard operability for all panel/menu/dialog UI; visible 2 px accent focus ring,
  2 px offset. Viewport tools remain reachable via menus and command palette.
- All icon buttons carry `aria-label`s; toasts announce via live region; `?` opens the
  searchable shortcut reference.

## 10. Onboarding & help standard

- First run: template gallery → guided 60-second tour on the chosen template (5 steps max:
  orbit, select, change a dimension, change material, where Studio lives). Skippable,
  resumable, never auto-repeats.
- Every Inspector section header has a `?` affordance opening a focused help card (1
  paragraph + 1 diagram/GIF) — in-place, never a docs-site jump.
- Command palette (Ctrl/Cmd+K) searches commands, components, and help.

## 11. Terminology standard

| Use | Never |
|---|---|
| Part, Component | Body, Solid, Mesh |
| Assembly / Sub-assembly | Group, Node |
| Joint, Joinery | Boolean, Mate, Constraint |
| Width / Depth / Height (W/D/H) | X/Y/Z in user-facing dimension labels |
| Anchor | Snap point, Mate connector |
| Material | Texture, Shader |
| Workshop (user library) | My components |
| Studio | Render mode, Visualization |
| Design Check | Validation errors, Lint |
| Global Parameter | Variable, Driving dimension |

Axes follow the furniture convention: **X = Width, Y = Depth, Z = Height (Z-up)** in all
user-facing UI, regardless of engine internals. The X/Y/Z letters appear only on the gizmo
and view cube, always paired with their colors.

## 12. Quality gates

A UI change ships only if: tokens from §3–§5 are used (no hard-coded colors/sizes/fonts);
both themes pass contrast checks; keyboard path exists; empty/loading/error states are
designed; strings pass the §11 terminology lint; Esc and Undo behave per §1.
