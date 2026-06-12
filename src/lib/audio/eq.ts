/**
 * Equalizador multibanda (12/20/31). Implementado com BiquadFilter (peaking)
 * em série — funciona em AudioContext e OfflineAudioContext.
 */
import { EQ_FREQS, type EqBandCount } from "./types";

export type EqGraph = {
  input: AudioNode;
  output: AudioNode;
  setGains: (gains: number[]) => void;
  setBands: (bands: EqBandCount) => void;
  dispose: () => void;
};

export function buildEq(ctx: BaseAudioContext, initialBands: EqBandCount = 12): EqGraph {
  let bands: EqBandCount = initialBands;
  let nodes: BiquadFilterNode[] = [];
  const input = ctx.createGain();
  const output = ctx.createGain();

  const rebuild = (b: EqBandCount) => {
    try { input.disconnect(); } catch { /* */ }
    for (const n of nodes) { try { n.disconnect(); } catch { /* */ } }
    nodes = EQ_FREQS[b].map((f, i, arr) => {
      const node = ctx.createBiquadFilter();
      node.type = i === 0 ? "lowshelf" : i === arr.length - 1 ? "highshelf" : "peaking";
      node.frequency.value = f;
      node.Q.value = b === 12 ? 1.0 : b === 20 ? 1.4 : 2.0;
      node.gain.value = 0;
      return node;
    });
    let prev: AudioNode = input;
    for (const n of nodes) { prev.connect(n); prev = n; }
    prev.connect(output);
  };
  rebuild(bands);

  return {
    input, output,
    setGains(gains) {
      for (let i = 0; i < nodes.length; i++) nodes[i].gain.value = gains[i] ?? 0;
    },
    setBands(b) {
      if (b === bands) return;
      bands = b;
      rebuild(b);
    },
    dispose() {
      try { input.disconnect(); } catch { /* */ }
      try { output.disconnect(); } catch { /* */ }
      for (const n of nodes) { try { n.disconnect(); } catch { /* */ } }
    },
  };
}

/** Interpola um vetor de presets para o número alvo de bandas. */
export function resampleGains(src: number[], target: number): number[] {
  if (src.length === target) return src.slice();
  const out = new Array(target).fill(0);
  for (let i = 0; i < target; i++) {
    const t = (i / (target - 1)) * (src.length - 1);
    const lo = Math.floor(t), hi = Math.min(src.length - 1, lo + 1);
    const f = t - lo;
    out[i] = src[lo] * (1 - f) + src[hi] * f;
  }
  return out;
}
