// Fallback 2D: cross-dissolve simples quando WebGL não está disponível.
export function fallback2D(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  a: CanvasImageSource,
  b: CanvasImageSource,
  progress: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(a, 0, 0, w, h);
  ctx.globalAlpha = Math.max(0, Math.min(1, progress));
  ctx.drawImage(b, 0, 0, w, h);
  ctx.restore();
}
