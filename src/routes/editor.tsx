import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Film, Plus, Scissors, Trash2, Play, Pause, Square, Download, ArrowLeft,
  Loader2, X, Volume2, VolumeX, ZoomIn, ZoomOut, Type as TypeIcon, Music2,
  Image as ImageIcon, Video as VideoIcon, RotateCw, Maximize2, AlignCenter,
  Lock, Unlock, Undo2, Redo2, Check, Copy as CopyIcon, ClipboardPaste,
  Sparkles, Sliders, Wand2, RotateCcw, Palette, Mic, MicOff,
  Settings as SettingsIcon, FileText, RefreshCw, Cpu, Info, Magnet,
} from "lucide-react";
import {
  DEFAULT_AUDIO_FX as DEFAULT_AUDIO_FX_REF,
  EQ_BANDS,
  buildAudioFxGraph,
  type AudioFx,
  type AudioFxNodes,
  type ReverbPreset,
  type Ambience,
  type ChannelMode,
  type VoicePreset,
} from "@/lib/audio-fx";
import { computeItemBounds } from "@/lib/scene-geometry";
import { PreviewCanvas } from "@/components/editor/PreviewCanvas";
import { Waveform } from "@/components/editor/Waveform";
import { VideoFilmstrip } from "@/components/editor/VideoFilmstrip";
import type { SceneItem } from "@/lib/scene-renderer";
import type { CachedMediaItem } from "@/lib/media-cache";

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
  blur: number;
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
  audioFadeIn?: number;
  audioFadeOut?: number;
  transition?: string;
  gainDb?: number;
  audioFx?: AudioFx;
  fx?: Fx;
  /** Vídeo silenciado (áudio foi separado em uma trilha de áudio paralela). */
  silenced?: boolean;
};

type Track = { id: string; kind: TrackKind; label: string };

const trackNumber = (track: Track) => {
  const n = parseInt(track.id.slice(1), 10);
  return Number.isFinite(n) ? n : 0;
};

const orderTracksFromCenter = (tracks: Track[]) => {
  const videos = tracks.filter(t => t.kind === "video").sort((a, b) => trackNumber(b) - trackNumber(a));
  const audios = tracks.filter(t => t.kind === "audio").sort((a, b) => trackNumber(a) - trackNumber(b));
  return [...videos, ...audios];
};

const sameTrackOrder = (a: Track[], b: Track[]) =>
  a.length === b.length && a.every((track, index) => track.id === b[index]?.id);

const nextTrackIdFrom = (trackId: string, kind: TrackKind) => {
  const n = parseInt(trackId.slice(1), 10);
  const prefix = kind === "video" ? "V" : "A";
  return `${prefix}${Number.isFinite(n) ? n + 1 : 1}`;
};

type AspectKey = "16:9" | "9:16" | "1:1" | "4:3" | "custom";
const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  "16:9": { w: 16, h: 9, label: "16:9 · YouTube" },
  "9:16": { w: 9, h: 16, label: "9:16 · TikTok/Reels" },
  "1:1":  { w: 1, h: 1, label: "1:1 · Instagram" },
  "4:3":  { w: 4, h: 3, label: "4:3 · Clássico" },
  "custom": { w: 16, h: 9, label: "Personalizado" },
};

const INITIAL_TRACKS: Track[] = [
  { id: "V2", kind: "video", label: "V2 · Vídeo" },
  { id: "V1", kind: "video", label: "V1 · Vídeo" },
  { id: "A1", kind: "audio", label: "A1 · Áudio" },
  { id: "A2", kind: "audio", label: "A2 · Áudio" },
];
const IMAGE_MAX_DUR = 3600;

type Quality = "720" | "1080" | "2160";
const QUALITY_HEIGHT: Record<Quality, number> = { "720": 720, "1080": 1080, "2160": 2160 };

function computeExportSize(q: Quality, ar: { w: number; h: number }) {
  const base = QUALITY_HEIGHT[q];
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (ar.w >= ar.h) return { targetW: even((base * ar.w) / ar.h), targetH: even(base) };
  return { targetW: even(base), targetH: even((base * ar.h) / ar.w) };
}

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
function formatFadeLabel(sec: number): string {
  if (!sec || sec < 0.0005) return "0 ms";
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  if (sec < 10) return `${sec.toFixed(2)} s`;
  return `${sec.toFixed(1)} s`;
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

function MasterFader({ label, db, setDb, peak, clip, onClearClip }: {
  label: string; db: number; setDb: (v: number) => void;
  peak: number; clip: boolean; onClearClip: () => void;
}) {
  const minDb = -60, maxDb = 12;
  const trackRef = useRef<HTMLDivElement>(null);
  const onPointer = (e: React.PointerEvent) => {
    const el = trackRef.current; if (!el) return;
    el.setPointerCapture(e.pointerId);
    const update = (clientY: number) => {
      const r = el.getBoundingClientRect();
      const pct = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
      const val = minDb + pct * (maxDb - minDb);
      const snapped = Math.abs(val) < 0.6 ? 0 : Math.round(val * 2) / 2;
      setDb(snapped);
    };
    update(e.clientY);
    const move = (ev: PointerEvent) => update(ev.clientY);
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const knobPct = 1 - (db - minDb) / (maxDb - minDb);
  const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -80;
  const meterPct = Math.max(0, Math.min(1, (peakDb - minDb) / (maxDb - minDb)));
  const labelColor = db > 6 ? "text-red-400" : db > 0 ? "text-yellow-300" : "text-emerald-400";
  // Zero-dB tick position (in %)
  const zeroPct = 1 - (0 - minDb) / (maxDb - minDb);
  const dbTicks = [12, 6, 0, -6, -12, -30, -60];
  const tickTop = (tick: number) => `${(1 - (tick - minDb) / (maxDb - minDb)) * 100}%`;
  const peakDbLabel = peak > 0.00001 ? `${peakDb >= 0 ? "+" : ""}${peakDb.toFixed(1)}` : "-∞";
  return (
    <div className="flex h-full flex-col items-center gap-1 select-none">
      <button
        onClick={onClearClip}
        title={clip ? "Clipping detectado — clique para limpar" : "Sem clipping"}
        className={`h-2.5 w-5 shrink-0 rounded-sm transition ${clip ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" : "bg-zinc-700"}`}
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-1">
        <div className="relative w-9 shrink-0 font-mono text-[11px] leading-none font-semibold tabular-nums text-muted-foreground">
          {dbTicks.map(tick => (
            <div key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: tickTop(tick) }}>
              {tick > 0 ? `+${tick}` : tick}
            </div>
          ))}
        </div>
        {/* Meter */}
        <div className="relative w-2.5 overflow-hidden rounded bg-zinc-900 ring-1 ring-zinc-800">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-75"
            style={{
              height: `${meterPct * 100}%`,
              background: "linear-gradient(to top, #22c55e 0%, #22c55e 55%, #eab308 75%, #ef4444 92%)",
            }}
          />
          {/* 0dB tick */}
          <div className="pointer-events-none absolute inset-x-0 h-px bg-white/40" style={{ top: `${zeroPct * 100}%` }} />
        </div>
        {/* Fader */}
        <div
          ref={trackRef}
          onPointerDown={onPointer}
          onDoubleClick={() => setDb(0)}
          title={`${label}: ${db > 0 ? "+" : ""}${db.toFixed(1)} dB (duplo clique = 0)`}
          className="relative w-5 cursor-ns-resize rounded bg-zinc-900 ring-1 ring-zinc-800"
        >
          <div className="absolute inset-x-1 top-0 bottom-0 rounded bg-gradient-to-b from-red-500/40 via-yellow-400/20 to-emerald-500/10" />
          <div className="pointer-events-none absolute inset-x-0 h-px bg-white/30" style={{ top: `${zeroPct * 100}%` }} />
          <div
            className={`absolute left-1/2 h-2.5 w-5 -translate-x-1/2 rounded-sm shadow ring-1 ring-black/50 ${db > 6 ? "bg-red-500" : db > 0 ? "bg-yellow-400" : "bg-zinc-200"}`}
            style={{ top: `calc(${knobPct * 100}% - 5px)` }}
          />
        </div>
      </div>
      <div className={`shrink-0 font-mono text-[12px] font-semibold tabular-nums ${labelColor}`}>
        {db > 0 ? "+" : ""}{db.toFixed(1)}
      </div>
      <div className="shrink-0 font-mono text-[10px] text-muted-foreground">pk {peakDbLabel}</div>
      <div className="shrink-0 text-[12px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}

function ChannelMeter({ peak, label }: { peak: number; label: string }) {
  const minDb = -60, maxDb = 0;
  const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -80;
  const meterPct = Math.max(0, Math.min(1, (peakDb - minDb) / (maxDb - minDb)));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[7px] font-bold text-muted-foreground uppercase leading-none">
        <span>{label}</span>
      </div>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-900 ring-1 ring-white/5">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-75"
          style={{
            width: `${meterPct * 100}%`,
            background: "linear-gradient(to right, #22c55e 0%, #22c55e 70%, #eab308 85%, #ef4444 100%)",
          }}
        />
      </div>
    </div>
  );
}

const DEFAULT_FX: Fx = {
  brightness: 0, contrast: 0, saturation: 0, temperature: 0,
  sharpness: 0, exposure: 0, shadows: 0, highlights: 0, blur: 0,
  opacity: 100, preset: null, blurBg: 30, fillMode: "bars",
  bgColor: "#000000", zoom: null,
  vignette: 0, vignetteSize: 50, vignetteMode: "dark",
};

const FX_DEFAULT_VAL: Record<string, number> = {
  brightness: 0, contrast: 0, saturation: 0, temperature: 0,
  sharpness: 0, exposure: 0, shadows: 0, highlights: 0, blur: 0, opacity: 100,
};

type LeftPanel = "media" | "titles" | "transitions" | "effects";
type TimelineEffectId = "blur" | "background-blur";
const EFFECT_DND_TYPE = "application/x-vle-effect";
const TIMELINE_EFFECTS: Array<{ id: TimelineEffectId; label: string; hint: string }> = [
  { id: "blur", label: "Blur", hint: "Desfoque visual do clipe" },
  { id: "background-blur", label: "Fundo desfocado", hint: "Preenche laterais com fundo borrado" },
];

type TransitionPreset = { id: string; label: string; hint: string; dur: number; icon: string };
const TRANSITION_GROUPS: Array<{ label: string; items: TransitionPreset[] }> = [
  {
    label: "Fade / Dissolve",
    items: [
      { id: "fade", label: "Fade", hint: "Fade in/out suave", dur: 0.6, icon: "◐" },
      { id: "cross-dissolve", label: "Cross Dissolve", hint: "Dissolve cruzada entre clipes", dur: 0.8, icon: "✕" },
      { id: "fade-black", label: "Fade to Black", hint: "Escurece até preto", dur: 0.8, icon: "■" },
      { id: "fade-white", label: "Fade to White", hint: "Clareia até branco", dur: 0.8, icon: "□" },
      { id: "dip-color", label: "Dip to Color", hint: "Mergulha em cor sólida", dur: 0.8, icon: "◆" },
      { id: "film-dissolve", label: "Film Dissolve", hint: "Dissolve fílmica suave", dur: 1.0, icon: "❍" },
    ],
  },
  {
    label: "Movimento",
    items: [
      { id: "slide-left", label: "Slide Esquerda", hint: "Desliza para a esquerda", dur: 0.5, icon: "⇠" },
      { id: "slide-right", label: "Slide Direita", hint: "Desliza para a direita", dur: 0.5, icon: "⇢" },
      { id: "slide-up", label: "Slide Cima", hint: "Desliza para cima", dur: 0.5, icon: "⇡" },
      { id: "slide-down", label: "Slide Baixo", hint: "Desliza para baixo", dur: 0.5, icon: "⇣" },
      { id: "push-left", label: "Push Esquerda", hint: "Empurra o clipe anterior", dur: 0.5, icon: "⇇" },
      { id: "push-right", label: "Push Direita", hint: "Empurra o clipe anterior", dur: 0.5, icon: "⇉" },
      { id: "whip-pan", label: "Whip Pan", hint: "Movimento rápido com borrão", dur: 0.4, icon: "⌇" },
    ],
  },
  {
    label: "Wipe",
    items: [
      { id: "wipe-left", label: "Wipe Esquerda", hint: "Revela da direita p/ esquerda", dur: 0.5, icon: "◧" },
      { id: "wipe-right", label: "Wipe Direita", hint: "Revela da esquerda p/ direita", dur: 0.5, icon: "◨" },
      { id: "wipe-up", label: "Wipe Cima", hint: "Revela de baixo p/ cima", dur: 0.5, icon: "⬒" },
      { id: "wipe-down", label: "Wipe Baixo", hint: "Revela de cima p/ baixo", dur: 0.5, icon: "⬓" },
      { id: "wipe-clock", label: "Wipe Radial", hint: "Revela em sentido horário", dur: 0.7, icon: "◴" },
      { id: "wipe-diagonal", label: "Wipe Diagonal", hint: "Revela na diagonal", dur: 0.6, icon: "◰" },
    ],
  },
  {
    label: "Iris / Forma",
    items: [
      { id: "iris-in", label: "Iris In", hint: "Círculo abrindo", dur: 0.6, icon: "○" },
      { id: "iris-out", label: "Iris Out", hint: "Círculo fechando", dur: 0.6, icon: "●" },
      { id: "circle-open", label: "Circle Open", hint: "Abertura circular", dur: 0.6, icon: "◯" },
      { id: "circle-close", label: "Circle Close", hint: "Fechamento circular", dur: 0.6, icon: "⬤" },
    ],
  },
  {
    label: "Zoom / Escala",
    items: [
      { id: "zoom-in", label: "Zoom In", hint: "Aproxima o clipe", dur: 0.5, icon: "⊕" },
      { id: "zoom-out", label: "Zoom Out", hint: "Afasta o clipe", dur: 0.5, icon: "⊖" },
      { id: "zoom-blur", label: "Zoom Blur", hint: "Zoom com desfoque", dur: 0.6, icon: "❂" },
      { id: "spin", label: "Spin", hint: "Rotação rápida", dur: 0.5, icon: "↻" },
    ],
  },
  {
    label: "Estilo",
    items: [
      { id: "blur-trans", label: "Blur", hint: "Transição com desfoque", dur: 0.6, icon: "❄" },
      { id: "glitch", label: "Glitch", hint: "Distorção digital", dur: 0.4, icon: "⚡" },
      { id: "light-leak", label: "Light Leak", hint: "Vazamento de luz", dur: 0.7, icon: "✺" },
      { id: "film-burn", label: "Film Burn", hint: "Queima de película", dur: 0.7, icon: "✷" },
      { id: "luma-fade", label: "Luma Fade", hint: "Fade por luminância", dur: 0.6, icon: "☼" },
      { id: "pixelate", label: "Pixelate", hint: "Pixeliza a transição", dur: 0.5, icon: "▦" },
    ],
  },
];

const ALL_TRANSITIONS: TransitionPreset[] = TRANSITION_GROUPS.flatMap(g => g.items);
const getTransitionById = (id?: string): TransitionPreset | undefined =>
  id ? ALL_TRANSITIONS.find(t => t.id === id) : undefined;



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
  if (fx.blur > 0) parts.push(`blur(${Math.max(0.2, fx.blur * 0.45).toFixed(1)}px)`);
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
  // Forte e perceptível: 1 -> ~0.6px, 50 -> ~18px, 100 -> ~64px.
  const n = fx.blurBg / 100;
  return Math.max(0.6, +(n * n * 56 + n * 8).toFixed(2));
}

