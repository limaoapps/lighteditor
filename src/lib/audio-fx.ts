/**
 * Audio FX: ganho >0dB (até +30dB), EQ 12 bandas, reverb (convolução sintética),
 * echo (delay+feedback), ambiente (presets de convolução) e modo de canal.
 *
 * Usado tanto na preview (via WebAudio) quanto na exportação WebCodecs
 * (via OfflineAudioContext). Para FFmpeg WASM, ver `buildAudioFilterChain`.
 */

import { createVoiceEffect, defaultVoiceParams, type VoiceEffectName, type VoiceEffectParams } from "./audio-effects";
import { buildEffectsRack, type EffectsRack } from "./audio/chain";
import { type AudioFxPro, DEFAULT_AUDIO_FX_PRO, hasAudioFxPro } from "./audio/types";
export type { AudioFxPro } from "./audio/types";

/** Mapeia presets de voz (incluindo legados) para o efeito modular correspondente. */
function mapVoicePresetToEffect(vp: VoicePreset | undefined | null): VoiceEffectName {
  switch (vp) {
    case "robot": return "robot";
    case "monster": return "monster";
    case "demon": return "demon";
    case "megaphone": return "megaphone";
    case "radio": return "radio";
    case "telephone": return "telephone";
    case "alien": return "alien";
    case "child": return "child";
    case "helium": return "helium";
    case "ghost": return "ghost";
    case "cave": return "cave";
    // legados
    case "whisper": return "telephone";
    case "chipmunk": return "helium";
    case "underwater": return "monster";
    default: return "normal";
  }
}


export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 14000, 16000];
export const EQ_BAND_COUNT = EQ_BANDS.length;

export type ReverbPreset = "none" | "room" | "hall" | "plate" | "cathedral" | "auditorium" | "cinema";
export type Ambience = "none" | "room" | "hall" | "cave" | "outdoor" | "underwater" | "lounge" | "surround_light" | "surround_med" | "surround_strong";
export type ChannelMode = "stereo" | "mono" | "panned" | "left" | "right" | "invert";
export type VoicePreset =
  | "none"
  | "robot"
  | "monster"
  | "alien"
  | "megaphone"
  | "telephone"
  | "radio"
  | "whisper"
  | "chipmunk"
  | "demon"
  | "underwater"
  | "ghost"
  | "child"
  | "helium"
  | "cave";


export type AudioFx = {
  eq: number[]; // 12 bands, dB (-18 .. +18 typical)
  reverbMix: number; // 0..100 (% wet)
  reverbPreset: ReverbPreset;
  echoMix: number; // 0..100
  echoDelay: number; // ms (10..2000)
  echoFeedback: number; // 0..95 (%)
  ambience: Ambience;
  channelMode: ChannelMode;
  pan: number; // -1 (full left) .. 1 (full right)
  stereoEnabled: boolean; // se false, força mono (ignora largura)
  stereoWidth: number; // 0..200 (%) — intensidade do estéreo (100% = natural)
  positionDepth: number; // -1 (Frente) .. 1 (Trás)
  voicePreset?: VoicePreset; // efeito de voz
  voiceParams?: VoiceEffectParams; // parâmetros do efeito de voz (intensidades)
  pro?: AudioFxPro; // novo motor Tone.js (EQ multibanda + efeitos pro)
};



export const DEFAULT_AUDIO_FX: AudioFx = {
  eq: new Array(EQ_BAND_COUNT).fill(0),
  reverbMix: 0,
  reverbPreset: "none",
  echoMix: 0,
  echoDelay: 300,
  echoFeedback: 30,
  ambience: "none",
  channelMode: "stereo",
  pan: 0,
  stereoEnabled: true,
  stereoWidth: 60,
  positionDepth: 0,
  voicePreset: "none",
  voiceParams: {},
  pro: DEFAULT_AUDIO_FX_PRO,
};


