/**
 * MOTOR ÚNICO de renderização (Single Source of Truth).
 *
 * Esta é a ÚNICA função responsável por desenhar a cena no editor.
 * - Preview (PreviewCanvas) chama `drawScene` num <canvas> 2D normal.
 * - Exportação (webcodecs-export) chama `drawScene` num OffscreenCanvas.
 *
 * Resultado: o que o usuário vê é exatamente o que é gravado.
 *
 * Princípios:
 *  - Geometria 100% derivada de `scene-geometry.ts` (também SSoT).
 *  - Nenhum cálculo de aspect, crop, escala ou posição vive fora daqui.
 *  - Suporta `CanvasRenderingContext2D` e `OffscreenCanvasRenderingContext2D`.
 */

import { computeItemBounds, type ProjectAspect } from "./scene-geometry";

export type SceneFx = {
  fillMode: "bars" | "blur" | "mirror" | "stretch" | "color";
  bgColor?: string;
  blurBg?: number;
  blur?: number;
  opacity?: number;
  zoom?: { dir: "in" | "out"; speed: "slow" | "med" | "fast" } | null;
};

export type SceneTextProps = {
  content: string;
  color: string;
  size: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  opacity?: number;
  bgColor?: string;
  bgOpacity?: number;
  paddingX?: number;
  paddingY?: number;
  radius?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  strokeColor?: string;
  strokeWidth?: number;
};

export type SceneItem = {
  id: string;
  kind: "video" | "image" | "audio" | "text";
  trackId: string;
  name: string;
  width?: number;
  height?: number;
  start: number;
  inPoint: number;
  outPoint: number;
  fadeIn?: number;
  fadeOut?: number;
  fx?: SceneFx;
  text?: SceneTextProps;
  transform?: { xPct?: number; yPct?: number; scale?: number; rotation?: number };
  /** Box visível em % (calculado por scene-geometry). Quando ausente, é derivado on-the-fly. */
  previewBox?: { wPct: number; hPct: number };
  zIndex?: number;
};

export type Scene = {
  aspect: ProjectAspect;
  /** Item de "V1" (vídeo/imagem principal) ativo no tempo `t`. */
  v1Items: SceneItem[];
  /** Camadas adicionais (vídeo/imagem em outras tracks). */
  visualItems: SceneItem[];
  /** Overlays de texto. */
  textItems: SceneItem[];
};

export type MediaSource = CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number };

export interface MediaResolver {
  /** Devolve elemento pronto para `drawImage` no tempo absoluto da timeline. */
  resolve(item: SceneItem, absT: number): MediaSource | null;
}

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// =============== Helpers de FX (idênticos ao export antigo) ===============

export function exportBlurScale(targetH: number): number {
  return Math.max(1, Math.min(6, targetH / 360));
}

export function blurCanvasPx(fx?: SceneFx, targetH = 720): number {
  if (fx?.fillMode !== "blur") return 0;
  const n = Math.max(0, Math.min(100, fx.blurBg ?? 30)) / 100;
  return n <= 0 ? 0 : (n * n * 56 + n * 8) * exportBlurScale(targetH);
}

export function itemBlurPx(fx?: SceneFx, targetH = 720): number {
  const n = Math.max(0, Math.min(100, fx?.blur ?? 0));
  return n <= 0 ? 0 : Math.max(0.2, n * 0.45 * exportBlurScale(targetH));
}

export function computeZoomScale(fx: SceneFx | undefined, localT: number, dur: number): number {
  if (!fx?.zoom) return 1;
  const speedMul = fx.zoom.speed === "slow" ? 0.1 : fx.zoom.speed === "fast" ? 0.35 : 0.2;
  const p = dur > 0 ? Math.min(1, Math.max(0, localT / dur)) : 0;
  return fx.zoom.dir === "in" ? 1 + speedMul * p : 1 + speedMul * (1 - p);
}

export function computeOpacity(it: SceneItem, localT: number): number {
  const dur = it.outPoint - it.inPoint;
  let v = (it.fx?.opacity ?? 100) / 100;
  if (it.fadeIn && localT < it.fadeIn) v *= Math.max(0, localT / it.fadeIn);
  if (it.fadeOut && localT > dur - it.fadeOut) v *= Math.max(0, (dur - localT) / it.fadeOut);
  return Math.max(0, Math.min(1, v));
}

