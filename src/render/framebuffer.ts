/**
 * 128x48 block framebuffer — the single drawing surface for the whole game.
 * One cell = one semigraphics block of the original TRS-80 display.
 * All coordinates are in blocks; out-of-range coordinates are rejected
 * silently (sprites at screen edges are clipped, not errors).
 */
export const FB_W = 128;
export const FB_H = 48;

export class Framebuffer {
  readonly data: Uint8Array;
  /** cached ImageData for the 1:1 blit (128x48 RGBA) */
  private img: ImageData | null = null;

  constructor() {
    this.data = new Uint8Array(FB_W * FB_H);
  }

  clear(v: 0 | 1 = 0): void {
    this.data.fill(v);
    this.img = null;
  }

  /** Set a single block. Out of range: no-op. */
  set(x: number, y: number, v: 0 | 1): void {
    if (x < 0 || x >= FB_W || y < 0 || y >= FB_H) return;
    this.data[y * FB_W + x] = v;
    this.img = null;
  }

  /** Get a single block value (0 or 1). Out of range: 0. */
  get(x: number, y: number): 0 | 1 {
    if (x < 0 || x >= FB_W || y < 0 || y >= FB_H) return 0;
    return this.data[y * FB_W + x] as 0 | 1;
  }

  /**
   * Blit a rectangular block of value v. Coordinates may be fractional; the
   * region is clamped to the framebuffer and out-of-bounds parts are dropped.
   */
  setBlock(x: number, y: number, w: number, h: number, v: 0 | 1): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(FB_W, Math.ceil(x + w));
    const y1 = Math.min(FB_H, Math.ceil(y + h));
    if (x0 >= x1 || y0 >= y1) return;
    const row = new Uint8Array(x1 - x0).fill(v);
    for (let yy = y0; yy < y1; yy++) {
      this.data.set(row, yy * FB_W + x0);
    }
    this.img = null;
  }

  /** Blit a Sprite (rows of '#'/'.') at (x, y); x/y may be fractional. */
  blitSprite(
    x: number,
    y: number,
    rows: readonly string[],
    w: number,
  ): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let j = 0; j < rows.length; j++) {
      const yy = y0 + j;
      if (yy < 0 || yy >= FB_H) continue;
      const row = rows[j] ?? "";
      for (let i = 0; i < w; i++) {
        if ((row[i] ?? ".") !== "#") continue;
        const xx = x0 + i;
        if (xx < 0 || xx >= FB_W) continue;
        this.data[yy * FB_W + xx] = 1;
      }
    }
    this.img = null;
  }

  /** Produce a 128x48 ImageData; one framebuffer cell = one pixel. */
  blitToImageData(): ImageData {
    if (this.img) return this.img;
    const img = new ImageData(FB_W, FB_H);
    const px = img.data;
    for (let i = 0; i < FB_W * FB_H; i++) {
      const on = this.data[i] === 1;
      px[i * 4] = on ? 255 : 0;
      px[i * 4 + 1] = on ? 255 : 0;
      px[i * 4 + 2] = on ? 255 : 0;
      px[i * 4 + 3] = 255;
    }
    this.img = img;
    return img;
  }
}
