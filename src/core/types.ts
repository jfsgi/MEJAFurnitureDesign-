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
  | {
      shape: 'box';
      size: [number, number, number];
      at: [number, number, number];
      /** Rotation about the depth (Y) axis, radians — diagonal dividers, angled parts. */
      tilt?: number;
      /** Rotation about the width (X) axis, radians — leaned shelves. Use one tilt at a time. */
      tiltX?: number;
      /** Renders shaded like end grain (joint fingers of the mating board). */
      endGrain?: boolean;
      /** Grain direction override — pieces of a larger board (a notched
       *  shelf's corner tongues) whose longest axis crosses the grain. */
      grain?: 'x' | 'y' | 'z';
    }
  | {
      shape: 'taperedBox';
      top: [number, number]; // W, D at the top
      bottom: [number, number]; // W, D at the bottom
      height: number;
      at: [number, number, number]; // center of the bounding volume
      align: [number, number]; // -1 | 0 | 1 per axis: which faces stay flush as it tapers
      /** Extra bottom-face offset: shears the prism — raked legs with level cuts. */
      shift?: [number, number];
      /** Taper axis (default 'z'). Horizontal tapers make dovetail tails and pins. */
      axis?: 'x' | 'y' | 'z';
      /** Renders shaded like end grain (joint fingers of the mating board). */
      endGrain?: boolean;
    }
  | {
      shape: 'cylinder';
      radiusTop: number;
      radiusBottom: number;
      height: number;
      at: [number, number, number]; // center; axis along Z
    }
  | {
      shape: 'roundedSlab';
      size: [number, number, number];
      at: [number, number, number];
      /** Corner radius in plan ('front' = the +Y corners; 'all' = every corner). */
      radius: number;
      /** Roundover radius on the slab edges (0 = square arris). */
      edge?: number;
      /** 'both' rounds top and bottom arrises (default); 'top' rounds the
       *  top only, leaving the bottom edge square. */
      edgeMode?: 'both' | 'top';
      /** Thickness axis: 'z' lies flat (default); 'y' stands the slab on the
       *  wall like a button, face toward +Y. */
      axis?: 'z' | 'y';
      /** Which outline corners round (default 'front'). */
      corners?: 'front' | 'all';
      /** Keep the back (−Y) edge square — a piece set against a wall. */
      squareBack?: boolean;
      /** Grain override — vertical for posts with radiused corners. */
      grain?: 'x' | 'y' | 'z';
    }
  | {
      shape: 'mortisedPost';
      /** w, d, h — the post stands along Z (h is its length). */
      size: [number, number, number];
      at: [number, number, number];
      /** Vertical-corner radius (0 = square post). */
      radius: number;
      grain?: 'x' | 'y' | 'z';
      /** Blind mortise pockets cut into the side faces. z is post-local
       *  (centered); width runs along the in-face horizontal axis, height
       *  along the post length, depth into the face. */
      mortises: { face: 'x+' | 'x-' | 'y+' | 'y-'; z: number; width: number; height: number; depth: number; flare?: number; openTop?: boolean; roundBottom?: boolean }[];
    }
  | {
      shape: 'frenchDovetail';
      /** Center of the key's bounding volume. */
      at: [number, number, number];
      /** Projection into the mating piece (the joint depth). */
      depth: number;
      /** Thickness of the key at its root (rail face) and tip (deep end). */
      rootThin: number;
      tipThin: number;
      /** Vertical run of the key; it ends in a rounded router bottom. */
      runH: number;
      /** Which end of the interface axis the tip points toward. */
      dir: 1 | -1;
      /** World axis the key projects along (x or y). Run is along Z. */
      interfaceAxis: 'x' | 'y';
      grain?: 'x' | 'y' | 'z';
    }
  | {
      shape: 'jointedBoard';
      /** Tails carry the toothed ends (sides); pins carry the complements. */
      role: 'tails' | 'pins';
      length: number;
      /** Dimension along the joint pattern. */
      height: number;
      thickness: number;
      at: [number, number, number];
      lengthAxis: 'x' | 'y' | 'z';
      thicknessAxis: 'x' | 'y' | 'z';
      joint: 'dovetail' | 'box-joint';
      /** Joint depth = mating board thickness. */
      jointDepth: number;
      /** Pins boards: which side of the thickness axis faces out. */
      outerSign?: 1 | -1;
      /** Half-blind: the joint stops this short of the show face. Pins
       *  boards get blind sockets and a solid lap plate; tails boards
       *  shorten their tooth engagement to match. */
      lip?: number;
      /** Tails boards: which end of the length axis is lapped (default both
       *  — a case side; a drawer side laps the front end, through behind). */
      lipEnd?: 'positive' | 'negative';
      /** Tails boards: this end of the length axis stays square — no teeth
       *  (a case side running past its only jointed corner to the floor). */
      plainEnd?: 'positive' | 'negative';
      /** Pins boards: finger-pull scoop in the top edge. */
      scoop?: { width: number; depth: number };
    }
  | {
      shape: 'archedBoard';
      size: [number, number, number];
      at: [number, number, number];
      /** bottom-x/-y: relief arch cut up into the lower edge along that axis;
       *  front: convex half-ellipse bulge on the +Y edge, springing from the corners;
       *  scoop: smooth finger-pull relief cut down into the top edge along X. */
      arch: 'bottom-x' | 'bottom-y' | 'front' | 'scoop';
      rise: number;
      /** Flat ends left at either side of a bottom arch. */
      shoulder?: number;
      /** Angled trim on the +length end of a bottom arch: the end grows by this
       *  toward the lower edge — shoulders meeting a raked leg. */
      endSkew?: number;
    };

export interface Part {
  id: string; // stable within the generated model
  name: string; // shop name: "Leg", "Apron (long)", "Shelf"
  material: string; // material id
  primitives: Primitive[];
  // Stock dimensions for the cut list; length runs along the grain.
  cut: { length: number; width: number; thickness: number; note?: string };
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
  /** Where the piece lives: on the floor (default) or hung on a wall. */
  mount?: 'floor' | 'wall';
  params: ParamDef[];
  generate(params: ParamValues): GeneratedModel;
  /** Default joinery for the piece's joints, applied when an instance is
   *  added (keyed by the sorted part-id pair). The joint editor overrides
   *  these per joint. */
  defaultJoints?(params: ParamValues): Record<string, JointStyle>;
}

/** Joinery a user can assign to a joint between two parts. */
export type JointStyle =
  | 'butt'
  | 'mortise-tenon'
  | 'dowel'
  | 'through-dovetail'
  | 'half-blind-dovetail'
  | 'french-dovetail'
  | 'box-joint';

export interface Instance {
  id: string;
  componentId: string;
  name: string;
  position: [number, number]; // X, Y on the floor, mm
  rotationZ: number; // radians
  params: ParamValues; // sparse overrides; missing keys use the component defaults
  /** Per-joint joinery overrides, keyed by the sorted pair of part ids. */
  joints?: Record<string, JointStyle>;
  /** Tunable joint geometry for this piece (e.g. French dovetail dims). */
  jointConfig?: {
    frenchDovetail?: {
      depthIn?: number;
      tipRatio?: number;
      rootRatio?: number;
      bottomStopRatio?: number;
    };
  };
}

export interface ProjectDoc {
  schema: 1;
  name: string;
  units: Units;
  instances: Instance[];
}
