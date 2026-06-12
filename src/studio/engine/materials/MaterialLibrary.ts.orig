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
  category: 'wood' | 'paint' | 'metal' | 'fabric' | 'scanned';
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
  woodPreset('birchply', 'Birch Ply', {
    seed: 67,
    lightColor: [232, 218, 192],
    darkColor: [199, 178, 147],
    ringsPerPlank: 70,
    turbulence: 0.18,
    baseRoughness: 0.55,
    contrast: 0.22,
    plankCount: 1,
  }),
  woodPreset('oak', 'White Oak', {
    seed: 11,
    lightColor: [214, 196, 168],
    darkColor: [128, 100, 72],
    ringsPerPlank: 30,
    turbulence: 0.35,
    baseRoughness: 0.5,
    contrast: 0.65,
  }),
  woodPreset('walnut', 'Black Walnut', {
    seed: 23,
    lightColor: [158, 112, 74],
    darkColor: [62, 42, 30],
    ringsPerPlank: 42,
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
    ringsPerPlank: 34,
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
    ringsPerPlank: 28,
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
    ringsPerPlank: 42,
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
    ringsPerPlank: 24,
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
    ringsPerPlank: 52,
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
/**
 * A photo-scanned material: real board photos processed into tileable PBR
 * maps (see scripts/process-texture.py). Textures load from URLs; the
 * physical scan size sets the repeat so grain renders at true scale.
 */
export interface ScannedMaterialDef {
  id: string;
  label: string;
  swatch: string;
  mapUrl: string;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  /** Physical size of the scanned area in meters. */
  widthM: number;
  heightM: number;
  clearcoat?: number;
}

/** Geometry box-UVs put one tile across this many meters (see geometry.ts). */
const TEXTURE_TILE_M = 2.4;

export class MaterialLibrary {
  private cache = new Map<string, THREE.MeshPhysicalMaterial>();
  private scanned = new Map<string, ScannedMaterialDef>();
  private pendingLoads: Promise<unknown>[] = [];

  constructor(private textureSize = 2048) {}

  list(): MaterialInfo[] {
    return [
      ...PRESETS.map((p) => p.info),
      ...[...this.scanned.values()].map((s) => ({
        id: s.id,
        label: s.label,
        category: 'scanned' as const,
        swatch: s.swatch,
      })),
    ];
  }

  has(id: string): boolean {
    return PRESETS.some((p) => p.info.id === id) || this.scanned.has(id);
  }

  /** Registers a photo-scanned material; it appears in list() immediately. */
  addScanned(def: ScannedMaterialDef): void {
    this.scanned.set(def.id, def);
    this.cache.get(def.id)?.dispose();
    this.cache.delete(def.id);
  }

  private buildScanned(def: ScannedMaterialDef): THREE.MeshPhysicalMaterial {
    const loader = new THREE.TextureLoader();
    const load = (url: string, srgb: boolean) => {
      let done: () => void = () => undefined;
      this.pendingLoads.push(new Promise<void>((resolve) => (done = resolve)));
      const texture = loader.load(url, done, undefined, () => done());
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 16;
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      // Repeat so the scan covers its true physical size within the tile.
      texture.repeat.set(TEXTURE_TILE_M / def.widthM, TEXTURE_TILE_M / def.heightM);
      return texture;
    };
    const material = new THREE.MeshPhysicalMaterial({
      map: load(def.mapUrl, true),
      normalMap: def.normalMapUrl ? load(def.normalMapUrl, false) : null,
      roughnessMap: def.roughnessMapUrl ? load(def.roughnessMapUrl, false) : null,
      roughness: 1,
      metalness: 0,
      clearcoat: def.clearcoat ?? 0.22,
      clearcoatRoughness: 0.28,
      normalScale: new THREE.Vector2(0.6, 0.6),
      vertexColors: true,
    });
    material.name = def.id;
    return material;
  }

  get(id: string): THREE.MeshPhysicalMaterial {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const scanned = this.scanned.get(id);
    if (scanned) {
      const material = this.buildScanned(scanned);
      this.cache.set(id, material);
      return material;
    }
    const preset = PRESETS.find((p) => p.info.id === id);
    if (!preset) {
      throw new Error(`Unknown material "${id}". Available: ${this.list().map((m) => m.id).join(', ')}`);
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
      clearcoatRoughness: 0.28,
      normalScale: new THREE.Vector2(0.6, 0.6),
      // End-grain darkening rides in vertex colors (see applyBoxUVs).
      vertexColors: true,
    });
    material.name = id;
    this.cache.set(id, material);
    return material;
  }

  /** Resolves when every scanned texture requested so far has loaded. */
  async texturesReady(): Promise<void> {
    await Promise.allSettled(this.pendingLoads);
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
