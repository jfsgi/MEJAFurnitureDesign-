import { useEffect } from 'react';
import { startAutosave, useStore } from './core/store';
import { snapMM } from './core/units';
import { Viewport } from './viewport/Viewport';
import { viewport } from './viewport/viewportApi';
import { TopBar } from './ui/TopBar';
import { LibraryPanel, DND_MIME } from './ui/LibraryPanel';
import { Inspector } from './ui/Inspector';
import { StatusBar } from './ui/StatusBar';
import { Toast } from './ui/Toast';
import { DocumentsView } from './ui/DocumentsView';
import { LibraryIcon, PanelRightIcon } from './ui/icons';

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable]');
}

export default function App() {
  const workspace = useStore((s) => s.workspace);
  const libraryOpen = useStore((s) => s.libraryOpen);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const docName = useStore((s) => s.doc.name);

  useEffect(() => startAutosave(), []);
  useEffect(() => {
    document.title = `${docName} — Atelier3D`;
  }, [docName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (isTypingTarget(e.target) || mod) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (s.selectedId) s.removeInstance(s.selectedId);
          break;
        case 'Escape':
          s.select(null);
          break;
        case 'f':
        case 'F':
          viewport.api?.frameSelection();
          break;
        case '1':
          viewport.api?.setView('front');
          break;
        case '3':
          viewport.api?.setView('right');
          break;
        case '7':
          viewport.api?.setView('top');
          break;
        case '0':
          viewport.api?.setView('hero');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        {workspace === 'documents' ? (
          <DocumentsView />
        ) : (
          <>
            {libraryOpen ? (
              <LibraryPanel />
            ) : (
              <div className="rail">
                <button
                  className="btn btn--icon"
                  onClick={() => useStore.getState().setLibraryOpen(true)}
                  title="Show library"
                  aria-label="Show library panel"
                >
                  <LibraryIcon />
                </button>
              </div>
            )}
            <div
              className="viewport-wrap"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DND_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(DND_MIME);
                if (!id) return;
                e.preventDefault();
                const s = useStore.getState();
                const pt = viewport.api?.groundPoint(e.clientX, e.clientY) ?? [0, 0];
                const pos: [number, number] = s.snap
                  ? [snapMM(pt[0], s.doc.units), snapMM(pt[1], s.doc.units)]
                  : pt;
                s.addInstance(id, pos);
              }}
            >
              <Viewport />
            </div>
            {inspectorOpen ? (
              <Inspector />
            ) : (
              <div className="rail">
                <button
                  className="btn btn--icon"
                  onClick={() => useStore.getState().setInspectorOpen(true)}
                  title="Show inspector"
                  aria-label="Show inspector panel"
                >
                  <PanelRightIcon />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <StatusBar />
      <Toast />
    </div>
  );
}
