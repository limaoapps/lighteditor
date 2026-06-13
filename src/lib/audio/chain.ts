/**
 * Rack de efeitos baseado em Tone.js. Cada efeito é um nó wet/dry com bypass.
 * Compatível com AudioContext (preview) e OfflineAudioContext (export).
 */
import * as Tone from "tone";
import type { AudioFxPro, EffectState, ReverbEnv } from "./types";
import { REVERB_ENV_LIST } from "./types";
import { generateIR, specForEnv } from "./reverb-presets";
import { buildEq, type EqGraph } from "./eq";
import { buildMeter, type Meter } from "./meters";

/** Define o contexto Tone para o ctx fornecido (preview ou offline). */
export function bindToneContext(ctx: BaseAudioContext) {
  // Tone aceita um AudioContext nativo via setContext
  try {
    Tone.setContext(ctx as AudioContext);
  } catch {
    // já está vinculado
  }
}

type Slot = {
  on: boolean;
  input: AudioNode;
  output: AudioNode;
  wet: GainNode;
  dry: GainNode;
  mix: GainNode;
  node: Tone.ToneAudioNode | null;
  ensure: () => Tone.ToneAudioNode;
  apply: (st: EffectState, ctx: BaseAudioContext) => Promise<void> | void;
  ready?: () => Promise<void>;
  dispose: () => void;
};

function makeWetDry(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const wet = ctx.createGain(); wet.gain.value = 0;
  const dry = ctx.createGain(); dry.gain.value = 1;
  const mix = ctx.createGain(); mix.gain.value = 1;
  input.connect(dry); dry.connect(mix);
  return { input, wet, dry, mix };
}

function setBlend(slot: Slot, on: boolean, intensity: number) {
  const w = on ? Math.max(0, Math.min(1, intensity)) : 0;
  slot.wet.gain.value = w;
  slot.dry.gain.value = on ? Math.max(0, 1 - w * 0.6) : 1;
}

/** Constrói um slot de efeito Tone, com wet/dry. */
function buildSlot(ctx: BaseAudioContext, factory: () => Tone.ToneAudioNode): Slot {
  const { input, wet, dry, mix } = makeWetDry(ctx);
  let node: Tone.ToneAudioNode | null = null;
  const ensure = () => {
    if (!node) {
      node = factory();
      // input (native) → node (Tone) → wet (native)
      Tone.connect(input as unknown as Tone.ToneAudioNode, node as unknown as Tone.ToneAudioNode);
      Tone.connect(node as unknown as Tone.ToneAudioNode, wet as unknown as Tone.ToneAudioNode);
      wet.connect(mix);
      slot.node = node;
    }
    return node;
  };
  const slot: Slot = {
    on: false, input, output: mix, wet, dry, mix, node,
    ensure,
    async apply() { /* override */ },
    dispose() {
      try { node?.disconnect(); node?.dispose(); } catch { /* */ }
    },
  };
  slot.apply = (st) => { ensure(); setBlend(slot, st.on, st.intensity); };
  return slot;
}

export type EffectsRack = {
  input: AudioNode;
  output: AudioNode;
  update: (fx: AudioFxPro) => void;
  ready: () => Promise<void>;
  readMeter: () => { rmsL: number; rmsR: number; peakL: number; peakR: number; clip: boolean };
  dispose: () => void;
};

