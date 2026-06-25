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
import { sharedRuntime as sharedGLRuntime } from "./transitions/gl-runtime";
import { getTransition } from "./transitions/registry";
import { fallback2D } from "./transitions/fallback";
import { applyChromaKey } from "./fx/chroma-key";

/** Se o item tem chroma habilitado, retorna o canvas processado (com a cor-chave transparente). */
function maybeChromaSource(item: SceneItem, source: MediaSource, srcW: number, srcH: number): MediaSource {
  const ck = item.fx?.chroma;
  if (!ck?.enabled) return source;
  if (item.kind !== "video" && item.kind !== "image") return source;
  // limita a 1280 para custo previsível em vídeos grandes; o resultado é escalado depois.
  const maxDim = 1280;
  const k = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(2, Math.round(srcW * k));
  const h = Math.max(2, Math.round(srcH * k));
  const out = applyChromaKey(source as unknown as TexImageSource, w, h, ck);
  return (out as unknown as MediaSource) ?? source;
}



export type SceneFx = {
  fillMode: "bars" | "blur" | "mirror" | "stretch" | "color";
  bgColor?: string;
  blurBg?: number;
  blur?: number;
  opacity?: number;
  zoom?: { dir: "in" | "out"; speed: "slow" | "med" | "fast" } | null;
  chroma?: {
    enabled: boolean;
    color: string;
    similarity: number;
    smoothness: number;
    spill: number;
  };
};

export type TextAnim =
  | "none" | "fade" | "fadeUp" | "fadeDown"
  | "slideLeft" | "slideRight" | "zoom" | "pop"
  | "wipeRight" | "wipeLeft" | "typewriter" | "blurIn";

export type TextStyleKind = "default" | "title" | "lowerthird";

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
  /** Subtítulo opcional (renderizado abaixo do título principal). */
  subtitle?: string;
  subtitleSize?: number;
  subtitleColor?: string;
  /** Estilo do bloco: padrão, título cinematográfico ou lower-third. */
  styleKind?: TextStyleKind;
  /** Cor de destaque (barra do lower-third, sublinhado do título). */
  accentColor?: string;
  /** Animação de entrada/saída. */
  animIn?: TextAnim;
  animOut?: TextAnim;
  animInDur?: number;  // segundos
  animOutDur?: number; // segundos
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
  /** Velocidade de reprodução (1 = normal). Usada pelo resolver para mapear srcT. */
  speed?: number;
  fadeIn?: number;
  fadeOut?: number;
  fx?: SceneFx;
  text?: SceneTextProps;
  transform?: { xPct?: number; yPct?: number; scale?: number; rotation?: number };
  /** Box visível em % (calculado por scene-geometry). Quando ausente, é derivado on-the-fly. */
  previewBox?: { wPct: number; hPct: number };
  zIndex?: number;
  /** Id de transição (GL) aplicada entre este clipe e o adjacente na mesma track. */
  transition?: string;
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

/** Duração na linha do tempo considerando velocidade. */
export function tlDurScene(it: { inPoint: number; outPoint: number; speed?: number }): number {
  const s = it.speed && it.speed > 0 ? it.speed : 1;
  return (it.outPoint - it.inPoint) / s;
}

