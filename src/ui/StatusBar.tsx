import { useStore } from '../core/store';
import { viewport } from '../viewport/viewportApi';
import { FrameIcon, SnapIcon } from './icons';

export function StatusBar() {
  const units = useStore((s) => s.doc.units);
  const snap = useStore((s) => s.snap);
  const workspace = useStore((s) => s.workspace);
  const { setUnits, toggleSnap } = useStore.getState();

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

      <div className="statusbar-hint">
        {workspace === 'design'
          ? 'Right-drag orbit · Middle-drag pan · Scroll zoom · Drag parts to move'
          : 'Documents regenerate live from the model'}
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
