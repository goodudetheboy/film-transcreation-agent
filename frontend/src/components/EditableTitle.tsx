import { useState, type KeyboardEvent } from 'react';
import { PencilIcon } from './icons';

export interface EditableTitleProps {
  value: string;
  onSave: (name: string) => Promise<void>;
}

/**
 * A chat panel's title bar: plain text with a pencil-icon affordance that
 * swaps it for a text input. Enter/blur saves, Escape cancels. Shared by
 * DiscoveryChatPanel and ResearchChatPanel so the edit-state/keydown logic
 * isn't duplicated across both ~500-line files.
 */
export function EditableTitle({ value, onSave }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void commit();
    else if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="text"
        className="chat-panel__title-input"
        value={draft}
        autoFocus
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        aria-label="Agent name"
      />
    );
  }

  return (
    <div className="chat-panel__title">
      <span className="chat-panel__title-text">{value}</span>
      <button type="button" className="chat-panel__title-edit" aria-label="Rename" title="Rename" onClick={startEdit}>
        <PencilIcon />
      </button>
    </div>
  );
}
