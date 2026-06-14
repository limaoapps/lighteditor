import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export type StereoState = {
  enabled: boolean;
  width: number;
  pan: number;
  invert: boolean;
  mono: boolean;
  surround?: boolean;
};

export type StereoPanelProps = {
  stereo: StereoState;
  onChange: (s: StereoState) => void;
};

export function StereoPanel({ stereo, onChange }: StereoPanelProps) {
  const patch = (p: Partial<StereoState>) => onChange({ ...stereo, ...p });
  const mode: "stereo" | "mono" | "surround" = stereo.mono ? "mono" : stereo.surround ? "surround" : "stereo";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm">Modo</span>
        <div className="flex gap-1">
          <Button size="sm" variant={mode === "stereo" ? "default" : "outline"} onClick={() => patch({ mono: false, surround: false })}>Estéreo</Button>
          <Button size="sm" variant={mode === "mono" ? "default" : "outline"} onClick={() => patch({ mono: true, surround: false })}>Mono</Button>
          <Button size="sm" variant={mode === "surround" ? "default" : "outline"} onClick={() => patch({ mono: false, surround: true, width: Math.max(stereo.width, 1.6) })}>Surround</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">Processamento ativo</span>
        <Switch checked={stereo.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-24">Largura (M/S)</span>
        <Slider min={0} max={2} step={0.01}
          value={[stereo.width]}
          defaultValue={[1]}
          onValueChange={(v) => patch({ width: v[0] })}
          className="flex-1" />
        <span className="text-xs tabular-nums w-12 text-right">{(stereo.width * 100).toFixed(0)}%</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-24">Pan</span>
        <Slider min={-1} max={1} step={0.01}
          value={[stereo.pan]}
          defaultValue={[0]}
          onValueChange={(v) => patch({ pan: v[0] })}
          className="flex-1" />
        <span className="text-xs tabular-nums w-12 text-right">{stereo.pan === 0 ? "C" : stereo.pan < 0 ? `L${Math.abs(stereo.pan * 100).toFixed(0)}` : `R${(stereo.pan * 100).toFixed(0)}`}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">Inverter L/R</span>
        <Switch checked={stereo.invert} onCheckedChange={(v) => patch({ invert: v })} />
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Largura usa processamento M/S real: 0% = mono, 100% = original, 200% = ampliado.
        Surround adiciona um atraso de Haas no canal lateral para simular espacialização.
        Dica: dê duplo clique em qualquer controle para restaurar o valor padrão.
      </p>
    </div>
  );
}
