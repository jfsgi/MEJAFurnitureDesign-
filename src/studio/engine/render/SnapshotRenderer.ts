import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface SnapshotOptions {
  /** Output width in pixels. Defaults to 3840 (4K UHD). */
  width?: number;
  /** Output height in pixels. Defaults to 2160 (4K UHD). */
  height?: number;
  /**
   * Supersampling factor: the scene renders at width×factor before being
   * downsampled, which acts as high-quality anti-aliasing. Defaults to 2
   * (a 7680×4320 internal render for 4K output).
   */
  supersample?: number;
  /** Render with a transparent background (PNG alpha). */
  transparent?: boolean;
  /**
   * Screen-space ambient occlusion: soft contact shading wherever parts
   * meet — the single biggest photographic cue. Defaults on (opaque
   * backgrounds only; the AO pass has no alpha).
   */
  ssao?: boolean;
  /** Photographic finish: subtle vignette and fine grain. Defaults on. */
  photoFinish?: boolean;
  /** 'image/png' (default) or 'image/jpeg'. */
  mimeType?: string;
  quality?: number;
}

export interface SnapshotContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Tone mapping / exposure copied from the interactive renderer. */
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  /**
   * Recreates the IBL environment inside the snapshot's GL context. PMREM
   * environment textures live on the GPU of the context that generated them,
   * so the interactive renderer's environment cannot be reused here.
   */
  makeEnvironment?: (renderer: THREE.WebGLRenderer) => THREE.Texture;
}

const MAX_DIMENSION = 16384;

/**
 * Camera-response touches that read as photography instead of CG: a gentle
 * radial vignette and fine luminance grain (≈ high-ISO sensor noise).
 */
function applyPhotoFinish(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.45,
    width / 2,
    height / 2,
    Math.hypot(width, height) * 0.62,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  for (let i = 0; i < data.length; i += 4) {
    const n = rand() * 5;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Renders a high-quality still of the scene at the requested resolution
 * (default 3840×2160) using a dedicated offscreen WebGL context with
 * supersampling, independent of the interactive viewport size.
 */
export async function renderSnapshot(
  context: SnapshotContext,
  options: SnapshotOptions = {},
): Promise<Blob> {
  const width = options.width ?? 3840;
  const height = options.height ?? 2160;
  const requested = Math.max(1, options.supersample ?? 2);
  const supersample = Math.min(
    requested,
    MAX_DIMENSION / width,
    MAX_DIMENSION / height,
  );
  const renderWidth = Math.round(width * supersample);
  const renderHeight = Math.round(height * supersample);

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: options.transparent ?? false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(renderWidth, renderHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = context.toneMapping;
  renderer.toneMappingExposure = context.toneMappingExposure;

  const scene = context.scene;
  const previousEnvironment = scene.environment;
  const previousBackground = scene.background;
  let snapshotEnvironment: THREE.Texture | null = null;

  try {
    if (context.makeEnvironment) {
      snapshotEnvironment = context.makeEnvironment(renderer);
      scene.environment = snapshotEnvironment;
    }
    if (options.transparent) {
      scene.background = null;
    }

    const camera = context.camera.clone();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const useSsao = (options.ssao ?? true) && !options.transparent;
    if (useSsao) {
      const composer = new EffectComposer(renderer);
      composer.setSize(renderWidth, renderHeight);
      composer.addPass(new RenderPass(scene, camera));
      const ssao = new SSAOPass(scene, camera, renderWidth, renderHeight);
      // Furniture-scale contact shading: tight radius, gentle strength.
      ssao.kernelRadius = 0.06;
      ssao.minDistance = 0.0004;
      ssao.maxDistance = 0.04;
      composer.addPass(ssao);
      composer.addPass(new OutputPass());
      composer.render();
      composer.dispose();
    } else {
      renderer.render(scene, camera);
    }

    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0, renderWidth, renderHeight, 0, 0, width, height);

    if ((options.photoFinish ?? true) && !options.transparent) {
      applyPhotoFinish(ctx, width, height);
    }

    return await new Promise<Blob>((resolve, reject) => {
      output.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Snapshot encoding failed'))),
        options.mimeType ?? 'image/png',
        options.quality,
      );
    });
  } finally {
    scene.environment = previousEnvironment;
    scene.background = previousBackground;
    snapshotEnvironment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
