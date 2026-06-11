/**
 * Procedural PBR texture generation. Each generator produces a tileable
 * color map plus matching roughness and normal maps at the requested
 * resolution (4096 for full 4K texture quality).
 *
 * One texture tile represents TEXTURE_TILE_M meters of surface (2.4 m), so
 * a tabletop never shows the pattern twice. All noise frequencies below are
 * tuned against that physical size.
 *
 * Strategy: compute a single height/pattern field per material, then derive
 * color (ramp), roughness (inverse ramp), and normals (height gradient) from
 * it — one expensive noise pass instead of three.
 */

import * as THREE from 'three';
import { fbm2D, valueNoise2D } from './noise.js';

export interface PbrMaps {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
}

export type RGB = [number, number, number];

/** Texture-space period the generators sample over; tiles wrap at this. */
const PERIOD = 8;

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 16;
  return texture;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface FieldResult {
  /** Height-like field in [0, 1], drives normals. */
  height: Float32Array;
  /** Color ramp parameter in [0, 1]. */
  tone: Float32Array;
  /** Roughness in [0, 1]. */
  rough: Float32Array;
}

/**
 * Assembles the three PBR maps from per-pixel field data.
 */
function fieldsToMaps(
  size: number,
  fields: FieldResult,
  colorA: RGB,
  colorB: RGB,
  normalStrength: number,
): PbrMaps {
  const colorCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);
  const normalCanvas = makeCanvas(size);
  const colorCtx = colorCanvas.getContext('2d')!;
  const roughCtx = roughCanvas.getContext('2d')!;
  const normalCtx = normalCanvas.getContext('2d')!;
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const normalImg = normalCtx.createImageData(size, size);
  const { height, tone, rough } = fields;

  for (let y = 0; y < size; y++) {
    const yPrev = ((y - 1 + size) % size) * size;
    const yNext = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x;
      const o = i * 4;
      const t = tone[i];
      colorImg.data[o] = Math.round(lerp(colorA[0], colorB[0], t));
      colorImg.data[o + 1] = Math.round(lerp(colorA[1], colorB[1], t));
      colorImg.data[o + 2] = Math.round(lerp(colorA[2], colorB[2], t));
      colorImg.data[o + 3] = 255;

      const r = Math.round(clamp01(rough[i]) * 255);
      roughImg.data[o] = r;
      roughImg.data[o + 1] = r;
      roughImg.data[o + 2] = r;
      roughImg.data[o + 3] = 255;

      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;
      const dx = (height[row + xNext] - height[row + xPrev]) * normalStrength;
      const dy = (height[yNext + x] - height[yPrev + x]) * normalStrength;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      normalImg.data[o] = Math.round(((-dx * invLen) * 0.5 + 0.5) * 255);
      normalImg.data[o + 1] = Math.round(((dy * invLen) * 0.5 + 0.5) * 255);
      normalImg.data[o + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      normalImg.data[o + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  normalCtx.putImageData(normalImg, 0, 0);
  return {
    map: toTexture(colorCanvas, true),
    roughnessMap: toTexture(roughCanvas, false),
    normalMap: toTexture(normalCanvas, false),
  };
}

function plankHash(plank: number, seed: number): number {
  let h = (plank * 668265263 + seed * 374761393) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export interface WoodParams {
  seed: number;
  /** Light (earlywood) color. */
  lightColor: RGB;
  /** Dark (latewood) color. */
  darkColor: RGB;
  /** Subtle growth-ring density waves per board. */
  ringsPerPlank: number;
  /** Grain waviness: rift-sawn oak ≈ 0.3, figured walnut ≈ 1.1. */
  turbulence: number;
  baseRoughness: number;
  /** Overall figure strength, 0..1. Fine pale species sit near 0.5. */
  contrast: number;
  /** Boards across one tile (tile = 2.4 m, so 12 ≈ 200 mm boards). */
  plankCount: number;
  /**
   * 'straight': fine parallel striation (rift/quarter-sawn).
   * 'cathedral': large sweeping ring arches along the board with
   * board-scale tonal zones (flat-sawn walnut/cherry).
   */
  figure?: 'straight' | 'cathedral';
  /** Max pin knots per board (cathedral figure only). */
  maxKnots?: number;
  /**
   * Ring profile exponent (cathedral figure): ~2.5 gives broad soft bands
   * (walnut), ~6 gives thin crisp contour lines (cherry).
   */
  ringSharpness?: number;
  /**
   * Ribbon-stripe weight 0..1: broad bands of alternating tone and sheen
   * running along the grain (interlocked-grain mahogany/sapele).
   */
  ribbon?: number;
}

/**
 * Wood with grain running along the V axis of the texture, built up from
 * edge-glued boards. The dominant feature is fine straight striation
 * (like the real veneer it imitates); growth rings are only gentle density
 * waves, and each board gets its own phase, density, grain seed, and tone.
 */
export function generateWoodMaps(size: number, params: WoodParams): PbrMaps {
  const { seed, ringsPerPlank, turbulence, contrast: c, plankCount } = params;
  const cathedral = params.figure === 'cathedral';
  const maxKnots = params.maxKnots ?? 0;
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const inv = PERIOD / size;
  const plankW = PERIOD / plankCount;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const i = y * size + x;

      const plankIndex = Math.floor(u / plankW);
      const plank = plankIndex % plankCount;
      const h1 = plankHash(plank, seed);
      const h2 = plankHash(plank, seed + 77);
      const uIn = u - plankIndex * plankW;

      const wander =
        (fbm2D(u * 0.75, v * 0.25, 6, 2, seed + plank * 17, 3) +
          fbm2D(u * 3, v * 1, 24, 8, seed + plank * 17 + 53, 2) * 0.35) *
        turbulence;

      let phase: number;
      let ringVisibility = 1;
      let knotDark = 0;
      if (cathedral) {
        // Flat-sawn figure: ring contours are nested parabolic arches along
        // the board. Quadratic-in-u + linear-in-v phase gives the arches;
        // the v coefficient is kept on a 1/2 grid so the texture still tiles.
        const axis = (0.3 + h1 * 0.4) * plankW;
        const du = (uIn - axis) / plankW;
        const archesAlongV = Math.max(1, Math.round(ringsPerPlank * 0.1 + h2 * 2)) * 0.5;
        phase = du * du * ringsPerPlank * 0.5 + v * archesAlongV + h1 * 13 + wander;
        // Arches fade in and out along the board: large calm zones between
        // figured zones, like real flat-sawn stock.
        ringVisibility =
          0.35 + 0.65 * (fbm2D(u * 0.5, v * 0.5, 4, 4, seed + plank * 23 + 61, 2) * 0.5 + 0.5);

        // Pin knots: small dark spots that bend the surrounding rings.
        const knotCount = Math.min(maxKnots, Math.floor(h2 * (maxKnots + 1)));
        for (let k = 0; k < knotCount; k++) {
          const ku = (0.15 + plankHash(plank * 7 + k, seed + 101) * 0.7) * plankW;
          const kv = plankHash(plank * 7 + k, seed + 211) * PERIOD;
          const ddu = uIn - ku;
          let ddv = Math.abs(v - kv);
          ddv = Math.min(ddv, PERIOD - ddv); // wrap so knots tile
          const r = 0.05 + plankHash(plank * 7 + k, seed + 307) * 0.06;
          const d2 = ddu * ddu + ddv * ddv * 0.6;
          const influence = (r * r) / (d2 + r * r);
          knotDark += influence * influence;
          phase += influence * 2.5;
        }
      } else {
        phase = (uIn / plankW) * ringsPerPlank * (0.8 + h2 * 0.4) + h1 * 13 + wander;
      }
      const ring = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const late =
        (cathedral ? Math.pow(ring, params.ringSharpness ?? 2.5) : ring * ring * ring) *
        ringVisibility;

      // Fine streaks elongated along the grain.
      const fine = fbm2D(u * 32, v * 2, 256, 16, seed + 7 + plank * 31, 5);
      // Sparse darker hairline filaments.
      const fil = valueNoise2D(u * 96, v * 8, 768, 64, seed + 19 + plank * 13);
      const hair = Math.max(0, fil - 0.45) * 1.6;
      // Pore speckle.
      const pore = valueNoise2D(u * 48, v * 4, 384, 32, seed + 23) * 0.5 + 0.5;
      // Board-scale light/dark zones (strong in flat-sawn stock).
      const macro = fbm2D(u * 0.5, v * 0.5, 4, 4, seed + 41, 3);
      // Ribbon stripe: broad bands along the grain (interlocked grain).
      const ribbonWeight = params.ribbon ?? 0;
      const ribbon =
        ribbonWeight > 0 ? fbm2D(u * 6, v * 0.375, 48, 3, seed + 91, 2) * ribbonWeight : 0;

      // Glue-line: a very faint seam at each board boundary.
      const edge = Math.min(uIn, plankW - uIn);
      const seam = edge < 0.006 ? 1 : 0;

      // Cathedral rings are sparse dark contour lines, so their amplitude
      // must be strong to read; sharper (thinner) lines get more weight.
      const sharpness = params.ringSharpness ?? 2.5;
      const ringTerm = cathedral
        ? late * (0.25 + sharpness * 0.05)
        : (late - 0.5) * 0.16;
      const fineWeight = cathedral ? 0.12 : 0.2;
      const macroWeight = cathedral ? 0.13 : 0.05;
      const t = clamp01(
        (cathedral ? 0.36 : 0.42) +
          c *
            (fine * fineWeight +
              hair * 0.18 +
              ringTerm +
              macro * macroWeight +
              ribbon * 0.3 +
              (pore - 0.5) * 0.06 +
              (h1 - 0.5) * 0.12 +
              knotDark * 0.5) +
          seam * 0.08 * c,
      );
      tone[i] = t;
      height[i] = clamp01(
        0.55 -
          c * (hair * 0.2 + fine * 0.07 + late * (cathedral ? 0.2 : 0.08) + knotDark * 0.25) -
          seam * 0.2,
      );
      // Ribbon bands also flip the sheen — the chatoyance of interlocked grain.
      rough[i] = clamp01(
        params.baseRoughness + c * (t - 0.45) * 0.22 + (pore - 0.5) * 0.05 + ribbon * 0.12,
      );
    }
  }

  return fieldsToMaps(size, { height, tone, rough }, params.lightColor, params.darkColor, 0.9);
}

export interface FabricParams {
  seed: number;
  color: RGB;
  shadowColor: RGB;
  /** Thread pairs across one tile. */
  threadCount: number;
}

/** Plain-weave fabric (linen/wool style). */
export function generateFabricMaps(size: number, params: FabricParams): PbrMaps {
  const { seed, threadCount } = params;
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const inv = PERIOD / size;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const i = y * size + x;
      const warpPhase = (u / PERIOD) * threadCount * Math.PI * 2;
      const weftPhase = (v / PERIOD) * threadCount * Math.PI * 2;
      const warp = Math.abs(Math.sin(warpPhase));
      const weft = Math.abs(Math.sin(weftPhase));
      // Checkerboard over/under interleaving.
      const over =
        (Math.floor((u / PERIOD) * threadCount) + Math.floor((v / PERIOD) * threadCount)) % 2 === 0;
      const weave = over ? warp * 0.75 + weft * 0.25 : weft * 0.75 + warp * 0.25;
      const fiber = fbm2D(u * 5, v * 5, 40, 40, seed, 3) * 0.5 + 0.5;
      const h = clamp01(weave * 0.8 + fiber * 0.2);
      height[i] = h;
      tone[i] = clamp01(1 - h * 0.65 - fiber * 0.15);
      rough[i] = clamp01(0.85 + (fiber - 0.5) * 0.1);
    }
  }

  return fieldsToMaps(size, { height, tone, rough }, params.color, params.shadowColor, 3.2);
}

