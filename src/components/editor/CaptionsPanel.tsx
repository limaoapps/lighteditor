import { useRef, useState } from "react";
import { Captions, Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import {
  transcribeAudio,
  toSRT,
  downloadBlob,
  type CaptionSegment,
  type LoadProgress,
} from "@/lib/captions";

export type CaptionSource = {
  id: string;
  label: string;
  /** URL do arquivo (blob:) ou string acessível por fetch. */
  url: string;
  /** Offset em segundos do clipe na timeline (para alinhar legendas). */
  timelineStart: number;
  /** Recorte de origem em segundos (Whisper transcreve o arquivo inteiro; usamos isso para filtrar). */
  inPoint?: number;
  outPoint?: number;
};

type Props = {
  sources: CaptionSource[];
  /** Adiciona segmentos como itens de texto na timeline. */
  onAddToTimeline: (segments: CaptionSegment[]) => void;
};

const LANGS: Array<{ code: string | undefined; label: string }> = [
  { code: undefined, label: "Auto-detectar" },
  { code: "pt", label: "Português" },
  { code: "en", label: "Inglês" },
  { code: "es", label: "Espanhol" },
  { code: "fr", label: "Francês" },
  { code: "de", label: "Alemão" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "Japonês" },
];

export function CaptionsPanel({ sources, onAddToTimeline }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [lang, setLang] = useState<string | undefined>("pt");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<number | null>(null);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const lastSourceRef = useRef<CaptionSource | null>(null);

  const src = sources.find(s => s.id === selectedId) ?? sources[0];

  async function handleTranscribe() {
    if (!src) return;
    setBusy(true);
    setStatus("Iniciando...");
    setProgress(null);
    setSegments([]);
    lastSourceRef.current = src;
    try {
      const segs = await transcribeAudio(src.url, {
        language: lang,
        onStatus: (s) => setStatus(s),
        onProgress: (p: LoadProgress) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            setProgress(p.progress);
            setStatus(`Baixando modelo (${p.file ?? ""}) ${p.progress.toFixed(0)}%`);
          } else if (p.status === "done") {
            setProgress(100);
          } else if (p.status === "ready") {
            setProgress(null);
            setStatus("Modelo pronto. Transcrevendo...");
          }
        },
      });
      // Filtra pelo recorte (inPoint/outPoint) se houver.
      const inP = src.inPoint ?? 0;
      const outP = src.outPoint ?? Number.POSITIVE_INFINITY;
      const filtered = segs
        .filter(s => s.end > inP && s.start < outP)
        .map(s => ({
          start: Math.max(0, s.start - inP),
          end: Math.max(0, Math.min(outP, s.end) - inP),
          text: s.text,
        }));
      setSegments(filtered);
      setStatus(`${filtered.length} segmentos prontos.`);
    } catch (e) {
      console.error("Whisper falhou:", e);
      setStatus(`Erro: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function handleDownloadSRT() {
    if (!segments.length || !src) return;
    const srt = toSRT(segments, src.timelineStart);
    downloadBlob(new Blob([srt], { type: "text/plain;charset=utf-8" }), `legendas-${src.label}.srt`);
  }

  function handleAdd() {
    if (!segments.length || !src) return;
    // Aplica offset da timeline aos segmentos antes de enviar.
    const offset = src.timelineStart;
    onAddToTimeline(segments.map(s => ({
      start: s.start + offset,
      end: s.end + offset,
      text: s.text,
    })));
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Captions className="h-3 w-3 text-primary" /> Auto-Legendas IA (offline)
      </div>

      <div className="rounded-md border border-border bg-card p-2.5 text-[11px] text-muted-foreground">
        Whisper-small (~250MB) roda 100% no seu navegador. O modelo é baixado na 1ª vez e fica em cache para usos offline.
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fonte de áudio</label>
        <select
          value={src?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={busy || !sources.length}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
        >
          {!sources.length && <option value="">Nenhum áudio/vídeo na timeline</option>}
          {sources.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Idioma</label>
        <select
          value={lang ?? ""}
          onChange={(e) => setLang(e.target.value || undefined)}
          disabled={busy}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
        >
          {LANGS.map(l => <option key={l.label} value={l.code ?? ""}>{l.label}</option>)}
        </select>
      </div>

      <button
        onClick={handleTranscribe}
        disabled={busy || !src}
        className="glow-primary inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {busy ? "Transcrevendo..." : "Transcrever"}
      </button>

      {(status || progress != null) && (
        <div className="space-y-1 rounded-md border border-border bg-background/40 p-2">
          <div className="truncate text-[10px] text-muted-foreground">{status}</div>
          {progress != null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}

      {!!segments.length && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs text-primary hover:bg-primary/20"
            >
              <Sparkles className="h-3.5 w-3.5" /> Aplicar na Timeline
            </button>
            <button
              onClick={handleDownloadSRT}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:border-ring/50"
            >
              <Download className="h-3.5 w-3.5" /> Baixar .srt
            </button>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border bg-background/40 p-2">
            {segments.map((s, i) => (
              <div key={i} className="rounded border border-border/40 bg-card/40 p-1.5 text-[11px]">
                <div className="font-mono text-[9px] text-muted-foreground">
                  {s.start.toFixed(2)}s → {s.end.toFixed(2)}s
                </div>
                <div className="text-foreground">{s.text}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
