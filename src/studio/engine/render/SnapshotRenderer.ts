import * as THREE from 'three';

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

    renderer.render(scene, camera);

    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0, renderWidth, renderHeight, 0, 0, width, height);

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