export function computeOpacity(it: SceneItem, localT: number): number {
  const dur = tlDurScene(it);
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

function easeOutCubic(p: number) { return 1 - Math.pow(1 - p, 3); }
function easeInCubic(p: number)  { return p * p * p; }
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

/** Aplica transformação de animação ao contexto. Retorna progress de typewriter (0..1) e wipe info. */
function applyTextAnim(
  ctx: AnyCtx,
  anim: TextAnim,
  /** 0..1 onde 1 = totalmente visível (entrada concluída ou saída ainda não começou) */
  p: number,
  isExit: boolean,
  blockW: number,
  blockH: number,
): { typewriter: number; clipRect: { x: number; y: number; w: number; h: number } | null; alphaMul: number; extraBlur: number } {
  if (anim === "none" || p >= 1) return { typewriter: 1, clipRect: null, alphaMul: 1, extraBlur: 0 };
  // Para saída, inverter direção das translações para sair pelo lado oposto.
  const dir = isExit ? -1 : 1;
  const eased = isExit ? 1 - easeInCubic(1 - p) : easeOutCubic(p);
  switch (anim) {
    case "fade":
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    case "fadeUp": {
      const dy = (1 - eased) * blockH * 0.6 * dir;
      ctx.translate(0, dy);
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    }
    case "fadeDown": {
      const dy = -(1 - eased) * blockH * 0.6 * dir;
      ctx.translate(0, dy);
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    }
    case "slideLeft": {
      const dx = (1 - eased) * blockW * 1.1 * dir;
      ctx.translate(dx, 0);
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    }
    case "slideRight": {
      const dx = -(1 - eased) * blockW * 1.1 * dir;
      ctx.translate(dx, 0);
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    }
    case "zoom": {
      const s = 0.5 + 0.5 * eased;
      ctx.scale(s, s);
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    }
    case "pop": {
      // overshoot suave
      const s = isExit ? eased : (eased < 1 ? eased * (1.15 - 0.15 * eased) : 1);
      ctx.scale(s, s);
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: 0 };
    }
    case "wipeRight":
      return { typewriter: 1, clipRect: { x: -blockW / 2, y: -blockH / 2, w: blockW * eased, h: blockH }, alphaMul: 1, extraBlur: 0 };
    case "wipeLeft":
      return { typewriter: 1, clipRect: { x: blockW / 2 - blockW * eased, y: -blockH / 2, w: blockW * eased, h: blockH }, alphaMul: 1, extraBlur: 0 };
    case "typewriter":
      return { typewriter: eased, clipRect: null, alphaMul: 1, extraBlur: 0 };
    case "blurIn":
      return { typewriter: 1, clipRect: null, alphaMul: eased, extraBlur: (1 - eased) * 18 };
  }
  return { typewriter: 1, clipRect: null, alphaMul: 1, extraBlur: 0 };
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

  const styleKind: TextStyleKind = t.styleKind ?? "default";
  const subtitle = (t.subtitle ?? "").trim();
  const subSize = (t.subtitleSize ?? Math.round(size * 0.4)) * 1;
  const subColor = t.subtitleColor || "rgba(255,255,255,0.85)";
  const accent = t.accentColor || "#22c55e";

  // ----- Animação de entrada/saída -----
  const inDur = Math.max(0, t.animInDur ?? 0.6);
  const outDur = Math.max(0, t.animOutDur ?? 0.5);
  const animIn = (t.animIn ?? "none");
  const animOut = (t.animOut ?? "none");
  let phaseAnim: TextAnim = "none";
  let phaseProg = 1;
  let phaseExit = false;
  if (animIn !== "none" && inDur > 0 && localT < inDur) {
    phaseAnim = animIn;
    phaseProg = clamp01(localT / inDur);
    phaseExit = false;
  } else if (animOut !== "none" && outDur > 0 && localT > dur - outDur) {
    phaseAnim = animOut;
    phaseProg = clamp01((dur - localT) / outDur);
    phaseExit = true;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);

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
  // medir subtítulo
  let subW = 0;
  let subLineH = 0;
  if (subtitle) {
    subLineH = subSize * 1.25;
    ctx.save();
    ctx.font = `${style} 500 ${subSize}px ${fontFamily}`;
    subW = ctx.measureText(subtitle).width;
    ctx.restore();
  }
  const blockW = Math.max(maxW, subW);
  const textTotalH = lines.length * lineH;
  const totalH = textTotalH + (subtitle ? subLineH + size * 0.12 : 0);

  // Aplica animação (após ter dimensões do bloco)
  const animResult = applyTextAnim(ctx, phaseAnim, phaseProg, phaseExit, blockW + padX * 2, totalH + padY * 2);
  ctx.globalAlpha = alpha * animResult.alphaMul;

  const blurPx = itemBlurPx(item.fx, targetH) + animResult.extraBlur;
  setFilter(ctx, blurPx > 0 ? `blur(${blurPx}px)` : "none");

  if (animResult.clipRect) {
    ctx.beginPath();
    ctx.rect(animResult.clipRect.x, animResult.clipRect.y, animResult.clipRect.w, animResult.clipRect.h);
    ctx.clip();
  }

  // ----- Lower-third / fundo -----
  const bgOp = t.bgOpacity ?? 0;
  if (styleKind === "lowerthird") {
    // Barra de fundo com largura completa do bloco + uma faixa de destaque
    const lt_padX = Math.max(padX, 24);
    const lt_padY = Math.max(padY, 14);
    const bgW = blockW + lt_padX * 2;
    const bgH = totalH + lt_padY * 2;
    const left = -bgW / 2;
    const top = -bgH / 2;
    // sombra do bloco
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = hexToRgba(t.bgColor || "#0b0b0d", Math.max(bgOp, 0.75));
    roundRectPath(ctx, left, top, bgW, bgH, t.radius ?? 6);
    ctx.fill();
    ctx.restore();
    // barra de destaque (à esquerda)
    ctx.fillStyle = accent;
    roundRectPath(ctx, left, top, Math.max(6, size * 0.12), bgH, t.radius ?? 6);
    ctx.fill();
  } else if (bgOp > 0.001) {
    ctx.fillStyle = hexToRgba(t.bgColor || "#000000", bgOp);
    roundRectPath(ctx, -blockW / 2 - padX, -totalH / 2 - padY, blockW + padX * 2, totalH + padY * 2, t.radius ?? 0);
    ctx.fill();
  }

  if ((t.shadowBlur ?? 0) > 0 || (t.shadowOffsetX ?? 0) !== 0 || (t.shadowOffsetY ?? 0) !== 0) {
    ctx.shadowColor = t.shadowColor || "rgba(0,0,0,0.6)";
    ctx.shadowBlur = t.shadowBlur ?? 0;
    ctx.shadowOffsetX = t.shadowOffsetX ?? 0;
    ctx.shadowOffsetY = t.shadowOffsetY ?? 0;
  }

  ctx.textAlign = align;
  const anchorX = align === "left" ? -blockW / 2 : align === "right" ? blockW / 2 : 0;
  // Para lower-third, alinhar à esquerda do bloco e empurrar para a direita da barra
  const ltOffsetX = styleKind === "lowerthird" ? (size * 0.18) : 0;
  const textBlockTop = -totalH / 2;

  // Calcula linhas visíveis para efeito typewriter (caractere a caractere, multi-linha).
  let visibleLines = lines;
  if (animResult.typewriter < 1) {
    const totalChars = lines.reduce((acc, l) => acc + l.length, 0);
    let remaining = Math.floor(totalChars * animResult.typewriter);
    visibleLines = lines.map(l => {
      if (remaining <= 0) return "";
      if (remaining >= l.length) { remaining -= l.length; return l; }
      const taken = l.slice(0, remaining); remaining = 0; return taken;
    });
  }

  for (let i = 0; i < visibleLines.length; i++) {
    const lineText = visibleLines[i];
    if (!lineText) continue;
    const ly = textBlockTop + lineH * (i + 0.5);
    if ((t.strokeWidth ?? 0) > 0) {
      ctx.lineWidth = t.strokeWidth!;
      ctx.strokeStyle = t.strokeColor || "#000";
      ctx.lineJoin = "round";
      ctx.strokeText(lineText, anchorX + ltOffsetX, ly);
    }
    ctx.fillStyle = t.color || "#ffffff";
    ctx.fillText(lineText, anchorX + ltOffsetX, ly);
    if (t.underline) {
      const w = widths[i];
      const ux = align === "left" ? -blockW / 2 : align === "right" ? blockW / 2 - w : -w / 2;
      ctx.fillRect(ux + ltOffsetX, ly + size * 0.45, w, Math.max(1, size * 0.06));
    }
  }


  // Sublinhado de destaque para títulos
  if (styleKind === "title" && animResult.typewriter >= 1) {
    const underlineY = textBlockTop + textTotalH + Math.max(6, size * 0.18);
    const uw = Math.min(blockW, Math.max(48, blockW * 0.55));
    ctx.fillStyle = accent;
    ctx.fillRect(-uw / 2, underlineY, uw, Math.max(3, size * 0.06));
  }

  // Subtítulo
  if (subtitle) {
    ctx.save();
    ctx.font = `${style} 500 ${subSize}px ${fontFamily}`;
    ctx.fillStyle = subColor;
    ctx.textAlign = styleKind === "lowerthird" ? "left" : align;
    const subY = textBlockTop + textTotalH + size * 0.12 + subLineH / 2;
    const subAnchor = styleKind === "lowerthird"
      ? -blockW / 2 + ltOffsetX
      : align === "left" ? -blockW / 2 : align === "right" ? blockW / 2 : 0;
    ctx.fillText(subtitle, subAnchor, subY);
    ctx.restore();
  }

  ctx.restore();
}

