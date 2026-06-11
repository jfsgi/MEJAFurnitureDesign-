import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { generateBuildPlan, type BuildPlan } from './buildplan/buildplan.js';
import { loadModel, type LoadModelOptions } from './loaders/ModelLoader.js';
import { createLightRig, LIGHTING_PRESETS, type LightingPresetId } from './lighting/presets.js';
import { MaterialLibrary, type MaterialInfo } from './materials/MaterialLibrary.js';
import { buildGroup } from './parametric/geometry.js';
import { buildLayout, type FurnitureLayout } from './parametric/layout.js';
import type { FurnitureSpec } from './parametric/spec.js';
import { renderSnapshot, type SnapshotOptions } from './render/SnapshotRenderer.js';

export interface FurnitureEngineOptions {
  /** Element the engine's canvas is appended to (and sized against). */
  container: HTMLElement;
  /**
   * Procedural texture resolution per side. 2048 is fast; 4096 gives full
   * 4K texture detail (regenerate with setTextureResolution at runtime).
   */
  textureSize?: number;
  lighting?: LightingPresetId;
  background?: string | 'transparent';
}

/**
 * The interactive furniture renderer: owns the canvas, scene, camera,
 * materials, and lighting, and provides 4K snapshot rendering and build-plan
 * generation for whatever is currently displayed.
 */
