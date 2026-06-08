/**
 * Cache simples de picos de áudio (waveform) por URL.
 * Decodifica uma vez com AudioContext.decodeAudioData e retorna pares min/max
 * em resolução fixa para desenho rápido em canvas.
 */

const PEAKS_RES = 2000; // amostras totais por arquivo (min/max)

export type Peaks = {
  min: Float32Array;
  max: Float32Array;
  duration: number; // segundos
};

const cache = new Map<string, Peaks>();
const pending = new Map<string, Promise<Peaks | null>>();
const failed = new Set<string>();

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  try {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
    return _ctx;
  } catch { return null; }
}

export function getCachedPeaks(url: string): Peaks | null {
  return cache.get(url) ?? null;
}

export async function loadPeaks(url: string): Promise<Peaks | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  if (failed.has(url)) return null;
  if (pending.has(url)) return pending.get(url)!;
  const p = (async () => {
    try {
      const ctx = getCtx();
      if (!ctx) return null;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = await res.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const channels = audio.numberOfChannels;
      const length = audio.length;
      const samplesPerBucket = Math.max(1, Math.floor(length / PEAKS_RES));
      const min = new Float32Array(PEAKS_RES);
      const max = new Float32Array(PEAKS_RES);
      // Mistura canais
      const chData: Float32Array[] = [];
      for (let c = 0; c < channels; c++) chData.push(audio.getChannelData(c));
      for (let i = 0; i < PEAKS_RES; i++) {
        const start = i * samplesPerBucket;
        const end = Math.min(length, start + samplesPerBucket);
        let mn = 1, mx = -1;
        for (let s = start; s < end; s++) {
          let v = 0;
          for (let c = 0; c < channels; c++) v += chData[c][s];
          v /= channels;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        min[i] = mn;
        max[i] = mx;
      }
      const peaks: Peaks = { min, max, duration: audio.duration };
      cache.set(url, peaks);
      return peaks;
    } catch (e) {
      console.warn("[waveform] falhou decodificar", url, e);
      failed.add(url);
      return null;
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, p);
  return p;
}