// =============== Transições GL entre clipes ===============

type ActiveTransition = {
  A: SceneItem;
  B: SceneItem;
  transitionId: string;
  dur: number;
  winStart: number;
  winEnd: number;
};

function findActiveTransition(sorted: SceneItem[], t: number): ActiveTransition | null {
  for (let i = 0; i < sorted.length - 1; i++) {
    const A = sorted[i];
    const B = sorted[i + 1];
    const transitionId = A.transition || B.transition;
    if (!transitionId) continue;
    const aEnd = A.start + tlDurScene(A);
    // Tolerância: clipes praticamente colados no boundary
    if (Math.abs(B.start - aEnd) > 0.5) continue;
    const fadeOut = A.fadeOut ?? 0;
    const fadeIn = B.fadeIn ?? 0;
    const dur = Math.max(0.05, Math.min(fadeOut || fadeIn || 0.5, fadeIn || fadeOut || 0.5));
    const boundary = (aEnd + B.start) / 2;
    const winStart = boundary - dur;
    const winEnd = boundary + dur;
    if (t >= winStart && t <= winEnd) {
      return { A, B, transitionId, dur, winStart, winEnd };
    }
  }
  return null;
}

// Cache de offscreens para renderizar frames isolados de A/B
let _tmpA: OffscreenCanvas | HTMLCanvasElement | null = null;
let _tmpB: OffscreenCanvas | HTMLCanvasElement | null = null;
function getTmp(which: "a" | "b", w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  const ref = which === "a" ? _tmpA : _tmpB;
  let c = ref;
  if (!c) {
    c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  }
  if (c.width !== w) (c as HTMLCanvasElement).width = w;
  if (c.height !== h) (c as HTMLCanvasElement).height = h;
  if (which === "a") _tmpA = c; else _tmpB = c;
  return c;
}

