import type { CaptioningClient, GestureLog } from './captioningClient.js';

/**
 * Canned response for local dev/demoing without Google Cloud credentials or
 * live API cost. Illustrates why gesture logging matters for localization: a
 * thumbs-up or OK sign reads differently (or offensively) in some cultures —
 * that interpretation is a later step, this only logs what physically happens.
 */
const MOCK_GESTURE_LOGS: GestureLog[] = [
  {
    timecode: '00:04',
    gesture: 'Gives a thumbs-up while smiling',
    character: 'RILEY',
    narrativeLoad: 'load_bearing',
    backgroundNote: '',
  },
  {
    timecode: '00:13',
    gesture: 'Makes an OK sign with one hand',
    character: 'JORDAN',
    narrativeLoad: 'supporting',
    backgroundNote: 'A "World\'s Best Boss" mug is visible on the desk behind them.',
  },
  {
    timecode: '00:22',
    gesture: 'Shakes head slowly',
    character: 'RILEY',
    narrativeLoad: 'incidental',
    backgroundNote: '',
  },
];

export function createMockCaptioningClient(): CaptioningClient {
  return {
    async preprocessVideo() {
      return MOCK_GESTURE_LOGS;
    },
  };
}
