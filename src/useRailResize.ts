/** Shared divider logic for the right-anchored rails (detail, diff). */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Lower bound for every rail — one rule for both dividers. */
export const RAIL_MIN_WIDTH = 240;
/** Upper bound regardless of window size. */
export const RAIL_MAX_WIDTH = 900;
/** A rail never takes more than half the window. */
const RAIL_MAX_VIEWPORT_SHARE = 0.5;

function railMax(): number {
  return Math.min(RAIL_MAX_WIDTH, Math.floor(window.innerWidth * RAIL_MAX_VIEWPORT_SHARE));
}

/** Clamp a rail width to the shared min/max policy. */
export function railClamp(w: number): number {
  return Math.max(RAIL_MIN_WIDTH, Math.min(railMax(), Math.round(w)));
}

/**
 * The pane on the other side of a divider. Without one, the divider grows
 * the rail into the flex pane (graph); with one, the divider trades width
 * between the two rails so panes outside the pair stay fixed.
 */
export interface RailCounterpart {
  width: number;
  onChange: (width: number) => void;
  onCommit: (width: number) => void;
}

interface RailResize {
  dragging: boolean;
  onResizePointerDown: (e: React.PointerEvent) => void;
}

/**
 * Drag lifecycle for a rail's left-edge divider: dragging left widens the
 * rail. Width changes flow through `onWidthChange` while dragging and are
 * persisted once via `onWidthCommit` when the pointer is released. When a
 * `counterpart` is given, the mirrored delta is applied to it (the divider
 * trades width between the two adjacent rails); once the counterpart hits
 * its min/max, the flexible graph pane absorbs the remainder.
 */
export function useRailResize(
  width: number,
  onWidthChange: (width: number) => void,
  onWidthCommit: (width: number) => void,
  counterpart?: RailCounterpart,
): RailResize {
  const dragRef = useRef<{
    startX: number;
    startW: number;
    startCounterW: number | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const latestWidthRef = useRef(width);
  latestWidthRef.current = width;
  const latestCounterWidthRef = useRef(counterpart?.width);
  latestCounterWidthRef.current = counterpart?.width;
  const counterOnChange = counterpart?.onChange;
  const counterOnCommit = counterpart?.onCommit;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = railClamp(d.startW + (d.startX - e.clientX));
      if (d.startCounterW != null) {
        // Mirror the applied delta onto the counterpart; railClamp stops it
        // at the shared bounds, and the flex graph pane absorbs whatever it
        // could not take.
        counterOnChange?.(railClamp(d.startCounterW - (next - d.startW)));
      }
      onWidthChange(next);
    };
    const onUp = () => {
      const hadCounterpart = dragRef.current?.startCounterW != null;
      dragRef.current = null;
      setDragging(false);
      document.body.classList.remove('jj-resizing');
      if (hadCounterpart) counterOnCommit?.(latestCounterWidthRef.current ?? 0);
      onWidthCommit(latestWidthRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, onWidthChange, onWidthCommit, counterOnChange, counterOnCommit]);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startW: latestWidthRef.current,
      startCounterW: latestCounterWidthRef.current ?? null,
    };
    setDragging(true);
    document.body.classList.add('jj-resizing');
  }, []);

  return { dragging, onResizePointerDown };
}