function renderItemIsolated(
  target: OffscreenCanvas | HTMLCanvasElement,
  item: SceneItem,
  absT: number,
  media: MediaResolver,
  targetW: number,
  targetH: number,
  mode: "base" | "overlay" = "base",
) {
  const ctx = target.getContext("2d") as AnyCtx | null;
  if (!ctx) return false;
  ctx.save();
  ctx.clearRect(0, 0, targetW, targetH);
  if (mode === "base") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.restore();
  const clean: SceneItem = { ...item, fadeIn: 0, fadeOut: 0, fx: item.fx ? { ...item.fx, opacity: 100 } : item.fx };
  const dur = tlDurScene(clean);
  const localT = Math.max(0, Math.min(dur, absT - clean.start));
  if (clean.kind === "text" && clean.text?.content) {
    drawTextOverlay(ctx, clean, localT, dur, targetW, targetH);
    return true;
  }
  const src = media.resolve(item, absT);
  if (!src) return false;
  const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || item.width || targetW;
  const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || item.height || targetH;
  // Item sem fade para que a transição GL controle a mistura.
  if (mode === "base") drawClipFrame(ctx, src, sw, sh, targetW, targetH, clean, localT, dur);
  else drawVisualOverlay(ctx, src, sw, sh, clean, localT, dur, targetW, targetH, "both");
  return true;
}

