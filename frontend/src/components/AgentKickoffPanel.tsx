import { useState, type FormEvent } from 'react';
import { BUILTIN_COLUMN_LABELS, type ColumnDoc, type DiscoveryJob } from '../api/apiClient.types';
import { createDiscoveryJob } from '../api/filmsApiClient';

export interface AgentKickoffPanelProps {
  filmId: string;
  passcode: string;
  testMode: boolean;
  existingAgentNumbers: number[];
  columns: ColumnDoc[];
  onCreated: (job: DiscoveryJob) => void;
  onClose: () => void;
}

const DEFAULT_COLUMNS = ['segmentDescription', 'gesture'];

/** Kicking off a pass is a modal, not an inline panel — matches the
 * wireframe's dedicated "Kick off Discover agent" dialog. */
export function AgentKickoffPanel({ filmId, passcode, testMode, existingAgentNumbers, columns, onCreated, onClose }: AgentKickoffPanelProps) {
  const [agentChoice, setAgentChoice] = useState<string>('new');
  const [name, setName] = useState('');
  const [specialInstruction, setSpecialInstruction] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allColumns = [
    ...Object.entries(BUILTIN_COLUMN_LABELS).map(([key, label]) => ({ key, label })),
    ...columns.map((c) => ({ key: c.key, label: c.name })),
  ];

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedColumns.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const job = await createDiscoveryJob(filmId, {
        passcode,
        agentNumber: agentChoice === 'new' ? undefined : Number(agentChoice),
        name: name.trim() || undefined,
        specialInstruction,
        targetColumns: selectedColumns,
        testMode,
      });
      onCreated(job);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to kick off agent');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form className="modal kickoff-modal" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <p className="modal__title">Kick off Discover agent to find new line?</p>
          <button type="button" className="modal__close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </div>

        <div className="field">
          <label htmlFor="agent-choice">Agent name</label>
          <select id="agent-choice" value={agentChoice} onChange={(e) => setAgentChoice(e.target.value)}>
            <option value="new">New agent (Agent #{existingAgentNumbers.length + 1})</option>
            {existingAgentNumbers.map((n) => (
              <option key={n} value={n}>
                Agent #{n} (new pass)
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="agent-name">Label (optional)</label>
          <input id="agent-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="special-instruction">Special instruction</label>
          <input
            id="special-instruction"
            type="text"
            placeholder="Focus on the first half, second half, …"
            value={specialInstruction}
            onChange={(e) => setSpecialInstruction(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Metadata column for AI agent to add more details?</label>
          <div className="column-checklist">
            {allColumns.map((c) => (
              <label key={c.key} className="checkbox-field">
                <input type="checkbox" checked={selectedColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="passcode-gate__error">{error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={submitting || selectedColumns.length === 0}>
            {submitting ? 'Kicking off…' : 'Kick off agent'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
