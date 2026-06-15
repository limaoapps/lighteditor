# Sistema profissional de transições (GL-Transitions)

## Visão geral
Adiciona uma camada de transições WebGL entre clipes da timeline, com aba dedicada, biblioteca categorizada, drag & drop, edição de duração e render consistente entre preview e exportação. Arquitetura modular para crescer sem reescrever.

## Estrutura de arquivos (novos)
```text
src/lib/transitions/
  registry.ts        # catálogo + categorias + metadados
  shaders/           # 1 arquivo .glsl.ts por transição (GLSL do GL-Transitions)
  gl-runtime.ts      # compila shader, faz render entre 2 texturas (from→to, progress)
  thumbnail.ts       # gera preview animado (canvas pequeno, 2 cores/imagens)
  fallback.ts        # cross-dissolve 2D quando WebGL indisponível
  types.ts           # TransitionDef, TransitionInstance, Category
src/components/editor/transitions/
  TransitionsPanel.tsx     # aba "Transições" (busca, categorias, favoritos, recentes)
  TransitionCard.tsx       # miniatura animada + drag source
  TransitionBadge.tsx      # bloco visual na timeline (com duração editável)
```

## Modelo de dados
Adicionar em `src/routes/editor.tsx` (e tipos compartilhados):
```ts
type TransitionInstance = {
  id: string;
  trackId: string;          // mesma track dos 2 clipes
  fromClipId: string;
  toClipId: string;
  transitionId: string;     // chave do registry
  duration: number;         // segundos (default 0.5)
  params?: Record<string, number>;
};
```
Persistido junto do projeto. Favoritos e "mais usados" em `localStorage`.

## Runtime WebGL
- `gl-runtime.ts`: cria um único `WebGL2RenderingContext` offscreen reutilizável. Para cada frame da janela de transição:
  1. Renderiza o frame do `fromClip` em uma textura (via canvas do `scene-renderer`).
  2. Renderiza o frame do `toClip` em outra textura.
  3. Executa o shader GL-Transitions com `progress = (t - start) / duration`.
  4. Devolve o canvas/ImageBitmap para o renderer principal compor.
- Suporte a uniforms padrão GL-Transitions (`ratio`, `progress`, `from`, `to`) + parâmetros customizados.

## Integração preview & export
- `src/lib/scene-renderer.ts`: durante a janela `[start, start+duration]` da transição, em vez de desenhar `fromClip` e `toClip` empilhados, pede ao `gl-runtime` o frame composto.
- `src/lib/webcodecs-export.ts`: mesma chamada, garantindo paridade pixel-a-pixel entre preview e MP4 exportado.
- Fallback automático: se `gl-runtime.isAvailable() === false`, usa `fallback.ts` (cross-dissolve com `globalAlpha`).

## UI / UX
Aba "Transições" no painel lateral direito, ao lado de Áudio:
- Campo de busca (filtra por nome em todas as categorias).
- Tabs/accordion por categoria: Básicas, Slides, Zoom, Glitch, Cinema, 3D, Máscaras.
- Cada card: miniatura animada em loop (gera ao hover via `thumbnail.ts` com 2 placeholders coloridos), nome, ícone de favorito, contador "usadas".
- Seção fixa no topo: ★ Favoritas e ↻ Recentes (do `localStorage`).

Aplicação:
- Drag & drop do card sobre a junção de dois clipes da mesma track → cria `TransitionInstance`.
- Clique em "Aplicar" com 2 clipes selecionados adjacentes → mesma ação.
- Drop em junção inválida → toast explicativo.

Timeline:
- `TransitionBadge` renderizado sobre a fronteira entre os dois clipes: faixa colorida com nome curto + duração ("0.5s").
- Arrastar bordas do badge edita a duração (clamp: 0.1s ≤ d ≤ min(clipAdur, clipBdur)).
- Botão direito no badge → menu: "Trocar transição", "Editar duração", "Remover".
- Duplo clique → reseta para duração padrão (0.5s).

## Catálogo inicial (32 transições)
Mapeadas para shaders oficiais do GL-Transitions (gl-transitions/gl-transitions):
- Básicas: `fade`, `dissolve`, `LinearBlur` (flash white via cor branca), `InvertedPageCurl`→adaptado para flash black, `crosshatch`/`fadecolor`.
- Slides: `directionalwarp` (4 direções), `pinwheel`/`Swirl` para push (2 direções).
- Zoom: `CrossZoom`, `DreamyZoom`, `ZoomInCircles`, `kaleidoscope`, custom smooth zoom.
- Glitch: `GlitchDisplace`, `GlitchMemories`, `static wipe`/VHS shader, `Mosaic`, `RandomNoise`.
- Cinema: `CrossWarp`, `DirectionalBlur` (2 variantes), `LuminanceMelt` (light leak), `BurnOut` (film burn).
- 3D: `cube`, `CubePerspective`, `flyeye`/flip, `doorway` (open/close), `polar_function` (fold).
- Máscaras: `circleopen`/`circleclose`, `Diamond`, `polkadots` adaptado (star/heart usam alpha mask SVG).

Cada shader vive em `src/lib/transitions/shaders/<id>.glsl.ts` exportando string. `registry.ts` mapeia id → `{ name, category, glsl, defaultParams, paramSchema }`. Adicionar nova transição = 1 arquivo + 1 linha no registry.

## Dependências
- `gl-transitions` (catálogo oficial de shaders, MIT)
- `gl-transition` (runtime helper opcional) — avaliar; se pesado, manter runtime próprio em `gl-runtime.ts`.

## Plano de implementação (ordem)
1. Tipos + registry vazio + runtime WebGL com `fade` e `dissolve`.
2. Integração no `scene-renderer` e `webcodecs-export` (paridade preview/export).
3. Aba "Transições" com busca, categorias, cards estáticos.
4. Geração de miniatura animada via `thumbnail.ts`.
5. Drag & drop + clique para aplicar; badge na timeline com edição de duração.
6. Favoritos + recentes (localStorage).
7. Preencher catálogo completo (32 shaders).
8. Fallback 2D + detecção WebGL.
9. QA: preview vs export, performance em mobile, transições back-to-back.

## Riscos
- Performance: compilar shaders sob demanda e cachear. 1 contexto WebGL reutilizado.
- Custo de render no export: rasterizar fromClip/toClip já está no pipeline; transição adiciona 1 draw call por frame na janela.
- Star/Heart não existem no GL-Transitions oficial → implementados via mask SVG + shader genérico de mask reveal.
- Compatibilidade móvel: testar em iOS Safari (WebGL2 limitado → fallback para WebGL1 com `#version 100`).

## Fora do escopo desta entrega
- Editor visual de parâmetros por transição (apenas duração nesta v1).
- Transições em áudio (crossfade já existe no engine atual).
- Importação de shaders customizados pelo usuário.
