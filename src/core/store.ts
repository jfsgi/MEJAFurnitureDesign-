// Application store: the parametric document (undoable) + UI state (not undoable).
// Every model mutation goes through commitDoc/previewDoc so undo history stays exact
// (UI standard §1.6). Gestures (scrubs/drags) snapshot once at start, commit once at end.

import { create } from 'zustand';
import type { ParamValue, ProjectDoc, Units } from './types';
import { REGISTRY } from './components/registry';
import { instanceBBox } from './evaluate';
import { inch } from './units';

const STORAGE_KEY = 'atelier3d.project.v1';
const HISTORY_LIMIT = 100;

export type Workspace = 'design' | 'studio' | 'documents';

export interface Toast {
  id: number;
  message: string;
  undoable: boolean;
}

interface State {
  doc: ProjectDoc;
  past: ProjectDoc[];
  future: ProjectDoc[];
  gestureBase: ProjectDoc | null;

  selectedId: string | null;
  hoveredId: string | null;
  workspace: Workspace;
  snap: boolean;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  toast: Toast | null;

  commitDoc(mutate: (doc: ProjectDoc) => void): void;
  previewDoc(mutate: (doc: ProjectDoc) => void): void;
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;

  select(id: string | null): void;
  hover(id: string | null): void;
  setWorkspace(w: Workspace): void;
  toggleSnap(): void;
  setLibraryOpen(open: boolean): void;
  setInspectorOpen(open: boolean): void;
  showToast(message: string, undoable?: boolean): void;
  dismissToast(): void;

  addInstance(componentId: string, position?: [number, number]): void;
  removeInstance(id: string): void;
  duplicateInstance(id: string): void;
  renameInstance(id: string, name: string): void;
  setParam(id: string, key: string, value: ParamValue, phase?: 'commit' | 'preview'): void;
  setPosition(id: string, position: [number, number], phase?: 'commit' | 'preview'): void;
  rotateInstance(id: string): void;
  setUnits(units: Units): void;
  setProjectName(name: string): void;
  loadDoc(doc: ProjectDoc): void;
}

function defaultDoc(): ProjectDoc {
  return {
    schema: 1,
    name: 'Untitled project',
    units: 'imperial',
    instances: [
      {
        id: crypto.randomUUID(),
        componentId: 'dining-table',
        name: 'Dining table',
        position: [0, 0],
        rotationZ: 0,
        params: {},
      },
    ],
  };
}

function loadInitialDoc(): ProjectDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as ProjectDoc;
      if (doc && doc.schema === 1 && Array.isArray(doc.instances)) return doc;
    }
  } catch {
    // Corrupt or unavailable storage — fall through to a fresh document.
  }
  return defaultDoc();
}

let toastSeq = 0;

