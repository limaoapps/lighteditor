import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film, Plus, Scissors, Trash2, Play, Pause, Square, Download, ArrowLeft,
  Loader2, X, Volume2, ZoomIn, ZoomOut, Type as TypeIcon, Music2, Image as ImageIcon,
  Video as VideoIcon, RotateCw, Maximize2, AlignCenter,
} from "lucide-react";
import { getFFmpeg, fetchFile } from "@/lib/ffmpeg-client";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor — Video Lite Editor" },
      { name: "description", content: "Editor de vídeo no navegador com timeline multi-trilha, agulha, tesoura e zoom." },
    ],
  }),
  component: Editor,
});

type ItemKind = "video" | "audio" | "image" | "text";
type TrackId = "V1" | "V2" | "V3" | "A1" | "A2";

type Transform = { xPct: number; yPct: number; scale: number; rotation: number };
type TextProps = { content: string; size: number; color: string };

type TLItem = {
  id: string;
  kind: ItemKind;
  trackId: TrackId;
  name: string;
  file?: File;
  url?: string;
  start: number;       // timeline position (s)
  inPoint: number;     // source in (s)
  outPoint: number;    // source out (s)
  sourceDuration: number;
  width?: number;
  height?: number;
  transform?: Transform;
  text?: TextProps;
};

type AspectKey = "16:9" | "9:16" | "1:1" | "4:3" | "custom";
const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  "16:9": { w: 16, h: 9, label: "16:9 · YouTube" },
  "9:16": { w: 9, h: 16, label: "9:16 · TikTok/Reels" },
  "1:1":  { w: 1, h: 1, label: "1:1 · Instagram" },
  "4:3":  { w: 4, h: 3, label: "4:3 · Clássico" },
  "custom": { w: 16, h: 9, label: "Personalizado" },
};

const TRACKS: { id: TrackId; label: string; kind: "video" | "audio" }[] = [
  { id: "V1", label: "V1 · Principal", kind: "video" },
  { id: "V2", label: "V2 · Sobreposição", kind: "video" },
  { id: "V3", label: "V3 · Textos", kind: "video" },
  { id: "A1", label: "A1 · Áudio", kind: "audio" },
  { id: "A2", label: "A2 · Música", kind: "audio" },
];

