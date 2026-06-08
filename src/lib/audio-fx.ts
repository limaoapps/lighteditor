/**
 * Audio FX: ganho >0dB (até +30dB), EQ 12 bandas, reverb (convolução sintética),
 * echo (delay+feedback), ambiente (presets de convolução) e modo de canal.
 *
 * Usado tanto na preview (via WebAudio) quanto na exportação WebCodecs
 * (via OfflineAudioContext). Para FFmpeg WASM, ver `buildAudioFilterChain`.
 */

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 14000, 16000];
export const EQ_BAND_COUNT = EQ_BANDS.length;

export type ReverbPreset = "none" | "room" | "hall" | "plate" | "cathedral";
export type Ambience = "none" | "room" | "hall" | "cave" | "outdoor" | "underwater" | "lounge";
export type ChannelMode = "stereo" | "mono" | "panned";


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
};


export function dbToGain(db: number) { return Math.pow(10, db / 20); }
export function hasAudioFx(fx?: Partial<AudioFx> | null): boolean {
  if (!fx) return false;
  if (fx.eq && fx.eq.some(v => Math.abs(v) > 0.01)) return true;
  if ((fx.reverbMix ?? 0) > 0.5 && fx.reverbPreset && fx.reverbPreset !== "none") return true;
  if ((fx.echoMix ?? 0) > 0.5) return true;
  if (fx.ambience && fx.ambience !== "none") return true;
  if (fx.channelMode && fx.channelMode !== "stereo") return true;
  return false;
}

/** ===== Presets de reverb (parâmetros de geração de IR sintético) ===== */
type IRSpec = { duration: number; decay: number; predelay: number; brightness: number };
const REVERB_SPECS: Record<Exclude<ReverbPreset, "none">, IRSpec> = {
  room:       { duration: 0.6, decay: 3.0, predelay: 0.010, brightness: 0.6 },
  hall:       { duration: 2.2, decay: 2.2, predelay: 0.025, brightness: 0.5 },
  plate:      { duration: 1.5, decay: 2.6, predelay: 0.005, brightness: 0.9 },
  cathedral:  { duration: 4.5, decay: 1.6, predelay: 0.040, brightness: 0.35 },
};
// Ambientes mais pronunciados — caverna bem "cavernosa", subterrâneo bem "abafado".
const AMBIENCE_SPECS: Record<Exclude<Ambience, "none">, IRSpec & { wet: number }> = {
  room:        { duration: 0.5, decay: 3.5, predelay: 0.008, brightness: 0.65, wet: 0.28 },
  hall:        { duration: 2.4, decay: 1.8, predelay: 0.025, brightness: 0.45, wet: 0.45 },
  cave:        { duration: 5.5, decay: 0.9, predelay: 0.060, brightness: 0.18, wet: 0.75 },
  outdoor:     { duration: 0.35, decay: 4.5, predelay: 0.000, brightness: 0.95, wet: 0.18 },
  underwater:  { duration: 2.2, decay: 1.4, predelay: 0.000, brightness: 0.08, wet: 0.85 },
  lounge:      { duration: 1.8, decay: 2.4, predelay: 0.015, brightness: 0.70, wet: 0.35 }, // Som Lounge
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

  // Conexões: input → eq[0..n-1] → splitter/merger → echoIn(dry+delay) → echoMix → revDry+conv → revMix → ambDry+ambConv → ambMix → out → muteGain
  let prev: AudioNode = input;
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

  const api: AudioFxNodes = {
    input, output: muteGain,
    setGain(db: number) {
      // sem clamp — permite estouro proposital
      out.gain.value = dbToGain(db);
    },
    setFx(fx: AudioFx) {
      // EQ
      for (let i = 0; i < eqNodes.length; i++) {
        eqNodes[i].gain.value = fx.eq[i] ?? 0;
      }
      // Canal (Roteamento conforme regras técnicas)
      const m = fx.channelMode;
      console.log(`[AudioFX] Modo de canal ativo: ${m.toUpperCase()}`);
      
      if (m === "mono") {
        // M = (L + R) / 2
        gLL.gain.value = 0.5; gLR.gain.value = 0.5; // Saída L recebe L e R
        gRL.gain.value = 0.5; gRR.gain.value = 0.5; // Saída R recebe L e R
      } else if (m === "left") {
        // L = L_original, R = L_original
        gLL.gain.value = 1; gLR.gain.value = 0;
        gRL.gain.value = 1; gRR.gain.value = 0;
      } else if (m === "right") {
        // L = R_original, R = R_original
        gLL.gain.value = 0; gLR.gain.value = 1;
        gRL.gain.value = 0; gRR.gain.value = 1;
      } else if (m === "swap") {
        // L = R_original, R = L_original
        gLL.gain.value = 0; gLR.gain.value = 1;
        gRL.gain.value = 1; gRR.gain.value = 0;
      } else {
        // Estéreo: L = L, R = R
        gLL.gain.value = 1; gLR.gain.value = 0;
        gRL.gain.value = 0; gRR.gain.value = 1;
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
  else if (fx && Math.abs(fx.pan ?? 0) > 0.01) {
    const p = fx.pan!;
    // Aproximação linear do pan para FFmpeg
    const gl = (1 - p) / 2;
    const gr = (1 + p) / 2;
    out.push(`pan=stereo|c0=${gl.toFixed(3)}*c0|c1=${gr.toFixed(3)}*c1`);
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
  // Ganho (>0 dB permitido — até +30dB ou mais)
  const g = dbToGain(gainDb || 0);
  if (Math.abs(gainDb) > 0.01) out.push(`volume=${g.toFixed(4)}`);
  return out;
}
