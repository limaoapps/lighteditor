/**
 * Tipos do sistema de áudio profissional (AudioFxPro).
 * Camada nova sobre o AudioFx legado. Cada clipe pode ter um `pro?: AudioFxPro`
 * que é processado por uma cadeia baseada em Tone.js (preview + export).
 */

export type EqBandCount = 12 | 20 | 31;

export const EQ_FREQS: Record<EqBandCount, number[]> = {
  12: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 14000, 16000],
  20: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 8000, 10000, 12500, 14000, 16000, 18000, 20000],
  31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
};

export type EqPreset = "flat" | "bass" | "vocal" | "podcast" | "pop" | "rock" | "cinema";

export type ReverbEnv =
  | "small_room"
  | "medium_room"
  | "large_room"
  | "auditorium"
  | "theatre"
  | "church"
  | "cathedral"
  | "cave"
  | "stadium"
  | "outdoor";

export type EffectId =
  | "reverb" | "delay" | "echo" | "pingPong"
  | "chorus" | "phaser" | "compressor" | "limiter"
  | "distortion" | "stereoWidener" | "tremolo";

export type EffectState = { on: boolean; intensity: number; params: Record<string, number> };

export type AudioFxPro = {
  enabled: boolean;
  eq: { bands: EqBandCount; gains: number[]; preset?: EqPreset };
  effects: Record<EffectId, EffectState>;
  stereo: { enabled: boolean; width: number; pan: number; invert: boolean; mono: boolean };
};

export const DEFAULT_EFFECTS: Record<EffectId, EffectState> = {
  reverb:        { on: false, intensity: 0.3, params: { env: 1, size: 0.5, decay: 2.0, predelay: 0.02 } },
  delay:         { on: false, intensity: 0.3, params: { time: 0.25, feedback: 0.3 } },
  echo:          { on: false, intensity: 0.3, params: { time: 0.4, feedback: 0.4 } },
  pingPong:      { on: false, intensity: 0.3, params: { time: 0.25, feedback: 0.4 } },
  chorus:        { on: false, intensity: 0.5, params: { rate: 1.5, depth: 0.7 } },
  phaser:        { on: false, intensity: 0.5, params: { rate: 0.5, depth: 0.7, baseFreq: 350 } },
  compressor:    { on: false, intensity: 1.0, params: { threshold: -20, ratio: 4, attack: 0.01, release: 0.2 } },
  limiter:       { on: false, intensity: 1.0, params: { threshold: -3 } },
  distortion:    { on: false, intensity: 0.3, params: { amount: 0.3 } },
  stereoWidener: { on: false, intensity: 0.6, params: {} },
  tremolo:       { on: false, intensity: 0.5, params: { rate: 4, depth: 0.6 } },
};

export const DEFAULT_AUDIO_FX_PRO: AudioFxPro = {
  enabled: false,
  eq: { bands: 12, gains: new Array(12).fill(0), preset: "flat" },
  effects: structuredClone(DEFAULT_EFFECTS),
  stereo: { enabled: true, width: 1.0, pan: 0, invert: false, mono: false },
};

