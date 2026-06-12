# Vendored: @4kgraphics/engine

Source: `jfsgi/4kGraphics` `packages/engine/src` at `9aef197` (v0.12.5,
"API docs refreshed; ssao/photoFinish exposed via render service").

The engine is not published to a registry, so its source is vendored here for
the Studio workspace. Local modifications, all marked "Atelier3D extension"
(also collected in `atelier3d-extensions.patch`, ready to apply upstream):

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
and re-apply the extensions — or upstream the patch and drop this list.
Long term, publishing `@4kgraphics/engine` (npm or GitHub Packages) replaces
this folder with a real dependency.
