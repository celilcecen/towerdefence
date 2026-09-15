/** Draws artwork centred on the origin, in CSS pixels, for a board cell `size` pixels wide. */
export type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

export interface SpriteSurface {
  readonly image: CanvasImageSource;
  readonly context: CanvasRenderingContext2D;
}

/** Creates an offscreen drawing surface of the given device-pixel size. */
export type SurfaceFactory = (width: number, height: number) => SpriteSurface;

/**
 * Pre-renders detailed artwork once per cell size and device pixel ratio, so a
 * frame costs one drawImage per sprite instead of dozens of paths and
 * gradients. Resizing the board invalidates everything.
 */
export class SpriteCache {
  private readonly sprites = new Map<string, CanvasImageSource>();
  private cellSize = 0;
  private pixelRatio = 0;

  constructor(private readonly createSurface: SurfaceFactory) {}

  get size(): number {
    return this.sprites.size;
  }

  configure(cellSize: number, pixelRatio: number): void {
    if (cellSize === this.cellSize && pixelRatio === this.pixelRatio) return;
    this.cellSize = cellSize;
    this.pixelRatio = pixelRatio;
    this.sprites.clear();
  }

  /**
   * Returns the sprite for `key`, painting it on first use. `extent` is the
   * sprite's width in cells; artwork outside that square is clipped.
   */
  get(key: string, extent: number, paint: Painter): CanvasImageSource {
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const side = Math.max(1, Math.ceil(extent * this.cellSize * this.pixelRatio));
    const { image, context } = this.createSurface(side, side);
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, side / 2, side / 2);
    paint(context, this.cellSize);
    this.sprites.set(key, image);
    return image;
  }

  /** Draws a cached sprite centred on (x, y), rotated by `angle` radians. */
  draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    extent: number,
    paint: Painter,
    x: number,
    y: number,
    angle = 0,
  ): void {
    const image = this.get(key, extent, paint);
    const side = extent * this.cellSize;
    if (angle === 0) {
      ctx.drawImage(image, x - side / 2, y - side / 2, side, side);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(image, -side / 2, -side / 2, side, side);
    ctx.restore();
  }
}