function mainObjectFit(fx?: Fx): React.CSSProperties["objectFit"] {
  return fx?.fillMode === "stretch" ? "fill" : "contain";
}

function backgroundFillStyle(fx: Fx): React.CSSProperties {
  const isBlur = fx.fillMode === "blur";
  const blurPx = blurCssPx(fx);
  const coverScale = isBlur ? 1.08 + Math.min(0.24, blurPx / 260) : 1.04;
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transformOrigin: "center",
    transform: `${fx.fillMode === "mirror" ? "scaleX(-1) " : ""}scale(${coverScale})`,
    filter: isBlur ? `blur(${blurPx}px)` : undefined,
    willChange: isBlur ? "filter, transform" : "transform",
    zIndex: 0,
  };
}

function ffmpegColor(hex: string | undefined) {
  const safe = (hex ?? "#000000").replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(safe) ? `0x${safe}` : "black";
}

function exportBlurScale(targetH: number) {
  return Math.max(1, Math.min(6, targetH / 360));
}

function blurSigma(fx: Fx | undefined, targetH: number) {
  const v = fx?.blurBg ?? 30;
  // Mantém a exportação com a mesma intensidade visual do preview.
  const n = v / 100;
  return Math.max(0.3, Math.min(160, +((n * n * 56 + n * 8) * exportBlurScale(targetH)).toFixed(2)));
}

function visualBlurSigma(fx: Fx | undefined, targetH: number) {
  const v = Math.max(0, Math.min(100, fx?.blur ?? 0));
  return v <= 0 ? 0 : Math.max(0.2, Math.min(120, +(v * 0.45 * exportBlurScale(targetH)).toFixed(2)));
}

function exportVideoFilter(c: TLItem, targetW: number, targetH: number) {
  const fx = c.fx;
  const visualBlur = visualBlurSigma(fx, targetH);
  const fgFx = visualBlur > 0 ? `,gblur=sigma=${visualBlur.toFixed(1)}:steps=1` : "";
  if (!fx || fx.fillMode === "bars") {
    return { type: "vf" as const, value: `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black${fgFx},fps=30,setsar=1` };
  }
  if (fx.fillMode === "color") {
    return { type: "vf" as const, value: `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=${ffmpegColor(fx.bgColor)}${fgFx},fps=30,setsar=1` };
  }
  if (fx.fillMode === "stretch") {
    return { type: "vf" as const, value: `scale=${targetW}:${targetH}${fgFx},fps=30,setsar=1` };
  }
  const bgCore = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
  const bgFx = fx.fillMode === "blur"
    ? `${bgCore},gblur=sigma=${blurSigma(fx, targetH).toFixed(1)}:steps=3`
    : `${bgCore},hflip`;
  return {
    type: "filter_complex" as const,
    value: `[0:v]split=2[sharp][blur];[blur]${bgFx}[blurred];[sharp]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease${fgFx}[sharpfit];[blurred][sharpfit]overlay=(W-w)/2:(H-h)/2,fps=30,setsar=1[vout]`,
  };
}

