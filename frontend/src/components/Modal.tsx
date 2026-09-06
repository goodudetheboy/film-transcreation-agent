import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  title: string;
  onClose: () => void;
  busy?: boolean;
  /** Extra class appended to "modal", for a wider/taller variant — same convention
   * as new-project-modal/kickoff-modal in index.css. */
  className?: string;
  children: ReactNode;
}

/** Shared modal chrome (backdrop, header, close button) — extracted from
 * ConfirmModal so a kickoff form or any other dialog content can use the same
 * shell instead of re-implementing the backdrop/header markup. */
export function Modal({ title, onClose, busy = false, className, children }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className={`modal${className ? ` ${className}` : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <p className="modal__title">{title}</p>
          <button type="button" className="modal__close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