function setFilter(ctx: AnyCtx, value: string) {
  try { (ctx as unknown as { filter: string }).filter = value; } catch { /* ignore */ }
}

// =============== Draw primitives ===============

function drawSoftCover(
  ctx: AnyCtx,
  source: MediaSource,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  blurPx: number,
) {
  const intensity = Math.max(0, Math.min(1, blurPx / 64));
  const downsample = 1 + intensity * 24;
  const tmpW = Math.max(24, Math.round(targetW / downsample));
  const tmpH = Math.max(24, Math.round(targetH / downsample));
  // Usa OffscreenCanvas quando disponível; cai para <canvas> normal no preview.
  const tmp: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(tmpW, tmpH)
      : Object.assign(document.createElement("canvas"), { width: tmpW, height: tmpH });
  const tctx = (tmp.getContext("2d") as AnyCtx | null);
  if (!tctx) return;
  const cover = Math.max(tmpW / srcW, tmpH / srcH) * (1.04 + intensity * 0.18);
  const w = srcW * cover;
  const h = srcH * cover;
  const x = (tmpW - w) / 2;
  const y = (tmpH - h) / 2;
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(source, x, y, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  setFilter(ctx, blurPx > 0 ? `blur(${Math.min(18, blurPx / 3)}px)` : "none");
  const bleed = Math.ceil(Math.min(targetW, targetH) * 0.04 + blurPx * 0.5);
  ctx.drawImage(tmp as unknown as CanvasImageSource, -bleed, -bleed, targetW + bleed * 2, targetH + bleed * 2);
  setFilter(ctx, "none");
  ctx.restore();
}

function drawClipFrame(
  ctx: AnyCtx,
  source: MediaSource,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  item: SceneItem,
  localT: number,
  dur: number,
) {
  const fx = item.fx;
  const fillMode = fx?.fillMode ?? "bars";
  const bgColor = fx?.bgColor ?? "#000000";
  const blurPx = blurCanvasPx(fx, targetH);
  const opacity = computeOpacity(item, localT);
  const visualBlurPx = itemBlurPx(fx, targetH);

  ctx.save();
  ctx.globalAlpha = 1;
  if (fillMode === "color" || fillMode === "bars") {
    ctx.fillStyle = fillMode === "color" ? bgColor : "#000000";
    ctx.fillRect(0, 0, targetW, targetH);
  } else if (fillMode === "blur" || fillMode === "mirror") {
    if (fillMode === "blur") {
      drawSoftCover(ctx, source, srcW, srcH, targetW, targetH, blurPx);
    } else {
      const cover = Math.max(targetW / srcW, targetH / srcH) * 1.06;
      const w = srcW * cover, h = srcH * cover;
      const x = (targetW - w) / 2, y = (targetH - h) / 2;
      ctx.save();
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, targetW - x - w, y, w, h);
      ctx.restore();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  const xPct = item.transform?.xPct ?? 50;
  const yPct = item.transform?.yPct ?? 50;
  const baseScale = item.transform?.scale ?? 1;
  const zScale = computeZoomScale(fx, localT, dur);
  const sc = baseScale * zScale;
  const rot = ((item.transform?.rotation ?? 0) * Math.PI) / 180;
  const cx = (xPct / 100) * targetW;
  const cy = (yPct / 100) * targetH;
  const previewBox = item.previewBox;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.scale(sc, sc);
  setFilter(ctx, visualBlurPx > 0 ? `blur(${visualBlurPx}px)` : "none");
  if (fillMode === "stretch") {
    ctx.drawImage(source, -targetW / 2, -targetH / 2, targetW, targetH);
  } else if (previewBox) {
    const boxW = (previewBox.wPct / 100) * targetW;
    const boxH = (previewBox.hPct / 100) * targetH;
    const srcAR = srcW / Math.max(1, srcH);
    const boxAR = boxW / Math.max(1, boxH);
    let drawW: number, drawH: number;
    if (srcAR >= boxAR) { drawW = boxW; drawH = boxW / srcAR; }
    else { drawH = boxH; drawW = boxH * srcAR; }
    ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    const contain = Math.min(targetW / srcW, targetH / srcH);
    const w = srcW * contain, h = srcH * contain;
    ctx.drawImage(source, -w / 2, -h / 2, w, h);
  }
  setFilter(ctx, "none");
  ctx.restore();
}

function drawVisualOverlay(
  ctx: AnyCtx,
  source: MediaSource,
  sourceW: number,
  sourceH: number,
  item: SceneItem,
  localT: number,
  dur: number,
  targetW: number,
  targetH: number,
  layer: "background" | "foreground" | "both" = "both",
) {
  const srcW = sourceW || item.width || targetW;
  const srcH = sourceH || item.height || targetH;
  if (srcW <= 0 || srcH <= 0) return;

  let boxW: number;
  let boxH: number;
  if (item.previewBox) {
    boxW = (item.previewBox.wPct / 100) * targetW;
    boxH = (item.previewBox.hPct / 100) * targetH;
  } else {
    const b = computeItemBounds({ kind: item.kind === "audio" ? "image" : item.kind, width: srcW, height: srcH }, { w: targetW, h: targetH });
    boxW = (b.w / 100) * targetW;
    boxH = (b.h / 100) * targetH;
  }
  const x = ((item.transform?.xPct ?? 50) / 100) * targetW;
  const y = ((item.transform?.yPct ?? 50) / 100) * targetH;
  const scale = (item.transform?.scale ?? 1) * computeZoomScale(item.fx, localT, dur);
  const rot = ((item.transform?.rotation ?? 0) * Math.PI) / 180;
  const op = computeOpacity(item, localT);

  if ((layer === "background" || layer === "both") && (item.fx?.fillMode === "blur" || item.fx?.fillMode === "mirror")) {
    ctx.save();
    ctx.globalAlpha = op;
    if (item.fx.fillMode === "blur") {
      drawSoftCover(ctx, source, srcW, srcH, targetW, targetH, blurCanvasPx(item.fx, targetH));
    } else {
      const cover = Math.max(targetW / srcW, targetH / srcH) * 1.06;
      const bgW = srcW * cover;
      const bgH = srcH * cover;
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, (targetW - bgW) / 2, (targetH - bgH) / 2, bgW, bgH);
    }
    ctx.restore();
  }
  if (layer === "background") return;

  ctx.save();
  ctx.globalAlpha = op;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  const blurPx = itemBlurPx(item.fx, targetH);
  setFilter(ctx, blurPx > 0 ? `blur(${blurPx}px)` : "none");
  const srcARo = srcW / Math.max(1, srcH);
  const boxARo = boxW / Math.max(1, boxH);
  let drawWo: number, drawHo: number;
  if (srcARo >= boxARo) { drawWo = boxW; drawHo = boxW / srcARo; }
  else { drawHo = boxH; drawWo = boxH * srcARo; }
  ctx.drawImage(source, -drawWo / 2, -drawHo / 2, drawWo, drawHo);
  setFilter(ctx, "none");
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || "#000000").replace("#", "");
  const v = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const r = parseInt(v.substring(0, 2), 16) || 0;
  const g = parseInt(v.substring(2, 4), 16) || 0;
  const b = parseInt(v.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function roundRectPath(ctx: AnyCtx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawTextOverlay(
  ctx: AnyCtx,
  item: SceneItem,
  localT: number,
  dur: number,
  targetW: number,
  targetH: number,
) {
  const t = item.text!;
  let alpha = (t.opacity ?? 1);
  if (item.fadeIn && localT < item.fadeIn) alpha *= Math.max(0, localT / item.fadeIn);
  if (item.fadeOut && localT > dur - item.fadeOut) alpha *= Math.max(0, (dur - localT) / item.fadeOut);
  if (alpha <= 0.001) return;

  const xPct = item.transform?.xPct ?? 50;
  const yPct = item.transform?.yPct ?? 80;
  const scale = item.transform?.scale ?? 1;
  const rot = ((item.transform?.rotation ?? 0) * Math.PI) / 180;
  const cx = (xPct / 100) * targetW;
  const cy = (yPct / 100) * targetH;

  const size = (t.size ?? 48) * scale;
  const fontFamily = t.fontFamily || "system-ui, -apple-system, sans-serif";
  const weight = t.bold ? "800" : "400";
  const style = t.italic ? "italic" : "normal";
  const align = t.align ?? "center";
  const lineH = (t.lineHeight ?? 1.2) * size;
  const letterSp = t.letterSpacing ?? 0;
  const padX = t.paddingX ?? 12;
  const padY = t.paddingY ?? 6;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  const blurPx = itemBlurPx(item.fx, targetH);
  setFilter(ctx, blurPx > 0 ? `blur(${blurPx}px)` : "none");
  ctx.font = `${style} ${weight} ${size}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSp}px`; } catch { /* ignore */ }

  const lines = String(t.content).split("\n");
  const measureLine = (line: string) => {
    const m = ctx.measureText(line);
    return m.width + letterSp * Math.max(0, line.length - 1);
  };
  const widths = lines.map(measureLine);
  const maxW = Math.max(1, ...widths);
  const totalH = lines.length * lineH;

  if ((t.bgOpacity ?? 0) > 0.001) {
    ctx.fillStyle = hexToRgba(t.bgColor || "#000000", t.bgOpacity ?? 0);
    roundRectPath(ctx, -maxW / 2 - padX, -totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2, t.radius ?? 0);
    ctx.fill();
  }

  if ((t.shadowBlur ?? 0) > 0 || (t.shadowOffsetX ?? 0) !== 0 || (t.shadowOffsetY ?? 0) !== 0) {
    ctx.shadowColor = t.shadowColor || "rgba(0,0,0,0.6)";
    ctx.shadowBlur = t.shadowBlur ?? 0;
    ctx.shadowOffsetX = t.shadowOffsetX ?? 0;
    ctx.shadowOffsetY = t.shadowOffsetY ?? 0;
  }

  ctx.textAlign = align;
  const anchorX = align === "left" ? -maxW / 2 : align === "right" ? maxW / 2 : 0;
  for (let i = 0; i < lines.length; i++) {
    const ly = -totalH / 2 + lineH * (i + 0.5);
    if ((t.strokeWidth ?? 0) > 0) {
      ctx.lineWidth = t.strokeWidth!;
      ctx.strokeStyle = t.strokeColor || "#000";
      ctx.lineJoin = "round";
      ctx.strokeText(lines[i], anchorX, ly);
    }
    ctx.fillStyle = t.color || "#ffffff";
    ctx.fillText(lines[i], anchorX, ly);
    if (t.underline) {
      const w = widths[i];
      const ux = align === "left" ? -maxW / 2 : align === "right" ? maxW / 2 - w : -w / 2;
      ctx.fillRect(ux, ly + size * 0.45, w, Math.max(1, size * 0.06));
    }
  }
  ctx.restore();
}

// =============== ENTRADA ÚNICA ===============

/**
 * Desenha a cena inteira no tempo `t` (segundos absolutos da timeline).
 * Esta é a ÚNICA função de renderização — usada por preview e export.
 */
export function drawScene(
  ctx: AnyCtx,
  scene: Scene,
  t: number,
  targetW: number,
  targetH: number,
  media: MediaResolver,
) {
  // Fundo
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.restore();

  // V1 ativo
  const active = scene.v1Items.find(c => t >= c.start && t < c.start + (c.outPoint - c.inPoint));
  if (active) {
    const localT = t - active.start;
    const dur = active.outPoint - active.inPoint;
    const src = media.resolve(active, t);
    if (src) {
      const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || active.width || targetW;
      const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || active.height || targetH;
      drawClipFrame(ctx, src, sw, sh, targetW, targetH, active, localT, dur);
    }
  }

  // Backgrounds (blur/mirror) das camadas
  const visual = [...scene.visualItems].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const it of visual) {
    const dur = it.outPoint - it.inPoint;
    const localT = t - it.start;
    if (localT < 0 || localT > dur) continue;
    if (it.fx?.fillMode !== "blur" && it.fx?.fillMode !== "mirror") continue;
    const src = media.resolve(it, t);
    if (!src) continue;
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || it.width || targetW;
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || it.height || targetH;
    drawVisualOverlay(ctx, src, sw, sh, it, localT, dur, targetW, targetH, "background");
  }

  // Foreground das camadas
  for (const it of visual) {
    const dur = it.outPoint - it.inPoint;
    const localT = t - it.start;
    if (localT < 0 || localT > dur) continue;
    const src = media.resolve(it, t);
    if (!src) continue;
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || it.width || targetW;
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || it.height || targetH;
    drawVisualOverlay(ctx, src, sw, sh, it, localT, dur, targetW, targetH, "foreground");
  }

  // Textos
  const texts = [...scene.textItems].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const it of texts) {
    if (!it.text?.content) continue;
    const dur = it.outPoint - it.inPoint;
    const localT = t - it.start;
    if (localT < 0 || localT > dur) continue;
    drawTextOverlay(ctx, it, localT, dur, targetW, targetH);
  }
}
