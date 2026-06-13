import { useMemo, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { EQ_FREQS, EQ_PRESETS, EQ_PRESET_LABELS, type EqBandCount, type EqPreset } from "@/lib/audio/types";
import { resampleGains } from "@/lib/audio/eq";

export type EqualizerViewProps = {
  eq: { bands: EqBandCount; gains: number[]; preset?: EqPreset };
  onChange: (eq: { bands: EqBandCount; gains: number[]; preset?: EqPreset }) => void;
};

const BAND_OPTIONS: EqBandCount[] = [12, 20, 31];
const GAIN_RANGE = 18; // ±18 dB
const SCALE_MARKS = [18, 12, 6, 0, -6, -12, -18];

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
  const reset = () => onChange({ ...eq, gains: new Array(eq.bands).fill(0), preset: "flat" });

  const fmt = (f: number) => f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : `${f}`;

  // band slider sizing — taller for fewer bands, compact for 31
  const sliderH = eq.bands === 31 ? 120 : eq.bands === 20 ? 140 : 160;
  const colW = eq.bands === 31 ? 22 : eq.bands === 20 ? 28 : 34;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Bandas</span>
        {BAND_OPTIONS.map((b) => (
          <Button key={b} size="sm" variant={eq.bands === b ? "default" : "outline"} onClick={() => setBands(b)} className="h-7 px-2 text-xs">
            {b}
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="ghost" onClick={reset} className="h-7 px-2 text-xs">Reset</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Presets</span>
        {(Object.keys(EQ_PRESET_LABELS) as EqPreset[]).map((p) => (
          <Button key={p} size="sm" variant={eq.preset === p ? "secondary" : "ghost"} onClick={() => applyPreset(p)} className="h-7 px-2 text-xs">
            {EQ_PRESET_LABELS[p]}
          </Button>
        ))}
      </div>

      <EqCurve gains={eq.gains} freqs={freqs} />

      <div className="overflow-x-auto">
        <div className="flex gap-1 pb-2" style={{ minWidth: "fit-content" }}>
          {/* dB scale on the left */}
          <div className="flex flex-col items-end justify-between pr-1 select-none" style={{ height: sliderH, paddingTop: 8, paddingBottom: 8 }}>
            {SCALE_MARKS.map((m) => (
              <span key={m} className="text-[9px] tabular-nums text-muted-foreground leading-none">
                {m > 0 ? `+${m}` : m}
              </span>
            ))}
          </div>

          {freqs.map((f, i) => {
            const v = eq.gains[i] ?? 0;
            const pct = ((v + GAIN_RANGE) / (2 * GAIN_RANGE)) * 100; // 0..100
            return (
              <div key={i} className="flex flex-col items-center gap-1" style={{ width: colW }}>
                <BandSlider
                  height={sliderH}
                  value={v}
                  pct={pct}
                  onChange={(nv) => setGain(i, nv)}
                  title={`${fmt(f)}Hz · ${v.toFixed(1)} dB`}
                />
                <span className="text-[9px] text-muted-foreground tabular-nums leading-none">{fmt(f)}</span>
                <span className={`text-[9px] tabular-nums leading-none ${v > 0 ? "text-primary" : v < 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                  {v > 0 ? "+" : ""}{v.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BandSlider({ height, value, pct, onChange, title }: { height: number; value: number; pct: number; onChange: (v: number) => void; title: string }) {
  // Vertical track w/ gradient fill from center to thumb pos
  // pct: 0 = bottom (-18dB), 50 = center, 100 = top (+18dB)
  const centerY = 50;
  const fillTop = Math.min(centerY, 100 - pct);
  const fillBottom = Math.min(100 - centerY, pct);
  return (
    <div className="relative" style={{ width: 24, height }}>
      {/* track */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1.5 rounded-full bg-muted overflow-hidden">
        {/* center line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
        {/* fill */}
        <div
          className="absolute left-0 right-0 bg-primary"
          style={{
            top: `${fillTop}%`,
            height: `${(value === 0 ? 0 : (value > 0 ? centerY - fillTop : fillBottom))}%`,
          }}
        />
      </div>
      {/* thumb */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-4 h-3 rounded-sm bg-primary border border-primary-foreground/20 shadow pointer-events-none"
        style={{ top: `calc(${100 - pct}% - 6px)` }}
      />
      {/* native vertical input on top (transparent) */}
      <input
        type="range"
        min={-GAIN_RANGE}
        max={GAIN_RANGE}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        title={title}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ writingMode: "vertical-lr" as CSSProperties["writingMode"], direction: "rtl", WebkitAppearance: "slider-vertical" } as CSSProperties}
      />
    </div>
  );
}

function EqCurve({ gains, freqs }: { gains: number[]; freqs: number[] }) {
  const path = useMemo(() => {
    const w = 320, h = 80;
    const samples = 240;
    const pts: string[] = [];
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const logF = Math.pow(10, Math.log10(20) + t * (Math.log10(20000) - Math.log10(20)));
      let gain = 0;
      for (let b = 0; b < freqs.length; b++) {
        const fb = freqs[b];
        const oct = Math.log2(logF / fb);
        const sigma = freqs.length >= 30 ? 0.35 : freqs.length >= 20 ? 0.5 : 0.7;
        gain += gains[b] * Math.exp(-(oct * oct) / (2 * sigma * sigma));
      }
      const x = t * w;
      const y = h / 2 - (gain / GAIN_RANGE) * (h / 2 - 2);
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [gains, freqs]);

  return (
    <svg viewBox="0 0 320 80" className="w-full h-20 rounded bg-muted/30 text-primary" preserveAspectRatio="none">
      {/* horizontal grid */}
      {[20, 40, 60].map((y) => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="currentColor" strokeOpacity="0.08" />
      ))}
      <line x1="0" y1="40" x2="320" y2="40" stroke="currentColor" strokeOpacity="0.25" />
      {/* vertical decade markers (100, 1k, 10k) */}
      {[100, 1000, 10000].map((f) => {
        const t = (Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20));
        return <line key={f} x1={t * 320} y1="0" x2={t * 320} y2="80" stroke="currentColor" strokeOpacity="0.08" />;
      })}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
