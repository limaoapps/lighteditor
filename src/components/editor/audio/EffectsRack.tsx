import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { REVERB_ENV_LIST, type EffectId, type EffectState } from "@/lib/audio/types";
import { DEFAULT_EFFECTS } from "@/lib/audio/types";

export type EffectsRackProps = {
  effects: Record<EffectId, EffectState>;
  onChange: (next: Record<EffectId, EffectState>) => void;
};

const EFFECT_LABELS: Record<EffectId, string> = {
  reverb: "Reverb",
  delay: "Delay",
  echo: "Echo",
  pingPong: "Ping Pong Delay",
  chorus: "Chorus",
  phaser: "Phaser",
  compressor: "Compressor",
  limiter: "Limiter",
  distortion: "Distortion",
  stereoWidener: "Stereo Widener",
  tremolo: "Tremolo",
};

const PARAM_DEFS: Record<EffectId, { key: string; label: string; min: number; max: number; step: number }[]> = {
  reverb:        [
    { key: "env", label: "Ambiente", min: 0, max: REVERB_ENV_LIST.length - 1, step: 1 },
    { key: "size", label: "Tamanho", min: 0, max: 1, step: 0.01 },
    { key: "decay", label: "Decaimento", min: 0.2, max: 8, step: 0.1 },
    { key: "predelay", label: "Pré-Delay (s)", min: 0, max: 0.2, step: 0.005 },
  ],
  delay:         [{ key: "time", label: "Tempo (s)", min: 0.01, max: 2, step: 0.01 }, { key: "feedback", label: "Feedback", min: 0, max: 0.95, step: 0.01 }],
  echo:          [{ key: "time", label: "Tempo (s)", min: 0.05, max: 2, step: 0.01 }, { key: "feedback", label: "Feedback", min: 0, max: 0.95, step: 0.01 }],
  pingPong:      [{ key: "time", label: "Tempo (s)", min: 0.05, max: 1.5, step: 0.01 }, { key: "feedback", label: "Feedback", min: 0, max: 0.95, step: 0.01 }],
  chorus:        [{ key: "rate", label: "Taxa (Hz)", min: 0.1, max: 10, step: 0.1 }, { key: "depth", label: "Profundidade", min: 0, max: 1, step: 0.01 }],
  phaser:        [{ key: "rate", label: "Taxa (Hz)", min: 0.05, max: 5, step: 0.05 }, { key: "baseFreq", label: "Freq. Base", min: 50, max: 2000, step: 10 }],
  compressor:    [
    { key: "threshold", label: "Threshold (dB)", min: -60, max: 0, step: 1 },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.5 },
    { key: "attack", label: "Attack (s)", min: 0.001, max: 1, step: 0.001 },
    { key: "release", label: "Release (s)", min: 0.01, max: 2, step: 0.01 },
  ],
  limiter:       [{ key: "threshold", label: "Threshold (dB)", min: -24, max: 0, step: 0.5 }],
  distortion:    [{ key: "amount", label: "Quantidade", min: 0, max: 1, step: 0.01 }],
  stereoWidener: [],
  tremolo:       [{ key: "rate", label: "Taxa (Hz)", min: 0.1, max: 20, step: 0.1 }, { key: "depth", label: "Profundidade", min: 0, max: 1, step: 0.01 }],
};

const ORDER: EffectId[] = [
  "reverb", "delay", "echo", "pingPong", "chorus", "phaser",
  "compressor", "limiter", "distortion", "stereoWidener", "tremolo",
];

export function EffectsRack({ effects, onChange }: EffectsRackProps) {
  const patch = (id: EffectId, p: Partial<EffectState>) => {
    onChange({ ...effects, [id]: { ...effects[id], ...p, params: { ...effects[id].params, ...(p.params ?? {}) } } });
  };
  const reset = (id: EffectId) => onChange({ ...effects, [id]: structuredClone(DEFAULT_EFFECTS[id]) });

  return (
    <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
      {ORDER.map((id) => {
        const st = effects[id];
        const showEnv = id === "reverb";
        return (
          <Card key={id} className="p-3 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Switch checked={st.on} onCheckedChange={(v) => patch(id, { on: v })} />
                <span className="text-sm font-medium">{EFFECT_LABELS[id]}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => reset(id)}>Reset</Button>
            </div>
            <div className={`grid grid-cols-1 gap-2 ${st.on ? "" : "opacity-50 pointer-events-none"}`}>
              <ParamSlider label="Intensidade" min={0} max={1} step={0.01} value={st.intensity} onChange={(v) => patch(id, { intensity: v })} />
              {PARAM_DEFS[id].map((p) => (
                <ParamSlider
                  key={p.key}
                  label={showEnv && p.key === "env" ? `Ambiente: ${REVERB_ENV_LIST[Math.round(st.params.env ?? 1)]?.label ?? ""}` : p.label}
                  min={p.min} max={p.max} step={p.step}
                  value={st.params[p.key] ?? 0}
                  onChange={(v) => patch(id, { params: { [p.key]: v } })}
                />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ParamSlider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-muted-foreground w-32 shrink-0">{label}</div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} className="flex-1" />
      <div className="text-[11px] tabular-nums w-12 text-right">{typeof value === "number" ? (Math.abs(value) < 1 ? value.toFixed(2) : value.toFixed(1)) : "0"}</div>
    </div>
  );
}
