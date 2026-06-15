// Gera animação de pré-visualização de uma transição usando dois canvases
// "fake" (gradientes/letras) como fontes A e B.

import { sharedRuntime } from "./gl-runtime";
import { fallback2D } from "./fallback";
import type { TransitionDef } from "./types";

function placeholderCanvas(
  w: number,
  h: number,
  colorA: string,
  colorB: string,
  label: string,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, colorA);
  g.addColorStop(1, colorB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `bold ${Math.floor(h * 0.45)}px ui-sans-serif, system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2);
  return c;
}

let _A: HTMLCanvasElement | null = null;
let _B: HTMLCanvasElement | null = null;
function sources(w: number, h: number): [HTMLCanvasElement, HTMLCanvasElement] {
  if (!_A || _A.width !== w || _A.height !== h) {
    _A = placeholderCanvas(w, h, "#2563eb", "#7c3aed", "A");
    _B = placeholderCanvas(w, h, "#f43f5e", "#f59e0b", "B");
  }
  return [_A!, _B!];
}

/** Renderiza um frame da transição no canvas alvo. progress ∈ [0,1]. */
export function renderThumbnailFrame(
  target: HTMLCanvasElement,
  def: TransitionDef,
  progress: number,
) {
  const w = target.width;
  const h = target.height;
  const [a, b] = sources(w, h);
  const rt = sharedRuntime();
  const out = rt.render(def, a, b, progress, w, h);
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (out) {
    ctx.drawImage(out as CanvasImageSource, 0, 0, w, h);
  } else {
    fallback2D(ctx, a, b, progress, w, h);
  }
}
