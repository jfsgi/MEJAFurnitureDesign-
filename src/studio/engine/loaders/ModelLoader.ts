import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type ModelFormat = 'gltf' | 'glb' | 'obj' | 'fbx' | 'stl';

export interface LoadModelOptions {
  /** Override format detection (needed for blob URLs without an extension). */
  format?: ModelFormat;
  /**
   * Guess the source units from the model's size and rescale to meters, then
   * center the model with its base on the floor. Defaults to true.
   */
  normalize?: boolean;
}

const EXTENSIONS: Record<string, ModelFormat> = {
  gltf: 'gltf',
  glb: 'glb',
  obj: 'obj',
  fbx: 'fbx',
  stl: 'stl',
};

export function detectFormat(name: string): ModelFormat | null {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(name);
  return match ? (EXTENSIONS[match[1].toLowerCase()] ?? null) : null;
}

/**
 * Loads a furniture model from a URL or a File/Blob in any supported
 * interchange format and returns it as a group ready to add to the scene.
 */
export async function loadModel(
  source: string | File,
  options: LoadModelOptions = {},
): Promise<THREE.Group> {
  let url: string;
  let revoke = false;
  let name: string;
  if (typeof source === 'string') {
    url = source;
    name = source;
  } else {
    url = URL.createObjectURL(source);
    revoke = true;
    name = source.name;
  }

  const format = options.format ?? detectFormat(name);
  if (!format) {
    if (revoke) URL.revokeObjectURL(url);
    throw new Error(
      `Cannot detect model format from "${name}" — pass options.format ('gltf' | 'glb' | 'obj' | 'fbx' | 'stl')`,
    );
  }

  try {
    const group = await loadByFormat(url, format);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Library materials use vertex colors (end-grain tinting); give
        // imported geometry a neutral color attribute so they apply cleanly.
        const geometry = child.geometry as THREE.BufferGeometry;
        if (!geometry.getAttribute('color') && geometry.getAttribute('position')) {
          const count = geometry.getAttribute('position').count;
          geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
          );
        }
      }
    });
    if (options.normalize ?? true) {
      normalizeToFurnitureScale(group);
    }
    return group;
  } finally {
    if (revoke) URL.revokeObjectURL(url);
  }
}

async function loadByFormat(url: string, format: ModelFormat): Promise<THREE.Group> {
  switch (format) {
    case 'gltf':
    case 'glb': {
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    }
    case 'obj':
      return await new OBJLoader().loadAsync(url);
    case 'fbx':
      return await new FBXLoader().loadAsync(url);
    case 'stl': {
      const geometry = await new STLLoader().loadAsync(url);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshPhysicalMaterial({ color: 0xb8b2a8, roughness: 0.6 }),
      );
      const group = new THREE.Group();
      group.add(mesh);
      return group;
    }
  }
}

/**
 * CAD exports disagree wildly on units (m, cm, mm, inches). Guess the unit
 * from the model's bounding size assuming it is a piece of furniture, scale
 * to meters, and sit it on the floor centered at the origin.
 */
export function normalizeToFurnitureScale(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) return;

  let scale = 1;
  if (maxDim > 500) scale = 0.001; // millimeters
  else if (maxDim > 20) scale = 0.01; // centimeters
  else if (maxDim > 6) scale = 0.0254; // inches
  else if (maxDim < 0.05) scale = 2 / maxDim; // unknown tiny unit — fit to 2m
  group.scale.multiplyScalar(scale);

  const scaled = new THREE.Box3().setFromObject(group);
  const center = scaled.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  group.position.y -= scaled.min.y;
}