function renderTransitionPair(
  ctx: AnyCtx,
  s: ActiveTransition,
  t: number,
  targetW: number,
  targetH: number,
  media: MediaResolver,
  mode: "base" | "overlay" = "base",
) {
  const aEnd = s.A.start + tlDurScene(s.A);
  const tA = Math.min(aEnd - 0.0001, t);
  const tB = Math.max(s.B.start + 0.0001, t);
  const ca = getTmp("a", targetW, targetH);
  const cb = getTmp("b", targetW, targetH);
  const okA = renderItemIsolated(ca, s.A, tA, media, targetW, targetH, mode);
  const okB = renderItemIsolated(cb, s.B, tB, media, targetW, targetH, mode);
  if (!okA && !okB) return;
  const progress = Math.max(0, Math.min(1, (t - s.winStart) / Math.max(0.001, s.winEnd - s.winStart)));
  const def = getTransition(s.transitionId);
  let drew = false;
  if (def && okA && okB) {
    try {
      const out = sharedGLRuntime().render(def, ca as unknown as TexImageSource, cb as unknown as TexImageSource, progress, targetW, targetH);
      if (out) {
        ctx.drawImage(out as unknown as CanvasImageSource, 0, 0, targetW, targetH);
        drew = true;
      }
    } catch {
      drew = false;
    }
  }
  if (!drew) {
    // Fallback: cross-dissolve 2D
    fallback2D(ctx, ca as unknown as CanvasImageSource, cb as unknown as CanvasImageSource, progress, targetW, targetH);
  }
}



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

  // V1 ativo (com suporte a transições GL entre clipes adjacentes na mesma track)
  const v1Sorted = [...scene.v1Items].sort((a, b) => a.start - b.start);
  const transitionState = findActiveTransition(v1Sorted, t);
  if (transitionState) {
    renderTransitionPair(ctx, transitionState, t, targetW, targetH, media);
  } else {
    const active = v1Sorted.find(c => t >= c.start && t < c.start + tlDurScene(c));
    if (active) {
      const localT = t - active.start;
      const dur = tlDurScene(active);
      if (active.kind === "text" && active.text?.content) {
        drawTextOverlay(ctx, active, localT, dur, targetW, targetH);
      } else {
        const src = media.resolve(active, t);
        if (src) {
          const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || active.width || targetW;
          const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || active.height || targetH;
          // Suprime fades quando dentro de janela de transição já é tratado acima
          drawClipFrame(ctx, src, sw, sh, targetW, targetH, active, localT, dur);
        }
      }
    }
  }

  // Camadas visuais adicionais também suportam transição GL entre itens adjacentes da mesma track.
  const visual = [...scene.visualItems].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const textOverlays = [...scene.textItems].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const overlayTransitionCandidates = [...visual, ...textOverlays].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.start - b.start);
  const visualTransitionIds = new Set<string>();
  for (const trackId of Array.from(new Set(overlayTransitionCandidates.map(it => it.trackId)))) {
    const trackItems = overlayTransitionCandidates.filter(it => it.trackId === trackId).sort((a, b) => a.start - b.start);
    const st = findActiveTransition(trackItems, t);
    if (!st) continue;
    visualTransitionIds.add(st.A.id);
    visualTransitionIds.add(st.B.id);
    renderTransitionPair(ctx, st, t, targetW, targetH, media, "overlay");
  }

  // Backgrounds (blur/mirror) das camadas fora de uma transição ativa
  for (const it of visual) {
    if (visualTransitionIds.has(it.id)) continue;
    const dur = tlDurScene(it);
    const localT = t - it.start;
    if (localT < 0 || localT > dur) continue;
    if (it.fx?.fillMode !== "blur" && it.fx?.fillMode !== "mirror") continue;
    const src = media.resolve(it, t);
    if (!src) continue;
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || it.width || targetW;
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || it.height || targetH;
    drawVisualOverlay(ctx, src, sw, sh, it, localT, dur, targetW, targetH, "background");
  }

  // Foreground das camadas fora de uma transição ativa
  for (const it of visual) {
    if (visualTransitionIds.has(it.id)) continue;
    const dur = tlDurScene(it);
    const localT = t - it.start;
    if (localT < 0 || localT > dur) continue;
    const src = media.resolve(it, t);
    if (!src) continue;
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || it.width || targetW;
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || it.height || targetH;
    drawVisualOverlay(ctx, src, sw, sh, it, localT, dur, targetW, targetH, "foreground");
  }

  // Textos
  for (const it of textOverlays) {
    if (visualTransitionIds.has(it.id)) continue;
    if (!it.text?.content) continue;
    const dur = tlDurScene(it);
    const localT = t - it.start;
    if (localT < 0 || localT > dur) continue;
    drawTextOverlay(ctx, it, localT, dur, targetW, targetH);
  }
}
