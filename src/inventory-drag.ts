import type { Game } from './game';
import { stackIcon } from './hotbar';
import type { SlotAddress, Storage } from './inventory';

export function bindInventoryDrag(grid: HTMLElement, game: Game,
  move: (from: SlotAddress, to: SlotAddress) => void, preview: (address: SlotAddress | null) => void,
  tap: (address: SlotAddress) => void) {
  type Slot = SlotAddress & { button: HTMLButtonElement };
  let origin: Slot | null = null;
  let destination: Slot | null = null;
  let touch: { id: number; source: Slot; x: number; y: number } | null = null;
  let ghost: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;
  let scrollFrame = 0;
  let suppressClick = false;
  let lastTouch = -Infinity;

  function slotAt(target: EventTarget | null): Slot | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('.inventory-slot');
    if (!button || !grid.contains(button)) return null;
    return { button, storage: button.dataset.storage as Storage, index: Number(button.dataset.index) };
  }

  function aim(slot: Slot | null) {
    if (slot?.button === origin?.button) slot = null;
    if (destination?.button === slot?.button) return;
    destination?.button.classList.remove('slot-drop');
    destination = slot;
    destination?.button.classList.add('slot-drop');
  }

  function finish(drop = false) {
    const from = origin, to = destination;
    aim(null);
    origin?.button.classList.remove('slot-moving');
    origin = touch = null;
    ghost?.remove();
    ghost = null;
    cancelAnimationFrame(scrollFrame);
    if (drop && from && to) move(from, to);
  }

  grid.addEventListener('pointerover', event => {
    const slot = slotAt(event.target);
    if (slot && event.pointerType === 'mouse' && !origin && !event.buttons && performance.now() - lastTouch > 500) preview(slot);
  });
  grid.addEventListener('focusin', event => {
    const slot = slotAt(event.target);
    if (slot?.button.matches(':focus-visible') && !origin && performance.now() - lastTouch > 500) preview(slot);
  });
  grid.addEventListener('dragstart', event => {
    const slot = slotAt(event.target);
    if (!slot || touch || !game[slot.storage][slot.index] || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    origin = slot;
    preview(null);
    origin.button.classList.add('slot-moving');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'inventory-slot');
  });
  grid.addEventListener('dragover', event => {
    if (!origin || touch) return;
    aim(slotAt(event.target));
    if (destination) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
  });
  grid.addEventListener('dragleave', event => {
    if (!slotAt(event.relatedTarget)) aim(null);
  });
  grid.addEventListener('drop', event => {
    if (!origin || touch) return;
    event.preventDefault();
    aim(slotAt(event.target));
    finish(true);
  });
  grid.addEventListener('dragend', () => { if (!touch) finish(); });

  let lastTouchX = 0, lastTouchY = 0;
  function scrollNearEdge() {
    if (!grid.isConnected) return finish();
    if (!ghost || !scroller) return;
    const bounds = scroller.getBoundingClientRect();
    const edge = 26;
    if (lastTouchY < bounds.top + edge) scroller.scrollTop -= 6;
    else if (lastTouchY > bounds.bottom - edge) scroller.scrollTop += 6;
    aim(slotAt(document.elementFromPoint(lastTouchX, lastTouchY)));
    scrollFrame = requestAnimationFrame(scrollNearEdge);
  }

  const panel = grid.parentElement ?? grid;
  panel.addEventListener('pointerdown', event => {
    suppressClick = false;
    lastTouch = event.pointerType === 'touch' ? performance.now() : -Infinity;
  }, { capture: true });
  grid.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    if (event.pointerType !== 'touch') return;
    const source = slotAt(event.target);
    if (source && game[source.storage][source.index]) {
      touch = { id: event.pointerId, source, x: event.clientX, y: event.clientY };
      grid.setPointerCapture(event.pointerId);
    }
  });
  grid.addEventListener('pointermove', event => {
    if (touch?.id !== event.pointerId) return;
    lastTouchX = event.clientX;
    lastTouchY = event.clientY;
    if (!origin) {
      if (Math.hypot(lastTouchX - touch.x, lastTouchY - touch.y) < 8) return;
      const stack = game[touch.source.storage][touch.source.index];
      if (!stack) return finish();
      origin = touch.source;
      origin.button.classList.add('slot-moving');
      ghost = document.createElement('div');
      ghost.className = 'inventory-drag-ghost';
      ghost.append(stackIcon(stack));
      scroller = grid.closest('dialog');
      (scroller ?? grid).append(ghost);
      scrollFrame = requestAnimationFrame(scrollNearEdge);
    }
    if (ghost) {
      ghost.style.left = lastTouchX + 'px';
      ghost.style.top = lastTouchY + 'px';
    }
    aim(slotAt(document.elementFromPoint(lastTouchX, lastTouchY)));
  });
  grid.addEventListener('pointerup', event => {
    if (touch?.id !== event.pointerId) return;
    lastTouch = performance.now();
    const source = touch.source;
    suppressClick = true;
    if (!origin) {
      finish();
      tap(source);
      return;
    }
    aim(slotAt(document.elementFromPoint(event.clientX, event.clientY)));
    finish(true);
  });
  for (const name of ['pointercancel', 'lostpointercapture'] as const) {
    grid.addEventListener(name, event => { if (touch?.id === event.pointerId) finish(); });
  }
  panel.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, { capture: true });
}