export const EQ_PRESETS: Record<EqPreset, Record<EqBandCount, number[]>> = {
  flat:    { 12: new Array(12).fill(0), 20: new Array(20).fill(0), 31: new Array(31).fill(0) },
  bass:    {
    12: [6, 5, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0],
    20: [7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    31: [8, 8, 7, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  vocal:   {
    12: [-2, -1, 0, 1, 2, 4, 5, 4, 2, 0, 0, 0],
    20: [-2, -2, -1, 0, 1, 2, 3, 4, 5, 5, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0],
    31: [-2,-2,-2,-1,-1, 0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 5, 4, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  podcast: {
    12: [-4, -2, 0, 1, 2, 3, 4, 3, 2, 0, 0, 0],
    20: [-4, -3, -2, 0, 1, 2, 3, 4, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    31: [-5,-4,-3,-2,-1, 0, 0, 1, 2, 2, 3, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  pop:     {
    12: [3, 2, 1, 0, -1, -1, 0, 2, 3, 4, 3, 2],
    20: [4, 3, 2, 1, 0, 0, -1, -1, -1, 0, 1, 2, 3, 3, 4, 4, 3, 3, 2, 2],
    31: [4, 4, 3, 3, 2, 2, 1, 1, 0, 0,-1,-1,-1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0],
  },
  rock:    {
    12: [5, 4, 3, 1, -1, -1, 0, 2, 4, 5, 4, 3],
    20: [6, 5, 4, 3, 1, 0, -1, -2, -1, 0, 1, 3, 4, 4, 5, 5, 4, 3, 2, 1],
    31: [6, 6, 5, 5, 4, 4, 3, 3, 2, 1, 0,-1,-2,-2,-1, 0, 0, 1, 2, 3, 4, 5, 5, 6, 5, 5, 4, 3, 2, 1, 0],
  },
  cinema:  {
    12: [6, 5, 3, 1, 0, 0, 1, 2, 3, 4, 4, 3],
    20: [7, 6, 5, 3, 1, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 3, 3, 2],
    31: [7, 7, 6, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 4, 4, 3, 2, 2, 1],
  },
};

export const EQ_PRESET_LABELS: Record<EqPreset, string> = {
  flat: "Flat", bass: "Bass Boost", vocal: "Vocal", podcast: "Podcast",
  pop: "Pop", rock: "Rock", cinema: "Cinema",
};

export const REVERB_ENV_LIST: { id: ReverbEnv; label: string; size: number; decay: number; predelay: number; wet: number; brightness: number }[] = [
  { id: "small_room",  label: "Sala Pequena", size: 0.20, decay: 0.8, predelay: 0.005, wet: 0.20, brightness: 0.7 },
  { id: "medium_room", label: "Sala Média",   size: 0.40, decay: 1.4, predelay: 0.010, wet: 0.28, brightness: 0.6 },
  { id: "large_room",  label: "Sala Grande",  size: 0.60, decay: 2.2, predelay: 0.020, wet: 0.35, brightness: 0.55 },
  { id: "auditorium",  label: "Auditório",    size: 0.70, decay: 3.0, predelay: 0.030, wet: 0.42, brightness: 0.5 },
  { id: "theatre",     label: "Teatro",       size: 0.75, decay: 2.8, predelay: 0.035, wet: 0.45, brightness: 0.45 },
  { id: "church",      label: "Igreja",       size: 0.85, decay: 4.0, predelay: 0.045, wet: 0.55, brightness: 0.38 },
  { id: "cathedral",   label: "Catedral",     size: 0.95, decay: 5.5, predelay: 0.050, wet: 0.65, brightness: 0.32 },
  { id: "cave",        label: "Caverna",      size: 0.90, decay: 4.5, predelay: 0.060, wet: 0.75, brightness: 0.20 },
  { id: "stadium",     label: "Estádio",      size: 0.80, decay: 3.6, predelay: 0.080, wet: 0.50, brightness: 0.50 },
  { id: "outdoor",     label: "Externo",      size: 0.10, decay: 0.4, predelay: 0.000, wet: 0.10, brightness: 0.9 },
];

export function reverbEnvIndex(id: ReverbEnv): number {
  return REVERB_ENV_LIST.findIndex((e) => e.id === id);
}

export function hasAudioFxPro(p?: AudioFxPro | null): boolean {
  if (!p || !p.enabled) return false;
  if (p.eq.gains.some((g) => Math.abs(g) > 0.01)) return true;
  for (const k of Object.keys(p.effects) as EffectId[]) if (p.effects[k].on) return true;
  if (p.stereo.mono || !p.stereo.enabled) return true;
  if (Math.abs(p.stereo.pan) > 0.01) return true;
  if (Math.abs(p.stereo.width - 1) > 0.01) return true;
  if (p.stereo.invert) return true;
  return false;
}