export function dbToGain(db: number) { return Math.pow(10, db / 20); }
export function hasAudioFx(fx?: Partial<AudioFx> | null): boolean {
  if (!fx) return false;
  if (fx.eq && fx.eq.some(v => Math.abs(v) > 0.01)) return true;
  if ((fx.reverbMix ?? 0) > 0.5 && fx.reverbPreset && fx.reverbPreset !== "none") return true;
  if ((fx.echoMix ?? 0) > 0.5) return true;
  if (fx.ambience && fx.ambience !== "none") return true;
  if (fx.channelMode && fx.channelMode !== "stereo") return true;
  if (fx.stereoEnabled === false) return true;
  if (Math.abs((fx.stereoWidth ?? 100) - 100) > 1) return true;
  if (Math.abs(fx.positionDepth ?? 0) > 0.01) return true;
  if (fx.voicePreset && fx.voicePreset !== "none") return true;
  if (hasAudioFxPro(fx.pro)) return true;
  return false;
}

/** ===== Presets de efeito de voz ===== */
export type VoiceSpec = {
  ringHz: number; ringDepth: number;   // 0..1 (0 = sem ring mod)
  drive: number;                        // 0..1 (distorção)
  lowCutHz: number;                     // highpass freq
  highCutHz: number;                    // lowpass freq
  bandQ: number;                        // ressonância dos filtros
  wet: number;                          // 0..1 (mix dry/wet do bloco de voz)
  outGainDb: number;                    // compensação de volume
};
export const VOICE_SPECS: Record<Exclude<VoicePreset, "none">, VoiceSpec> = {
  robot:      { ringHz: 50,  ringDepth: 0.95, drive: 0.10, lowCutHz: 200,  highCutHz: 3500, bandQ: 0.9, wet: 1,    outGainDb: 0 },
  monster:    { ringHz: 6,   ringDepth: 0.75, drive: 0.18, lowCutHz: 60,   highCutHz: 900,  bandQ: 0.8, wet: 1,    outGainDb: 2 },
  alien:      { ringHz: 220, ringDepth: 0.85, drive: 0.05, lowCutHz: 400,  highCutHz: 5000, bandQ: 1.0, wet: 1,    outGainDb: -1 },
  megaphone:  { ringHz: 0,   ringDepth: 0,    drive: 0.25, lowCutHz: 700,  highCutHz: 3200, bandQ: 2.5, wet: 1,    outGainDb: 1 },
  telephone:  { ringHz: 0,   ringDepth: 0,    drive: 0.08, lowCutHz: 500,  highCutHz: 2800, bandQ: 2.0, wet: 1,    outGainDb: 0 },
  radio:      { ringHz: 0,   ringDepth: 0,    drive: 0.18, lowCutHz: 350,  highCutHz: 4200, bandQ: 2.0, wet: 1,    outGainDb: 0 },
  whisper:    { ringHz: 0,   ringDepth: 0,    drive: 0,    lowCutHz: 800,  highCutHz: 8000, bandQ: 0.7, wet: 0.7,  outGainDb: 3 },
  chipmunk:   { ringHz: 0,   ringDepth: 0,    drive: 0,    lowCutHz: 900,  highCutHz: 10000,bandQ: 0.7, wet: 0.8,  outGainDb: 0 },
  demon:      { ringHz: 15,  ringDepth: 0.80, drive: 0.20, lowCutHz: 40,   highCutHz: 700,  bandQ: 1.1, wet: 1,    outGainDb: 2 },
  underwater: { ringHz: 0,   ringDepth: 0,    drive: 0,    lowCutHz: 80,   highCutHz: 500,  bandQ: 0.8, wet: 1,    outGainDb: 3 },
  ghost:      { ringHz: 7,   ringDepth: 0.45, drive: 0.05, lowCutHz: 200,  highCutHz: 4000, bandQ: 0.9, wet: 0.85, outGainDb: 0 },
  child:      { ringHz: 0,   ringDepth: 0,    drive: 0,    lowCutHz: 200,  highCutHz: 8000, bandQ: 0.7, wet: 1,    outGainDb: 0 },
  helium:     { ringHz: 0,   ringDepth: 0,    drive: 0,    lowCutHz: 300,  highCutHz: 10000,bandQ: 0.7, wet: 1,    outGainDb: -1 },
  cave:       { ringHz: 0,   ringDepth: 0,    drive: 0,    lowCutHz: 80,   highCutHz: 4000, bandQ: 0.7, wet: 1,    outGainDb: 0 },
};