export function buildEffectsRack(ctx: BaseAudioContext): EffectsRack {
  bindToneContext(ctx);

  const headIn = ctx.createGain();
  const tail = ctx.createGain();

  // EQ
  const eq: EqGraph = buildEq(ctx, 12);

  // Helpers para criar Tone effects
  const makeReverb = () => new Tone.Convolver();
  let reverbBufferKey = "";
  const reverbConvolver = makeReverb();
  const reverbSlot = (() => {
    const { input, wet, dry, mix } = makeWetDry(ctx);
    Tone.connect(input as unknown as Tone.ToneAudioNode, reverbConvolver as unknown as Tone.ToneAudioNode);
    Tone.connect(reverbConvolver as unknown as Tone.ToneAudioNode, wet as unknown as Tone.ToneAudioNode);
    wet.connect(mix);
    const slot: Slot = {
      on: false, input, output: mix, wet, dry, mix, node: reverbConvolver,
      ensure: () => reverbConvolver,
      apply(st: EffectState) {
        const envIdx = Math.round(st.params.env ?? 1);
        const env: ReverbEnv = REVERB_ENV_LIST[Math.max(0, Math.min(REVERB_ENV_LIST.length - 1, envIdx))].id;
        const size = st.params.size;
        const decay = st.params.decay;
        const predelay = st.params.predelay;
        const key = `${env}|${size}|${decay}|${predelay}`;
        if (key !== reverbBufferKey) {
          reverbBufferKey = key;
          const ir = generateIR(ctx, specForEnv(env, size, decay, predelay));
          reverbConvolver.buffer = ir as unknown as Tone.ToneAudioBuffer;
        }
        setBlend(slot, st.on, st.intensity);
      },
      dispose() { try { reverbConvolver.disconnect(); reverbConvolver.dispose(); } catch { /* */ } },
    };
    return slot;
  })();

  const delaySlot = buildSlot(ctx, () => new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3 }));
  delaySlot.apply = (st) => {
    delaySlot.ensure();
    const n = delaySlot.node as Tone.FeedbackDelay | null;
    if (n) { n.delayTime.value = st.params.time ?? 0.25; n.feedback.value = st.params.feedback ?? 0.3; }
    setBlend(delaySlot, st.on, st.intensity);
  };

  const echoSlot = buildSlot(ctx, () => new Tone.FeedbackDelay({ delayTime: 0.4, feedback: 0.5 }));
  echoSlot.apply = (st) => {
    echoSlot.ensure();
    const n = echoSlot.node as Tone.FeedbackDelay | null;
    if (n) { n.delayTime.value = st.params.time ?? 0.4; n.feedback.value = st.params.feedback ?? 0.5; }
    setBlend(echoSlot, st.on, st.intensity);
  };

  const pingPongSlot = buildSlot(ctx, () => new Tone.PingPongDelay({ delayTime: 0.25, feedback: 0.4 }));
  pingPongSlot.apply = (st) => {
    pingPongSlot.ensure();
    const n = pingPongSlot.node as Tone.PingPongDelay | null;
    if (n) { n.delayTime.value = st.params.time ?? 0.25; n.feedback.value = st.params.feedback ?? 0.4; }
    setBlend(pingPongSlot, st.on, st.intensity);
  };

  const chorusSlot = buildSlot(ctx, () => {
    const c = new Tone.Chorus({ frequency: 1.5, depth: 0.7 });
    try { c.start(); } catch { /* */ }
    return c;
  });
  chorusSlot.apply = (st) => {
    chorusSlot.ensure();
    const n = chorusSlot.node as Tone.Chorus | null;
    if (n) { n.frequency.value = st.params.rate ?? 1.5; n.depth = st.params.depth ?? 0.7; }
    setBlend(chorusSlot, st.on, st.intensity);
  };

  const phaserSlot = buildSlot(ctx, () => new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350 }));
  phaserSlot.apply = (st) => {
    phaserSlot.ensure();
    const n = phaserSlot.node as Tone.Phaser | null;
    if (n) { n.frequency.value = st.params.rate ?? 0.5; n.baseFrequency = st.params.baseFreq ?? 350; }
    setBlend(phaserSlot, st.on, st.intensity);
  };

  const compressorSlot = buildSlot(ctx, () => new Tone.Compressor({ threshold: -20, ratio: 4, attack: 0.01, release: 0.2 }));
  compressorSlot.apply = (st) => {
    compressorSlot.ensure();
    const n = compressorSlot.node as Tone.Compressor | null;
    if (n) {
      n.threshold.value = st.params.threshold ?? -20;
      n.ratio.value = st.params.ratio ?? 4;
      n.attack.value = st.params.attack ?? 0.01;
      n.release.value = st.params.release ?? 0.2;
    }
    setBlend(compressorSlot, st.on, st.intensity);
  };

  const limiterSlot = buildSlot(ctx, () => new Tone.Limiter(-3));
  limiterSlot.apply = (st) => {
    limiterSlot.ensure();
    const n = limiterSlot.node as Tone.Limiter | null;
    if (n) n.threshold.value = st.params.threshold ?? -3;
    setBlend(limiterSlot, st.on, st.intensity);
  };

  const distortionSlot = buildSlot(ctx, () => new Tone.Distortion(0.3));
  distortionSlot.apply = (st) => {
    distortionSlot.ensure();
    const n = distortionSlot.node as Tone.Distortion | null;
    if (n) n.distortion = Math.max(0, Math.min(1, st.params.amount ?? 0.3));
    setBlend(distortionSlot, st.on, st.intensity);
  };

  const stereoSlot = buildSlot(ctx, () => new Tone.StereoWidener(0.5));
  stereoSlot.apply = (st) => {
    stereoSlot.ensure();
    const n = stereoSlot.node as Tone.StereoWidener | null;
    if (n) n.width.value = Math.max(0, Math.min(1, st.intensity));
    setBlend(stereoSlot, st.on, 1);
  };

  const tremoloSlot = buildSlot(ctx, () => {
    const t = new Tone.Tremolo({ frequency: 4, depth: 0.6 });
    try { t.start(); } catch { /* */ }
    return t;
  });
  tremoloSlot.apply = (st) => {
    tremoloSlot.ensure();
    const n = tremoloSlot.node as Tone.Tremolo | null;
    if (n) { n.frequency.value = st.params.rate ?? 4; n.depth.value = st.params.depth ?? 0.6; }
    setBlend(tremoloSlot, st.on, st.intensity);
  };

  // Pan + estéreo final via WebAudio puro (mais leve + funciona offline)
  const panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const gLL = ctx.createGain(); const gLR = ctx.createGain();
  const gRL = ctx.createGain(); const gRR = ctx.createGain();
  gLL.gain.value = 1; gLR.gain.value = 0; gRL.gain.value = 0; gRR.gain.value = 1;
  splitter.connect(gLL, 0); splitter.connect(gRL, 0);
  splitter.connect(gLR, 1); splitter.connect(gRR, 1);
  gLL.connect(merger, 0, 0); gLR.connect(merger, 0, 0);
  gRL.connect(merger, 0, 1); gRR.connect(merger, 0, 1);

  // Cadeia: headIn → EQ → comp → distortion → chorus → phaser → tremolo →
  //         delay → echo → pingPong → reverb → stereoWidener → splitter/merger → pan → tail
  const order: Slot[] = [
    compressorSlot, distortionSlot, chorusSlot, phaserSlot, tremoloSlot,
    delaySlot, echoSlot, pingPongSlot, reverbSlot, stereoSlot, limiterSlot,
  ];
  headIn.connect(eq.input);
  let prev: AudioNode = eq.output;
  for (const s of order) { prev.connect(s.input); prev = s.output; }
  prev.connect(splitter);
  // Meter taps the final signal (post pan/mono)
  const meter: Meter = buildMeter(ctx);
  if (panNode) {
    merger.connect(panNode); panNode.connect(tail);
    panNode.connect(meter.input);
  } else {
    merger.connect(tail);
    merger.connect(meter.input);
  }

  const update = (fx: AudioFxPro) => {
    eq.setBands(fx.eq.bands);
    eq.setGains(fx.eq.gains);
    const e = fx.effects;
    compressorSlot.apply(e.compressor, ctx);
    distortionSlot.apply(e.distortion, ctx);
    chorusSlot.apply(e.chorus, ctx);
    phaserSlot.apply(e.phaser, ctx);
    tremoloSlot.apply(e.tremolo, ctx);
    delaySlot.apply(e.delay, ctx);
    echoSlot.apply(e.echo, ctx);
    pingPongSlot.apply(e.pingPong, ctx);
    reverbSlot.apply(e.reverb, ctx);
    limiterSlot.apply(e.limiter, ctx);

    // Estéreo / pan / largura
    const s = fx.stereo;
    // Wire stereo widener from the StereoPanel "width" slider (0..2),
    // overriding the effects-tab toggle so users see/hear it immediately.
    const widthOn = s.enabled && !s.mono && Math.abs(s.width - 1) > 0.01;
    const widenerState: EffectState = widthOn
      ? { on: true, intensity: Math.max(0, Math.min(1, s.width / 2)), params: {} }
      : e.stereoWidener;
    stereoSlot.apply(widenerState, ctx);

    if (s.mono || !s.enabled) {
      gLL.gain.value = 0.5; gLR.gain.value = 0.5;
      gRL.gain.value = 0.5; gRR.gain.value = 0.5;
    } else if (s.invert) {
      gLL.gain.value = 0; gLR.gain.value = 1;
      gRL.gain.value = 1; gRR.gain.value = 0;
    } else {
      gLL.gain.value = 1; gLR.gain.value = 0;
      gRL.gain.value = 0; gRR.gain.value = 1;
    }
    if (panNode) panNode.pan.value = Math.max(-1, Math.min(1, s.pan));
  };

  return {
    input: headIn,
    output: tail,
    update,
    async ready() { /* sem IR async */ },
    readMeter: () => meter.read(),
    dispose() {
      try { headIn.disconnect(); tail.disconnect(); } catch { /* */ }
      eq.dispose();
      meter.dispose();
      [compressorSlot, distortionSlot, chorusSlot, phaserSlot, tremoloSlot,
       delaySlot, echoSlot, pingPongSlot, reverbSlot, stereoSlot, limiterSlot].forEach(s => s.dispose());
    },
  };
}

