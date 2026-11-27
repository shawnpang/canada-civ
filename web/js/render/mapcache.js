// Cache the static map in screen coordinates, with room to pan before repainting.
// The painter receives an expanded viewport and its correspondingly shifted camera.
export function createMapCache({margin = 160} = {}) {
  const canvas = document.createElement('canvas');
  const cache = canvas.getContext('2d');
  let previous = null;
  let rebuilds = 0, blits = 0;

  function debugEnabled() {
    try {
      return new URLSearchParams(location.search).get('perf') === '1' || localStorage.canadaCivPerf === '1';
    } catch (_) {
      return false;
    }
  }

  function draw(ctx, {world, width, height, scale, ox, oy, pixelRatio, key}, paint) {
    const debug = debugEnabled();
    const start = debug ? performance.now() : 0;
    const dx = previous ? ox - previous.ox : 0;
    const dy = previous ? oy - previous.oy : 0;
    const rebuild = !previous || previous.world !== world || previous.width !== width ||
      previous.height !== height || previous.scale !== scale || previous.pixelRatio !== pixelRatio ||
      previous.key !== key || Math.abs(dx) > margin || Math.abs(dy) > margin;

    if (rebuild) {
      canvas.width = Math.ceil((width + 2 * margin) * pixelRatio);
      canvas.height = Math.ceil((height + 2 * margin) * pixelRatio);
      cache.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      paint(cache, {width: width + 2 * margin, height: height + 2 * margin,
        scale, ox: ox + margin, oy: oy + margin});
      previous = {world, width, height, scale, ox, oy, pixelRatio, key};
      rebuilds++;
    } else {
      blits++;
    }

    // Crop in device pixels; destination coordinates are CSS pixels under the
    // main canvas's existing DPR transform. Fractional camera movement is kept.
    const sourceX = (margin + previous.ox - ox) * pixelRatio;
    const sourceY = (margin + previous.oy - oy) * pixelRatio;
    ctx.drawImage(canvas, sourceX, sourceY, width * pixelRatio, height * pixelRatio,
      0, 0, width, height);
    if (debug) {
      console.debug('[canada-civ perf]', {rebuilds, blits, lastPaintMs: +(performance.now() - start).toFixed(2),
        last: rebuild ? 'rebuild' : 'blit'});
    }
  }

  return {draw, invalidate: () => { previous = null; }};
}
