import { useEffect } from 'react';
import { useStore } from '../core/store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const { dismissToast, undo } = useStore.getState();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 5000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.undoable && (
        <button
          className="toast-undo"
          onClick={() => {
            undo();
            dismissToast();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
