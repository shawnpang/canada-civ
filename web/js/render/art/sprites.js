// Small procedural stamps are cached by a quarter-octave scale bucket. The
// cache stores pixels rather than screen positions, so it is safe to pan.
const PIXEL_BUDGET = 24e6;
const cache = new Map();
let cachedPixels = 0;

/** A repeatable value in [0, 1), for either a numeric or a string seed. */
export function seedRand(seed) {
  let value;
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    value = seed | 0;
  } else {
    const text = String(seed);
    value = 2166136261;
    for (let i = 0; i < text.length; i++) {
      value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    }
  }
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * Paint a transparent stamp at a quantized pixels-per-world-unit scale.
 * box describes the requested CSS-pixel size and the offset from the draw
 * anchor. paint(ctx, bucketUpx) receives a context already scaled to world
 * units, with its origin at the top-left of the box. Include every visual
 * variant in key. The return value preserves the requested CSS size even
 * when the underlying bitmap is reused at another zoom in the same bucket.
 */
export function getSprite(key, upx, box, paint) {
  if (!Number.isFinite(upx) || upx <= 0 || !box ||
      !Number.isFinite(box.w) || !Number.isFinite(box.h) || box.w <= 0 || box.h <= 0 ||
      !Number.isFinite(box.ax) || !Number.isFinite(box.ay)) {
    throw new RangeError('Sprite scale, dimensions and anchor must be finite');
  }
  const bucket = Math.round(Math.log2(upx) * 4);
  const bucketUpx = 2 ** (bucket / 4);
  const factor = bucketUpx / upx;
  // The normalized box is rounded before ceiling to avoid floating point
  // jitter creating several cache entries for the same world-unit size.
  const sourceW = Math.max(1 / 1024, Math.round(box.w * factor * 1024) / 1024);
  const sourceH = Math.max(1 / 1024, Math.round(box.h * factor * 1024) / 1024);
  const width = Math.ceil(sourceW), height = Math.ceil(sourceH);
  const cacheKey = `${key}|${bucket}|${sourceW}x${sourceH}`;
  let entry = cache.get(cacheKey);
  if (entry) {
    cache.delete(cacheKey);
    cache.set(cacheKey, entry);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for sprite');
    ctx.scale(bucketUpx, bucketUpx);
    paint(ctx, bucketUpx);
    entry = {canvas, pixels: width * height};
    // Oversized sprites can be drawn once without displacing the whole cache.
    if (entry.pixels <= PIXEL_BUDGET) {
      while (cachedPixels + entry.pixels > PIXEL_BUDGET) {
        const oldestKey = cache.keys().next().value;
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        cachedPixels -= oldest.pixels;
      }
      cache.set(cacheKey, entry);
      cachedPixels += entry.pixels;
    }
  }
  // Canvas dimensions include rounding padding. Crop that padding on drawing
  // so the same artwork keeps its world-space size throughout a zoom bucket.
  return {canvas: entry.canvas, sourceW, sourceH,
    w: box.w, h: box.h, ax: box.ax, ay: box.ay};
}

/** Draw without mirroring; k optionally scales the stamp around its anchor. */
export function drawSprite(ctx, sprite, x, y, k = 1) {
  if (!sprite || !Number.isFinite(k) || k <= 0) return;
  ctx.drawImage(sprite.canvas, 0, 0, sprite.sourceW, sprite.sourceH,
    x + sprite.ax * k, y + sprite.ay * k, sprite.w * k, sprite.h * k);
}
