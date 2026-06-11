// Procedural wood grain for the viewport preview.
// Quality target (user reference): fine, straight, low-contrast grain like rift-sawn
// white oak veneer — thousands of thin streaks, subtle tonal drift, no visible waves
// and no visible tiling. One texture per species covers 1200 × 300 mm of wood and
// wraps seamlessly; per-part UV offsets (baked into geometry) de-correlate boards.

import * as THREE from 'three';

export const GRAIN_MM_U = 1200; // texture width in world mm, along the grain
export const GRAIN_MM_V = 300; // texture height in world mm, across the grain

const TEX_W = 2048;
const TEX_H = 512;

interface Species {
  base: string;
  /** Darker streak tones, most common. */
  dark: string[];
  /** Lighter streak tones. */
  light: string[];
  /** Streak count — higher = busier grain. */
  streaks: number;
  /** Max streak alpha — higher = more contrast. */
  contrast: number;
}

const SPECIES: Record<string, Species> = {
  'white-oak': {
    base: '#C9AE83',
    dark: ['#A8895C', '#97794E', '#B08F60'],
    light: ['#D9C29A', '#E2CFAC'],
    streaks: 4200,
    contrast: 0.26,
  },
  walnut: {
    base: '#5E4736',
    dark: ['#463425', '#3A2B1E', '#52391F'],
    light: ['#74573F', '#7E6149'],
    streaks: 3600,
    contrast: 0.34,
  },
  maple: {
    base: '#E3CFA8',
    dark: ['#CDB68B', '#C2AA7E'],
    light: ['#EEDDBA', '#F2E4C6'],
    streaks: 2600,
    contrast: 0.16,
  },
  cherry: {
    base: '#9E5F3E',
    dark: ['#82492E', '#74402a', '#8E5232'],
    light: ['#B47750', '#BE825B'],
    streaks: 3400,
    contrast: 0.28,
  },
  ash: {
    base: '#D6C6A2',
    dark: ['#B19A6E', '#A38C60', '#BCA478'],
    light: ['#E4D6B4', '#EBDFC2'],
    streaks: 3800,
    contrast: 0.32,
  },
};

/** Deterministic PRNG so the same species always renders the same grain. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a stroke wrapped at both canvas edges so the texture tiles seamlessly. */
function wrappedStroke(draw: (ox: number, oy: number) => void) {
  for (const ox of [0, -TEX_W, TEX_W]) {
    for (const oy of [0, -TEX_H, TEX_H]) {
      draw(ox, oy);
    }
  }
}

function paintGrain(spec: Species): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(421741);

  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Broad, soft tonal drift (boards are never one flat tone).
  for (let i = 0; i < 10; i++) {
    const cx = rand() * TEX_W;
    const cy = rand() * TEX_H;
    const r = 200 + rand() * 500;
    const tone = rand() < 0.5 ? spec.dark[0] : spec.light[0];
    wrappedStroke((ox, oy) => {
      const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      g.addColorStop(0, tone);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TEX_W, TEX_H);
    });
  }
  ctx.globalAlpha = 1;

  // Fine straight streaks: the body of the grain.
  ctx.lineCap = 'round';
  for (let i = 0; i < spec.streaks; i++) {
    const y = rand() * TEX_H;
    const x = rand() * TEX_W;
    const len = 60 + rand() * rand() * 520;
    const drift = (rand() - 0.5) * 3; // nearly straight, never wavy
    const pickLight = rand() < 0.32;
    const tones = pickLight ? spec.light : spec.dark;
    ctx.strokeStyle = tones[Math.floor(rand() * tones.length)];
    ctx.globalAlpha = (0.25 + rand() * 0.75) * spec.contrast;
    ctx.lineWidth = 0.5 + rand() * rand() * 1.6;
    wrappedStroke((ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + len / 2 + ox, y + drift + oy, x + len + ox, y + oy + drift * 0.4);
      ctx.stroke();
    });
  }

  // Pores: very short darker dashes (open-grain species read "woody" from this).
  for (let i = 0; i < spec.streaks * 0.45; i++) {
    const y = rand() * TEX_H;
    const x = rand() * TEX_W;
    const len = 2 + rand() * 7;
    ctx.strokeStyle = spec.dark[0];
    ctx.globalAlpha = 0.05 + rand() * 0.07;
    ctx.lineWidth = 0.6 + rand() * 0.7;
    wrappedStroke((ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + len + ox, y + oy);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;

  return canvas;
}

const cache = new Map<string, THREE.Texture>();

/**
 * Shared grain texture for a wood material id; null for non-grain materials.
 * `rotated` turns the grain 90° for geometries whose UVs run across it (cylinders).
 */
export function getWoodTexture(materialId: string, rotated = false): THREE.Texture | null {
  const spec = SPECIES[materialId];
  if (!spec) return null;
  const key = rotated ? `${materialId}#rot` : materialId;
  let tex = cache.get(key);
  if (!tex) {
    // DataTexture from raw RGBA bytes rather than CanvasTexture: identical result on
    // hardware GL, and it sidesteps canvas-blit channel-order bugs in software GL
    // (SwiftShader swaps R/G on the canvas upload path).
    const canvas = paintGrain(spec);
    const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    tex = new THREE.DataTexture(
      new Uint8Array(img.data.buffer),
      canvas.width,
      canvas.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    tex.flipY = true;
    tex.generateMipmaps = true;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (rotated) {
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
    }
    cache.set(key, tex);
  }
  return tex;
}

/** Stable pseudo-random UV offset per part, so adjacent boards never match. */
export function grainOffset(seed: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 9973) / 9973;
  const v = ((Math.imul(h, 2654435761) >>> 0) % 9973) / 9973;
  return [u, v];
}
