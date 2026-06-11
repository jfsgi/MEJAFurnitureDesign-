import * as THREE from 'three';
import type { PbrMaps, RGB } from './procedural.js';
import {
  generateBrushedMetalMaps,
  generateFabricMaps,
  generatePaintMaps,
  generateWoodMaps,
} from './procedural.js';

export interface MaterialInfo {
  id: string;
  label: string;
  category: 'wood' | 'paint' | 'metal' | 'fabric';
  /** Representative color for UI swatches, as CSS hex. */
  swatch: string;
}

type Generator = (size: number) => PbrMaps;

interface Preset {
  info: MaterialInfo;
  metalness: number;
  clearcoat: number;
  /** Extra texture repeat for small-scale patterns (weave) so they stay crisp. */
  uvRepeat?: number;
  generate: Generator;
}

function hex(rgb: RGB): string {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function woodPreset(
  id: string,
  label: string,
  params: Omit<Parameters<typeof generateWoodMaps>[1], 'plankCount'> & { plankCount?: number },
): Preset {
  return {
    info: { id, label, category: 'wood', swatch: hex(params.lightColor) },
    metalness: 0,
    clearcoat: 0.22,
    generate: (size) => generateWoodMaps(size, { plankCount: 12, ...params }),
  };
}

const PRESETS: Preset[] = [
  woodPreset('oak', 'White Oak', {
    seed: 11,
    lightColor: [214, 196, 168],
    darkColor: [128, 100, 72],
    ringsPerPlank: 7,
    turbulence: 0.35,
    baseRoughness: 0.5,
    contrast: 0.65,
  }),
  woodPreset('walnut', 'Black Walnut', {
    seed: 23,
    lightColor: [158, 112, 74],
    darkColor: [62, 42, 30],
    ringsPerPlank: 10,
    turbulence: 0.9,
    baseRoughness: 0.42,
    contrast: 0.9,
    figure: 'cathedral',
    ringSharpness: 2.5,
    maxKnots: 2,
    plankCount: 8,
  }),
  woodPreset('cherry', 'Cherry', {
    seed: 37,
    lightColor: [202, 130, 82],
    darkColor: [138, 74, 44],
    ringsPerPlank: 6,
    turbulence: 1.0,
    baseRoughness: 0.45,
    contrast: 0.72,
    figure: 'cathedral',
    ringSharpness: 6,
    maxKnots: 2,
    plankCount: 8,
  }),
  woodPreset('maple', 'Hard Maple', {
    seed: 83,
    lightColor: [240, 223, 201],
    darkColor: [196, 164, 132],
    ringsPerPlank: 5,
    turbulence: 0.9,
    baseRoughness: 0.45,
    contrast: 0.34,
    figure: 'cathedral',
    ringSharpness: 6,
    maxKnots: 2,
    plankCount: 8,
  }),
  woodPreset('redoak', 'Red Oak', {
    seed: 89,
    lightColor: [228, 186, 144],
    darkColor: [166, 104, 70],
    ringsPerPlank: 11,
    turbulence: 1.0,
    baseRoughness: 0.55,
    contrast: 0.95,
    figure: 'cathedral',
    ringSharpness: 3,
    maxKnots: 1,
    plankCount: 10,
  }),
  woodPreset('mahogany', 'Ribbon Mahogany', {
    seed: 97,
    lightColor: [196, 110, 62],
    darkColor: [122, 56, 30],
    ringsPerPlank: 6,
    turbulence: 0.4,
    baseRoughness: 0.4,
    contrast: 0.6,
    ribbon: 0.85,
    plankCount: 6,
  }),
  woodPreset('cedar', 'Aromatic Cedar', {
    seed: 71,
    lightColor: [198, 108, 76],
    darkColor: [128, 52, 36],
    ringsPerPlank: 14,
    turbulence: 1.4,
    baseRoughness: 0.55,
    contrast: 0.9,
    figure: 'cathedral',
    ringSharpness: 5,
    maxKnots: 1,
    plankCount: 6,
  }),
  {
    info: { id: 'paint-white', label: 'Matte White Paint', category: 'paint', swatch: '#f2f0ea' },
    metalness: 0,
    clearcoat: 0,
    generate: (size) =>
      generatePaintMaps(size, { seed: 41, color: [242, 240, 234], roughness: 0.55 }),
  },
  {
    info: { id: 'paint-forest', label: 'Forest Green Paint', category: 'paint', swatch: '#3d5240' },
    metalness: 0,
    clearcoat: 0.15,
    generate: (size) =>
      generatePaintMaps(size, { seed: 43, color: [61, 82, 64], roughness: 0.42 }),
  },
  {
    // Atelier3D extension: covers the design app's painted-black material.
    info: { id: 'paint-black', label: 'Matte Black Paint', category: 'paint', swatch: '#35322e' },
    metalness: 0,
    clearcoat: 0.1,
    generate: (size) =>
      generatePaintMaps(size, { seed: 47, color: [53, 50, 46], roughness: 0.5 }),
  },
  {
    info: { id: 'steel', label: 'Brushed Steel', category: 'metal', swatch: '#c8cacd' },
    metalness: 1,
    clearcoat: 0,
    generate: (size) =>
      generateBrushedMetalMaps(size, { seed: 53, color: [200, 202, 205], baseRoughness: 0.32 }),
  },
  {
    info: { id: 'brass', label: 'Brushed Brass', category: 'metal', swatch: '#cda955' },
    metalness: 1,
    clearcoat: 0,
    generate: (size) =>
      generateBrushedMetalMaps(size, { seed: 59, color: [205, 169, 85], baseRoughness: 0.36 }),
  },
  {
    info: { id: 'linen', label: 'Natural Linen', category: 'fabric', swatch: '#d8cdb8' },
    metalness: 0,
    clearcoat: 0,
    uvRepeat: 3,
    generate: (size) =>
      generateFabricMaps(size, {
        seed: 61,
        color: [216, 205, 184],
        shadowColor: [150, 138, 116],
        threadCount: 280,
      }),
  },
];

/**
 * Lazily generates and caches PBR materials backed by procedural textures.
 * Texture generation is the expensive step (a full noise pass per material),
 * so materials are built on first use and reused after that.
 */
export class MaterialLibrary {
  private cache = new Map<string, THREE.MeshPhysicalMaterial>();

  constructor(private textureSize = 2048) {}

  list(): MaterialInfo[] {
    return PRESETS.map((p) => p.info);
  }

  has(id: string): boolean {
    return PRESETS.some((p) => p.info.id === id);
  }

  get(id: string): THREE.MeshPhysicalMaterial {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const preset = PRESETS.find((p) => p.info.id === id);
    if (!preset) {
      throw new Error(`Unknown material "${id}". Available: ${PRESETS.map((p) => p.info.id).join(', ')}`);
    }
    const maps = preset.generate(this.textureSize);
    if (preset.uvRepeat) {
      for (const texture of [maps.map, maps.roughnessMap, maps.normalMap]) {
        texture.repeat.set(preset.uvRepeat, preset.uvRepeat);
      }
    }
    const material = new THREE.MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      roughness: 1,
      metalness: preset.metalness,
      clearcoat: preset.clearcoat,
      clearcoatRoughness: 0.35,
      normalScale: new THREE.Vector2(0.6, 0.6),
      // End-grain darkening rides in vertex colors (see applyBoxUVs).
      vertexColors: true,
    });
    material.name = id;
    this.cache.set(id, material);
    return material;
  }

  /** Current texture resolution (per side, in pixels). */
  get resolution(): number {
    return this.textureSize;
  }

  /**
   * Switches texture resolution (e.g. 2048 → 4096 for full 4K textures) and
   * clears the cache so materials regenerate at the new size.
   */
  setResolution(size: number): void {
    if (size === this.textureSize) return;
    this.textureSize = size;
    this.dispose();
  }

  dispose(): void {
    for (const material of this.cache.values()) {
      material.map?.dispose();
      material.roughnessMap?.dispose();
      material.normalMap?.dispose();
      material.dispose();
    }
    this.cache.clear();
  }
}
