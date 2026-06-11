# Vendored: @4kgraphics/engine

Source: `jfsgi/4kGraphics` `packages/engine/src` at `6354102` (v0.5.9,
"shop-true raise cross-sections with quirk shoulders and beads").

The engine is not published to a registry, so its source is vendored here for
the Studio workspace. Local modifications, both marked "Atelier3D extension":

- `FurnitureEngine.showObject()` — display an externally built object
  (the design bridge's group) instead of a parametric spec or loaded model.
- `materials/MaterialLibrary.ts` — added a `paint-black` preset to cover the
  design app's painted-black material.

To update: re-copy `packages/engine/src` from the source repo (minus tests)
and re-apply the two extensions.
