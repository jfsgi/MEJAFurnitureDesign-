// Studio workspace: the design rendered by the vendored 4K graphics engine —
// PBR materials, studio lighting, and 4K snapshot export ("the render is the
// product", docs/01 pillar 4).

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { FurnitureEngine, LIGHTING_PRESETS, type LightingPresetId } from './engine';
import { buildStudioGroup } from './bridge';
import { DownloadIcon } from '../ui/icons';

const BACKGROUNDS = [
  { value: '#22252a', label: 'Charcoal' },
  { value: '#e9e5de', label: 'Linen' },
  { value: 'transparent', label: 'None' },
] as const;

const CAMERAS = [
  { label: 'Front', azimuth: 0, elevation: 10 },
  { label: '3/4', azimuth: 35, elevation: 18 },
  { label: 'Profile', azimuth: 90, elevation: 10 },
  { label: 'High', azimuth: 30, elevation: 38 },
] as const;

export function StudioView() {
  const doc = useStore((s) => s.doc);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FurnitureEngine | null>(null);
  const framedRef = useRef(false);
  const [lighting, setLighting] = useState<LightingPresetId>('studio');
  const [background, setBackground] = useState<string>('#22252a');
  const [textureSize, setTextureSize] = useState(2048);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new FurnitureEngine({
      container: containerRef.current,
      textureSize: 2048,
      lighting: 'studio',
    });
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      framedRef.current = false;
      engine.dispose();
    };
  }, []);

  // The scene regenerates live from the model, same contract as Documents.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTextureResolution(textureSize);
    engine.showObject(buildStudioGroup(doc, engine.materials), { frame: !framedRef.current });
    framedRef.current = true;
  }, [doc, textureSize]);

  useEffect(() => {
    engineRef.current?.setLighting(lighting);
  }, [lighting]);
  useEffect(() => {
    engineRef.current?.setBackground(background);
  }, [background]);

  const render4K = async () => {
    const engine = engineRef.current;
    if (!engine || rendering) return;
    setRendering(true);
    try {
      const blob = await engine.renderSnapshot();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${doc.name.replace(/[^\w.-]+/g, '-')}-4k.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      useStore.getState().showToast('4K render saved');
    } catch {
      useStore.getState().showToast("Couldn't render — try a smaller texture size.");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="studio">
      <div className="studio-canvas" ref={containerRef} />
      <aside className="panel panel--right">
        <div className="panel-tabs">
          <span className="panel-title">Studio</span>
        </div>
        <div className="panel-scroll inspector">
          <h4 className="panel-heading">Lighting</h4>
          <div className="seg seg--small" aria-label="Lighting preset">
            {LIGHTING_PRESETS.map((p) => (
              <button
                key={p.id}
                className={lighting === p.id ? 'active' : ''}
                onClick={() => setLighting(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <h4 className="panel-heading">Background</h4>
          <div className="seg seg--small" aria-label="Background">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.value}
                className={background === b.value ? 'active' : ''}
                onClick={() => setBackground(b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>

          <h4 className="panel-heading">Camera</h4>
          <div className="seg seg--small" aria-label="Camera angle">
            {CAMERAS.map((c) => (
              <button
                key={c.label}
                onClick={() => engineRef.current?.setCameraOrbit(c.azimuth, c.elevation)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <h4 className="panel-heading">Texture detail</h4>
          <div className="seg seg--small" aria-label="Texture resolution">
            <button className={textureSize === 2048 ? 'active' : ''} onClick={() => setTextureSize(2048)}>
              2K · fast
            </button>
            <button className={textureSize === 4096 ? 'active' : ''} onClick={() => setTextureSize(4096)}>
              4K · full
            </button>
          </div>

          <div className="studio-render">
            <button className="btn btn--primary" onClick={render4K} disabled={rendering}>
              <DownloadIcon /> {rendering ? 'Rendering…' : 'Render 4K PNG'}
            </button>
            <p className="studio-render-hint">
              3840 × 2160, supersampled, from the current camera view.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
