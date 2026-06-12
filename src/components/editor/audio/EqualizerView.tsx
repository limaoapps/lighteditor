import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { EQ_FREQS, EQ_PRESETS, EQ_PRESET_LABELS, type EqBandCount, type EqPreset } from "@/lib/audio/types";
import { resampleGains } from "@/lib/audio/eq";

export type EqualizerViewProps = {
  eq: { bands: EqBandCount; gains: number[]; preset?: EqPreset };
  onChange: (eq: { bands: EqBandCount; gains: number[]; preset?: EqPreset }) => void;
};

const BAND_OPTIONS: EqBandCount[] = [12, 20, 31];

export function EqualizerView({ eq, onChange }: EqualizerViewProps) {
  const freqs = EQ_FREQS[eq.bands];

  const setBands = (b: EqBandCount) => {
    if (b === eq.bands) return;
    onChange({ bands: b, gains: resampleGains(eq.gains, b), preset: eq.preset });
  };
  const setGain = (i: number, v: number) => {
    const g = eq.gains.slice();
    g[i] = v;
    onChange({ ...eq, gains: g, preset: undefined });
  };
  const applyPreset = (p: EqPreset) => {
    onChange({ ...eq, gains: EQ_PRESETS[p][eq.bands].slice(), preset: p });
  };

  const fmt = (f: number) => f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${f}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground">Bandas:</div>
        {BAND_OPTIONS.map((b) => (
          <Button key={b} size="sm" variant={eq.bands === b ? "default" : "outline"} onClick={() => setBands(b)}>
            {b}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <div className="text-xs text-muted-foreground mr-2">Presets:</div>
        {(Object.keys(EQ_PRESET_LABELS) as EqPreset[]).map((p) => (
          <Button key={p} size="sm" variant={eq.preset === p ? "secondary" : "ghost"} onClick={() => applyPreset(p)}>
            {EQ_PRESET_LABELS[p]}
          </Button>
        ))}
      </div>

      <EqCurve gains={eq.gains} freqs={freqs} />

      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-fit pb-2">
          {freqs.map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-1 w-7">
              <div className="h-32 flex items-center">
                <Slider
                  orientation="vertical"
                  min={-18}
                  max={18}
                  step={0.5}
                  value={[eq.gains[i] ?? 0]}
                  onValueChange={(v) => setGain(i, v[0])}
                  className="h-32"
                />
              </div>
              <div className="text-[9px] text-muted-foreground tabular-nums">{fmt(f)}</div>
              <div className="text-[9px] tabular-nums">{(eq.gains[i] ?? 0).toFixed(0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EqCurve({ gains, freqs }: { gains: number[]; freqs: number[] }) {
  const path = useMemo(() => {
    const w = 320, h = 80;
    const samples = 200;
    const pts: string[] = [];
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const logF = Math.pow(10, Math.log10(20) + t * (Math.log10(20000) - Math.log10(20)));
      // soma simplificada das contribuições gauss em torno de cada banda
      let gain = 0;
      for (let b = 0; b < freqs.length; b++) {
        const fb = freqs[b];
        const oct = Math.log2(logF / fb);
        const sigma = freqs.length >= 30 ? 0.35 : freqs.length >= 20 ? 0.5 : 0.7;
        gain += gains[b] * Math.exp(-(oct * oct) / (2 * sigma * sigma));
      }
      const x = t * w;
      const y = h / 2 - (gain / 18) * (h / 2);
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [gains, freqs]);
  return (
    <svg viewBox="0 0 320 80" className="w-full h-20 bg-muted/30 rounded">
      <line x1="0" y1="40" x2="320" y2="40" stroke="currentColor" strokeOpacity="0.2" />
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
    </svg>
  );
}
