// Right panel: parameters of the selected component (UI standard §6 Inspector pattern).
// Basic params always visible; Advanced + Placement collapsed; Design Check at the bottom.

import { useState } from 'react';
import type { Instance, ParamDef } from '../core/types';
import { REGISTRY } from '../core/components/registry';
import { effectiveParams, evaluateInstance, modelBBox } from '../core/evaluate';
import { MATERIALS } from '../core/materials';
import { formatLength } from '../core/units';
import { useStore } from '../core/store';
import { DimensionInput } from './DimensionInput';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  MinusIcon,
  PlusIcon,
  RotateIcon,
  TrashIcon,
  WarningIcon,
} from './icons';

function ParamControl({ inst, def }: { inst: Instance; def: ParamDef }) {
  const units = useStore((s) => s.doc.units);
  const { setParam, beginGesture, endGesture } = useStore.getState();
  const params = effectiveParams(inst);
  const value = params[def.key];

  switch (def.kind) {
    case 'length':
      return (
        <DimensionInput
          label={def.label}
          mm={value as number}
          units={units}
          min={def.min}
          max={def.max}
          onCommit={(mm) => setParam(inst.id, def.key, mm)}
          onPreview={(mm) => setParam(inst.id, def.key, mm, 'preview')}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
        />
      );
    case 'count': {
      const n = value as number;
      const setCount = (next: number) => {
        if (next >= def.min && next <= def.max && next !== n) setParam(inst.id, def.key, next);
      };
      return (
        <div className="dim-field">
          <span className="dim-label">{def.label}</span>
          <div className="stepper">
            <button className="btn btn--bare" onClick={() => setCount(n - 1)} disabled={n <= def.min} aria-label={`Fewer ${def.label}`}>
              <MinusIcon />
            </button>
            <span className="stepper-value">{n}</span>
            <button className="btn btn--bare" onClick={() => setCount(n + 1)} disabled={n >= def.max} aria-label={`More ${def.label}`}>
              <PlusIcon />
            </button>
          </div>
        </div>
      );
    }
    case 'enum':
      return (
        <div className="dim-field">
          <span className="dim-label">{def.label}</span>
          {def.options.length <= 3 ? (
            <div className="seg seg--small">
              {def.options.map((o) => (
                <button
                  key={o.value}
                  className={value === o.value ? 'active' : ''}
                  onClick={() => setParam(inst.id, def.key, o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <select
              className="input"
              value={value as string}
              onChange={(e) => setParam(inst.id, def.key, e.target.value)}
            >
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      );
    case 'boolean':
      return (
        <div className="dim-field">
          <span className="dim-label">{def.label}</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => setParam(inst.id, def.key, e.target.checked)}
            />
            <span className="switch-track" />
          </label>
        </div>
      );
    case 'material':
      return (
        <div className="dim-field dim-field--top">
          <span className="dim-label">{def.label}</span>
          <div className="swatches" role="radiogroup" aria-label={def.label}>
            {MATERIALS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={value === m.id}
                className={`swatch${value === m.id ? ' swatch--selected' : ''}`}
                style={{ background: m.color }}
                title={m.name}
                onClick={() => setParam(inst.id, def.key, m.id)}
              />
            ))}
          </div>
        </div>
      );
  }
}

function SelectionInspector({ inst }: { inst: Instance }) {
  const units = useStore((s) => s.doc.units);
  const { renameInstance, duplicateInstance, removeInstance, rotateInstance, setPosition, beginGesture, endGesture, setInspectorOpen } =
    useStore.getState();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const def = REGISTRY[inst.componentId];
  const model = evaluateInstance(inst);
  const box = modelBBox(model);

  const basic = def?.params.filter((p) => p.tier === 'basic') ?? [];
  const advanced = def?.params.filter((p) => p.tier === 'advanced') ?? [];

  return (
    <>
      <div className="panel-tabs">
        <span className="panel-title">Inspector</span>
        <span className="panel-tabs-spacer" />
        <button
          className="btn btn--bare"
          onClick={() => setInspectorOpen(false)}
          title="Hide panel"
          aria-label="Hide inspector panel"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="panel-scroll inspector">
        <input
          className="inspector-name"
          value={nameDraft ?? inst.name}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== null && nameDraft.trim() && nameDraft !== inst.name) {
              renameInstance(inst.id, nameDraft);
            }
            setNameDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          aria-label="Component name"
          spellCheck={false}
        />
        <div className="inspector-sub">
          {def?.name ?? inst.componentId}
          {box && (
            <>
              {' · '}
              {formatLength(box.max[0] - box.min[0], units)} × {formatLength(box.max[1] - box.min[1], units)} ×{' '}
              {formatLength(box.max[2] - box.min[2], units)}
            </>
          )}
        </div>

        <section className="inspector-section">
          {basic.map((p) => (
            <ParamControl key={p.key} inst={inst} def={p} />
          ))}
        </section>

        <button className="expander" onClick={() => setAdvancedOpen(!advancedOpen)} aria-expanded={advancedOpen}>
          {advancedOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          Advanced
        </button>
        {advancedOpen && (
          <section className="inspector-section">
            {advanced.map((p) => (
              <ParamControl key={p.key} inst={inst} def={p} />
            ))}
            <h4 className="panel-heading">Placement</h4>
            <DimensionInput
              label="From center X"
              mm={inst.position[0]}
              units={units}
              min={-50000}
              max={50000}
              onCommit={(mm) => setPosition(inst.id, [mm, inst.position[1]])}
              onPreview={(mm) => setPosition(inst.id, [mm, inst.position[1]], 'preview')}
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
            />
            <DimensionInput
              label="From center Y"
              mm={inst.position[1]}
              units={units}
              min={-50000}
              max={50000}
              onCommit={(mm) => setPosition(inst.id, [inst.position[0], mm])}
              onPreview={(mm) => setPosition(inst.id, [inst.position[0], mm], 'preview')}
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
            />
            <div className="dim-field">
              <span className="dim-label">Rotation</span>
              <button className="btn" onClick={() => rotateInstance(inst.id)}>
                <RotateIcon /> Rotate 90°
              </button>
            </div>
          </section>
        )}

        <h4 className="panel-heading">Design check</h4>
        {model.findings.length === 0 ? (
          <div className="check-ok">
            <CheckIcon /> No issues found
          </div>
        ) : (
          model.findings.map((f, i) => (
            <div key={i} className="check-warning">
              <WarningIcon />
              <span>{f.message}</span>
            </div>
          ))
        )}

        <div className="inspector-actions">
          <button className="btn" onClick={() => duplicateInstance(inst.id)}>
            <CopyIcon /> Duplicate
          </button>
          <button className="btn btn--danger-ghost" onClick={() => removeInstance(inst.id)}>
            <TrashIcon /> Delete
          </button>
        </div>
      </div>
    </>
  );
}

export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const inst = useStore((s) => s.doc.instances.find((i) => i.id === selectedId));
  const { setInspectorOpen } = useStore.getState();

  return (
    <aside className="panel panel--right">
      {inst ? (
        <SelectionInspector key={inst.id} inst={inst} />
      ) : (
        <>
          <div className="panel-tabs">
            <span className="panel-title">Inspector</span>
            <span className="panel-tabs-spacer" />
            <button
              className="btn btn--bare"
              onClick={() => setInspectorOpen(false)}
              title="Hide panel"
              aria-label="Hide inspector panel"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="empty-state">
            <p>Nothing selected.</p>
            <p className="empty-hint">
              Click a piece in the scene to edit its dimensions and materials, or drag a new
              component in from the Library.
            </p>
            <ul className="hint-list">
              <li>
                <b>Right-drag</b> orbit
              </li>
              <li>
                <b>Middle-drag</b> pan
              </li>
              <li>
                <b>Scroll</b> zoom
              </li>
              <li>
                <b>F</b> frame selection
              </li>
              <li>
                <b>Double-click canvas</b> frame all
              </li>
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
