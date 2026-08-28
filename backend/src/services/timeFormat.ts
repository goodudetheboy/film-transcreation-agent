const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;

/** Parses an SRT/VTT cue timecode ("00:01:23,456" or "00:01:23.456") to milliseconds. */
export function parseTimecodeToMs(timecode: string): number {
  const match = TIMECODE.exec(timecode.trim());
  if (!match) throw new Error(`invalid subtitle timecode: ${timecode}`);
  const [, h, m, s, ms] = match;
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
}

/** Formats milliseconds as "MM:SS" (or "HH:MM:SS" past an hour) for display. */
export function formatMsAsTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
