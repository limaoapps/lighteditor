/**
 * Audio FX: ganho >0dB (até +30dB), EQ 12 bandas, reverb (convolução sintética),
 * echo (delay+feedback), ambiente (presets de convolução) e modo de canal.
 *
 * Usado tanto na preview (via WebAudio) quanto na exportação WebCodecs
 * (via OfflineAudioContext). Para FFmpeg WASM, ver `buildAudioFilterChain`.
 */

import { createVoiceEffect, defaultVoiceParams, type VoiceEffectName, type VoiceEffectParams } from "./audio-effects";

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
  splitter: ChannelSplitterNode; // Permite conectar analisadores externos por canal
  setGain: (db: number) => void;
  setFx: (fx: AudioFx) => void;
  setMuted: (m: boolean) => void;
  dispose?: () => void;
};

/**
 * Cria a cadeia de nós: input → EQ(12) → channel → echo → reverb → ambient → gain → output
 * (gain SEM clamp — permite até +30 dB e além, deixando o sinal estourar quando o
 * usuário pedir.)
 */
export function buildAudioFxGraph(ctx: BaseAudioContext, opts?: { initialFx?: AudioFx; initialGainDb?: number }): AudioFxNodes {
  const input = ctx.createGain();
  input.gain.value = 1;

  // Position Depth (Frente/Trás)
  // Frente: Som brilhante (high shelf), menos reverb (dry gain up).
  // Trás: Som abafado (low pass), mais reverb (wet gain up).
  const depthFilter = ctx.createBiquadFilter();
  depthFilter.type = "lowpass";
  depthFilter.frequency.value = 22000; // start open

  // Mid/Side Matrix for Stereo Width
  // Mid = (L+R)/2, Side = (L-R)
  const widthSplitter = ctx.createChannelSplitter(2);
  const widthMerger = ctx.createChannelMerger(2);
  const midSum = ctx.createGain(); midSum.gain.value = 0.5;
  const sideDiff = ctx.createGain(); sideDiff.gain.value = 1;
  const sideInv = ctx.createGain(); sideInv.gain.value = -1;

  const widthMidGain = ctx.createGain(); // Mid intensity
  const widthSideGain = ctx.createGain(); // Side intensity
  
  // Connections for Width:
  // L -> midSum, R -> midSum (Mid = (L+R)/2)
  // L -> sideDiff, R -> sideInv -> sideDiff (Side = L-R)
  widthSplitter.connect(midSum, 0); 
  widthSplitter.connect(midSum, 1);
  widthSplitter.connect(sideDiff, 0);
  widthSplitter.connect(sideInv, 1);
  sideInv.connect(sideDiff);

  midSum.connect(widthMidGain);
  sideDiff.connect(widthSideGain);

  // Re-matrix: L = Mid + Side, R = Mid - Side
  const widthSideNeg = ctx.createGain(); widthSideNeg.gain.value = -1;
  widthMidGain.connect(widthMerger, 0, 0); // L <- Mid
  widthSideGain.connect(widthMerger, 0, 0); // L <- Side
  widthMidGain.connect(widthMerger, 0, 1); // R <- Mid
  widthSideGain.connect(widthSideNeg);
  widthSideNeg.connect(widthMerger, 0, 1); // R <- -Side


  // EQ 12 bandas: peaking BiquadFilters em série
  const eqNodes: BiquadFilterNode[] = EQ_BANDS.map((f, idx) => {
    const b = ctx.createBiquadFilter();
    b.type = idx === 0 ? "lowshelf" : idx === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
    b.frequency.value = f;
    b.Q.value = 1.0;
    b.gain.value = 0;
    return b;
  });

  // Canal (pan/mono/swap) — implementado via ChannelSplitter + Merger
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  // gains independentes para cada saída L/R a partir de L/R do splitter
  const gLL = ctx.createGain(); const gLR = ctx.createGain();
  const gRL = ctx.createGain(); const gRR = ctx.createGain();
  // padrão estéreo
  gLL.gain.value = 1; gLR.gain.value = 0; gRL.gain.value = 0; gRR.gain.value = 1;
  splitter.connect(gLL, 0); splitter.connect(gRL, 0);
  splitter.connect(gLR, 1); splitter.connect(gRR, 1);
  gLL.connect(merger, 0, 0); gLR.connect(merger, 0, 0);
  gRL.connect(merger, 0, 1); gRR.connect(merger, 0, 1);

  // Echo
  const echoDry = ctx.createGain(); echoDry.gain.value = 1;
  const echoWet = ctx.createGain(); echoWet.gain.value = 0;
  const echoDelay = ctx.createDelay(2.0); echoDelay.delayTime.value = 0.3;
  const echoFb = ctx.createGain(); echoFb.gain.value = 0.3;
  const echoMix = ctx.createGain(); echoMix.gain.value = 1;
  // signal → echoDelay → echoFb → echoDelay (feedback loop)
  echoDelay.connect(echoFb); echoFb.connect(echoDelay);
  echoDelay.connect(echoWet);
  // dry + wet → echoMix
  echoDry.connect(echoMix); echoWet.connect(echoMix);

  // Reverb
  const revDry = ctx.createGain(); revDry.gain.value = 1;
  const revWet = ctx.createGain(); revWet.gain.value = 0;
  const conv = ctx.createConvolver(); conv.normalize = true;
  const revMix = ctx.createGain(); revMix.gain.value = 1;
  revDry.connect(revMix); conv.connect(revWet); revWet.connect(revMix);

  // Ambient (segunda convolver)
  const ambDry = ctx.createGain(); ambDry.gain.value = 1;
  const ambWet = ctx.createGain(); ambWet.gain.value = 0;
  const ambConv = ctx.createConvolver(); ambConv.normalize = true;
  const ambMix = ctx.createGain(); ambMix.gain.value = 1;
  ambDry.connect(ambMix); ambConv.connect(ambWet); ambWet.connect(ambMix);

  // Gain final (sem clamp)
  const out = ctx.createGain(); out.gain.value = 1;
  const muteGain = ctx.createGain(); muteGain.gain.value = 1;

  // ===== Bloco de Voice FX (modular — voiceEffects DSP chain) =====
  // input → voiceIn → [currentVoice.input → currentVoice.output] → voiceOutGain → depthFilter
  // O sub-grafo do efeito é construído dinamicamente pelo módulo audio-effects.ts
  // (mesmos nós usados em pré-visualização e exportação offline).
  const voiceIn = ctx.createGain(); voiceIn.gain.value = 1;
  const voiceWet = ctx.createGain(); voiceWet.gain.value = 1; // saída do efeito
  const voiceDry = ctx.createGain(); voiceDry.gain.value = 0; // bypass original (para mix de intensidade)
  const voiceOutGain = ctx.createGain(); voiceOutGain.gain.value = 1; // compensação de volume
  let currentVoiceNode: { input: AudioNode; output: AudioNode; dispose: () => void } | null = null;
  const installVoiceEffect = (preset: VoicePreset, params?: VoiceEffectParams) => {
    if (currentVoiceNode) {
      try { voiceIn.disconnect(currentVoiceNode.input); } catch { /* ignore */ }
      try { currentVoiceNode.output.disconnect(voiceWet); } catch { /* ignore */ }
      try { currentVoiceNode.dispose(); } catch { /* ignore */ }
      currentVoiceNode = null;
    }
    const name = mapVoicePresetToEffect(preset);
    const mergedParams = { ...defaultVoiceParams(name), ...(params ?? {}) };
    const node = createVoiceEffect(ctx, name, mergedParams);
    voiceIn.connect(node.input);
    node.output.connect(voiceWet);
    currentVoiceNode = node;
  };
  installVoiceEffect("none");

  // Caminho: input → voiceIn → (efeito → voiceWet) || (voiceDry) → voiceOutGain → depthFilter
  input.connect(voiceIn);
  voiceIn.connect(voiceDry);
  voiceWet.connect(voiceOutGain);
  voiceDry.connect(voiceOutGain);
  voiceOutGain.connect(depthFilter);
  depthFilter.connect(widthSplitter);

  let prev: AudioNode = widthMerger;
  for (const b of eqNodes) { prev.connect(b); prev = b; }
  prev.connect(splitter);
  merger.connect(echoDry);
  merger.connect(echoDelay);
  echoMix.connect(revDry);
  echoMix.connect(conv);
  revMix.connect(ambDry);
  revMix.connect(ambConv);
  ambMix.connect(out);
  out.connect(muteGain);

  let lastReverbPreset: ReverbPreset = "none";
  let lastAmb: Ambience = "none";
  let lastVoice: VoicePreset = "none";
  let lastVoiceParamsKey = "";

  const api: AudioFxNodes = {
    input, output: muteGain, splitter,
    setGain(db: number) {
      // sem clamp — permite estouro proposital
      out.gain.value = dbToGain(db);
    },
    setFx(fx: AudioFx) {
      // EQ
      for (let i = 0; i < eqNodes.length; i++) {
        eqNodes[i].gain.value = fx.eq[i] ?? 0;
      }
      // Position Depth
      const depth = fx.positionDepth ?? 0;
      if (depth > 0) {
        // Trás: low pass abafa o som
        depthFilter.type = "lowpass";
        depthFilter.frequency.value = 20000 - depth * 18000;
      } else {
        // Frente: high shelf dá brilho (aproximado)
        depthFilter.type = "highshelf";
        depthFilter.frequency.value = 4000;
        depthFilter.gain.value = Math.abs(depth) * 6;
      }

      // Stereo Width / Enable
      const stereoOn = fx.stereoEnabled !== false;
      const widthVal = stereoOn ? (fx.stereoWidth ?? 100) / 100 : 0;
      widthMidGain.gain.value = 1;
      widthSideGain.gain.value = widthVal;

      // Canal (Roteamento conforme regras técnicas)
      const m = fx.channelMode;
      console.log(`[AudioFX] Modo de canal ativo: ${m.toUpperCase()}`);
      
      if (m === "mono") {
        gLL.gain.value = 0.5; gLR.gain.value = 0.5;
        gRL.gain.value = 0.5; gRR.gain.value = 0.5;
      } else if (m === "left") {
        gLL.gain.value = 1; gLR.gain.value = 0;
        gRL.gain.value = 1; gRR.gain.value = 0;
      } else if (m === "right") {
        gLL.gain.value = 0; gLR.gain.value = 1;
        gRL.gain.value = 0; gRR.gain.value = 1;
      } else if (m === "invert") {
        gLL.gain.value = 0; gLR.gain.value = 1;
        gRL.gain.value = 1; gRR.gain.value = 0;
      } else {
        // Estéreo ou Panned
        const p = fx.pan ?? 0;
        const angle = (p + 1) * (Math.PI / 4);
        gLL.gain.value = Math.cos(angle); 
        gLR.gain.value = 0;
        gRL.gain.value = 0; 
        gRR.gain.value = Math.sin(angle);
      }


      // Echo
      const eMix = Math.max(0, Math.min(1, (fx.echoMix ?? 0) / 100));
      echoDry.gain.value = 1 - eMix * 0.5;
      echoWet.gain.value = eMix;
      echoDelay.delayTime.value = Math.max(0.001, Math.min(2.0, (fx.echoDelay ?? 300) / 1000));
      echoFb.gain.value = Math.max(0, Math.min(0.95, (fx.echoFeedback ?? 30) / 100));
      // Reverb
      const rMix = Math.max(0, Math.min(1, (fx.reverbMix ?? 0) / 100));
      revDry.gain.value = 1 - rMix * 0.6;
      revWet.gain.value = rMix;
      if (fx.reverbPreset !== lastReverbPreset) {
        lastReverbPreset = fx.reverbPreset;
        const ir = irForReverb(ctx, fx.reverbPreset);
        try { conv.buffer = ir; } catch { /* ignore */ }
      }
      // Ambience
      if (fx.ambience !== lastAmb) {
        lastAmb = fx.ambience;
        const a = irForAmbience(ctx, fx.ambience);
        try { ambConv.buffer = a ? a.ir : null; } catch { /* ignore */ }
        ambDry.gain.value = a ? 1 - a.wet * 0.6 : 1;
        ambWet.gain.value = a ? a.wet : 0;
      }
      // Voice preset (modular — reconstrói o sub-grafo de DSP)
      const vp: VoicePreset = fx.voicePreset ?? "none";
      const paramsKey = JSON.stringify(fx.voiceParams ?? {});
      if (vp !== lastVoice || paramsKey !== lastVoiceParamsKey) {
        lastVoice = vp;
        lastVoiceParamsKey = paramsKey;
        installVoiceEffect(vp, fx.voiceParams);
        const s = vp !== "none" ? VOICE_SPECS[vp] : null;
        voiceOutGain.gain.value = s ? dbToGain(s.outGainDb) : 1;
      }
      // Intensidade global do efeito de voz (wet/dry mix). 0..1 → 100% = efeito puro.
      const intensityRaw = fx.voiceParams?.intensity;
      const intensity = vp === "none"
        ? 0
        : (typeof intensityRaw === "number" ? Math.max(0, Math.min(1, intensityRaw)) : 1);
      voiceWet.gain.value = intensity;
      voiceDry.gain.value = vp === "none" ? 1 : (1 - intensity);
    },
    setMuted(m: boolean) { muteGain.gain.value = m ? 0 : 1; },
  };

  if (opts?.initialFx) api.setFx(opts.initialFx);
  if (typeof opts?.initialGainDb === "number") api.setGain(opts.initialGainDb);
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
