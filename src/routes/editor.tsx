import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film, Plus, Scissors, Trash2, Play, Pause, Square, Download, ArrowLeft,
  Loader2, X, Volume2, VolumeX, ZoomIn, ZoomOut, Type as TypeIcon, Music2,
  Image as ImageIcon, Video as VideoIcon, RotateCw, Maximize2, AlignCenter,
  Lock, Unlock, Undo2, Redo2, Check, Copy as CopyIcon, ClipboardPaste,
  Sparkles, Sliders, Wand2, RotateCcw, Palette,
} from "lucide-react";
import { getFFmpeg, fetchFile } from "@/lib/ffmpeg-client";

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
type TextProps = { content: string; size: number; color: string };

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

function backgroundFillStyle(fx: Fx): React.CSSProperties {
  const isBlur = fx.fillMode === "blur";
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: fx.fillMode === "stretch" ? "fill" : "cover",
    transform: `${fx.fillMode === "mirror" ? "scaleX(-1) " : ""}scale(${isBlur ? 1.4 : 1})`,
    filter: isBlur ? `blur(${Math.max(0, fx.blurBg) * 0.5}px)` : undefined,
    zIndex: 1,
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
  const base: React.CSSProperties = { position: "absolute", width: 12, height: 12, background: "var(--primary)", border: "2px solid white", borderRadius: 2, pointerEvents: "auto", zIndex: 5 };
  return (
    <>
      <div onMouseDown={(e) => onStartScale(id, e, tr)} style={{ ...base, left: -6, top: -6, cursor: "nwse-resize" }} />
      <div onMouseDown={(e) => onStartScale(id, e, tr)} style={{ ...base, right: -6, top: -6, cursor: "nesw-resize" }} />
      <div onMouseDown={(e) => onStartScale(id, e, tr)} style={{ ...base, left: -6, bottom: -6, cursor: "nesw-resize" }} />
      <div onMouseDown={(e) => onStartScale(id, e, tr)} style={{ ...base, right: -6, bottom: -6, cursor: "nwse-resize" }} />
    </>
  );
}

