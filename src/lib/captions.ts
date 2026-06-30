// Auto-Legendas IA — Whisper offline via @huggingface/transformers (WASM).
// Modelo "small" (~250MB no 1º uso, cacheado depois).
import { pipeline, env, type Pipeline } from "@huggingface/transformers";

export type CaptionSegment = { start: number; end: number; text: string };

// Permitir cache local no IndexedDB para uso 100% offline após primeiro download.
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriberPromise: Promise<Pipeline> | null = null;

export type LoadProgress = {
  status: "initiate" | "download" | "progress" | "done" | "ready";
  file?: string;
  progress?: number; // 0..100
  loaded?: number;
  total?: number;
};

/** Carrega (e cacheia) o modelo Whisper-small. */
export function loadWhisper(onProgress?: (p: LoadProgress) => void): Promise<Pipeline> {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",
      {
        quantized: true,
        progress_callback: (p: LoadProgress) => { try { onProgress?.(p); } catch { /* ignore */ } },
      } as unknown as Record<string, unknown>,
    ) as unknown as Promise<Pipeline>;
  }
  return transcriberPromise;
}

/** Decodifica um arquivo/URL de áudio para Float32 mono 16kHz (formato esperado pelo Whisper). */
export async function decodeAudioMono16k(src: File | Blob | string): Promise<Float32Array> {
  const buf = typeof src === "string"
    ? await (await fetch(src)).arrayBuffer()
    : await src.arrayBuffer();
  const AC: typeof AudioContext = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const tmp = new AC();
  const decoded = await tmp.decodeAudioData(buf.slice(0));
  await tmp.close().catch(() => {});
  // Mixdown para mono
  const ch = decoded.numberOfChannels;
  const len = decoded.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
  }
  if (decoded.sampleRate === 16000) return mono;
  // Resample para 16kHz via OfflineAudioContext
  const targetLen = Math.round(len * (16000 / decoded.sampleRate));
  const off = new OfflineAudioContext(1, targetLen, 16000);
  const ab = off.createBuffer(1, len, decoded.sampleRate);
  ab.copyToChannel(mono, 0);
  const node = off.createBufferSource();
  node.buffer = ab;
  node.connect(off.destination);
  node.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Transcreve áudio em segmentos com timestamps. `language` ISO-639-1 ('pt','en'...) ou undefined para auto. */
export async function transcribeAudio(
  src: File | Blob | string,
  opts: {
    language?: string;
    onProgress?: (p: LoadProgress) => void;
    onStatus?: (s: string) => void;
  } = {},
): Promise<CaptionSegment[]> {
  opts.onStatus?.("Carregando modelo Whisper-small (offline)...");
  const transcriber = await loadWhisper(opts.onProgress);
  opts.onStatus?.("Decodificando áudio...");
  const audio = await decodeAudioMono16k(src);
  opts.onStatus?.(`Transcrevendo ${(audio.length / 16000).toFixed(1)}s de áudio...`);
  const out = await (transcriber as unknown as (
    a: Float32Array,
    o: Record<string, unknown>,
  ) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number | null]; text: string }> }>)(
    audio,
    {
      language: opts.language,
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    },
  );
  const chunks = out.chunks ?? [];
  const segs: CaptionSegment[] = chunks
    .filter(c => c.text && c.text.trim())
    .map(c => ({
      start: Number(c.timestamp[0] ?? 0),
      end: Number(c.timestamp[1] ?? c.timestamp[0] ?? 0) + 0.001,
      text: c.text.trim(),
    }))
    .filter(s => s.end > s.start);
  opts.onStatus?.(`${segs.length} segmentos gerados.`);
  return segs;
}

/** Converte segundos em "HH:MM:SS,mmm" (formato SRT). */
function fmtSRT(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Serializa segmentos como string SRT. */
export function toSRT(segments: CaptionSegment[], offset = 0): string {
  return segments
    .map((s, i) => `${i + 1}\n${fmtSRT(s.start + offset)} --> ${fmtSRT(s.end + offset)}\n${s.text}\n`)
    .join("\n");
}

/** Dispara download de um Blob no navegador. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
