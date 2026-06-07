import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film, Plus, Scissors, Trash2, Play, Pause, Square, Download, ArrowLeft,
  Loader2, X, Volume2, VolumeX, ZoomIn, ZoomOut, Type as TypeIcon, Music2,
  Image as ImageIcon, Video as VideoIcon, RotateCw, Maximize2, AlignCenter,
  Lock, Unlock, Undo2, Redo2, Check, Copy as CopyIcon, ClipboardPaste,
  Sparkles, Sliders, Wand2, RotateCcw, Palette,
  Settings as SettingsIcon, FileText, RefreshCw, Cpu, Info, Magnet,
} from "lucide-react";
import { getFFmpeg, fetchFile, resetFFmpeg } from "@/lib/ffmpeg-client";
import {
  DEFAULT_AUDIO_FX as DEFAULT_AUDIO_FX_REF,
  EQ_BANDS,
  buildAudioFxGraph,
  buildAudioFilterChain,
  type AudioFx,
  type AudioFxNodes,
  type ReverbPreset,
  type Ambience,
  type ChannelMode,
} from "@/lib/audio-fx";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor — Video Lite Editor" },
      { name: "description", content: "Editor de vídeo no navegador com timeline multi-trilha, snapping, fades e undo/redo." },
    ],
  }),
  component: Editor,
});

type ItemKind = "video" | "audio" | "image" | "text";
type TrackKind = "video" | "audio";

type Transform = { xPct: number; yPct: number; scale: number; rotation: number };
type TextAlign = "left" | "center" | "right";
type TextProps = {
  content: string;
  fontFamily: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  letterSpacing: number;   // px
  lineHeight: number;      // multiplier
  opacity: number;         // 0..1
  bgColor: string;         // background pill
  bgOpacity: number;       // 0..1
  paddingX: number;        // px
  paddingY: number;        // px
  radius: number;          // px
  shadowColor: string;
  shadowBlur: number;      // px
  shadowOffsetX: number;   // px
  shadowOffsetY: number;   // px
  strokeColor: string;
  strokeWidth: number;     // px
};

// Google Fonts a serem carregadas dinamicamente (família : pesos)
const GOOGLE_FONTS: Array<{ name: string; weights: string }> = [
  { name: "Inter", weights: "wght@300;400;500;600;700;800;900" },
  { name: "Lato", weights: "wght@300;400;700;900" },
  { name: "Roboto", weights: "wght@300;400;500;700;900" },
  { name: "Open Sans", weights: "wght@300;400;600;700;800" },
  { name: "Montserrat", weights: "wght@300;400;500;600;700;800;900" },
  { name: "Poppins", weights: "wght@300;400;500;600;700;800;900" },
  { name: "Raleway", weights: "wght@300;400;500;600;700;800;900" },
  { name: "Nunito", weights: "wght@300;400;600;700;800;900" },
  { name: "Ubuntu", weights: "wght@300;400;500;700" },
  { name: "PT Sans", weights: "wght@400;700" },
  { name: "Work Sans", weights: "wght@300;400;500;600;700;800" },
  { name: "Source Sans 3", weights: "wght@300;400;600;700;900" },
  { name: "Rubik", weights: "wght@300;400;500;600;700;800;900" },
  { name: "Quicksand", weights: "wght@300;400;500;600;700" },
  { name: "Manrope", weights: "wght@300;400;500;600;700;800" },
  { name: "DM Sans", weights: "wght@400;500;700;900" },
  { name: "Space Grotesk", weights: "wght@300;400;500;600;700" },
  { name: "Barlow", weights: "wght@300;400;500;600;700;800;900" },
  { name: "Oswald", weights: "wght@300;400;500;600;700" },
  { name: "Bebas Neue", weights: "wght@400" },
  { name: "Anton", weights: "wght@400" },
  { name: "Archivo Black", weights: "wght@400" },
  { name: "Bangers", weights: "wght@400" },
  { name: "Righteous", weights: "wght@400" },
  { name: "Fjalla One", weights: "wght@400" },
  { name: "Teko", weights: "wght@300;400;500;600;700" },
  { name: "Playfair Display", weights: "wght@400;500;600;700;800;900" },
  { name: "Merriweather", weights: "wght@300;400;700;900" },
  { name: "Lora", weights: "wght@400;500;600;700" },
  { name: "Cormorant Garamond", weights: "wght@300;400;500;600;700" },
  { name: "EB Garamond", weights: "wght@400;500;600;700;800" },
  { name: "Crimson Text", weights: "wght@400;600;700" },
  { name: "Abril Fatface", weights: "wght@400" },
  { name: "Pacifico", weights: "wght@400" },
  { name: "Dancing Script", weights: "wght@400;500;600;700" },
  { name: "Caveat", weights: "wght@400;500;600;700" },
  { name: "Lobster", weights: "wght@400" },
  { name: "Great Vibes", weights: "wght@400" },
  { name: "Sacramento", weights: "wght@400" },
  { name: "Satisfy", weights: "wght@400" },
  { name: "Shadows Into Light", weights: "wght@400" },
  { name: "Permanent Marker", weights: "wght@400" },
  { name: "Indie Flower", weights: "wght@400" },
  { name: "Kalam", weights: "wght@300;400;700" },
  { name: "Patrick Hand", weights: "wght@400" },
  { name: "Press Start 2P", weights: "wght@400" },
  { name: "VT323", weights: "wght@400" },
  { name: "Orbitron", weights: "wght@400;500;600;700;800;900" },
  { name: "Russo One", weights: "wght@400" },
  { name: "Audiowide", weights: "wght@400" },
  { name: "Monoton", weights: "wght@400" },
  { name: "JetBrains Mono", weights: "wght@300;400;500;600;700;800" },
  { name: "Fira Code", weights: "wght@300;400;500;600;700" },
  { name: "Source Code Pro", weights: "wght@300;400;500;600;700;900" },
];

const SYSTEM_FONTS: Array<{ name: string; stack: string }> = [
  { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { name: "Helvetica", stack: "Helvetica, Arial, sans-serif" },
  { name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { name: "Tahoma", stack: "Tahoma, Geneva, sans-serif" },
  { name: "Trebuchet MS", stack: "'Trebuchet MS', sans-serif" },
  { name: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  { name: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  { name: "Courier New", stack: "'Courier New', Courier, monospace" },
  { name: "Impact", stack: "Impact, 'Arial Black', sans-serif" },
  { name: "Comic Sans MS", stack: "'Comic Sans MS', 'Comic Sans', cursive" },
];

const FONT_FAMILIES: Array<{ label: string; stack: string }> = [
  ...GOOGLE_FONTS.map(f => ({ label: f.name, stack: `'${f.name}', system-ui, sans-serif` })),
  ...SYSTEM_FONTS.map(f => ({ label: f.name, stack: f.stack })),
].sort((a, b) => a.label.localeCompare(b.label));

const defaultText = (): TextProps => ({
  content: "Seu texto",
  fontFamily: "'Inter', system-ui, sans-serif",
  size: 64,
  color: "#ffffff",
  bold: true,
  italic: false,
  underline: false,
  align: "center",
  letterSpacing: 0,
  lineHeight: 1.2,
  opacity: 1,
  bgColor: "#000000",
  bgOpacity: 0,
  paddingX: 12,
  paddingY: 6,
  radius: 8,
  shadowColor: "#000000",
  shadowBlur: 12,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  strokeColor: "#000000",
  strokeWidth: 0,
});

type MediaAsset = {
  id: string;
  kind: ItemKind;
  name: string;
  file?: File;
  url?: string;
  duration: number;
  width?: number;
  height?: number;
};

type FillMode = "bars" | "blur" | "mirror" | "stretch" | "color";
type ZoomFx = { dir: "in" | "out"; speed: "slow" | "med" | "fast" } | null;
type VignetteMode = "dark" | "light";
type Fx = {
  brightness: number; contrast: number; saturation: number; temperature: number;
  sharpness: number; exposure: number; shadows: number; highlights: number;
  opacity: number;
  preset: string | null;
  blurBg: number;
  fillMode: FillMode;
  bgColor: string;
  zoom: ZoomFx;
  vignette: number;        // 0..100 intensity (0 = off)
  vignetteSize: number;    // 0..100 (size of clear center)
  vignetteMode: VignetteMode;
};

type TLItem = {
  id: string;
  mediaId?: string;
  kind: ItemKind;
  trackId: string;
  name: string;
  file?: File;
  url?: string;
  start: number;
  inPoint: number;
  outPoint: number;
  sourceDuration: number;
  width?: number;
  height?: number;
  transform?: Transform;
  text?: TextProps;
  fadeIn?: number;
  fadeOut?: number;
  gainDb?: number;
  audioFx?: AudioFx;
  fx?: Fx;
};

type Track = { id: string; kind: TrackKind; label: string };

type AspectKey = "16:9" | "9:16" | "1:1" | "4:3" | "custom";
const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  "16:9": { w: 16, h: 9, label: "16:9 · YouTube" },
  "9:16": { w: 9, h: 16, label: "9:16 · TikTok/Reels" },
  "1:1":  { w: 1, h: 1, label: "1:1 · Instagram" },
  "4:3":  { w: 4, h: 3, label: "4:3 · Clássico" },
  "custom": { w: 16, h: 9, label: "Personalizado" },
};

const INITIAL_TRACKS: Track[] = [
  { id: "V1", kind: "video", label: "V1 · Vídeo" },
  { id: "V2", kind: "video", label: "V2 · Vídeo" },
  { id: "A1", kind: "audio", label: "A1 · Áudio" },
  { id: "A2", kind: "audio", label: "A2 · Áudio" },
];
const IMAGE_MAX_DUR = 3600;

type Quality = "720" | "1080" | "2160";
const QUALITY_HEIGHT: Record<Quality, number> = { "720": 720, "1080": 1080, "2160": 2160 };

type Codec = "h264" | "h265" | "vp9";
type BitrateMode = "low" | "medium" | "high" | "custom";
type AudioBitrate = 128 | 192 | 256 | 320;

type ExportPresetKey =
  | "youtube_1080" | "youtube_4k" | "tiktok" | "reels"
  | "ig_feed" | "facebook" | "whatsapp" | "custom";

type ExportPreset = {
  label: string;
  aspect: AspectKey;
  quality: Quality;
  fps: number;
  vBitrate: number; // kbps
  aBitrate: AudioBitrate;
};

const EXPORT_PRESETS: Record<ExportPresetKey, ExportPreset> = {
  youtube_1080: { label: "YouTube 1080p",    aspect: "16:9", quality: "1080", fps: 30, vBitrate: 8000,  aBitrate: 192 },
  youtube_4k:   { label: "YouTube 4K",       aspect: "16:9", quality: "2160", fps: 30, vBitrate: 35000, aBitrate: 256 },
  tiktok:       { label: "TikTok 1080×1920", aspect: "9:16", quality: "1080", fps: 30, vBitrate: 6000,  aBitrate: 192 },
  reels:        { label: "Instagram Reels",  aspect: "9:16", quality: "1080", fps: 30, vBitrate: 6000,  aBitrate: 192 },
  ig_feed:      { label: "Instagram 1:1",    aspect: "1:1",  quality: "1080", fps: 30, vBitrate: 5000,  aBitrate: 192 },
  facebook:     { label: "Facebook",         aspect: "16:9", quality: "1080", fps: 30, vBitrate: 6000,  aBitrate: 192 },
  whatsapp:     { label: "WhatsApp",         aspect: "16:9", quality: "720",  fps: 30, vBitrate: 2500,  aBitrate: 128 },
  custom:       { label: "Personalizado",    aspect: "16:9", quality: "1080", fps: 30, vBitrate: 8000,  aBitrate: 192 },
};

function defaultVBitrate(q: Quality): number {
  // Bitrates calibrados para H.264 VBR em hardware (similar ao CapCut):
  // arquivos consideravelmente menores mantendo qualidade visual percebida.
  if (q === "720") return 2500;
  if (q === "1080") return 4500;
  return 16000; // 2160p / 4K
}
function bitrateFromMode(q: Quality, mode: BitrateMode, custom: number): number {
  if (mode === "custom") return Math.max(200, custom);
  const base = defaultVBitrate(q);
  if (mode === "low")    return Math.round(base * 0.6);
  if (mode === "high")   return Math.round(base * 1.6);
  return base; // medium
}
function estimateSizeMB(durationSec: number, vKbps: number, aKbps: number): number {
  const bits = (vKbps + aKbps) * 1000 * Math.max(0.1, durationSec);
  return bits / 8 / (1024 * 1024);
}
function detectGpu(): { available: boolean; vendor: string } {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { available: false, vendor: "—" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || "GPU";
    return { available: true, vendor: String(r) };
  } catch { return { available: false, vendor: "—" }; }
}
function fmtClock(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const CENTER_SNAP = 1.5;
const TIME_SNAP_PX = 8;

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${cs}`;
}

function dbToGain(db: number) { return Math.pow(10, db / 20); }

const DEFAULT_FX: Fx = {
  brightness: 0, contrast: 0, saturation: 0, temperature: 0,
  sharpness: 0, exposure: 0, shadows: 0, highlights: 0,
  opacity: 100, preset: null, blurBg: 30, fillMode: "bars",
  bgColor: "#000000", zoom: null,
  vignette: 0, vignetteSize: 50, vignetteMode: "dark",
};

const FX_DEFAULT_VAL: Record<string, number> = {
  brightness: 0, contrast: 0, saturation: 0, temperature: 0,
  sharpness: 0, exposure: 0, shadows: 0, highlights: 0, opacity: 100,
};

const QUICK_EFFECTS: { id: string; label: string }[] = [
  { id: "bw", label: "Preto e Branco" },
  { id: "sepia", label: "Sépia" },
  { id: "vignette", label: "Vinheta" },
  { id: "sharp", label: "Nitidez Extra" },
  { id: "contrast", label: "Contraste Forte" },
  { id: "warm", label: "Tons Quentes" },
  { id: "cool", label: "Tons Frios" },
  { id: "vintage", label: "Vintage" },
  { id: "cinema", label: "Cinema" },
  { id: "retro", label: "Retrô" },
  { id: "faded", label: "Desbotado" },
  { id: "highsat", label: "Alta Saturação" },
  { id: "lowsat", label: "Baixa Saturação" },
];

const PRESETS: { id: string; label: string; patch: Partial<Fx> }[] = [
  { id: "natural", label: "Natural", patch: { ...DEFAULT_FX } },
  { id: "youtube", label: "YouTube", patch: { brightness: 5, contrast: 15, saturation: 15 } },
  { id: "tiktok",  label: "TikTok",  patch: { saturation: 30, contrast: 20, sharpness: 30 } },
  { id: "cinema",  label: "Cinema",  patch: { contrast: 20, saturation: -15, brightness: -5, preset: "cinema" } },
  { id: "vintage", label: "Vintage", patch: { preset: "vintage" } },
  { id: "bw",      label: "Preto e Branco", patch: { preset: "bw" } },
  { id: "retro",   label: "Retrô",   patch: { preset: "retro" } },
];

function cssFilter(fx?: Fx): string {
  if (!fx) return "none";
  const parts: string[] = [];
  // adjustments (-100..100 → multipliers)
  const bright = 1 + (fx.brightness + fx.exposure) / 100;
  const contrast = 1 + (fx.contrast / 100);
  const sat = 1 + (fx.saturation / 100);
  parts.push(`brightness(${bright.toFixed(3)})`);
  parts.push(`contrast(${contrast.toFixed(3)})`);
  parts.push(`saturate(${sat.toFixed(3)})`);
  // temperature: negative→cool (hue +), positive→warm (sepia + slight hue -)
  if (fx.temperature !== 0) {
    if (fx.temperature > 0) {
      parts.push(`sepia(${(fx.temperature / 200).toFixed(3)})`);
      parts.push(`hue-rotate(${(-fx.temperature * 0.1).toFixed(2)}deg)`);
    } else {
      parts.push(`hue-rotate(${(-fx.temperature * 0.2).toFixed(2)}deg)`);
    }
  }
  // shadows/highlights approximation via gamma-like brightness/contrast tweak
  if (fx.shadows) parts.push(`brightness(${(1 + fx.shadows / 400).toFixed(3)})`);
  if (fx.highlights) parts.push(`contrast(${(1 + fx.highlights / 400).toFixed(3)})`);
  // sharpness: real unsharp-mask via SVG filter (no saturation/contrast bleed)
  if (fx.sharpness > 0) parts.push(`url(#lle-sharpen)`);
  // preset overlays — keep purely tonal; "sharp"/"vignette" handled outside cssFilter
  switch (fx.preset) {
    case "bw":       parts.push("grayscale(1)"); break;
    case "sepia":    parts.push("sepia(1)"); break;
    case "sharp":    parts.push("url(#lle-sharpen-strong)"); break;
    case "contrast": parts.push("contrast(1.5)"); break;
    case "warm":     parts.push("sepia(0.35) saturate(1.2) hue-rotate(-10deg)"); break;
    case "cool":     parts.push("hue-rotate(20deg) saturate(1.1) brightness(1.02)"); break;
    case "vintage":  parts.push("sepia(0.55) contrast(0.9) saturate(0.85)"); break;
    case "cinema":   parts.push("contrast(1.2) saturate(0.85) brightness(0.95)"); break;
    case "retro":    parts.push("sepia(0.4) hue-rotate(-15deg) saturate(1.3) contrast(1.1)"); break;
    case "faded":    parts.push("contrast(0.85) brightness(1.1) saturate(0.7)"); break;
    case "highsat":  parts.push("saturate(1.8)"); break;
    case "lowsat":   parts.push("saturate(0.4)"); break;
    default: break;
  }
  return parts.join(" ");
}

function hasBackgroundFill(fx?: Fx): boolean {
  return !!fx && (fx.fillMode === "blur" || fx.fillMode === "mirror");
}

function blurCssPx(fx: Fx): number {
  if (fx.fillMode !== "blur" || fx.blurBg <= 0) return 0;
  // Suave: 1 -> ~0.3px, 50 -> ~15px, 100 -> ~40px (curva quadrática leve)
  const n = fx.blurBg / 100;
  return Math.max(0.3, +(n * n * 36 + n * 4).toFixed(2));
}

function mainObjectFit(fx?: Fx): React.CSSProperties["objectFit"] {
  return fx?.fillMode === "stretch" ? "fill" : "contain";
}

function backgroundFillStyle(fx: Fx): React.CSSProperties {
  const isBlur = fx.fillMode === "blur";
  const blurPx = blurCssPx(fx);
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transformOrigin: "center",
    transform: `${fx.fillMode === "mirror" ? "scaleX(-1) " : ""}scale(${isBlur ? 1.22 : 1.04})`,
    filter: isBlur ? `blur(${blurPx}px)` : undefined,
    willChange: isBlur ? "filter, transform" : "transform",
    zIndex: 0,
  };
}

function ffmpegColor(hex: string | undefined) {
  const safe = (hex ?? "#000000").replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(safe) ? `0x${safe}` : "black";
}

function blurSigma(fx: Fx | undefined) {
  const v = fx?.blurBg ?? 30;
  // Suave: 1 -> ~0.4, 50 -> ~13, 100 -> ~40
  const n = v / 100;
  return Math.max(0.3, Math.min(50, +(n * n * 36 + n * 4).toFixed(2)));
}

function exportVideoFilter(c: TLItem, targetW: number, targetH: number) {
  const fx = c.fx;
  if (!fx || fx.fillMode === "bars") {
    return { type: "vf" as const, value: `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1` };
  }
  if (fx.fillMode === "color") {
    return { type: "vf" as const, value: `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=${ffmpegColor(fx.bgColor)},fps=30,setsar=1` };
  }
  if (fx.fillMode === "stretch") {
    return { type: "vf" as const, value: `scale=${targetW}:${targetH},fps=30,setsar=1` };
  }
  const bgCore = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
  const bgFx = fx.fillMode === "blur"
    ? `${bgCore},gblur=sigma=${blurSigma(fx).toFixed(1)}:steps=2`
    : `${bgCore},hflip`;
  return {
    type: "filter_complex" as const,
    value: `[0:v]split=2[sharp][blur];[blur]${bgFx}[blurred];[sharp]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease[sharpfit];[blurred][sharpfit]overlay=(W-w)/2:(H-h)/2,fps=30,setsar=1[vout]`,
  };
}

// Vignette overlay style — radial gradient (smooth, no hard edges)
function vignetteStyle(fx?: Fx): React.CSSProperties | null {
  if (!fx) return null;
  const enabled = fx.vignette > 0 || fx.preset === "vignette";
  if (!enabled) return null;
  const intensity = fx.preset === "vignette" && fx.vignette === 0 ? 70 : fx.vignette;
  const size = fx.vignetteSize; // 0..100 = clear-center radius
  const inner = Math.max(0, Math.min(95, size * 0.6));      // start of darkening
  const outer = Math.max(inner + 5, 100);                    // fully dark at corners
  const alpha = (intensity / 100).toFixed(3);
  const color = fx.vignetteMode === "light" ? `255,255,255` : `0,0,0`;
  return {
    background: `radial-gradient(ellipse at center, rgba(${color},0) ${inner}%, rgba(${color},${alpha}) ${outer}%)`,
    mixBlendMode: fx.vignetteMode === "light" ? "screen" : "multiply",
  };
}

function computeVisualOpacity(i: TLItem, t: number): number {
  const local = t - i.start;
  const dur = i.outPoint - i.inPoint;
  let v = (i.fx?.opacity ?? 100) / 100;
  if (i.fadeIn && local < i.fadeIn) v *= Math.max(0, local / i.fadeIn);
  if (i.fadeOut && local > dur - i.fadeOut) v *= Math.max(0, (dur - local) / i.fadeOut);
  return Math.max(0, Math.min(1, v));
}

function computeZoomScale(fx: Fx | undefined, localT: number, dur: number): number {
  if (!fx?.zoom) return 1;
  const speedMul = fx.zoom.speed === "slow" ? 0.1 : fx.zoom.speed === "fast" ? 0.35 : 0.2;
  const p = dur > 0 ? Math.min(1, Math.max(0, localT / dur)) : 0;
  return fx.zoom.dir === "in" ? 1 + speedMul * p : 1 + speedMul * (1 - p);
}



function detectKind(file: File): ItemKind | null {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (t.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/.test(n)) return "video";
  if (t.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/.test(n)) return "audio";
  if (t.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif)$/.test(n)) return "image";
  return null;
}

async function probeMedia(file: File, kind: ItemKind): Promise<{ url: string; duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  if (kind === "image") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ url, duration: 5, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("imagem inválida"));
      img.src = url;
    });
  }
  return new Promise((resolve, reject) => {
    const el = kind === "audio" ? document.createElement("audio") : document.createElement("video");
    el.preload = "metadata";
    (el as HTMLMediaElement).muted = true;
    el.src = url;
    el.onloadedmetadata = () => {
      const w = (el as HTMLVideoElement).videoWidth ?? 0;
      const h = (el as HTMLVideoElement).videoHeight ?? 0;
      resolve({ url, duration: el.duration || 5, width: w, height: h });
    };
    el.onerror = () => reject(new Error("mídia inválida"));
  });
}

