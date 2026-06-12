/** Gera IR sintético para presets de reverb (ambientes). */
import { REVERB_ENV_LIST, type ReverbEnv } from "./types";

export type IRSpec = { duration: number; decay: number; predelay: number; brightness: number };

export function specForEnv(env: ReverbEnv, sizeOverride?: number, decayOverride?: number, predelayOverride?: number): IRSpec {
  const e = REVERB_ENV_LIST.find((x) => x.id === env) ?? REVERB_ENV_LIST[1];
  const size = sizeOverride ?? e.size;
  return {
    duration: Math.max(0.1, 0.4 + size * 6),
    decay: decayOverride ?? e.decay,
    predelay: predelayOverride ?? e.predelay,
    brightness: e.brightness,
  };
}

export function generateIR(ctx: BaseAudioContext, spec: IRSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(spec.duration * sr));
  const pre = Math.max(0, Math.floor(spec.predelay * sr));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let prev = 0;
    const lp = Math.max(0, Math.min(0.99, 1 - spec.brightness));
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp(-spec.decay * t);
      const n = (Math.random() * 2 - 1) * env;
      prev = prev * lp + n * (1 - lp);
      data[i] = prev;
    }
  }
  return buf;
}
