import * as THREE from 'three';

export type LightingPresetId = 'studio' | 'showroom' | 'daylight';

export interface LightingPresetInfo {
  id: LightingPresetId;
  label: string;
}

export const LIGHTING_PRESETS: LightingPresetInfo[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'showroom', label: 'Showroom' },
  { id: 'daylight', label: 'Daylight' },
];

/**
 * Creates the light rig for a preset. Lights are returned in a group named
 * "lights" so the engine can swap rigs atomically. Shadow frustums are sized
 * for furniture-scale scenes (a few meters).
 */
export function createLightRig(preset: LightingPresetId): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lights';

  const addKey = (color: number, intensity: number, position: THREE.Vector3) => {
    const key = new THREE.DirectionalLight(color, intensity);
    key.position.copy(position);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.camera.left = -2.5;
    key.shadow.camera.right = 2.5;
    key.shadow.camera.top = 2.5;
    key.shadow.camera.bottom = -2.5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.bias = -0.0002;
    // Offset sampling along the surface normal: kills the stair-stepped
    // shadow edges where rails shadow shallow recesses.
    key.shadow.normalBias = 0.01;
    key.shadow.radius = 10;
    group.add(key);
    return key;
  };

  switch (preset) {
    case 'studio': {
      // Gentler key-to-fill ratio than a classic CG three-point: the
      // environment carries more of the fill, like a softbox studio, and
      // the key is slightly warm like real photo strobes through fabric.
      addKey(0xfff3e2, 1.8, new THREE.Vector3(2.5, 3.2, 2.2));
      const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
      fill.position.set(-2.8, 1.6, 1.4);
      group.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, 0.9);
      rim.position.set(-1, 2.4, -2.6);
      group.add(rim);
      break;
    }
    case 'showroom': {
      addKey(0xffe7c4, 2.2, new THREE.Vector3(1.6, 3.4, 1.2));
      const accent = new THREE.SpotLight(0xffd9a8, 60, 12, Math.PI / 7, 0.45, 1.6);
      accent.position.set(-2.2, 3.2, 2.4);
      group.add(accent);
      const bounce = new THREE.DirectionalLight(0xfff3e2, 0.5);
      bounce.position.set(0, 1, 3);
      group.add(bounce);
      break;
    }
    case 'daylight': {
      addKey(0xfff2d8, 3.2, new THREE.Vector3(3.5, 4.5, 1.5));
      const sky = new THREE.HemisphereLight(0xbdd4ff, 0x8c7a5e, 0.9);
      group.add(sky);
      break;
    }
  }
  return group;
}
