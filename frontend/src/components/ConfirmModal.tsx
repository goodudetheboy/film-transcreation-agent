import { Modal } from './Modal';

export interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small "are you sure?" dialog — used anywhere a destructive action
 * (delete a session, delete an agent, ...) needs confirmation before it fires. */
export function ConfirmModal({ title, body, confirmLabel = 'Delete', busy = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      <p className="hint-text">{body}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn--ghost" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
