import { randomUUID } from 'node:crypto';
import type { SubtitleEntry } from './filmTypes.js';
import { parseTimecodeToMs } from './timeFormat.js';

const TIMING_LINE = /^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/;

function normalizeBlocks(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .filter((b) => b.trim() !== '');
}

/**
 * SRT and WebVTT cue blocks share the same shape once VTT's "WEBVTT" header is
 * stripped: an optional index line (SRT only), a "start --> end" timing line,
 * then one or more text lines — so both formats parse through the same scan.
 */
function parseCueBlocks(text: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  let index = 0;
  for (const block of normalizeBlocks(text)) {
    const lines = block.split('\n').map((l) => l.trim());
    const timingLineIdx = lines.findIndex((l) => TIMING_LINE.test(l));
    if (timingLineIdx === -1) continue;

    const match = TIMING_LINE.exec(lines[timingLineIdx])!;
    const cueText = lines
      .slice(timingLineIdx + 1)
      .join(' ')
      .trim();
    if (!cueText) continue;

    entries.push({
      id: randomUUID(),
      index: index++,
      startMs: parseTimecodeToMs(match[1]),
      endMs: parseTimecodeToMs(match[2]),
      text: cueText,
    });
  }
  return entries;
}

export function parseSrt(text: string): SubtitleEntry[] {
  return parseCueBlocks(text);
}

export function parseVtt(text: string): SubtitleEntry[] {
  // VTT timecodes use '.' before milliseconds where SRT uses ',' — parseTimecodeToMs
  // accepts either, so only the header needs stripping before reusing the same scan.
  const withoutHeader = text.replace(/^﻿?WEBVTT[^\n]*\n?/, '');
  return parseCueBlocks(withoutHeader);
}

export function parseSubtitleFile(text: string, format: 'srt' | 'vtt'): SubtitleEntry[] {
  const entries = format === 'srt' ? parseSrt(text) : parseVtt(text);
  if (entries.length === 0) {
    throw new Error(`no subtitle entries found in ${format.toUpperCase()} file`);
  }
  return entries;
}