function makeDriveCurve(amount: number): Float32Array {
  // Soft-saturation suave (tanh), evita estourar: mesmo com drive=1, ganho de
  // pico permanece ~1.0 e o som ganha "caráter" sem distorcer brutalmente.
  const n = 1024; const k = Math.max(0, Math.min(0.999, amount));
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const drive = 1 + k * 8; // 1..9
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}
function makeLinearCurve(): Float32Array {
  const n = 1024; const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) c[i] = (i * 2) / n - 1;
  return c;
}

/** ===== Presets de reverb (parâmetros de geração de IR sintético) ===== */
type IRSpec = { duration: number; decay: number; predelay: number; brightness: number };
const REVERB_SPECS: Record<Exclude<ReverbPreset, "none">, IRSpec> = {
  room:       { duration: 0.6, decay: 3.0, predelay: 0.010, brightness: 0.6 },
  hall:       { duration: 2.2, decay: 2.2, predelay: 0.025, brightness: 0.5 },
  plate:      { duration: 1.5, decay: 2.6, predelay: 0.005, brightness: 0.9 },
  cathedral:  { duration: 4.5, decay: 1.6, predelay: 0.040, brightness: 0.35 },
  auditorium: { duration: 3.0, decay: 2.0, predelay: 0.030, brightness: 0.4 },
  cinema:     { duration: 2.5, decay: 2.5, predelay: 0.020, brightness: 0.5 },
};
// Ambientes mais pronunciados — caverna bem "cavernosa", subterrâneo bem "abafado".
const AMBIENCE_SPECS: Record<Exclude<Ambience, "none">, IRSpec & { wet: number }> = {
  room:        { duration: 0.5, decay: 3.5, predelay: 0.008, brightness: 0.65, wet: 0.28 },
  hall:        { duration: 2.4, decay: 1.8, predelay: 0.025, brightness: 0.45, wet: 0.45 },
  cave:        { duration: 5.5, decay: 0.9, predelay: 0.060, brightness: 0.18, wet: 0.75 },
  outdoor:     { duration: 0.35, decay: 4.5, predelay: 0.000, brightness: 0.95, wet: 0.18 },
  underwater:  { duration: 2.2, decay: 1.4, predelay: 0.000, brightness: 0.08, wet: 0.85 },
  lounge:      { duration: 1.8, decay: 2.4, predelay: 0.015, brightness: 0.70, wet: 0.35 },
  surround_light:  { duration: 0.1, decay: 1.0, predelay: 0.005, brightness: 0.8, wet: 0.15 },
  surround_med:    { duration: 0.2, decay: 1.2, predelay: 0.015, brightness: 0.7, wet: 0.30 },
  surround_strong: { duration: 0.3, decay: 1.5, predelay: 0.025, brightness: 0.6, wet: 0.45 },
};


/** Gera IR sintético (ruído com decaimento exponencial). */
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

export function irForReverb(ctx: BaseAudioContext, preset: ReverbPreset): AudioBuffer | null {
  if (preset === "none") return null;
  return generateIR(ctx, REVERB_SPECS[preset]);
}
export function irForAmbience(ctx: BaseAudioContext, amb: Ambience): { ir: AudioBuffer; wet: number } | null {
  if (amb === "none") return null;
  const s = AMBIENCE_SPECS[amb];
  return { ir: generateIR(ctx, s), wet: s.wet };
}