export interface BrushedMetalParams {
  seed: number;
  color: RGB;
  baseRoughness: number;
}

/** Brushed metal: long horizontal grinding streaks. */
export function generateBrushedMetalMaps(size: number, params: BrushedMetalParams): PbrMaps {
  const { seed } = params;
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const inv = PERIOD / size;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const i = y * size + x;
      // Streaks: very high frequency across V, very low along U.
      const streak = fbm2D(u * 0.75, v * 90, 6, 720, seed, 3) * 0.5 + 0.5;
      const blotch = fbm2D(u * 2, v * 2, 16, 16, seed + 31, 3) * 0.5 + 0.5;
      height[i] = streak;
      tone[i] = clamp01(streak * 0.25 + blotch * 0.1);
      rough[i] = clamp01(params.baseRoughness + (streak - 0.5) * 0.18 + (blotch - 0.5) * 0.08);
    }
  }

  const dark: RGB = [
    Math.round(params.color[0] * 0.82),
    Math.round(params.color[1] * 0.82),
    Math.round(params.color[2] * 0.82),
  ];
  return fieldsToMaps(size, { height, tone, rough }, params.color, dark, 0.6);
}

export interface PaintParams {
  seed: number;
  color: RGB;
  roughness: number;
}

/** Painted finish with a subtle orange-peel texture. */
export function generatePaintMaps(size: number, params: PaintParams): PbrMaps {
  const { seed } = params;
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const inv = PERIOD / size;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const i = y * size + x;
      const peel = fbm2D(u * 40, v * 40, 320, 320, seed, 3) * 0.5 + 0.5;
      height[i] = peel;
      tone[i] = peel * 0.06;
      rough[i] = clamp01(params.roughness + (peel - 0.5) * 0.08);
    }
  }

  const shaded: RGB = [
    Math.round(params.color[0] * 0.94),
    Math.round(params.color[1] * 0.94),
    Math.round(params.color[2] * 0.94),
  ];
  return fieldsToMaps(size, { height, tone, rough }, params.color, shaded, 0.5);
}
