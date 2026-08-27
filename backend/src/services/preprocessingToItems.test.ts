import { describe, it, expect } from 'vitest';
import { preprocessingToItems } from './preprocessingToItems.js';

describe('preprocessingToItems', () => {
  it('interleaves dialogue and gesture entries chronologically by timecode', () => {
    const items = preprocessingToItems({
      dialogue: [
        { timecode: '00:10', character: 'Joy', text: 'Hello!' },
        { timecode: '00:01', character: 'Sadness', text: 'Oh no.' },
      ],
      gestures: [
        { timecode: '00:05', character: 'Joy', gesture: 'Waves', expression: 'Smiling', narrativeLoad: 'High', backgroundNote: '' },
      ],
    });

    expect(items).toEqual([
      { scriptLine: 'Oh no.', sceneDescription: 'Sadness speaking' },
      { scriptLine: '', sceneDescription: 'Waves, Smiling' },
      { scriptLine: 'Hello!', sceneDescription: 'Joy speaking' },
    ]);
  });

  it('falls back to a generic scene description when a gesture has no gesture/expression text', () => {
    const items = preprocessingToItems({
      dialogue: [],
      gestures: [
        { timecode: '00:01', character: 'Bing Bong', gesture: '', expression: '', narrativeLoad: 'Low', backgroundNote: '' },
      ],
    });

    expect(items).toEqual([{ scriptLine: '', sceneDescription: 'Bing Bong, no notable gesture' }]);
  });

  it('returns an empty list for empty preprocessing', () => {
    expect(preprocessingToItems({ dialogue: [], gestures: [] })).toEqual([]);
  });
});