function exportImageOverlayBox(c: TLItem, targetW: number, targetH: number) {
  const srcW = c.width || 16;
  const srcH = c.height || 9;
  const ar = srcW / Math.max(1, srcH);
  let h = targetH * 0.6;
  let w = h * ar;
  if (w > targetW * 0.9) { w = targetW * 0.9; h = w / ar; }
  const scale = c.transform?.scale ?? 1;
  w = Math.max(2, Math.round(w * scale));
  h = Math.max(2, Math.round(h * scale));
  const x = Math.round(((c.transform?.xPct ?? 50) / 100) * targetW - w / 2);
  const y = Math.round(((c.transform?.yPct ?? 50) / 100) * targetH - h / 2);
  return { w, h, x, y };
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

function getAudioFadeIn(i: TLItem): number {
  if (typeof i.audioFadeIn === "number") return i.audioFadeIn;
  return i.kind === "audio" ? (i.fadeIn ?? 0) : 0;
}

function getAudioFadeOut(i: TLItem): number {
  if (typeof i.audioFadeOut === "number") return i.audioFadeOut;
  return i.kind === "audio" ? (i.fadeOut ?? 0) : 0;
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
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [showMobileInspector, setShowMobileInspector] = useState(false);
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
  const [tracks, setTracks] = useState<Track[]>(() => orderTracksFromCenter(INITIAL_TRACKS));
  useEffect(() => {
    setTracks(prev => {
      const ordered = orderTracksFromCenter(prev);
      return sameTrackOrder(prev, ordered) ? prev : ordered;
    });
  }, []);
  const [items, setItemsRaw] = useState<TLItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const draggedTransitionRef = useRef<TransitionPreset | null>(null);
  const [transitionDragHover, setTransitionDragHover] = useState<
    | { trackId: string; junctionT: number; leftId: string; rightId: string; dur: number; transitionId: string }
    | null
  >(null);
  const [selectedTransition, setSelectedTransition] = useState<
    { leftId: string; rightId: string } | null
  >(null);
  const [transitionPopover, setTransitionPopover] = useState<
    { leftId: string; rightId: string; x: number; y: number } | null
  >(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  // WYSIWYG: quando true, mostra a renderização do MESMO motor do export por cima do DOM.
  // O DOM segue por baixo para manter interações (drag/handles) e o áudio do <video>.
  const [useCanvasPreview, setUseCanvasPreview] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("lle:canvasPreview");
    return v == null ? true : v === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("lle:canvasPreview", useCanvasPreview ? "1" : "0");
  }, [useCanvasPreview]);
  const [zoom, setZoom] = useState(40);
  const [dragExtraSec, setDragExtraSec] = useState(0);
  const [snapResize, setSnapResize] = useState(true);
  const [tlViewportW, setTlViewportW] = useState(800);
  const [quality, setQuality] = useState<Quality>("1080");

  const [trackLocked, setTrackLocked] = useState<Record<string, boolean>>({});
  const [trackMuted, setTrackMuted] = useState<Record<string, boolean>>({});

  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [mediaBoxSel, setMediaBoxSel] = useState<
    | { x1: number; y1: number; x2: number; y2: number; additive: boolean; baseline: Set<string> }
    | null
  >(null);
  const mediaItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mediaListRef = useRef<HTMLDivElement | null>(null);

  // Metering for balance (pan) view
  const [panPeaks, setPanPeaks] = useState({ L: 0, R: 0 });
  const panAnalyzersRef = useRef<{ L: AnalyserNode; R: AnalyserNode } | null>(null);
  const panReqRef = useRef<number | null>(null);



  const [exporting, setExporting] = useState(false);
  const ffReady = true;
  const ffLoading = false;
  const ffLoadError: string | null = null;
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
  // ---- Microphone recording ----
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartRef = useRef<{ playhead: number; time: number; trackId: string } | null>(null);
  const recordTimerRef = useRef<number | null>(null);
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

  // Detecta suporte a WebCodecs para o seletor de motor
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { targetW, targetH } = computeExportSize(quality, aspect);
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


  // Engine de exportação: somente WebCodecs (FFmpeg removido).

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; clipId: string | null } | null>(null);
  const [mediaCtx, setMediaCtx] = useState<{ x: number; y: number; mediaId: string } | null>(null);
  const clipboardRef = useRef<TLItem | null>(null);

  // Resizable side panels
  const [leftW, setLeftW] = useState(320);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("media");
  const [rightW, setRightW] = useState(380);
  const [masterDbL, setMasterDbL] = useState(0);
  const [masterDbR, setMasterDbR] = useState(0);
  const [masterPeakL, setMasterPeakL] = useState(0);
  const [masterPeakR, setMasterPeakR] = useState(0);
  const [masterClipL, setMasterClipL] = useState(false);
  const [masterClipR, setMasterClipR] = useState(false);
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
  const mediaGraphByElementRef = useRef<WeakMap<HTMLMediaElement, { src: MediaElementAudioSourceNode; nodes: AudioFxNodes }>>(new WeakMap());
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
  const masterRef = useRef<{
    input: GainNode; splitter: ChannelSplitterNode; merger: ChannelMergerNode;
    gainL: GainNode; gainR: GainNode; analyserL: AnalyserNode; analyserR: AnalyserNode;
  } | null>(null);
  const ensureMaster = useCallback((ctx: AudioContext) => {
    if (masterRef.current) return masterRef.current;
    const input = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const gainL = ctx.createGain();
    const gainR = ctx.createGain();
    const analyserL = ctx.createAnalyser();
    const analyserR = ctx.createAnalyser();
    analyserL.fftSize = 1024; analyserR.fftSize = 1024;
    input.connect(splitter);
    splitter.connect(gainL, 0); splitter.connect(gainR, 1);
    gainL.connect(analyserL); gainR.connect(analyserR);
    analyserL.connect(merger, 0, 0); analyserR.connect(merger, 0, 1);
    merger.connect(ctx.destination);
    masterRef.current = { input, splitter, merger, gainL, gainR, analyserL, analyserR };
    return masterRef.current;
  }, []);
  const attachGraph = useCallback((id: string, el: HTMLMediaElement, item: TLItem) => {
    const ctx = ensureAudioCtx();
    if (!ctx) return null;
    let entry = mediaGraphRef.current[id];
    if (!entry) {
      const existingForElement = mediaGraphByElementRef.current.get(el);
      if (existingForElement) {
        mediaGraphRef.current[id] = existingForElement;
        entry = existingForElement;
      }
    }
    if (!entry) {
      try {
        const src = ctx.createMediaElementSource(el);
        const nodes = buildAudioFxGraph(ctx, { initialFx: item.audioFx, initialGainDb: item.gainDb ?? 0 });
        const master = ensureMaster(ctx);
        src.connect(nodes.input);
        nodes.output.connect(master.input);
        entry = { src, nodes };
        mediaGraphRef.current[id] = entry;
        mediaGraphByElementRef.current.set(el, entry);
      } catch { return null; }
    }
    return entry;
  }, [ensureAudioCtx, ensureMaster]);

  // Apply master L/R gains
  useEffect(() => {
    const m = masterRef.current; const ctx = audioCtxRef.current;
    if (!m || !ctx) return;
    const t = ctx.currentTime;
    m.gainL.gain.setTargetAtTime(dbToGain(masterDbL), t, 0.01);
    m.gainR.gain.setTargetAtTime(dbToGain(masterDbR), t, 0.01);
  }, [masterDbL, masterDbR]);

  // Peak meters (rAF)
  useEffect(() => {
    let raf = 0;
    let pl = 0, pr = 0;
    const buf = new Float32Array(1024);
    const tick = () => {
      const m = masterRef.current;
      if (m) {
        m.analyserL.getFloatTimeDomainData(buf);
        let mL = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > mL) mL = v; }
        m.analyserR.getFloatTimeDomainData(buf);
        let mR = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > mR) mR = v; }
        pl = Math.max(mL, pl * 0.9);
        pr = Math.max(mR, pr * 0.9);
        setMasterPeakL(pl); setMasterPeakR(pr);
        if (mL >= 0.99) setMasterClipL(true);
        if (mR >= 0.99) setMasterClipR(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const previewBoxRef = useRef<HTMLDivElement>(null);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef<"tl" | "sb" | null>(null);
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

  const togglePreviewFullscreen = useCallback(() => {
    const el = previewShellRef.current ?? previewBoxRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const selected = items.find(i => i.id === selectedId) ?? null;
  const totalDuration = useMemo(
    () => items.reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0),
    [items]
  );

  useEffect(() => { itemsRef.current = items; }, [items]);

  // Pan meters (analisador L/R do clipe selecionado) — efeito de nível superior
  useEffect(() => {
    if (!selectedId) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const entry = mediaGraphRef.current[selectedId];
    if (!entry) return;

    if (!panAnalyzersRef.current) {
      const al = ctx.createAnalyser();
      const ar = ctx.createAnalyser();
      al.fftSize = 512; ar.fftSize = 512;
      panAnalyzersRef.current = { L: al, R: ar };
    }
    const { L, R } = panAnalyzersRef.current;
    try {
      entry.nodes.splitter.connect(L, 0);
      entry.nodes.splitter.connect(R, 1);
    } catch { /* ignore */ }

    const buf = new Float32Array(L.fftSize);
    let curL = 0, curR = 0;
    const tick = () => {
      L.getFloatTimeDomainData(buf);
      let mL = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > mL) mL = v; }
      R.getFloatTimeDomainData(buf);
      let mR = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > mR) mR = v; }
      curL = Math.max(mL, curL * 0.85);
      curR = Math.max(mR, curR * 0.85);
      setPanPeaks({ L: curL, R: curR });
      panReqRef.current = requestAnimationFrame(tick);
    };
    panReqRef.current = requestAnimationFrame(tick);

    return () => {
      if (panReqRef.current) cancelAnimationFrame(panReqRef.current);
      try { entry.nodes.splitter.disconnect(L); entry.nodes.splitter.disconnect(R); } catch { /* ignore */ }
    };
  }, [selectedId, ensureAudioCtx]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const usedMediaIds = useMemo(() => new Set(items.map(i => i.mediaId).filter(Boolean) as string[]), [items]);

  // Z-index por trilha: trilha mais acima no painel = camada visualmente em cima (Photoshop-style).
  const videoTrackOrder = useMemo(() => {
    const m: Record<string, number> = {};
    const vids = tracks.filter(t => t.kind === "video");
    vids.forEach((t, i) => { m[t.id] = i; });
    return { map: m, count: vids.length };
  }, [tracks]);
  const trackZ = useCallback((trackId: string): number => {
    const idx = videoTrackOrder.map[trackId];
    if (idx == null) return 2;
    // V3/V2 ficam acima de V1; cada trilha abaixo recebe 2 níveis (bg + content)
    return 10 + (videoTrackOrder.count - idx) * 2;
  }, [videoTrackOrder]);

  const syncExportPresetToAspect = useCallback((nextAspect: AspectKey) => {
    const current = EXPORT_PRESETS[exportPreset];
    if (current?.aspect === nextAspect) return;
    const matching = (Object.keys(EXPORT_PRESETS) as ExportPresetKey[]).find(k => {
      const p = EXPORT_PRESETS[k];
      return k !== "custom" && p.aspect === nextAspect && p.quality === quality;
    });
    setExportPreset(matching ?? "custom");
  }, [exportPreset, quality]);

  const setProjectAspect = useCallback((nextAspect: AspectKey) => {
    setAspectKey(nextAspect);
    syncExportPresetToAspect(nextAspect);
  }, [syncExportPresetToAspect]);

  // Box-select global listeners para a mídia
  useEffect(() => {
    if (!mediaBoxSel) return;
    const onMove = (e: MouseEvent) => {
      const container = mediaListRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top + container.scrollTop;
      setMediaBoxSel(prev => prev ? { ...prev, x2: x, y2: y } : prev);
      // recalcula seleção
      const x1 = Math.min(mediaBoxSel.x1, x);
      const y1 = Math.min(mediaBoxSel.y1, y);
      const x2 = Math.max(mediaBoxSel.x1, x);
      const y2 = Math.max(mediaBoxSel.y1, y);
      const next = new Set(mediaBoxSel.baseline);
      for (const [id, el] of Object.entries(mediaItemRefs.current)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const ix1 = r.left - rect.left;
        const iy1 = r.top - rect.top + container.scrollTop;
        const ix2 = ix1 + r.width;
        const iy2 = iy1 + r.height;
        const intersects = !(ix2 < x1 || ix1 > x2 || iy2 < y1 || iy1 > y2);
        if (intersects) next.add(id);
      }
      setSelectedMediaIds(next);
    };
    const onUp = () => setMediaBoxSel(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mediaBoxSel]);



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
      return orderTracksFromCenter([...prev, newTrack]);
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
      return orderTracksFromCenter(out);
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
  const createTLFromMedia = useCallback((asset: MediaAsset, trackId: string, start: number, durationOverride?: number): TLItem => {
    const isImg = asset.kind === "image";
    const imageDur = Math.max(0.1, Math.min(IMAGE_MAX_DUR, durationOverride ?? 5));
    return {
      id: crypto.randomUUID(),
      mediaId: asset.id,
      kind: asset.kind, trackId, name: asset.name, file: asset.file, url: asset.url,
      start,
      inPoint: 0,
      outPoint: isImg ? imageDur : asset.duration,
      sourceDuration: isImg ? IMAGE_MAX_DUR : asset.duration,
      width: asset.width, height: asset.height,
      transform: asset.kind === "image" || asset.kind === "video" ? { xPct: 50, yPct: 50, scale: 1, rotation: 0 } : undefined,
      fadeIn: 0, fadeOut: 0,
      gainDb: (asset.kind === "audio" || asset.kind === "video") ? 0 : undefined,
      audioFx: (asset.kind === "audio" || asset.kind === "video") ? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] } : undefined,
      fx: (asset.kind === "image" || asset.kind === "video") ? { ...DEFAULT_FX } : undefined,
    };
  }, []);

  const addAssetToTimeline = useCallback((asset: MediaAsset, opts?: { trackId?: string; start?: number; duration?: number }) => {
    const wantKind: TrackKind = asset.kind === "audio" ? "audio" : "video";
    const findMain = (k: TrackKind) => k === "video" ? [...tracks].reverse().find(t => t.kind === "video")?.id : tracks.find(t => t.kind === "audio")?.id;
    const targetTrack = opts?.trackId && tracks.find(t => t.id === opts.trackId)?.kind === wantKind
      ? opts.trackId
      : (findMain(wantKind) ?? ensureTrack(wantKind));
    const defaultStart = items.filter(i => i.trackId === targetTrack)
      .reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0);
    const start = opts?.start != null ? Math.max(0, opts.start) : defaultStart;
    const it = createTLFromMedia(asset, targetTrack, start, opts?.duration);

    // Separação automática: vídeo com áudio gera item de áudio espelhado em A1 e o
    // vídeo passa a ser silenciado. Vídeo → frames; áudio → waveform/ganho/efeitos.
    const newItems: TLItem[] = [it];
    if (asset.kind === "video" && asset.duration > 0) {
      it.silenced = true;
      it.audioFx = undefined;
      it.gainDb = undefined;
      const audioTrack = tracks.find(t => t.kind === "audio")?.id ?? ensureTrack("audio");
      const audioAsset: MediaAsset = {
        id: crypto.randomUUID(),
        kind: "audio",
        name: `${asset.name} · áudio`,
        file: asset.file,
        url: asset.url,
        duration: asset.duration,
      };
      const audioItem = createTLFromMedia(audioAsset, audioTrack, start, asset.duration);
      audioItem.mediaId = asset.id;
      newItems.push(audioItem);
    }

    setItems(prev => [...prev, ...newItems]);
    setSelectedId(it.id);
  }, [items, tracks, ensureTrack, createTLFromMedia, setItems]);

  // ---- Microphone recording ----
  const stopMicRecording = useCallback(() => {
    const mr = recorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch { /* ignore */ }
    }
    if (recordTimerRef.current != null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecording(false);
  }, []);

  const startMicRecording = useCallback(async () => {
    if (recording) { stopMicRecording(); return; }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microfone não suportado neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      recordStreamRef.current = stream;
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = mimeCandidates.find(m => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) || "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data); };
      mr.onstop = () => {
        try {
          const type = mr.mimeType || "audio/webm";
          const blob = new Blob(recordChunksRef.current, { type });
          const ext = type.includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `Gravacao-${Date.now()}.${ext}`, { type });
          const url = URL.createObjectURL(blob);
          const dur = Math.max(0.1, (Date.now() - (recordStartRef.current?.time ?? Date.now())) / 1000);
          const startAt = recordStartRef.current?.playhead ?? 0;
          const trackId = recordStartRef.current?.trackId;
          const asset: MediaAsset = {
            id: crypto.randomUUID(),
            kind: "audio",
            name: file.name,
            file, url,
            duration: dur,
          };
          setMedia(prev => [...prev, asset]);
          addAssetToTimeline(asset, { start: startAt, duration: dur, trackId });
        } catch (err) {
          setError("Falha ao salvar gravação: " + (err instanceof Error ? err.message : String(err)));
        } finally {
          recordStreamRef.current?.getTracks().forEach(t => t.stop());
          recordStreamRef.current = null;
          recordChunksRef.current = [];
          recorderRef.current = null;
          recordStartRef.current = null;
        }
      };
      // Sempre cria uma nova trilha de áudio dedicada para a gravação,
      // para não sobrepor o áudio do vídeo ou outras faixas existentes.
      const recTrackId = ensureTrack("audio");
      recordStartRef.current = { playhead, time: Date.now(), trackId: recTrackId };
      setRecElapsed(0);
      recordTimerRef.current = window.setInterval(() => {
        const t = recordStartRef.current?.time;
        if (t) setRecElapsed((Date.now() - t) / 1000);
      }, 100);
      mr.start(100);
      recorderRef.current = mr;
      setRecording(true);
      // Inicia o playback automaticamente ao começar a gravar.
      setPlaying(true);
    } catch (err) {
      setError("Não foi possível acessar o microfone: " + (err instanceof Error ? err.message : String(err)));
      setRecording(false);
    }
  }, [recording, stopMicRecording, playhead, addAssetToTimeline, ensureTrack]);

  // Cleanup ao desmontar
  useEffect(() => () => {
    if (recordTimerRef.current != null) window.clearInterval(recordTimerRef.current);
    recordStreamRef.current?.getTracks().forEach(t => t.stop());
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }, []);



  const addText = useCallback(() => {
    const videoTracks = tracks.filter(t => t.kind === "video");
    // trilha de vídeo mais acima (topo da timeline)
    const trackId = videoTracks[0]?.id ?? ensureTrack("video");
    const start = playhead;
    const it: TLItem = {
      id: crypto.randomUUID(), kind: "text", trackId, name: "Texto",
      start, inPoint: 0, outPoint: 5, sourceDuration: 9999,
      text: defaultText(),
      fx: { ...DEFAULT_FX },
      transform: { xPct: 50, yPct: 80, scale: 1, rotation: 0 },
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
  }, [tracks, ensureTrack, setItems, playhead]);

  const addCredits = useCallback(() => {
    const videoTracks = tracks.filter(t => t.kind === "video");
    const trackId = videoTracks[0]?.id ?? ensureTrack("video");
    const it: TLItem = {
      id: crypto.randomUUID(), kind: "text", trackId, name: "Créditos",
      start: playhead, inPoint: 0, outPoint: 5, sourceDuration: 9999,
      text: { ...defaultText(), content: "Créditos", size: 48, bold: false },
      fx: { ...DEFAULT_FX },
      transform: { xPct: 50, yPct: 82, scale: 1, rotation: 0 },
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
      if (target?.url) { try { URL.revokeObjectURL(target.url); } catch { /* ignore */ } }
      return prev.filter(m => m.id !== mediaId);
    });
    setItems(prev => prev.filter(i => i.mediaId !== mediaId));
  };

  const applyTimelineEffect = useCallback((itemId: string, effectId: TimelineEffectId) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.fx ?? { ...DEFAULT_FX };
      if (effectId === "background-blur" && (i.kind === "image" || i.kind === "video")) {
        return { ...i, fx: { ...current, fillMode: "blur", blurBg: Math.max(current.blurBg || 0, 70) } };
      }
      return { ...i, fx: { ...current, blur: Math.max(current.blur || 0, 35) } };
    }));
    setSelectedId(itemId);
  }, [setItems]);

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
    // Cola na próxima trilha a partir do meio: V1→V2→V3 sobe; A1→A2→A3 desce.
    const kind: TrackKind = src.kind === "audio" ? "audio" : "video";
    const targetId = nextTrackIdFrom(src.trackId, kind);
    setTracks(prev => {
      if (prev.some(t => t.id === targetId && t.kind === kind)) return prev;
      const newTrack: Track = { id: targetId, kind, label: `${targetId} · ${kind === "video" ? "Vídeo" : "Áudio"}` };
      return orderTracksFromCenter([...prev, newTrack]);
    });
    const it: TLItem = { ...src, id: crypto.randomUUID(), start: playhead, fadeIn: 0, fadeOut: 0, trackId: targetId };
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
      else if (k === "f" && !ctrl) { e.preventDefault(); togglePreviewFullscreen(); }
      else if (k === "s" && !ctrl) { e.preventDefault(); splitAt(playhead); }
      else if (k === "d" && !ctrl) { e.preventDefault(); splitAt(playhead); }
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
  }, [splitAt, playhead, undo, redo, selectedId, totalDuration, togglePreviewFullscreen]);

  // close context menu on click outside
  useEffect(() => {
    const onClick = () => { setCtxMenu(null); setMediaCtx(null); };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const sync = () => setPreviewFullscreen(document.fullscreenElement === previewShellRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
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

  // Active V1 (bottom video track = main background) video for preview <video>
  const firstVideoTrackId = [...tracks].reverse().find(t => t.kind === "video")?.id;
  const activeV1Video = useMemo(() => {
    if (!firstVideoTrackId) return null;
    return items.find(i =>
      i.trackId === firstVideoTrackId && i.kind === "video" &&
      playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint)
    ) ?? null;
  }, [items, playhead, firstVideoTrackId]);

  const computeAudioGainDb = (i: TLItem, t: number) => {
    const local = t - i.start;
    const dur = i.outPoint - i.inPoint;
    if (local < 0 || local > dur) return -120;
    const audioFadeIn = getAudioFadeIn(i);
    const audioFadeOut = getAudioFadeOut(i);
    let line = 1;
    if (audioFadeIn > 0.001 && local < audioFadeIn) line = Math.min(line, Math.max(0, local / audioFadeIn));
    if (audioFadeOut > 0.001 && local > dur - audioFadeOut) line = Math.min(line, Math.max(0, (dur - local) / audioFadeOut));
    const baseGain = Math.pow(10, (i.gainDb ?? 0) / 20);
    const finalGain = baseGain * line;
    if (finalGain <= 1e-6) return -120;
    return 20 * Math.log10(finalGain);
  };
  const computeAudioGain = (i: TLItem, t: number) => Math.pow(10, computeAudioGainDb(i, t) / 20);


  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (!activeV1Video) { v.pause(); v.removeAttribute("src"); v.load(); return; }
    const wanted = activeV1Video.url;
    if (!wanted) { v.pause(); v.removeAttribute("src"); v.load(); return; }
    if (v.src !== wanted) v.src = wanted;
    const target = activeV1Video.inPoint + (playhead - activeV1Video.start);
    if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
    v.muted = !!trackMuted[activeV1Video.trackId] || !!activeV1Video.silenced;
    // Encaminha pelo grafo WebAudio para permitir ganho >0dB e FX.
    const g = attachGraph(activeV1Video.id, v, activeV1Video);
    if (g) {
      v.volume = 1;
      const muted = !!trackMuted[activeV1Video.trackId] || !!activeV1Video.silenced;
      g.nodes.setMuted(muted);
      if (activeV1Video.audioFx) g.nodes.setFx(activeV1Video.audioFx);
      g.nodes.setGain(activeV1Video.silenced ? -120 : computeAudioGainDb(activeV1Video, playhead));
    } else {
      // fallback se WebAudio falhou
      v.volume = activeV1Video.silenced ? 0 : Math.min(1, computeAudioGain(activeV1Video, playhead));
    }
    if (playing) {
      v.play().catch((err) => {
        if (err.name === "NotAllowedError") {
          console.warn("Reprodução automática bloqueada pelo navegador. Interação do usuário necessária.");
          setPlaying(false);
        }
      });
    } else {
      v.pause();
    }
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
    if (playing) {
      bg.play().catch(() => {});
    } else {
      bg.pause();
    }
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
        g.nodes.setGain(computeAudioGainDb(a, playhead));
      } else {
        el.muted = !!trackMuted[a.trackId];
        el.volume = Math.min(1, computeAudioGain(a, playhead));
      }
      if (inRange) {
        const target = a.inPoint + (playhead - a.start);
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
        if (playing && el.paused) {
          el.play().catch(() => {});
        }
        if (!playing && !el.paused) el.pause();
      } else if (!el.paused) el.pause();
    }
  }, [items, playing, playhead, trackMuted, attachGraph]);


  const overlays = items.filter(i =>
    (i.kind === "image" || i.kind === "text") &&
    playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint) &&
    !trackMuted[i.trackId]
  );

  // ============================================================
  // SCENE para o motor único de render (preview + export).
  // Esta projeção é a MESMA usada pelo exportador (withPreviewGeometry).
  // ============================================================
  const previewScene = useMemo(() => {
    const v1trackId = [...tracks].reverse().find(t => t.kind === "video")?.id;
    const toScene = <T extends TLItem>(c: T): CachedMediaItem & SceneItem => {
      const bounds = (c.kind === "video" || c.kind === "image") ? computeItemBounds(
        { kind: c.kind, width: c.width, height: c.height },
        aspect,
      ) : null;
      return {
        id: c.id,
        kind: c.kind,
        trackId: c.trackId,
        name: c.name,
        file: c.file,
        url: c.url,
        width: c.width,
        height: c.height,
        start: c.start,
        inPoint: c.inPoint,
        outPoint: c.outPoint,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        fx: c.fx as SceneItem["fx"],
        text: c.text as SceneItem["text"],
        transform: c.transform,
        previewBox: bounds ? { wPct: bounds.w, hPct: bounds.h } : undefined,
        zIndex: trackZ(c.trackId),
      };
    };
    const v1Items = items
      .filter(i => i.trackId === v1trackId && i.kind === "video" && !trackMuted[i.trackId])
      .map(toScene);
    const visualItems = items
      .filter(i => (i.kind === "image" || (i.kind === "video" && i.trackId !== v1trackId)) && !trackMuted[i.trackId])
      .map(toScene);
    const textItems = items
      .filter(i => i.kind === "text" && i.text?.content && !trackMuted[i.trackId])
      .map(toScene);
    return { v1Items, visualItems, textItems };
  }, [items, tracks, aspect, trackMuted, trackZ]);

  // ---- Timeline drags ----
  type Drag =
    | { type: "move"; id: string; offsetSec: number; origTrackId: string }
    | { type: "resizeL"; id: string; origStart: number; origIn: number; origEnd: number; isImage: boolean; pointerOffsetPx: number }
    | { type: "resizeR"; id: string; origOut: number; pointerOffsetPx: number }
    | { type: "visualFadeIn"; id: string }
    | { type: "visualFadeOut"; id: string }
    | { type: "audioFadeIn"; id: string }
    | { type: "audioFadeOut"; id: string }
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
      if (playing) setPlaying(false);
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
      if (d.type === "playhead") {
        setPlayhead(snapTimeRef.current(tSec));
        if (playing) setPlaying(false);
      }
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
      } else if (d.type === "visualFadeIn") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          return { ...i, fadeIn: Math.max(0, Math.min(dur, tSec - i.start)) };
        }), false);
      } else if (d.type === "visualFadeOut") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          const end = i.start + dur;
          return { ...i, fadeOut: Math.max(0, Math.min(dur, end - tSec)) };
        }), false);
      } else if (d.type === "audioFadeIn") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          return { ...i, audioFadeIn: Math.max(0, Math.min(dur, tSec - i.start)) };
        }), false);
      } else if (d.type === "audioFadeOut") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          const end = i.start + dur;
          return { ...i, audioFadeOut: Math.max(0, Math.min(dur, end - tSec)) };
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

  const adjustPreviewItemScale = useCallback((delta: number) => {
    const target = (selected && selected.transform) ? selected : activeV1Video;
    if (!target || !target.transform) return;
    setItems(prev => prev.map(i => i.id === target.id && i.transform
      ? { ...i, transform: { ...i.transform, scale: Math.max(0.05, Math.min(50, i.transform.scale + delta)) } } : i));
  }, [selected, activeV1Video, setItems]);


  // selected preview target (image/text/active V1 video)
  const previewTarget: TLItem | null = useMemo(() => {
    if (selected && selected.transform && (selected.kind === "image" || selected.kind === "text" || (selected === activeV1Video))) return selected;
    return null;
  }, [selected, activeV1Video]);

  // Compute base bounds (% of preview) for an overlay/video so handles sit on its real corners.
  // SINGLE SOURCE OF TRUTH: shared with the export pipeline via src/lib/scene-geometry.ts.
  const getItemBounds = useCallback((it: TLItem): { w: number; h: number } => {
    return computeItemBounds({ kind: it.kind, width: it.width, height: it.height }, aspect);
  }, [aspect]);

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
  const { targetW: exportTargetW, targetH: exportTargetH } = computeExportSize(quality, aspect);
  const estimatedMB = useMemo(
    () => estimateSizeMB(Math.max(1, totalDuration), computedVBitrate, audioBitrate),
    [totalDuration, computedVBitrate, audioBitrate],
  );

  // ---- DIAGNÓSTICO removido junto com FFmpeg ----

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

    const v1trackId = [...tracks].reverse().find(t => t.kind === "video")?.id;
    const v1clips = items
      .filter(i => i.trackId === v1trackId && i.kind === "video")
      .sort((a, b) => a.start - b.start);
    const visualOverlayItems = items
      .filter(i => i.kind === "image" || (i.kind === "video" && i.trackId !== v1trackId))
      .sort((a, b) => a.start - b.start);
    const audioClips = items.filter(i => i.kind === "audio");
    if (!v1clips.length && !visualOverlayItems.length && !audioClips.length) {
      setError("Adicione pelo menos um vídeo, imagem ou áudio na timeline.");
      return;
    }
    const missingFiles = [...v1clips, ...visualOverlayItems, ...audioClips].filter(c => !c.file);
    if (missingFiles.length) {
      const names = missingFiles.map(c => c.name).join(", ");
      console.error("Clipes sem arquivo original:", names);
      setError(`Alguns clipes estão sem arquivo original: ${names}`);
      return;
    }
    // Save retry handle (same settings)
    lastExportSettingsRef.current = () => { void doExport(); };

    const fps = Math.max(1, Math.min(60, exportFps || 30));
    const vKbps = computedVBitrate;
    const aKbps = audioBitrate;

    setExporting(true); setExportPct(0); setExportMsg("Inicializando WebCodecs...");
    setExportUrl(null); setError(null);
    setExportLog([]); setExportFfCmd("");
    setExportElapsed(0); setExportFpsLive(null); setExportSpeed(null);
    exportStartRef.current = performance.now();
    if (exportElapsedTimerRef.current) window.clearInterval(exportElapsedTimerRef.current);
    exportElapsedTimerRef.current = window.setInterval(() => {
      setExportElapsed((performance.now() - exportStartRef.current) / 1000);
    }, 250) as unknown as number;

    const { targetW, targetH } = computeExportSize(quality, aspect);

    try {
      const { isWebCodecsExportSupported, exportWithWebCodecs } = await import("@/lib/webcodecs-export");
      const sup = await isWebCodecsExportSupported(targetW, targetH, fps, vKbps);
      if (!sup.ok) {
        throw new Error(`WebCodecs indisponível neste navegador: ${sup.reason ?? "sem suporte"}. Use Chrome/Edge/Opera recentes.`);
      }
      setExportMsg(`Aceleração: ${sup.hw === "prefer-hardware" ? "GPU" : "software-otimizado"} (${sup.codec})`);
      setExportLog([
        `=== EXPORT WEBCODECS ===`,
        `Codec: ${sup.codec} · Aceleração: ${sup.hw}`,
        `Resolução: ${targetW}x${targetH} · ${fps} fps · ${vKbps} kbps`,
        `Áudio: AAC ${aKbps} kbps`,
      ]);
      const textItems = items.filter(i => i.kind === "text" && i.text?.content);
      const music = audioClips[0];

      // Normaliza a timeline: a exportação reproduz exatamente o que está na timeline,
      // removendo gap inicial e cortando ao fim do último clipe (comportamento profissional).
      const allForBounds = [...v1clips, ...visualOverlayItems, ...audioClips, ...textItems];
      const minStart = allForBounds.length ? Math.min(...allForBounds.map(c => c.start)) : 0;
      const maxEnd = allForBounds.length
        ? Math.max(...allForBounds.map(c => c.start + (c.outPoint - c.inPoint)))
        : 0;
      const shift = Math.max(0, minStart);
      const realDuration = Math.max(0.1, maxEnd - shift);
      const offsetClips = <T extends { start: number }>(arr: T[]): T[] =>
        arr.map(c => ({ ...c, start: Math.max(0, c.start - shift) }));

      const withPreviewGeometry = <T extends TLItem>(arr: T[]) => arr.map(c => {
        const bounds = (c.kind === "video" || c.kind === "image") ? getItemBounds(c) : null;
        return {
          ...c,
          zIndex: trackZ(c.trackId),
          previewBox: bounds ? { wPct: bounds.w, hPct: bounds.h } : undefined,
        };
      });

      const blob = await exportWithWebCodecs({
        v1clips: withPreviewGeometry(offsetClips(v1clips)) as unknown as import("@/lib/webcodecs-export").WCItem[],
        audioClips: offsetClips(audioClips) as unknown as import("@/lib/webcodecs-export").WCItem[],
        music: (music ? offsetClips([music])[0] : undefined) as unknown as import("@/lib/webcodecs-export").WCItem | undefined,
        imageItems: withPreviewGeometry(offsetClips(visualOverlayItems)) as unknown as import("@/lib/webcodecs-export").WCItem[],
        textItems: withPreviewGeometry(offsetClips(textItems)) as unknown as import("@/lib/webcodecs-export").WCItem[],
        targetW, targetH,
        fps, vKbps, aKbps, totalDuration: realDuration,
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

      if (postBeep) {
        try {
          const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
          const ctx = new Ctx();
          const o = ctx.createOscillator(); const g2 = ctx.createGain();
          o.frequency.value = 880; g2.gain.value = 0.08;
          o.connect(g2).connect(ctx.destination); o.start();
          setTimeout(() => { o.stop(); ctx.close(); }, 220);
        } catch { /* ignore */ }
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
      console.error("[export] WebCodecs falhou:", e);
      const baseMsg = e instanceof Error ? e.message : "Falha na exportação";
      setError(baseMsg);
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
  const findNearestJunction = (trackId: string, t: number) => {
    const trackItems = items.filter(i => i.trackId === trackId).sort((a, b) => a.start - b.start);
    let left: typeof trackItems[number] | undefined;
    let right: typeof trackItems[number] | undefined;
    let bestDist = Infinity;
    let junctionT = 0;
    for (let k = 0; k < trackItems.length - 1; k++) {
      const a = trackItems[k];
      const b = trackItems[k + 1];
      const aEnd = a.start + (a.outPoint - a.inPoint);
      const gap = b.start - aEnd;
      const j = (aEnd + b.start) / 2;
      const d = Math.abs(t - j);
      if (Math.abs(gap) < 0.25 && d < bestDist) { bestDist = d; left = a; right = b; junctionT = j; }
    }
    if (left && right) return { left, right, junctionT, dist: bestDist };
    return null;
  };
  const onTrackDragOver = (e: React.DragEvent, trackId?: string) => {
    if (
      e.dataTransfer.types.includes("application/x-vle-media") ||
      e.dataTransfer.types.includes(EFFECT_DND_TYPE) ||
      e.dataTransfer.types.includes("application/x-lle-transition")
    ) {
      e.preventDefault(); e.dataTransfer.dropEffect = "copy";
      if (trackId && e.dataTransfer.types.includes("application/x-lle-transition")) {
        const preset = draggedTransitionRef.current;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const xPx = e.clientX - rect.left;
        const t = Math.max(0, xPx / zoom);
        const j = findNearestJunction(trackId, t);
        if (j && preset) {
          setTransitionDragHover({
            trackId, junctionT: j.junctionT, leftId: j.left.id, rightId: j.right.id,
            dur: preset.dur, transitionId: preset.id,
          });
        } else {
          setTransitionDragHover(null);
        }
      }
    }
  };
  const onTrackDragLeave = () => setTransitionDragHover(null);
  const onTrackDrop = (e: React.DragEvent, trackId: string) => {
    const transitionId = e.dataTransfer.getData("application/x-lle-transition");
    if (transitionId) {
      e.preventDefault();
      setTransitionDragHover(null);
      draggedTransitionRef.current = null;
      const preset = getTransitionById(transitionId);
      const dur = preset?.dur ?? 0.6;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const t = Math.max(0, xPx / zoom);
      const j = findNearestJunction(trackId, t);
      if (j) {
        setItems(p => p.map(i =>
          i.id === j.left.id ? { ...i, fadeOut: dur, transition: transitionId } :
          i.id === j.right.id ? { ...i, fadeIn: dur, transition: transitionId } : i
        ));
        setSelectedTransition({ leftId: j.left.id, rightId: j.right.id });
        return;
      }
      const trackItems = items.filter(i => i.trackId === trackId).sort((a, b) => a.start - b.start);
      const hit = trackItems.find(i => t >= i.start && t <= i.start + (i.outPoint - i.inPoint));
      if (hit) {
        setItems(p => p.map(i => i.id === hit.id ? { ...i, fadeIn: dur, fadeOut: dur, transition: transitionId } : i));
      }
      return;
    }

    const effectId = e.dataTransfer.getData(EFFECT_DND_TYPE) as TimelineEffectId;
    if (effectId) {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const t = Math.max(0, xPx / zoom);
      const target = items.find(i => i.trackId === trackId && t >= i.start && t <= i.start + (i.outPoint - i.inPoint));
      if (target) applyTimelineEffect(target.id, effectId);
      return;
    }
    const id = e.dataTransfer.getData("application/x-vle-media");
    const idsMulti = e.dataTransfer.getData("application/x-vle-media-multi");
    const ids = idsMulti ? idsMulti.split(",").filter(Boolean) : (id ? [id] : []);
    if (!ids.length) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    let start = snapTime(Math.max(0, xPx / zoom));
    // "Cola" no início: se o usuário soltar próximo de 0 (até 1.5s) e a faixa estiver livre nesse intervalo, encaixa em 0.
    const trackIsEmptyNear0 = !items.some(i => i.trackId === trackId && i.start < Math.max(start, 1.5));
    if (start < 1.5 && trackIsEmptyNear0) start = 0;
    const droppedAssets = ids.map(mid => media.find(m => m.id === mid)).filter(Boolean) as MediaAsset[];
    const longestAudioDur = droppedAssets
      .filter(asset => asset.kind === "audio")
      .reduce((m, asset) => Math.max(m, asset.duration || 0), 0);
    const cursors: Record<TrackKind, number> = { video: start, audio: start };
    for (const mid of ids) {
      const asset = media.find(m => m.id === mid);
      if (!asset) continue;
      const laneKind: TrackKind = asset.kind === "audio" ? "audio" : "video";
      const duration = asset.kind === "image" && longestAudioDur > 0 ? longestAudioDur : undefined;
      addAssetToTimeline(asset, { trackId, start: cursors[laneKind], duration });
      const dur = asset.kind === "image" ? (duration ?? Math.min(asset.duration || 5, 5)) : (asset.duration || 5);
      cursors[laneKind] += dur;
    }
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
            <span className="hidden font-display text-sm font-semibold sm:inline">VIDEO LITE EDITOR</span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <button onClick={undo} title="Desfazer (Ctrl+Z)" className="rounded p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
            <button onClick={redo} title="Refazer (Ctrl+Y)" className="rounded p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
            <button onClick={togglePreviewFullscreen} title="Tela cheia do preview (F)" className="rounded p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Maximize2 className="h-4 w-4" /></button>
            <button
              onClick={() => setUseCanvasPreview(v => !v)}
              title={useCanvasPreview ? "WYSIWYG ligado — preview = export. Clique para usar preview clássico." : "WYSIWYG desligado — preview em DOM. Clique para usar o motor de render."}
              className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${useCanvasPreview ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}
            >
              WYSIWYG
            </button>
            <div className="mx-2 h-6 w-px bg-border" />
          </div>
          
          <div className="flex items-center gap-1.5">
            <label className="hidden text-[10px] uppercase tracking-wider text-muted-foreground md:inline">Proporção</label>
            <select value={aspectKey} onChange={(e) => setProjectAspect(e.target.value as AspectKey)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-[11px] sm:text-xs">
              {(Object.keys(ASPECTS) as AspectKey[]).map(k => <option key={k} value={k}>{ASPECTS[k].label}</option>)}
            </select>
            {aspectKey === "custom" && (
              <div className="hidden items-center gap-1 text-xs sm:flex">
                <input type="number" min={1} value={customAR.w} onChange={(e) => { setCustomAR(s => ({ ...s, w: Math.max(1, Number(e.target.value) || 1) })); setExportPreset("custom"); }}
                  className="w-14 rounded border border-border bg-card px-1.5 py-1" />
                <span className="text-muted-foreground">:</span>
                <input type="number" min={1} value={customAR.h} onChange={(e) => { setCustomAR(s => ({ ...s, h: Math.max(1, Number(e.target.value) || 1) })); setExportPreset("custom"); }}
                  className="w-14 rounded border border-border bg-card px-1.5 py-1" />
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <div className="mx-2 h-6 w-px bg-border" />
            <select value={quality} onChange={(e) => {
              const nextQuality = e.target.value as Quality;
              setQuality(nextQuality);
              const matching = (Object.keys(EXPORT_PRESETS) as ExportPresetKey[]).find(k => {
                const p = EXPORT_PRESETS[k];
                return k !== "custom" && p.aspect === aspectKey && p.quality === nextQuality;
              });
              setExportPreset(matching ?? "custom");
            }}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
              <option value="720">720p</option><option value="1080">1080p</option><option value="2160">4K</option>
            </select>
          </div>

          <button
            onClick={() => {
              if (!gpuInfoRef.current) gpuInfoRef.current = detectGpu();
              setShowExportSettings(true);
            }}
            disabled={exporting || !items.length}
            className="glow-primary inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50 sm:text-xs">
            {exporting || ffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span>{exporting ? "Export" : "Exportar"}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="hidden shrink-0 border-r border-border bg-panel select-none md:flex" style={{ width: leftW }}>
          <div className="flex w-16 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-background/40 py-1.5">
            {([
              { id: "media" as LeftPanel, icon: Film, label: "Mídia" },
              { id: "titles" as LeftPanel, icon: TypeIcon, label: "Texto" },
              { id: "transitions" as LeftPanel, icon: RefreshCw, label: "Transições" },
              { id: "effects" as LeftPanel, icon: Wand2, label: "Efeitos" },
            ]).map(tab => {
              const Icon = tab.icon;
              const active = leftPanel === tab.id;
              return (
                <button key={tab.id} onClick={() => setLeftPanel(tab.id)} title={tab.label}
                  className={`flex w-14 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 transition ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" />
                  <span className="text-[9px] font-medium leading-none">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
            <input ref={fileInputRef} type="file" multiple hidden
              accept="video/*,audio/*,image/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.ogg,.png,.jpg,.jpeg"
              onChange={(e) => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ""; }} />

            {leftPanel === "media" && (
              <>
                <button onClick={() => fileInputRef.current?.click()}
                  className="glow-primary inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground">
                  <Plus className="h-4 w-4" /> Adicionar Arquivo
                </button>
                <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Mídia</span>
                  <span className="text-[10px] normal-case text-muted-foreground/70">{media.length} item(ns)</span>
                </div>
                <div
                  ref={mediaListRef}
                  className="relative flex-1 space-y-1 overflow-y-auto pr-1"
                  onMouseDown={(e) => {
                    // só inicia box-select quando clica em área vazia (não em item / botão)
                    if ((e.target as HTMLElement).closest("[data-media-item]")) return;
                    if (e.button !== 0) return;
                    const container = mediaListRef.current;
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    const x = e.clientX - rect.left + container.scrollTop * 0; // x não afeta scroll
                    const y = e.clientY - rect.top + container.scrollTop;
                    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                    setMediaBoxSel({ x1: x, y1: y, x2: x, y2: y, additive, baseline: new Set(additive ? selectedMediaIds : []) });
                    if (!additive) setSelectedMediaIds(new Set());
                    e.preventDefault();
                  }}
                >
                  {media.map(a => {
                    const Icon = a.kind === "audio" ? Music2 : a.kind === "image" ? ImageIcon : VideoIcon;
                    const used = usedMediaIds.has(a.id);
                    const isSel = selectedMediaIds.has(a.id);
                    return (
                      <div key={a.id}
                        data-media-item
                        ref={(el) => { mediaItemRefs.current[a.id] = el; }}
                        draggable
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).closest("button")) return;
                          if (e.shiftKey || e.metaKey || e.ctrlKey) {
                            e.preventDefault();
                            setSelectedMediaIds(prev => {
                              const n = new Set(prev);
                              if (n.has(a.id)) n.delete(a.id); else n.add(a.id);
                              return n;
                            });
                          } else if (!selectedMediaIds.has(a.id)) {
                            setSelectedMediaIds(new Set([a.id]));
                          }
                        }}
                        onDragStart={(e) => {
                          const ids = selectedMediaIds.has(a.id) && selectedMediaIds.size > 1
                            ? Array.from(selectedMediaIds)
                            : [a.id];
                          e.dataTransfer.setData("application/x-vle-media", a.id);
                          if (ids.length > 1) e.dataTransfer.setData("application/x-vle-media-multi", ids.join(","));
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onDoubleClick={() => addAssetToTimeline(a)}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMediaCtx({ x: e.clientX, y: e.clientY, mediaId: a.id }); }}
                        title="Arraste para a timeline. Shift/Ctrl+clique ou arraste no fundo para selecionar várias."
                        className={`group flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs active:cursor-grabbing ${isSel ? "border-primary bg-primary/15 ring-1 ring-primary/40" : used ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-ring/50"}`}>
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
                  {mediaBoxSel && (
                    <div
                      className="pointer-events-none absolute z-10 rounded-sm border border-primary bg-primary/10"
                      style={{
                        left: Math.min(mediaBoxSel.x1, mediaBoxSel.x2),
                        top: Math.min(mediaBoxSel.y1, mediaBoxSel.y2),
                        width: Math.abs(mediaBoxSel.x2 - mediaBoxSel.x1),
                        height: Math.abs(mediaBoxSel.y2 - mediaBoxSel.y1),
                      }}
                    />
                  )}
                </div>

              </>
            )}

            {leftPanel === "titles" && (
              <div className="space-y-2 text-xs">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Títulos e créditos</div>
                <button onClick={addText} className="inline-flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 hover:border-ring/50">
                  <TypeIcon className="h-3.5 w-3.5 text-primary" /> Título
                </button>
                <button onClick={addCredits} className="inline-flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 hover:border-ring/50">
                  <FileText className="h-3.5 w-3.5 text-primary" /> Créditos
                </button>
              </div>
            )}

            {leftPanel === "transitions" && (
              <div className="space-y-3 text-xs">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transições</div>
                <div className="rounded-md border border-dashed border-border bg-card/40 px-2 py-2 text-[10px] text-muted-foreground">
                  Arraste uma transição entre dois clipes encostados na timeline. Clique no chip de transição já aplicado para ajustar a duração.
                </div>
                {TRANSITION_GROUPS.map(group => (
                  <div key={group.label} className="space-y-1.5">
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group.label}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map(t => (
                        <button
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            draggedTransitionRef.current = t;
                            e.dataTransfer.setData("application/x-lle-transition", t.id);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onDragEnd={() => { draggedTransitionRef.current = null; setTransitionDragHover(null); }}
                          onClick={() => selected && setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: t.dur, fadeOut: t.dur, transition: t.id } : i))}
                          title={selected ? `${t.hint} — clique para aplicar no clipe selecionado, ou arraste entre dois clipes` : `${t.hint} — arraste entre dois clipes na timeline`}
                          className="flex cursor-grab flex-col items-start gap-0.5 rounded-md border border-border bg-card px-2 py-1.5 text-left hover:border-primary/60 active:cursor-grabbing">
                          <span className="flex items-center gap-1 text-[11px] font-medium leading-tight">
                            <span aria-hidden>{t.icon}</span>{t.label}
                          </span>
                          <span className="text-[9px] text-muted-foreground">{t.dur.toFixed(1)}s</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {leftPanel === "effects" && (
              <div className="space-y-2 text-xs">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Efeitos</div>
                {TIMELINE_EFFECTS.map(effect => (
                  <button key={effect.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData(EFFECT_DND_TYPE, effect.id); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => selected && applyTimelineEffect(selected.id, effect.id)}
                    title="Arraste para cima do clipe na timeline ou selecione um clipe e clique"
                    className="flex w-full cursor-grab items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left active:cursor-grabbing hover:border-ring/50">
                    <Wand2 className="h-3.5 w-3.5 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{effect.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{effect.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
        <div
          onMouseDown={(e) => { sideDragRef.current = { side: "L", startX: e.clientX, startW: leftW }; document.body.style.cursor = "ew-resize"; }}
          className="hidden w-1 shrink-0 cursor-ew-resize bg-border hover:bg-primary/40 md:block"
          title="Arraste para redimensionar"
        />


        <main className="flex min-w-0 flex-1 flex-col select-none">
          <div ref={previewShellRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-6 select-none">
            <div ref={previewBoxRef} className="group/preview relative isolate overflow-hidden rounded-lg shadow-2xl select-none"
              style={{
                aspectRatio: `${aspect.w} / ${aspect.h}`,
                maxHeight: "100%", maxWidth: "100%",
                width: previewFullscreen
                  ? `min(100vw, calc(100vh * ${aspect.w} / ${aspect.h}))`
                  : `min(100%, calc((100vh - 360px) * ${aspect.w} / ${aspect.h}))`,
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
                    key={`bg-${activeV1Video.id}-${fx.fillMode}-${fx.blurBg}`}
                    ref={videoBgElRef}
                    src={activeV1Video.url}
                    muted playsInline
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{ ...backgroundFillStyle(fx), zIndex: trackZ(activeV1Video.trackId) - 1 }}
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
                const zV = activeV1Video ? trackZ(activeV1Video.trackId) : 2;
                return <video ref={videoElRef} crossOrigin="anonymous" className="absolute inset-0 h-full w-full pointer-events-none" muted={false} playsInline style={{ ...style, objectFit: mainObjectFit(fx), zIndex: zV }} />;
              })()}

              {/* Vignette overlay for V1 video */}
              {(() => {
                const vs = vignetteStyle(activeV1Video?.fx);
                const zV = activeV1Video ? trackZ(activeV1Video.trackId) : 2;
                return vs ? <div className="pointer-events-none absolute inset-0" style={{ ...vs, zIndex: zV }} /> : null;
              })()}

              {/* Click-to-select V1 video (transparent layer above video, below overlays) */}
              {activeV1Video && activeV1Video.transform && (
                <div
                  onMouseDown={(e) => startMove(activeV1Video.id, e, activeV1Video.transform!)}
                  className="absolute inset-0 cursor-move"
                  style={{ background: "transparent", zIndex: trackZ(activeV1Video.trackId) + 1 }}
                />
              )}

              <div className={`pointer-events-none absolute inset-y-0 left-1/2 w-px transition-opacity ${snapV ? "bg-primary opacity-100" : "bg-white/10 opacity-0 group-hover/preview:opacity-30"}`} style={{ zIndex: 999 }} />
              <div className={`pointer-events-none absolute inset-x-0 top-1/2 h-px transition-opacity ${snapH ? "bg-primary opacity-100" : "bg-white/10 opacity-0 group-hover/preview:opacity-30"}`} style={{ zIndex: 999 }} />


              {/* Per-image background fill */}
              {overlays.filter(ov => ov.kind === "image" && hasBackgroundFill(ov.fx)).map(ov => {
                const fx = ov.fx;
                if (!fx) return null;
                return (
                  <img key={`imgbg-${ov.id}`} src={ov.url} alt="" draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{
                      ...backgroundFillStyle(fx),
                      zIndex: trackZ(ov.trackId) - 1,
                      opacity: computeVisualOpacity(ov, playhead),
                    }} />
                );
              })}
              {[...overlays].sort((a, b) => {
                const ai = videoTrackOrder.map[a.trackId] ?? 99;
                const bi = videoTrackOrder.map[b.trackId] ?? 99;
                return bi - ai; // trilhas inferiores primeiro no DOM, V1 por último
              }).map(ov => {
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
                    zIndex: isSel ? 40 : trackZ(ov.trackId),
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
                    filter: cssFilter(ov.fx),
                    zIndex: isSel ? 40 : trackZ(ov.trackId),
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
                  zIndex: 40,
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

              {/* WYSIWYG: motor único de render por cima do DOM (mesmo código do export).
                  pointer-events: none — o DOM por baixo segue tratando seleção/drag/handles. */}
              {useCanvasPreview && items.length > 0 && (
                <PreviewCanvas
                  aspect={aspect}
                  v1Items={previewScene.v1Items}
                  visualItems={previewScene.visualItems}
                  textItems={previewScene.textItems}
                  time={playhead}
                  playing={playing}
                />
              )}

              {/* Mobile Play Button overlay */}
              <div className="md:hidden pointer-events-none absolute inset-0 z-[45] flex items-center justify-center">
                {!playing && (
                  <button
                    onClick={() => {
                      if (playhead >= totalDuration - 0.05) setPlayhead(0);
                      setPlaying(true);
                    }}
                    className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90"
                  >
                    <Play className="h-8 w-8 fill-current ml-1" />
                  </button>
                )}
                {playing && (
                   <button
                   onClick={() => setPlaying(false)}
                   className="pointer-events-auto flex h-full w-full items-center justify-center bg-transparent"
                 />
                )}
              </div>
            </div>
          </div>
          {/* Zoom do item do preview (fora da área do preview, área central) */}
          <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-panel/60 px-3 py-1.5 text-xs text-muted-foreground">
            <button
              onClick={() => adjustPreviewItemScale(-0.1)}
              title="Diminuir item do preview"
              className="rounded p-1 hover:bg-card hover:text-foreground"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono tabular-nums">
              {(() => {
                const t = (selected && selected.transform) ? selected : activeV1Video;
                return t?.transform ? `${Math.round(t.transform.scale * 100)}%` : "—";
              })()}
            </span>
            <button
              onClick={() => adjustPreviewItemScale(0.1)}
              title="Aumentar item do preview"
              className="rounded p-1 hover:bg-card hover:text-foreground"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                const target = (selected && selected.transform) ? selected : activeV1Video;
                if (!target || !target.transform) return;
                setItems(prev => prev.map(i => i.id === target.id && i.transform
                  ? { ...i, transform: { ...i.transform, scale: 1, xPct: 50, yPct: 50 } } : i));
              }}
              title="Centralizar e resetar zoom"
              className="ml-1 rounded p-1 hover:bg-card hover:text-foreground"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
          </div>
        </main>
        <div
          onMouseDown={(e) => { sideDragRef.current = { side: "R", startX: e.clientX, startW: rightW }; document.body.style.cursor = "ew-resize"; }}
          className="hidden w-1 shrink-0 cursor-ew-resize bg-border hover:bg-primary/40 md:block"
          title="Arraste para redimensionar"
        />
        <aside className="hidden shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-panel p-3 select-none md:flex" style={{ width: rightW }}>
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

          {selected && (selected.kind === "audio" || (selected.kind === "video" && !selected.silenced)) && (
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
                <input type="range" min={0} max={Math.min(5, selected.outPoint - selected.inPoint)} step={0.05} value={getAudioFadeIn(selected)}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFadeIn: Number(e.target.value) } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFadeIn: 0 } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-10 text-right font-mono tabular-nums">{getAudioFadeIn(selected).toFixed(2)}s</span>
              </label>
              <label className="flex items-center gap-2" title="Duplo clique para restaurar">
                <span className="w-14 text-muted-foreground">Fade Out</span>
                <input type="range" min={0} max={Math.min(5, selected.outPoint - selected.inPoint)} step={0.05} value={getAudioFadeOut(selected)}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFadeOut: Number(e.target.value) } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFadeOut: 0 } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-10 text-right font-mono tabular-nums">{getAudioFadeOut(selected).toFixed(2)}s</span>
              </label>
            </div>
          )}

          {selected && (selected.kind === "audio" || (selected.kind === "video" && !selected.silenced)) && (() => {
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
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Efeito de Voz</div>
                    {(afx.voicePreset && afx.voicePreset !== "none") && (
                      <button onClick={() => patchAfx({ voicePreset: "none" })} className="text-[10px] text-muted-foreground hover:text-primary">limpar</button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { v: "none",       l: "Original" },
                      { v: "robot",      l: "Robô" },
                      { v: "monster",    l: "Monstro" },
                      { v: "alien",      l: "ET" },
                      { v: "megaphone",  l: "Megafone" },
                      { v: "telephone",  l: "Telefone" },
                      { v: "radio",      l: "Rádio" },
                      { v: "whisper",    l: "Sussurro" },
                      { v: "demon",      l: "Demônio" },
                      { v: "ghost",      l: "Fantasma" },
                      { v: "underwater", l: "Submerso" },
                      { v: "chipmunk",   l: "Esquilo" },
                    ] as { v: VoicePreset; l: string }[]).map(p => (
                      <button key={p.v} onClick={() => patchAfx({ voicePreset: p.v })}
                        className={`rounded-md border px-1.5 py-1 text-[10px] ${ (afx.voicePreset ?? "none") === p.v ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                        {p.l}
                      </button>
                    ))}
                  </div>
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
                    {(["none","room","hall","cave","outdoor","underwater", "lounge"] as Ambience[]).map(a => (
                      <button key={a} onClick={() => patchAfx({ ambience: a })}
                        className={`rounded-md border px-1.5 py-1 text-[10px] capitalize ${afx.ambience === a ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                        {a === "none" ? "off" : a === "underwater" ? "submerso" : a === "outdoor" ? "ext." : a === "room" ? "sala" : a === "hall" ? "salão" : a === "cave" ? "caverna" : a === "lounge" ? "lounge" : a}
                      </button>
                    ))}

                  </div>
                </div>

                <div className="border-t border-border pt-2">


                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Canais</div>


                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-1">
                      {(["stereo","mono"] as ChannelMode[]).map(m => (
                        <button key={m} onClick={() => patchAfx({ channelMode: m })}
                          className={`rounded-md border px-1.5 py-1 text-[10px] capitalize ${afx.channelMode === m ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                          {m === "stereo" ? "Estéreo" : "Mono"}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] font-bold text-muted-foreground uppercase">
                        <span>Balanço</span>
                        <span>
                          {afx.pan === 0 || !afx.pan 
                            ? "Centro" 
                            : afx.pan < 0 
                              ? `E ${Math.abs(Math.round(afx.pan * 100))}%` 
                              : `D ${Math.round(afx.pan * 100)}%`}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <input 
                          type="range" min="-1" max="1" step="0.01" 
                          value={afx.pan ?? 0}
                          onChange={(e) => patchAfx({ pan: Number(e.target.value), channelMode: "panned" })}
                          onDoubleClick={() => patchAfx({ pan: 0, channelMode: "stereo" })}
                          className="w-full h-1 rounded bg-muted appearance-none cursor-pointer accent-primary" 
                          title="Balanço (Pan) - Duplo clique para centralizar"
                        />
                        <div className="grid grid-cols-2 gap-4 px-0.5">
                          <ChannelMeter peak={panPeaks.L} label="E" />
                          <ChannelMeter peak={panPeaks.R} label="D" />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}


          {selected && selected.fx && (selected.kind === "image" || selected.kind === "video" || selected.kind === "text") && (() => {
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
              { key: "blur", label: "Blur", min: 0, max: 100 },
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

                {(selected.kind === "image" || selected.kind === "video") && <details className="rounded border border-border/60 bg-background/40">
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
                </details>}

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

        <div className="flex shrink-0 flex-col select-none">
          <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-2">
            <div className="flex items-center gap-0.5 sm:gap-2">
              <button
                onClick={() => {
                  if (playing) { setPlaying(false); return; }
                  if (playhead >= totalDuration - 0.05) setPlayhead(0);
                  setPlaying(true);
                }}
                disabled={!items.length}
                title={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
                aria-pressed={playing}
                className={`rounded p-1.5 hover:bg-card disabled:opacity-40 ${playing ? "text-primary animate-pulse" : ""}`}
              >
                {playing
                  ? <Pause className="h-4 w-4 fill-current" />
                  : <Play className="h-4 w-4 fill-current" />}
              </button>
              <button
                onClick={() => { setPlaying(false); setPlayhead(0); }}
                title="Voltar ao início"
                className="rounded p-1.5 hover:bg-card"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
            <div className="ml-2 flex items-center gap-1 font-mono text-[11px] tabular-nums text-primary sm:text-xs">
              <span className="font-bold">{fmt(playhead)}</span>
              <span className="text-muted-foreground">/</span>
              <span>{fmt(totalDuration)}</span>
            </div>
            <div className="flex-1" />
            <button onClick={() => splitAt(playhead)} title="Dividir (S / Ctrl+B)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary hover:text-primary">
              <Scissors className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Dividir</span>
            </button>
            <button
              onClick={() => { void startMicRecording(); }}
              title={recording ? "Parar gravação do microfone" : "Gravar do microfone"}
              aria-pressed={recording}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${recording ? "border-destructive bg-destructive/15 text-destructive animate-pulse" : "border-border bg-card hover:border-primary hover:text-primary"}`}
            >
              {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{recording ? `Rec ${recElapsed.toFixed(1)}s` : "Gravar"}</span>
            </button>
            <button
              onClick={() => setSnapResize(s => !s)}
              title={snapResize ? "Snap ativo — clipes encaixam nas bordas. Clique para desativar." : "Snap desativado — movimentação livre. Clique para ativar."}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${snapResize ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"}`}
            >
              <Magnet className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{snapResize ? "Snap" : "Snap off"}</span>
            </button>

            <button onClick={() => selected && deleteItem(selected.id)} disabled={!selected} title="Excluir (Del)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:border-destructive hover:text-destructive disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
            </button>
            <div className="hidden mx-2 h-5 w-px bg-border sm:block" />
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <Volume2 className="h-3.5 w-3.5" />
              <input type="range" min={0} max={1} step={0.05} defaultValue={1}
                onChange={(e) => { if (videoElRef.current) videoElRef.current.volume = Number(e.target.value); }}
                className="w-24 accent-[color:var(--primary)]" />
            </div>
            <div className="hidden mx-2 h-5 w-px bg-border sm:block" />
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground">
              <button onClick={() => setZoom(z => Math.max(minZoom, z - 10))} className="rounded p-1 hover:bg-card"><ZoomOut className="h-3.5 w-3.5" /></button>
              <input type="range" min={minZoom} max={Math.max(minZoom + 10, 200)} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-16 sm:w-28 accent-[color:var(--primary)]" />
              <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="rounded p-1 hover:bg-card"><ZoomIn className="h-3.5 w-3.5" /></button>
            </div>


          </div>

          <div className="flex border-t border-border">
          <div className="min-w-0 flex-1">
          <div ref={timelineRef} onMouseDown={onTimelineMouseDown}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = timelineRef.current?.getBoundingClientRect();
                if (rect) {
                  const x = touch.clientX - rect.left + timelineRef.current!.scrollLeft - labelColW;
                  setPlayhead(Math.max(0, x / zoom));
                  dragRef.current = { type: "playhead" };
                }
              }
            }}
            onScroll={(e) => {
              if (syncingScroll.current === "sb") { syncingScroll.current = null; return; }
              if (hScrollRef.current) {
                syncingScroll.current = "tl";
                hScrollRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
              }
            }}
            className="no-scrollbar relative h-[280px] min-w-0 flex-1 overflow-auto bg-track">

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
                  const lastOfKind = !nextSameKind;
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
                      <button
                        onClick={() => insertTrackAt(tr.kind, tr.kind === "video" ? idx : idx + 1)}
                        title={tr.kind === "video" ? "Adicionar trilha de vídeo acima" : "Adicionar trilha de áudio abaixo"}
                        className={`absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-primary p-0.5 text-primary-foreground opacity-0 shadow transition hover:scale-110 group-hover/row:opacity-100 ${tr.kind === "video" ? "-top-2.5" : "-bottom-2.5"}`}
                        style={{ left: labelColW / 2 }}>
                        <Plus className="h-3 w-3" />
                      </button>
                      <div
                        onDragOver={(e) => onTrackDragOver(e, tr.id)}
                        onDragLeave={onTrackDragLeave}
                        onDrop={(e) => onTrackDrop(e, tr.id)}
                        className="relative flex-1" style={{ backgroundColor: idx % 2 ? "color-mix(in oklab, var(--track) 80%, transparent)" : undefined, opacity: locked ? 0.6 : 1 }}>
                        {/* Hover preview durante arraste de transição */}
                        {transitionDragHover && transitionDragHover.trackId === tr.id && (() => {
                          const preset = getTransitionById(transitionDragHover.transitionId);
                          const w = Math.max(16, transitionDragHover.dur * zoom);
                          return (
                            <>
                              <div className="pointer-events-none absolute inset-y-0 z-30 rounded-sm border-2 border-dashed border-primary bg-primary/15"
                                style={{ left: transitionDragHover.junctionT * zoom - w / 2, width: w }} />
                              <div className="pointer-events-none absolute z-40 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow"
                                style={{ left: transitionDragHover.junctionT * zoom, top: 2 }}>
                                {preset?.icon} {preset?.label} · {transitionDragHover.dur.toFixed(2)}s
                              </div>
                            </>
                          );
                        })()}
                        {/* Chips persistentes de transições aplicadas entre clipes */}
                        {(() => {
                          const trackItems = items.filter(i => i.trackId === tr.id).sort((a, b) => a.start - b.start);
                          const chips: React.ReactNode[] = [];
                          for (let k = 0; k < trackItems.length - 1; k++) {
                            const a = trackItems[k];
                            const b = trackItems[k + 1];
                            const aEnd = a.start + (a.outPoint - a.inPoint);
                            const gap = b.start - aEnd;
                            if (Math.abs(gap) > 0.25) continue;
                            const hasTrans = ((a.fadeOut ?? 0) > 0.01) && ((b.fadeIn ?? 0) > 0.01);
                            if (!hasTrans) continue;
                            const dur = Math.max(a.fadeOut ?? 0, b.fadeIn ?? 0);
                            const transId = a.transition || b.transition;
                            const preset = getTransitionById(transId);
                            const j = (aEnd + b.start) / 2;
                            const isSel = selectedTransition?.leftId === a.id && selectedTransition?.rightId === b.id;
                            chips.push(
                              <button
                                key={`tr-${a.id}-${b.id}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setSelectedTransition({ leftId: a.id, rightId: b.id });
                                  setTransitionPopover({ leftId: a.id, rightId: b.id, x: ev.clientX, y: ev.clientY });
                                }}
                                title={`${preset?.label ?? "Transição"} · ${dur.toFixed(2)}s — clique para ajustar`}
                                className={`group/tr absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium shadow-md transition ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-primary/60 bg-background/95 text-primary hover:bg-primary hover:text-primary-foreground"}`}
                                style={{ left: j * zoom, top: "50%", transform: "translate(-50%, -50%)" }}>
                                <span aria-hidden>{preset?.icon ?? "◐"}</span>
                                <span className="max-w-[70px] truncate">{preset?.label ?? "Transição"}</span>
                                <span className="font-mono tabular-nums opacity-80">{dur.toFixed(1)}s</span>
                              </button>,
                            );
                          }
                          return chips;
                        })()}

                        {items.filter(i => i.trackId === tr.id).map(i => {
                          const dur = i.outPoint - i.inPoint;
                          const w = Math.max(20, dur * zoom);
                          const active = i.id === selectedId;
                          const color = i.kind === "audio" ? "oklch(0.55 0.15 200)" : i.kind === "text" ? "oklch(0.55 0.2 320)" : i.kind === "image" ? "oklch(0.6 0.18 80)" : "oklch(0.55 0.18 155)";
                          const visualFiW = (i.fadeIn ?? 0) * zoom;
                          const visualFoW = (i.fadeOut ?? 0) * zoom;
                          const audioFiW = getAudioFadeIn(i) * zoom;
                          const audioFoW = getAudioFadeOut(i) * zoom;
                          // Áudio (waveform/ganho/fades de áudio) só aparece em clipes de áudio.
                          // Vídeos silenciados (áudio extraído) NÃO mostram waveform — mostram filmstrip.
                          const hasAudio = i.kind === "audio" || (i.kind === "video" && !i.silenced);
                          const hasVisual = i.kind !== "audio";
                          const showFilmstrip = i.kind === "video" && !!i.url;
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
                              style={{ left: i.start * zoom, width: w, background: color, cursor: locked ? "not-allowed" : "grab" }}
                              onTouchStart={(e) => {
                                if (locked) return;
                                e.stopPropagation();
                                setSelectedId(i.id);
                              }}
                            >
                              {showFilmstrip && i.url && (
                                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-95">
                                  <VideoFilmstrip url={i.url} inPoint={i.inPoint} outPoint={i.outPoint} />
                                </div>
                              )}
                              {hasVisual && visualFiW > 0 && (
                                <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: visualFiW, background: "linear-gradient(to right, rgba(0,0,0,0.55), transparent)" }} />
                              )}
                              {hasVisual && visualFoW > 0 && (
                                <div className="pointer-events-none absolute inset-y-0 right-0" style={{ width: visualFoW, background: "linear-gradient(to left, rgba(0,0,0,0.55), transparent)" }} />
                              )}

                              <div data-handle="L" onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); const time = getTimelineTimeFromClientX(e.clientX) ?? i.start; skipHistory.current = true; lastTimelinePointer.current = { x: e.clientX, y: e.clientY }; dragRef.current = { type: "resizeL", id: i.id, origStart: i.start, origIn: i.inPoint, origEnd: i.start + (i.outPoint - i.inPoint), isImage: i.kind === "image", pointerOffsetPx: (time - i.start) * zoom }; }}
                                className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />
                              <div data-handle="R" onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); const end = i.start + (i.outPoint - i.inPoint); const time = getTimelineTimeFromClientX(e.clientX) ?? end; skipHistory.current = true; lastTimelinePointer.current = { x: e.clientX, y: e.clientY }; dragRef.current = { type: "resizeR", id: i.id, origOut: i.outPoint, pointerOffsetPx: (time - end) * zoom }; }}
                                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />

                              {hasVisual && (
                                <>
                              <div data-handle="FI" title={`Fade in: ${formatFadeLabel(i.fadeIn ?? 0)} (arraste à direita)`}
                                onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "visualFadeIn", id: i.id }; }}
                                className="absolute left-2 top-1 z-20 h-3 w-3 cursor-ew-resize rounded-full bg-white opacity-0 ring-1 ring-black/50 group-hover/clip:opacity-90"
                                style={{ left: Math.max(4, visualFiW - 6) }} />
                              <div data-handle="FO" title={`Fade out: ${formatFadeLabel(i.fadeOut ?? 0)} (arraste à esquerda)`}
                                onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "visualFadeOut", id: i.id }; }}
                                className="absolute top-1 z-20 h-3 w-3 cursor-ew-resize rounded-full bg-white opacity-0 ring-1 ring-black/50 group-hover/clip:opacity-90"
                                style={{ right: Math.max(4, visualFoW - 6) }} />
                              {(i.fadeIn ?? 0) > 0.005 && (
                                <div className="pointer-events-none absolute top-3.5 z-20 whitespace-nowrap rounded bg-black/80 px-1 text-[9px] font-mono tabular-nums text-white opacity-0 ring-1 ring-white/20 group-hover/clip:opacity-100"
                                  style={{ left: Math.max(2, visualFiW - 6) }}>
                                  {formatFadeLabel(i.fadeIn ?? 0)}
                                </div>
                              )}
                              {(i.fadeOut ?? 0) > 0.005 && (
                                <div className="pointer-events-none absolute top-3.5 z-20 whitespace-nowrap rounded bg-black/80 px-1 text-[9px] font-mono tabular-nums text-white opacity-0 ring-1 ring-white/20 group-hover/clip:opacity-100"
                                  style={{ right: Math.max(2, visualFoW - 6) }}>
                                  {formatFadeLabel(i.fadeOut ?? 0)}
                                </div>
                              )}
                                </>
                              )}
                              {(() => {
                                const d = dragRef.current;
                                if (!d || (d.type !== "visualFadeIn" && d.type !== "visualFadeOut" && d.type !== "audioFadeIn" && d.type !== "audioFadeOut") || d.id !== i.id) return null;
                                const isAudioDrag = d.type === "audioFadeIn" || d.type === "audioFadeOut";
                                const isIn = d.type === "visualFadeIn" || d.type === "audioFadeIn";
                                const labelIn = isAudioDrag ? getAudioFadeIn(i) : (i.fadeIn ?? 0);
                                const labelOut = isAudioDrag ? getAudioFadeOut(i) : (i.fadeOut ?? 0);
                                return (
                                  <div className="pointer-events-none absolute -top-5 z-30 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-primary-foreground shadow"
                                    style={isIn ? { left: Math.max(0, (isAudioDrag ? audioFiW : visualFiW) - 14) } : { right: Math.max(0, (isAudioDrag ? audioFoW : visualFoW) - 14) }}>
                                    {isIn ? `Fade in ${formatFadeLabel(labelIn)}` : `Fade out ${formatFadeLabel(labelOut)}`}
                                  </div>
                                );
                              })()}

                              {hasAudio && (() => {
                                const gainTopPct = 50 - ((i.gainDb ?? 0) / 30) * 40;
                                const fiPct = w > 0 ? Math.min(100, (audioFiW / w) * 100) : 0;
                                const foPct = w > 0 ? Math.min(100, (audioFoW / w) * 100) : 0;
                                // SVG path: começa em 0dB (top:50%) à esquerda, sobe/desce até gainTopPct após fadeIn,
                                // mantém até (100% - foPct), volta a 0dB no final.
                                return (
                                  <>
                                    {i.url && (
                                      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden opacity-70">
                                        <Waveform url={i.url} inPoint={i.inPoint} outPoint={i.outPoint} color={i.kind === "audio" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.45)"} />
                                      </div>
                                    )}
                                    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                                      <polyline
                                        points={`0,50 ${fiPct},${gainTopPct} ${100 - foPct},${gainTopPct} 100,50`}
                                        fill="none" stroke="rgb(253 224 71 / 0.9)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"
                                      />
                                    </svg>
                                    {/* Pega vertical para arrastar o ganho (área central) */}
                                    <div data-handle="G" title={`Ganho: ${(i.gainDb ?? 0).toFixed(1)}dB (arraste vertical)`}
                                      onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "gain", id: i.id, baseDb: i.gainDb ?? 0, baseY: e.clientY }; }}
                                      className="absolute z-10 h-2 cursor-ns-resize"
                                      style={{ left: `${fiPct}%`, right: `${foPct}%`, top: `calc(${gainTopPct}% - 4px)` }} />
                                    {/* Bolinha de Fade In (esquerda, sobre a linha de ganho) */}
                                    <div data-handle="AFI" title={`Fade in áudio: ${formatFadeLabel(getAudioFadeIn(i))} (arraste à direita)`}
                                      onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "audioFadeIn", id: i.id }; }}
                                      className="absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-black/60 bg-yellow-300 shadow hover:bg-yellow-200"
                                      style={{ left: `${fiPct}%`, top: `${fiPct > 0 ? gainTopPct : 50}%` }} />
                                    {/* Bolinha de Fade Out (direita, sobre a linha de ganho) */}
                                    <div data-handle="AFO" title={`Fade out áudio: ${formatFadeLabel(getAudioFadeOut(i))} (arraste à esquerda)`}
                                      onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "audioFadeOut", id: i.id }; }}
                                      className="absolute z-30 h-3 w-3 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-black/60 bg-yellow-300 shadow hover:bg-yellow-200"
                                      style={{ right: `${foPct}%`, top: `${foPct > 0 ? gainTopPct : 50}%` }} />
                                  </>
                                );
                              })()}


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
                  onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { type: "playhead" }; if (playing) setPlaying(false); }}
                  onTouchStart={(e) => { e.stopPropagation(); dragRef.current = { type: "playhead" }; if (playing) setPlaying(false); }}>
                  <div className="absolute -left-1.5 -top-1 h-3 w-3.5 rounded-sm bg-primary shadow" />
                </div>
              </div>
            </div>
          </div>
            <div
              ref={hScrollRef}
              onScroll={(e) => {
                if (syncingScroll.current === "tl") { syncingScroll.current = null; return; }
                if (timelineRef.current) {
                  syncingScroll.current = "sb";
                  timelineRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                }
              }}
              className="app-scrollbar h-3 w-full overflow-x-auto overflow-y-hidden border-t border-border bg-panel"
              title="Rolar timeline"
            >
              <div style={{ width: labelColW + rulerSpan * zoom, height: 1 }} />
            </div>
          </div>
          <div className="hidden h-[280px] shrink-0 items-stretch gap-2 border-l border-border bg-panel px-3 py-2 md:flex">
            <MasterFader label="L" db={masterDbL} setDb={setMasterDbL} peak={masterPeakL} clip={masterClipL} onClearClip={() => setMasterClipL(false)} />
            <MasterFader label="R" db={masterDbR} setDb={setMasterDbR} peak={masterPeakR} clip={masterClipR} onClearClip={() => setMasterClipR(false)} />
          </div>
          </div>
        </div>
        
        {/* Mobile Bottom Navigation Bar (CapCut style) */}
        <div className="flex h-16 shrink-0 items-center justify-around border-t border-border bg-panel px-2 md:hidden">
          {[
            { id: "media" as LeftPanel, icon: Film, label: "Mídia" },
            { id: "titles" as LeftPanel, icon: TypeIcon, label: "Texto" },
            { id: "transitions" as LeftPanel, icon: RefreshCw, label: "Transições" },
            { id: "effects" as LeftPanel, icon: Wand2, label: "Efeitos" },
          ].map(tab => {
            const Icon = tab.icon;
            const active = leftPanel === tab.id;
            return (
              <button key={tab.id} onClick={() => { setLeftPanel(tab.id); setShowMobilePanel(true); }}
                className={`flex flex-col items-center gap-1 rounded-md px-2 py-1 transition ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
          <button onClick={() => { setShowMobileInspector(true); }}
            className={`flex flex-col items-center gap-1 rounded-md px-2 py-1 transition ${selected ? "text-primary" : "text-muted-foreground"}`}>
            <Sliders className="h-5 w-5" />
            <span className="text-[10px] font-medium">Ajustes</span>
          </button>
        </div>
      </div>

      {/* Transition quick-edit popover */}
      {transitionPopover && (() => {
        const left = items.find(i => i.id === transitionPopover.leftId);
        const right = items.find(i => i.id === transitionPopover.rightId);
        if (!left || !right) return null;
        const curDur = Math.max(left.fadeOut ?? 0, right.fadeIn ?? 0);
        const transId = left.transition || right.transition;
        const preset = getTransitionById(transId);
        const maxDur = Math.min(
          5,
          left.outPoint - left.inPoint,
          right.outPoint - right.inPoint,
        );
        const updateDur = (v: number) => {
          const d = Math.max(0, Math.min(maxDur, v));
          setItems(p => p.map(i =>
            i.id === left.id ? { ...i, fadeOut: d } :
            i.id === right.id ? { ...i, fadeIn: d } : i
          ));
        };
        const setPreset = (id: string, dur: number) => {
          const d = Math.max(0, Math.min(maxDur, dur));
          setItems(p => p.map(i =>
            i.id === left.id ? { ...i, fadeOut: d, transition: id } :
            i.id === right.id ? { ...i, fadeIn: d, transition: id } : i
          ));
        };
        const remove = () => {
          setItems(p => p.map(i =>
            i.id === left.id ? { ...i, fadeOut: 0, transition: undefined } :
            i.id === right.id ? { ...i, fadeIn: 0, transition: undefined } : i
          ));
          setTransitionPopover(null);
          setSelectedTransition(null);
        };
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-72 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-2xl"
            style={{ left: Math.min(window.innerWidth - 300, transitionPopover.x - 140), top: Math.max(8, transitionPopover.y - 160) }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <span aria-hidden>{preset?.icon ?? "◐"}</span>
                <span>{preset?.label ?? "Transição"}</span>
              </div>
              <button onClick={() => setTransitionPopover(null)} className="rounded p-1 text-muted-foreground hover:bg-accent">
                <X className="h-3 w-3" />
              </button>
            </div>
            <label className="flex items-center gap-2">
              <span className="w-14 text-muted-foreground">Duração</span>
              <input
                type="range" min={0.05} max={Math.max(0.1, maxDur)} step={0.05} value={curDur}
                onChange={(e) => updateDur(Number(e.target.value))}
                className="flex-1 accent-[color:var(--primary)]"
              />
              <span className="w-12 text-right font-mono tabular-nums">{curDur.toFixed(2)}s</span>
            </label>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[0.2, 0.5, 1.0, 2.0].filter(v => v <= maxDur).map(v => (
                <button key={v} onClick={() => updateDur(v)}
                  className="rounded border border-border px-1 py-1 text-[10px] hover:border-primary hover:text-primary">
                  {v}s
                </button>
              ))}
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trocar transição</div>
              <select
                value={transId ?? ""}
                onChange={(e) => {
                  const p = getTransitionById(e.target.value);
                  if (p) setPreset(p.id, curDur > 0 ? curDur : p.dur);
                }}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
              >
                {TRANSITION_GROUPS.map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map(t => (
                      <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button onClick={remove}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded border border-border bg-background py-1.5 text-[11px] hover:border-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" /> Remover transição
            </button>
          </div>
        );
      })()}

      {/* Mobile Panels */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-[1100] flex flex-col bg-background md:hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="font-semibold uppercase tracking-wider text-muted-foreground">{leftPanel}</h3>
            <button onClick={() => setShowMobilePanel(false)} className="rounded-full bg-muted p-2">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-10">
            {leftPanel === "media" && (
              <div className="space-y-4">
                <button onClick={() => fileInputRef.current?.click()}
                  className="glow-primary flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg active:scale-95 transition-transform">
                  <Plus className="h-5 w-5" /> Adicionar Mídia
                </button>
                <div className="grid grid-cols-2 gap-3">
                  {media.map(a => {
                    const Icon = a.kind === "audio" ? Music2 : a.kind === "image" ? ImageIcon : VideoIcon;
                    return (
                      <div key={a.id} onClick={() => { addAssetToTimeline(a); setShowMobilePanel(false); }}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 text-xs shadow-sm active:bg-accent transition-colors">
                        <div className="aspect-video w-full rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-8 w-8 text-primary/60" />
                        </div>
                        <span className="px-1 truncate font-medium">{a.name}</span>
                      </div>
                    );
                  })}
                </div>
                {!media.length && <div className="p-10 text-center text-muted-foreground">Nenhuma mídia encontrada.</div>}
              </div>
            )}
            {leftPanel === "titles" && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { addText(); setShowMobilePanel(false); }} className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 shadow-sm active:bg-accent transition-colors">
                  <div className="rounded-full bg-primary/10 p-3"><TypeIcon className="h-6 w-6 text-primary" /></div>
                  <span className="font-semibold">Título</span>
                </button>
                <button onClick={() => { addCredits(); setShowMobilePanel(false); }} className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 shadow-sm active:bg-accent transition-colors">
                  <div className="rounded-full bg-primary/10 p-3"><FileText className="h-6 w-6 text-primary" /></div>
                  <span className="font-semibold">Créditos</span>
                </button>
              </div>
            )}
            {leftPanel === "transitions" && (
              <div className="grid grid-cols-2 gap-3">
                {TRANSITION_GROUPS.flatMap(g => g.items).map(t => (
                  <button key={t.id} onClick={() => { if (selected) setItems(p => p.map(i => i.id === selected.id ? { ...i, fadeIn: t.dur, fadeOut: t.dur, transition: t.id } : i)); setShowMobilePanel(false); }}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-sm active:bg-accent transition-colors">
                    <span className="text-2xl">{t.icon}</span>
                    <span className="text-[11px] font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
            )}
            {leftPanel === "effects" && (
              <div className="grid grid-cols-1 gap-3">
                {TIMELINE_EFFECTS.map(effect => (
                  <button key={effect.id} onClick={() => { if (selected) applyTimelineEffect(selected.id, effect.id); setShowMobilePanel(false); }}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm active:bg-accent transition-colors">
                    <div className="rounded-full bg-primary/10 p-3"><Wand2 className="h-6 w-6 text-primary" /></div>
                    <div>
                      <div className="font-bold text-sm">{effect.label}</div>
                      <div className="text-[11px] text-muted-foreground">{effect.hint}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showMobileInspector && (
        <div className="fixed inset-0 z-[1100] flex flex-col bg-background md:hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="font-semibold uppercase tracking-wider text-muted-foreground">Ajustes do Clip</h3>
            <button onClick={() => setShowMobileInspector(false)} className="rounded-full bg-muted p-2">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-10">
            {!selected ? (
              <div className="p-20 text-center">
                <Sliders className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
                <p className="mt-4 text-muted-foreground">Selecione um clipe na timeline para ver os ajustes.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-2">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    {selected.kind === "video" ? <VideoIcon className="text-primary" /> : selected.kind === "audio" ? <Music2 className="text-primary" /> : <ImageIcon className="text-primary" />}
                  </div>
                  <div>
                    <div className="font-bold">{selected.name}</div>
                    <div className="text-xs text-muted-foreground uppercase">{selected.kind}</div>
                  </div>
                </div>

                {/* Volume Section */}
                {(selected.kind === "audio" || (selected.kind === "video" && !selected.silenced)) && (
                  <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Volume / Ganho</span>
                      </div>
                      <span className="font-mono text-primary font-bold">{(selected.gainDb ?? 0).toFixed(1)} dB</span>
                    </div>
                    <input type="range" min="-30" max="30" step="0.5" value={selected.gainDb ?? 0}
                      onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, gainDb: Number(e.target.value) } : i))}
                      className="w-full h-2 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold px-1">
                      <span>-30dB</span>
                      <span>0dB</span>
                      <span>+30dB</span>
                    </div>
                  </div>
                )}

                {/* Audio Effects (EQ, Ambience, Reverb, Echo) */}
                {(selected.kind === "audio" || (selected.kind === "video" && !selected.silenced)) && (

                  <div className="space-y-6">
                    {/* Equalizer */}
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Sliders className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Equalizador (12 bandas)</span>
                      </div>
                      <div className="flex h-32 items-end justify-between gap-1 overflow-x-auto pb-2">
                        {EQ_BANDS.map((freq, idx) => (
                          <div key={freq} className="flex flex-col items-center gap-1 min-w-[30px]">
                            <div className="relative group/eq h-20 w-1.5 rounded-full bg-muted">
                              <div
                                className="absolute bottom-0 left-0 right-0 rounded-full bg-primary transition-all"
                                style={{ height: `${(((selected.audioFx?.eq?.[idx] ?? 0) + 18) / 36) * 100}%` }}
                              />
                              {/* Valor numérico flutuante ao ajustar */}
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-primary px-1 text-[10px] font-mono text-primary-foreground opacity-0 transition-opacity group-active/eq:opacity-100 group-hover/eq:opacity-100 pointer-events-none whitespace-nowrap z-20">
                                {(selected.audioFx?.eq?.[idx] ?? 0).toFixed(1)}
                              </div>
                              <input
                                type="range" min="-18" max="18" step="0.5"
                                value={selected.audioFx?.eq?.[idx] ?? 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setItems(p => p.map(i => {
                                    if (i.id !== selected.id) return i;
                                    const baseFx = i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] };
                                    const nextEq = [...baseFx.eq];
                                    nextEq[idx] = val;
                                    return { ...i, audioFx: { ...baseFx, eq: nextEq } };
                                  }));
                                }}
                                className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer orientation-vertical"
                                style={{ WebkitAppearance: "slider-vertical" } as CSSProperties}
                              />
                            </div>
                            <span className="text-[8px] text-muted-foreground font-mono">
                              {freq >= 1000 ? `${freq / 1000}k` : freq}
                            </span>
                          </div>
                        ))}

                      </div>
                    </div>

                    {/* Ambience & Reverb */}
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Ambiente e Reverb</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Ambiente</label>
                          <select
                            value={selected.audioFx?.ambience ?? "none"}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), ambience: e.target.value as Ambience } } : i))}

                            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                          >
                            <option value="none">Nenhum</option>
                            <option value="room">Sala</option>
                            <option value="hall">Salão</option>
                            <option value="cave">Caverna</option>
                            <option value="outdoor">Ar Livre</option>
                            <option value="underwater">Subaquático</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Preset de Reverb</label>
                          <select
                            value={selected.audioFx?.reverbPreset ?? "none"}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), reverbPreset: e.target.value as ReverbPreset } } : i))}

                            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                          >
                            <option value="none">Nenhum</option>
                            <option value="room">Quarto</option>
                            <option value="hall">Hall</option>
                            <option value="plate">Placa</option>
                            <option value="cathedral">Catedral</option>
                            <option value="auditorium">Auditório</option>
                            <option value="cinema">Cinema</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Mix do Reverb</label>
                            <span className="text-xs font-mono">{(selected.audioFx?.reverbMix ?? 0).toFixed(0)}%</span>
                          </div>
                          <input type="range" min="0" max="100" value={selected.audioFx?.reverbMix ?? 0}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), reverbMix: Number(e.target.value) } } : i))}

                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>
                      </div>
                    </div>

                    {/* Espacialização (Surround) */}
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Espacialização (Surround)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: "none", label: "Desligado" },
                          { val: "surround_light", label: "Surround Leve" },
                          { val: "surround_med", label: "Surround Médio" },
                          { val: "surround_strong", label: "Surround Forte" },
                          { val: "lounge", label: "Som Lounge" },
                        ].map((s) => (
                          <button
                            key={s.val}
                            onClick={() => {
                              setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), ambience: s.val as Ambience } } : i));
                            }}
                            className={`rounded-lg border py-2 text-xs font-medium transition-colors ${selected.audioFx?.ambience === s.val ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent"}`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Echo / Delay */}
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Eco / Delay</span>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Mix do Eco</label>
                            <span className="text-xs font-mono">{(selected.audioFx?.echoMix ?? 0).toFixed(0)}%</span>
                          </div>
                          <input type="range" min="0" max="100" value={selected.audioFx?.echoMix ?? 0}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), echoMix: Number(e.target.value) } } : i))}

                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Atraso (Delay)</label>
                            <span className="text-xs font-mono">{selected.audioFx?.echoDelay ?? 300}ms</span>
                          </div>
                          <input type="range" min="0" max="50" step="1" value={selected.audioFx?.echoDelay ?? 300}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), echoDelay: Number(e.target.value) } } : i))}

                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Feedback (Repetição)</label>
                            <span className="text-xs font-mono">{selected.audioFx?.echoFeedback ?? 30}%</span>
                          </div>
                          <input type="range" min="0" max="95" value={selected.audioFx?.echoFeedback ?? 30}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), echoFeedback: Number(e.target.value) } } : i))}

                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>
                      </div>
                    </div>

                    {/* Largura Estéreo & Posição 3D */}
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Maximize2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Largura Estéreo & Posição 3D</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Largura Estéreo</label>
                            <span className="text-xs font-mono">{(selected.audioFx?.stereoWidth ?? 100).toFixed(0)}%</span>
                          </div>
                          <input type="range" min="0" max="200" value={selected.audioFx?.stereoWidth ?? 100}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), stereoWidth: Number(e.target.value) } } : i))}
                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Profundidade (Frente ↔ Trás)</label>
                            <span className="text-xs font-mono">{(selected.audioFx?.positionDepth ?? 0) < 0 ? "Frente" : (selected.audioFx?.positionDepth ?? 0) > 0 ? "Trás" : "Centro"}</span>
                          </div>
                          <input type="range" min="-1" max="1" step="0.01" value={selected.audioFx?.positionDepth ?? 0}
                            onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), positionDepth: Number(e.target.value) } } : i))}
                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>
                      </div>
                    </div>

                    {/* Channel Mode */}
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <SettingsIcon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Modo de Canal</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { val: "stereo", label: "Estéreo" },
                          { val: "mono", label: "Mono" },
                          { val: "left", label: "Esq." },
                          { val: "right", label: "Dir." },
                          { val: "invert", label: "Inverter" },
                        ].map((m) => (
                          <button
                            key={m.val}
                            onClick={() => {
                              setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), channelMode: m.val as ChannelMode } } : i));
                            }}
                            className={`rounded-lg border py-2 text-xs font-medium transition-colors ${(selected.audioFx?.channelMode ?? "stereo") === m.val ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent"}`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      {/* Gradual Balance Control (Centro -> Esquerda/Direita) */}
                      <div className="space-y-2 mt-4">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Posição Horizontal (Pan)</label>
                          <span className="text-[10px] font-mono text-primary">
                            {selected.audioFx?.pan === 0 || !selected.audioFx?.pan ? "CENTRO" : 
                             selected.audioFx.pan < 0 ? `${Math.abs(selected.audioFx.pan * 100).toFixed(0)}% ESQ` : 
                             `${(selected.audioFx.pan * 100).toFixed(0)}% DIR`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-muted-foreground">L</span>
                          <input 
                            type="range" min="-1" max="1" step="0.01" 
                            value={selected.audioFx?.pan ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setItems(p => p.map(i => i.id === selected.id ? { ...i, audioFx: { ...(i.audioFx ?? { ...DEFAULT_AUDIO_FX_REF, eq: [...DEFAULT_AUDIO_FX_REF.eq] }), pan: val, channelMode: "panned" } } : i));
                            }}
                            className="flex-1 h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" 
                          />
                          <span className="text-[10px] font-bold text-muted-foreground">R</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual params for image/video */}
                {(selected.kind === "image" || selected.kind === "video") && selected.transform && selected.fx && (
                  <div className="space-y-6">
                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Maximize2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Transformar</span>
                      </div>
                      {([
                        { key: "scale" as const, label: "Escala", min: 0.1, max: 5, step: 0.01, reset: 1, fmt: (v: number) => v.toFixed(2) + "x" },
                        { key: "rotation" as const, label: "Rotação", min: -180, max: 180, step: 1, reset: 0, fmt: (v: number) => v.toFixed(0) + "°" },
                        { key: "xPct" as const, label: "Posição X", min: 0, max: 100, step: 0.5, reset: 50, fmt: (v: number) => v.toFixed(0) + "%" },
                        { key: "yPct" as const, label: "Posição Y", min: 0, max: 100, step: 0.5, reset: 50, fmt: (v: number) => v.toFixed(0) + "%" },
                      ]).map(p => (
                        <div key={p.key} className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">{p.label}</label>
                            <span className="text-xs font-mono">{p.fmt(selected.transform?.[p.key] ?? p.reset)}</span>
                          </div>
                          <input type="range" min={p.min} max={p.max} step={p.step}
                            value={selected.transform?.[p.key] ?? p.reset}
                            onChange={(e) => { const v = Number(e.target.value); setItems(prev => prev.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, [p.key]: v } } : i)); }}
                            onDoubleClick={() => setItems(prev => prev.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, [p.key]: p.reset } } : i))}
                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Palette className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Modo de Preenchimento</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(["bars","blur","mirror","stretch","color"] as const).map(m => (
                          <button key={m} onClick={() => setItems(p => p.map(i => i.id === selected.id && i.fx ? { ...i, fx: { ...i.fx, fillMode: m, ...(m === "blur" && i.fx.fillMode !== "blur" ? { blurBg: 30 } : {}) } } : i))}
                            className={`rounded-lg border py-2 text-xs font-medium ${selected.fx?.fillMode === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                            {m === "bars" ? "Barras" : m === "blur" ? "Blur" : m === "mirror" ? "Espelho" : m === "stretch" ? "Esticar" : "Cor"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Sliders className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Ajustes de Imagem</span>
                      </div>
                      {([
                        { key: "opacity" as const, label: "Opacidade", min: 0, max: 100, suffix: "%" },
                        { key: "brightness" as const, label: "Brilho", min: -100, max: 100 },
                        { key: "contrast" as const, label: "Contraste", min: -100, max: 100 },
                        { key: "saturation" as const, label: "Saturação", min: -100, max: 100 },
                        { key: "temperature" as const, label: "Temperatura", min: -100, max: 100 },
                        { key: "sharpness" as const, label: "Nitidez", min: 0, max: 100 },
                        { key: "exposure" as const, label: "Exposição", min: -100, max: 100 },
                        { key: "shadows" as const, label: "Sombras", min: -100, max: 100 },
                        { key: "highlights" as const, label: "Realces", min: -100, max: 100 },
                        { key: "blur" as const, label: "Blur", min: 0, max: 100 },
                      ]).map(p => (
                        <div key={p.key} className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">{p.label}</label>
                            <span className="text-xs font-mono">{(selected.fx?.[p.key] as number | undefined) ?? (p.key === "opacity" ? 100 : 0)}{p.suffix ?? ""}</span>
                          </div>
                          <input type="range" min={p.min} max={p.max}
                            value={(selected.fx?.[p.key] as number | undefined) ?? (p.key === "opacity" ? 100 : 0)}
                            onChange={(e) => { const v = Number(e.target.value); setItems(prev => prev.map(i => i.id === selected.id && i.fx ? { ...i, fx: { ...i.fx, [p.key]: v } } : i)); }}
                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4 rounded-2xl bg-card p-5 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Fade In / Fade Out</span>
                      </div>
                      {([
                        { key: "fadeIn" as const, label: "Fade In" },
                        { key: "fadeOut" as const, label: "Fade Out" },
                      ]).map(p => (
                        <div key={p.key} className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">{p.label}</label>
                            <span className="text-xs font-mono">{((selected[p.key] as number | undefined) ?? 0).toFixed(2)}s</span>
                          </div>
                          <input type="range" min={0} max={5} step={0.05}
                            value={(selected[p.key] as number | undefined) ?? 0}
                            onChange={(e) => { const v = Number(e.target.value); setItems(prev => prev.map(i => i.id === selected.id ? { ...i, [p.key]: v } : i)); }}
                            className="w-full h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-primary" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button onClick={() => { splitAt(playhead, selected.id); setShowMobileInspector(false); }}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-sm active:bg-accent transition-colors">
                    <Scissors className="h-5 w-5 text-primary" />
                    <span className="text-xs font-bold">Dividir</span>
                  </button>
                  <button onClick={() => { deleteItem(selected.id); setShowMobileInspector(false); }}
                    className="flex flex-col items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-destructive shadow-sm active:bg-destructive/10 transition-colors">
                    <Trash2 className="h-5 w-5" />
                    <span className="text-xs font-bold">Excluir</span>
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      )}



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
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Formato vinculado</label>
                <div className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  {EXPORT_PRESETS[exportPreset]?.label ?? "Personalizado"} · {ASPECTS[aspectKey].label}
                </div>
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
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resolução vinculada</label>
                <div className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  {exportTargetW}×{exportTargetH} · {quality === "2160" ? "4K" : `${quality}p`}
                </div>
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
                  <span className="rounded-md border border-primary bg-primary/15 px-3 py-1.5 text-xs text-primary">
                    WebCodecs (Hardware) — NVENC/QuickSync/VideoToolbox
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {webcodecsAvailable === null ? "Detectando suporte..." :
                      webcodecsAvailable ? `Disponível${webcodecsProbeInfo ? ` · ${webcodecsProbeInfo}` : ""}` :
                      `Indisponível neste navegador${webcodecsProbeInfo ? ` · ${webcodecsProbeInfo}` : ""}`}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Codec de vídeo</label>
                <select value={exportCodec} onChange={(e) => setExportCodec(e.target.value as Codec)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="h264">H.264 (Recomendado)</option>
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
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Renderização 100% via WebCodecs. GPU detectada: <span className="text-foreground">{gpuInfoRef.current?.vendor ?? "—"}</span>. A aceleração por hardware (NVENC/QuickSync/VideoToolbox) é usada automaticamente quando disponível.</span>
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/95 p-4">
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
                  onClick={() => {
                    setExporting(false); setExportPct(0); setExportMsg("");
                    setExportLog(prev => [...prev, "Processo encerrado."]);
                    console.warn("[EXPORT] Processo encerrado pelo usuário.");
                    setError("Exportação cancelada.");
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
