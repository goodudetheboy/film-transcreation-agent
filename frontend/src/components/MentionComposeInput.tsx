import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { CHAT_REFERENCE_MIME, chipDisplayText, formatReferenceToken, type ChatReference } from '../utils/chatReferences';
import { formatClock } from '../utils/timeFormat';

export interface MentionComposeInputProps {
  /** Called with the fully-serialized message text (chips already turned into
   * their bracket-token form) when the user submits — Enter, or the parent's
   * own Send button via the exposed `submit()` handle. */
  onSubmit: (text: string) => void;
  /** The current tab's Detail rows or Project items, pre-converted to
   * references — the @ dropdown filters this client-side, no new fetch. */
  mentionable: ChatReference[];
  videoSelection?: { startMs: number; endMs: number } | null;
  placeholder?: string;
  disabled?: boolean;
}

export interface MentionComposeInputHandle {
  submit: () => void;
  /** Replaces the compose box's content with plain text and focuses it —
   * for the quick-prompt buttons, which fill the box without sending. */
  setText: (text: string) => void;
}

const ZERO_WIDTH_SPACE = '​';
const MAX_DROPDOWN_ITEMS = 20;

function referenceKey(ref: ChatReference): string {
  if (ref.type === 'detail') return `detail:${ref.rowId}`;
  if (ref.type === 'projectItem') return `projectItem:${ref.itemId}`;
  return `video:${ref.startMs}-${ref.endMs}`;
}

function referenceSearchText(ref: ChatReference): string {
  const label = ref.type === 'video' ? 'current video selection' : ref.label;
  return `${label} ${formatClock(ref.startMs)}`.toLowerCase();
}

/** A chip is a contentEditable={false} span nested inside the
 * contentEditable={true} root — the standard technique that makes modern
 * browsers treat it as one atomic unit for cursor movement and backspace,
 * with no custom key-handling needed for chip deletion. */
function buildChipNode(ref: ChatReference): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'mention-chip';
  span.contentEditable = 'false';
  span.dataset.refType = ref.type;
  span.dataset.startMs = String(ref.startMs);
  span.dataset.endMs = String(ref.endMs);
  if (ref.type === 'detail') {
    span.dataset.rowId = ref.rowId;
    span.dataset.label = ref.label;
  } else if (ref.type === 'projectItem') {
    span.dataset.itemId = ref.itemId;
    span.dataset.label = ref.label;
  }
  span.textContent = chipDisplayText(ref);
  return span;
}

