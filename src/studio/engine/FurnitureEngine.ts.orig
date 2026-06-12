import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateBuildPlan, type BuildPlan } from './buildplan/buildplan.js';
import { loadModel, type LoadModelOptions } from './loaders/ModelLoader.js';
import { createLightRig, LIGHTING_PRESETS, type LightingPresetId } from './lighting/presets.js';
import { MaterialLibrary, type MaterialInfo, type ScannedMaterialDef } from './materials/MaterialLibrary.js';
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
  private panelMaterialId = 'birchply';
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private animationHandle = 0;

  constructor(options: FurnitureEngineOptions) {
    this.container = options.container;
    this.materials = new MaterialLibrary(options.textureSize ?? 2048);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
    // Softer key-to-ambient ratio: most of the "CG look" is ambient that's
    // too dark against a hard key.
    this.scene.environmentIntensity = 0.58;
    this.setBackground(options.background ?? 'studio');

    this.lightRig = createLightRig(options.lighting ?? 'studio');
    this.scene.add(this.lightRig);

    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.26 }),
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

  listMaterials(): MaterialInfo[] {
    return this.materials.list();
  }

  /**
   * Registers a photo-scanned material (tileable maps produced by
   * scripts/process-texture.py). Available to setMaterial immediately.
   */
  registerScannedMaterial(def: ScannedMaterialDef): void {
    this.materials.addScanned(def);
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
        // Sheet-goods parts keep the panel material unless targeted by name.
        (partName ? child.name === partName : !child.userData.materialHint)
      ) {
        child.material = material;
      }
    });
  }

  /**
   * Material for sheet-goods parts — drawer bottoms and back panels —
   * which default to birch ply instead of the piece's primary wood.
   */
  setPanelMaterial(materialId: string): void {
    this.panelMaterialId = materialId;
    this.applyPanelMaterial();
  }

  private applyPanelMaterial(): void {
    if (!this.currentObject) return;
    const material = this.materials.get(this.panelMaterialId);
    this.currentObject.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.userData.materialHint === 'ply' &&
        !this.assignments.has(child.name)
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
    if (value === 'transparent') {
      this.scene.background = null;
      return;
    }
    if (value === 'studio') {
      // Seamless-backdrop gradient: lighter behind the piece, falling off
      // toward the edges — reads as a lit cyclorama instead of a void.
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, '#34373e');
      gradient.addColorStop(0.45, '#272a30');
      gradient.addColorStop(1, '#101114');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 512);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
      return;
    }
    this.scene.background = new THREE.Color(value);
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
    // Purpose-built photo studio instead of the generic room: a dark shell
    // with large softboxes whose reflections sweep across flat panels the
    // way real strobes through fabric do.
    const studio = new THREE.Scene();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(16, 9, 16),
      new THREE.MeshBasicMaterial({ color: 0x16181c, side: THREE.BackSide }),
    );
    shell.position.y = 3.5;
    studio.add(shell);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2c2e33 }),
    );
    floor.position.y = -0.95;
    studio.add(floor);

    const softbox = (
      w: number,
      h: number,
      color: number,
      intensity: number,
      position: [number, number, number],
    ) => {
      const material = new THREE.MeshBasicMaterial();
      material.color.set(color).multiplyScalar(intensity);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      panel.position.set(...position);
      panel.lookAt(0, 0.8, 0);
      studio.add(panel);
    };
    softbox(5, 3.5, 0xfff1de, 9, [-4.5, 4.2, 3.2]); // warm key, upper left
    softbox(4.2, 3, 0xdfe8ff, 2.2, [4.6, 2.6, 3.6]); // cool fill, right
    softbox(5, 1.3, 0xffffff, 6, [0.5, 4.6, -4.4]); // rim strip behind
    softbox(3, 2, 0xffffff, 0.9, [0, 0.9, 5]); // bounce card at camera

    const environment = pmrem.fromScene(studio, 0.07).texture;
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
    this.applyPanelMaterial();
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
