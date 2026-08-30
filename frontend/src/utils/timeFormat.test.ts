import { describe, it, expect } from 'vitest';
import { formatClock, parseClockToMs } from './timeFormat';

describe('formatClock', () => {
  it('formats sub-hour durations as MM:SS', () => {
    expect(formatClock(65_000)).toBe('01:05');
  });

  it('formats hour-plus durations as HH:MM:SS', () => {
    expect(formatClock(3_725_000)).toBe('01:02:05');
  });
});

describe('parseClockToMs', () => {
  it('parses MM:SS', () => {
    expect(parseClockToMs('01:05')).toBe(65_000);
  });

  it('parses HH:MM:SS', () => {
    expect(parseClockToMs('01:02:05')).toBe(3_725_000);
  });

  it('returns null for unparseable input', () => {
    expect(parseClockToMs('not a time')).toBeNull();
    expect(parseClockToMs('')).toBeNull();
  });
});
