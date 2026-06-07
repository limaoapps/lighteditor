/**
 * Exportação acelerada por hardware via WebCodecs + mp4-muxer.
 * Usa o encoder de vídeo/áudio nativo do SO quando disponível
 * (NVENC, QuickSync, AMF, VideoToolbox, MediaFoundation, MediaCodec).
 *
 * Quando o navegador não suporta os codecs/configurações necessárias,
 * `isWebCodecsExportSupported()` retorna `false` e o chamador deve cair
 * no caminho de ffmpeg.wasm.
 *
 * Cobertura intencionalmente focada nos casos mais comuns:
 *  - V1 com clipes de vídeo/imagem sequenciais (sort por start)
 *  - fillMode bars / color / stretch / blur / mirror (aproximação canvas)
 *  - fadeIn / fadeOut / opacidade
 *  - 1 trilha de música opcional, mixagem com áudio dos clipes
 *  - 1 overlay de texto simples (centro horizontal)
 *
 * Efeitos avançados (vignette, presets de cor, color grading completo)
 * permanecem no caminho ffmpeg.wasm.
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { buildAudioFxGraph, type AudioFx } from "./audio-fx";

export type WCItem = {
  id: string;
  kind: "video" | "image" | "audio" | "text";
  trackId: string;
  name: string;
  file?: File;
  width?: number;
  height?: number;
  start: number;
  inPoint: number;
  outPoint: number;
  fadeIn?: number;
  fadeOut?: number;
  gainDb?: number;
  audioFx?: AudioFx;
  fx?: {
    fillMode: "bars" | "blur" | "mirror" | "stretch" | "color";
    bgColor?: string;
    blurBg?: number;
    blur?: number;
    opacity?: number;
    zoom?: { dir: "in" | "out"; speed: "slow" | "med" | "fast" } | null;
  };
  text?: {
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
  transform?: { xPct?: number; yPct?: number; scale?: number; rotation?: number };
};

export type WCExportOptions = {
  v1clips: WCItem[];
  audioClips: WCItem[];
  music?: WCItem;
  imageItems?: WCItem[];
  textItems?: WCItem[];
  /** @deprecated use textItems */
  textItem?: WCItem;
  targetW: number;
  targetH: number;
  fps: number;
  vKbps: number;
  aKbps: number;
  totalDuration: number;
  onProgress?: (pct: number) => void;
  onMessage?: (msg: string) => void;
  onLog?: (line: string) => void;
};

const AVC_CODECS = [
  "avc1.640028", // High@L4.0  (1080p)
  "avc1.4d4028", // Main@L4.0
  "avc1.42e028", // Baseline@L4.0
  "avc1.640020",
  "avc1.42e01f",
];

export async function isWebCodecsExportSupported(targetW: number, targetH: number, fps: number, vKbps: number): Promise<{ ok: boolean; codec?: string; hw?: HardwareAcceleration; bitrateMode?: "constant" | "variable"; latencyMode?: "quality" | "realtime"; reason?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "SSR" };
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    return { ok: false, reason: "WebCodecs indisponível neste navegador" };
  }
  for (const codec of AVC_CODECS) {
    for (const hw of ["prefer-hardware", "no-preference"] as const) {
      // Tenta primeiro com VBR + quality, depois cai para defaults (mais compatível).
      const variants: Array<{ bitrateMode?: "constant" | "variable"; latencyMode?: "quality" | "realtime" }> = [
        { bitrateMode: "variable", latencyMode: "quality" },
        { bitrateMode: "variable" },
        {},
      ];
      for (const v of variants) {
        try {
          const r = await VideoEncoder.isConfigSupported({
            codec,
            width: targetW,
            height: targetH,
            bitrate: vKbps * 1000,
            framerate: fps,
            hardwareAcceleration: hw,
            avc: { format: "avc" },
            ...v,
          });
          if (r?.supported) return { ok: true, codec, hw, ...v };
        } catch {
          /* try next */
        }
      }
    }
  }
  return { ok: false, reason: "Nenhum codec AVC suportado" };
}

