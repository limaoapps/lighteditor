/** Medidor de áudio (RMS, peak, clipping) via AnalyserNode. */
export type Meter = {
  input: AudioNode;
  read: () => { rmsL: number; rmsR: number; peakL: number; peakR: number; clip: boolean };
  dispose: () => void;
};

export function buildMeter(ctx: BaseAudioContext): Meter {
  const split = ctx.createChannelSplitter(2);
  const aL = ctx.createAnalyser(); aL.fftSize = 2048; aL.smoothingTimeConstant = 0.2;
  const aR = ctx.createAnalyser(); aR.fftSize = 2048; aR.smoothingTimeConstant = 0.2;
  split.connect(aL, 0);
  split.connect(aR, 1);
  const bufL = new Float32Array(aL.fftSize);
  const bufR = new Float32Array(aR.fftSize);
  let lastClipAt = 0;

  return {
    input: split,
    read() {
      aL.getFloatTimeDomainData(bufL);
      aR.getFloatTimeDomainData(bufR);
      let sumL = 0, sumR = 0, peakL = 0, peakR = 0;
      for (let i = 0; i < bufL.length; i++) {
        const l = bufL[i], r = bufR[i];
        sumL += l * l; sumR += r * r;
        const al = Math.abs(l), ar = Math.abs(r);
        if (al > peakL) peakL = al;
        if (ar > peakR) peakR = ar;
      }
      const rmsL = Math.sqrt(sumL / bufL.length);
      const rmsR = Math.sqrt(sumR / bufR.length);
      const now = performance.now();
      if (peakL > 0.99 || peakR > 0.99) lastClipAt = now;
      return { rmsL, rmsR, peakL, peakR, clip: now - lastClipAt < 500 };
    },
    dispose() {
      try { split.disconnect(); } catch { /* */ }
    },
  };
}

export function gainToDb(g: number): number {
  if (g <= 1e-6) return -120;
  return 20 * Math.log10(g);
}