type Quality = "720" | "1080" | "2160";
const QUALITY_HEIGHT: Record<Quality, number> = { "720": 720, "1080": 1080, "2160": 2160 };

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${cs}`;
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

function Editor() {
  const [aspectKey, setAspectKey] = useState<AspectKey>("16:9");
  const [customAR, setCustomAR] = useState({ w: 16, h: 9 });
  const aspect = aspectKey === "custom" ? customAR : ASPECTS[aspectKey];

  const [items, setItems] = useState<TLItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(40); // px per second
  const [quality, setQuality] = useState<Quality>("1080");

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportMsg, setExportMsg] = useState("");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTick = useRef<number>(0);

  const selected = items.find(i => i.id === selectedId) ?? null;
  const totalDuration = useMemo(
    () => items.reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0),
    [items]
  );

  // Add files
  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const newItems: TLItem[] = [];
    for (const file of Array.from(files)) {
      const kind = detectKind(file);
      if (!kind) { setError(`Tipo não suportado: ${file.name}`); continue; }
      try {
        const meta = await probeMedia(file, kind);
        const trackId: TrackId = kind === "audio" ? "A2" : kind === "image" ? "V2" : "V1";
        // Find end of last item on that track
        const start = items.concat(newItems).filter(i => i.trackId === trackId)
          .reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0);
        newItems.push({
          id: crypto.randomUUID(),
          kind, trackId, name: file.name, file, url: meta.url,
          start, inPoint: 0, outPoint: meta.duration, sourceDuration: meta.duration,
          width: meta.width, height: meta.height,
          transform: kind === "image" || kind === "video" ? { xPct: 50, yPct: 50, scale: 1, rotation: 0 } : undefined,
        });
      } catch {
        setError(`Falha ao ler ${file.name}`);
      }
    }
    if (newItems.length) {
      setItems(prev => [...prev, ...newItems]);
      setSelectedId(newItems[0].id);
    }
  }, [items]);

  const addText = useCallback(() => {
    const start = items.filter(i => i.trackId === "V3")
      .reduce((m, i) => Math.max(m, i.start + (i.outPoint - i.inPoint)), 0);
    const it: TLItem = {
      id: crypto.randomUUID(), kind: "text", trackId: "V3", name: "Texto",
      start, inPoint: 0, outPoint: 5, sourceDuration: 9999,
      text: { content: "Seu texto", size: 64, color: "#ffffff" },
      transform: { xPct: 50, yPct: 80, scale: 1, rotation: 0 },
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
  }, [items]);

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const splitAt = useCallback((t: number) => {
    // Split items containing playhead t
    setItems(prev => {
      const out: TLItem[] = [];
      let newSel: string | null = selectedId;
      for (const it of prev) {
        const dur = it.outPoint - it.inPoint;
        const end = it.start + dur;
        if (t > it.start + 0.05 && t < end - 0.05) {
          const off = t - it.start;
          const left: TLItem = { ...it, id: crypto.randomUUID(), outPoint: it.inPoint + off };
          const right: TLItem = { ...it, id: crypto.randomUUID(), start: t, inPoint: it.inPoint + off };
          out.push(left, right);
          if (selectedId === it.id) newSel = left.id;
        } else out.push(it);
      }
      setSelectedId(newSel);
      return out;
    });
  }, [selectedId]);

  // Keyboard shortcut Ctrl+B
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        splitAt(playhead);
      } else if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setPlaying(p => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [splitAt, playhead]);

  // Playback master clock
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

  // Current visible V1 video item
  const activeV1Video = useMemo(() => {
    return items.find(i =>
      (i.trackId === "V1") && i.kind === "video" &&
      playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint)
    ) ?? null;
  }, [items, playhead]);

  // Sync <video>
  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (!activeV1Video) { v.pause(); v.removeAttribute("src"); v.load(); return; }
    const wanted = activeV1Video.url!;
    if (v.src !== wanted) { v.src = wanted; }
    const target = activeV1Video.inPoint + (playhead - activeV1Video.start);
    if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
    if (playing) v.play().catch(() => {}); else v.pause();
  }, [activeV1Video, playing, playhead]);

  // Sync audio tracks
  useEffect(() => {
    const audios = items.filter(i => i.kind === "audio");
    // Ensure elements
    for (const a of audios) {
      if (!audioRefs.current[a.id]) {
        const el = new Audio(a.url!);
        audioRefs.current[a.id] = el;
      }
    }
    // Cleanup removed
    for (const id of Object.keys(audioRefs.current)) {
      if (!audios.find(a => a.id === id)) { audioRefs.current[id].pause(); delete audioRefs.current[id]; }
    }
    for (const a of audios) {
      const el = audioRefs.current[a.id];
      const inRange = playhead >= a.start && playhead < a.start + (a.outPoint - a.inPoint);
      if (inRange) {
        const target = a.inPoint + (playhead - a.start);
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      } else if (!el.paused) el.pause();
    }
  }, [items, playing, playhead]);

  // Active overlay items at playhead (images V2 + text V3)
  const overlays = items.filter(i =>
    (i.kind === "image" || i.kind === "text") &&
    playhead >= i.start && playhead < i.start + (i.outPoint - i.inPoint)
  );

  // --- Timeline interactions ---
  type Drag =
    | { type: "move"; id: string; offsetSec: number }
    | { type: "resizeL"; id: string; origStart: number; origIn: number }
    | { type: "resizeR"; id: string; origOut: number }
    | { type: "playhead" }
    | null;
  const dragRef = useRef<Drag>(null);

  const onTimelineMouseDown = (e: React.MouseEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    if ((e.target as HTMLElement).dataset.role === "ruler" || (e.target as HTMLElement).dataset.role === "playhead") {
      dragRef.current = { type: "playhead" };
      const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0) - 120;
      setPlayhead(Math.max(0, x / zoom));
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xPx = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0) - 120;
      const tSec = Math.max(0, xPx / zoom);
      if (d.type === "playhead") setPlayhead(tSec);
      else if (d.type === "move") {
        setItems(prev => prev.map(i => i.id === d.id ? { ...i, start: Math.max(0, tSec - d.offsetSec) } : i));
      } else if (d.type === "resizeL") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const delta = tSec - d.origStart;
          const newIn = Math.max(0, Math.min(i.outPoint - 0.1, d.origIn + delta));
          const newStart = Math.max(0, d.origStart + (newIn - d.origIn));
          return { ...i, start: newStart, inPoint: newIn };
        }));
      } else if (d.type === "resizeR") {
        setItems(prev => prev.map(i => {
          if (i.id !== d.id) return i;
          const newOut = Math.max(i.inPoint + 0.1, Math.min(i.sourceDuration, tSec - i.start + i.inPoint));
          return { ...i, outPoint: newOut };
        }));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [zoom]);

  // --- Preview transform drag ---
  const transformDrag = useRef<{ id: string; startX: number; startY: number; baseX: number; baseY: number; rect: DOMRect } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = transformDrag.current; if (!d) return;
      const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
      const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
      setItems(prev => prev.map(i => i.id === d.id && i.transform
        ? { ...i, transform: { ...i.transform, xPct: Math.max(0, Math.min(100, d.baseX + dx)), yPct: Math.max(0, Math.min(100, d.baseY + dy)) } }
        : i));
    };
    const onUp = () => { transformDrag.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Ruler ticks
  const rulerSpan = Math.max(totalDuration + 5, 10);
  const tickStep = zoom < 20 ? 10 : zoom < 40 ? 5 : zoom < 80 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= rulerSpan; t += tickStep) ticks.push(t);

  // --- Export pipeline (concat V1 videos + optional A2 music + first V3 text overlay) ---
  const doExport = async () => {
    const v1clips = items.filter(i => i.trackId === "V1" && i.kind === "video").sort((a, b) => a.start - b.start);
    if (!v1clips.length) { setError("Adicione pelo menos um vídeo na trilha V1."); return; }
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
        const to = (c.outPoint - c.inPoint).toFixed(3);
        await ff.exec([
          "-ss", ss, "-i", inName, "-t", to,
          "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1`,
          "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-ar", "44100", "-ac", "2",
          outName,
        ]);
        await ff.deleteFile(inName);
        inputs.push(outName);
      }
      setExportMsg("Juntando clipes...");
      const list = inputs.map(n => `file '${n}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(list));
      await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"]);

      const vf: string[] = [];
      const firstText = items.find(i => i.trackId === "V3" && i.kind === "text" && i.text?.content);
      if (firstText && firstText.text) {
        const t = firstText.text;
        const y = `${Math.round((firstText.transform?.yPct ?? 80) / 100 * targetH - t.size / 2)}`;
        const esc = t.content.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        vf.push(`drawtext=text='${esc}':fontcolor=${t.color}:fontsize=${t.size}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.4:boxborderw=12`);
      }

      const music = items.find(i => i.trackId === "A2" && i.kind === "audio");
      setExportMsg("Renderizando saída...");
      const finalArgs: string[] = ["-i", "joined.mp4"];
      if (music) {
        await ff.writeFile("bgm.bin", await fetchFile(music.file!));
        finalArgs.push("-i", "bgm.bin");
      }
      if (vf.length) finalArgs.push("-vf", vf.join(","));
      if (music) {
        finalArgs.push(
          "-filter_complex",
          `[0:a]volume=1[a0];[1:a]volume=0.4,aloop=loop=-1:size=2e9[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
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

  const trackHeight = 56;
  const labelColW = 120;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
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
        {/* Left: media & properties */}
        <aside className="flex w-64 shrink-0 flex-col gap-2 border-r border-border bg-panel p-3">
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
            onChange={(e) => addFiles(e.target.files)} />

          <div className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mídia</div>
          <div className="flex-1 space-y-1 overflow-y-auto pr-1">
            {items.map(it => {
              const Icon = it.kind === "audio" ? Music2 : it.kind === "image" ? ImageIcon : it.kind === "text" ? TypeIcon : VideoIcon;
              return (
                <button key={it.id} onClick={() => setSelectedId(it.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${selectedId === it.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-ring/50"}`}>
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  <span className="text-[10px] text-muted-foreground">{it.trackId}</span>
                </button>
              );
            })}
            {!items.length && <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">Clique em "Adicionar Arquivo".</div>}
          </div>

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
              <label className="flex items-center gap-2"><Maximize2 className="h-3 w-3" />
                <input type="range" min={0.1} max={3} step={0.05} value={selected.transform.scale}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, scale: Number(e.target.value) } } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-8 text-right font-mono tabular-nums">{selected.transform.scale.toFixed(2)}</span>
              </label>
              <label className="flex items-center gap-2"><RotateCw className="h-3 w-3" />
                <input type="range" min={-180} max={180} step={1} value={selected.transform.rotation}
                  onChange={(e) => setItems(p => p.map(i => i.id === selected.id && i.transform ? { ...i, transform: { ...i.transform, rotation: Number(e.target.value) } } : i))}
                  className="flex-1 accent-[color:var(--primary)]" />
                <span className="w-8 text-right font-mono tabular-nums">{selected.transform.rotation}°</span>
              </label>
            </div>
          )}
        </aside>

        {/* Center */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Preview */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-6">
            <div ref={previewBoxRef} className="relative overflow-hidden rounded-lg bg-black shadow-2xl"
              style={{ aspectRatio: `${aspect.w} / ${aspect.h}`, maxHeight: "100%", maxWidth: "100%", width: `min(100%, calc((100vh - 360px) * ${aspect.w} / ${aspect.h}))` }}>
              <video ref={videoElRef} className="absolute inset-0 h-full w-full object-contain" muted={false} playsInline />
              {overlays.map(ov => {
                const tr = ov.transform!;
                const isSel = ov.id === selectedId;
                const common: React.CSSProperties = {
                  position: "absolute",
                  left: `${tr.xPct}%`, top: `${tr.yPct}%`,
                  transform: `translate(-50%,-50%) scale(${tr.scale}) rotate(${tr.rotation}deg)`,
                  cursor: "move", outline: isSel ? "2px dashed var(--primary)" : "none", outlineOffset: 4,
                };
                const onMD = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setSelectedId(ov.id);
                  const rect = previewBoxRef.current!.getBoundingClientRect();
                  transformDrag.current = { id: ov.id, startX: e.clientX, startY: e.clientY, baseX: tr.xPct, baseY: tr.yPct, rect };
                };
                if (ov.kind === "image") {
                  return <img key={ov.id} src={ov.url} alt="" style={common} className="max-w-[80%]" onMouseDown={onMD} draggable={false} />;
                }
                if (ov.kind === "text" && ov.text) {
                  return <div key={ov.id} style={{ ...common, color: ov.text.color, fontSize: ov.text.size, fontWeight: 700, textShadow: "0 2px 12px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }} onMouseDown={onMD}>{ov.text.content}</div>;
                }
                return null;
              })}
              {!items.length && (
                <div className="absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground">
                  <div><Film className="mx-auto mb-2 h-10 w-10 opacity-40" />Adicione um arquivo para começar.</div>
                </div>
              )}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-2">
            <button onClick={() => setPlaying(true)} disabled={!items.length} className="rounded p-1.5 hover:bg-card disabled:opacity-40"><Play className="h-4 w-4" /></button>
            <button onClick={() => setPlaying(false)} className="rounded p-1.5 hover:bg-card"><Pause className="h-4 w-4" /></button>
            <button onClick={() => { setPlaying(false); setPlayhead(0); }} className="rounded p-1.5 hover:bg-card"><Square className="h-4 w-4" /></button>
            <div className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">{fmt(playhead)} / {fmt(totalDuration)}</div>
            <div className="flex-1" />
            <button onClick={() => splitAt(playhead)} title="Dividir no playhead (Ctrl+B)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary hover:text-primary">
              <Scissors className="h-3.5 w-3.5" /> Dividir
            </button>
            <button onClick={() => selected && deleteItem(selected.id)} disabled={!selected}
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
              <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="rounded p-1 hover:bg-card"><ZoomOut className="h-3.5 w-3.5" /></button>
              <input type="range" min={10} max={160} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-[color:var(--primary)]" />
              <button onClick={() => setZoom(z => Math.min(160, z + 10))} className="rounded p-1 hover:bg-card"><ZoomIn className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {/* Timeline */}
          <div ref={timelineRef} onMouseDown={onTimelineMouseDown}
            className="relative h-[260px] shrink-0 overflow-x-auto border-t border-border bg-track">
            <div className="relative" style={{ width: labelColW + rulerSpan * zoom, minWidth: "100%" }}>
              {/* Ruler */}
              <div data-role="ruler" className="sticky top-0 z-20 flex h-7 cursor-ew-resize select-none border-b border-border bg-panel">
                <div className="shrink-0 border-r border-border bg-panel" style={{ width: labelColW }} />
                <div className="relative flex-1" style={{ height: 28 }}>
                  {ticks.map(t => (
                    <div key={t} className="absolute top-0 h-full" style={{ left: t * zoom }}>
                      <div className="h-3 w-px bg-border" />
                      <div className="absolute left-1 top-2 text-[10px] tabular-nums text-muted-foreground">{t}s</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tracks */}
              <div className="relative">
                {TRACKS.map((tr, idx) => (
                  <div key={tr.id} className="flex border-b border-border" style={{ height: trackHeight }}>
                    <div className="flex shrink-0 items-center gap-2 border-r border-border bg-panel px-3 text-[11px] text-muted-foreground" style={{ width: labelColW }}>
                      {tr.kind === "video" ? <VideoIcon className="h-3 w-3" /> : <Music2 className="h-3 w-3" />}
                      {tr.label}
                    </div>
                    <div className="relative flex-1" style={{ backgroundColor: idx % 2 ? "color-mix(in oklab, var(--track) 80%, transparent)" : undefined }}>
                      {items.filter(i => i.trackId === tr.id).map(i => {
                        const dur = i.outPoint - i.inPoint;
                        const w = Math.max(20, dur * zoom);
                        const active = i.id === selectedId;
                        const color = i.kind === "audio" ? "oklch(0.55 0.15 200)" : i.kind === "text" ? "oklch(0.55 0.2 320)" : i.kind === "image" ? "oklch(0.6 0.18 80)" : "oklch(0.55 0.18 155)";
                        return (
                          <div key={i.id}
                            onMouseDown={(e) => {
                              if ((e.target as HTMLElement).dataset.handle) return;
                              e.stopPropagation(); setSelectedId(i.id);
                              const rect = timelineRef.current!.getBoundingClientRect();
                              const xPx = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0) - labelColW;
                              dragRef.current = { type: "move", id: i.id, offsetSec: xPx / zoom - i.start };
                            }}
                            className={`absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded-md text-[10px] text-white shadow ${active ? "ring-2 ring-primary" : "ring-1 ring-black/30"}`}
                            style={{ left: i.start * zoom, width: w, background: color, cursor: "grab" }}>
                            <div data-handle="L" onMouseDown={(e) => { e.stopPropagation(); setSelectedId(i.id); dragRef.current = { type: "resizeL", id: i.id, origStart: i.start, origIn: i.inPoint }; }}
                              className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />
                            <div data-handle="R" onMouseDown={(e) => { e.stopPropagation(); setSelectedId(i.id); dragRef.current = { type: "resizeR", id: i.id, origOut: i.outPoint }; }}
                              className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white" />
                            <div className="pointer-events-none truncate px-2 font-medium">{i.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Playhead */}
                <div data-role="playhead"
                  className="pointer-events-auto absolute top-0 z-30 w-0.5 cursor-ew-resize bg-primary"
                  style={{ left: labelColW + playhead * zoom, height: TRACKS.length * trackHeight }}
                  onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { type: "playhead" }; }}>
                  <div className="absolute -left-1.5 -top-1 h-3 w-3.5 rounded-sm bg-primary shadow" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Export modal */}
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
