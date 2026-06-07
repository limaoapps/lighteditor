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
    opacity?: number;
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
    ctx.save();
    if (fillMode === "blur" && blurPx > 0) {
      ctx.filter = `blur(${blurPx}px)`;
    }
    if (fillMode === "mirror") {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, targetW - x - w, y, w, h);
    } else {
      ctx.drawImage(source, x, y, w, h);
    }
    ctx.restore();
    ctx.filter = "none";
  } else if (fillMode === "stretch") {
    // no bg, drawn full
  }
  // foreground
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  if (fillMode === "stretch") {
    ctx.drawImage(source, 0, 0, targetW, targetH);
  } else {
    const contain = Math.min(targetW / srcW, targetH / srcH);
    const w = srcW * contain, h = srcH * contain;
    const x = (targetW - w) / 2, y = (targetH - h) / 2;
    ctx.drawImage(source, x, y, w, h);
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
  for (const c of v1clips) { try { await loadFor(c); } catch (e) { log(`[wc] load falhou ${c.name}: ${String(e)}`); } }

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
      const blurPx = active.fx?.fillMode === "blur" ? Math.max(0, Math.min(40, (active.fx.blurBg ?? 30) / 3)) : 0;
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

    // overlay de texto simples
    if (textItem?.text?.content) {
      const t2 = textItem.text;
      const y = Math.round((textItem.transform?.yPct ?? 80) / 100 * targetH);
      ctx.save();
      ctx.font = `${t2.size}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const metrics = ctx.measureText(t2.content);
      const padX = 18, padY = 10;
      const w = metrics.width + padX * 2;
      const h = t2.size + padY * 2;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect((targetW - w) / 2, y - h / 2, w, h);
      ctx.fillStyle = t2.color || "#fff";
      ctx.fillText(t2.content, targetW / 2, y);
      ctx.restore();
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
