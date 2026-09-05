import { useEffect } from 'react';

export interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small "are you sure?" dialog — used anywhere a destructive action
 * (delete a session, delete an agent, ...) needs confirmation before it
 * fires, matching the modal chrome NewProjectModal already established. */
export function ConfirmModal({ title, body, confirmLabel = 'Delete', busy = false, onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <p className="modal__title">{title}</p>
          <button type="button" className="modal__close" onClick={onCancel} disabled={busy}>
            ×
          </button>
        </div>
        <p className="hint-text">{body}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--ghost" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
