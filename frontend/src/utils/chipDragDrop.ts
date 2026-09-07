import { chipDisplayText, type ChatReference } from './chatReferences';

/**
 * Custom pointer-based drag-and-drop for chat reference chips — replaces
 * native HTML5 drag-and-drop for this specific interaction. Browsers apply
 * their own semi-transparency to any native drag-ghost image with no
 * override available (it's a frozen bitmap snapshot, not a live DOM node),
 * which read as broken on a demo recording. A plain DOM element under full
 * app control is fully opaque, can actually animate, and needs no
 * dataTransfer/MIME serialization — the reference just flows through a
 * closure.
 */

const DRAG_THRESHOLD_PX = 4;
const POP_IN_MS = 140;
const DROP_ZONE_CLASS = 'mention-compose--drag-over';

interface DropZone {
  el: HTMLElement;
  onDrop: (ref: ChatReference, clientX: number, clientY: number) => void;
}

const dropZones = new Set<DropZone>();

/** Call once per compose box, on mount — returns a cleanup function. */
export function registerChipDropZone(el: HTMLElement, onDrop: DropZone['onDrop']): () => void {
  const zone: DropZone = { el, onDrop };
  dropZones.add(zone);
  return () => dropZones.delete(zone);
}

function zoneAtPoint(x: number, y: number): DropZone | null {
  for (const zone of dropZones) {
    const rect = zone.el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return zone;
  }
  return null;
}

function setGhostTransform(ghost: HTMLElement, x: number, y: number, scale: number) {
  ghost.style.transform = `translate(${x + 14}px, ${y + 10}px) scale(${scale})`;
}

function createGhost(ref: ChatReference, x: number, y: number): HTMLDivElement {
  const ghost = document.createElement('div');
  ghost.className = 'mention-chip mention-chip--floating';
  ghost.textContent = chipDisplayText(ref);
  document.body.appendChild(ghost);
  // Pops in at the cursor rather than just appearing — a "materializes as a
  // chip" flourish, the payoff of controlling a real element instead of a
  // native drag-ghost bitmap. Transition is cleared once it's played so
  // subsequent cursor-following isn't laggy/eased.
  ghost.style.transition = `transform ${POP_IN_MS}ms ease-out, opacity ${POP_IN_MS}ms ease-out`;
  ghost.style.opacity = '0';
  setGhostTransform(ghost, x, y, 0.4);
  requestAnimationFrame(() => {
    ghost.style.opacity = '1';
    setGhostTransform(ghost, x, y, 1);
  });
  window.setTimeout(() => {
    ghost.style.transition = '';
  }, POP_IN_MS);
  return ghost;
}

/** Swallows the click a real drag gesture would otherwise synthesize —
 * pointerdown/pointerup with no movement in between is a normal click and
 * must keep working (opening a row, seeking); only a gesture that actually
 * crosses the drag threshold gets one of these installed, once, capture-phase
 * so it runs before the element's own onClick. */
function suppressNextClick(target: EventTarget) {
  function swallow(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    target.removeEventListener('click', swallow, true);
  }
  target.addEventListener('click', swallow, true);
}

/**
 * Call from a draggable source's onPointerDown. Does nothing until the
 * pointer actually moves past a small threshold, so a plain click (no
 * movement) is left completely alone.
 */
export function beginChipDrag(
  ref: ChatReference,
  downEvent: { clientX: number; clientY: number; currentTarget: EventTarget; preventDefault: () => void },
) {
  // Without this, a mouse-drag over table text/rows triggers the browser's
  // own native text-selection gesture (and, near a scroll container's edge,
  // its auto-scroll) — this doesn't stop the click a plain tap still
  // synthesizes, only the drag-specific default behaviors.
  downEvent.preventDefault();
  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  const target = downEvent.currentTarget;
  let ghost: HTMLDivElement | null = null;
  let activeZone: DropZone | null = null;

  function handleMove(e: PointerEvent) {
    if (!ghost) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD_PX) return;
      ghost = createGhost(ref, e.clientX, e.clientY);
      suppressNextClick(target);
    } else {
      setGhostTransform(ghost, e.clientX, e.clientY, 1);
    }
    const zone = zoneAtPoint(e.clientX, e.clientY);
    if (zone !== activeZone) {
      activeZone?.el.classList.remove(DROP_ZONE_CLASS);
      zone?.el.classList.add(DROP_ZONE_CLASS);
      activeZone = zone;
    }
  }

  function handleUp(e: PointerEvent) {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    ghost?.remove();
    activeZone?.el.classList.remove(DROP_ZONE_CLASS);
    if (ghost && activeZone) activeZone.onDrop(ref, e.clientX, e.clientY);
  }

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
}
