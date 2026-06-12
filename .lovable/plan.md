## Visão geral

Substituir o pipeline atual `audio-fx.ts` (WebAudio cru) por um novo motor baseado em **Tone.js**, com cadeia modular de efeitos profissionais, EQ multibanda selecionável, presets de reverb por ambiente, medidores em tempo real e nova aba "Áudio" no editor. A cadeia roda tanto na prévia (AudioContext) quanto na exportação (OfflineAudioContext via WebCodecs).

## Escopo confirmado
- Tudo de uma vez (EQ 12/20/31, todos os efeitos, todos os presets, medidores)
- Substituir pipeline atual
- Prévia = exportação

## Arquitetura

```
src/lib/audio/
  engine.ts          // Tone.js setup, AudioContext compartilhado
  chain.ts           // EffectChain (substitui buildAudioFxGraph)
  effects.ts         // factories Tone (Reverb, Delay, PingPong, Chorus,
                     //   Phaser, Compressor, Limiter, Distortion, StereoWidener, Tremolo)
  eq.ts              // EQ 12/20/31 bandas (BiquadFilter em série) + presets
  reverb-presets.ts  // 10 ambientes (Sala P/M/G, Auditório, Teatro, Igreja,
                     //   Catedral, Caverna, Estádio, Externo) com size/decay/predelay/wet
  meters.ts          // VU, RMS, peak, clipping via AnalyserNode
  voice.ts           // mantém presets de voz atuais reescritos em Tone
  types.ts           // AudioFxPro (novo formato)
  serialize.ts       // migração: AudioFx legado → AudioFxPro
```

`audio-fx.ts` vira shim fino que reexporta para não quebrar imports existentes; `webcodecs-export.ts` passa a usar `chain.ts` com `OfflineAudioContext`.

## Modelo de dados (`AudioFxPro`)

```ts
type AudioFxPro = {
  eq: { bands: 12|20|31; gains: number[]; preset?: EqPreset }
  effects: {
    reverb:    { on: boolean; preset: ReverbPreset; size: number; decay: number; predelay: number; wet: number }
    delay:     { on: boolean; time: number; feedback: number; wet: number }
    pingPong:  { on: boolean; time: number; feedback: number; wet: number }
    chorus:    { on: boolean; rate: number; depth: number; wet: number }
    phaser:    { on: boolean; rate: number; depth: number; wet: number }
    compressor:{ on: boolean; threshold: number; ratio: number; attack: number; release: number }
    limiter:   { on: boolean; threshold: number }
    distortion:{ on: boolean; amount: number; wet: number }
    tremolo:   { on: boolean; rate: number; depth: number }
  }
  stereo: { enabled: boolean; width: number; pan: number; invert: boolean; mode: 'stereo'|'mono' }
  voice:  { preset: VoicePreset; intensity: number; params: VoiceParams }
  gainDb: number
}
```

Ordem da cadeia: `input → voice → EQ → compressor → distortion → chorus → phaser → tremolo → delay → pingPong → reverb → stereoWidener → pan → limiter → meter → output`.

## EQ multibanda

- 12 bandas: bandas atuais
- 20 bandas: ISO 1/2-oitava (25 Hz → 20 kHz)
- 31 bandas: ISO 1/3-oitava (20 Hz → 20 kHz)
- Cada banda = BiquadFilter `peaking` (shelf nas extremas), Q ajustado por largura
- Presets: Flat, Bass Boost, Vocal, Podcast, Pop, Rock, Cinema — armazenados como vetores por contagem de bandas (interpolados quando necessário)
- Visualização: curva renderizada em canvas a partir da soma das respostas (sample em log)

## Presets de Reverb

`reverb-presets.ts` define 10 ambientes com `{ size, reflections, decay, wet, predelay, brightness }`. Cada um vira IR sintético via `generateIR` existente. Usuário pode sobrescrever cada parâmetro por clipe.

## Medidores

- AnalyserNode no fim da cadeia (pré-output, pós-limiter)
- `requestAnimationFrame` lê `getFloatTimeDomainData` → RMS, peak, hold-peak, clipping (>0.99)
- Componente `<MeterBridge>` renderiza barras estilo VU (verde/amarelo/vermelho) com hold de pico

## UI — Aba "Áudio"

Nova aba no painel direito do editor (`src/routes/editor.tsx`), componentizada em:

```
src/components/editor/audio/
  AudioPanel.tsx          // tabs internas: EQ | Efeitos | Estéreo | Medidores
  EqualizerView.tsx       // seletor 12/20/31, sliders verticais, curva, presets
  EffectsRack.tsx         // cards de cada efeito (on/off + sliders intensidade/params)
  StereoPanel.tsx         // pan, width, invert, mono/stereo
  MeterPanel.tsx          // VU L/R, RMS, peak, clip
```

Visual moderno (cards escuros, sliders verticais para EQ, knobs/sliders para efeitos), responsivo. Reutiliza `Slider`, `Switch`, `Tabs` shadcn já presentes.

## Exportação

`webcodecs-export.ts` passa a instanciar `buildEffectChain(offlineCtx, fxPro)` em vez de `buildAudioFxGraph`. Como Tone.js aceita `BaseAudioContext` por `Tone.setContext`, a mesma cadeia roda offline. Voice effects continuam reescritos em pure WebAudio para garantir suporte offline (Tone usa o ctx ativo).

## Migração & compatibilidade

- `serialize.ts` converte `AudioFx` antigo → `AudioFxPro` ao abrir projeto/clipe (e vice-versa para salvar legado se necessário)
- `audio-fx.ts` mantém exports `AudioFx`, `DEFAULT_AUDIO_FX`, `hasAudioFx` apontando para os novos tipos via adapter
- Remoção das partes obsoletas em `editor.tsx` (painel de canais antigo) — substituídas pela nova aba

## Passos de implementação

1. `bun add tone`
2. Criar `src/lib/audio/{engine,types,eq,reverb-presets,effects,voice,meters,chain,serialize}.ts`
3. Reescrever `audio-fx.ts` como shim
4. Trocar `webcodecs-export.ts` para usar `chain.ts`
5. Criar componentes em `src/components/editor/audio/*`
6. Remover do `editor.tsx` o painel de áudio atual e renderizar `<AudioPanel>` na aba "Áudio"
7. Conferir build, testar prévia, ajustar mapeamento legado

## Riscos
- Tone.js + OfflineAudioContext: alguns efeitos (Reverb com IR async) precisam `await reverb.ready` antes do `render()`
- Bundle size: Tone.js ~150 KB gzip — aceitável
- Latência mobile (Safari): manter `lookAhead = 0` em Tone
- Refatoração grande de `editor.tsx` — risco de regressão em clipes existentes

## Detalhes técnicos relevantes
- `Tone.setContext(new Tone.Context({ context: ctx }))` para usar AudioContext customizado
- EQ 31 bandas usa frequências `[20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]`
- Medidor RMS: `sqrt(mean(x²))`; dBFS = `20*log10(rms)`
- Clipping hold: 500 ms