/** Carrega um File de vídeo em um HTMLVideoElement pronto para play. */
function loadVideoEl(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url;
    v.muted = true; // necessário para autoplay programático
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    const cleanup = () => {
      v.removeEventListener("loadedmetadata", onLoad);
      v.removeEventListener("error", onErr);
    };
    const onLoad = () => { cleanup(); resolve(v); };
    const onErr = () => { cleanup(); URL.revokeObjectURL(url); reject(new Error(`Falha ao carregar vídeo: ${file.name}`)); };
    v.addEventListener("loadedmetadata", onLoad);
    v.addEventListener("error", onErr);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Falha ao carregar imagem: ${file.name}`)); };
    img.src = url;
  });
}

function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { v.removeEventListener("seeked", onSeeked); resolve(); };
    v.addEventListener("seeked", onSeeked);
    try { v.currentTime = Math.max(0, t); } catch { resolve(); }
  });
}

function blurCanvasPx(fx?: WCItem["fx"]): number {
  if (fx?.fillMode !== "blur") return 0;
  const n = Math.max(0, Math.min(100, fx.blurBg ?? 30)) / 100;
  return n <= 0 ? 0 : n * n * 56 + n * 8;
}

function itemBlurPx(fx?: WCItem["fx"]): number {
  const n = Math.max(0, Math.min(100, fx?.blur ?? 0));
  return n <= 0 ? 0 : Math.max(0.2, n * 0.45);
}

function drawSoftCover(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
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
  const tmp = new OffscreenCanvas(tmpW, tmpH);
  const tctx = tmp.getContext("2d")!;
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
  try { (ctx as unknown as { filter: string }).filter = blurPx > 0 ? `blur(${Math.min(18, blurPx / 3)}px)` : "none"; } catch { /* ignore */ }
  const bleed = Math.ceil(Math.min(targetW, targetH) * 0.04 + blurPx * 0.5);
  ctx.drawImage(tmp, -bleed, -bleed, targetW + bleed * 2, targetH + bleed * 2);
  try { (ctx as unknown as { filter: string }).filter = "none"; } catch { /* ignore */ }
  ctx.restore();
}

function drawClipFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  fillMode: WCItem["fx"] extends infer F ? F extends { fillMode: infer M } ? M : never : never = "bars",
  bgColor: string = "#000000",
  blurPx: number = 0,
  opacity: number = 1,
) {
  ctx.save();
  ctx.globalAlpha = 1;
  // background
  if (fillMode === "color" || fillMode === "bars") {
    ctx.fillStyle = fillMode === "color" ? bgColor : "#000000";
    ctx.fillRect(0, 0, targetW, targetH);
  } else if (fillMode === "blur" || fillMode === "mirror") {
    // cover background
    const cover = Math.max(targetW / srcW, targetH / srcH) * 1.06;
    const w = srcW * cover, h = srcH * cover;
    const x = (targetW - w) / 2, y = (targetH - h) / 2;
    if (fillMode === "blur") {
      drawSoftCover(ctx, source, srcW, srcH, targetW, targetH, blurPx);
    } else {
      // mirror
      ctx.save();
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, targetW - x - w, y, w, h);
      ctx.restore();
    }
  } else if (fillMode === "stretch") {
    // no bg, drawn full
  }
  // foreground
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  try { (ctx as unknown as { filter: string }).filter = itemBlurPx({ blur: blurPx } as WCItem["fx"]) > 0 ? `blur(${itemBlurPx({ blur: blurPx } as WCItem["fx"])}px)` : "none"; } catch { /* ignore */ }
  if (fillMode === "stretch") {
    ctx.drawImage(source, 0, 0, targetW, targetH);
  } else {
    const contain = Math.min(targetW / srcW, targetH / srcH);
    const w = srcW * contain, h = srcH * contain;
    const x = (targetW - w) / 2, y = (targetH - h) / 2;
    ctx.drawImage(source, x, y, w, h);
  }
  try { (ctx as unknown as { filter: string }).filter = "none"; } catch { /* ignore */ }
  ctx.restore();
}

function computeZoomScale(fx: WCItem["fx"] | undefined, localT: number, dur: number): number {
  if (!fx?.zoom) return 1;
  const speedMul = fx.zoom.speed === "slow" ? 0.1 : fx.zoom.speed === "fast" ? 0.35 : 0.2;
  const p = dur > 0 ? Math.min(1, Math.max(0, localT / dur)) : 0;
  return fx.zoom.dir === "in" ? 1 + speedMul * p : 1 + speedMul * (1 - p);
}

function drawImageOverlay(
  ctx: OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement,
  item: WCItem,
  localT: number,
  dur: number,
  targetW: number,
  targetH: number,
  layer: "background" | "foreground" | "both" = "both",
) {
  const srcW = img.naturalWidth || item.width || targetW;
  const srcH = img.naturalHeight || item.height || targetH;
  if (srcW <= 0 || srcH <= 0) return;
  const ar = srcW / srcH;
  let boxH = targetH * 0.6;
  let boxW = boxH * ar;
  if (boxW > targetW * 0.9) { boxW = targetW * 0.9; boxH = boxW / ar; }
  const x = ((item.transform?.xPct ?? 50) / 100) * targetW;
  const y = ((item.transform?.yPct ?? 50) / 100) * targetH;
  const scale = (item.transform?.scale ?? 1) * computeZoomScale(item.fx, localT, dur);
  const rot = ((item.transform?.rotation ?? 0) * Math.PI) / 180;
  const op = computeOpacity(item, localT);

  if ((layer === "background" || layer === "both") && (item.fx?.fillMode === "blur" || item.fx?.fillMode === "mirror")) {
    ctx.save();
    ctx.globalAlpha = op;
    if (item.fx.fillMode === "blur") {
      drawSoftCover(ctx, img, srcW, srcH, targetW, targetH, blurCanvasPx(item.fx));
    } else {
      const cover = Math.max(targetW / srcW, targetH / srcH) * 1.06;
      const bgW = srcW * cover;
      const bgH = srcH * cover;
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, (targetW - bgW) / 2, (targetH - bgH) / 2, bgW, bgH);
    }
    ctx.restore();
  }

  if (layer === "background") return;

  ctx.save();
  ctx.globalAlpha = op;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -boxW / 2, -boxH / 2, boxW, boxH);
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

function roundRectPath(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
  ctx: OffscreenCanvasRenderingContext2D,
  item: WCItem,
  localT: number,
  dur: number,
  targetW: number,
  targetH: number,
) {
  const t = item.text!;
  // fade
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
  ctx.font = `${style} ${weight} ${size}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  // letterSpacing (suportado em navegadores modernos)
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSp}px`; } catch { /* ignore */ }

  const lines = String(t.content).split("\n");
  const measureLine = (line: string) => {
    const m = ctx.measureText(line);
    return m.width + letterSp * Math.max(0, line.length - 1);
  };
  const widths = lines.map(measureLine);
  const maxW = Math.max(1, ...widths);
  const totalH = lines.length * lineH;

  // Background pill
  if ((t.bgOpacity ?? 0) > 0.001) {
    ctx.fillStyle = hexToRgba(t.bgColor || "#000000", t.bgOpacity ?? 0);
    roundRectPath(ctx, -maxW / 2 - padX, -totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2, t.radius ?? 0);
    ctx.fill();
  }

  // Shadow
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

function computeOpacity(it: WCItem, localT: number): number {
  const dur = it.outPoint - it.inPoint;
  let v = (it.fx?.opacity ?? 100) / 100;
  if (it.fadeIn && localT < it.fadeIn) v *= Math.max(0, localT / it.fadeIn);
  if (it.fadeOut && localT > dur - it.fadeOut) v *= Math.max(0, (dur - localT) / it.fadeOut);
  return Math.max(0, Math.min(1, v));
}

function dbToGain(db: number) { return Math.pow(10, db / 20); }

async function decodeAudio(ac: OfflineAudioContext | AudioContext, file: File): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer();
  return await ac.decodeAudioData(buf.slice(0));
}

async function buildMixedAudio(opts: WCExportOptions, sampleRate: number): Promise<AudioBuffer> {
  const totalDur = Math.max(0.1, opts.totalDuration);
  const ac = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);
  const probe = new AudioContext({ sampleRate });

  const wireSource = (src: AudioBufferSourceNode, item: WCItem, opts2: { ducker?: number } = {}) => {
    // Cada fonte → grafo de FX (EQ + reverb + echo + ambiente + canais + ganho)
    const graph = item.audioFx
      ? buildAudioFxGraph(ac, { initialFx: item.audioFx, initialGainDb: item.gainDb ?? 0 })
      : null;
    const dur = item.outPoint - item.inPoint;
    // Envelope de fade aplicado em um gain pré-grafo
    const fadeGain = ac.createGain();
    const startT = item.start;
    fadeGain.gain.value = 1;
    if (item.fadeIn && item.fadeIn > 0.01) {
      fadeGain.gain.setValueAtTime(0, startT);
      fadeGain.gain.linearRampToValueAtTime(1, startT + item.fadeIn);
    }
    if (item.fadeOut && item.fadeOut > 0.01) {
      fadeGain.gain.setValueAtTime(1, startT + dur - item.fadeOut);
      fadeGain.gain.linearRampToValueAtTime(0, startT + dur);
    }
    if (graph) {
      src.connect(fadeGain).connect(graph.input);
      // ducker (música) opcional: multiplica saída do grafo
      if (opts2.ducker != null && opts2.ducker !== 1) {
        const duck = ac.createGain();
        duck.gain.value = opts2.ducker;
        graph.output.connect(duck).connect(ac.destination);
      } else {
        graph.output.connect(ac.destination);
      }
    } else {
      const g = ac.createGain();
      g.gain.value = Math.pow(10, (item.gainDb ?? 0) / 20) * (opts2.ducker ?? 1);
      src.connect(fadeGain).connect(g).connect(ac.destination);
    }
  };

  try {
    for (const c of opts.v1clips) {
      if (c.kind !== "video" || !c.file) continue;
      let abuf: AudioBuffer | null = null;
      try { abuf = await decodeAudio(probe, c.file); } catch { continue; }
      if (!abuf) continue;
      const src = ac.createBufferSource();
      src.buffer = abuf;
      wireSource(src, c);
      try { src.start(c.start, c.inPoint, c.outPoint - c.inPoint); } catch { /* ignore */ }
    }
    if (opts.music?.file) {
      let abuf: AudioBuffer | null = null;
      try { abuf = await decodeAudio(probe, opts.music.file); } catch { abuf = null; }
      if (abuf) {
        const src = ac.createBufferSource();
        src.buffer = abuf; src.loop = true;
        wireSource(src, opts.music, { ducker: opts.v1clips.length ? 0.4 : 1.0 });
        try { src.start(0, 0, totalDur); } catch { /* ignore */ }
      }
    }
    for (const a of opts.audioClips) {
      if (opts.music && a.id === opts.music.id) continue;
      if (!a.file) continue;
      let abuf: AudioBuffer | null = null;
      try { abuf = await decodeAudio(probe, a.file); } catch { continue; }
      if (!abuf) continue;
      const src = ac.createBufferSource();
      src.buffer = abuf;
      wireSource(src, a);
      try { src.start(a.start, a.inPoint, a.outPoint - a.inPoint); } catch { /* ignore */ }
    }
  } finally {
    try { await probe.close(); } catch { /* ignore */ }
  }
  return await ac.startRendering();
}


/** Converte AudioBuffer em chunks PCM Float32 interleaved (s16/f32) p/ AudioEncoder. */
function* iterAudioChunks(buf: AudioBuffer, chunkFrames: number) {
  const ch = buf.numberOfChannels;
  const total = buf.length;
  const channels: Float32Array[] = [];
  for (let c = 0; c < ch; c++) channels.push(buf.getChannelData(c));
  for (let i = 0; i < total; i += chunkFrames) {
    const n = Math.min(chunkFrames, total - i);
    const interleaved = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) {
      const src = channels[c];
      for (let k = 0; k < n; k++) interleaved[k * ch + c] = src[i + k];
    }
    yield { data: interleaved, frames: n, offset: i };
  }
}

export async function exportWithWebCodecs(opts: WCExportOptions): Promise<Blob> {
  const { targetW, targetH, fps, vKbps, aKbps, totalDuration, v1clips } = opts;
  const imageItems: WCItem[] = opts.imageItems ?? [];
  const textItems: WCItem[] = opts.textItems ?? (opts.textItem ? [opts.textItem] : []);
  const log = (m: string) => { opts.onLog?.(m); };
  const msg = (m: string) => { opts.onMessage?.(m); };

  const support = await isWebCodecsExportSupported(targetW, targetH, fps, vKbps);
  if (!support.ok) throw new Error(`WebCodecs não suportado: ${support.reason}`);
  log(`[wc] codec=${support.codec} hw=${support.hw}`);
  msg("Preparando aceleração por hardware...");

  const sampleRate = 48000;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: targetW, height: targetH, frameRate: fps },
    audio: { codec: "aac", numberOfChannels: 2, sampleRate },
    fastStart: "in-memory",
  });

  // ====== VIDEO ENCODER ======
  let vEncError: unknown = null;
  let videoChunksOut = 0;
  const vEnc: VideoEncoder = new VideoEncoder({
    output: (chunk, meta) => { videoChunksOut++; muxer.addVideoChunk(chunk, meta); },
    error: (e: unknown) => { vEncError = e; log(`[wc] vEnc erro: ${String(e)}`); },
  });
  const configBase: VideoEncoderConfig = {
    codec: support.codec!,
    width: targetW,
    height: targetH,
    bitrate: vKbps * 1000,
    framerate: fps,
    hardwareAcceleration: support.hw,
    avc: { format: "avc" },
  };
  if (support.bitrateMode) configBase.bitrateMode = support.bitrateMode;
  if (support.latencyMode) configBase.latencyMode = support.latencyMode;
  vEnc.configure(configBase);

  // ====== CANVAS ======
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, targetW, targetH);

  // Pré-carrega fontes (imagens carregadas sob demanda dentro do loop)
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  msg(`Codificando vídeo (0/${totalFrames})...`);

  // cache de elementos de vídeo por clipe
  const videoEls = new Map<string, HTMLVideoElement>();
  const imageEls = new Map<string, HTMLImageElement>();
  const loadFor = async (c: WCItem) => {
    if (c.kind === "video") {
      let el = videoEls.get(c.id);
      if (!el && c.file) { el = await loadVideoEl(c.file); videoEls.set(c.id, el); }
      return el;
    }
    if (c.kind === "image") {
      let el = imageEls.get(c.id);
      if (!el && c.file) { el = await loadImage(c.file); imageEls.set(c.id, el); }
      return el;
    }
    return undefined;
  };

  // pré-carrega todos sequencialmente (curto)
  for (const c of [...v1clips, ...imageItems]) { try { await loadFor(c); } catch (e) { log(`[wc] load falhou ${c.name}: ${String(e)}`); } }

  const findActive = (t: number) => v1clips.find(c => t >= c.start && t < c.start + (c.outPoint - c.inPoint));

  let lastSeekClipId: string | null = null;
  let lastSeekClipTime = -1;

  for (let f = 0; f < totalFrames; f++) {
    if (vEncError) throw new Error(`Encoder de vídeo falhou: ${String(vEncError)}`);
    const t = f / fps;
    const active = findActive(t);
    // limpa
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, targetW, targetH);

    if (active) {
      const localT = t - active.start;
      const srcT = active.inPoint + localT;
      const fill = active.fx?.fillMode ?? "bars";
      const bg = active.fx?.bgColor ?? "#000000";
      const blurPx = blurCanvasPx(active.fx);
      const op = computeOpacity(active, localT);

      try {
        const el = await loadFor(active);
        if (el) {
          if (active.kind === "video") {
            const v = el as HTMLVideoElement;
            // seek only when needed (mais de meio frame de diferença)
            const needSeek = active.id !== lastSeekClipId || Math.abs(v.currentTime - srcT) > (0.5 / fps);
            if (needSeek) {
              await seekVideo(v, srcT);
              lastSeekClipId = active.id;
              lastSeekClipTime = srcT;
            }
            const sw = v.videoWidth || targetW;
            const sh = v.videoHeight || targetH;
            drawClipFrame(ctx, v, sw, sh, targetW, targetH, fill, bg, blurPx, op);
          } else {
            const img = el as HTMLImageElement;
            drawClipFrame(ctx, img, img.naturalWidth, img.naturalHeight, targetW, targetH, fill, bg, blurPx, op);
          }
        }
      } catch (e) {
        log(`[wc] frame ${f} erro: ${String(e)}`);
      }
    }

    // fundos desfocados/espelhados das imagens sobrepostas ficam atrás dos objetos principais
    for (const imgItem of imageItems) {
      const dur = imgItem.outPoint - imgItem.inPoint;
      const localT = t - imgItem.start;
      if (localT < 0 || localT > dur) continue;
      if (imgItem.fx?.fillMode !== "blur" && imgItem.fx?.fillMode !== "mirror") continue;
      const el = await loadFor(imgItem);
      if (el) drawImageOverlay(ctx, el as HTMLImageElement, imgItem, localT, dur, targetW, targetH, "background");
    }

    // overlays de imagem em trilhas superiores (respeita tempo/posição/escala/fade)
    for (const imgItem of imageItems) {
      const dur = imgItem.outPoint - imgItem.inPoint;
      const localT = t - imgItem.start;
      if (localT < 0 || localT > dur) continue;
      const el = await loadFor(imgItem);
      if (el) drawImageOverlay(ctx, el as HTMLImageElement, imgItem, localT, dur, targetW, targetH, "foreground");
    }

    // overlays de texto (múltiplos, respeitando timing/posição/estilo)
    for (const tItem of textItems) {
      if (!tItem.text?.content) continue;
      const dur = tItem.outPoint - tItem.inPoint;
      const localT = t - tItem.start;
      if (localT < 0 || localT > dur) continue;
      drawTextOverlay(ctx, tItem, localT, dur, targetW, targetH);
    }


    const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1_000_000) / fps), duration: Math.round(1_000_000 / fps) });
    // GOP maior (keyframe a cada ~5s) reduz bastante o tamanho do MP4
    const keyFrame = f % Math.max(1, Math.round(fps * 5)) === 0;
    try { vEnc.encode(frame, { keyFrame }); }
    finally { frame.close(); }

    if (vEnc.encodeQueueSize > 8) {
      // aguarda drenar para não estourar memória
      while (vEnc.encodeQueueSize > 4) {
        await new Promise(r => setTimeout(r, 4));
      }
    }

    if ((f & 7) === 0) {
      const pct = (f / totalFrames) * 0.85; // reserva 15% para áudio/mux
      opts.onProgress?.(pct);
      msg(`Codificando vídeo (${f}/${totalFrames})...`);
    }
  }

  await vEnc.flush();
  vEnc.close();
  if (vEncError) throw new Error(`Encoder de vídeo falhou: ${String(vEncError)}`);
  if (videoChunksOut === 0) {
    throw new Error("WebCodecs não emitiu chunks de vídeo (provável incompatibilidade do navegador)");
  }
  log(`[wc] vídeo: ${videoChunksOut} chunks emitidos`);

  // libera elementos de vídeo
  for (const v of videoEls.values()) { try { v.pause(); v.src = ""; v.load(); } catch { /* ignore */ } }

  // ====== AUDIO ======
  msg("Mixando áudio...");
  let mixed: AudioBuffer | null = null;
  try { mixed = await buildMixedAudio(opts, sampleRate); }
  catch (e) { log(`[wc] mix de áudio falhou, gravando silêncio: ${String(e)}`); }

  const aEnc: AudioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e: unknown) => log(`[wc] aEnc erro: ${String(e)}`),
  });
  aEnc.configure({
    codec: "mp4a.40.2",
    numberOfChannels: 2,
    sampleRate,
    bitrate: aKbps * 1000,
  });

  const channels = 2;
  const chunkFrames = 1024;
  if (mixed) {
    let baseFrame = 0;
    for (const { data, frames } of iterAudioChunks(mixed, chunkFrames)) {
      // garante 2 canais (se mono, duplica)
      let out = data;
      if (mixed.numberOfChannels === 1) {
        out = new Float32Array(frames * 2);
        for (let i = 0; i < frames; i++) { out[i * 2] = data[i]; out[i * 2 + 1] = data[i]; }
      }
      const ad = new AudioData({
        format: "f32",
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: Math.round((baseFrame * 1_000_000) / sampleRate),
        data: out,
      });
      try { aEnc.encode(ad); } finally { ad.close(); }
      baseFrame += frames;
    }
  } else {
    const totalAFrames = Math.ceil(totalDuration * sampleRate);
    const silence = new Float32Array(chunkFrames * channels);
    let baseFrame = 0;
    while (baseFrame < totalAFrames) {
      const n = Math.min(chunkFrames, totalAFrames - baseFrame);
      const ad = new AudioData({
        format: "f32",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((baseFrame * 1_000_000) / sampleRate),
        data: n === chunkFrames ? silence : new Float32Array(n * channels),
      });
      try { aEnc.encode(ad); } finally { ad.close(); }
      baseFrame += n;
    }
  }
  await aEnc.flush();
  aEnc.close();

  msg("Finalizando MP4...");
  opts.onProgress?.(0.97);
  muxer.finalize();
  const target = muxer.target as ArrayBufferTarget;
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  opts.onProgress?.(1);
  return blob;
}