export const useStore = create<State>()((set, get) => {
  const apply = (mutate: (doc: ProjectDoc) => void): ProjectDoc => {
    const doc = structuredClone(get().doc);
    mutate(doc);
    return doc;
  };

  const sanitizeSelection = (doc: ProjectDoc) => {
    const { selectedId } = get();
    if (selectedId && !doc.instances.some((i) => i.id === selectedId)) {
      set({ selectedId: null, hoveredId: null });
    }
  };

  return {
    doc: loadInitialDoc(),
    past: [],
    future: [],
    gestureBase: null,

    selectedId: null,
    hoveredId: null,
    workspace: 'design',
    snap: true,
    libraryOpen: true,
    inspectorOpen: true,
    toast: null,

    commitDoc(mutate) {
      const prev = get().doc;
      const doc = apply(mutate);
      set({ doc, past: [...get().past, prev].slice(-HISTORY_LIMIT), future: [] });
      sanitizeSelection(doc);
    },

    previewDoc(mutate) {
      set({ doc: apply(mutate) });
    },

    beginGesture() {
      set({ gestureBase: get().doc });
    },

    endGesture() {
      const { gestureBase, doc, past } = get();
      if (gestureBase && gestureBase !== doc) {
        set({ past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [], gestureBase: null });
      } else {
        set({ gestureBase: null });
      }
    },

    undo() {
      const { past, doc, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future] });
      sanitizeSelection(prev);
    },

    redo() {
      const { past, doc, future } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: future.slice(1) });
      sanitizeSelection(next);
    },

    select: (id) => set({ selectedId: id }),
    hover: (id) => set({ hoveredId: id }),
    setWorkspace: (w) => set({ workspace: w }),
    toggleSnap: () => set({ snap: !get().snap }),
    setLibraryOpen: (open) => set({ libraryOpen: open }),
    setInspectorOpen: (open) => set({ inspectorOpen: open }),
    showToast: (message, undoable = false) => set({ toast: { id: ++toastSeq, message, undoable } }),
    dismissToast: () => set({ toast: null }),

    addInstance(componentId, position) {
      const def = REGISTRY[componentId];
      if (!def) return;
      const id = crypto.randomUUID();
      const siblings = get().doc.instances.filter((i) => i.componentId === componentId).length;
      const name = siblings === 0 ? def.name : `${def.name} ${siblings + 1}`;

      let pos = position;
      if (!pos) {
        // Drop to the right of everything already in the scene.
        let maxX = -Infinity;
        for (const inst of get().doc.instances) {
          const b = instanceBBox(inst);
          if (b) maxX = Math.max(maxX, b.max[0]);
        }
        pos = maxX === -Infinity ? [0, 0] : [maxX + inch(24), 0];
      }

      get().commitDoc((doc) => {
        doc.instances.push({ id, componentId, name, position: pos!, rotationZ: 0, params: {} });
      });
      set({ selectedId: id });
    },

    removeInstance(id) {
      const inst = get().doc.instances.find((i) => i.id === id);
      if (!inst) return;
      get().commitDoc((doc) => {
        doc.instances = doc.instances.filter((i) => i.id !== id);
      });
      get().showToast(`Deleted "${inst.name}"`, true);
    },

    duplicateInstance(id) {
      const src = get().doc.instances.find((i) => i.id === id);
      if (!src) return;
      const newId = crypto.randomUUID();
      const b = instanceBBox(src);
      const dx = b ? b.max[0] - b.min[0] + inch(6) : inch(24);
      get().commitDoc((doc) => {
        doc.instances.push({
          ...structuredClone(src),
          id: newId,
          name: `${src.name} copy`,
          position: [src.position[0] + dx, src.position[1]],
        });
      });
      set({ selectedId: newId });
    },

    renameInstance(id, name) {
      get().commitDoc((doc) => {
        const inst = doc.instances.find((i) => i.id === id);
        if (inst) inst.name = name.trim() || inst.name;
      });
    },

    setParam(id, key, value, phase = 'commit') {
      const mutate = (doc: ProjectDoc) => {
        const inst = doc.instances.find((i) => i.id === id);
        if (inst) inst.params[key] = value;
      };
      phase === 'commit' ? get().commitDoc(mutate) : get().previewDoc(mutate);
    },

    setPosition(id, position, phase = 'commit') {
      const mutate = (doc: ProjectDoc) => {
        const inst = doc.instances.find((i) => i.id === id);
        if (inst) inst.position = position;
      };
      phase === 'commit' ? get().commitDoc(mutate) : get().previewDoc(mutate);
    },

    rotateInstance(id) {
      get().commitDoc((doc) => {
        const inst = doc.instances.find((i) => i.id === id);
        if (inst) inst.rotationZ = (inst.rotationZ + Math.PI / 2) % (Math.PI * 2);
      });
    },

    setUnits(units) {
      get().commitDoc((doc) => {
        doc.units = units;
      });
    },

    setProjectName(name) {
      get().commitDoc((doc) => {
        doc.name = name.trim() || doc.name;
      });
    },

    loadDoc(doc) {
      set({ doc, past: [], future: [], selectedId: null, hoveredId: null });
    },
  };
});

/** Autosave wiring: call once from App. Returns the unsubscribe. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return useStore.subscribe((state, prev) => {
    if (state.doc === prev.doc) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doc));
      } catch {
        // Storage full/unavailable — autosave silently skips; manual save still works.
      }
    }, 500);
  });
}
