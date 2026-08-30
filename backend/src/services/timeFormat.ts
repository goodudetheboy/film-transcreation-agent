const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;

/** Parses an SRT/VTT cue timecode ("00:01:23,456" or "00:01:23.456") to milliseconds. */
export function parseTimecodeToMs(timecode: string): number {
  const match = TIMECODE.exec(timecode.trim());
  if (!match) throw new Error(`invalid subtitle timecode: ${timecode}`);
  const [, h, m, s, ms] = match;
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
}