function chipNodeToReference(el: HTMLElement): ChatReference | null {
  const type = el.dataset.refType;
  const startMs = Number(el.dataset.startMs);
  const endMs = Number(el.dataset.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (type === 'detail') return { type: 'detail', rowId: el.dataset.rowId ?? '', startMs, endMs, label: el.dataset.label ?? '' };
  if (type === 'projectItem') return { type: 'projectItem', itemId: el.dataset.itemId ?? '', startMs, endMs, label: el.dataset.label ?? '' };
  if (type === 'video') return { type: 'video', startMs, endMs };
  return null;
}

/** Recomputed from scratch on every input/cursor-move rather than tracked
 * incrementally — simpler and more robust than trying to keep a persisted
 * "trigger position" in sync across arbitrary edits. Only detects an `@`
 * within the same text node as the cursor, which is deliberate: an `@`
 * separated from the cursor by a chip (a different node) should never
 * false-trigger. */
function findMentionQuery(root: HTMLElement): { range: Range; query: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;
  const textBeforeCursor = (node.textContent ?? '').slice(0, range.startOffset);
  const atIndex = textBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;
  const query = textBeforeCursor.slice(atIndex + 1);
  if (/\s/.test(query)) return null;
  const mentionRange = document.createRange();
  mentionRange.setStart(node, atIndex);
  mentionRange.setEnd(node, range.startOffset);
  return { range: mentionRange, query };
}

/** Replaces the plain `<input type="text">` in both chat panels with an
 * uncontrolled contentEditable that supports `@`-mention autocomplete and
 * drag-and-drop, rendering references as inline pill chips. Deliberately
 * uncontrolled (the browser owns the DOM/cursor; React only reaches in
 * imperatively via Range/Selection APIs to insert a chip or read content at
 * submit time) — a React-state-driven rebuild on every keystroke is the
 * classic way to make a custom rich editor's cursor jump. */
export const MentionComposeInput = forwardRef<MentionComposeInputHandle, MentionComposeInputProps>(function MentionComposeInput(
  { onSubmit, mentionable, videoSelection, placeholder, disabled },
  forwardedRef,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropdown, setDropdown] = useState<{ left: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo<ChatReference[]>(() => {
    if (!videoSelection) return mentionable;
    return [{ type: 'video', startMs: videoSelection.startMs, endMs: videoSelection.endMs }, ...mentionable];
  }, [mentionable, videoSelection]);

  const filtered = useMemo(() => {
    if (!dropdown) return [];
    const q = dropdown.query.toLowerCase();
    const matches = q ? items.filter((ref) => referenceSearchText(ref).includes(q)) : items;
    return matches.slice(0, MAX_DROPDOWN_ITEMS);
  }, [items, dropdown]);

  useEffect(() => {
    setActiveIndex(0);
  }, [dropdown?.query]);

  useEffect(() => {
    if (!dropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setDropdown(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdown]);

  function refreshMentionState() {
    const root = rootRef.current;
    const wrapper = wrapperRef.current;
    if (!root || !wrapper) return;
    const found = findMentionQuery(root);
    if (!found) {
      setDropdown(null);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const caretRect = found.range.getBoundingClientRect();
    setDropdown({ left: Math.max(0, caretRect.left - wrapperRect.left), query: found.query });
  }

  function insertChip(ref: ChatReference, range: Range) {
    range.deleteContents();
    const chip = buildChipNode(ref);
    range.insertNode(chip);
    const spacer = document.createTextNode(ZERO_WIDTH_SPACE);
    chip.after(spacer);

    const sel = window.getSelection();
    const newRange = document.createRange();
    newRange.setStart(spacer, spacer.length);
    newRange.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(newRange);
    rootRef.current?.focus();
  }

  function pickMention(ref: ChatReference) {
    const root = rootRef.current;
    const found = root ? findMentionQuery(root) : null;
    if (found) {
      insertChip(ref, found.range);
    } else if (root) {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      insertChip(ref, range);
    }
    setDropdown(null);
  }

  function serialize(): string {
    const root = rootRef.current;
    if (!root) return '';
    let text = '';
    for (const node of Array.from(root.childNodes)) {
      if (node instanceof HTMLElement && node.dataset.refType) {
        const ref = chipNodeToReference(node);
        text += ref ? formatReferenceToken(ref) : '';
      } else {
        text += node.textContent ?? '';
      }
    }
    return text.replaceAll(ZERO_WIDTH_SPACE, '').trim();
  }

  function handleSubmit() {
    const text = serialize();
    if (!text) return;
    onSubmit(text);
    if (rootRef.current) rootRef.current.innerHTML = '';
    setDropdown(null);
  }

  function setText(text: string) {
    const root = rootRef.current;
    if (!root) return;
    root.textContent = text;
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  useImperativeHandle(forwardedRef, () => ({ submit: handleSubmit, setText }));

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (dropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filtered[activeIndex]) {
        e.preventDefault();
        pickMention(filtered[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdown(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    // Force plain-text paste — rich/HTML paste would insert arbitrary
    // elements that serialize()'s childNodes walk doesn't know how to read.
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(CHAT_REFERENCE_MIME)) return;
    e.preventDefault();
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    const raw = e.dataTransfer.getData(CHAT_REFERENCE_MIME);
    setDragOver(false);
    if (!raw) return;
    e.preventDefault();
    let ref: ChatReference;
    try {
      ref = JSON.parse(raw);
    } catch {
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const dropRange = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    let range: Range;
    if (dropRange && root.contains(dropRange.startContainer)) {
      range = dropRange;
    } else {
      range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
    }
    insertChip(ref, range);
  }

  return (
    <div
      ref={wrapperRef}
      className={`mention-compose${dragOver ? ' mention-compose--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div
        ref={rootRef}
        className="mention-compose__input"
        contentEditable={!disabled}
        data-placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onInput={refreshMentionState}
        onKeyUp={refreshMentionState}
        onClick={refreshMentionState}
        onPaste={handlePaste}
        suppressContentEditableWarning
      />
      {dropdown && (
        <div className="mention-dropdown" style={{ left: dropdown.left }}>
          {filtered.length === 0 ? (
            <p className="mention-dropdown__empty">No matches</p>
          ) : (
            filtered.map((ref, i) => (
              <button
                key={referenceKey(ref)}
                type="button"
                className={`mention-dropdown__item${i === activeIndex ? ' mention-dropdown__item--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(ref);
                }}
              >
                <span>{chipDisplayText(ref)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
