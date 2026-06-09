/**
 * Voice Effects modulares (Web Audio API).
 *
 * Cada efeito é uma função que recebe um BaseAudioContext (AudioContext ou
 * OfflineAudioContext) e devolve `{ input, output, dispose }`. Assim os
 * mesmos blocos DSP rodam tanto na pré‑visualização (AudioContext em tempo
 * real) quanto na exportação (OfflineAudioContext), garantindo WYSIWYG.
 *
 * Sistema extensível:
 *   import { voiceEffects } from "@/lib/audio-effects";
 *   const fx = voiceEffects.robot(ctx);
 *   source.connect(fx.input); fx.output.connect(destination);
 */

export type VoiceEffectName =
  | "normal"
  | "robot"
  | "monster"
  | "demon"
  | "megaphone"
  | "radio"
  | "telephone"
  | "alien"
  | "child"
  | "helium"
  | "ghost"
  | "cave";

export type VoiceEffectParams = Record<string, number>;

export type VoiceEffectNode = {
  input: AudioNode;
  output: AudioNode;
  dispose: () => void;
};

export type VoiceEffectFactory = (ctx: BaseAudioContext, params?: VoiceEffectParams) => VoiceEffectNode;

/** Definição dos parâmetros expostos para a UI por preset. */
export type VoiceParamDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
};

export const VOICE_PARAM_DEFS: Partial<Record<VoiceEffectName, VoiceParamDef[]>> = {
  radio: [
    { key: "noise", label: "Ruído", min: 0, max: 1, step: 0.01, default: 0.25, unit: "" },
    { key: "drive", label: "Distorção", min: 0, max: 1, step: 0.01, default: 0.18 },
  ],
  alien: [
    { key: "pitch", label: "Pitch", min: -12, max: 12, step: 1, default: 5, unit: "st" },
    { key: "phaserDepth", label: "Phaser", min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: "phaserRate", label: "Phaser Hz", min: 0.05, max: 4, step: 0.05, default: 0.6 },
    { key: "chorusDepth", label: "Chorus", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "chorusRate", label: "Chorus Hz", min: 0.1, max: 6, step: 0.1, default: 1.4 },
  ],
  robot: [
    { key: "ringHz", label: "Ring Hz", min: 10, max: 200, step: 1, default: 50 },
    { key: "drive", label: "Distorção", min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  monster: [
    { key: "pitch", label: "Pitch", min: -24, max: 0, step: 1, default: -8, unit: "st" },
    { key: "drive", label: "Distorção", min: 0, max: 1, step: 0.01, default: 0.55 },
  ],
  demon: [
    { key: "pitch", label: "Pitch", min: -24, max: 0, step: 1, default: -12, unit: "st" },
    { key: "reverb", label: "Reverb", min: 0, max: 1, step: 0.01, default: 0.65 },
    { key: "drive", label: "Distorção", min: 0, max: 1, step: 0.01, default: 0.45 },
  ],
  megaphone: [
    { key: "drive", label: "Distorção", min: 0, max: 1, step: 0.01, default: 0.22 },
  ],
  telephone: [
    { key: "lowCut", label: "Corte grave Hz", min: 200, max: 800, step: 10, default: 400 },
    { key: "highCut", label: "Corte agudo Hz", min: 1500, max: 5000, step: 50, default: 3000 },
  ],
};

export function defaultVoiceParams(name: VoiceEffectName | string | null | undefined): VoiceEffectParams {
  const defs = (name && isVoiceEffectName(name)) ? VOICE_PARAM_DEFS[name] : undefined;
  const out: VoiceEffectParams = {};
  if (defs) for (const d of defs) out[d.key] = d.default;
  return out;
}

function p(params: VoiceEffectParams | undefined, key: string, fallback: number): number {
  const v = params?.[key];
  return typeof v === "number" && !isNaN(v) ? v : fallback;
}

/* ============================================================
 * Building blocks
 * ============================================================ */

function makeDistortionCurve(amount: number, n = 2048): Float32Array {
  const k = Math.max(0, Math.min(1, amount)) * 100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makeSoftClipCurve(drive: number, n = 1024): Float32Array {
  const c = new Float32Array(n);
  const d = 1 + Math.max(0, Math.min(1, drive)) * 9;
  const norm = Math.tanh(d);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.tanh(x * d) / norm;
  }
  return c;
}

/** Ruído branco contínuo (loop) — usado em "Rádio". */
function createNoiseSource(ctx: BaseAudioContext, level = 0.04): {
  source: AudioBufferSourceNode;
  gain: GainNode;
} {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * 2, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(g);
  try {
    src.start(ctx.currentTime);
  } catch {
    /* ignore */
  }
  return { source: src, gain: g };
}

/** Reverb por convolução com IR sintético (decay exponencial). */
function createReverb(
  ctx: BaseAudioContext,
  duration = 1.8,
  decay = 2.2,
  brightness = 0.5,
): ConvolverNode {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(duration * sr));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let prev = 0;
    const lp = Math.max(0, Math.min(0.99, 1 - brightness));
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-decay * t);
      const n = (Math.random() * 2 - 1) * env;
      prev = prev * lp + n * (1 - lp);
      data[i] = prev;
    }
  }
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = buf;
  return conv;
}

