import { useState } from 'react';
import type { EnrichedProject, Film } from '../api/apiClient.types';
import { Modal } from './Modal';

export type PickerTarget = ({ kind: 'film' } & Film) | ({ kind: 'project' } & EnrichedProject);

export interface EntityPickerModalProps {
  autoCreate: 'agent' | 'session';
  films: Film[];
  projects: EnrichedProject[];
  onPick: (target: PickerTarget) => void;
  onClose: () => void;
}

/** Lets the global Agents tab's "Create Agent"/"Create Session" buttons pick a
 * target film or project before handing off to that workspace's own
 * create-flow (see FilmWorkspaceView.tsx/ProjectPanel.tsx's autoCreate query
 * param handling) — this modal never creates anything itself, it only picks
 * where the real per-workspace creation logic (from the naming-split work)
 * should run. */
export function EntityPickerModal({ autoCreate, films, projects, onPick, onClose }: EntityPickerModalProps) {
  const [tab, setTab] = useState<'film' | 'project'>('film');

  return (
    <Modal title={`${autoCreate === 'agent' ? 'Create Agent' : 'Create Session'} — pick a target`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`btn${tab === 'film' ? ' btn--primary' : ''}`} onClick={() => setTab('film')}>
          Film (Discovery)
        </button>
        <button type="button" className={`btn${tab === 'project' ? ' btn--primary' : ''}`} onClick={() => setTab('project')}>
          Project (Research)
        </button>
      </div>

      <div className="chat-panel__library" style={{ maxHeight: 320 }}>
        {tab === 'film' &&
          (films.length === 0 ? (
            <p className="results-placeholder">No films yet.</p>
          ) : (
            films.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                className="chat-panel__library-item"
                onClick={() => onPick({ kind: 'film', ...f })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick({ kind: 'film', ...f })}
              >
                <span className="chat-panel__library-item-name">{f.title}</span>
              </div>
            ))
          ))}
        {tab === 'project' &&
          (projects.length === 0 ? (
            <p className="results-placeholder">No projects yet.</p>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                className="chat-panel__library-item"
                onClick={() => onPick({ kind: 'project', ...p })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick({ kind: 'project', ...p })}
              >
                <span className="chat-panel__library-item-name">{p.name}</span>
                <span className="chat-panel__library-item-meta">{p.country}</span>
              </div>
            ))
          ))}
      </div>
    </Modal>
  );
}
