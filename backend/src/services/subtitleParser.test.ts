import { describe, it, expect } from 'vitest';
import { parseSrt, parseVtt, parseSubtitleFile } from './subtitleParser.js';

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello there.

2
00:00:05,500 --> 00:00:07,000
Second line,
wrapped onto two rows.
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello there.

00:00:05.500 --> 00:00:07.000
Second line, wrapped onto two rows.
`;

describe('parseSrt', () => {
  it('parses cue blocks into ordered entries with ms-precision start/end', () => {
    const entries = parseSrt(SRT);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ index: 0, startMs: 1000, endMs: 4000, text: 'Hello there.' });
    expect(entries[1]).toMatchObject({ index: 1, startMs: 5500, endMs: 7000 });
    expect(entries[1].text).toBe('Second line, wrapped onto two rows.');
  });

  it('assigns each entry a unique id', () => {
    const entries = parseSrt(SRT);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});

describe('parseVtt', () => {
  it('strips the WEBVTT header and parses cues the same way as SRT', () => {
    const entries = parseVtt(VTT);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ startMs: 1000, endMs: 4000, text: 'Hello there.' });
  });
});

describe('parseSubtitleFile', () => {
  it('dispatches to the right parser by format', () => {
    expect(parseSubtitleFile(SRT, 'srt')).toHaveLength(2);
    expect(parseSubtitleFile(VTT, 'vtt')).toHaveLength(2);
  });

  it('throws when no cues are found', () => {
    expect(() => parseSubtitleFile('not a subtitle file', 'srt')).toThrow(/no subtitle entries/);
  });
});