/** ===== Cadeia de nós (preview + offline) ===== */
export type AudioFxNodes = {
  input: AudioNode;
  output: AudioNode;
  splitter: ChannelSplitterNode;
  setGain: (db: number) => void;
  setFx: (fx: AudioFx) => void;
  setMuted: (m: boolean) => void;
  readMeter: () => { rmsL: number; rmsR: number; peakL: number; peakR: number; clip: boolean };
  dispose?: () => void;
};

function cloneAudioFxPro(base: AudioFxPro = DEFAULT_AUDIO_FX_PRO): AudioFxPro {
  return {
    enabled: base.enabled,
    eq: { ...base.eq, gains: [...base.eq.gains] },
    effects: Object.fromEntries(
      Object.entries(base.effects).map(([k, v]) => [k, { ...v, params: { ...v.params } }]),
    ) as AudioFxPro["effects"],
    stereo: { ...base.stereo },
  };
}

function legacyToToneFx(fx?: AudioFx): AudioFxPro {
  if (fx?.pro?.enabled) return cloneAudioFxPro(fx.pro);
  const next = cloneAudioFxPro(DEFAULT_AUDIO_FX_PRO);
  next.enabled = true;
  next.eq.bands = 12;
  next.eq.gains = EQ_BANDS.map((_, i) => fx?.eq?.[i] ?? 0);

  const echoMix = Math.max(0, Math.min(1, (fx?.echoMix ?? 0) / 100));
  next.effects.echo.on = echoMix > 0.005;
  next.effects.echo.intensity = echoMix;
  next.effects.echo.params = { time: Math.max(0.01, Math.min(2, (fx?.echoDelay ?? 300) / 1000)), feedback: Math.max(0, Math.min(0.95, (fx?.echoFeedback ?? 30) / 100)) };

  const reverbMix = Math.max(0, Math.min(1, (fx?.reverbMix ?? 0) / 100));
  next.effects.reverb.on = reverbMix > 0.005 && !!fx?.reverbPreset && fx.reverbPreset !== "none";
  next.effects.reverb.intensity = reverbMix;
  next.effects.reverb.params = { env: fx?.reverbPreset === "cathedral" ? 6 : fx?.reverbPreset === "hall" ? 2 : 1, size: 0.55, decay: 2.2, predelay: 0.02 };

  const width = Math.max(0, Math.min(2, (fx?.stereoWidth ?? 100) / 100));
  next.effects.stereoWidener.on = (fx?.stereoEnabled !== false) && Math.abs(width - 1) > 0.01;
  next.effects.stereoWidener.intensity = Math.max(0, Math.min(1, width / 2));
  next.stereo = {
    enabled: fx?.stereoEnabled !== false,
    width,
    pan: fx?.channelMode === "panned" ? (fx?.pan ?? 0) : 0,
    invert: fx?.channelMode === "invert",
    mono: fx?.channelMode === "mono" || fx?.stereoEnabled === false,
  };
  return next;
}

/**
 * Cria a cadeia de nós: input → EQ(12) → channel → echo → reverb → ambient → gain → output
 * (gain SEM clamp — permite até +30 dB e além, deixando o sinal estourar quando o
 * usuário pedir.)
 */
