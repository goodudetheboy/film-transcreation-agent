import { parseMessageTokens } from '../utils/chatReferences';
import { MentionChip } from './MentionChip';

export interface MessageWithReferencesProps {
  text: string;
}

/** Redisplays a sent user message, turning any reference bracket-tokens
 * (e.g. "[Detail 00:12–00:15: \"…\"]") back into read-only chips instead of
 * showing the raw text — the same tokens formatReferenceToken produced when
 * the message was composed. User bubbles otherwise get no rich rendering at
 * all (ChatMarkdown is only used for agent replies). */
export function MessageWithReferences({ text }: MessageWithReferencesProps) {
  const segments = parseMessageTokens(text);
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === 'text' ? <span key={i}>{segment.value}</span> : <MentionChip key={i} reference={segment.ref} />,
      )}
    </>
  );
}
