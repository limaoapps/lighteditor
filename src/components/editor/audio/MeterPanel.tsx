import { useEffect, useRef, useState } from "react";
import { gainToDb } from "@/lib/audio/meters";

export type MeterPanelProps = {
  meter: { rmsL: number; rmsR: number; peakL: number; peakR: number; clip: boolean } | null;
};

export function MeterPanel({ meter }: MeterPanelProps) {
  // hold de pico
  const [peakHold, setPeakHold] = useState<{ l: number; r: number }>({ l: 0, r: 0 });
  const lastDecayRef = useRef(performance.now());

  useEffect(() => {
    if (!meter) return;
    const now = performance.now();
    const dt = (now - lastDecayRef.current) / 1000;
    lastDecayRef.current = now;
    setPeakHold((p) => {
      const decay = 0.6 * dt; // unidades/seg
      const l = Math.max(meter.peakL, p.l - decay);
      const r = Math.max(meter.peakR, p.r - decay);
      return { l, r };
    });
  }, [meter]);

  if (!meter) {
    return <div className="text-xs text-muted-foreground">Aguardando reprodução para exibir medidores...</div>;
  }

  const rmsDbL = gainToDb(meter.rmsL);
  const rmsDbR = gainToDb(meter.rmsR);
  const peakDbL = gainToDb(meter.peakL);
  const peakDbR = gainToDb(meter.peakR);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">VU Meter</span>
        <span className={`text-xs font-bold ${meter.clip ? "text-red-500" : "text-muted-foreground"}`}>
          {meter.clip ? "CLIP" : "OK"}
        </span>
      </div>
      <VuBar label="L" rms={meter.rmsL} peak={meter.peakL} hold={peakHold.l} />
      <VuBar label="R" rms={meter.rmsR} peak={meter.peakR} hold={peakHold.r} />

      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
        <Stat label="RMS L" value={`${rmsDbL.toFixed(1)} dB`} />
        <Stat label="RMS R" value={`${rmsDbR.toFixed(1)} dB`} />
        <Stat label="Peak L" value={`${peakDbL.toFixed(1)} dB`} />
        <Stat label="Peak R" value={`${peakDbR.toFixed(1)} dB`} />
      </div>
    </div>
  );
}

function VuBar({ label, rms, peak, hold }: { label: string; rms: number; peak: number; hold: number }) {
  const pct = (v: number) => Math.max(0, Math.min(100, v * 100));
  const rmsPct = pct(rms);
  const peakPct = pct(peak);
  const holdPct = pct(hold);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-4">{label}</span>
      <div className="relative flex-1 h-3 bg-muted rounded overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500" style={{ width: `${rmsPct}%` }} />
        <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${peakPct}%` }} />
        <div className="absolute inset-y-0 w-px bg-red-400" style={{ left: `${holdPct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between bg-muted/40 px-2 py-1 rounded">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
