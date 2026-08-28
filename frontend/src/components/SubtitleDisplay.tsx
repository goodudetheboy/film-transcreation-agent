import type { SubtitleEntry } from '../api/apiClient.types';

export interface SubtitleDisplayProps {
  entries: SubtitleEntry[];
  currentTimeMs: number;
}

export function SubtitleDisplay({ entries, currentTimeMs }: SubtitleDisplayProps) {
  const active = entries.find((e) => currentTimeMs >= e.startMs && currentTimeMs < e.endMs);
  return <p className="subtitle-display">{active ? active.text : ''}</p>;
}