function CornerHandles({ id, tr, onStartScale }: { id: string; tr: Transform; onStartScale: (id: string, e: React.MouseEvent, tr: Transform) => void }) {
  const base: React.CSSProperties = { position: "absolute", width: 12, height: 12, background: "var(--primary)", border: "2px solid white", borderRadius: 2, pointerEvents: "auto", zIndex: 50 };
  const handle = (style: React.CSSProperties, cursor: string) => (
    <div
      data-handle="resize"
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStartScale(id, e, tr); }}
      onClick={(e) => e.stopPropagation()}
      style={{ ...base, ...style, cursor }}
    />
  );
  return (
    <>
      {/* 4 corners */}
      {handle({ left: -6, top: -6 }, "nwse-resize")}
      {handle({ right: -6, top: -6 }, "nesw-resize")}
      {handle({ left: -6, bottom: -6 }, "nesw-resize")}
      {handle({ right: -6, bottom: -6 }, "nwse-resize")}
      {/* 4 mid-edges */}
      {handle({ left: "50%", top: -6, transform: "translateX(-50%)" }, "ns-resize")}
      {handle({ left: "50%", bottom: -6, transform: "translateX(-50%)" }, "ns-resize")}
      {handle({ left: -6, top: "50%", transform: "translateY(-50%)" }, "ew-resize")}
      {handle({ right: -6, top: "50%", transform: "translateY(-50%)" }, "ew-resize")}
    </>
  );
}

