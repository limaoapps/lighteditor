import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film, Upload, Music2, Type, Scissors, Trash2, Play, Pause, Square,
  Download, ArrowLeft, Loader2, X, SplitSquareHorizontal, Volume2,
} from "lucide-react";
import { getFFmpeg, fetchFile } from "@/lib/ffmpeg-client";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor — Video Lite Editor" },
      { name: "description", content: "Edite vídeos no navegador: importar, cortar, juntar, exportar." },
    ],
  }),
  component: Editor,
});

type Clip = {
  id: string;
  name: string;
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
  trimStart: number;
  trimEnd: number;
};

type TextOverlay = {
  text: string;
  size: number;
  color: string;
  position: "top" | "center" | "bottom";
};

type Quality = "720" | "1080" | "2160";

const QUALITY_HEIGHT: Record<Quality, number> = { "720": 720, "1080": 1080, "2160": 2160 };

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

async function probeVideo(file: File): Promise<{ url: string; duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    v.onloadedmetadata = () => resolve({ url, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => reject(new Error("Não foi possível ler o vídeo"));
  });
}

function Editor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [music, setMusic] = useState<{ file: File; url: string; name: string } | null>(null);
  const [musicVol, setMusicVol] = useState(0.4);
  const [videoVol, setVideoVol] = useState(1);
  const [overlay, setOverlay] = useState<TextOverlay>({ text: "", size: 48, color: "#ffffff", position: "bottom" });
  const [showText, setShowText] = useState(false);
  const [quality, setQuality] = useState<Quality>("1080");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportMsg, setExportMsg] = useState("");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const selected = clips.find(c => c.id === selectedId) ?? null;

  const onImportVideos = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const incoming: Clip[] = [];
    for (const file of Array.from(files)) {
      try {
        const meta = await probeVideo(file);
        incoming.push({
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url: meta.url,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          trimStart: 0,
          trimEnd: meta.duration,
        });
      } catch (e) {
        setError(`Falha ao importar ${file.name}`);
      }
    }
    setClips(prev => {
      const next = [...prev, ...incoming];
      if (!selectedId && next[0]) setSelectedId(next[0].id);
      return next;
    });
  }, [selectedId]);

  const onImportMusic = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setMusic({ file, url: URL.createObjectURL(file), name: file.name });
  }, []);

  // Sync selected clip into the <video>
  useEffect(() => {
    if (!videoRef.current || !selected) return;
    if (videoRef.current.src !== selected.url) {
      videoRef.current.src = selected.url;
      videoRef.current.currentTime = selected.trimStart;
    }
  }, [selected]);

  const play = () => { videoRef.current?.play(); };
  const pause = () => { videoRef.current?.pause(); };
  const stop = () => {
    const v = videoRef.current; if (!v || !selected) return;
    v.pause(); v.currentTime = selected.trimStart; setProgress(selected.trimStart);
  };

  const splitClip = () => {
    if (!selected || !videoRef.current) return;
    const t = videoRef.current.currentTime;
    if (t <= selected.trimStart + 0.1 || t >= selected.trimEnd - 0.1) return;
    const left: Clip = { ...selected, id: crypto.randomUUID(), trimEnd: t };
    const right: Clip = { ...selected, id: crypto.randomUUID(), trimStart: t };
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === selected.id);
      const copy = [...prev];
      copy.splice(idx, 1, left, right);
      return copy;
    });
    setSelectedId(left.id);
  };

  const deleteClip = (id: string) => {
    setClips(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveClip = (id: string, dir: -1 | 1) => {
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  // Drag & drop reorder
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDropOn = (id: string) => {
    const from = dragId.current; dragId.current = null;
    if (!from || from === id) return;
    setClips(prev => {
      const a = prev.findIndex(c => c.id === from);
      const b = prev.findIndex(c => c.id === id);
      if (a < 0 || b < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(a, 1);
      copy.splice(b, 0, item);
      return copy;
    });
  };

  // Export pipeline using ffmpeg.wasm
  const doExport = async () => {
    if (!clips.length) { setError("Importe pelo menos um vídeo."); return; }
    setExporting(true); setExportPct(0); setExportMsg("Carregando engine..."); setExportUrl(null); setError(null);
    try {
      const ff = await getFFmpeg();
      ff.on("progress", ({ progress: p }) => setExportPct(Math.max(0, Math.min(1, p))));

      const targetH = QUALITY_HEIGHT[quality];
      const inputs: string[] = [];

      // Trim each clip into a normalized intermediate
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const inName = `in_${i}.bin`;
        const outName = `cut_${i}.mp4`;
        setExportMsg(`Processando clipe ${i + 1}/${clips.length}...`);
        await ff.writeFile(inName, await fetchFile(c.file));
        const ss = c.trimStart.toFixed(3);
        const to = (c.trimEnd - c.trimStart).toFixed(3);
        await ff.exec([
          "-ss", ss, "-i", inName, "-t", to,
          "-vf", `scale=-2:${targetH}:flags=lanczos,fps=30,setsar=1`,
          "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-ar", "44100", "-ac", "2",
          outName,
        ]);
        await ff.deleteFile(inName);
        inputs.push(outName);
      }

      // Concat list
      setExportMsg("Juntando clipes...");
      const list = inputs.map(n => `file '${n}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(list));
      await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"]);

      // Final pass: text overlay + music mix + volume
      let finalInput = "joined.mp4";
      const vf: string[] = [];
      if (showText && overlay.text.trim()) {
        const y = overlay.position === "top" ? "40" : overlay.position === "center" ? "(h-text_h)/2" : "h-text_h-40";
        const esc = overlay.text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        vf.push(`drawtext=text='${esc}':fontcolor=${overlay.color}:fontsize=${overlay.size}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.4:boxborderw=12`);
      }

      setExportMsg("Renderizando saída final...");
      const finalArgs: string[] = ["-i", finalInput];
      if (music) {
        await ff.writeFile("bgm.bin", await fetchFile(music.file));
        finalArgs.push("-i", "bgm.bin");
      }
      if (vf.length) finalArgs.push("-vf", vf.join(","));

      if (music) {
        finalArgs.push(
          "-filter_complex",
          `[0:a]volume=${videoVol}[a0];[1:a]volume=${musicVol},aloop=loop=-1:size=2e9[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
          "-map", "0:v", "-map", "[aout]",
        );
      }

      finalArgs.push(
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-shortest", "output.mp4",
      );
      await ff.exec(finalArgs);

      const data = await ff.readFile("output.mp4");
      const blob = new Blob([data as Uint8Array], { type: "video/mp4" });
      setExportUrl(URL.createObjectURL(blob));
      setExportMsg("Pronto!");
      setExportPct(1);

      // Cleanup
      for (const n of inputs) await ff.deleteFile(n).catch(() => {});
      await ff.deleteFile("list.txt").catch(() => {});
      await ff.deleteFile("joined.mp4").catch(() => {});
      await ff.deleteFile("output.mp4").catch(() => {});
      if (music) await ff.deleteFile("bgm.bin").catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na exportação";
      setError(msg);
      setExportMsg("Erro");
    } finally {
      setExporting(false);
    }
  };

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
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as Quality)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
          >
            <option value="720">720p</option>
            <option value="1080">1080p</option>
            <option value="2160">4K</option>
          </select>
          <button
            onClick={doExport}
            disabled={exporting || !clips.length}
            className="glow-primary inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left tools */}
        <aside className="flex w-60 shrink-0 flex-col gap-1 border-r border-border bg-panel p-3">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ferramentas</div>
          <ToolBtn icon={Upload} label="Importar Vídeo" onClick={() => videoInputRef.current?.click()} />
          <ToolBtn icon={Music2} label="Importar Música" onClick={() => musicInputRef.current?.click()} />
          <ToolBtn icon={Type} label="Adicionar Texto" onClick={() => setShowText(s => !s)} active={showText} />
          <ToolBtn icon={Scissors} label="Cortar (no clipe)" onClick={() => {}} disabled />
          <ToolBtn icon={SplitSquareHorizontal} label="Dividir Clipe" onClick={splitClip} disabled={!selected} />
          <ToolBtn icon={Trash2} label="Excluir Clipe" onClick={() => selected && deleteClip(selected.id)} disabled={!selected} />

          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/*" multiple hidden onChange={(e) => onImportVideos(e.target.files)} />
          <input ref={musicInputRef} type="file" accept="audio/mpeg,audio/wav,audio/*" hidden onChange={(e) => onImportMusic(e.target.files)} />

          {music && (
            <div className="mt-2 rounded-md border border-border bg-card p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Music2 className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{music.name}</span>
                </div>
                <button onClick={() => setMusic(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
              <SliderRow label="Música" value={musicVol} onChange={setMusicVol} />
              <SliderRow label="Vídeo" value={videoVol} onChange={setVideoVol} />
            </div>
          )}

          {showText && (
            <div className="mt-2 space-y-2 rounded-md border border-border bg-card p-2 text-xs">
              <input
                value={overlay.text}
                onChange={(e) => setOverlay(o => ({ ...o, text: e.target.value }))}
                placeholder="Seu texto..."
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
              />
              <div className="flex items-center gap-2">
                <input type="color" value={overlay.color} onChange={(e) => setOverlay(o => ({ ...o, color: e.target.value }))} className="h-7 w-9 rounded border border-border bg-background" />
                <input type="number" min={12} max={144} value={overlay.size} onChange={(e) => setOverlay(o => ({ ...o, size: Number(e.target.value) || 48 }))} className="w-16 rounded border border-border bg-background px-2 py-1 text-xs" />
                <select value={overlay.position} onChange={(e) => setOverlay(o => ({ ...o, position: e.target.value as TextOverlay["position"] }))} className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs">
                  <option value="top">Topo</option>
                  <option value="center">Centro</option>
                  <option value="bottom">Inferior</option>
                </select>
              </div>
            </div>
          )}
        </aside>

        {/* Center: preview + timeline */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Preview */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-6">
            {selected ? (
              <video
                ref={videoRef}
                className="max-h-full max-w-full rounded-lg shadow-2xl"
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  setProgress(v.currentTime);
                  if (selected && v.currentTime >= selected.trimEnd) { v.pause(); v.currentTime = selected.trimEnd; }
                }}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <Film className="mx-auto mb-3 h-10 w-10 opacity-50" />
                Importe um vídeo para começar.
              </div>
            )}

            {/* Overlay preview */}
            {showText && overlay.text && selected && (
              <div
                className="pointer-events-none absolute inset-x-0 px-8 text-center font-semibold"
                style={{
                  color: overlay.color,
                  fontSize: `${Math.max(14, overlay.size / 2)}px`,
                  top: overlay.position === "top" ? "10%" : overlay.position === "center" ? "50%" : "auto",
                  bottom: overlay.position === "bottom" ? "10%" : "auto",
                  transform: overlay.position === "center" ? "translateY(-50%)" : undefined,
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {overlay.text}
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-2">
            <button onClick={play} disabled={!selected} className="rounded p-1.5 hover:bg-card disabled:opacity-40"><Play className="h-4 w-4" /></button>
            <button onClick={pause} disabled={!selected} className="rounded p-1.5 hover:bg-card disabled:opacity-40"><Pause className="h-4 w-4" /></button>
            <button onClick={stop} disabled={!selected} className="rounded p-1.5 hover:bg-card disabled:opacity-40"><Square className="h-4 w-4" /></button>
            <div className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">{fmt(progress)} / {fmt(duration)}</div>
            <input
              type="range" min={0} max={duration || 0} step={0.01} value={progress}
              onChange={(e) => { const t = Number(e.target.value); if (videoRef.current) videoRef.current.currentTime = t; setProgress(t); }}
              className="mx-3 flex-1 accent-[color:var(--primary)]"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5" />
              <input
                type="range" min={0} max={1} step={0.05}
                onChange={(e) => { if (videoRef.current) videoRef.current.volume = Number(e.target.value); }}
                defaultValue={1} className="w-24 accent-[color:var(--primary)]"
              />
            </div>
          </div>

          {/* Trim controls for selected clip */}
          {selected && (
            <div className="grid grid-cols-2 gap-3 border-t border-border bg-panel px-4 py-3 text-xs">
              <label className="flex items-center gap-2">
                <span className="w-16 text-muted-foreground">Início</span>
                <input
                  type="number" min={0} max={selected.duration} step={0.1} value={selected.trimStart.toFixed(2)}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(Number(e.target.value), selected.trimEnd - 0.1));
                    setClips(prev => prev.map(c => c.id === selected.id ? { ...c, trimStart: v } : c));
                  }}
                  className="w-24 rounded border border-border bg-background px-2 py-1"
                />
                <span className="text-muted-foreground">s</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16 text-muted-foreground">Fim</span>
                <input
                  type="number" min={0} max={selected.duration} step={0.1} value={selected.trimEnd.toFixed(2)}
                  onChange={(e) => {
                    const v = Math.max(selected.trimStart + 0.1, Math.min(Number(e.target.value), selected.duration));
                    setClips(prev => prev.map(c => c.id === selected.id ? { ...c, trimEnd: v } : c));
                  }}
                  className="w-24 rounded border border-border bg-background px-2 py-1"
                />
                <span className="text-muted-foreground">s</span>
              </label>
            </div>
          )}

          {/* Timeline */}
          <div className="h-40 shrink-0 overflow-x-auto border-t border-border bg-track p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</div>
              <div className="text-[10px] text-muted-foreground">{clips.length} clipe{clips.length !== 1 ? "s" : ""} · arraste para reordenar</div>
            </div>
            <div className="flex h-24 items-stretch gap-2">
              {clips.map((c) => {
                const dur = c.trimEnd - c.trimStart;
                const w = Math.max(80, Math.min(360, dur * 12));
                const active = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => onDragStart(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropOn(c.id)}
                    onClick={() => setSelectedId(c.id)}
                    className={`group relative flex shrink-0 cursor-pointer flex-col justify-between rounded-md border p-2 text-xs transition ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-ring/50"}`}
                    style={{ width: w }}
                  >
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{fmt(dur)} · {c.width}×{c.height}</span>
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); moveClip(c.id, -1); }} className="rounded px-1 hover:bg-background">‹</button>
                        <button onClick={(e) => { e.stopPropagation(); moveClip(c.id, 1); }} className="rounded px-1 hover:bg-background">›</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteClip(c.id); }} className="rounded px-1 hover:bg-background"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!clips.length && (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  Sem clipes — clique em "Importar Vídeo"
                </div>
              )}
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
            {exporting && (
              <>
                <p className="mt-3 text-xs text-muted-foreground">{exportMsg}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(exportPct * 100)}%` }} />
                </div>
                <div className="mt-2 text-right text-xs text-muted-foreground">{Math.round(exportPct * 100)}%</div>
              </>
            )}
            {exportUrl && (
              <>
                <video src={exportUrl} controls className="mt-4 w-full rounded-md" />
                <a
                  href={exportUrl}
                  download={`video-lite-editor-${Date.now()}.mp4`}
                  className="glow-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Download className="h-4 w-4" /> Baixar MP4
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ icon: Icon, label, onClick, disabled, active }: { icon: typeof Film; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-card"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-12 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[color:var(--primary)]" />
      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{Math.round(value * 100)}</span>
    </div>
  );
}