export function buildAudioFxGraph(ctx: BaseAudioContext, opts?: { initialFx?: AudioFx; initialGainDb?: number }): AudioFxNodes {
  const input = ctx.createGain();
  input.gain.value = 1;

  const rack = buildEffectsRack(ctx);
  const gain = ctx.createGain();
  gain.gain.value = dbToGain(opts?.initialGainDb ?? 0);
  const muteGain = ctx.createGain();
  muteGain.gain.value = 1;
  const output = ctx.createGain();
  const splitter = ctx.createChannelSplitter(2);

  input.connect(rack.input);
  rack.output.connect(gain);
  gain.connect(muteGain);
  muteGain.connect(output);
  muteGain.connect(splitter);

  const api: AudioFxNodes = {
    input,
    output,
    splitter,
    setGain(db: number) { gain.gain.value = dbToGain(db); },
    setFx(fx: AudioFx) { rack.update(legacyToToneFx(fx)); },
    setMuted(m: boolean) { muteGain.gain.value = m ? 0 : 1; },
    readMeter: () => rack.readMeter(),
    dispose() { try { rack.dispose(); } catch { /* */ } },
  };
  api.setFx(opts?.initialFx ?? DEFAULT_AUDIO_FX);
  return api;
}

/** ===== FFmpeg WASM filtros equivalentes ===== */
export function buildAudioFilterChain(
  fx: AudioFx | undefined | null,
  gainDb: number,
  durationSec?: number,
): string[] {
  const out: string[] = [];
  // Canal primeiro (para reverb/echo já trabalharem na config final)
  if (fx?.channelMode === "mono") out.push("pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1");
  else if (fx?.channelMode === "left") out.push("pan=stereo|c0=c0|c1=c0");
  else if (fx?.channelMode === "right") out.push("pan=stereo|c0=c1|c1=c1");
  else if (fx?.channelMode === "invert") out.push("pan=stereo|c0=c1|c1=c0");
  else if (fx && Math.abs(fx.pan ?? 0) > 0.01) {
    const p = fx.pan!;
    // Aproximação linear do pan para FFmpeg
    const gl = (1 - p) / 2;
    const gr = (1 + p) / 2;
    out.push(`pan=stereo|c0=${gl.toFixed(3)}*c0|c1=${gr.toFixed(3)}*c1`);
  }

  // Largura Estéreo (Stereo Width) — quando desligado, força mono
  if (fx && fx.stereoEnabled === false) {
    out.push("pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1");
  } else if (fx && Math.abs((fx.stereoWidth ?? 100) - 100) > 1) {
    const w = (fx.stereoWidth / 100).toFixed(2);
    out.push(`stereowiden=level_in=1:level_out=1:delay=20:width=${w}`);
  }

  // Profundidade (Position Depth)
  if (fx && Math.abs(fx.positionDepth ?? 0) > 0.01) {
    const d = fx.positionDepth;
    if (d > 0) {
      // Trás: abafa (lowpass)
      const freq = Math.round(20000 - d * 18000);
      out.push(`lowpass=f=${freq}`);
    } else {
      // Frente: brilho (equalizer high shelf)
      const gain = (Math.abs(d) * 6).toFixed(1);
      out.push(`equalizer=f=4000:width_type=h:width=2000:g=${gain}`);
    }
  }


  // EQ 12 bandas
  if (fx?.eq) {
    for (let i = 0; i < EQ_BANDS.length; i++) {
      const g = fx.eq[i] ?? 0;
      if (Math.abs(g) > 0.01) {
        out.push(`equalizer=f=${EQ_BANDS[i]}:width_type=o:width=1:g=${g.toFixed(2)}`);
      }
    }
  }
  // Echo
  const echoMix = (fx?.echoMix ?? 0) / 100;
  if (echoMix > 0.005) {
    const delayMs = Math.max(10, Math.min(2000, fx?.echoDelay ?? 300));
    const fb = Math.max(0, Math.min(0.95, (fx?.echoFeedback ?? 30) / 100));
    // aecho=in_gain:out_gain:delays:decays
    out.push(`aecho=0.8:${(0.6 + echoMix * 0.4).toFixed(2)}:${delayMs.toFixed(0)}:${fb.toFixed(2)}`);
  }
  // Reverb (aproximado por aecho múltiplo — convolução não está acessível no WASM core).
  const revMix = (fx?.reverbMix ?? 0) / 100;
  if (revMix > 0.005 && fx?.reverbPreset && fx.reverbPreset !== "none") {
    const presetParams: Record<string, { delays: string; decays: string }> = {
      room:      { delays: "40|60|80",        decays: "0.4|0.3|0.2" },
      hall:      { delays: "60|120|180|260",  decays: "0.55|0.4|0.3|0.2" },
      plate:     { delays: "20|40|80",        decays: "0.6|0.45|0.3" },
      cathedral: { delays: "80|200|400|650|900", decays: "0.6|0.5|0.4|0.3|0.2" },
    };
    const p = presetParams[fx.reverbPreset];
    if (p) {
      const og = (0.5 + revMix * 0.5).toFixed(2);
      out.push(`aecho=0.8:${og}:${p.delays}:${p.decays}`);
    }
  }
  // Ambience (mais pronunciado: caverna e subterrâneo bem perceptíveis)
  if (fx?.ambience && fx.ambience !== "none") {
    const ambMap: Record<string, { delays: string; decays: string; gain: number }> = {
      room:       { delays: "30|50",                  decays: "0.35|0.25",            gain: 0.7 },
      hall:       { delays: "80|180|260|360",         decays: "0.55|0.4|0.3|0.2",     gain: 0.8 },
      cave:       { delays: "120|260|450|720|1000|1400", decays: "0.7|0.6|0.5|0.4|0.3|0.2", gain: 0.95 },
      outdoor:    { delays: "20",                     decays: "0.1",                  gain: 0.6 },
    underwater: { delays: "60|140|220|320",         decays: "0.7|0.55|0.4|0.3",     gain: 0.9 },
    lounge:     { delays: "40|80",                  decays: "0.45|0.35",            gain: 0.8 },

    };
    const p = ambMap[fx.ambience];
    if (p) out.push(`aecho=0.8:${p.gain.toFixed(2)}:${p.delays}:${p.decays}`);
    if (fx.ambience === "underwater") {
      // Som "submerso" bem fechado: passa-baixa agressiva + corte de agudos
      out.push("lowpass=f=450");
      out.push("highpass=f=80");
    }
    if (fx.ambience === "cave") {
      // Reforça os médios-graves típicos de caverna
      out.push("lowpass=f=2200");
      out.push("equalizer=f=180:width_type=o:width=1.4:g=4");
    }
  }
  // Voice preset (aproximação FFmpeg: highpass + lowpass + ganho + tremolo p/ ring)
  const vp = fx?.voicePreset;
  if (vp && vp !== "none") {
    const s = VOICE_SPECS[vp];
    if (s.lowCutHz > 25) out.push(`highpass=f=${Math.round(s.lowCutHz)}`);
    if (s.highCutHz < 19000) out.push(`lowpass=f=${Math.round(s.highCutHz)}`);
    if (s.ringDepth > 0.01 && s.ringHz > 0.1) {
      // tremolo aproxima AM/ring para taxas baixas; para taxas altas, vibrato/distorção
      if (s.ringHz <= 20) out.push(`tremolo=f=${s.ringHz.toFixed(2)}:d=${s.ringDepth.toFixed(2)}`);
      else out.push(`vibrato=f=${Math.min(20, s.ringHz/8).toFixed(2)}:d=${Math.min(1, s.ringDepth).toFixed(2)}`);
    }
    if (s.drive > 0.05) {
      // distorção via acrusher leve
      const lvl = (1 - s.drive * 0.6).toFixed(2);
      out.push(`acrusher=level_in=1:level_out=${lvl}:bits=8:mode=log:mix=${s.drive.toFixed(2)}`);
    }
    if (Math.abs(s.outGainDb) > 0.01) out.push(`volume=${dbToGain(s.outGainDb).toFixed(4)}`);
  }
  // Ganho (>0 dB permitido — até +30dB ou mais)
  const g = dbToGain(gainDb || 0);
  if (Math.abs(gainDb) > 0.01) out.push(`volume=${g.toFixed(4)}`);
  return out;
}
