export { FurnitureEngine, type FurnitureEngineOptions } from './FurnitureEngine.js';
export {
  defaultSpec,
  defaultTableSpec,
  defaultBookshelfSpec,
  defaultCabinetSpec,
  defaultDrawerBoxSpec,
  defaultCabinetDoorSpec,
  defaultDrawerFrontSpec,
  defaultDrawerUnitSpec,
  validateSpec,
  type FurnitureSpec,
  type FurnitureKind,
  type TableSpec,
  type BookshelfSpec,
  type CabinetSpec,
  type DrawerBoxSpec,
  type CabinetDoorSpec,
  type DrawerFrontSpec,
  type DrawerUnitSpec,
  type LegStyle,
  type FrontStyle,
  type RaiseProfile,
  type EdgeProfile,
  type DrawerJoinery,
} from './parametric/spec.js';
export { buildLayout, type FurnitureLayout, type Part } from './parametric/layout.js';
export { buildGroup } from './parametric/geometry.js';
export {
  generateBuildPlan,
  type BuildPlan,
  type BuildStep,
  type CutListItem,
  type HardwareItem,
} from './buildplan/buildplan.js';
export { MaterialLibrary, type MaterialInfo, type ScannedMaterialDef } from './materials/MaterialLibrary.js';
export { applyBoxUVs } from './materials/uv.js';
export {
  loadModel,
  detectFormat,
  normalizeToFurnitureScale,
  type ModelFormat,
  type LoadModelOptions,
} from './loaders/ModelLoader.js';
export {
  createLightRig,
  LIGHTING_PRESETS,
  type LightingPresetId,
  type LightingPresetInfo,
} from './lighting/presets.js';
export { renderSnapshot, type SnapshotOptions, type SnapshotContext } from './render/SnapshotRenderer.js';
export { inchesToMm, mmToInches, formatInches, MM_PER_INCH } from './units.js';
