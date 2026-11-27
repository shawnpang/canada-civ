// Level of detail is based on the on-screen hex radius in CSS pixels.
export const FAR = 0, MID = 1, NEAR = 2, CLOSE = 3;

export function lodFor(Rpx) {
  if (Rpx < 10) return FAR;
  if (Rpx < 22) return MID;
  if (Rpx < 44) return NEAR;
  return CLOSE;
}

// Pointy-top hex in the map's y-down screen coordinates. The path starts at
// the upper-right corner and proceeds clockwise, as in the map grid.
export function hexPath(ctx, x, y, r) {
  const halfWidth = r * Math.sqrt(3) / 2;
  const halfHeight = r / 2;
  ctx.beginPath();
  ctx.moveTo(x + halfWidth, y - halfHeight);
  ctx.lineTo(x + halfWidth, y + halfHeight);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - halfWidth, y + halfHeight);
  ctx.lineTo(x - halfWidth, y - halfHeight);
  ctx.lineTo(x, y - r);
  ctx.closePath();
}