export class FurnitureEngine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly materials: MaterialLibrary;

  private controls: OrbitControls;
  private container: HTMLElement;
  private lightRig: THREE.Group;
  private floor: THREE.Mesh;
  private currentObject: THREE.Object3D | null = null;
  private currentLayout: FurnitureLayout | null = null;
  /** partName → materialId; '*' applies to every part. */
  private assignments = new Map<string, string>();
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private animationHandle = 0;

  constructor(options: FurnitureEngineOptions) {
    this.container = options.container;
    this.materials = new MaterialLibrary(options.textureSize ?? 2048);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
    this.camera.position.set(2.4, 1.6, 2.8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.55;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 15;

    this.scene.environment = this.makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.42;
    this.setBackground(options.background ?? '#22252a');

    this.lightRig = createLightRig(options.lighting ?? 'studio');
    this.scene.add(this.lightRig);

    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.32 }),
    );
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();
    this.startLoop();
  }

  /**
   * Replaces the current object with a parametric furniture piece. Pass
   * `frame: false` to keep the current camera (e.g. during slider edits).
   */
  showFurniture(spec: FurnitureSpec, options?: { frame?: boolean }): FurnitureLayout {
    const layout = buildLayout(spec);
    const material = this.materials.get(this.assignments.get('*') ?? 'oak');
    const group = buildGroup(layout, material);
    this.swapObject(group, options?.frame ?? true);
    this.currentLayout = layout;
    this.reapplyAssignments();
    return layout;
  }

  /** Loads a glTF/GLB/OBJ/FBX/STL model and replaces the current object. */
  async loadModel(source: string | File, options?: LoadModelOptions): Promise<void> {
    const group = await loadModel(source, options);
    this.swapObject(group);
    this.currentLayout = null;
  }

  /**
   * Atelier3D extension: shows an externally built object (the design-bridge
   * group). The caller owns mesh naming and base material assignment; studio
   * overrides applied via setMaterial are re-applied across rebuilds.
   */
  showObject(object: THREE.Object3D, options?: { frame?: boolean }): void {
    this.swapObject(object, options?.frame ?? true);
    this.currentLayout = null;
    this.reapplyAssignments();
  }

  /** Atelier3D extension: drops every studio material override. */
  clearMaterialOverrides(): void {
    this.assignments.clear();
  }

  listMaterials(): MaterialInfo[] {
    return this.materials.list();
  }

  listLightingPresets() {
    return LIGHTING_PRESETS;
  }

  /** Unique part/mesh names of the current object, for per-part materials. */
  listParts(): string[] {
    if (!this.currentObject) return [];
    const names = new Set<string>();
    this.currentObject.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name) names.add(child.name);
    });
    return [...names];
  }

  /**
   * Applies a library material to the whole piece, or to every part with the
   * given name (e.g. "Tabletop", "Leg", "Door").
   */
  setMaterial(materialId: string, partName?: string): void {
    const material = this.materials.get(materialId);
    if (partName) {
      this.assignments.set(partName, materialId);
    } else {
      this.assignments.clear();
      this.assignments.set('*', materialId);
    }
    if (!this.currentObject) return;
    this.currentObject.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        !child.userData.isGlass &&
        (!partName || child.name === partName)
      ) {
        child.material = material;
      }
    });
  }

  setLighting(preset: LightingPresetId): void {
    this.scene.remove(this.lightRig);
    this.lightRig.traverse((child) => {
      if (child instanceof THREE.Light) child.dispose();
    });
    this.lightRig = createLightRig(preset);
    this.scene.add(this.lightRig);
    this.fitShadows();
  }

  setBackground(value: string | 'transparent'): void {
    this.scene.background = value === 'transparent' ? null : new THREE.Color(value);
  }

  /**
   * Regenerates procedural textures at a new resolution (e.g. 4096 for full
   * 4K textures) and reapplies them to the current object.
   */
  setTextureResolution(size: number): void {
    if (size === this.materials.resolution) return;
    this.materials.setResolution(size);
    this.reapplyAssignments();
  }

  /** Renders a high-quality still (default 3840×2160 PNG) of the current view. */
  async renderSnapshot(options?: SnapshotOptions): Promise<Blob> {
    return renderSnapshot(
      {
        scene: this.scene,
        camera: this.camera,
        toneMapping: this.renderer.toneMapping,
        toneMappingExposure: this.renderer.toneMappingExposure,
        makeEnvironment: (renderer) => this.makeEnvironment(renderer),
      },
      options,
    );
  }

  /**
   * Build plan (cut list, hardware, workflow steps) for the current
   * parametric piece, or null if an imported model is being shown.
   */
  getBuildPlan(): BuildPlan | null {
    return this.currentLayout ? generateBuildPlan(this.currentLayout.spec) : null;
  }

  /** Current parametric layout, or null for imported models. */
  getLayout(): FurnitureLayout | null {
    return this.currentLayout;
  }

  /**
   * Positions the camera on an orbit around the current object: azimuth 0°
   * faces the front, elevation is degrees above the horizon, and
   * distanceFactor scales the auto-framed distance (1 = nicely framed).
   */
  setCameraOrbit(azimuthDeg: number, elevationDeg: number, distanceFactor = 1): void {
    if (!this.currentObject) return;
    const box = new THREE.Box3().setFromObject(this.currentObject);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const base = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15;
    const distance = base * distanceFactor;
    const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
    const elevation = THREE.MathUtils.degToRad(elevationDeg);
    this.camera.position.set(
      center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      center.y + distance * Math.sin(elevation),
      center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.controls.target.copy(center);
    this.controls.update();
  }

  /** Repositions the camera to frame the current object nicely. */
  frameObject(): void {
    if (!this.currentObject) return;
    const box = new THREE.Box3().setFromObject(this.currentObject);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15;
    const direction = new THREE.Vector3(0.72, 0.42, 1).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.controls.update();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.swapObject(null);
    this.scene.environment?.dispose();
    this.materials.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return environment;
  }

  private reapplyAssignments(): void {
    if (!this.currentObject) return;
    const base = this.assignments.get('*');
    if (base) this.setMaterial(base);
    for (const [part, materialId] of this.assignments) {
      if (part !== '*') this.setMaterial(materialId, part);
    }
  }

  private swapObject(next: THREE.Object3D | null, frame = true): void {
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
      this.currentObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
    }
    this.currentObject = next;
    if (next) {
      this.scene.add(next);
      if (frame) this.frameObject();
      this.fitShadows();
    }
  }

  /**
   * Tightens shadow frustums around the current object — a fixed furniture-
   * room frustum wastes shadow-map resolution and serrates shadow edges on
   * shallow profile slopes.
   */
  private fitShadows(): void {
    if (!this.currentObject) return;
    const box = new THREE.Box3().setFromObject(this.currentObject);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(0.4, sphere.radius * 1.4);
    this.lightRig.traverse((child) => {
      if (child instanceof THREE.DirectionalLight && child.castShadow) {
        const cam = child.shadow.camera;
        cam.left = -r;
        cam.right = r;
        cam.top = r;
        cam.bottom = -r;
        cam.updateProjectionMatrix();
        child.shadow.needsUpdate = true;
      }
    });
  }

  private handleResize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      this.animationHandle = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}
