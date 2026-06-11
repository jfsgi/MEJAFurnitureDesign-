// Core model types. Model space is Z-up, millimeters: X = Width, Y = Depth, Z = Height.
// This module (and everything under core/) must stay free of three.js / DOM imports so the
// evaluator can later move into a Web Worker unchanged (see docs/04-architecture.md).

export type Units = 'imperial' | 'metric';

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;
export type ParamTier = 'basic' | 'advanced';

export interface LengthParam {
  kind: 'length';
  key: string;
  label: string;
  default: number; // mm
  min: number;
  max: number;
  tier: ParamTier;
}
export interface CountParam {
  kind: 'count';
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  tier: ParamTier;
}
export interface EnumParam {
  kind: 'enum';
  key: string;
  label: string;
  default: string;
  options: { value: string; label: string }[];
  tier: ParamTier;
}
export interface BoolParam {
  kind: 'boolean';
  key: string;
  label: string;
  default: boolean;
  tier: ParamTier;
}
export interface MaterialParam {
  kind: 'material';
  key: string;
  label: string;
  default: string;
  tier: ParamTier;
}
export type ParamDef = LengthParam | CountParam | EnumParam | BoolParam | MaterialParam;

// Render/evaluation primitives, instance-local model space (Z-up, mm).
export type Primitive =
  | { shape: 'box'; size: [number, number, number]; at: [number, number, number] }
  | {
      shape: 'taperedBox';
      top: [number, number]; // W, D at the top
      bottom: [number, number]; // W, D at the bottom
      height: number;
      at: [number, number, number]; // center of the bounding volume
      align: [number, number]; // -1 | 0 | 1 per axis: which faces stay flush as it tapers
    }
  | {
      shape: 'cylinder';
      radiusTop: number;
      radiusBottom: number;
      height: number;
      at: [number, number, number]; // center; axis along Z
    };

export interface Part {
  id: string; // stable within the generated model
  name: string; // shop name: "Leg", "Apron (long)", "Shelf"
  material: string; // material id
  primitives: Primitive[];
  // Stock dimensions for the cut list; length runs along the grain.
  cut: { length: number; width: number; thickness: number };
}

export interface Finding {
  severity: 'warning';
  message: string;
}

export interface GeneratedModel {
  parts: Part[];
  findings: Finding[];
}

export interface ComponentDef {
  id: string;
  name: string;
  category: string;
  description: string;
  params: ParamDef[];
  generate(params: ParamValues): GeneratedModel;
}

export interface Instance {
  id: string;
  componentId: string;
  name: string;
  position: [number, number]; // X, Y on the floor, mm
  rotationZ: number; // radians
  params: ParamValues; // sparse overrides; missing keys use the component defaults
}

export interface ProjectDoc {
  schema: 1;
  name: string;
  units: Units;
  instances: Instance[];
}
