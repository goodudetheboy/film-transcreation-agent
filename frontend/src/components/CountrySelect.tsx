import { useEffect, useRef, useState } from 'react';
import { COUNTRIES } from '../data/countries';
import { Flag } from './Flag';

export interface CountrySelectProps {
  id?: string;
  value: string;
  onChange: (country: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** A styled, searchable country picker — replaces a bare text input with a
 * button that opens a flag+name list, filterable by typing. Stores the plain
 * country name (e.g. "Japan") via onChange, same shape the free-text input
 * used to produce, so callers and the backend need no changes. */
export function CountrySelect({ id, value, onChange, disabled, placeholder = 'Select a country…' }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = COUNTRIES.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus after the panel mounts so the click that opened it doesn't blur it.
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  function choose(name: string) {
    onChange(name);
    setOpen(false);
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight].name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="country-select" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="country-select__button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <Flag code={selected.code} className="country-select__flag" />
            <span className="country-select__name">{selected.name}</span>
          </>
        ) : value ? (
          <span className="country-select__name">{value}</span>
        ) : (
          <span className="country-select__placeholder">{placeholder}</span>
        )}
        <span className="country-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="country-select__panel">
          <input
            ref={searchRef}
            type="text"
            className="country-select__search"
            placeholder="Search countries…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <ul className="country-select__list" role="listbox">
            {filtered.length === 0 && <li className="country-select__empty">No matches</li>}
            {filtered.map((c, i) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.name === value}
                  className={`country-select__option${i === highlight ? ' country-select__option--highlight' : ''}${c.name === value ? ' country-select__option--selected' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(c.name)}
                >
                  <Flag code={c.code} className="country-select__flag" />
                  <span className="country-select__name">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