/** Ring modulator (multiplica sinal por oscilador). */
function createRingMod(
  ctx: BaseAudioContext,
  freq: number,
  depth = 1,
): { input: GainNode; output: GainNode; dispose: () => void } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const mult = ctx.createGain();
  mult.gain.value = 0;
  // bias: mult.gain = 1 + osc*depth → para depth=1, alterna 0..2 (AM puro).
  const bias = ctx.createConstantSource();
  bias.offset.value = 1 - depth; // depth=1 → bias 0 → ring puro
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = Math.max(0.1, freq);
  const dGain = ctx.createGain();
  dGain.gain.value = depth;
  bias.connect(mult.gain);
  osc.connect(dGain);
  dGain.connect(mult.gain);
  input.connect(mult);
  mult.connect(output);
  try {
    bias.start();
    osc.start();
  } catch {
    /* ignore */
  }
  return {
    input,
    output,
    dispose: () => {
      try {
        osc.stop();
        bias.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Pitch shifter no estilo "Jungle" (Chris Wilson): dois delays modulados
 * por rampas sawtooth com crossfade. Funciona em Online e Offline contexts.
 */
function createPitchShift(
  ctx: BaseAudioContext,
  semitones: number,
): VoiceEffectNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (Math.abs(semitones) < 0.01) {
    input.connect(output);
    return { input, output, dispose: () => {} };
  }

  const delayTime = 0.1;
  const fadeTime = 0.05;
  const sr = ctx.sampleRate;
  const fadeSamples = Math.round(fadeTime * sr);
  const dlySamples = Math.round(delayTime * sr);
  const totalSamples = fadeSamples * 2 + dlySamples;

  function fadeBuffer(active: boolean): AudioBuffer {
    const b = ctx.createBuffer(1, totalSamples, sr);
    const a = b.getChannelData(0);
    for (let i = 0; i < totalSamples; i++) {
      let v = 0;
      if (i < fadeSamples) v = active ? i / fadeSamples : 1 - i / fadeSamples;
      else if (i < fadeSamples + dlySamples) v = active ? 1 : 0;
      else {
        const j = i - fadeSamples - dlySamples;
        v = active ? 1 - j / fadeSamples : j / fadeSamples;
      }
      a[i] = v;
    }
    return b;
  }

  const shiftUp = semitones > 0;
  function delayBuffer(): AudioBuffer {
    const b = ctx.createBuffer(1, totalSamples, sr);
    const a = b.getChannelData(0);
    for (let i = 0; i < fadeSamples + dlySamples; i++) {
      a[i] = shiftUp
        ? (fadeSamples + dlySamples - i) / sr
        : i / sr;
    }
    return b;
  }

  const ratio = Math.abs(Math.pow(2, semitones / 12) - 1);

  const fade1 = ctx.createGain();
  fade1.gain.value = 0;
  const fade2 = ctx.createGain();
  fade2.gain.value = 0;
  const mod1 = ctx.createBufferSource();
  const mod2 = ctx.createBufferSource();
  mod1.buffer = fadeBuffer(true);
  mod2.buffer = fadeBuffer(false);
  mod1.loop = true;
  mod2.loop = true;
  mod1.connect(fade1.gain);
  mod2.connect(fade2.gain);

  const mod3 = ctx.createBufferSource();
  const mod4 = ctx.createBufferSource();
  mod3.buffer = delayBuffer();
  mod4.buffer = delayBuffer();
  mod3.loop = true;
  mod4.loop = true;
  const mod3Gain = ctx.createGain();
  mod3Gain.gain.value = ratio;
  const mod4Gain = ctx.createGain();
  mod4Gain.gain.value = ratio;
  mod3.connect(mod3Gain);
  mod4.connect(mod4Gain);

  const delay1 = ctx.createDelay();
  const delay2 = ctx.createDelay();
  delay1.delayTime.value = 0;
  delay2.delayTime.value = 0;
  mod3Gain.connect(delay1.delayTime);
  mod4Gain.connect(delay2.delayTime);

  input.connect(delay1);
  input.connect(delay2);
  delay1.connect(fade1);
  delay2.connect(fade2);
  fade1.connect(output);
  fade2.connect(output);

  const t0 = (ctx as AudioContext).currentTime + 0.02;
  try {
    mod1.start(t0);
    mod2.start(t0 + delayTime - fadeTime);
    mod3.start(t0);
    mod4.start(t0 + delayTime - fadeTime);
  } catch {
    /* ignore */
  }

  return {
    input,
    output,
    dispose: () => {
      try {
        mod1.stop();
        mod2.stop();
        mod3.stop();
        mod4.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Phaser: cascata de allpass modulados por LFO. */
function createPhaser(
  ctx: BaseAudioContext,
  rate = 0.5,
  depth = 800,
  base = 700,
  stages = 4,
): { input: GainNode; output: GainNode; dispose: () => void } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.7;
  const dry = ctx.createGain();
  dry.gain.value = 0.6;

  const filters: BiquadFilterNode[] = [];
  for (let i = 0; i < stages; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "allpass";
    f.frequency.value = base * (i + 1);
    f.Q.value = 5;
    filters.push(f);
  }
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain);
  filters.forEach((f) => lfoGain.connect(f.frequency));

  input.connect(dry);
  dry.connect(output);
  let prev: AudioNode = input;
  for (const f of filters) {
    prev.connect(f);
    prev = f;
  }
  prev.connect(wet);
  wet.connect(output);

  try {
    lfo.start();
  } catch {
    /* ignore */
  }
  return {
    input,
    output,
    dispose: () => {
      try {
        lfo.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Chorus simples: delay modulado por LFO + mix wet/dry. */
function createChorus(
  ctx: BaseAudioContext,
  rate = 1.2,
  depth = 0.003,
  baseDelay = 0.022,
): { input: GainNode; output: GainNode; dispose: () => void } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  const wet = ctx.createGain();
  wet.gain.value = 0.6;

  const delay = ctx.createDelay();
  delay.delayTime.value = baseDelay;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);

  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(wet);
  wet.connect(output);

  try {
    lfo.start();
  } catch {
    /* ignore */
  }
  return {
    input,
    output,
    dispose: () => {
      try {
        lfo.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/* ============================================================
 * Helper de cadeia
 * ============================================================ */

function chain(
  ctx: BaseAudioContext,
  nodes: Array<AudioNode | { input: AudioNode; output: AudioNode; dispose?: () => void }>,
): VoiceEffectNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const disposers: Array<() => void> = [];
  let prev: AudioNode = input;
  for (const n of nodes) {
    if ((n as { input: AudioNode }).input && (n as { output: AudioNode }).output) {
      const sub = n as { input: AudioNode; output: AudioNode; dispose?: () => void };
      prev.connect(sub.input);
      prev = sub.output;
      if (sub.dispose) disposers.push(sub.dispose);
    } else {
      prev.connect(n as AudioNode);
      prev = n as AudioNode;
    }
  }
  prev.connect(output);
  return {
    input,
    output,
    dispose: () => disposers.forEach((d) => d()),
  };
}

/* ============================================================
 * Efeitos
 * ============================================================ */

const normal: VoiceEffectFactory = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output);
  return { input, output, dispose: () => {} };
};

/** Robô: Ring Modulation + Distortion + Compressor. */
const robot: VoiceEffectFactory = (ctx, params) => {
  const ring = createRingMod(ctx, p(params, "ringHz", 50), 1);
  const dist = ctx.createWaveShaper();
  dist.curve = makeDistortionCurve(p(params, "drive", 0.35)) as unknown as Float32Array<ArrayBuffer>;
  dist.oversample = "4x";
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 160;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4000;
  const trim = ctx.createGain();
  trim.gain.value = 0.85;
  return chain(ctx, [ring, dist, hp, lp, comp, trim]);
};

/** Monstro: Pitch -8 + Bass Boost + Distortion. */
const monster: VoiceEffectFactory = (ctx, params) => {
  const pitch = createPitchShift(ctx, p(params, "pitch", -8));
  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 200;
  bass.gain.value = 12;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  const dist = ctx.createWaveShaper();
  dist.curve = makeSoftClipCurve(p(params, "drive", 0.55)) as unknown as Float32Array<ArrayBuffer>;
  dist.oversample = "4x";
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  const trim = ctx.createGain();
  trim.gain.value = 1.1;
  return chain(ctx, [pitch, bass, dist, lp, comp, trim]);
};

/** Demônio: Pitch -12 + Reverb + Distortion. */
const demon: VoiceEffectFactory = (ctx, params) => {
  const pitch = createPitchShift(ctx, p(params, "pitch", -12));
  const dist = ctx.createWaveShaper();
  dist.curve = makeSoftClipCurve(p(params, "drive", 0.45)) as unknown as Float32Array<ArrayBuffer>;
  dist.oversample = "4x";
  const lowGrowl = ctx.createBiquadFilter();
  lowGrowl.type = "lowshelf";
  lowGrowl.frequency.value = 180;
  lowGrowl.gain.value = 8;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2800;

  // reverb wet/dry paralelo
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wetAmt = Math.max(0, Math.min(1, p(params, "reverb", 0.65)));
  dry.gain.value = 1 - wetAmt * 0.6;
  const wet = ctx.createGain();
  wet.gain.value = wetAmt;
  const rev = createReverb(ctx, 3.0, 1.8, 0.35);

  const sub = chain(ctx, [pitch, lowGrowl, dist, lp]);
  input.connect(sub.input);
  sub.output.connect(dry);
  sub.output.connect(rev);
  rev.connect(wet);
  dry.connect(output);
  wet.connect(output);
  return { input, output, dispose: sub.dispose };
};

/** Megafone: Band Pass + distorção leve. */
const megaphone: VoiceEffectFactory = (ctx, params) => {
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700;
  bp.Q.value = 1.2;
  const peak = ctx.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 2200;
  peak.Q.value = 1.6;
  peak.gain.value = 6;
  const dist = ctx.createWaveShaper();
  dist.curve = makeSoftClipCurve(p(params, "drive", 0.22)) as unknown as Float32Array<ArrayBuffer>;
  dist.oversample = "2x";
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  const trim = ctx.createGain();
  trim.gain.value = 1.15;
  return chain(ctx, [bp, peak, dist, comp, trim]);
};

/** Rádio: High pass + Low pass + ruído ajustável. */
const radio: VoiceEffectFactory = (ctx, params) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 350;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  const peak = ctx.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 1800;
  peak.Q.value = 1.2;
  peak.gain.value = 4;
  const dist = ctx.createWaveShaper();
  dist.curve = makeSoftClipCurve(p(params, "drive", 0.18)) as unknown as Float32Array<ArrayBuffer>;
  dist.oversample = "2x";

  input.connect(hp);
  hp.connect(lp);
  lp.connect(peak);
  peak.connect(dist);
  dist.connect(output);

  // Nível de ruído: 0..1 mapeado para 0..0.18 amplitude (audível mas não estoura).
  const noiseLevel = Math.max(0, Math.min(1, p(params, "noise", 0.25))) * 0.18;
  const noise = createNoiseSource(ctx, noiseLevel);
  const nhp = ctx.createBiquadFilter();
  nhp.type = "highpass";
  nhp.frequency.value = 800;
  noise.gain.connect(nhp);
  nhp.connect(output);

  return {
    input,
    output,
    dispose: () => {
      try { noise.source.stop(); } catch { /* ignore */ }
    },
  };
};

/** Telefone: HP/LP ajustáveis. */
const telephone: VoiceEffectFactory = (ctx, params) => {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = p(params, "lowCut", 400);
  hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = p(params, "highCut", 3000);
  lp.Q.value = 0.7;
  const peak = ctx.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 1500;
  peak.Q.value = 1;
  peak.gain.value = 3;
  const trim = ctx.createGain();
  trim.gain.value = 1.1;
  return chain(ctx, [hp, lp, peak, trim]);
};

/** Alienígena: Pitch + Phaser + Chorus (todos ajustáveis). */
const alien: VoiceEffectFactory = (ctx, params) => {
  const pitch = createPitchShift(ctx, p(params, "pitch", 5));
  const phaserRate = p(params, "phaserRate", 0.6);
  const phaserDepthRaw = Math.max(0, Math.min(1, p(params, "phaserDepth", 0.7)));
  const phaser = createPhaser(ctx, phaserRate, 200 + phaserDepthRaw * 1200, 500, 4);
  const chorusRate = p(params, "chorusRate", 1.4);
  const chorusDepth = Math.max(0, Math.min(1, p(params, "chorusDepth", 0.6))) * 0.006;
  const chorus = createChorus(ctx, chorusRate, chorusDepth, 0.018);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 250;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6000;
  return chain(ctx, [pitch, phaser, chorus, hp, lp]);
};

export const voiceEffects: Record<VoiceEffectName, VoiceEffectFactory> = {
  normal,
  robot,
  monster,
  demon,
  megaphone,
  radio,
  telephone,
  alien,
};

export function isVoiceEffectName(v: string | null | undefined): v is VoiceEffectName {
  return !!v && v in voiceEffects;
}

export function createVoiceEffect(
  ctx: BaseAudioContext,
  name: VoiceEffectName | string | null | undefined,
  params?: VoiceEffectParams,
): VoiceEffectNode {
  if (!name || !isVoiceEffectName(name)) return voiceEffects.normal(ctx);
  return voiceEffects[name](ctx, params);
}
