# Vendored: @4kgraphics/engine

Source: `jfsgi/4kGraphics` `packages/engine/src` at `6354102` (v0.5.9,
"shop-true raise cross-sections with quirk shoulders and beads").

The engine is not published to a registry, so its source is vendored here for
the Studio workspace. Local modifications, all marked "Atelier3D extension":

- `FurnitureEngine.showObject()` — display an externally built object
  (the design bridge's group) instead of a parametric spec or loaded model.
- `FurnitureEngine.clearMaterialOverrides()` — drop every studio material
  override.
- `materials/MaterialLibrary.ts` — added a `paint-black` preset to cover the
  design app's painted-black material.
- `parametric/joinery.ts` `layoutJoint()` — shop dovetail proportions: slim
  1/16" half-pins at the board edges, pins about a stock-thickness wide
  between the tails (box joints unchanged).

To update: re-copy `packages/engine/src` from the source repo (minus tests)
and re-apply the extensions.
