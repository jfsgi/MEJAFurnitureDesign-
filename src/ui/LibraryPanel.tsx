// Left panel: Library (curated components, drag to canvas) and Outline (scene list).

import { useMemo, useState } from 'react';
import type { ComponentDef } from '../core/types';
import { CATEGORIES, REGISTRY } from '../core/components/registry';
import { defaultParams, evaluateInstance, modelBBox } from '../core/evaluate';
import { formatLengthBare } from '../core/units';
import { useStore } from '../core/store';
import { CloseIcon, SearchIcon, WarningIcon } from './icons';

export const DND_MIME = 'application/x-atelier-component';

const defSizeCache = new Map<string, [number, number, number] | null>();
function defSize(def: ComponentDef): [number, number, number] | null {
  if (!defSizeCache.has(def.id)) {
    try {
      const box = modelBBox(def.generate(defaultParams(def)));
      defSizeCache.set(
        def.id,
        box
          ? [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]]
          : null,
      );
    } catch {
      defSizeCache.set(def.id, null);
    }
  }
  return defSizeCache.get(def.id) ?? null;
}

function Glyph({ category }: { category: string }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <svg className="lib-glyph" width="30" height="30" viewBox="0 0 28 28" aria-hidden="true">
      {category === 'Tables' && (
        <g {...stroke}>
          <path d="M3 9.5h22" />
          <path d="M5.5 9.5 5 21M22.5 9.5l.5 11.5" />
        </g>
      )}
      {category === 'Storage' && (
        <g {...stroke}>
          <rect x="5" y="4" width="18" height="20" rx="1" />
          <path d="M5 11h18M5 17.5h18" />
        </g>
      )}
      {category === 'Legs' && (
        <g {...stroke}>
          <path d="M11.5 4h5l-2.2 20h-1.6z" />
        </g>
      )}
      {category === 'Boards & panels' && (
        <g {...stroke}>
          <path d="M4 16l14-6 6 2.5-14 6z" />
          <path d="M4 16v2.5l6 2.5v-2.5M24 12.5V15l-14 6" />
        </g>
      )}
    </svg>
  );
}

function LibraryTab() {
  const units = useStore((s) => s.doc.units);
  const { addInstance } = useStore.getState();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const categories = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        ...cat,
        components: cat.components.filter(
          (c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
        ),
      })).filter((cat) => cat.components.length > 0),
    [q],
  );

  return (
    <>
      <div className="panel-search">
        <SearchIcon />
        <input
          className="panel-search-input"
          placeholder="Search components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search components"
        />
        {query && (
          <button className="btn btn--bare" onClick={() => setQuery('')} aria-label="Clear search">
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="panel-scroll">
        {categories.length === 0 && (
          <div className="empty-state">
            <p>Nothing matches “{query}”.</p>
          </div>
        )}
        {categories.map((cat) => (
          <section key={cat.name} className="lib-section">
            <h3 className="panel-heading">{cat.name}</h3>
            {cat.components.map((def) => {
              const size = defSize(def);
              return (
                <div
                  key={def.id}
                  className="lib-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, def.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDoubleClick={() => addInstance(def.id)}
                  title={`${def.description}\nDrag into the scene, or double-click to add.`}
                >
                  <Glyph category={def.category} />
                  <div className="lib-card-text">
                    <div className="lib-card-name">{def.name}</div>
                    {size && (
                      <div className="lib-card-dims">
                        {formatLengthBare(size[0], units)} × {formatLengthBare(size[1], units)} ×{' '}
                        {formatLengthBare(size[2], units)}
                        {units === 'imperial' ? '″' : ' mm'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}

function OutlineTab() {
  const instances = useStore((s) => s.doc.instances);
  const selectedId = useStore((s) => s.selectedId);
  const { select, hover } = useStore.getState();

  if (instances.length === 0) {
    return (
      <div className="empty-state">
        <p>The scene is empty.</p>
        <p className="empty-hint">Drag a component in from the Library tab.</p>
      </div>
    );
  }
  return (
    <div className="panel-scroll">
      {instances.map((inst) => {
        const warnings = evaluateInstance(inst).findings.length;
        return (
          <button
            key={inst.id}
            className={`outline-row${selectedId === inst.id ? ' outline-row--selected' : ''}`}
            onClick={() => select(inst.id)}
            onMouseEnter={() => hover(inst.id)}
            onMouseLeave={() => hover(null)}
          >
            <span className="outline-name">{inst.name}</span>
            <span className="outline-meta">
              {warnings > 0 && (
                <span className="outline-warning" title={`${warnings} design check warning(s)`}>
                  <WarningIcon />
                </span>
              )}
              {REGISTRY[inst.componentId]?.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function LibraryPanel() {
  const [tab, setTab] = useState<'library' | 'outline'>('library');
  const { setLibraryOpen } = useStore.getState();

  return (
    <aside className="panel panel--left">
      <div className="panel-tabs">
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          Library
        </button>
        <button className={tab === 'outline' ? 'active' : ''} onClick={() => setTab('outline')}>
          Outline
        </button>
        <span className="panel-tabs-spacer" />
        <button
          className="btn btn--bare"
          onClick={() => setLibraryOpen(false)}
          title="Hide panel"
          aria-label="Hide library panel"
        >
          <CloseIcon />
        </button>
      </div>
      {tab === 'library' ? <LibraryTab /> : <OutlineTab />}
    </aside>
  );
}
