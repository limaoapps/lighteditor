import type { TransitionDef, TransitionCategory } from "./types";
import { SHADERS } from "./shaders";

function def(
  id: string,
  name: string,
  category: TransitionCategory,
  shaderKey: keyof typeof SHADERS,
  opts: Partial<TransitionDef> = {},
): TransitionDef {
  return {
    id,
    name,
    category,
    glsl: SHADERS[shaderKey],
    defaultDuration: 0.6,
    ...opts,
  };
}

export const TRANSITIONS: TransitionDef[] = [
  // Básicas
  def("fade", "Fade", "basicas", "fade", { icon: "◐", defaultDuration: 0.6 }),
  def("dissolve", "Dissolve", "basicas", "dissolve", { icon: "✦", defaultDuration: 0.8 }),
  def("flash-white", "Flash White", "basicas", "flashWhite", { icon: "☀", defaultDuration: 0.5 }),
  def("flash-black", "Flash Black", "basicas", "flashBlack", { icon: "■", defaultDuration: 0.5 }),
  def("cross-fade", "Cross Fade", "basicas", "crossFade", { icon: "✕", defaultDuration: 0.7 }),

  // Slides
  def("slide-left", "Slide Left", "slides", "slideLeft", { icon: "⇠", defaultDuration: 0.5 }),
  def("slide-right", "Slide Right", "slides", "slideRight", { icon: "⇢", defaultDuration: 0.5 }),
  def("slide-up", "Slide Up", "slides", "slideUp", { icon: "⇡", defaultDuration: 0.5 }),
  def("slide-down", "Slide Down", "slides", "slideDown", { icon: "⇣", defaultDuration: 0.5 }),
  def("push-left", "Push Left", "slides", "pushLeft", { icon: "⇇", defaultDuration: 0.5 }),
  def("push-right", "Push Right", "slides", "pushRight", { icon: "⇉", defaultDuration: 0.5 }),

  // Zoom
  def("zoom-in", "Zoom In", "zoom", "zoomIn", { icon: "⊕", defaultDuration: 0.6 }),
  def("zoom-out", "Zoom Out", "zoom", "zoomOut", { icon: "⊖", defaultDuration: 0.6 }),
  def("dreamy-zoom", "Dreamy Zoom", "zoom", "dreamyZoom", { icon: "❂", defaultDuration: 0.9 }),
  def("zoom-blur", "Zoom Blur", "zoom", "zoomBlur", { icon: "✺", defaultDuration: 0.7 }),
  def("smooth-zoom", "Smooth Zoom", "zoom", "smoothZoom", { icon: "◉", defaultDuration: 0.7 }),

  // Glitch
  def("rgb-split", "RGB Split", "glitch", "rgbSplit", { icon: "▣", defaultDuration: 0.5 }),
  def("digital-glitch", "Digital Glitch", "glitch", "digitalGlitch", { icon: "⚡", defaultDuration: 0.45 }),
  def("vhs", "VHS", "glitch", "vhs", { icon: "▤", defaultDuration: 0.6 }),
  def("signal-error", "Signal Error", "glitch", "signalError", { icon: "✖", defaultDuration: 0.5 }),
  def("tv-noise", "TV Noise", "glitch", "tvNoise", { icon: "▦", defaultDuration: 0.55 }),

  // Cinema
  def("cross-warp", "Cross Warp", "cinema", "crossWarp", { icon: "⌇", defaultDuration: 0.8 }),
  def("motion-blur", "Motion Blur", "cinema", "motionBlur", { icon: "≋", defaultDuration: 0.6 }),
  def("directional-blur", "Directional Blur", "cinema", "directionalBlur", { icon: "≣", defaultDuration: 0.55 }),
  def("light-leak", "Light Leak", "cinema", "lightLeak", { icon: "☼", defaultDuration: 0.9 }),
  def("film-burn", "Film Burn", "cinema", "filmBurn", { icon: "✷", defaultDuration: 0.9 }),

  // 3D
  def("cube", "Cube", "3d", "cube", { icon: "▱", defaultDuration: 0.8 }),
  def("cube-perspective", "Cube Perspective", "3d", "cubePerspective", { icon: "◳", defaultDuration: 0.9 }),
  def("flip", "Flip", "3d", "flip", { icon: "⤿", defaultDuration: 0.7 }),
  def("fold", "Fold", "3d", "fold", { icon: "▽", defaultDuration: 0.7 }),
  def("door-open", "Door Open", "3d", "doorOpen", { icon: "⫷", defaultDuration: 0.8 }),
  def("door-close", "Door Close", "3d", "doorClose", { icon: "⫸", defaultDuration: 0.8 }),

  // Máscaras
  def("circle-open", "Circle Open", "mascaras", "circleOpen", { icon: "○", defaultDuration: 0.7 }),
  def("circle-close", "Circle Close", "mascaras", "circleClose", { icon: "●", defaultDuration: 0.7 }),
  def("diamond", "Diamond", "mascaras", "diamond", { icon: "◆", defaultDuration: 0.7 }),
  def("star", "Star", "mascaras", "star", { icon: "★", defaultDuration: 0.8 }),
  def("heart", "Heart", "mascaras", "heart", { icon: "♥", defaultDuration: 0.8 }),
];

const BY_ID: Record<string, TransitionDef> = Object.fromEntries(TRANSITIONS.map(t => [t.id, t]));

export function getTransition(id: string | undefined | null): TransitionDef | undefined {
  if (!id) return undefined;
  return BY_ID[id];
}

export function transitionsByCategory(): Record<TransitionCategory, TransitionDef[]> {
  const out = {} as Record<TransitionCategory, TransitionDef[]>;
  for (const t of TRANSITIONS) {
    (out[t.category] ||= []).push(t);
  }
  return out;
}
