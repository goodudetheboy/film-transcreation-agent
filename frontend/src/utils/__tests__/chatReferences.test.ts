import { describe, it, expect } from 'vitest';
import { formatReferenceToken, parseMessageTokens, truncateLabel, type ChatReference } from '../chatReferences';

describe('formatReferenceToken', () => {
  it('formats a detail reference with its label', () => {
    const ref: ChatReference = { type: 'detail', rowId: 'row-1', startMs: 12_000, endMs: 15_000, label: 'a subtitle line' };
    expect(formatReferenceToken(ref)).toBe('[Detail 00:12–00:15: "a subtitle line"]');
  });

  it('formats a projectItem reference as "Item"', () => {
    const ref: ChatReference = { type: 'projectItem', itemId: 'item-1', startMs: 5_000, endMs: 8_000, label: 'hello' };
    expect(formatReferenceToken(ref)).toBe('[Item 00:05–00:08: "hello"]');
  });

  it('formats a video reference with no label', () => {
    const ref: ChatReference = { type: 'video', startMs: 72_000, endMs: 78_000 };
    expect(formatReferenceToken(ref)).toBe('[Video 01:12–01:18]');
  });

  it('truncates a long label', () => {
    const long = 'a'.repeat(60);
    const ref: ChatReference = { type: 'detail', rowId: 'row-1', startMs: 0, endMs: 1000, label: long };
    const token = formatReferenceToken(ref);
    expect(token).toContain('…');
    expect(token).not.toContain(long);
  });
});

describe('truncateLabel', () => {
  it('leaves a short label untouched', () => {
    expect(truncateLabel('short')).toBe('short');
  });

  it('trims whitespace', () => {
    expect(truncateLabel('  padded  ')).toBe('padded');
  });
});

describe('parseMessageTokens', () => {
  it('round-trips a formatted reference back into an equivalent chip segment', () => {
    const ref: ChatReference = { type: 'detail', rowId: 'row-1', startMs: 12_000, endMs: 15_000, label: 'a subtitle line' };
    const token = formatReferenceToken(ref);
    const segments = parseMessageTokens(token);
    expect(segments).toEqual([{ type: 'chip', ref: { type: 'detail', rowId: '', startMs: 12_000, endMs: 15_000, label: 'a subtitle line' } }]);
  });

  it('splits surrounding text from a chip in the middle of a message', () => {
    const segments = parseMessageTokens('hey, about this [Video 00:12–00:18] can you look at it?');
    expect(segments).toEqual([
      { type: 'text', value: 'hey, about this ' },
      { type: 'chip', ref: { type: 'video', startMs: 12_000, endMs: 18_000 } },
      { type: 'text', value: ' can you look at it?' },
    ]);
  });

  it('returns a single text segment when there are no references', () => {
    expect(parseMessageTokens('just plain text')).toEqual([{ type: 'text', value: 'just plain text' }]);
  });

  it('handles multiple references in one message', () => {
    const segments = parseMessageTokens('[Detail 00:01–00:02: "a"] and [Item 00:03–00:04: "b"]');
    expect(segments.filter((s) => s.type === 'chip')).toHaveLength(2);
    expect(segments.map((s) => s.type)).toEqual(['chip', 'text', 'chip']);
  });

  it('handles an hour-plus timestamp range', () => {
    const ref: ChatReference = { type: 'video', startMs: 3_661_000, endMs: 3_665_000 };
    const segments = parseMessageTokens(formatReferenceToken(ref));
    expect(segments).toEqual([{ type: 'chip', ref }]);
  });
});
