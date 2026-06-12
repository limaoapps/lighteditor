/** Painel "Áudio" — agrupa EQ, Efeitos, Estéreo e Medidores em tabs. */
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EqualizerView } from "./EqualizerView";
import { EffectsRack } from "./EffectsRack";
import { StereoPanel } from "./StereoPanel";
import { MeterPanel } from "./MeterPanel";
import type { AudioFxPro } from "@/lib/audio/types";
import { DEFAULT_AUDIO_FX_PRO } from "@/lib/audio/types";
import { Switch } from "@/components/ui/switch";

export type AudioPanelProps = {
  value?: AudioFxPro | null;
  onChange: (next: AudioFxPro) => void;
  meter?: { rmsL: number; rmsR: number; peakL: number; peakR: number; clip: boolean } | null;
};

export function AudioPanel({ value, onChange, meter }: AudioPanelProps) {
  const fx = useMemo<AudioFxPro>(() => value ?? DEFAULT_AUDIO_FX_PRO, [value]);
  const [tab, setTab] = useState("eq");

  const patch = (p: Partial<AudioFxPro>) => onChange({ ...fx, ...p });

  // Garante que ao mudar parâmetro, está ligado
  useEffect(() => {
    if (!fx.enabled && (tab !== "eq" || fx.eq.gains.some((g) => Math.abs(g) > 0.01))) {
      // nada — toggle controla
    }
  }, [fx, tab]);

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Áudio Profissional</div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Ativar</span>
          <Switch checked={fx.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        </label>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="eq">EQ</TabsTrigger>
          <TabsTrigger value="fx">Efeitos</TabsTrigger>
          <TabsTrigger value="stereo">Estéreo</TabsTrigger>
          <TabsTrigger value="meter">Medidores</TabsTrigger>
        </TabsList>
        <TabsContent value="eq" className="pt-2">
          <EqualizerView eq={fx.eq} onChange={(eq) => patch({ eq })} />
        </TabsContent>
        <TabsContent value="fx" className="pt-2">
          <EffectsRack effects={fx.effects} onChange={(effects) => patch({ effects })} />
        </TabsContent>
        <TabsContent value="stereo" className="pt-2">
          <StereoPanel stereo={fx.stereo} onChange={(stereo) => patch({ stereo })} />
        </TabsContent>
        <TabsContent value="meter" className="pt-2">
          <MeterPanel meter={meter ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
