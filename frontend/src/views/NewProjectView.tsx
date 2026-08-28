import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject } from '../api/projectsApiClient';

export interface NewProjectViewProps {
  passcode: string;
}

interface DraftItem {
  scriptLine: string;
  sceneDescription: string;
}

function emptyItem(): DraftItem {
  return { scriptLine: '', sceneDescription: '' };
}

export function NewProjectView({ passcode }: NewProjectViewProps) {
  const navigate = useNavigate();
  const [country, setCountry] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addRow() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const validItems = items.filter((i) => i.scriptLine.trim() !== '' || i.sceneDescription.trim() !== '');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (country.trim() === '' || validItems.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject({ passcode, country, items: validItems });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create project');
      setSubmitting(false);
    }
  }

  return (
    <div className="app-body-inner">
      <div className="page-header__heading">
        <h1 className="page-header__title">New Project</h1>
      </div>
      <form onSubmit={handleSubmit} className="new-project-form">
        <div className="field">
          <label htmlFor="country">Target country</label>
          <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>

        <div className="field">
          <label>Details (script line + scene / video segment)</label>
          <div className="item-rows">
            {items.map((item, i) => (
              <div className="item-row-form" key={i}>
                <input
                  type="text"
                  placeholder="Script line"
                  aria-label={`Script line ${i + 1}`}
                  value={item.scriptLine}
                  onChange={(e) => updateItem(i, { scriptLine: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Scene / video segment description"
                  aria-label={`Scene description ${i + 1}`}
                  value={item.sceneDescription}
                  onChange={(e) => updateItem(i, { sceneDescription: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => removeRow(i)}
                  disabled={items.length === 1}
                  aria-label={`Remove detail ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn" onClick={addRow}>
            + Add detail
          </button>
        </div>

        {error && <p className="passcode-gate__error">{error}</p>}

        <button
          type="submit"
          className="btn btn--primary"
          disabled={submitting || country.trim() === '' || validItems.length === 0}
        >
          {submitting ? 'Creating…' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
