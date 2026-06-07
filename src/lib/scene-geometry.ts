/**
 * Fonte única da verdade para a geometria da cena.
 * USADA pelo preview (CSS) e pelo exportador (canvas) — não duplicar lógica.
 *
 * Princípio WYSIWYG:
 *   O que o usuário vê no preview deve ser exatamente o que sai no render.
 *   Nada aqui pode recalcular escala, posição ou crop por conta própria.
 */

export type SceneItemKind = "video" | "image" | "text" | "audio";

export type SceneItemInput = {
  kind: SceneItemKind;
  /** Largura natural da fonte (pixels do arquivo). */
  width?: number;
  /** Altura natural da fonte (pixels do arquivo). */
  height?: number;
};

export type ProjectAspect = { w: number; h: number };

/**
 * Bounds VISÍVEIS (em % da preview box / canvas de export) para um item.
 *
 * - video: usa object-fit: contain ⇒ o conteúdo visível é o retângulo do vídeo
 *   inscrito na preview (sem deformação). Retorna esse retângulo em %.
 * - image: caixa base ~60% da altura, mantém AR, limitada a 90% da largura.
 * - text: rough box (placeholder, não usado para render).
 *
 * O AR do retângulo retornado, quando multiplicado pelo AR da preview/target,
 * SEMPRE resulta no AR da fonte. Isso garante que o `drawImage` no canvas e
 * o `object-fit: contain` da DOM produzam o mesmo enquadramento.
 */
export function computeItemBounds(
  item: SceneItemInput,
  aspect: ProjectAspect,
): { w: number; h: number } {
  const mw = item.width || 16;
  const mh = item.height || 9;
  const ar = mw / mh;
  const previewAR = aspect.w / aspect.h;

  if (item.kind === "video") {
    if (ar >= previewAR) return { w: 100, h: (previewAR / ar) * 100 };
    return { h: 100, w: (ar / previewAR) * 100 };
  }
  if (item.kind === "image") {
    let h = 60;
    let w = (h / 100) * (ar / previewAR) * 100;
    if (w > 90) {
      w = 90;
      h = (w / 100) * (previewAR / ar) * 100;
    }
    return { w, h };
  }
  return { w: 40, h: 14 };
}

/**
 * Dado o `previewBox` (em %), retorna a caixa final em PIXELS no canvas
 * de destino. Garante que o aspect ratio bate com a fonte (sem stretch).
 */
export function previewBoxToPixels(
  previewBox: { wPct: number; hPct: number },
  targetW: number,
  targetH: number,
): { w: number; h: number } {
  return {
    w: (previewBox.wPct / 100) * targetW,
    h: (previewBox.hPct / 100) * targetH,
  };
}
