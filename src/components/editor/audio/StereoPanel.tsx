import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export type StereoPanelProps = {
  stereo: { enabled: boolean; width: number; pan: number; invert: boolean; mono: boolean };
  onChange: (s: { enabled: boolean; width: number; pan: number; invert: boolean; mono: boolean }) => void;
};

export function StereoPanel({ stereo, onChange }: StereoPanelProps) {
  const patch = (p: Partial<typeof stereo>) => onChange({ ...stereo, ...p });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm">Modo Estéreo</span>
        <div className="flex gap-1">
          <Button size="sm" variant={!stereo.mono ? "default" : "outline"} onClick={() => patch({ mono: false })}>Estéreo</Button>
          <Button size="sm" variant={stereo.mono ? "default" : "outline"} onClick={() => patch({ mono: true })}>Mono</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">Estéreo Ativo</span>
        <Switch checked={stereo.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-24">Largura</span>
        <Slider min={0} max={2} step={0.01} value={[stereo.width]} onValueChange={(v) => patch({ width: v[0] })} className="flex-1" />
        <span className="text-xs tabular-nums w-10 text-right">{(stereo.width * 100).toFixed(0)}%</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-24">Pan</span>
        <Slider min={-1} max={1} step={0.01} value={[stereo.pan]} onValueChange={(v) => patch({ pan: v[0] })} className="flex-1" />
        <span className="text-xs tabular-nums w-10 text-right">{stereo.pan === 0 ? "C" : stereo.pan < 0 ? `L${Math.abs(stereo.pan * 100).toFixed(0)}` : `R${(stereo.pan * 100).toFixed(0)}`}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">Inverter L/R</span>
        <Switch checked={stereo.invert} onCheckedChange={(v) => patch({ invert: v })} />
      </div>
    </div>
  );
}
