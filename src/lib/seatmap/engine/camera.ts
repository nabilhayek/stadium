import type { Bounds } from "../geometry";

/**
 * Furthest zoom that still reads as a venue: 0.08 px per decimetre is 1 m = 0.8 px.
 * A small drawing can reach this, and a bowl that already fills the screen is not
 * pushed any further out than a little past fitting it.
 */
const VENUE_MIN_SCALE = 0.08;

/** Designer opening scale. World units are decimetres, so px per metre is scale × 10. */
export const DEFAULT_PX_PER_METRE = 6.7;
export const DEFAULT_SCALE = DEFAULT_PX_PER_METRE / 10;

/** screen = world * scale + (tx, ty), in CSS pixels. */
export class Camera {
  scale = 1;
  tx = 0;
  ty = 0;
  minScale = VENUE_MIN_SCALE;
  maxScale = 60;

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.tx) / this.scale, (sy - this.ty) / this.scale];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [wx * this.scale + this.tx, wy * this.scale + this.ty];
  }

  panBy(dx: number, dy: number) {
    this.tx += dx;
    this.ty += dy;
  }

  /** Zooms keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const next = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const k = next / this.scale;
    this.tx = sx - (sx - this.tx) * k;
    this.ty = sy - (sy - this.ty) * k;
    this.scale = next;
  }

  fit(b: Bounds, width: number, height: number, padding = 24) {
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const scale = Math.min((width - padding * 2) / w, (height - padding * 2) / h);
    this.scale = Math.min(this.maxScale, Math.max(0.001, scale));
    this.minScale = zoomFloor(this.scale);
    this.tx = width / 2 - ((b.minX + b.maxX) / 2) * this.scale;
    this.ty = height / 2 - ((b.minY + b.maxY) / 2) * this.scale;
  }

  /** World rectangle currently on screen, grown by `margin` CSS pixels. */
  view(width: number, height: number, margin = 0): Bounds {
    const [minX, minY] = this.toWorld(-margin, -margin);
    const [maxX, maxY] = this.toWorld(width + margin, height + margin);
    return { minX, minY, maxX, maxY };
  }

  snapshot() {
    return { scale: this.scale, tx: this.tx, ty: this.ty };
  }
}

/** How far zoom-out may go for content that fits at `fitted` px per decimetre. */
export function zoomFloor(fitted: number) {
  return Math.min(fitted * 0.85, VENUE_MIN_SCALE);
}
