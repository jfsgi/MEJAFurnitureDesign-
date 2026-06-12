// Studio workspace: the design rendered by the vendored 4K graphics engine —
// PBR materials, studio lighting, and 4K snapshot export ("the render is the
// product", docs/01 pillar 4).

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import {
  FurnitureEngine,
  LIGHTING_PRESETS,
  type LightingPresetId,
  type MaterialInfo,
} from './engine';
import { buildStudioGroup } from './bridge';
import { brandSnapshot } from './branding';
import { DownloadIcon } from '../ui/icons';

const BACKGROUNDS = [
  { value: 'studio', label: 'Studio' },
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
  const [background, setBackground] = useState<string>('studio');
  const [textureSize, setTextureSize] = useState(2048);
  const [rendering, setRendering] = useState(false);
  const [materialsList, setMaterialsList] = useState<MaterialInfo[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const [targetPart, setTargetPart] = useState('*');
  const [panelStock, setPanelStock] = useState('birchply');
  const [ssao, setSsao] = useState(true);
  const [photoFinish, setPhotoFinish] = useState(true);
  const [resetTick, setResetTick] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new FurnitureEngine({
      container: containerRef.current,
      textureSize: 2048,
      lighting: 'studio',
    });
    engineRef.current = engine;
    setMaterialsList(engine.listMaterials());
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
    engine.setPanelMaterial(panelStock);
    framedRef.current = true;
    const names = engine.listParts();
    setParts(names);
    setTargetPart((part) => (part === '*' || names.includes(part) ? part : '*'));
  }, [doc, textureSize, resetTick]);

  useEffect(() => {
    engineRef.current?.setLighting(lighting);
  }, [lighting]);
  useEffect(() => {
    engineRef.current?.setPanelMaterial(panelStock);
  }, [panelStock]);
  useEffect(() => {
    engineRef.current?.setBackground(background);
  }, [background]);

  const render4K = async () => {
    const engine = engineRef.current;
    if (!engine || rendering) return;
    setRendering(true);
    try {
      const blob = await brandSnapshot(await engine.renderSnapshot({ ssao, photoFinish }));
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

          <h4 className="panel-heading">Materials</h4>
          <select
            className="input"
            value={targetPart}
            onChange={(e) => setTargetPart(e.target.value)}
            aria-label="Apply material to"
          >
            <option value="*">Whole scene</option>
            {parts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div className="swatches" role="group" aria-label="Studio materials">
            {materialsList.map((m) => (
              <button
                key={m.id}
                className="swatch"
                style={{ background: m.swatch }}
                title={m.label}
                aria-label={`Apply ${m.label}`}
                onClick={() =>
                  engineRef.current?.setMaterial(m.id, targetPart === '*' ? undefined : targetPart)
                }
              />
            ))}
          </div>
          <button
            className="btn"
            onClick={() => {
              engineRef.current?.clearMaterialOverrides();
              setResetTick((t) => t + 1);
            }}
          >
            Reset to design materials
          </button>

          <h4 className="panel-heading">Panel stock</h4>
          <select
            className="input"
            value={panelStock}
            onChange={(e) => setPanelStock(e.target.value)}
            aria-label="Sheet-goods stock (drawer bottoms, back panels)"
          >
            {materialsList
              .filter((m) => m.category === 'wood' || m.category === 'scanned')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
          </select>

          <div className="studio-render">
            <label className="studio-toggle">
              <input type="checkbox" checked={ssao} onChange={(e) => setSsao(e.target.checked)} />
              Contact shading (SSAO)
            </label>
            <label className="studio-toggle">
              <input
                type="checkbox"
                checked={photoFinish}
                onChange={(e) => setPhotoFinish(e.target.checked)}
              />
              Photo finish (vignette + grain)
            </label>
            <button className="btn btn--primary" onClick={render4K} disabled={rendering}>
              <DownloadIcon /> {rendering ? 'Rendering…' : 'Render 4K PNG'}
            </button>
            <p className="studio-render-hint">
              3840 × 2160, supersampled, from the current camera view — stamped with the
              MEJA plate and distribution notice.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
