import { useMemo } from 'react';
import { useStore } from '../core/store';
import { evaluateInstance, modelBBox } from '../core/evaluate';
import { formatLength } from '../core/units';
import { viewport } from '../viewport/viewportApi';
import { FrameIcon, SnapIcon } from './icons';

export function StatusBar() {
  const units = useStore((s) => s.doc.units);
  const snap = useStore((s) => s.snap);
  const workspace = useStore((s) => s.workspace);
  const zoomArmed = useStore((s) => s.zoomWindowArmed);
  const hoveredId = useStore((s) => s.hoveredId);
  const selectedId = useStore((s) => s.selectedId);
  const instances = useStore((s) => s.doc.instances);
  const { setUnits, toggleSnap } = useStore.getState();

  // Part awareness: whatever the cursor is over (else the selection) reads out
  // its name, overall size, part count, and any findings.
  const readout = useMemo(() => {
    const inst = instances.find((i) => i.id === (hoveredId ?? selectedId));
    if (!inst) return null;
    const model = evaluateInstance(inst);
    const box = modelBBox(model);
    if (!box) return null;
    const dim = (i: number) => formatLength(box.max[i] - box.min[i], units);
    const warn = model.findings.length > 0 ? ` · ⚠ ${model.findings.length}` : '';
    return `${inst.name} — ${dim(0)} W × ${dim(1)} D × ${dim(2)} H · ${model.parts.length} part${model.parts.length === 1 ? '' : 's'}${warn}`;
  }, [instances, hoveredId, selectedId, units]);

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        <div className="seg seg--small" aria-label="Units">
          <button className={units === 'imperial' ? 'active' : ''} onClick={() => setUnits('imperial')} title="Imperial (fractional inches)">
            in
          </button>
          <button className={units === 'metric' ? 'active' : ''} onClick={() => setUnits('metric')} title="Metric (millimeters)">
            mm
          </button>
        </div>
        <button
          className={`btn btn--toggle${snap ? ' btn--toggle-on' : ''}`}
          onClick={toggleSnap}
          title={`Snap to grid: ${snap ? 'on' : 'off'}`}
          aria-pressed={snap}
        >
          <SnapIcon /> Snap
        </button>
      </div>

      <div className={`statusbar-hint${readout && workspace === 'design' ? ' statusbar-hint--active' : ''}`}>
        {workspace !== 'design'
          ? 'Documents regenerate live from the model'
          : zoomArmed
            ? 'Zoom window: drag a box around what you want to see — Esc cancels'
            : (readout ??
              'Right-drag orbit · Middle-drag pan · Scroll zoom · Drag parts to move')}
      </div>

      <div className="statusbar-group">
        <div className="seg seg--small" aria-label="Standard views">
          <button onClick={() => viewport.api?.setView('front')} title="Front view — 1">
            Front
          </button>
          <button onClick={() => viewport.api?.setView('right')} title="Right view — 3">
            Right
          </button>
          <button onClick={() => viewport.api?.setView('top')} title="Top view — 7">
            Top
          </button>
          <button onClick={() => viewport.api?.setView('hero')} title="Hero view — 0">
            Hero
          </button>
        </div>
        <button
          className="btn btn--toggle"
          onClick={() => viewport.api?.frameAll()}
          title="Frame everything — double-click canvas"
          aria-label="Frame everything"
        >
          <FrameIcon />
        </button>
      </div>
    </footer>
  );
}
