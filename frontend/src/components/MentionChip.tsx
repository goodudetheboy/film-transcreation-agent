import { chipDisplayText, type ChatReference } from '../utils/chatReferences';

export interface MentionChipProps {
  reference: ChatReference;
}

/** One reference chip — rendered identically whether it's live inside the
 * compose box (contentEditable={false}, an atomic unit for cursor movement/
 * backspace) or read-only inside a redisplayed past message. */
export function MentionChip({ reference }: MentionChipProps) {
  return (
    <span className="mention-chip" contentEditable={false}>
      {chipDisplayText(reference)}
    </span>
  );
}
