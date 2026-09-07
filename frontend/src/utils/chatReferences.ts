import type { DetailRow, ProjectItem } from '../api/apiClient.types';
import { formatClock, parseClockToMs } from './timeFormat';

/** A reference the user pointed at (via @-mention or drag-and-drop) to a
 * Detail row, a Project item, or a marked slice of video. Serializes to
 * plain, human-readable text on send (formatReferenceToken) — the model
 * resolves it the same way it already resolves "the row at 2:04" today,
 * via the FILM DETAILS/item context it's already given; a video reference
 * has no existing context to match, which is what the describe_video_segment
 * tool is for. */
export type ChatReference =
  | { type: 'detail'; rowId: string; startMs: number; endMs: number; label: string }
  | { type: 'projectItem'; itemId: string; startMs: number; endMs: number; label: string }
  | { type: 'video'; startMs: number; endMs: number };

export type MessageSegment = { type: 'text'; value: string } | { type: 'chip'; ref: ChatReference };

const MAX_LABEL_LENGTH = 26;

export function truncateLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > MAX_LABEL_LENGTH ? `${trimmed.slice(0, MAX_LABEL_LENGTH)}…` : trimmed;
}

function formatRange(startMs: number, endMs: number): string {
  return `${formatClock(startMs)}–${formatClock(endMs)}`;
}

export const REFERENCE_KIND_LABEL: Record<ChatReference['type'], string> = { detail: 'Detail', projectItem: 'Item', video: 'Video' };

/** Same fallback chain used for a Detail row's on-screen label wherever one
 * is needed (the scrubber's Details-track tooltip, a drag-and-drop chip's
 * label) — one place, so they can't drift apart. */
export function detailRowLabel(row: DetailRow): string {
  return row.subtitleText || row.values.segmentDescription || row.values.gesture || row.values.notes || '(untitled)';
}

export function detailRowReference(row: DetailRow): ChatReference {
  return { type: 'detail', rowId: row.id, startMs: row.startMs, endMs: row.endMs, label: detailRowLabel(row) };
}

export function projectItemReference(item: ProjectItem): ChatReference {
  return {
    type: 'projectItem',
    itemId: item.id,
    startMs: item.startMs,
    endMs: item.endMs,
    label: item.subtitleText || item.sceneDescription || '(untitled)',
  };
}

/** The text shown inside a chip — no enclosing brackets, unlike
 * formatReferenceToken below. Shared by MentionChip's React render and
 * MentionComposeInput's imperative DOM-built chip node, so a chip always
 * displays identically wherever it's built. */
export function chipDisplayText(ref: ChatReference): string {
  const range = formatRange(ref.startMs, ref.endMs);
  const label = ref.type !== 'video' ? `: "${truncateLabel(ref.label)}"` : '';
  return `${REFERENCE_KIND_LABEL[ref.type]} ${range}${label}`;
}

/** The human-readable text a chip becomes when a message is sent — kept as
 * the literal inverse of parseMessageTokens below, in this same file, so
 * what's sent and what's redisplayed can never drift apart. */
export function formatReferenceToken(ref: ChatReference): string {
  return `[${chipDisplayText(ref)}]`;
}

const CLOCK_PATTERN = '\\d{1,2}(?::\\d{2}){1,2}';
const TOKEN_REGEX = new RegExp(`\\[(Detail|Item|Video) (${CLOCK_PATTERN})–(${CLOCK_PATTERN})(?:: "([^"]*)")?\\]`, 'g');

const KIND_TO_TYPE: Record<string, ChatReference['type']> = { Detail: 'detail', Item: 'projectItem', Video: 'video' };

/** Splits a sent message's text into plain-text and reference-chip segments,
 * for redisplaying a past user message with real chips instead of raw
 * bracket text. Note: rowId/itemId aren't recoverable from parsed text —
 * a chip rebuilt this way is display-only, never a live link back to the
 * original row. */
export function parseMessageTokens(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text))) {
    const [full, kind, startText, endText, label] = match;
    const startMs = parseClockToMs(startText);
    const endMs = parseClockToMs(endText);
    if (startMs === null || endMs === null) continue;
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });

    const type = KIND_TO_TYPE[kind];
    const ref: ChatReference =
      type === 'video'
        ? { type: 'video', startMs, endMs }
        : type === 'detail'
          ? { type: 'detail', rowId: '', startMs, endMs, label: label ?? '' }
          : { type: 'projectItem', itemId: '', startMs, endMs, label: label ?? '' };
    segments.push({ type: 'chip', ref });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
}
