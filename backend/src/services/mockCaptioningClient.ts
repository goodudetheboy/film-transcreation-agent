import type { CaptioningClient, CaptioningResult, DialogueLine, GestureLog } from './captioningClient.js';

/**
 * Canned response for local dev/demoing without Google Cloud credentials or
 * live API cost. Illustrates why gesture logging matters for localization: a
 * thumbs-up or OK sign reads differently (or offensively) in some cultures —
 * that interpretation is a later step, this only logs what physically happens
 * and what is said.
 */
const MOCK_DIALOGUE: DialogueLine[] = [
  { timecode: '00:01', character: 'RILEY', text: "You've got this." },
  { timecode: '00:04', character: 'JORDAN', text: 'Thanks, I needed that.' },
  { timecode: '00:22', character: 'RILEY', text: "I'm not so sure anymore." },
];

const MOCK_GESTURE_LOGS: GestureLog[] = [
  {
    timecode: '00:04',
    character: 'RILEY',
    gesture: 'Gives a thumbs-up while smiling',
    expression: '',
    narrativeLoad: 'load_bearing',
    backgroundNote: '',
  },
  {
    timecode: '00:13',
    character: 'JORDAN',
    gesture: 'Makes an OK sign with one hand',
    expression: 'Smirking',
    narrativeLoad: 'supporting',
    backgroundNote: 'A "World\'s Best Boss" mug is visible on the desk behind them.',
  },
  {
    timecode: '00:22',
    character: 'RILEY',
    gesture: 'Shakes head slowly',
    expression: '',
    narrativeLoad: 'incidental',
    backgroundNote: '',
  },
];

export function createMockCaptioningClient(): CaptioningClient {
  return {
    async preprocessVideo(): Promise<CaptioningResult> {
      return { dialogue: MOCK_DIALOGUE, gestures: MOCK_GESTURE_LOGS };
    },
  };
}