function Editor() {
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
  const [tlViewportW, setTlViewportW] = useState(800);
  const [quality, setQuality] = useState<Quality>("1080");

  const [trackLocked, setTrackLocked] = useState<Record<string, boolean>>({});
  const [trackMuted, setTrackMuted] = useState<Record<string, boolean>>({});

  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportMsg, setExportMsg] = useState("");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; clipId: string | null } | null>(null);
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
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
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
    const trackId = videoTracks[videoTracks.length - 1]?.id ?? ensureTrack("video");
    const start = items.filter(i => i.trackId === trackId)
      .reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0);
    const it: TLItem = {
      id: crypto.randomUUID(), kind: "text", trackId, name: "Texto",
      start, inPoint: 0, outPoint: 5, sourceDuration: 9999,
      text: { content: "Seu texto", size: 64, color: "#ffffff" },
      transform: { xPct: 50, yPct: 80, scale: 1, rotation: 0 },
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
  }, [items, tracks, ensureTrack, setItems]);

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
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
    const onClick = () => setCtxMenu(null);
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
    v *= dbToGain(i.gainDb ?? 0);
    return Math.max(0, Math.min(1, v));
  };

  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (!activeV1Video) { v.pause(); v.removeAttribute("src"); v.load(); return; }
    const wanted = activeV1Video.url!;
    if (v.src !== wanted) v.src = wanted;
    const target = activeV1Video.inPoint + (playhead - activeV1Video.start);
    if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
    v.muted = !!trackMuted[activeV1Video.trackId];
    v.volume = computeVol(activeV1Video, playhead);
    if (playing) v.play().catch(() => {}); else v.pause();
  }, [activeV1Video, playing, playhead, trackMuted]);

  useEffect(() => {
    const audios = items.filter(i => i.kind === "audio");
    for (const a of audios) {
      if (!audioRefs.current[a.id]) audioRefs.current[a.id] = new Audio(a.url!);
    }
    for (const id of Object.keys(audioRefs.current)) {
      if (!audios.find(a => a.id === id)) { audioRefs.current[id].pause(); delete audioRefs.current[id]; }
    }
    for (const a of audios) {
      const el = audioRefs.current[a.id];
      const inRange = playhead >= a.start && playhead < a.start + (a.outPoint - a.inPoint);
      el.muted = !!trackMuted[a.trackId];
      el.volume = computeVol(a, playhead);
      if (inRange) {
        const target = a.inPoint + (playhead - a.start);
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      } else if (!el.paused) el.pause();
    }
  }, [items, playing, playhead, trackMuted]);

  const overlays = items.filter(i =>
    (i.kind === "image" || i.kind === "text") &&
    playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint) &&
    !trackMuted[i.trackId]
  );

  // ---- Timeline drags ----
  type Drag =
    | { type: "move"; id: string; offsetSec: number; origTrackId: string }
    | { type: "resizeL"; id: string; origStart: number; origIn: number; origEnd: number; isImage: boolean }
    | { type: "resizeR"; id: string; origOut: number }
    | { type: "fadeIn"; id: string }
    | { type: "fadeOut"; id: string }
    | { type: "gain"; id: string; baseDb: number; baseY: number }
    | { type: "playhead" }
    | null;
  const dragRef = useRef<Drag>(null);
  const labelColW = 140;
  const trackHeight = 60;
  const rulerH = 28;

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
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xPx = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0) - labelColW;
      const tSec = Math.max(0, xPx / zoom);
      skipHistory.current = true;
      if (d.type === "playhead") setPlayhead(snapTime(tSec));
      else if (d.type === "move") {
        const newStart = snapTime(Math.max(0, tSec - d.offsetSec), d.id);
        // vertical track switching
        const tracksRect = tracksAreaRef.current?.getBoundingClientRect();
        let newTrackId = d.origTrackId;
        if (tracksRect) {
          const yPx = e.clientY - tracksRect.top;
          const idx = Math.floor(yPx / trackHeight);
          const draggedItem = items.find(i => i.id === d.id);
          const wantKind: TrackKind = draggedItem?.kind === "audio" ? "audio" : "video";
          const sameKindIdxs = tracks.map((t, i) => ({ t, i })).filter(x => x.t.kind === wantKind);
          if (sameKindIdxs.length) {
            const minI = sameKindIdxs[0].i;
            const maxI = sameKindIdxs[sameKindIdxs.length - 1].i;
            if (idx >= 0 && idx < tracks.length && tracks[idx].kind === wantKind) {
              newTrackId = tracks[idx].id;
            } else if (idx > maxI) {
              // create new track
              newTrackId = ensureTrack(wantKind);
            } else if (idx < minI) {
              newTrackId = tracks[minI].id;
            }
          }
        }
        setItems(prev => prev.map(i => i.id === d.id ? { ...i, start: newStart, trackId: newTrackId } : i), false);
      } else if (d.type === "resizeL") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const snapped = snapTime(tSec, d.id);
          if (d.isImage) {
            const newStart = Math.max(0, Math.min(d.origEnd - 0.1, snapped));
            const newOut = d.origEnd - newStart; // inPoint stays 0
            return { ...i, start: newStart, inPoint: 0, outPoint: newOut };
          }
          const delta = snapped - d.origStart;
          const newIn = Math.max(0, Math.min(i.outPoint - 0.1, d.origIn + delta));
          const newStart = Math.max(0, d.origStart + (newIn - d.origIn));
          return { ...i, start: newStart, inPoint: newIn };
        }), false);
      } else if (d.type === "resizeR") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const snapped = snapTime(tSec, d.id);
          const newOut = Math.max(i.inPoint + 0.1, Math.min(i.sourceDuration, snapped - i.start + i.inPoint));
          return { ...i, outPoint: newOut };
        }), false);
      } else if (d.type === "fadeIn") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          const f = Math.max(0, Math.min(dur, tSec - i.start));
          return { ...i, fadeIn: f };
        }), false);
      } else if (d.type === "fadeOut") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const dur = i.outPoint - i.inPoint;
          const end = i.start + dur;
          const f = Math.max(0, Math.min(dur, end - tSec));
          return { ...i, fadeOut: f };
        }), false);
      } else if (d.type === "gain") {
        const dyPx = e.clientY - d.baseY;
        const db = Math.max(-30, Math.min(12, d.baseDb - dyPx * 0.25));
        setItems(prev => prev.map(i => i.id === d.id ? { ...i, gainDb: db } : i), false);
      }
    };
    const onUp = () => {
      if (dragRef.current) {
        skipHistory.current = false;
        setItemsRaw(prev => { pushHistory(prev); return prev; });
      }
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [zoom, snapTime, setItems, pushHistory, items, tracks, ensureTrack]);

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
        const newScale = Math.max(0.1, Math.min(5, s.baseScale * ratio));
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
      ? { ...i, transform: { ...i.transform, scale: Math.max(0.1, Math.min(5, i.transform.scale + delta)) } } : i));
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
    e.stopPropagation();
    setSelectedId(id);
    const rect = previewBoxRef.current!.getBoundingClientRect();
    skipHistory.current = true;
    transformDrag.current = { id, startX: e.clientX, startY: e.clientY, baseX: tr.xPct, baseY: tr.yPct, rect };
  };
  const startScale = (id: string, e: React.MouseEvent, tr: Transform) => {
    e.stopPropagation();
    setSelectedId(id);
    const rect = previewBoxRef.current!.getBoundingClientRect();
    const cx = rect.left + (tr.xPct / 100) * rect.width;
    const cy = rect.top + (tr.yPct / 100) * rect.height;
    const baseDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    skipHistory.current = true;
    scaleDrag.current = { id, cx, cy, baseDist, baseScale: tr.scale };
  };

  // Ruler ticks
  const rulerSpan = Math.max(totalDuration + 5, 10);
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

  // ---- Export ----
  const doExport = async () => {
    const v1trackId = tracks.find(t => t.kind === "video")?.id;
    const v1clips = items.filter(i => i.trackId === v1trackId && i.kind === "video").sort((a, b) => a.start - b.start);
    if (!v1clips.length) { setError("Adicione pelo menos um vídeo na primeira trilha de vídeo."); return; }
    setExporting(true); setExportPct(0); setExportMsg("Carregando engine..."); setExportUrl(null); setError(null);
    try {
      const ff = await getFFmpeg();
      ff.on("progress", ({ progress: p }) => setExportPct(Math.max(0, Math.min(1, p))));
      const targetH = QUALITY_HEIGHT[quality];
      const targetW = Math.round((targetH * aspect.w) / aspect.h / 2) * 2;
      const inputs: string[] = [];
      for (let i = 0; i < v1clips.length; i++) {
        const c = v1clips[i];
        const inName = `in_${i}.bin`;
        const outName = `cut_${i}.mp4`;
        setExportMsg(`Processando clipe ${i + 1}/${v1clips.length}...`);
        await ff.writeFile(inName, await fetchFile(c.file!));
        const ss = c.inPoint.toFixed(3);
        const dur = (c.outPoint - c.inPoint);
        const to = dur.toFixed(3);
        const afilters: string[] = [];
        const g = dbToGain(c.gainDb ?? 0);
        if (g !== 1) afilters.push(`volume=${g.toFixed(3)}`);
        if (c.fadeIn && c.fadeIn > 0.01) afilters.push(`afade=t=in:st=0:d=${c.fadeIn.toFixed(3)}`);
        if (c.fadeOut && c.fadeOut > 0.01) afilters.push(`afade=t=out:st=${(dur - c.fadeOut).toFixed(3)}:d=${c.fadeOut.toFixed(3)}`);
        const args = [
          "-ss", ss, "-i", inName, "-t", to,
          "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1`,
        ];
        if (afilters.length) args.push("-af", afilters.join(","));
        args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2", outName);
        await ff.exec(args);
        await ff.deleteFile(inName);
        inputs.push(outName);
      }
      setExportMsg("Juntando clipes...");
      const list = inputs.map(n => `file '${n}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(list));
      await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"]);

      const vf: string[] = [];
      const firstText = items.find(i => i.kind === "text" && i.text?.content);
      if (firstText && firstText.text) {
        const t = firstText.text;
        const y = `${Math.round((firstText.transform?.yPct ?? 80) / 100 * targetH - t.size / 2)}`;
        const esc = t.content.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        vf.push(`drawtext=text='${esc}':fontcolor=${t.color}:fontsize=${t.size}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.4:boxborderw=12`);
      }

      const music = items.find(i => i.kind === "audio");
      setExportMsg("Renderizando saída...");
      const finalArgs: string[] = ["-i", "joined.mp4"];
      if (music) { await ff.writeFile("bgm.bin", await fetchFile(music.file!)); finalArgs.push("-i", "bgm.bin"); }
      if (vf.length) finalArgs.push("-vf", vf.join(","));
      if (music) {
        const mg = dbToGain(music.gainDb ?? 0) * 0.4;
        finalArgs.push(
          "-filter_complex",
          `[0:a]volume=1[a0];[1:a]volume=${mg.toFixed(3)},aloop=loop=-1:size=2e9[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
          "-map", "0:v", "-map", "[aout]",
        );
      }
      finalArgs.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "output.mp4");
      await ff.exec(finalArgs);

      const data = (await ff.readFile("output.mp4")) as Uint8Array;
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const blob = new Blob([buf], { type: "video/mp4" });
      setExportUrl(URL.createObjectURL(blob));
      setExportMsg("Pronto!"); setExportPct(1);

      for (const n of inputs) await ff.deleteFile(n).catch(() => {});
      await ff.deleteFile("list.txt").catch(() => {});
      await ff.deleteFile("joined.mp4").catch(() => {});
      await ff.deleteFile("output.mp4").catch(() => {});
      if (music) await ff.deleteFile("bgm.bin").catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na exportação");
      setExportMsg("Erro");
    } finally { setExporting(false); }
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
          <button onClick={doExport} disabled={exporting || !items.length}
            className="glow-primary inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar
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
                  title="Arraste até a timeline ou clique duas vezes"
                  className={`group flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs active:cursor-grabbing ${used ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-ring/50"}`}>
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {used && <Check className="h-3 w-3 text-primary" />}
                  <button onClick={(e) => { e.stopPropagation(); addAssetToTimeline(a); }} className="rounded p-0.5 opacity-0 hover:bg-background group-hover:opacity-100" title="Adicionar à timeline">
                    <Plus className="h-3 w-3" />
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
              {/* Background fill (blur/mirror/stretch) for V1 video */}
              {activeV1Video && activeV1Video.fx && activeV1Video.fx.fillMode !== "bars" && activeV1Video.fx.fillMode !== "color" && (
                <video
                  key={`bg-${activeV1Video.id}-${activeV1Video.fx.fillMode}`}
                  src={activeV1Video.url}
                  muted playsInline autoPlay loop
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{
                    objectFit: activeV1Video.fx.fillMode === "stretch" ? "fill" : "cover",
                    transform: `${activeV1Video.fx.fillMode === "mirror" ? "scaleX(-1)" : ""} scale(1.35)`,
                    filter: activeV1Video.fx.fillMode === "blur" ? `blur(${Math.max(16, (activeV1Video.fx.blurBg || 40) * 0.7)}px) brightness(0.7)` : undefined,
                  }}
                />
              )}
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
                return <video ref={videoElRef} className="absolute inset-0 h-full w-full object-contain pointer-events-none" muted={false} playsInline style={style} />;
              })()}

              {/* Vignette overlay for V1 video */}
              {(() => {
                const vs = vignetteStyle(activeV1Video?.fx);
                return vs ? <div className="pointer-events-none absolute inset-0" style={vs} /> : null;
              })()}

              {/* Click-to-select V1 video (transparent layer above video, below overlays) */}
              {activeV1Video && activeV1Video.transform && (
                <div
                  onMouseDown={(e) => startMove(activeV1Video.id, e, activeV1Video.transform!)}
                  className="absolute inset-0 cursor-move"
                  style={{ background: "transparent" }}
                />
              )}

              <div className={`pointer-events-none absolute inset-y-0 left-1/2 w-px transition-opacity ${snapV ? "bg-primary opacity-100" : "bg-white/10 opacity-0 group-hover/preview:opacity-30"}`} />
              <div className={`pointer-events-none absolute inset-x-0 top-1/2 h-px transition-opacity ${snapH ? "bg-primary opacity-100" : "bg-white/10 opacity-0 group-hover/preview:opacity-30"}`} />

              {/* Per-image background fill */}
              {overlays.filter(ov => ov.kind === "image" && ov.fx && ov.fx.fillMode !== "bars" && ov.fx.fillMode !== "color").map(ov => (
                <img key={`imgbg-${ov.id}`} src={ov.url} alt="" draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{
                    objectFit: ov.fx!.fillMode === "stretch" ? "fill" : "cover",
                    transform: `${ov.fx!.fillMode === "mirror" ? "scaleX(-1)" : ""} scale(1.35)`,
                    filter: ov.fx!.fillMode === "blur" ? `blur(${Math.max(16, (ov.fx!.blurBg || 40) * 0.7)}px) brightness(0.7)` : undefined,
                    opacity: computeVisualOpacity(ov, playhead),
                  }} />
              ))}
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
                  const txtStyle: React.CSSProperties = {
                    position: "absolute",
                    left: `${tr.xPct}%`, top: `${tr.yPct}%`,
                    transform: `translate(-50%,-50%) scale(${tr.scale}) rotate(${tr.rotation}deg)`,
                    color: ov.text.color, fontSize: ov.text.size, fontWeight: 700,
                    textShadow: "0 2px 12px rgba(0,0,0,0.6)", whiteSpace: "nowrap",
                    cursor: "move", padding: 4,
                    opacity: computeVisualOpacity(ov, playhead),
                    outline: isSel ? "1.5px dashed var(--primary)" : "none",
                  };
                  return (
                    <div key={ov.id} style={txtStyle} onMouseDown={(e) => startMove(ov.id, e, tr)}>
                      {ov.text.content}
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
                                const rect = timelineRef.current!.getBoundingClientRect();
                                const xPx = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0) - labelColW;
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

                              <div data-handle="L" onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "resizeL", id: i.id, origStart: i.start, origIn: i.inPoint, origEnd: i.start + (i.outPoint - i.inPoint), isImage: i.kind === "image" }; }}
                                className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />
                              <div data-handle="R" onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "resizeR", id: i.id, origOut: i.outPoint }; }}
                                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />

                              <div data-handle="FI" title="Fade in (arraste à direita)"
                                onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "fadeIn", id: i.id }; }}
                                className="absolute left-2 top-1 z-20 h-3 w-3 cursor-ew-resize rounded-full bg-white opacity-0 ring-1 ring-black/50 group-hover/clip:opacity-90"
                                style={{ left: Math.max(4, fiW - 6) }} />
                              <div data-handle="FO" title="Fade out (arraste à esquerda)"
                                onMouseDown={(e) => { if (locked) return; e.stopPropagation(); setSelectedId(i.id); skipHistory.current = true; dragRef.current = { type: "fadeOut", id: i.id }; }}
                                className="absolute top-1 z-20 h-3 w-3 cursor-ew-resize rounded-full bg-white opacity-0 ring-1 ring-black/50 group-hover/clip:opacity-90"
                                style={{ right: Math.max(4, foW - 6) }} />

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
                    <div className="absolute inset-y-0 -left-px w-0.5 bg-yellow-300 shadow-[0_0_8px_2px_rgba(253,224,71,0.85)]" />
                    <div className="absolute -left-1.5 -top-0.5 h-2 w-3 rounded-sm bg-yellow-300 shadow" />
                    <div className="absolute -left-1.5 -bottom-0.5 h-2 w-3 rounded-sm bg-yellow-300 shadow" />
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
          {selected && selected.kind === "text" && selected.text && (
            <div className="space-y-2 rounded-md border border-border bg-card p-2">
              <input value={selected.text.content}
                onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, text: { ...i.text!, content: e.target.value } } : i))}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="Texto" />
              <div className="flex items-center gap-2">
                <input type="color" value={selected.text.color}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, text: { ...i.text!, color: e.target.value } } : i))}
                  className="h-7 w-9 rounded border border-border bg-background" />
                <input type="number" min={12} max={200} value={selected.text.size}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, text: { ...i.text!, size: Number(e.target.value) || 48 } } : i))}
                  className="w-20 rounded border border-border bg-background px-2 py-1 text-xs" />
              </div>
            </div>
          )}

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
                <input type="range" min={-30} max={12} step={0.5} value={selected.gainDb ?? 0}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id ? { ...i, gainDb: Number(e.target.value) } : i))}
                  onDoubleClick={() => setItems(p => p.map(i => i.id === selected.id ? { ...i, gainDb: 0 } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-10 text-right font-mono tabular-nums">{(selected.gainDb ?? 0).toFixed(1)}dB</span>
              </label>
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
                        <button key={m} onClick={() => patchFx(m === "blur" ? { fillMode: m, blurBg: fx.blurBg || 40 } : { fillMode: m })}
                          className={`rounded border px-1.5 py-1 text-[10px] ${fx.fillMode === m ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                          {m === "bars" ? "Barras Pretas" : m === "blur" ? "Fundo Desfocado" : m === "mirror" ? "Espelhado" : m === "stretch" ? "Esticado" : "Cor"}
                        </button>
                      ))}
                    </div>
                    {fx.fillMode === "blur" && (
                      <label className="flex items-center gap-2">
                        <span className="w-20 text-muted-foreground">Blur</span>
                        <input type="range" min={0} max={100} step={1} value={fx.blurBg}
                          onChange={(e) => patchFx({ blurBg: Number(e.target.value) })}
                          className="flex-1 accent-[color:var(--primary)]" />
                        <span className="w-10 text-right font-mono tabular-nums">{fx.blurBg}</span>
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
                    {fx.zoom && (
                      <div className="grid grid-cols-3 gap-1">
                        {(["slow","med","fast"] as const).map(s => (
                          <button key={s} onClick={() => patchFx({ zoom: { dir: fx.zoom!.dir, speed: s } })}
                            className={`rounded border px-1.5 py-1 text-[10px] ${fx.zoom!.speed === s ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-ring/50"}`}>
                            {s === "slow" ? "Lenta" : s === "med" ? "Média" : "Rápida"}
                          </button>
                        ))}
                      </div>
                    )}
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

      {(exporting || exportUrl || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{exportUrl ? "Exportação concluída" : exporting ? "Exportando..." : "Atenção"}</h3>
              {!exporting && (
                <button onClick={() => { setExportUrl(null); setError(null); setExportPct(0); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {exporting && (<>
              <p className="mt-3 text-xs text-muted-foreground">{exportMsg}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(exportPct * 100)}%` }} />
              </div>
              <div className="mt-2 text-right text-xs text-muted-foreground">{Math.round(exportPct * 100)}%</div>
            </>)}
            {exportUrl && (<>
              <video src={exportUrl} controls className="mt-4 w-full rounded-md" />
              <a href={exportUrl} download={`video-lite-editor-${Date.now()}.mp4`}
                className="glow-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Download className="h-4 w-4" /> Baixar MP4
              </a>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
