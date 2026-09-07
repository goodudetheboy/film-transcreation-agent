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

/** Custom drag-and-drop MIME type shared by every drag source (DetailsTable
 * rows, VideoScrubber's Details-track blocks and selection overlay, the
 * Project item table) and both compose boxes — no cross-component
 * coordination needed beyond agreeing on this one string. */
export const CHAT_REFERENCE_MIME = 'application/x-chat-reference';

const MAX_LABEL_LENGTH = 40;

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

/** Swaps the browser's native drag-ghost image — which otherwise shows a
 * snapshot of the whole dragged row/element — for a compact preview
 * matching the mention-chip's own look. This is the closest a web app can
 * get to "dragging a chip": the native drag image is a static bitmap
 * snapshot taken once at dragstart, not a live DOM node a CSS transition
 * could animate afterward. Call from every drag source's onDragStart,
 * alongside dataTransfer.setData. */
export function setChipDragImage(dataTransfer: DataTransfer, ref: ChatReference): void {
  const ghost = document.createElement('div');
  // A bolder, higher-contrast variant of the normal chip look — browsers
  // apply their own semi-transparency to any native drag-ghost image (a
  // fixed OS-level compositing behavior, not something CSS/setDragImage can
  // override), so the ghost needs extra contrast to still read clearly once
  // the browser dims it.
  ghost.className = 'mention-chip mention-chip--drag-ghost';
  ghost.textContent = chipDisplayText(ref);
  ghost.style.position = 'fixed';
  ghost.style.top = '-1000px';
  ghost.style.left = '-1000px';
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 12, 12);
  // The browser snapshots the ghost synchronously while handling dragstart —
  // safe to remove it right after, once that snapshot has been taken.
  setTimeout(() => ghost.remove(), 0);
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
