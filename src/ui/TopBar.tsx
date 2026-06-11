import { useRef, useState } from 'react';
import type { ProjectDoc } from '../core/types';
import { useStore, type Workspace } from '../core/store';
import { DownloadIcon, FolderIcon, RedoIcon, UndoIcon } from './icons';

const WORKSPACES: { id: Workspace; label: string; disabled?: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'studio', label: 'Studio', disabled: 'Render studio arrives in Phase 2' },
  { id: 'documents', label: 'Documents' },
];

export function TopBar() {
  const doc = useStore((s) => s.doc);
  const workspace = useStore((s) => s.workspace);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setWorkspace, setProjectName, undo, redo, loadDoc, showToast } = useStore.getState();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveProject = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name.replace(/[^\w.-]+/g, '-')}.atelier3d.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ProjectDoc;
      if (parsed?.schema !== 1 || !Array.isArray(parsed.instances)) {
        throw new Error('not an Atelier3D project');
      }
      loadDoc(parsed);
      showToast(`Opened "${parsed.name}"`);
    } catch {
      showToast("Couldn't open that file — it doesn't look like an Atelier3D project.");
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-side topbar-side--left">
        <div className="logo" aria-label="Atelier3D">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#0F766E" />
            <path
              d="M7 17 12 6l5 11M9 13.5h6"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className="logo-name">Atelier3D</span>
        </div>
        <div className="topbar-divider" />
        <input
          className="project-name"
          value={nameDraft ?? doc.name}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== null && nameDraft.trim() && nameDraft !== doc.name) {
              setProjectName(nameDraft);
            }
            setNameDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          aria-label="Project name"
          spellCheck={false}
        />
      </div>

      <nav className="seg topbar-workspaces" aria-label="Workspace">
        {WORKSPACES.map((w) => (
          <button
            key={w.id}
            className={workspace === w.id ? 'active' : ''}
            disabled={!!w.disabled}
            title={w.disabled}
            onClick={() => setWorkspace(w.id)}
          >
            {w.label}
          </button>
        ))}
      </nav>

      <div className="topbar-side topbar-side--right">
        <button
          className="btn btn--icon"
          onClick={undo}
          disabled={!canUndo}
          title="Undo — Ctrl+Z"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          className="btn btn--icon"
          onClick={redo}
          disabled={!canRedo}
          title="Redo — Ctrl+Shift+Z"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
        <div className="topbar-divider" />
        <button
          className="btn btn--icon"
          onClick={() => fileRef.current?.click()}
          title="Open project…"
          aria-label="Open project"
        >
          <FolderIcon />
        </button>
        <button
          className="btn btn--icon"
          onClick={saveProject}
          title="Save project file"
          aria-label="Save project file"
        >
          <DownloadIcon />
        </button>
        <div className="topbar-divider" />
        <button className="btn btn--primary" disabled title="Render studio arrives in Phase 2">
          Render
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openProject(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
