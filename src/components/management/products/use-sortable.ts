"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type Options = {
  ids: string[];
  onReorder: (ids: string[]) => void;
  /** Read out to screen readers after each move. */
  nameOf: (id: string) => string;
};

/**
 * Vertical drag-to-sort through a handle, plus arrow keys on the focused handle.
 * Rows register their element so the pointer can be compared against their midpoints.
 */
export function useSortable({ ids, onReorder, nameOf }: Options) {
  const rows = useRef(new Map<string, HTMLElement>());
  const latest = useRef(ids);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** The drag listeners live on window for the whole gesture; they call the latest `move`. */
  const moveRef = useRef(move);

  useEffect(() => {
    latest.current = ids;
  }, [ids]);

  useEffect(() => {
    moveRef.current = move;
  });

  function move(id: string, to: number) {
    const list = latest.current;
    const from = list.indexOf(id);
    if (from < 0 || to < 0 || to >= list.length || to === from) return;
    const next = moveItem(list, from, to);
    latest.current = next;
    onReorder(next);
    setAnnouncement(`${nameOf(id)}, position ${to + 1} of ${list.length}`);
  }

  function rowRef(id: string) {
    return (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    };
  }

  function handleProps(id: string) {
    const index = ids.indexOf(id);
    return {
      "aria-label": `Move ${nameOf(id)}. Position ${index + 1} of ${ids.length}. Drag, or use the arrow keys.`,
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        const pointer = e.pointerId;
        setDragging(id);

        const onMove = (ev: globalThis.PointerEvent) => {
          if (ev.pointerId !== pointer) return;
          let to = 0;
          for (const other of latest.current) {
            if (other === id) continue;
            const r = rows.current.get(other)?.getBoundingClientRect();
            if (r && ev.clientY > r.top + r.height / 2) to++;
          }
          moveRef.current(id, to);
        };
        const onEnd = (ev: globalThis.PointerEvent) => {
          if (ev.pointerId !== pointer) return;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onEnd);
          window.removeEventListener("pointercancel", onEnd);
          setDragging(null);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
      },
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const at = latest.current.indexOf(id);
        const to =
          e.key === "ArrowUp" ? at - 1 : e.key === "ArrowDown" ? at + 1 : e.key === "Home" ? 0 : e.key === "End" ? latest.current.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        move(id, to);
      },
    };
  }

  return { rowRef, handleProps, dragging, announcement };
}
