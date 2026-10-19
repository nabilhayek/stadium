"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Minus, Plus } from "lucide-react";

/** Width over height of every product photo. Between the shop's square thumbnail, 3:2 rail tile and 2:1 header. */
export const PHOTO_ASPECT = 3 / 2;
/** Long edge of the saved photo. The shop shows photos at most ~830px wide at 2×. */
const OUTPUT_WIDTH = 1600;

type Props = {
  src: string;
  onCancel: () => void;
  onConfirm: (photo: Blob) => void;
};

type Point = { x: number; y: number };

/** WebP keeps the empty margins transparent, so the shop's photo gray shows through. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (webp?.type === "image/webp") return webp;
  // Safari encodes PNG when asked for WebP. JPEG keeps the size reasonable but has no
  // transparency, so the margins are painted the photo gray instead.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--photo").trim() || "#ecece8";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return new Promise((resolve) => flat.toBlob(resolve, "image/jpeg", 0.88));
}

/**
 * Pan and zoom a photo inside a fixed 3:2 frame. At the lowest zoom the whole photo fits,
 * as the shop shows it; zoom in to trim. What's inside the frame is what gets saved.
 */
export function ImageCropper({ src, onCancel, onConfirm }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ pointer: Point; from: Point; id: number } | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const frameHeight = frameWidth / PHOTO_ASPECT;
  const fit = natural ? Math.min(frameWidth / natural.w, frameHeight / natural.h) : 1;
  const cover = natural ? Math.max(frameWidth / natural.w, frameHeight / natural.h) : 1;
  /** Zoom is relative to the whole photo fitting. Allow well past filling the frame. */
  const maxZoom = Math.max(4, (cover / fit) * 2);
  const scale = fit * zoom;
  const shown = natural ? { w: natural.w * scale, h: natural.h * scale } : { w: 0, h: 0 };

  /** Larger than the frame: no gaps at the edges. Smaller: stays inside the frame. */
  function clamp(p: Point, s = scale): Point {
    if (!natural) return p;
    const maxX = Math.abs(natural.w * s - frameWidth) / 2;
    const maxY = Math.abs(natural.h * s - frameHeight) / 2;
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }

  const position = clamp(offset);

  function zoomTo(next: number) {
    const z = Math.min(maxZoom, Math.max(1, next));
    const ratio = z / zoom;
    setZoom(z);
    setOffset(clamp({ x: position.x * ratio, y: position.y * ratio }, fit * z));
  }

  const wheel = useRef<(deltaY: number) => void>(() => {});
  useEffect(() => {
    wheel.current = (deltaY) => zoomTo(zoom * Math.exp(-deltaY * 0.002));
  });

  // React's onWheel is passive, so it can't stop the sheet from scrolling.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheel.current(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointer: { x: e.clientX, y: e.clientY }, from: position, id: e.pointerId };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset(clamp({ x: d.from.x + e.clientX - d.pointer.x, y: d.from.y + e.clientY - d.pointer.y }));
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    if (moves[e.key]) {
      e.preventDefault();
      setOffset(clamp({ x: position.x + moves[e.key].x, y: position.y + moves[e.key].y }));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomTo(zoom + 0.25);
    } else if (e.key === "-") {
      e.preventDefault();
      zoomTo(zoom - 0.25);
    }
  }

  async function confirm() {
    const img = image.current;
    if (!img || !natural || frameWidth === 0) return;
    setSaving(true);
    const left = frameWidth / 2 + position.x - shown.w / 2;
    const top = frameHeight / 2 + position.y - shown.h / 2;
    // Photo pixels across the frame; no point saving wider than that.
    const width = Math.max(1, Math.round(Math.min(OUTPUT_WIDTH, frameWidth / scale)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width / PHOTO_ASPECT);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }
    const k = width / frameWidth;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, left * k, top * k, shown.w * k, shown.h * k);
    const blob = await encode(canvas);
    setSaving(false);
    if (blob) onConfirm(blob);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frame}
        tabIndex={0}
        role="group"
        aria-label="Photo crop. Drag or use the arrow keys to move, plus and minus to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative aspect-[3/2] w-full cursor-grab touch-none overflow-hidden rounded-xl bg-photo outline-none select-none focus-visible:ring-3 focus-visible:ring-blue-500/30 active:cursor-grabbing"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL drawn to canvas; next/image can't serve it */}
        <img
          ref={image}
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
          style={{
            width: shown.w || undefined,
            height: shown.h || undefined,
            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
            visibility: natural && frameWidth ? "visible" : "hidden",
          }}
        />
        {!natural ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-neutral-400" aria-hidden />
          </span>
        ) : null}
        <span aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border-white/40 [&:nth-child(-n+6)]:border-b [&:not(:nth-child(3n))]:border-r" />
          ))}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => zoomTo(zoom - 0.25)}
          disabled={zoom <= 1}
          aria-label="Zoom out"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          type="range"
          min={1}
          max={maxZoom}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          aria-label="Zoom"
          className="h-1 min-w-0 flex-1 cursor-pointer accent-neutral-900"
        />
        <button
          type="button"
          onClick={() => zoomTo(zoom + 0.25)}
          disabled={zoom >= maxZoom}
          aria-label="Zoom in"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-neutral-500">Shown whole in the shop, on gray. Zoom in to trim empty space. Saved at 3:2.</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded-full border border-neutral-200 bg-white! px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-neutral-50!"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!natural || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900! px-3 text-[13px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