function Editor() {
  // Carrega todas as Google Fonts uma única vez
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("gfonts-editor")) return;
    const families = GOOGLE_FONTS.map(f => `family=${encodeURIComponent(f.name)}:${f.weights}`).join("&");
    const link = document.createElement("link");
    link.id = "gfonts-editor";
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
    const pre1 = document.createElement("link"); pre1.rel = "preconnect"; pre1.href = "https://fonts.googleapis.com"; document.head.appendChild(pre1);
    const pre2 = document.createElement("link"); pre2.rel = "preconnect"; pre2.href = "https://fonts.gstatic.com"; pre2.crossOrigin = ""; document.head.appendChild(pre2);
  }, []);

  const [aspectKey, setAspectKey] = useState<AspectKey>("16:9");
  const [customAR, setCustomAR] = useState({ w: 16, h: 9 });
  const aspect = aspectKey === "custom" ? customAR : ASPECTS[aspectKey];

  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [items, setItemsRaw] = useState<TLItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(40);
  const [dragExtraSec, setDragExtraSec] = useState(0);
  const [snapResize, setSnapResize] = useState(true);
  const [tlViewportW, setTlViewportW] = useState(800);
  const [quality, setQuality] = useState<Quality>("1080");

  const [trackLocked, setTrackLocked] = useState<Record<string, boolean>>({});
  const [trackMuted, setTrackMuted] = useState<Record<string, boolean>>({});

  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [ffReady, setFfReady] = useState(false);
  const [ffLoading, setFfLoading] = useState(true);
  const [ffLoadError, setFfLoadError] = useState<string | null>(null);
  const [exportPct, setExportPct] = useState(0);
  const [exportMsg, setExportMsg] = useState("");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Export Settings ----
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPresetKey>("youtube_1080");
  const [exportFileName, setExportFileName] = useState("meu-video");
  const [exportFps, setExportFps] = useState<number>(30);
  const [exportCodec, setExportCodec] = useState<Codec>("h264");
  const [speedMode, setSpeedMode] = useState<"turbo" | "rapido" | "qualidade">("rapido");
  const [exportEngine, setExportEngine] = useState<"auto" | "webcodecs" | "wasm">("auto");
  const [webcodecsAvailable, setWebcodecsAvailable] = useState<boolean | null>(null);
  const [webcodecsProbeInfo, setWebcodecsProbeInfo] = useState<string>("");
  const useHardwareAccel = exportEngine !== "wasm";
  const [bitrateMode, setBitrateMode] = useState<BitrateMode>("medium");
  const [customBitrate, setCustomBitrate] = useState<number>(8000);
  const [audioBitrate, setAudioBitrate] = useState<AudioBitrate>(192);
  const [useGpu, setUseGpu] = useState(false);
  const [postAutoDownload, setPostAutoDownload] = useState(true);
  const [postPlay, setPostPlay] = useState(false);
  const [postBeep, setPostBeep] = useState(true);
  const [showExportLog, setShowExportLog] = useState(false);
  const [exportLog, setExportLog] = useState<string[]>([]);
  const [exportFfCmd, setExportFfCmd] = useState<string>("");
  const [exportElapsed, setExportElapsed] = useState(0);
  const [exportFpsLive, setExportFpsLive] = useState<number | null>(null);
  const [exportSpeed, setExportSpeed] = useState<number | null>(null);
  const exportStartRef = useRef<number>(0);
  const exportElapsedTimerRef = useRef<number | null>(null);
  const lastExportSettingsRef = useRef<null | (() => void)>(null);
  const gpuInfoRef = useRef<{ available: boolean; vendor: string } | null>(null);
  const [exportHistory, setExportHistory] = useState<Array<{ url: string; name: string; at: number; sizeMB: number }>>([]);
  const [diagRunning, setDiagRunning] = useState<null | "version" | "simple">(null);
  const [diagResult, setDiagResult] = useState<string>("");

  // Detecta suporte a WebCodecs para o seletor de motor
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const targetH = QUALITY_HEIGHT[quality];
        const targetW = Math.round((targetH * aspect.w) / aspect.h / 2) * 2;
        const bitrateGuess = bitrateMode === "custom" ? customBitrate : (targetH >= 2160 ? 35000 : targetH >= 1080 ? 8000 : 5000);
        const { isWebCodecsExportSupported } = await import("@/lib/webcodecs-export");
        const sup = await isWebCodecsExportSupported(targetW, targetH, exportFps, bitrateGuess);
        if (cancelled) return;
        setWebcodecsAvailable(sup.ok);
        setWebcodecsProbeInfo(sup.ok ? `${sup.hw === "prefer-hardware" ? "GPU" : "CPU"} · ${sup.codec}` : (sup.reason ?? ""));
        if (!sup.ok && exportEngine === "webcodecs") setExportEngine("auto");
      } catch (e) {
        if (cancelled) return;
        setWebcodecsAvailable(false);
        setWebcodecsProbeInfo(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [quality, aspect.w, aspect.h, exportFps, bitrateMode, customBitrate, exportEngine]);


  useEffect(() => {
    let mounted = true;
    setFfLoading(true);
    getFFmpeg()
      .then(() => {
        if (!mounted) return;
        setFfReady(true);
        setFfLoadError(null);
        console.log("FFmpeg pronto para exportação.");
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("FFmpeg não carregou.", err);
        if (mounted) {
          setFfReady(false);
          setFfLoadError(msg);
        }
      })
      .finally(() => {
        if (mounted) setFfLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; clipId: string | null } | null>(null);
  const [mediaCtx, setMediaCtx] = useState<{ x: number; y: number; mediaId: string } | null>(null);
  const clipboardRef = useRef<TLItem | null>(null);

  // Resizable side panels
  const [leftW, setLeftW] = useState(256);
  const [rightW, setRightW] = useState(304);
  const sideDragRef = useRef<{ side: "L" | "R"; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = sideDragRef.current; if (!d) return;
      const dx = e.clientX - d.startX;
      if (d.side === "L") setLeftW(Math.max(180, Math.min(520, d.startW + dx)));
      else setRightW(Math.max(220, Math.min(560, d.startW - dx)));
    };
    const onUp = () => { sideDragRef.current = null; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const videoBgElRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  // WebAudio: contexto + grafo por elemento (permite ganho > 0dB e FX)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaGraphRef = useRef<Record<string, { src: MediaElementAudioSourceNode; nodes: AudioFxNodes }>>({});
  const ensureAudioCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      try {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        audioCtxRef.current = new Ctx();
      } catch { return null; }
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);
  const attachGraph = useCallback((id: string, el: HTMLMediaElement, item: TLItem) => {
    const ctx = ensureAudioCtx();
    if (!ctx) return null;
    let entry = mediaGraphRef.current[id];
    if (!entry) {
      try {
        const src = ctx.createMediaElementSource(el);
        const nodes = buildAudioFxGraph(ctx, { initialFx: item.audioFx, initialGainDb: item.gainDb ?? 0 });
        src.connect(nodes.input);
        nodes.output.connect(ctx.destination);
        entry = { src, nodes };
        mediaGraphRef.current[id] = entry;
      } catch { return null; }
    }
    return entry;
  }, [ensureAudioCtx]);

  const previewBoxRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<TLItem[]>(items);
  const tracksRef = useRef<Track[]>(tracks);
  const lastTimelinePointer = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTick = useRef<number>(0);

  const undoStack = useRef<TLItem[][]>([]);
  const redoStack = useRef<TLItem[][]>([]);
  const skipHistory = useRef(false);

  const pushHistory = useCallback((snapshot: TLItem[]) => {
    undoStack.current.push(snapshot);
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const setItems = useCallback((updater: TLItem[] | ((prev: TLItem[]) => TLItem[]), record = true) => {
    setItemsRaw(prev => {
      const next = typeof updater === "function" ? (updater as (p: TLItem[]) => TLItem[])(prev) : updater;
      if (record && !skipHistory.current && next !== prev) pushHistory(prev);
      return next;
    });
  }, [pushHistory]);

  const undo = useCallback(() => {
    setItemsRaw(prev => { const last = undoStack.current.pop(); if (!last) return prev; redoStack.current.push(prev); return last; });
  }, []);
  const redo = useCallback(() => {
    setItemsRaw(prev => { const nxt = redoStack.current.pop(); if (!nxt) return prev; undoStack.current.push(prev); return nxt; });
  }, []);

  const selected = items.find(i => i.id === selectedId) ?? null;
  const totalDuration = useMemo(
    () => items.reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0),
    [items]
  );

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const usedMediaIds = useMemo(() => new Set(items.map(i => i.mediaId).filter(Boolean) as string[]), [items]);

  // ---- Track helpers ----
  const ensureTrack = useCallback((kind: TrackKind, after?: string): string => {
    // Find next available id like V<n>/A<n>
    let id = "";
    setTracks(prev => {
      const sameKind = prev.filter(t => t.kind === kind);
      const nums = sameKind.map(t => parseInt(t.id.slice(1), 10)).filter(n => !isNaN(n));
      const n = (nums.length ? Math.max(...nums) : 0) + 1;
      const prefix = kind === "video" ? "V" : "A";
      id = `${prefix}${n}`;
      const newTrack: Track = { id, kind, label: `${id} · ${kind === "video" ? "Vídeo" : "Áudio"}` };
      // Insert at end of its kind group (video first, then audio)
      const out: Track[] = [];
      let inserted = false;
      for (let i = 0; i < prev.length; i++) {
        out.push(prev[i]);
        const next = prev[i + 1];
        if (!inserted && prev[i].kind === kind && (!next || next.kind !== kind)) {
          out.push(newTrack);
          inserted = true;
        }
      }
      if (!inserted) out.push(newTrack);
      return out;
    });
    return id;
  }, []);

  const insertTrackAt = useCallback((kind: TrackKind, insertIndex: number) => {
    setTracks(prev => {
      const sameKind = prev.filter(t => t.kind === kind);
      const nums = sameKind.map(t => parseInt(t.id.slice(1), 10)).filter(n => !isNaN(n));
      const n = (nums.length ? Math.max(...nums) : 0) + 1;
      const prefix = kind === "video" ? "V" : "A";
      const id = `${prefix}${n}`;
      const newTrack: Track = { id, kind, label: `${id} · ${kind === "video" ? "Vídeo" : "Áudio"}` };
      const out = [...prev];
      out.splice(Math.max(0, Math.min(out.length, insertIndex)), 0, newTrack);
      return out;
    });
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setTracks(prev => {
      const sameKind = prev.filter(t => t.kind === prev.find(x => x.id === trackId)?.kind);
      if (sameKind.length <= 1) return prev; // mantenha ao menos 1 trilha por tipo
      return prev.filter(t => t.id !== trackId);
    });
    setItems(prev => prev.filter(i => i.trackId !== trackId));
  }, [setItems]);

  // ---- Snap ----
  const [snapMark, setSnapMark] = useState<number | null>(null);
  const snapMarkTimer = useRef<number | null>(null);
  const flashSnap = useCallback((t: number) => {
    setSnapMark(t);
    if (snapMarkTimer.current) window.clearTimeout(snapMarkTimer.current);
    snapMarkTimer.current = window.setTimeout(() => setSnapMark(null), 450);
  }, []);
  const snapTime = useCallback((t: number, excludeId?: string) => {
    const thr = TIME_SNAP_PX / zoom;
    let best = t, bestD = thr;
    let hitEdge: number | null = null;
    const step = zoom < 20 ? 10 : zoom < 40 ? 5 : zoom < 80 ? 2 : 1;
    const nearest = Math.round(t / step) * step;
    if (Math.abs(nearest - t) < bestD) { best = nearest; bestD = Math.abs(nearest - t); }
    for (const it of items) {
      if (it.id === excludeId) continue;
      for (const cand of [it.start, it.start + (it.outPoint - it.inPoint)]) {
        const d = Math.abs(cand - t);
        if (d < bestD) { best = cand; bestD = d; hitEdge = cand; }
      }
    }
    const v = Math.max(0, best);
    if (hitEdge !== null) flashSnap(hitEdge);
    return v;
  }, [items, zoom, flashSnap]);
  const snapTimeRef = useRef(snapTime);
  useEffect(() => { snapTimeRef.current = snapTime; }, [snapTime]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  // Limite máximo do projeto para evitar durações inconsistentes
  const MAX_PROJECT_SEC = 3600; // 1 hora
  const snapResizeTime = useCallback((t: number, excludeId?: string) => {
    const thr = TIME_SNAP_PX / zoomRef.current;
    let best = t, bestD = thr;
    for (const cand of [0, MAX_PROJECT_SEC]) {
      const d = Math.abs(cand - t);
      if (d < bestD) { best = cand; bestD = d; }
    }
    for (const it of itemsRef.current) {
      if (it.id === excludeId) continue;
      for (const cand of [it.start, it.start + (it.outPoint - it.inPoint)]) {
        const d = Math.abs(cand - t);
        if (d < bestD) { best = cand; bestD = d; }
      }
    }
    if (best !== t) flashSnap(best);
    return Math.max(0, best);
  }, [flashSnap]);
  const snapResizeTimeRef = useRef(snapResizeTime);
  useEffect(() => { snapResizeTimeRef.current = snapResizeTime; }, [snapResizeTime]);
  const snapResizeRef = useRef(snapResize);
  useEffect(() => { snapResizeRef.current = snapResize; }, [snapResize]);

  // ---- Add files → media library only ----
  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const newAssets: MediaAsset[] = [];
    for (const file of Array.from(files)) {
      const kind = detectKind(file);
      if (!kind) { setError(`Tipo não suportado: ${file.name}`); continue; }
      try {
        const meta = await probeMedia(file, kind);
        newAssets.push({
          id: crypto.randomUUID(),
          kind, name: file.name, file, url: meta.url,
          duration: meta.duration, width: meta.width, height: meta.height,
        });
      } catch {
        setError(`Falha ao ler ${file.name}`);
      }
    }
    if (newAssets.length) setMedia(prev => [...prev, ...newAssets]);
  }, []);

  // Create a TL item from a media asset
  const createTLFromMedia = useCallback((asset: MediaAsset, trackId: string, start: number): TLItem => {
    const isImg = asset.kind === "image";
    return {
      id: crypto.randomUUID(),
      mediaId: asset.id,
      kind: asset.kind, trackId, name: asset.name, file: asset.file, url: asset.url,
      start,
      inPoint: 0,
      outPoint: isImg ? 5 : asset.duration,
      sourceDuration: isImg ? IMAGE_MAX_DUR : asset.duration,
      width: asset.width, height: asset.height,
      transform: asset.kind === "image" || asset.kind === "video" ? { xPct: 50, yPct: 50, scale: 1, rotation: 0 } : undefined,
      fadeIn: 0, fadeOut: 0,
      gainDb: asset.kind === "audio" || asset.kind === "video" ? 0 : undefined,
      audioFx: asset.kind === "audio" || asset.kind === "video" ? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] } : undefined,
      fx: asset.kind === "image" || asset.kind === "video" ? { ...DEFAULT_FX } : undefined,
    };
  }, []);

  const addAssetToTimeline = useCallback((asset: MediaAsset, opts?: { trackId?: string; start?: number }) => {
    const wantKind: TrackKind = asset.kind === "audio" ? "audio" : "video";
    const targetTrack = opts?.trackId && tracks.find(t => t.id === opts.trackId)?.kind === wantKind
      ? opts.trackId
      : (tracks.find(t => t.kind === wantKind)?.id ?? ensureTrack(wantKind));
    const defaultStart = items.filter(i => i.trackId === targetTrack)
      .reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0);
    const start = opts?.start != null ? Math.max(0, opts.start) : defaultStart;
    const it = createTLFromMedia(asset, targetTrack, start);
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
  }, [items, tracks, ensureTrack, createTLFromMedia, setItems]);

  const addText = useCallback(() => {
    const videoTracks = tracks.filter(t => t.kind === "video");
    // trilha de vídeo mais acima (topo da timeline)
    const trackId = videoTracks[0]?.id ?? ensureTrack("video");
    const start = playhead;
    const it: TLItem = {
      id: crypto.randomUUID(), kind: "text", trackId, name: "Texto",
      start, inPoint: 0, outPoint: 5, sourceDuration: 9999,
      text: defaultText(),
      transform: { xPct: 50, yPct: 80, scale: 1, rotation: 0 },
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
  }, [tracks, ensureTrack, setItems, playhead]);

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const removeMedia = (mediaId: string) => {
    setMedia(prev => {
      const target = prev.find(m => m.id === mediaId);
      if (target?.url) { try { URL.revokeObjectURL(target.url); } catch {} }
      return prev.filter(m => m.id !== mediaId);
    });
    setItems(prev => prev.filter(i => i.mediaId !== mediaId));
  };

  const splitAt = useCallback((t: number, onlyClipId?: string) => {
    setItems(prev => {
      const out: TLItem[] = [];
      let newSel: string | null = selectedId;
      for (const it of prev) {
        const dur = it.outPoint - it.inPoint;
        const end = it.start + dur;
        const eligible = !onlyClipId || it.id === onlyClipId;
        if (eligible && t > it.start + 0.05 && t < end - 0.05) {
          const off = t - it.start;
          const left: TLItem = { ...it, id: crypto.randomUUID(), outPoint: it.inPoint + off, fadeOut: 0 };
          const right: TLItem = { ...it, id: crypto.randomUUID(), start: t, inPoint: it.inPoint + off, fadeIn: 0 };
          out.push(left, right);
          if (selectedId === it.id) newSel = left.id;
        } else out.push(it);
      }
      setSelectedId(newSel);
      return out;
    });
  }, [selectedId, setItems]);

  const copyClip = (id: string) => {
    const it = items.find(i => i.id === id); if (!it) return;
    clipboardRef.current = it;
  };
  const pasteClip = () => {
    const src = clipboardRef.current; if (!src) return;
    const trackId = tracks.find(t => t.id === src.trackId) ? src.trackId : (tracks.find(t => t.kind === (src.kind === "audio" ? "audio" : "video"))?.id ?? "");
    if (!trackId) return;
    const dur = src.outPoint - src.inPoint;
    const it: TLItem = { ...src, id: crypto.randomUUID(), start: playhead, fadeIn: 0, fadeOut: 0 };
    // avoid overlap by shifting if needed
    const overlapping = items.some(i => i.trackId === trackId && !(playhead + dur <= i.start || playhead >= i.start + (i.outPoint - i.inPoint)));
    if (overlapping) {
      const endMax = items.filter(i => i.trackId === trackId).reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0);
      it.start = endMax;
    }
    it.trackId = trackId;
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
  };

  // ---- Shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((ctrl && k === "y") || (ctrl && e.shiftKey && k === "z")) { e.preventDefault(); redo(); }
      else if (ctrl && k === "b") { e.preventDefault(); splitAt(playhead); }
      else if (ctrl && k === "c" && selectedId) { e.preventDefault(); copyClip(selectedId); }
      else if (ctrl && k === "v") { e.preventDefault(); pasteClip(); }
      else if (k === "s" && !ctrl) { e.preventDefault(); splitAt(playhead); }
      else if ((k === "delete" || k === "backspace") && selectedId) { e.preventDefault(); deleteItem(selectedId); }
      else if (k === "escape") { setSelectedId(null); setCtxMenu(null); }
      else if (e.code === "Space") {
        e.preventDefault();
        setPlaying(p => {
          if (!p && playhead >= totalDuration - 0.05) setPlayhead(0);
          return !p;
        });
      }
      else if (k === "arrowleft") { e.preventDefault(); setPlayhead(p => Math.max(0, p - (e.shiftKey ? 1 : 0.1))); }
      else if (k === "arrowright") { e.preventDefault(); setPlayhead(p => Math.min(totalDuration, p + (e.shiftKey ? 1 : 0.1))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [splitAt, playhead, undo, redo, selectedId, totalDuration]);

  // close context menu on click outside
  useEffect(() => {
    const onClick = () => { setCtxMenu(null); setMediaCtx(null); };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  // ---- Playback clock ----
  useEffect(() => {
    if (!playing) { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; return; }
    lastTick.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      setPlayhead(p => {
        const np = p + dt;
        if (np >= totalDuration) { setPlaying(false); return totalDuration; }
        return np;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalDuration]);

  // Active V1 (first video track) video for preview <video>
  const firstVideoTrackId = tracks.find(t => t.kind === "video")?.id;
  const activeV1Video = useMemo(() => {
    if (!firstVideoTrackId) return null;
    return items.find(i =>
      i.trackId === firstVideoTrackId && i.kind === "video" &&
      playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint)
    ) ?? null;
  }, [items, playhead, firstVideoTrackId]);

  const computeVol = (i: TLItem, t: number) => {
    const local = t - i.start;
    const dur = i.outPoint - i.inPoint;
    let v = 1;
    if (i.fadeIn && local < i.fadeIn) v *= Math.max(0, local / i.fadeIn);
    if (i.fadeOut && local > dur - i.fadeOut) v *= Math.max(0, (dur - local) / i.fadeOut);
    // SEM clamp em 1 — o ganho até +30dB precisa estourar quando o usuário pedir.
    // Multiplicador de fade (0..1) é aplicado depois pelo grafo WebAudio junto ao gainDb.
    return Math.max(0, v);
  };
  const fxGainFor = (i: TLItem, t: number) => computeVol(i, t) * Math.pow(10, (i.gainDb ?? 0) / 20);


  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (!activeV1Video) { v.pause(); v.removeAttribute("src"); v.load(); return; }
    const wanted = activeV1Video.url;
    if (!wanted) { v.pause(); v.removeAttribute("src"); v.load(); return; }
    if (v.src !== wanted) v.src = wanted;
    const target = activeV1Video.inPoint + (playhead - activeV1Video.start);
    if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
    v.muted = !!trackMuted[activeV1Video.trackId];
    // Encaminha pelo grafo WebAudio para permitir ganho >0dB e FX.
    const g = attachGraph(activeV1Video.id, v, activeV1Video);
    if (g) {
      v.volume = 1;
      g.nodes.setMuted(!!trackMuted[activeV1Video.trackId]);
      g.nodes.setGain(activeV1Video.gainDb ?? 0);
      if (activeV1Video.audioFx) g.nodes.setFx(activeV1Video.audioFx);
      // multiplica fade do envelope no gain final via post-gain (recomputado a cada frame)
      const fade = computeVol(activeV1Video, playhead);
      g.nodes.setGain(((activeV1Video.gainDb ?? 0) + (fade < 0.999 ? 20 * Math.log10(Math.max(0.0001, fade)) : 0)));
    } else {
      // fallback se WebAudio falhou
      v.volume = Math.min(1, computeVol(activeV1Video, playhead));
    }
    if (playing) v.play().catch(() => {}); else v.pause();
  }, [activeV1Video, playing, playhead, trackMuted, attachGraph]);


  useEffect(() => {
    const bg = videoBgElRef.current;
    if (!bg) return;
    const needsBg = hasBackgroundFill(activeV1Video?.fx);
    if (!activeV1Video || !needsBg) { bg.pause(); bg.removeAttribute("src"); bg.load(); return; }
    const wanted = activeV1Video.url;
    if (!wanted) { bg.pause(); bg.removeAttribute("src"); bg.load(); return; }
    if (bg.src !== wanted) bg.src = wanted;
    const target = activeV1Video.inPoint + (playhead - activeV1Video.start);
    if (Math.abs(bg.currentTime - target) > 0.25) bg.currentTime = target;
    bg.muted = true;
    if (playing) bg.play().catch(() => {}); else bg.pause();
  }, [activeV1Video, playing, playhead]);

  useEffect(() => {
    const audios = items.filter(i => i.kind === "audio" && i.url);
    for (const a of audios) {
      if (!a.url) continue;
      if (!audioRefs.current[a.id]) audioRefs.current[a.id] = new Audio(a.url);
    }
    for (const id of Object.keys(audioRefs.current)) {
      if (!audios.find(a => a.id === id)) { audioRefs.current[id].pause(); delete audioRefs.current[id]; }
    }
    for (const a of audios) {
      const el = audioRefs.current[a.id];
      if (!el) continue;
      const inRange = playhead >= a.start && playhead < a.start + (a.outPoint - a.inPoint);
      const g = attachGraph(a.id, el, a);
      if (g) {
        el.volume = 1;
        g.nodes.setMuted(!!trackMuted[a.trackId]);
        if (a.audioFx) g.nodes.setFx(a.audioFx);
        const fade = computeVol(a, playhead);
        g.nodes.setGain(((a.gainDb ?? 0) + (fade < 0.999 ? 20 * Math.log10(Math.max(0.0001, fade)) : 0)));
      } else {
        el.muted = !!trackMuted[a.trackId];
        el.volume = Math.min(1, computeVol(a, playhead));
      }
      if (inRange) {
        const target = a.inPoint + (playhead - a.start);
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      } else if (!el.paused) el.pause();
    }
  }, [items, playing, playhead, trackMuted, attachGraph]);


  const overlays = items.filter(i =>
    (i.kind === "image" || i.kind === "text") &&
    playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint) &&
    !trackMuted[i.trackId]
  );

  // ---- Timeline drags ----
  type Drag =
    | { type: "move"; id: string; offsetSec: number; origTrackId: string }
    | { type: "resizeL"; id: string; origStart: number; origIn: number; origEnd: number; isImage: boolean; pointerOffsetPx: number }
    | { type: "resizeR"; id: string; origOut: number; pointerOffsetPx: number }
    | { type: "fadeIn"; id: string }
    | { type: "fadeOut"; id: string }
    | { type: "gain"; id: string; baseDb: number; baseY: number }
    | { type: "playhead" }
    | null;
  const dragRef = useRef<Drag>(null);
  const labelColW = 140;
  const trackHeight = 60;
  const rulerH = 28;
  const getTimelineTimeFromClientX = useCallback((clientX: number, pointerOffsetPx = 0) => {
    const tl = timelineRef.current;
    const rect = tl?.getBoundingClientRect();
    if (!tl || !rect) return null;
    const xPx = clientX - rect.left + tl.scrollLeft - labelColW - pointerOffsetPx;
    return Math.max(0, xPx / zoom);
  }, [zoom]);

  const extendTimelineForDrag = useCallback((clientX: number) => {
    const tl = timelineRef.current;
    const rect = tl?.getBoundingClientRect();
    if (!tl || !rect) return;
    const edge = 64;
    const overRight = clientX - (rect.right - edge);
    const overLeft = (rect.left + edge) - clientX;
    if (overRight > 0) {
      const next = tl.scrollLeft + Math.min(56, 8 + overRight * 0.75);
      if (next + tl.clientWidth >= tl.scrollWidth - 24) setDragExtraSec(s => Math.min(24 * 3600, s + 10));
      tl.scrollLeft = next;
    } else if (overLeft > 0) {
      tl.scrollLeft = Math.max(0, tl.scrollLeft - Math.min(56, 8 + overLeft * 0.75));
    }
  }, []);

  const onTimelineMouseDown = (e: React.MouseEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    if ((e.target as HTMLElement).dataset.role === "ruler") {
      dragRef.current = { type: "playhead" };
      const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0) - labelColW;
      setPlayhead(snapTime(Math.max(0, x / zoom)));
    }
  };

  useEffect(() => {
    const applyTimelineDrag = (clientX: number, clientY: number) => {
      const d = dragRef.current; if (!d) return;
      if (d.type === "move" || d.type === "resizeL" || d.type === "resizeR") extendTimelineForDrag(clientX);
      const pointerOffsetPx = d.type === "resizeL" || d.type === "resizeR" ? d.pointerOffsetPx : 0;
      const tSec = getTimelineTimeFromClientX(clientX, pointerOffsetPx);
      if (tSec == null) return;
      skipHistory.current = true;
      if (d.type === "playhead") setPlayhead(snapTimeRef.current(tSec));
      else if (d.type === "move") {
        const newStart = snapTimeRef.current(Math.max(0, tSec - d.offsetSec), d.id);
        const tracksRect = tracksAreaRef.current?.getBoundingClientRect();
        let newTrackId = d.origTrackId;
        if (tracksRect) {
          const currentItems = itemsRef.current;
          const currentTracks = tracksRef.current;
          const yPx = clientY - tracksRect.top;
          const idx = Math.floor(yPx / trackHeight);
          const draggedItem = currentItems.find(i => i.id === d.id);
          const wantKind: TrackKind = draggedItem?.kind === "audio" ? "audio" : "video";
          const sameKindIdxs = currentTracks.map((t, i) => ({ t, i })).filter(x => x.t.kind === wantKind);
          if (sameKindIdxs.length) {
            const minI = sameKindIdxs[0].i;
            const maxI = sameKindIdxs[sameKindIdxs.length - 1].i;
            if (idx >= 0 && idx < currentTracks.length && currentTracks[idx].kind === wantKind) newTrackId = currentTracks[idx].id;
            else if (idx > maxI) newTrackId = ensureTrack(wantKind);
            else if (idx < minI) newTrackId = currentTracks[minI].id;
          }
        }
        setItems(prev => prev.map(i => i.id === d.id ? { ...i, start: newStart, trackId: newTrackId } : i), false);
      } else if (d.type === "resizeL") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          let raw = Math.max(0, tSec);
          if (snapResizeRef.current) raw = Math.max(0, snapResizeTimeRef.current(raw, d.id));
          if (d.isImage) {
            const newStart = Math.max(0, Math.min(d.origEnd - 0.1, raw));
            return { ...i, start: newStart, inPoint: 0, outPoint: d.origEnd - newStart };
          }
          const delta = raw - d.origStart;
          const newIn = Math.max(0, Math.min(i.outPoint - 0.1, d.origIn + delta));
          const newStart = Math.max(0, d.origStart + (newIn - d.origIn));
          return { ...i, start: newStart, inPoint: newIn };
        }), false);
      } else if (d.type === "resizeR") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          let raw = Math.max(i.start + 0.1, tSec);
          if (snapResizeRef.current) raw = Math.max(i.start + 0.1, snapResizeTimeRef.current(raw, d.id));
          raw = Math.min(MAX_PROJECT_SEC, raw);
          const sourceCap = i.kind === "image" ? MAX_PROJECT_SEC : i.sourceDuration;
          const maxOut = Math.min(sourceCap, i.inPoint + Math.max(0.1, MAX_PROJECT_SEC - i.start));
          const newOut = Math.max(i.inPoint + 0.1, Math.min(maxOut, raw - i.start + i.inPoint));
          return { ...i, outPoint: newOut };
        }), false);
      } else if (d.type === "fadeIn") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          return { ...i, fadeIn: Math.max(0, Math.min(dur, tSec - i.start)) };
        }), false);
      } else if (d.type === "fadeOut") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          const end = i.start + dur;
          return { ...i, fadeOut: Math.max(0, Math.min(dur, end - tSec)) };
        }), false);
      } else if (d.type === "gain") {
        const dyPx = clientY - d.baseY;
        const db = Math.max(-30, Math.min(30, d.baseDb - dyPx * 0.25));
        setItems(prev => prev.map(i => i.id === d.id ? { ...i, gainDb: db } : i), false);
      }
    };
    const onMove = (e: MouseEvent) => {
      lastTimelinePointer.current = { x: e.clientX, y: e.clientY };
      applyTimelineDrag(e.clientX, e.clientY);
    };
    const tick = window.setInterval(() => {
      const d = dragRef.current;
      const p = lastTimelinePointer.current;
      if (!d || !p || (d.type !== "move" && d.type !== "resizeL" && d.type !== "resizeR")) return;
      applyTimelineDrag(p.x, p.y);
    }, 16);
    const onUp = () => {
      if (dragRef.current) {
        skipHistory.current = false;
        setItemsRaw(prev => { pushHistory(prev); return prev; });
      }
      dragRef.current = null;
      lastTimelinePointer.current = null;
      setDragExtraSec(0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.clearInterval(tick);
    };
  }, [extendTimelineForDrag, getTimelineTimeFromClientX, setItems, pushHistory, ensureTrack]);

  // ---- Preview transform drag with center-snap ----
  const transformDrag = useRef<{ id: string; startX: number; startY: number; baseX: number; baseY: number; rect: DOMRect } | null>(null);
  const scaleDrag = useRef<{ id: string; cx: number; cy: number; baseDist: number; baseScale: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = transformDrag.current;
      if (d) {
        const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
        const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
        let x = Math.max(0, Math.min(100, d.baseX + dx));
        let y = Math.max(0, Math.min(100, d.baseY + dy));
        const sV = Math.abs(x - 50) < CENTER_SNAP;
        const sH = Math.abs(y - 50) < CENTER_SNAP;
        if (sV) x = 50;
        if (sH) y = 50;
        setSnapV(sV); setSnapH(sH);
        setItemsRaw(prev => prev.map(i => i.id === d.id && i.transform
          ? { ...i, transform: { ...i.transform, xPct: x, yPct: y } } : i));
      }
      const s = scaleDrag.current;
      if (s) {
        const dist = Math.hypot(e.clientX - s.cx, e.clientY - s.cy);
        const ratio = dist / Math.max(1, s.baseDist);
        const newScale = Math.max(0.05, Math.min(50, s.baseScale * ratio));
        setItemsRaw(prev => prev.map(i => i.id === s.id && i.transform
          ? { ...i, transform: { ...i.transform, scale: newScale } } : i));
      }
    };
    const onUp = () => {
      if (transformDrag.current || scaleDrag.current) {
        skipHistory.current = false;
        setItemsRaw(prev => { pushHistory(prev); return prev; });
      }
      transformDrag.current = null;
      scaleDrag.current = null;
      setSnapV(false); setSnapH(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [pushHistory]);

  const onPreviewWheel = (e: React.WheelEvent) => {
    const target = (selected && selected.transform) ? selected : activeV1Video;
    if (!target || !target.transform) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setItems(prev => prev.map(i => i.id === target.id && i.transform
      ? { ...i, transform: { ...i.transform, scale: Math.max(0.05, Math.min(50, i.transform.scale + delta)) } } : i));
  };

  // selected preview target (image/text/active V1 video)
  const previewTarget: TLItem | null = useMemo(() => {
    if (selected && selected.transform && (selected.kind === "image" || selected.kind === "text" || (selected === activeV1Video))) return selected;
    return null;
  }, [selected, activeV1Video]);

  // Compute base bounds (% of preview) for an overlay/video so handles sit on its real corners.
  const previewAR = aspect.w / aspect.h;
  const getItemBounds = useCallback((it: TLItem): { w: number; h: number } => {
    const mw = it.width || 16, mh = it.height || 9;
    const ar = mw / mh;
    if (it.kind === "video") {
      // object-contain inside preview
      if (ar >= previewAR) return { w: 100, h: (previewAR / ar) * 100 };
      return { h: 100, w: (ar / previewAR) * 100 };
    }
    if (it.kind === "image") {
      // base ~60% of preview height, keep AR, clamp to 90%
      let h = 60, w = (h / 100) * ar / previewAR * 100;
      if (w > 90) { w = 90; h = (w / 100) * previewAR / ar * 100; }
      return { w, h };
    }
    // text: rough box around it; not really used for handles
    return { w: 40, h: 14 };
  }, [previewAR]);

  const startMove = (id: string, e: React.MouseEvent, tr: Transform) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && tgt.closest?.('[data-handle="resize"]')) return;
    e.stopPropagation();
    setSelectedId(id);
    const previewBox = previewBoxRef.current;
    if (!previewBox) {
      console.error("Preview ainda não está pronto para mover o item.");
      return;
    }
    const rect = previewBox.getBoundingClientRect();
    skipHistory.current = true;
    transformDrag.current = { id, startX: e.clientX, startY: e.clientY, baseX: tr.xPct, baseY: tr.yPct, rect };
  };
  const startScale = (id: string, e: React.MouseEvent, tr: Transform) => {
    e.stopPropagation();
    setSelectedId(id);
    const previewBox = previewBoxRef.current;
    if (!previewBox) {
      console.error("Preview ainda não está pronto para redimensionar o item.");
      return;
    }
    const rect = previewBox.getBoundingClientRect();
    const cx = rect.left + (tr.xPct / 100) * rect.width;
    const cy = rect.top + (tr.yPct / 100) * rect.height;
    const baseDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    skipHistory.current = true;
    scaleDrag.current = { id, cx, cy, baseDist, baseScale: tr.scale };
  };

  // Ruler ticks
  const rulerSpan = Math.max(totalDuration + dragExtraSec + 5, 10);
  const minZoom = Math.max(2, Math.floor((tlViewportW - labelColW - 4) / rulerSpan));
  const tickStep = zoom < 20 ? 10 : zoom < 40 ? 5 : zoom < 80 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= rulerSpan; t += tickStep) ticks.push(t);

  useEffect(() => {
    const el = timelineRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setTlViewportW(el.clientWidth));
    ro.observe(el); setTlViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (zoom < minZoom) setZoom(minZoom); }, [minZoom, zoom]);

  // Ctrl/⌘ + scroll sobre a timeline = zoom (bloqueia zoom do navegador)
  useEffect(() => {
    const el = timelineRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const step = -e.deltaY * 0.08;
      setZoom(z => Math.max(minZoom, Math.min(200, Math.round(z + step))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minZoom]);

  // ---- Export ----
  const computedVBitrate = bitrateFromMode(quality, bitrateMode, customBitrate);
  const estimatedMB = useMemo(
    () => estimateSizeMB(Math.max(1, totalDuration), computedVBitrate, audioBitrate),
    [totalDuration, computedVBitrate, audioBitrate],
  );

  // ---- DIAGNÓSTICO ----
  const runFfmpegVersionTest = async () => {
    setDiagRunning("version"); setDiagResult("");
    const lines: string[] = [`[diag] Carregando FFmpeg WASM...`];
    try {
      const ff = await getFFmpeg();
      const onL = ({ message }: { message: string }) => { lines.push(message); };
      ff.on("log", onL);
      try {
        // Force engine to print banner/version by invoking with no args (exits 1, mas imprime versão)
        await ff.exec(["-version"]).catch(() => {});
      } finally {
        ff.off("log", onL);
      }
      lines.push(`[diag] OK — engine carregado.`);
      console.log("%c[FFMPEG VERSION TEST]", "color:#22d3ee", lines.join("\n"));
      setDiagResult(lines.join("\n"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const out = `FFmpeg não encontrado / falha ao carregar.\n${msg}\n${lines.join("\n")}`;
      console.error("[FFMPEG VERSION TEST]", out);
      setDiagResult(out);
    } finally {
      setDiagRunning(null);
    }
  };

  const runSimpleExportTest = async () => {
    setDiagRunning("simple"); setDiagResult("");
    const v1trackId = tracks.find(t => t.kind === "video")?.id;
    const firstClip = items
      .filter(i => i.trackId === v1trackId && (i.kind === "video" || i.kind === "image"))
      .sort((a, b) => a.start - b.start)[0];
    if (!firstClip || !firstClip.file) {
      setDiagResult("Nenhum vídeo/imagem na timeline para testar.");
      setDiagRunning(null); return;
    }
    const lines: string[] = [
      `[teste] Clipe: ${firstClip.file.name} (${firstClip.kind})`,
      `[teste] Saída: teste.mp4 · 640x360 @ 30fps · libx264`,
    ];
    try {
      const ff = await getFFmpeg();
      const onL = ({ message }: { message: string }) => { lines.push(message); };
      ff.on("log", onL);
      const isImg = firstClip.kind === "image";
      const ext = isImg ? (firstClip.file.name.split(".").pop() || "png").toLowerCase() : "bin";
      await ff.writeFile(`tin.${ext}`, await fetchFile(firstClip.file));
      const dur = Math.max(1, Math.min(3, firstClip.outPoint - firstClip.inPoint)).toFixed(2);
      const args = isImg
        ? ["-loop", "1", "-framerate", "30", "-t", dur, "-i", `tin.${ext}`,
           "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-t", dur, "teste.mp4"]
        : ["-t", dur, "-i", `tin.${ext}`,
           "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-an", "teste.mp4"];
      lines.push(`$ ffmpeg ${args.join(" ")}`);
      await ff.exec(args);
      const data = (await ff.readFile("teste.mp4")) as Uint8Array;
      lines.push(`[teste] OK — arquivo gerado: ${(data.byteLength / 1024).toFixed(1)} KB`);
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buf], { type: "video/mp4" }));
      const a = document.createElement("a"); a.href = url; a.download = "teste.mp4";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      ff.off("log", onL);
      await ff.deleteFile(`tin.${ext}`).catch(() => {});
      await ff.deleteFile("teste.mp4").catch(() => {});
      console.log("%c[SIMPLE EXPORT TEST]", "color:#22d3ee", lines.join("\n"));
      setDiagResult(lines.join("\n"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const out = `FALHA no teste de exportação.\n${msg}\n\n${lines.join("\n")}`;
      console.error("[SIMPLE EXPORT TEST]", out);
      setDiagResult(out);
    } finally {
      setDiagRunning(null);
    }
  };

  const downloadExportLog = () => {
    const content = [
      `# export.log — ${new Date().toISOString()}`,
      exportFfCmd ? `\n$ ${exportFfCmd}\n` : "",
      ...exportLog,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "export.log";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const doExport = async () => {
    try {
      console.log("Iniciando exportação...");
      if (!items || items.length === 0) {
        console.error("Nenhum clipe carregado.");
        setError("Nenhum clipe carregado.");
        return;
      }
      if (!tracks || tracks.length === 0) {
        console.error("Nenhuma trilha disponível.");
        setError("Nenhuma trilha disponível.");
        return;
      }
    } catch (err) {
      console.error("Erro durante exportação:", err);
      setError(err instanceof Error ? err.message : "Erro durante exportação");
      return;
    }

    const v1trackId = tracks.find(t => t.kind === "video")?.id;
    const v1clips = items
      .filter(i => i.trackId === v1trackId && (i.kind === "video" || i.kind === "image"))
      .sort((a, b) => a.start - b.start);
    const audioClips = items.filter(i => i.kind === "audio");
    if (!v1clips.length && !audioClips.length) {
      setError("Adicione pelo menos um vídeo, imagem ou áudio na timeline.");
      return;
    }
    const missingFiles = [...v1clips, ...audioClips].filter(c => !c.file);
    if (missingFiles.length) {
      const names = missingFiles.map(c => c.name).join(", ");
      console.error("Clipes sem arquivo original:", names);
      setError(`Alguns clipes estão sem arquivo original: ${names}`);
      return;
    }
    // Save retry handle (same settings)
    lastExportSettingsRef.current = () => { void doExport(); };

    // Codec mapping — only libx264 ships in @ffmpeg/core WASM; fallback w/ note.
    const codecRequested = exportCodec;
    if (exportCodec === "h265" || exportCodec === "vp9") {
      // we silently fallback but record in log
    }
    const fps = Math.max(1, Math.min(60, exportFps || 30));
    const vKbps = computedVBitrate;
    const aKbps = audioBitrate;
    // Modo de velocidade — usa CRF + parâmetros x264 para acelerar drasticamente o WASM (single-thread).
    let vEncArgs: string[];
    if (speedMode === "qualidade") {
      vEncArgs = [
        "-c:v", "libx264", "-preset", "superfast", "-tune", "fastdecode",
        "-pix_fmt", "yuv420p", "-r", String(fps), "-threads", "0",
        "-b:v", `${vKbps}k`, "-maxrate", `${Math.round(vKbps * 1.5)}k`, "-bufsize", `${vKbps * 2}k`,
      ];
    } else {
      const crf = speedMode === "turbo" ? "30" : "26";
      const x264Params = speedMode === "turbo"
        ? "rc-lookahead=0:ref=1:bframes=0:weightp=0:cabac=0:8x8dct=0:trellis=0:me=dia:subme=0:aq-mode=0:mixed-refs=0:fast-pskip=1:no-mbtree=1:no-scenecut=1"
        : "rc-lookahead=0:ref=1:bframes=0:weightp=1:trellis=0:me=hex:subme=1:aq-mode=0:fast-pskip=1:no-mbtree=1";
      vEncArgs = [
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-pix_fmt", "yuv420p", "-r", String(fps), "-threads", "0",
        "-crf", crf, "-x264-params", x264Params,
        "-maxrate", `${vKbps * 2}k`, "-bufsize", `${vKbps * 3}k`,
      ];
    }
    const aEncArgs = ["-c:a", "aac", "-b:a", `${aKbps}k`, "-ar", "44100", "-ac", "2"];

    setExporting(true); setExportPct(0); setExportMsg(ffReady ? "Carregando engine..." : "Inicializando FFmpeg...");
    setExportUrl(null); setError(null);
    setExportLog([]); setExportFfCmd("");
    setExportElapsed(0); setExportFpsLive(null); setExportSpeed(null);
    exportStartRef.current = performance.now();
    if (exportElapsedTimerRef.current) window.clearInterval(exportElapsedTimerRef.current);
    exportElapsedTimerRef.current = window.setInterval(() => {
      setExportElapsed((performance.now() - exportStartRef.current) / 1000);
    }, 250) as unknown as number;

    const logs: string[] = [];

    // ===== Caminho rápido: WebCodecs (aceleração por hardware quando disponível) =====
    if (useHardwareAccel && exportCodec === "h264") {
      const targetHwc = QUALITY_HEIGHT[quality];
      const targetWwc = Math.round((targetHwc * aspect.w) / aspect.h / 2) * 2;
      try {
        const { isWebCodecsExportSupported, exportWithWebCodecs } = await import("@/lib/webcodecs-export");
        const sup = await isWebCodecsExportSupported(targetWwc, targetHwc, fps, vKbps);
        if (sup.ok) {
          setExportMsg(`Aceleração por hardware: ${sup.hw === "prefer-hardware" ? "GPU" : "software-otimizado"} (${sup.codec})`);
          setExportLog([
            `=== EXPORT WEBCODECS ===`,
            `Codec: ${sup.codec} · Aceleração: ${sup.hw}`,
            `Resolução: ${targetWwc}x${targetHwc} · ${fps} fps · ${vKbps} kbps`,
          ]);
          const textItem = items.find(i => i.kind === "text" && i.text?.content);
          const music = audioClips[0];
          const blob = await exportWithWebCodecs({
            v1clips: v1clips as unknown as import("@/lib/webcodecs-export").WCItem[],
            audioClips: audioClips as unknown as import("@/lib/webcodecs-export").WCItem[],
            music: music as unknown as import("@/lib/webcodecs-export").WCItem | undefined,
            textItem: textItem as unknown as import("@/lib/webcodecs-export").WCItem | undefined,
            targetW: targetWwc, targetH: targetHwc,
            fps, vKbps, aKbps, totalDuration: Math.max(0.1, totalDuration),
            onProgress: (p) => setExportPct(p),
            onMessage: (m) => setExportMsg(m),
            onLog: (l) => setExportLog(prev => [...prev, l].slice(-500)),
          });
          const url = URL.createObjectURL(blob);
          const sizeMB = blob.size / (1024 * 1024);
          const fileName = `${exportFileName || "video"}.mp4`;
          setExportUrl(url);
          setExportMsg("Pronto!"); setExportPct(1);
          setExportHistory(h => [{ url, name: fileName, at: Date.now(), sizeMB }, ...h].slice(0, 8));
          if (exportElapsedTimerRef.current) { window.clearInterval(exportElapsedTimerRef.current); exportElapsedTimerRef.current = null; }
          setExporting(false);
          return;
        } else {
          setExportLog(prev => [...prev, `[wc] não suportado: ${sup.reason} — usando FFmpeg WASM`]);
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setExportLog(prev => [...prev, `[wc] falhou: ${m} — caindo para FFmpeg WASM`]);
        console.warn("WebCodecs falhou, fallback FFmpeg:", e);
      }
    }

    try {

      // ===== DIAGNÓSTICO PRÉ-EXPORTAÇÃO =====
      const _th = QUALITY_HEIGHT[quality];
      const _tw = Math.round((_th * aspect.w) / aspect.h / 2) * 2;
      const diag = [
        `=== DIAGNÓSTICO DE EXPORTAÇÃO ===`,
        `Arquivo: ${exportFileName || "video"}.mp4`,
        `Pasta de saída: (download do navegador)`,
        `Resolução: ${_tw}x${_th}`,
        `FPS: ${fps}`,
        `Codec solicitado: ${codecRequested} (engine: libx264 WASM)`,
        `Bitrate vídeo: ${vKbps} kbps · áudio: ${aKbps} kbps`,
        `Clipes vídeo/imagem na V1: ${items.filter(i => (i.kind === "video" || i.kind === "image")).length}`,
        `Clipes áudio: ${items.filter(i => i.kind === "audio").length}`,
        `Duração total: ${totalDuration.toFixed(2)}s`,
        `FFmpeg core URL: /ffmpeg/ffmpeg-core.js`,
        `User-Agent: ${navigator.userAgent}`,
        `=================================`,
        `Iniciando processo FFmpeg...`,
      ];
      console.group("%c[EXPORT DIAG]", "color:#22d3ee;font-weight:bold");
      diag.forEach(l => console.log(l));
      console.groupEnd();
      setExportLog(diag);

      const onLog = ({ message }: { message: string }) => {
        logs.push(message); if (logs.length > 500) logs.shift();
        const m1 = /fps=\s*([\d.]+)/.exec(message);
        if (m1) setExportFpsLive(parseFloat(m1[1]));
        const m2 = /speed=\s*([\d.]+)x/.exec(message);
        if (m2) setExportSpeed(parseFloat(m2[1]));
        setExportLog(prev => {
          const next = [...prev, message];
          return next.length > 500 ? next.slice(-500) : next;
        });
      };
      const onProg = ({ progress: p }: { progress: number }) =>
        setExportPct(Math.max(0, Math.min(1, p)));


      setFfLoading(true);
      const ff = await getFFmpeg();
      setFfReady(true);
      setFfLoadError(null);
      setFfLoading(false);
      if (!ff) {
        console.error("FFmpeg não carregou.");
        setError("FFmpeg não carregou.");
        setExportMsg("Erro");
        return;
      }
      console.log("FFmpeg carregado:", ff);
      ff.on("log", onLog);
      ff.on("progress", onProg);
      const targetH = QUALITY_HEIGHT[quality];
      const targetW = Math.round((targetH * aspect.w) / aspect.h / 2) * 2;
      const inputs: string[] = [];

      if (codecRequested !== "h264") {
        logs.push(`[warn] Codec ${codecRequested.toUpperCase()} indisponível no engine WASM — usando H.264.`);
      }
      if (useGpu) {
        logs.push(`[warn] Aceleração por GPU não é suportada no FFmpeg WASM — usando CPU.`);
      }

      if (!v1clips.length) {
        const dur = Math.max(1, totalDuration).toFixed(3);
        setExportMsg("Gerando vídeo base (áudio)...");
        await ff.exec([
          "-f", "lavfi", "-t", dur, "-i", `color=c=black:s=${targetW}x${targetH}:r=${fps}`,
          "-f", "lavfi", "-t", dur, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
          ...vEncArgs, ...aEncArgs, "-shortest", "joined.mp4",
        ]);
      } else {
        for (let i = 0; i < v1clips.length; i++) {
          const c = v1clips[i];
          const isImg = c.kind === "image";
          const ext = isImg ? (c.file?.name.split(".").pop() || "png").toLowerCase() : "bin";
          const inName = `in_${i}.${ext}`;
          const outName = `cut_${i}.mp4`;
          const sourceFile = c.file;
          if (!sourceFile) throw new Error(`Clipe sem arquivo original: ${c.name}`);
          setExportMsg(`Processando clipe ${i + 1}/${v1clips.length}...`);
          await ff.writeFile(inName, await fetchFile(sourceFile));
          const dur = (c.outPoint - c.inPoint);
          const to = dur.toFixed(3);
          const afilters: string[] = [];
          afilters.push(...buildAudioFilterChain(c.audioFx, c.gainDb ?? 0, dur));
          if (c.fadeIn && c.fadeIn > 0.01) afilters.push(`afade=t=in:st=0:d=${c.fadeIn.toFixed(3)}`);
          if (c.fadeOut && c.fadeOut > 0.01) afilters.push(`afade=t=out:st=${(dur - c.fadeOut).toFixed(3)}:d=${c.fadeOut.toFixed(3)}`);
          const filter = exportVideoFilter(c, targetW, targetH);

          const args: string[] = [];
          if (isImg) {
            args.push("-loop", "1", "-framerate", String(fps), "-t", to, "-i", inName);
            args.push("-f", "lavfi", "-t", to, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
            if (filter.type === "vf") args.push("-vf", filter.value, "-map", "0:v", "-map", "1:a");
            else args.push("-filter_complex", filter.value, "-map", "[vout]", "-map", "1:a");
            args.push(...vEncArgs, ...aEncArgs, "-shortest", outName);
          } else {
            // Seek preciso: -ss DEPOIS do -i evita perda de frames (tela preta) no FFmpeg WASM.
            args.push("-i", inName, "-ss", c.inPoint.toFixed(3), "-t", to);
            args.push("-f", "lavfi", "-t", to, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
            const vPart = filter.type === "vf" ? `[0:v]${filter.value}[vout]` : filter.value;
            const aPart = afilters.length
              ? `[0:a]${afilters.join(",")}[a0src];[a0src][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0:weights=1 0[aout]`
              : `[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0:weights=1 0[aout]`;
            args.push("-filter_complex", `${vPart};${aPart}`, "-map", "[vout]", "-map", "[aout]");
            args.push(...vEncArgs, ...aEncArgs, "-shortest", outName);
          }
          try {
            await ff.exec(args);
          } catch {
            // Fallback 1: vídeo sem trilha de áudio → ignora [0:a] e usa apenas anullsrc do lavfi
            const fbArgs: string[] = ["-i", inName, "-ss", c.inPoint.toFixed(3), "-t", to,
              "-f", "lavfi", "-t", to, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
            if (filter.type === "vf") fbArgs.push("-vf", filter.value, "-map", "0:v", "-map", "1:a");
            else fbArgs.push("-filter_complex", filter.value, "-map", "[vout]", "-map", "1:a");
            fbArgs.push(...vEncArgs, ...aEncArgs, "-shortest", outName);
            try {
              await ff.exec(fbArgs);
            } catch {
              // Fallback 2: seek rápido (tolerante a arquivos com índice/keyframes incompletos)
              const fb2: string[] = ["-ss", c.inPoint.toFixed(3), "-i", inName, "-t", to,
                "-f", "lavfi", "-t", to, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
              if (filter.type === "vf") fb2.push("-vf", filter.value, "-map", "0:v", "-map", "1:a");
              else fb2.push("-filter_complex", filter.value, "-map", "[vout]", "-map", "1:a");
              fb2.push(...vEncArgs, ...aEncArgs, "-shortest", outName);
              await ff.exec(fb2);
            }
          }
          await ff.deleteFile(inName);
          inputs.push(outName);
        }
        setExportMsg("Juntando clipes...");
        if (inputs.length === 1) {
          await ff.exec(["-i", inputs[0], "-c", "copy", "joined.mp4"]);
        } else {
          const list = inputs.map(n => `file '${n}'`).join("\n");
          await ff.writeFile("list.txt", new TextEncoder().encode(list));
          // -c copy: streams já em H.264/AAC com mesmos params → concat sem re-encode
          await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt",
            "-c", "copy", "joined.mp4"]);
        }
      }

      const vf: string[] = [];
      const firstText = items.find(i => i.kind === "text" && i.text?.content);
      if (firstText && firstText.text) {
        const t = firstText.text;
        const y = `${Math.round((firstText.transform?.yPct ?? 80) / 100 * targetH - t.size / 2)}`;
        const esc = t.content.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        vf.push(`drawtext=text='${esc}':fontcolor=${t.color}:fontsize=${t.size}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.4:boxborderw=12`);
      }

      const music = audioClips[0];
      setExportMsg("Renderizando saída...");
      const needsReencode = vf.length > 0 || !!music;
      const finalArgs: string[] = ["-i", "joined.mp4"];
      if (music) {
        if (!music.file) throw new Error(`Áudio sem arquivo original: ${music.name}`);
        await ff.writeFile("bgm.bin", await fetchFile(music.file)); finalArgs.push("-i", "bgm.bin");
      }
      if (vf.length) finalArgs.push("-vf", vf.join(","));
      if (music) {
        const ducker = v1clips.length ? 0.4 : 1.0;
        const musicChain = buildAudioFilterChain(music.audioFx, music.gainDb ?? 0);
        // ducker aplicado depois (não somar dB), aloop infinito
        const musicFilters = [...musicChain, `volume=${ducker.toFixed(3)}`, "aloop=loop=-1:size=2e9"].join(",");
        finalArgs.push(
          "-filter_complex",
          `[0:a]volume=1[a0];[1:a]${musicFilters}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
          "-map", "0:v", "-map", "[aout]",
        );
      }

      if (needsReencode) {
        finalArgs.push(...vEncArgs, ...aEncArgs);
      } else {
        // sem texto/música → remux puro (quase instantâneo)
        finalArgs.push("-c", "copy");
      }
      finalArgs.push("-movflags", "+faststart", "-shortest", "output.mp4");
      setExportFfCmd("ffmpeg " + finalArgs.map(a => a.includes(" ") ? `"${a}"` : a).join(" "));
      await ff.exec(finalArgs);

      const data = (await ff.readFile("output.mp4")) as Uint8Array;
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const blob = new Blob([buf], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const sizeMB = blob.size / (1024 * 1024);
      const fileName = `${exportFileName || "video"}.mp4`;
      setExportUrl(url);
      setExportMsg("Pronto!"); setExportPct(1);
      setExportHistory(h => [{ url, name: fileName, at: Date.now(), sizeMB }, ...h].slice(0, 8));

      for (const n of inputs) await ff.deleteFile(n).catch(() => {});
      await ff.deleteFile("list.txt").catch(() => {});
      await ff.deleteFile("joined.mp4").catch(() => {});
      await ff.deleteFile("output.mp4").catch(() => {});
      if (music) await ff.deleteFile("bgm.bin").catch(() => {});

      // Post-export actions
      if (postBeep) {
        try {
          const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
          const ctx = new Ctx();
          const o = ctx.createOscillator(); const g2 = ctx.createGain();
          o.frequency.value = 880; g2.gain.value = 0.08;
          o.connect(g2).connect(ctx.destination); o.start();
          setTimeout(() => { o.stop(); ctx.close(); }, 220);
        } catch {}
      }
      if (postAutoDownload) {
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
      }
      if (postPlay) {
        setTimeout(() => {
          const v = document.querySelector<HTMLVideoElement>(`video[src="${url}"]`);
          if (v) void v.play().catch(() => {});
        }, 200);
      }
    } catch (e) {
      const tail = logs.slice(-6).join("\n");
      console.error("[export] FFmpeg falhou:", e, "\nÚltimos logs:\n", tail);
      const baseMsg = e instanceof Error ? e.message : "Falha na exportação";
      setFfLoading(false);
      if (/ffmpeg/i.test(baseMsg)) {
        setFfReady(false);
        setFfLoadError(baseMsg);
      }
      setError(`${baseMsg}${tail ? `\n\nDetalhes:\n${tail}` : ""}`);
      setExportMsg("Erro");
    } finally {
      setExporting(false);
      if (exportElapsedTimerRef.current) {
        window.clearInterval(exportElapsedTimerRef.current);
        exportElapsedTimerRef.current = null;
      }
    }
  };

  const applyExportPreset = (key: ExportPresetKey) => {
    setExportPreset(key);
    if (key === "custom") return;
    const p = EXPORT_PRESETS[key];
    setAspectKey(p.aspect);
    setQuality(p.quality);
    setExportFps(p.fps);
    setBitrateMode("custom");
    setCustomBitrate(p.vBitrate);
    setAudioBitrate(p.aBitrate);
  };


  // ---- Drag from Media to Timeline ----
  const onTrackDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-vle-media")) {
      e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    }
  };
  const onTrackDrop = (e: React.DragEvent, trackId: string) => {
    const id = e.dataTransfer.getData("application/x-vle-media");
    if (!id) return;
    e.preventDefault();
    const asset = media.find(m => m.id === id); if (!asset) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const start = snapTime(Math.max(0, xPx / zoom));
    addAssetToTimeline(asset, { trackId, start });
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground select-none" style={{ WebkitUserSelect: "none", userSelect: "none" }}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Film className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-sm font-semibold">VIDEO LITE EDITOR</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} title="Desfazer (Ctrl+Z)" className="rounded p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
          <button onClick={redo} title="Refazer (Ctrl+Y)" className="rounded p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
          <div className="mx-2 h-6 w-px bg-border" />
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Proporção</label>
          <select value={aspectKey} onChange={(e) => setAspectKey(e.target.value as AspectKey)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
            {(Object.keys(ASPECTS) as AspectKey[]).map(k => <option key={k} value={k}>{ASPECTS[k].label}</option>)}
          </select>
          {aspectKey === "custom" && (
            <div className="flex items-center gap-1 text-xs">
              <input type="number" min={1} value={customAR.w} onChange={(e) => setCustomAR(s => ({ ...s, w: Math.max(1, Number(e.target.value) || 1) }))}
                className="w-14 rounded border border-border bg-card px-1.5 py-1" />
              <span className="text-muted-foreground">:</span>
              <input type="number" min={1} value={customAR.h} onChange={(e) => setCustomAR(s => ({ ...s, h: Math.max(1, Number(e.target.value) || 1) }))}
                className="w-14 rounded border border-border bg-card px-1.5 py-1" />
            </div>
          )}
          <div className="mx-2 h-6 w-px bg-border" />
          <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
            <option value="720">720p</option><option value="1080">1080p</option><option value="2160">4K</option>
          </select>
          <button
            onClick={() => {
              if (!gpuInfoRef.current) gpuInfoRef.current = detectGpu();
              setShowExportSettings(true);
            }}
            disabled={exporting || !items.length}
            className="glow-primary inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {exporting || ffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? "Exportando" : ffLoading ? "Carregando" : ffLoadError ? "Tentar exportar" : "Exportar"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex shrink-0 flex-col gap-2 border-r border-border bg-panel p-3 select-none" style={{ width: leftW }}>
          <button onClick={() => fileInputRef.current?.click()}
            className="glow-primary inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Adicionar Arquivo
          </button>
          <button onClick={addText}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs hover:border-ring/50">
            <TypeIcon className="h-3.5 w-3.5" /> Adicionar Título
          </button>
          <input ref={fileInputRef} type="file" multiple hidden
            accept="video/*,audio/*,image/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.ogg,.png,.jpg,.jpeg"
            onChange={(e) => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ""; }} />

          <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Mídia</span>
            <span className="text-[10px] normal-case text-muted-foreground/70">{media.length} item(ns)</span>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto pr-1">
            {media.map(a => {
              const Icon = a.kind === "audio" ? Music2 : a.kind === "image" ? ImageIcon : VideoIcon;
              const used = usedMediaIds.has(a.id);
              return (
                <div key={a.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("application/x-vle-media", a.id); e.dataTransfer.effectAllowed = "copy"; }}
                  onDoubleClick={() => addAssetToTimeline(a)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMediaCtx({ x: e.clientX, y: e.clientY, mediaId: a.id }); }}
                  title="Arraste até a timeline, clique duas vezes ou clique direito para opções"
                  className={`group flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs active:cursor-grabbing ${used ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-ring/50"}`}>
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {used && <Check className="h-3 w-3 text-primary" />}
                  <button onClick={(e) => { e.stopPropagation(); addAssetToTimeline(a); }} className="rounded p-0.5 opacity-0 hover:bg-background group-hover:opacity-100" title="Adicionar à timeline">
                    <Plus className="h-3 w-3" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); removeMedia(a.id); }} className="rounded p-0.5 opacity-0 text-destructive hover:bg-background group-hover:opacity-100" title="Excluir mídia">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {!media.length && <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">Clique em "Adicionar Arquivo" para importar mídia. Depois arraste para a timeline.</div>}
          </div>
        </aside>
        <div
          onMouseDown={(e) => { sideDragRef.current = { side: "L", startX: e.clientX, startW: leftW }; document.body.style.cursor = "ew-resize"; }}
          className="w-1 shrink-0 cursor-ew-resize bg-border hover:bg-primary/40"
          title="Arraste para redimensionar"
        />


        <main className="flex min-w-0 flex-1 flex-col select-none">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-6 select-none" onWheel={onPreviewWheel}>
            <div ref={previewBoxRef} className="group/preview relative overflow-hidden rounded-lg shadow-2xl select-none"
              style={{
                aspectRatio: `${aspect.w} / ${aspect.h}`,
                maxHeight: "100%", maxWidth: "100%",
                width: `min(100%, calc((100vh - 360px) * ${aspect.w} / ${aspect.h}))`,
                background: activeV1Video?.fx?.fillMode === "color" ? activeV1Video.fx.bgColor : "#000",
              }}>
              {/* Hidden SVG defs: real sharpen (unsharp-mask convolution) */}
              <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
                <defs>
                  <filter id="lle-sharpen" x="0" y="0" width="100%" height="100%">
                    <feConvolveMatrix order="3" preserveAlpha="true"
                      kernelMatrix="0 -1 0  -1 5 -1  0 -1 0" />
                  </filter>
                  <filter id="lle-sharpen-strong" x="0" y="0" width="100%" height="100%">
                    <feConvolveMatrix order="3" preserveAlpha="true"
                      kernelMatrix="-1 -1 -1  -1 9 -1  -1 -1 -1" />
                  </filter>
                </defs>
              </svg>
              {/* Background fill (blur/mirror) for V1 video */}
              {activeV1Video && (() => {
                const fx = activeV1Video.fx;
                if (!fx || !hasBackgroundFill(fx)) return null;
                return (
                  <video
                    key={`bg-${activeV1Video.id}-${fx.fillMode}`}
                    ref={videoBgElRef}
                    src={activeV1Video.url}
                    muted playsInline
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={backgroundFillStyle(fx)}
                  />
                );
              })()}
              {(() => {
                const tr = activeV1Video?.transform;
                const fx = activeV1Video?.fx;
                const localT = activeV1Video ? playhead - activeV1Video.start : 0;
                const dur = activeV1Video ? activeV1Video.outPoint - activeV1Video.inPoint : 0;
                const zScale = computeZoomScale(fx, localT, dur);
                const op = activeV1Video ? computeVisualOpacity(activeV1Video, playhead) : 1;
                const style: React.CSSProperties = tr ? {
                  transform: `translate(${tr.xPct - 50}%, ${tr.yPct - 50}%) scale(${tr.scale * zScale}) rotate(${tr.rotation}deg)`,
                  opacity: op,
                  filter: cssFilter(fx),
                } : {};
                return <video ref={videoElRef} className="absolute inset-0 h-full w-full pointer-events-none" muted={false} playsInline style={{ ...style, objectFit: mainObjectFit(fx), zIndex: 2 }} />;
              })()}

              {/* Vignette overlay for V1 video */}
              {(() => {
                const vs = vignetteStyle(activeV1Video?.fx);
                return vs ? <div className="pointer-events-none absolute inset-0" style={{ ...vs, zIndex: 2 }} /> : null;
              })()}

              {/* Click-to-select V1 video (transparent layer above video, below overlays) */}
              {activeV1Video && activeV1Video.transform && (
                <div
                  onMouseDown={(e) => startMove(activeV1Video.id, e, activeV1Video.transform!)}
                  className="absolute inset-0 cursor-move"
                  style={{ background: "transparent", zIndex: 3 }}
                />
              )}

              <div className={`pointer-events-none absolute inset-y-0 left-1/2 w-px transition-opacity ${snapV ? "bg-primary opacity-100" : "bg-white/10 opacity-0 group-hover/preview:opacity-30"}`} />
              <div className={`pointer-events-none absolute inset-x-0 top-1/2 h-px transition-opacity ${snapH ? "bg-primary opacity-100" : "bg-white/10 opacity-0 group-hover/preview:opacity-30"}`} />

              {/* Per-image background fill */}
              {overlays.filter(ov => ov.kind === "image" && hasBackgroundFill(ov.fx)).map(ov => {
                const fx = ov.fx;
                if (!fx) return null;
                return (
                  <img key={`imgbg-${ov.id}`} src={ov.url} alt="" draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{
                      ...backgroundFillStyle(fx),
                      zIndex: 3,
                      opacity: computeVisualOpacity(ov, playhead),
                    }} />
                );
              })}
              {overlays.map(ov => {
                const tr = ov.transform!;
                const isSel = ov.id === selectedId;
                if (ov.kind === "image") {
                  const b = getItemBounds(ov);
                  const fx = ov.fx;
                  const localT = playhead - ov.start;
                  const dur = ov.outPoint - ov.inPoint;
                  const zScale = computeZoomScale(fx, localT, dur);
                  const op = computeVisualOpacity(ov, playhead);
                  const wrap: React.CSSProperties = {
                    position: "absolute",
                    left: `${tr.xPct}%`, top: `${tr.yPct}%`,
                    width: `${b.w}%`, height: `${b.h}%`,
                    transform: `translate(-50%,-50%) scale(${tr.scale * zScale}) rotate(${tr.rotation}deg)`,
                    cursor: "move",
                    opacity: op,
                    zIndex: 4,
                    outline: isSel ? "1.5px dashed var(--primary)" : "none",
                  };
                  return (
                    <div key={ov.id} style={wrap} onMouseDown={(e) => startMove(ov.id, e, tr)}>
                      <img src={ov.url} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain"
                        style={{ filter: cssFilter(fx) }} />
                      {(() => {
                        const vs = vignetteStyle(fx);
                        return vs ? <div className="pointer-events-none absolute inset-0" style={vs} /> : null;
                      })()}
                      {isSel && <CornerHandles id={ov.id} tr={tr} onStartScale={startScale} />}
                    </div>
                  );
                }
                if (ov.kind === "text" && ov.text) {
                  const t = ov.text;
                  const bgRgba = (() => {
                    const h = t.bgColor.replace("#", "");
                    const r = parseInt(h.slice(0, 2), 16);
                    const g = parseInt(h.slice(2, 4), 16);
                    const b = parseInt(h.slice(4, 6), 16);
                    return `rgba(${r},${g},${b},${t.bgOpacity})`;
                  })();
                  const shadow = t.shadowBlur > 0 || t.shadowOffsetX || t.shadowOffsetY
                    ? `${t.shadowOffsetX}px ${t.shadowOffsetY}px ${t.shadowBlur}px ${t.shadowColor}`
                    : "none";
                  const stroke = t.strokeWidth > 0
                    ? `${t.strokeWidth}px ${t.strokeColor}` : undefined;
                  const txtStyle: React.CSSProperties = {
                    position: "absolute",
                    left: `${tr.xPct}%`, top: `${tr.yPct}%`,
                    transform: `translate(-50%,-50%) scale(${tr.scale}) rotate(${tr.rotation}deg)`,
                    color: t.color,
                    fontFamily: t.fontFamily,
                    fontSize: t.size,
                    fontWeight: t.bold ? 800 : 400,
                    fontStyle: t.italic ? "italic" : "normal",
                    textDecoration: t.underline ? "underline" : "none",
                    textAlign: t.align,
                    letterSpacing: `${t.letterSpacing}px`,
                    lineHeight: t.lineHeight,
                    textShadow: shadow,
                    WebkitTextStroke: stroke,
                    background: t.bgOpacity > 0 ? bgRgba : "transparent",
                    padding: `${t.paddingY}px ${t.paddingX}px`,
                    borderRadius: t.radius,
                    whiteSpace: "pre-wrap",
                    cursor: "move",
                    opacity: (computeVisualOpacity(ov, playhead)) * t.opacity,
                    zIndex: 5,
                    outline: isSel ? "1.5px dashed var(--primary)" : "none",
                    maxWidth: "90%",
                  };
                  return (
                    <div key={ov.id} style={txtStyle} onMouseDown={(e) => startMove(ov.id, e, tr)}>
                      {t.content}
                      {isSel && <CornerHandles id={ov.id} tr={tr} onStartScale={startScale} />}
                    </div>
                  );
                }
                return null;
              })}

              {/* Bounding box + corner handles for the active V1 video */}
              {previewTarget && previewTarget === activeV1Video && previewTarget.transform && (() => {
                const tr = previewTarget.transform;
                const b = getItemBounds(previewTarget);
                const style: React.CSSProperties = {
                  position: "absolute",
                  left: `${tr.xPct}%`, top: `${tr.yPct}%`,
                  width: `${b.w}%`, height: `${b.h}%`,
                  transform: `translate(-50%,-50%) scale(${tr.scale}) rotate(${tr.rotation}deg)`,
                  border: "1.5px dashed var(--primary)",
                  pointerEvents: "none",
                  zIndex: 6,
                };
                return (
                  <div key={`sel-${previewTarget.id}`} style={style}>
                    <CornerHandles id={previewTarget.id} tr={tr} onStartScale={startScale} />
                  </div>
                );
              })()}

              {!items.length && (
                <div className="absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground">
                  <div><Film className="mx-auto mb-2 h-10 w-10 opacity-40" />Adicione um arquivo para começar.</div>
                </div>
              )}
            </div>
          </div>


          <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-2">
            <button onClick={() => { if (playhead >= totalDuration - 0.05) setPlayhead(0); setPlaying(true); }} disabled={!items.length} className="rounded p-1.5 hover:bg-card disabled:opacity-40"><Play className="h-4 w-4" /></button>
            <button onClick={() => setPlaying(false)} className="rounded p-1.5 hover:bg-card"><Pause className="h-4 w-4" /></button>
            <button onClick={() => { setPlaying(false); setPlayhead(0); }} className="rounded p-1.5 hover:bg-card"><Square className="h-4 w-4" /></button>
            <div className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">{fmt(playhead)} / {fmt(totalDuration)}</div>
            <div className="flex-1" />
            <button onClick={() => splitAt(playhead)} title="Dividir (S / Ctrl+B)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary hover:text-primary">
              <Scissors className="h-3.5 w-3.5" /> Dividir
            </button>
            <button onClick={() => selected && deleteItem(selected.id)} disabled={!selected} title="Excluir (Del)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:border-destructive hover:text-destructive disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <div className="mx-2 h-5 w-px bg-border" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5" />
              <input type="range" min={0} max={1} step={0.05} defaultValue={1}
                onChange={(e) => { if (videoElRef.current) videoElRef.current.volume = Number(e.target.value); }}
                className="w-24 accent-[color:var(--primary)]" />
            </div>
            <div className="mx-2 h-5 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <button onClick={() => setZoom(z => Math.max(minZoom, z - 10))} className="rounded p-1 hover:bg-card"><ZoomOut className="h-3.5 w-3.5" /></button>
              <input type="range" min={minZoom} max={Math.max(minZoom + 10, 200)} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-[color:var(--primary)]" />
              <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="rounded p-1 hover:bg-card"><ZoomIn className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mx-2 h-5 w-px bg-border" />
            <button
              onClick={() => setSnapResize(s => !s)}
              title={snapResize ? "Snap nas bordas: ativo (clique para precisão livre)" : "Precisão livre (clique para alinhar com outros clipes)"}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${snapResize ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-card"}`}
            >
              <Magnet className="h-3.5 w-3.5" />
              <span>{snapResize ? "Snap" : "Livre"}</span>
            </button>
          </div>

          <div ref={timelineRef} onMouseDown={onTimelineMouseDown}
            className="relative h-[280px] shrink-0 overflow-x-auto border-t border-border bg-track">
            <div className="relative" style={{ width: labelColW + rulerSpan * zoom, minWidth: "100%" }}>
              <div data-role="ruler" className="sticky top-0 z-20 flex cursor-ew-resize select-none border-b border-border bg-panel" style={{ height: rulerH }}>
                <div className="shrink-0 border-r border-border bg-panel" style={{ width: labelColW }} />
                <div data-role="ruler" className="relative flex-1" style={{ height: rulerH }}>
                  {ticks.map(t => (
                    <div key={t} data-role="ruler" className="absolute top-0 h-full" style={{ left: t * zoom }}>
                      <div className="h-3 w-px bg-border" />
                      <div className="absolute left-1 top-2 text-[10px] tabular-nums text-muted-foreground">{t}s</div>
                    </div>
                  ))}
                </div>
              </div>

              <div ref={tracksAreaRef} className="relative">
                {tracks.map((tr, idx) => {
                  const locked = !!trackLocked[tr.id];
                  const muted = !!trackMuted[tr.id];
                  const nextSameKind = tracks[idx + 1]?.kind === tr.kind;
                  const lastOfKind = !nextSameKind; // show + at the bottom for the last track of each kind, OR between same-kind tracks
                  return (
                    <div key={tr.id} className="group/row relative flex border-b border-border" style={{ height: trackHeight }}>
                      <div className="relative flex shrink-0 items-center gap-1.5 border-r border-border bg-panel px-2 text-[11px] text-muted-foreground" style={{ width: labelColW }}>
                        {tr.kind === "video" ? <VideoIcon className="h-3 w-3 shrink-0" /> : <Music2 className="h-3 w-3 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate">{tr.label}</span>
                        <button onClick={() => setTrackMuted(s => ({ ...s, [tr.id]: !s[tr.id] }))}
                          title={muted ? "Reativar" : "Silenciar"}
                          className={`rounded p-1 ${muted ? "text-destructive" : "hover:bg-card hover:text-foreground"}`}>
                          {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                        </button>
                        <button onClick={() => setTrackLocked(s => ({ ...s, [tr.id]: !s[tr.id] }))}
                          title={locked ? "Desbloquear" : "Bloquear"}
                          className={`rounded p-1 ${locked ? "text-primary" : "hover:bg-card hover:text-foreground"}`}>
                          {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        </button>
                        {tracks.filter(t => t.kind === tr.kind).length > 1 && (
                          <button onClick={() => {
                            const hasItems = items.some(i => i.trackId === tr.id);
                            if (hasItems && !window.confirm(`Excluir trilha ${tr.label}? Os clipes nela serão removidos.`)) return;
                            removeTrack(tr.id);
                          }}
                            title="Excluir trilha"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {/* + button on the bottom edge: insert another track of the same kind right below */}
                      {(nextSameKind || lastOfKind) && (
                        <button
                          onClick={() => insertTrackAt(tr.kind, idx + 1)}
                          title={`Adicionar trilha ${tr.kind === "video" ? "de vídeo" : "de áudio"}`}
                          className="absolute -bottom-2.5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-primary p-0.5 text-primary-foreground opacity-0 shadow transition hover:scale-110 group-hover/row:opacity-100"
                          style={{ left: labelColW / 2 }}>
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                      <div
                        onDragOver={onTrackDragOver}
                        onDrop={(e) => onTrackDrop(e, tr.id)}
                        className="relative flex-1" style={{ backgroundColor: idx % 2 ? "color-mix(in oklab, var(--track) 80%, transparent)" : undefined, opacity: locked ? 0.6 : 1 }}>
                        {items.filter(i => i.trackId === tr.id).map(i => {
                          const dur = i.outPoint - i.inPoint;
                          const w = Math.max(20, dur * zoom);
                          const active = i.id === selectedId;
                          const color = i.kind === "audio" ? "oklch(0.55 0.15 200)" : i.kind === "text" ? "oklch(0.55 0.2 320)" : i.kind === "image" ? "oklch(0.6 0.18 80)" : "oklch(0.55 0.18 155)";
                          const fiW = (i.fadeIn ?? 0) * zoom;
                          const foW = (i.fadeOut ?? 0) * zoom;
                          const isAudio = i.kind === "audio" || i.kind === "video";
                          return (
                            <div key={i.id}
                              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedId(i.id); setCtxMenu({ x: e.clientX, y: e.clientY, clipId: i.id }); }}
                              onMouseDown={(e) => {
                                if (locked) return;
                                if ((e.target as HTMLElement).dataset.handle) return;
                                if (e.button !== 0) return;
                                e.stopPropagation(); setSelectedId(i.id);
                                const timeline = timelineRef.current;
                                if (!timeline) {
                                  console.error("Timeline ainda não está pronta para arrastar o clipe.");
                                  return;
                                }
                                const rect = timeline.getBoundingClientRect();
                                const xPx = e.clientX - rect.left + timeline.scrollLeft - labelColW;
                                skipHistory.current = true;
                                dragRef.current = { type: "move", id: i.id, offsetSec: xPx / zoom - i.start, origTrackId: i.trackId };
                              }}
                              className={`group/clip absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded-md text-[10px] text-white shadow ${active ? "ring-2 ring-primary" : "ring-1 ring-black/30"}`}
                              style={{ left: i.start * zoom, width: w, background: color, cursor: locked ? "not-allowed" : "grab" }}>
                              {fiW > 0 && (
                                <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: fiW, background: "linear-gradient(to right, rgba(0,0,0,0.55), transparent)" }} />
                              )}
                              {foW > 0 && (
                                <div className="pointer-events-none absolute inset-y-0 right-0" style={{ width: foW, background: "linear-gradient(to left, rgba(0,0,0,0.55), transparent)" }} />
                              )}

                              <div data-handle="L" onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); const time = getTimelineTimeFromClientX(e.clientX) ?? i.start; skipHistory.current = true; lastTimelinePointer.current = { x: e.clientX, y: e.clientY }; dragRef.current = { type: "resizeL", id: i.id, origStart: i.start, origIn: i.inPoint, origEnd: i.start + (i.outPoint - i.inPoint), isImage: i.kind === "image", pointerOffsetPx: (time - i.start) * zoom }; }}
                                className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />
                              <div data-handle="R" onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); const end = i.start + (i.outPoint - i.inPoint); const time = getTimelineTimeFromClientX(e.clientX) ?? end; skipHistory.current = true; lastTimelinePointer.current = { x: e.clientX, y: e.clientY }; dragRef.current = { type: "resizeR", id: i.id, origOut: i.outPoint, pointerOffsetPx: (time - end) * zoom }; }}
                                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />

                              <div data-handle="FI" title={`Fade in: ${formatFadeLabel(i.fadeIn ?? 0)} (arraste à direita)`}
                                onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "fadeIn", id: i.id }; }}
                                className="absolute left-2 top-1 z-20 h-3 w-3 cursor-ew-resize rounded-full bg-white opacity-0 ring-1 ring-black/50 group-hover/clip:opacity-90"
                                style={{ left: Math.max(4, fiW - 6) }} />
                              <div data-handle="FO" title={`Fade out: ${formatFadeLabel(i.fadeOut ?? 0)} (arraste à esquerda)`}
                                onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "fadeOut", id: i.id }; }}
                                className="absolute top-1 z-20 h-3 w-3 cursor-ew-resize rounded-full bg-white opacity-0 ring-1 ring-black/50 group-hover/clip:opacity-90"
                                style={{ right: Math.max(4, foW - 6) }} />
                              {(i.fadeIn ?? 0) > 0.005 && (
                                <div className="pointer-events-none absolute top-3.5 z-20 whitespace-nowrap rounded bg-black/80 px-1 text-[9px] font-mono tabular-nums text-white opacity-0 ring-1 ring-white/20 group-hover/clip:opacity-100"
                                  style={{ left: Math.max(2, fiW - 6) }}>
                                  {formatFadeLabel(i.fadeIn ?? 0)}
                                </div>
                              )}
                              {(i.fadeOut ?? 0) > 0.005 && (
                                <div className="pointer-events-none absolute top-3.5 z-20 whitespace-nowrap rounded bg-black/80 px-1 text-[9px] font-mono tabular-nums text-white opacity-0 ring-1 ring-white/20 group-hover/clip:opacity-100"
                                  style={{ right: Math.max(2, foW - 6) }}>
                                  {formatFadeLabel(i.fadeOut ?? 0)}
                                </div>
                              )}
                              {dragRef.current?.id === i.id && (dragRef.current?.type === "fadeIn" || dragRef.current?.type === "fadeOut") && (
                                <div className="pointer-events-none absolute -top-5 z-30 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-primary-foreground shadow"
                                  style={dragRef.current?.type === "fadeIn" ? { left: Math.max(0, fiW - 14) } : { right: Math.max(0, foW - 14) }}>
                                  {dragRef.current?.type === "fadeIn" ? `Fade in ${formatFadeLabel(i.fadeIn ?? 0)}` : `Fade out ${formatFadeLabel(i.fadeOut ?? 0)}`}
                                </div>
                              )}

                              {isAudio && (
                                <div data-handle="G" title={`Ganho: ${(i.gainDb ?? 0).toFixed(1)}dB (arraste vertical)`}
                                  onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "gain", id: i.id, baseDb: i.gainDb ?? 0, baseY: e.clientY }; }}
                                  className="absolute inset-x-1 z-10 h-0.5 cursor-ns-resize bg-yellow-300/80 hover:bg-yellow-200"
                                  style={{ top: `calc(50% - ${((i.gainDb ?? 0) / 30) * 40}%)` }} />
                              )}

                              <div className="pointer-events-none truncate px-3 font-medium">{i.name}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {snapMark !== null && (
                  <div className="pointer-events-none absolute top-0 z-40"
                    style={{ left: labelColW + snapMark * zoom, height: tracks.length * trackHeight }}>
                    <div className="absolute inset-y-0 -left-px w-0.5" style={{ background: "color-mix(in oklab, var(--foreground) 86%, transparent)", boxShadow: "0 0 8px color-mix(in oklab, var(--foreground) 70%, transparent)" }} />
                    <div className="absolute -left-1 top-0 h-2 w-2 rounded-full" style={{ background: "color-mix(in oklab, var(--foreground) 86%, transparent)" }} />
                    <div className="absolute -left-1 bottom-0 h-2 w-2 rounded-full" style={{ background: "color-mix(in oklab, var(--foreground) 86%, transparent)" }} />
                  </div>
                )}

                <div data-role="playhead"
                  className="pointer-events-auto absolute top-0 z-30 w-0.5 cursor-ew-resize bg-primary"
                  style={{ left: labelColW + playhead * zoom, height: tracks.length * trackHeight }}
                  onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { type: "playhead" }; }}>
                  <div className="absolute -left-1.5 -top-1 h-3 w-3.5 rounded-sm bg-primary shadow" />
                </div>
              </div>
            </div>
          </div>
        </main>
        <div
          onMouseDown={(e) => { sideDragRef.current = { side: "R", startX: e.clientX, startW: rightW }; document.body.style.cursor = "ew-resize"; }}
          className="w-1 shrink-0 cursor-ew-resize bg-border hover:bg-primary/40"
          title="Arraste para redimensionar"
        />
        <aside className="flex shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-panel p-3 select-none" style={{ width: rightW }}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> Inspetor
          </div>
          {!selected && (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
              Selecione um clipe na timeline para ajustar efeitos.
            </div>
          )}
          {selected && selected.kind === "text" && selected.text && (() => {
            const t = selected.text;
            const updT = (patch: Partial<TextProps>) =>
              setItems(p => p.map(i => i.id === selected.id ? { ...i, text: { ...i.text!, ...patch } } : i));
            return (
              <div className="space-y-3 rounded-md border border-border bg-card p-3 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Texto</div>
                <textarea value={t.content} onChange={(e) => updT({ content: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs"
                  placeholder="Digite o texto..." />

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fonte</label>
                  <select value={t.fontFamily} onChange={(e) => updT({ fontFamily: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                    style={{ fontFamily: t.fontFamily }}>
                    {FONT_FAMILIES.map(f => <option key={f.stack} value={f.stack} style={{ fontFamily: f.stack }}>{f.label}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => updT({ bold: !t.bold })}
                    className={`flex-1 rounded border px-2 py-1 font-bold ${t.bold ? "border-primary bg-primary/15 text-primary" : "border-border bg-background"}`}>B</button>
                  <button onClick={() => updT({ italic: !t.italic })}
                    className={`flex-1 rounded border px-2 py-1 italic ${t.italic ? "border-primary bg-primary/15 text-primary" : "border-border bg-background"}`}>I</button>
                  <button onClick={() => updT({ underline: !t.underline })}
                    className={`flex-1 rounded border px-2 py-1 underline ${t.underline ? "border-primary bg-primary/15 text-primary" : "border-border bg-background"}`}>U</button>
                  {(["left", "center", "right"] as TextAlign[]).map(a => (
                    <button key={a} onClick={() => updT({ align: a })}
                      className={`flex-1 rounded border px-2 py-1 ${t.align === a ? "border-primary bg-primary/15 text-primary" : "border-border bg-background"}`}>
                      {a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Cor</span>
                    <input type="color" value={t.color} onChange={(e) => updT({ color: e.target.value })}
                      className="h-7 w-full rounded border border-border bg-background" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tamanho</span>
                    <input type="number" min={8} max={400} value={t.size}
                      onChange={(e) => updT({ size: Number(e.target.value) || 48 })}
                      className="h-7 w-full rounded border border-border bg-background px-2 text-xs" />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Espaçamento</span>
                    <input type="number" step="0.5" value={t.letterSpacing}
                      onChange={(e) => updT({ letterSpacing: Number(e.target.value) || 0 })}
                      className="h-7 w-full rounded border border-border bg-background px-2 text-xs" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Linha</span>
                    <input type="number" step="0.05" min={0.8} max={3} value={t.lineHeight}
                      onChange={(e) => updT({ lineHeight: Number(e.target.value) || 1.2 })}
                      className="h-7 w-full rounded border border-border bg-background px-2 text-xs" />
                  </label>
                </div>

                <label className="flex items-center gap-2">
                  <span className="w-16 text-muted-foreground">Opacidade</span>
                  <input type="range" min={0} max={1} step={0.05} value={t.opacity}
                    onChange={(e) => updT({ opacity: Number(e.target.value) })}
                    className="flex-1 accent-[color:var(--primary)]" />
                  <span className="w-8 text-right font-mono">{Math.round(t.opacity * 100)}%</span>
                </label>

                <div className="space-y-2 rounded border border-border/60 bg-background/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sombra</div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={t.shadowColor} onChange={(e) => updT({ shadowColor: e.target.value })}
                      className="h-7 w-9 rounded border border-border bg-background" />
                    <label className="flex flex-1 items-center gap-1">
                      <span className="w-10 text-muted-foreground">Blur</span>
                      <input type="range" min={0} max={40} value={t.shadowBlur}
                        onChange={(e) => updT({ shadowBlur: Number(e.target.value) })}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <span className="w-6 text-right font-mono">{t.shadowBlur}</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-1">
                      <span className="w-6 text-muted-foreground">X</span>
                      <input type="number" value={t.shadowOffsetX}
                        onChange={(e) => updT({ shadowOffsetX: Number(e.target.value) || 0 })}
                        className="h-7 w-full rounded border border-border bg-background px-2 text-xs" />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="w-6 text-muted-foreground">Y</span>
                      <input type="number" value={t.shadowOffsetY}
                        onChange={(e) => updT({ shadowOffsetY: Number(e.target.value) || 0 })}
                        className="h-7 w-full rounded border border-border bg-background px-2 text-xs" />
                    </label>
                  </div>
                </div>

                <div className="space-y-2 rounded border border-border/60 bg-background/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contorno</div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={t.strokeColor} onChange={(e) => updT({ strokeColor: e.target.value })}
                      className="h-7 w-9 rounded border border-border bg-background" />
                    <label className="flex flex-1 items-center gap-1">
                      <span className="w-10 text-muted-foreground">Largura</span>
                      <input type="range" min={0} max={10} step={0.5} value={t.strokeWidth}
                        onChange={(e) => updT({ strokeWidth: Number(e.target.value) })}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <span className="w-6 text-right font-mono">{t.strokeWidth}</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2 rounded border border-border/60 bg-background/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fundo</div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={t.bgColor} onChange={(e) => updT({ bgColor: e.target.value })}
                      className="h-7 w-9 rounded border border-border bg-background" />
                    <label className="flex flex-1 items-center gap-1">
                      <span className="w-12 text-muted-foreground">Opacidade</span>
                      <input type="range" min={0} max={1} step={0.05} value={t.bgOpacity}
                        onChange={(e) => updT({ bgOpacity: Number(e.target.value) })}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <span className="w-8 text-right font-mono">{Math.round(t.bgOpacity * 100)}%</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground">Pad X</span>
                      <input type="number" value={t.paddingX}
                        onChange={(e) => updT({ paddingX: Number(e.target.value) || 0 })}
                        className="h-7 rounded border border-border bg-background px-2 text-xs" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground">Pad Y</span>
                      <input type="number" value={t.paddingY}
                        onChange={(e) => updT({ paddingY: Number(e.target.value) || 0 })}
                        className="h-7 rounded border border-border bg-background px-2 text-xs" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground">Raio</span>
                      <input type="number" value={t.radius}
                        onChange={(e) => updT({ radius: Number(e.target.value) || 0 })}
                        className="h-7 rounded border border-border bg-background px-2 text-xs" />
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}

          {selected && selected.transform && (
            <div className="space-y-2 rounded-md border border-border bg-card p-2 text-xs">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Transformação</span>
                <button onClick={() => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, xPct: 50, yPct: 50 } } : i))}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background"><AlignCenter className="h-3 w-3" /> Centralizar</button>
              </div>
              <label className="flex items-center gap-2" title="Duplo clique para restaurar"><Maximize2 className="h-3 w-3" />
                <input type="range" min={0.1} max={3} step={0.05} value={selected.transform.scale}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, scale: Number(e.target.value) } } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, scale: 1 } } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-8 text-right font-mono tabular-nums">{selected.transform.scale.toFixed(2)}</span>
              </label>
              <label className="flex items-center gap-2" title="Duplo clique para restaurar"><RotateCw className="h-3 w-3" />
                <input type="range" min={-180} max={180} step={1} value={selected.transform.rotation}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, rotation: Number(e.target.value) } } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, rotation: 0 } } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-8 text-right font-mono tabular-nums">{selected.transform.rotation}°</span>
              </label>
            </div>
          )}

          {selected && (selected.kind === "audio" || selected.kind === "video") && (
            <div className="space-y-2 rounded-md border border-border bg-card p-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Áudio</div>
              <label className="flex items-center gap-2" title="Duplo clique para restaurar">
                <span className="w-14 text-muted-foreground">Ganho</span>
                <input type="range" min={-30} max={30} step={0.5} value={selected.gainDb ?? 0}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, gainDb: Number(e.target.value) } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, gainDb: 0 } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className={`w-12 text-right font-mono tabular-nums ${(selected.gainDb ?? 0) > 6 ? "text-amber-400" : (selected.gainDb ?? 0) > 18 ? "text-red-400" : ""}`}>
                  {(selected.gainDb ?? 0) > 0 ? "+" : ""}{(selected.gainDb ?? 0).toFixed(1)}dB
                </span>
              </label>
              {(selected.gainDb ?? 0) > 12 && (
                <div className="rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-400">
                  ⚠ Ganho alto — risco de distorção/clipping (intencional).
                </div>
              )}

              <label className="flex items-center gap-2" title="Duplo clique para restaurar">
                <span className="w-14 text-muted-foreground">Fade In</span>
                <input type="range" min={0} max={Math.min(5, selected.outPoint - selected.inPoint)} step={0.05} value={selected.fadeIn ?? 0}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: Number(e.target.value) } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: 0 } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-10 text-right font-mono tabular-nums">{(selected.fadeIn ?? 0).toFixed(2)}s</span>
              </label>
              <label className="flex items-center gap-2" title="Duplo clique para restaurar">
                <span className="w-14 text-muted-foreground">Fade Out</span>
                <input type="range" min={0} max={Math.min(5, selected.outPoint - selected.inPoint)} step={0.05} value={selected.fadeOut ?? 0}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeOut: Number(e.target.value) } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeOut: 0 } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-10 text-right font-mono tabular-nums">{(selected.fadeOut ?? 0).toFixed(2)}s</span>
              </label>
            </div>
          )}

          {selected && (selected.kind === "audio" || selected.kind === "video") && (() => {
            const afx: AudioFx = selected.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] };
            const patchAfx = (patch: Partial<AudioFx>) =>
              setItems(p => p.map(i => i.id === selected.id
                ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), ...patch } }
                : i));
            const patchEq = (idx: number, val: number) => {
              const next = [...afx.eq]; next[idx] = val;
              patchAfx({ eq: next });
            };
            const resetEq = () => patchAfx({ eq: new Array(EQ_BANDS.length).fill(0) });
            return (
              <div className="space-y-3 rounded-md border border-border bg-card p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Equalizador · 12 bandas</div>
                  <button onClick={resetEq} className="text-[10px] text-muted-foreground hover:text-primary">reset</button>
                </div>
                <div className="grid grid-cols-12 gap-1">
                  {EQ_BANDS.map((f, idx) => (
                    <div key={f} className="flex flex-col items-center gap-1">
                      <input
                        type="range" min={-18} max={18} step={0.5}
                        value={afx.eq[idx] ?? 0}
                        onChange={(e) => patchEq(idx, Number(e.target.value))}
                        onDoubleClick={() => patchEq(idx, 0)}
                        className="h-20 accent-[color:var(--primary)]"
                        style={{ writingMode: "vertical-lr", direction: "rtl", WebkitAppearance: "slider-vertical" } as React.CSSProperties}
                        title={`${f}Hz · ${(afx.eq[idx] ?? 0).toFixed(1)}dB`}
                      />
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {f >= 1000 ? `${(f/1000).toFixed(f%1000===0?0:1)}k` : f}
                      </span>
                      <span className="font-mono text-[9px] tabular-nums">{(afx.eq[idx] ?? 0) > 0 ? "+" : ""}{(afx.eq[idx] ?? 0).toFixed(0)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Reverb</div>
                  <div className="grid grid-cols-5 gap-1">
                    {(["none","room","hall","plate","cathedral"] as ReverbPreset[]).map(p => (
                      <button key={p} onClick={() => patchAfx({ reverbPreset: p, reverbMix: p === "none" ? 0 : Math.max(20, afx.reverbMix) })}
                        className={`rounded-md border px-1.5 py-1 text-[10px] capitalize ${afx.reverbPreset === p ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                        {p === "none" ? "off" : p}
                      </button>
                    ))}
                  </div>
                  <label className="mt-2 flex items-center gap-2">
                    <span className="w-12 text-muted-foreground">Mix</span>
                    <input type="range" min={0} max={100} step={1} value={afx.reverbMix}
                      onChange={(e) => patchAfx({ reverbMix: Number(e.target.value) })}
                      className="flex-1 accent-[color:var(--primary)]" />
                    <span className="w-9 text-right font-mono tabular-nums">{afx.reverbMix}%</span>
                  </label>
                </div>

                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Echo / Delay</div>
                  <label className="flex items-center gap-2">
                    <span className="w-12 text-muted-foreground">Mix</span>
                    <input type="range" min={0} max={100} step={1} value={afx.echoMix}
                      onChange={(e) => patchAfx({ echoMix: Number(e.target.value) })}
                      className="flex-1 accent-[color:var(--primary)]" />
                    <span className="w-9 text-right font-mono tabular-nums">{afx.echoMix}%</span>
                  </label>
                  <label className="mt-1 flex items-center gap-2">
                    <span className="w-12 text-muted-foreground">Delay</span>
                    <input type="range" min={10} max={2000} step={5} value={afx.echoDelay}
                      onChange={(e) => patchAfx({ echoDelay: Number(e.target.value) })}
                      className="flex-1 accent-[color:var(--primary)]" />
                    <span className="w-12 text-right font-mono tabular-nums">{afx.echoDelay}ms</span>
                  </label>
                  <label className="mt-1 flex items-center gap-2">
                    <span className="w-12 text-muted-foreground">Feedback</span>
                    <input type="range" min={0} max={95} step={1} value={afx.echoFeedback}
                      onChange={(e) => patchAfx({ echoFeedback: Number(e.target.value) })}
                      className="flex-1 accent-[color:var(--primary)]" />
                    <span className="w-9 text-right font-mono tabular-nums">{afx.echoFeedback}%</span>
                  </label>
                </div>

                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Ambiente</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(["none","room","hall","cave","outdoor","underwater"] as Ambience[]).map(a => (
                      <button key={a} onClick={() => patchAfx({ ambience: a })}
                        className={`rounded-md border px-1.5 py-1 text-[10px] capitalize ${afx.ambience === a ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                        {a === "none" ? "off" : a === "underwater" ? "submerso" : a === "outdoor" ? "ext." : a === "room" ? "sala" : a === "hall" ? "salão" : a === "cave" ? "caverna" : a}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Canais</div>
                  <div className="grid grid-cols-5 gap-1">
                    {(["stereo","mono","left","right","swap"] as ChannelMode[]).map(m => (
                      <button key={m} onClick={() => patchAfx({ channelMode: m })}
                        className={`rounded-md border px-1.5 py-1 text-[10px] capitalize ${afx.channelMode === m ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                        {m === "left" ? "L" : m === "right" ? "R" : m === "swap" ? "L↔R" : m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}


          {selected && selected.fx && (selected.kind === "image" || selected.kind === "video") && (() => {
            const fx = selected.fx;
            const patchFx = (patch: Partial<Fx>) =>
              setItems(p => p.map(i => i.id === selected.id && i.fx ? { ...i, fx: { ...i.fx, ...patch } } : i));
            const adj: { key: keyof Fx; label: string; min: number; max: number; suffix?: string }[] = [
              { key: "brightness", label: "Brilho", min: -100, max: 100 },
              { key: "contrast", label: "Contraste", min: -100, max: 100 },
              { key: "saturation", label: "Saturação", min: -100, max: 100 },
              { key: "temperature", label: "Temperatura", min: -100, max: 100 },
              { key: "sharpness", label: "Nitidez", min: 0, max: 100 },
              { key: "exposure", label: "Exposição", min: -100, max: 100 },
              { key: "shadows", label: "Sombras", min: -100, max: 100 },
              { key: "highlights", label: "Realces", min: -100, max: 100 },
              { key: "opacity", label: "Opacidade", min: 0, max: 100, suffix: "%" },
            ];
            return (
              <div className="space-y-2 rounded-md border border-border bg-card p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-primary" /> Efeitos e Ajustes
                  </div>
                  <button
                    onClick={() => setItems(p => p.map(i => i.id === selected.id && i.fx ? { ...i, fx: { ...DEFAULT_FX }, fadeIn: 0, fadeOut: 0 } : i))}
                    title="Restaurar Original"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground">
                    <RotateCcw className="h-3 w-3" /> Resetar
                  </button>
                </div>

                <details open className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Sliders className="h-3 w-3" /> Ajustes</summary>
                  <div className="space-y-1.5 px-2 pb-2 pt-1">
                    {adj.map(a => (
                      <label key={a.key} className="flex items-center gap-2" title="Duplo clique para restaurar padrão">
                        <span className="w-20 truncate text-muted-foreground">{a.label}</span>
                        <input type="range" min={a.min} max={a.max} step={1}
                          value={fx[a.key] as number}
                          onChange={(e) => patchFx({ [a.key]: Number(e.target.value) } as Partial<Fx>)}
                          onDoubleClick={() => patchFx({ [a.key]: FX_DEFAULT_VAL[a.key as string] ?? 0 } as Partial<Fx>)}
                          className="flex-1 accent-[color:var(--primary)]" />
                        <button type="button" onClick={() => patchFx({ [a.key]: FX_DEFAULT_VAL[a.key as string] ?? 0 } as Partial<Fx>)}
                          className="w-10 text-right font-mono tabular-nums hover:text-primary" title="Restaurar padrão">{fx[a.key] as number}{a.suffix ?? ""}</button>
                      </label>
                    ))}
                  </div>
                </details>

                <details className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Wand2 className="h-3 w-3" /> Efeitos Rápidos</summary>
                  <div className="grid grid-cols-2 gap-1 px-2 pb-2 pt-1">
                    <button onClick={() => patchFx({ preset: null })}
                      className={`rounded border px-1.5 py-1 text-[10px] ${fx.preset === null ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                      Nenhum
                    </button>
                    {QUICK_EFFECTS.map(q => (
                      <button key={q.id} onClick={() => patchFx({ preset: q.id })}
                        className={`rounded border px-1.5 py-1 text-[10px] ${fx.preset === q.id ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                </details>

                <details className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Palette className="h-3 w-3" /> Modo de Preenchimento</summary>
                  <div className="space-y-1.5 px-2 pb-2 pt-1">
                    <div className="grid grid-cols-2 gap-1">
                      {(["bars","blur","mirror","stretch","color"] as FillMode[]).map(m => (
                        <button key={m} onClick={() => patchFx(m === "blur" ? { fillMode: m, blurBg: fx.fillMode === "blur" ? fx.blurBg : 30 } : { fillMode: m })}
                          className={`rounded border px-1.5 py-1 text-[10px] ${fx.fillMode === m ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                          {m === "bars" ? "Barras Pretas" : m === "blur" ? "Fundo Desfocado" : m === "mirror" ? "Espelhado" : m === "stretch" ? "Esticado" : "Cor"}
                        </button>
                      ))}
                    </div>
                    {fx.fillMode === "blur" && (
                      <label className="flex items-center gap-2" title="Role o mouse para ajustar · duplo clique para zerar"
                        onWheel={(e) => {
                          e.preventDefault();
                          const step = e.shiftKey ? 5 : 1;
                          const next = Math.max(0, Math.min(100, fx.blurBg + (e.deltaY < 0 ? step : -step)));
                          patchFx({ blurBg: next });
                        }}>
                        <span className="w-20 text-muted-foreground">Blur</span>
                        <input type="range" min={0} max={100} step={1} value={fx.blurBg}
                          onChange={(e) => patchFx({ blurBg: Number(e.target.value) })}
                          onDoubleClick={() => patchFx({ blurBg: 0 })}
                          className="flex-1 accent-[color:var(--primary)]" />
                        <button type="button" onClick={() => patchFx({ blurBg: 0 })}
                          className="w-10 text-right font-mono tabular-nums hover:text-primary">{fx.blurBg}</button>
                      </label>
                    )}
                    {fx.fillMode === "color" && (
                      <label className="flex items-center gap-2">
                        <span className="w-20 text-muted-foreground">Cor</span>
                        <input type="color" value={fx.bgColor}
                          onChange={(e) => patchFx({ bgColor: e.target.value })}
                          className="h-7 w-12 rounded border border-border bg-background" />
                      </label>
                    )}
                  </div>
                </details>

                <details className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vinheta</summary>
                  <div className="space-y-1.5 px-2 pb-2 pt-1">
                    <div className="grid grid-cols-2 gap-1">
                      {(["dark","light"] as VignetteMode[]).map(m => (
                        <button key={m} onClick={() => patchFx({ vignetteMode: m })}
                          className={`rounded border px-1.5 py-1 text-[10px] ${fx.vignetteMode === m ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                          {m === "dark" ? "Escura" : "Clara"}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2" title="Duplo clique para zerar">
                      <span className="w-20 text-muted-foreground">Intensidade</span>
                      <input type="range" min={0} max={100} step={1} value={fx.vignette}
                        onChange={(e) => patchFx({ vignette: Number(e.target.value) })}
                        onDoubleClick={() => patchFx({ vignette: 0 })}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <button type="button" onClick={() => patchFx({ vignette: 0 })}
                        className="w-10 text-right font-mono tabular-nums hover:text-primary">{fx.vignette}</button>
                    </label>
                    <label className="flex items-center gap-2" title="Duplo clique para padrão">
                      <span className="w-20 text-muted-foreground">Tamanho</span>
                      <input type="range" min={0} max={100} step={1} value={fx.vignetteSize}
                        onChange={(e) => patchFx({ vignetteSize: Number(e.target.value) })}
                        onDoubleClick={() => patchFx({ vignetteSize: 50 })}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <button type="button" onClick={() => patchFx({ vignetteSize: 50 })}
                        className="w-10 text-right font-mono tabular-nums hover:text-primary">{fx.vignetteSize}</button>
                    </label>
                  </div>
                </details>



                <details className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entrada / Saída</summary>
                  <div className="space-y-1.5 px-2 pb-2 pt-1">
                    <div className="grid grid-cols-3 gap-1">
                      <button onClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: 1, fadeOut: 0 } : i))}
                        className="rounded border border-border px-1.5 py-1 text-[10px] hover:border-ring/50">Fade In</button>
                      <button onClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: 0, fadeOut: 1 } : i))}
                        className="rounded border border-border px-1.5 py-1 text-[10px] hover:border-ring/50">Fade Out</button>
                      <button onClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: 1, fadeOut: 1 } : i))}
                        className="rounded border border-border px-1.5 py-1 text-[10px] hover:border-ring/50">In + Out</button>
                    </div>
                    <label className="flex items-center gap-2">
                      <span className="w-14 text-muted-foreground">Fade In</span>
                      <input type="range" min={0} max={5} step={0.1} value={selected.fadeIn ?? 0}
                        onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: Number(e.target.value) } : i))}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <span className="w-10 text-right font-mono tabular-nums">{(selected.fadeIn ?? 0).toFixed(1)}s</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="w-14 text-muted-foreground">Fade Out</span>
                      <input type="range" min={0} max={5} step={0.1} value={selected.fadeOut ?? 0}
                        onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeOut: Number(e.target.value) } : i))}
                        className="flex-1 accent-[color:var(--primary)]" />
                      <span className="w-10 text-right font-mono tabular-nums">{(selected.fadeOut ?? 0).toFixed(1)}s</span>
                    </label>
                  </div>
                </details>

                <details className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Zoom Cinematográfico</summary>
                  <div className="space-y-1.5 px-2 pb-2 pt-1">
                    <div className="grid grid-cols-3 gap-1">
                      <button onClick={() => patchFx({ zoom: null })}
                        className={`rounded border px-1.5 py-1 text-[10px] ${!fx.zoom ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>Off</button>
                      <button onClick={() => patchFx({ zoom: { dir: "in", speed: fx.zoom?.speed ?? "med" } })}
                        className={`rounded border px-1.5 py-1 text-[10px] ${fx.zoom?.dir === "in" ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>Aproximar</button>
                      <button onClick={() => patchFx({ zoom: { dir: "out", speed: fx.zoom?.speed ?? "med" } })}
                        className={`rounded border px-1.5 py-1 text-[10px] ${fx.zoom?.dir === "out" ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>Afastar</button>
                    </div>
                    {(() => {
                      const zoomFx = fx.zoom;
                      if (!zoomFx) return null;
                      return (
                        <div className="grid grid-cols-3 gap-1">
                          {(["slow","med","fast"] as const).map(s => (
                            <button key={s} onClick={() => patchFx({ zoom: { dir: zoomFx.dir, speed: s } })}
                              className={`rounded border px-1.5 py-1 text-[10px] ${zoomFx.speed === s ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                              {s === "slow" ? "Lenta" : s === "med" ? "Média" : "Rápida"}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </details>

                <details className="rounded border border-border/60 bg-background/40">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Presets</summary>
                  <div className="grid grid-cols-2 gap-1 px-2 pb-2 pt-1">
                    {PRESETS.map(p => (
                      <button key={p.id}
                        onClick={() => setItems(prev => prev.map(i => i.id === selected.id && i.fx ? { ...i, fx: { ...DEFAULT_FX, ...p.patch } } : i))}
                        className="rounded border border-border px-1.5 py-1 text-[10px] hover:border-primary hover:text-primary">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </details>

                <button
                  onClick={() => setItems(p => p.map(i => i.id === selected.id && i.fx ? { ...i, fx: { ...DEFAULT_FX }, fadeIn: 0, fadeOut: 0 } : i))}
                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded border border-border bg-background py-1.5 text-[11px] hover:border-destructive hover:text-destructive">
                  <RotateCcw className="h-3 w-3" /> Restaurar Original
                </button>
              </div>
            );
          })()}
        </aside>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover py-1 text-xs text-popover-foreground shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button onClick={() => { if (ctxMenu.clipId) copyClip(ctxMenu.clipId); setCtxMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent"><CopyIcon className="h-3.5 w-3.5" /> Copiar <span className="ml-auto text-muted-foreground">Ctrl+C</span></button>
          <button onClick={() => { pasteClip(); setCtxMenu(null); }} disabled={!clipboardRef.current}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent disabled:opacity-40"><ClipboardPaste className="h-3.5 w-3.5" /> Colar <span className="ml-auto text-muted-foreground">Ctrl+V</span></button>
          <button onClick={() => { if (ctxMenu.clipId) splitAt(playhead, ctxMenu.clipId); setCtxMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent"><Scissors className="h-3.5 w-3.5" /> Dividir na agulha <span className="ml-auto text-muted-foreground">S</span></button>
          <div className="my-1 h-px bg-border" />
          <button onClick={() => { if (ctxMenu.clipId) deleteItem(ctxMenu.clipId); setCtxMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-destructive hover:bg-accent"><Trash2 className="h-3.5 w-3.5" /> Excluir <span className="ml-auto text-muted-foreground">Del</span></button>
        </div>
      )}

      {mediaCtx && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-popover py-1 text-xs text-popover-foreground shadow-xl"
          style={{ left: mediaCtx.x, top: mediaCtx.y }}
        >
          <button onClick={() => { removeMedia(mediaCtx.mediaId); setMediaCtx(null); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-destructive hover:bg-accent"><Trash2 className="h-3.5 w-3.5" /> Excluir mídia</button>
        </div>
      )}

      {/* Export Settings Dialog */}
      {showExportSettings && !exporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowExportSettings(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2"><SettingsIcon className="h-5 w-5" /> Configurações de Exportação</h3>
              <button onClick={() => setShowExportSettings(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preset</label>
                <select value={exportPreset} onChange={(e) => applyExportPreset(e.target.value as ExportPresetKey)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  {(Object.keys(EXPORT_PRESETS) as ExportPresetKey[]).map(k => (
                    <option key={k} value={k}>{EXPORT_PRESETS[k].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome do arquivo</label>
                <div className="mt-1 flex items-center rounded-md border border-border bg-background">
                  <input value={exportFileName} onChange={(e) => setExportFileName(e.target.value.replace(/[\\/:*?"<>|\r\n\t]+/g, "").slice(0, 64))}
                    className="w-full bg-transparent px-2 py-1.5 text-sm outline-none" placeholder="meu video" />

                  <span className="px-2 text-xs text-muted-foreground">.mp4</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resolução</label>
                <select value={quality} onChange={(e) => { setQuality(e.target.value as Quality); setExportPreset("custom"); }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="720">720p</option><option value="1080">1080p</option><option value="2160">4K (2160p)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">FPS</label>
                <select value={exportFps} onChange={(e) => { setExportFps(Number(e.target.value)); setExportPreset("custom"); }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  {[24, 25, 30, 50, 60].map(f => <option key={f} value={f}>{f} fps</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modo de velocidade</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {([
                    { k: "turbo", label: "Turbo", hint: "Máxima velocidade · qualidade menor" },
                    { k: "rapido", label: "Rápido", hint: "Equilíbrio recomendado" },
                    { k: "qualidade", label: "Qualidade", hint: "Mais lento, melhor imagem" },
                  ] as const).map(o => (
                    <button key={o.k} onClick={() => setSpeedMode(o.k)} title={o.hint}
                      className={`rounded-md border px-3 py-1.5 text-xs ${speedMode === o.k ? "border-primary bg-primary/15 text-primary" : "border-border bg-background hover:border-ring/50"}`}>
                      {o.label}
                    </button>
                  ))}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {speedMode === "turbo" ? "~2-3× mais rápido" : speedMode === "rapido" ? "~1.5× mais rápido" : "Melhor qualidade"}
                  </span>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Motor de exportação</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {([
                    { k: "auto", label: "Automático", hint: "Usa hardware quando disponível, senão WASM" },
                    { k: "webcodecs", label: "WebCodecs (Hardware)", hint: "NVENC/QuickSync/VideoToolbox · até 20× mais rápido" },
                    { k: "wasm", label: "FFmpeg WASM (Software)", hint: "Compatível com todos os navegadores" },
                  ] as const).map(o => {
                    const disabled = o.k === "webcodecs" && webcodecsAvailable === false;
                    return (
                      <button key={o.k} onClick={() => setExportEngine(o.k)} title={o.hint} disabled={disabled}
                        className={`rounded-md border px-3 py-1.5 text-xs ${exportEngine === o.k ? "border-primary bg-primary/15 text-primary" : "border-border bg-background hover:border-ring/50"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                        {o.label}
                      </button>
                    );
                  })}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {webcodecsAvailable === null ? "Detectando suporte..." :
                      webcodecsAvailable ? `WebCodecs disponível${webcodecsProbeInfo ? ` · ${webcodecsProbeInfo}` : ""}` :
                      `WebCodecs indisponível${webcodecsProbeInfo ? ` · ${webcodecsProbeInfo}` : ""}`}
                  </span>
                </div>
              </div>



              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Codec de vídeo</label>
                <select value={exportCodec} onChange={(e) => setExportCodec(e.target.value as Codec)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="h264">H.264 (Recomendado)</option>
                  <option value="h265">H.265 / HEVC — indisponível no WASM</option>
                  <option value="vp9">VP9 — indisponível no WASM</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Áudio</label>
                <select value={audioBitrate} onChange={(e) => { setAudioBitrate(Number(e.target.value) as AudioBitrate); setExportPreset("custom"); }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  {[128, 192, 256, 320].map(b => <option key={b} value={b}>{b} kbps · AAC</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bitrate de vídeo</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {(["low", "medium", "high", "custom"] as BitrateMode[]).map(m => (
                    <button key={m} onClick={() => { setBitrateMode(m); setExportPreset("custom"); }}
                      className={`rounded-md border px-3 py-1.5 text-xs ${bitrateMode === m ? "border-primary bg-primary/15 text-primary" : "border-border bg-background hover:border-ring/50"}`}>
                      {m === "low" ? "Baixo" : m === "medium" ? "Médio" : m === "high" ? "Alto" : "Personalizado"}
                    </button>
                  ))}
                  {bitrateMode === "custom" && (
                    <div className="flex items-center gap-1 text-xs">
                      <input type="number" min={200} max={80000} value={customBitrate}
                        onChange={(e) => setCustomBitrate(Math.max(200, Number(e.target.value) || 200))}
                        className="w-24 rounded border border-border bg-background px-2 py-1" />
                      <span className="text-muted-foreground">kbps</span>
                    </div>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    Efetivo: <span className="font-mono text-foreground">{computedVBitrate} kbps</span>
                  </span>
                </div>
              </div>

              <div className="md:col-span-2 rounded-md border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tamanho estimado</span>
                  <span className="font-mono text-base font-semibold">{estimatedMB.toFixed(1)} MB</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Duração {fmt(totalDuration)} · {computedVBitrate} kbps vídeo + {audioBitrate} kbps áudio
                </div>
              </div>

              <div className="md:col-span-2 rounded-md border border-border bg-background/60 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} />
                  <Cpu className="h-4 w-4" /> Usar aceleração por hardware (GPU)
                </label>
                <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Detectado: <span className="text-foreground">{(gpuInfoRef.current?.vendor) ?? "GPU não detectada"}</span>. O FFmpeg WASM roda no navegador e não acessa NVENC/QSV/VCE — o encode será feito em CPU automaticamente.</span>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ao concluir</label>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={postAutoDownload} onChange={(e) => setPostAutoDownload(e.target.checked)} /> Baixar vídeo automaticamente</label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={postPlay} onChange={(e) => setPostPlay(e.target.checked)} /> Reproduzir prévia</label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={postBeep} onChange={(e) => setPostBeep(e.target.checked)} /> Emitir som de aviso</label>
                </div>
              </div>

              {exportHistory.length > 0 && (
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exportações recentes</label>
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-background/60">
                    {exportHistory.map((h, idx) => (
                      <div key={idx} className="flex items-center justify-between border-b border-border/50 px-2 py-1.5 text-xs last:border-b-0">
                        <span className="truncate">{h.name}</span>
                        <span className="ml-2 shrink-0 text-muted-foreground">{h.sizeMB.toFixed(1)} MB</span>
                        <a href={h.url} download={h.name} className="ml-2 shrink-0 text-primary hover:underline"><Download className="inline h-3 w-3" /></a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>


            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setShowExportSettings(false)}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
              <button
                onClick={() => { setShowExportSettings(false); void doExport(); }}
                disabled={!items.length || exporting}
                className="glow-primary inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {ffLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {ffLoading ? "Carregando FFmpeg" : ffLoadError ? "Tentar novamente" : "Iniciar exportação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export progress / result / error */}
      {(exporting || exportUrl || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{exportUrl ? "Exportação concluída" : exporting ? "Exportando..." : "Atenção"}</h3>
              {!exporting && (
                <button onClick={() => { setExportUrl(null); setError(null); setExportPct(0); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              )}
            </div>

            {error && (
              <>
                <p className="mt-3 whitespace-pre-wrap text-sm text-destructive">{error}</p>
                <div className="mt-4 flex gap-2">
                  {lastExportSettingsRef.current && (
                    <button
                      onClick={() => { setError(null); lastExportSettingsRef.current?.(); }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                      <RefreshCw className="h-4 w-4" /> Tentar novamente
                    </button>
                  )}
                  <button onClick={() => setShowExportLog(s => !s)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-muted/70">
                    <FileText className="h-4 w-4" /> Log
                  </button>
                </div>
              </>
            )}

            {exporting && (<>
              <p className="mt-3 text-xs text-muted-foreground">{exportMsg}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(exportPct * 100)}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                <div><div className="text-foreground font-mono text-sm">{Math.round(exportPct * 100)}%</div>progresso</div>
                <div><div className="text-foreground font-mono text-sm">{fmtClock(exportElapsed)}</div>decorrido</div>
                <div><div className="text-foreground font-mono text-sm">{exportPct > 0.02 ? fmtClock((exportElapsed / exportPct) - exportElapsed) : "—"}</div>restante</div>
                <div><div className="text-foreground font-mono text-sm">{exportFpsLive ? `${exportFpsLive.toFixed(0)} fps` : "—"}{exportSpeed ? ` · ${exportSpeed.toFixed(1)}x` : ""}</div>velocidade</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    try { const ff = await getFFmpeg(); ff.terminate(); } catch {}
                    resetFFmpeg();
                    setFfReady(false);
                    void getFFmpeg().then(() => setFfReady(true)).catch((err) => console.error("FFmpeg não recarregou após cancelar.", err));
                    setExporting(false); setExportPct(0); setExportMsg("");
                    setExportLog(prev => [...prev, "Processo encerrado."]);
                    console.warn("[EXPORT] Processo encerrado pelo usuário.");
                    setError("Exportação cancelada — processo FFmpeg encerrado.");
                    if (exportElapsedTimerRef.current) { window.clearInterval(exportElapsedTimerRef.current); exportElapsedTimerRef.current = null; }
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/70"
                >
                  Cancelar
                </button>
                <button onClick={() => setShowExportLog(s => !s)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-muted/70">
                  <FileText className="h-4 w-4" /> Log
                </button>
              </div>
            </>)}

            {exportUrl && (<>
              <video src={exportUrl} controls className="mt-4 w-full rounded-md" />
              <div className="mt-2 text-xs text-muted-foreground">Tempo total: <span className="font-mono text-foreground">{fmtClock(exportElapsed)}</span></div>
              <a href={exportUrl} download={`${exportFileName || "video"}.mp4`}
                className="glow-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Download className="h-4 w-4" /> Baixar {exportFileName || "video"}.mp4
              </a>
              <button onClick={() => setShowExportLog(s => !s)}
                className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-xs hover:bg-muted/70">
                <FileText className="h-3.5 w-3.5" /> {showExportLog ? "Ocultar" : "Ver"} log técnico
              </button>
            </>)}

            {showExportLog && (
              <>
                <div className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-black/80 p-2 font-mono text-[10px] leading-snug text-green-300">
                  {exportFfCmd && <div className="mb-2 break-all text-amber-300">$ {exportFfCmd}</div>}
                  {exportLog.length === 0 ? <div className="text-muted-foreground">Sem entradas.</div> :
                    exportLog.slice(-200).map((l, i) => <div key={i} className="break-all">{l}</div>)}
                </div>
                <button onClick={downloadExportLog}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-muted px-3 py-1.5 text-[11px] hover:bg-muted/70">
                  <Download className="h-3 w-3" /> Baixar export.log
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
