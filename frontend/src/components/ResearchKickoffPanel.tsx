import { useState, type FormEvent } from 'react';
import type { ProjectItem } from '../api/apiClient.types';

export interface ResearchKickoffPanelProps {
  items: ProjectItem[];
  testMode: boolean;
  onKickoff: (input: { mode: 'need-research' | 'custom'; itemIds?: string[]; testMode: boolean }) => void;
  onClose: () => void;
}

/** Re-kickoff flow, modeled on AgentKickoffPanel.tsx: "Marked Need research"
 * (default) vs "Custom" (an explicit item selection). */
export function ResearchKickoffPanel({ items, testMode, onKickoff, onClose }: ResearchKickoffPanelProps) {
  const [mode, setMode] = useState<'need-research' | 'custom'>('need-research');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useTestMode, setUseTestMode] = useState(testMode);

  const needResearchCount = items.filter((i) => i.action === 'need-research').length;

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'custom' && selected.size === 0) return;
    onKickoff({ mode, itemIds: mode === 'custom' ? [...selected] : undefined, testMode: useTestMode });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal kickoff-modal" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <p className="modal__title">✨ Kick off agentic research</p>
          <button type="button" className="modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="field">
          <label>Which items?</label>
          <div className="column-checklist">
            <label className="checkbox-field">
              <input type="radio" name="kickoff-mode" checked={mode === 'need-research'} onChange={() => setMode('need-research')} />
              Marked &ldquo;Need research&rdquo; ({needResearchCount})
            </label>
            <label className="checkbox-field">
              <input type="radio" name="kickoff-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} />
              Custom selection
            </label>
          </div>
        </div>

        {mode === 'custom' && (
          <div className="details-table-wrap" style={{ maxHeight: 240 }}>
            <div className="details-table-scroll">
              <table className="details-table">
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                      </td>
                      <td>{item.subtitleText || <em>Visual only</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <label className="checkbox-field">
          <input type="checkbox" checked={useTestMode} onChange={(e) => setUseTestMode(e.target.checked)} />
          Test mode (mock research agent, no real Gemini/Parallel calls)
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={mode === 'need-research' ? needResearchCount === 0 : selected.size === 0}>
            Kick off
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
