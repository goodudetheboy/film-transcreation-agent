/** Formats milliseconds as "MM:SS" (or "HH:MM:SS" past an hour) for display. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/;

/** Parses "MM:SS" or "HH:MM:SS" back to milliseconds. Returns null if unparseable. */
export function parseClockToMs(text: string): number | null {
  const match = CLOCK.exec(text.trim());
  if (!match) return null;
  const [, h, m, s] = match;
  return ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000;
}
