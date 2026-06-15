// Tipos do sistema de transições profissionais (GL-Transitions).

export type TransitionCategory =
  | "basicas"
  | "slides"
  | "zoom"
  | "glitch"
  | "cinema"
  | "3d"
  | "mascaras";

export const CATEGORY_LABEL: Record<TransitionCategory, string> = {
  basicas: "Básicas",
  slides: "Slides",
  zoom: "Zoom",
  glitch: "Glitch",
  cinema: "Cinema",
  "3d": "3D",
  mascaras: "Máscaras",
};

export type ParamSchema = {
  key: string;
  label?: string;
  min: number;
  max: number;
  step?: number;
  default: number;
};

export type TransitionDef = {
  id: string;
  name: string;
  category: TransitionCategory;
  /** GLSL: corpo da função `vec4 transition(vec2 uv) { ... }` (sem assinatura). */
  glsl: string;
  /** Uniforms extras (além dos padrão). */
  params?: ParamSchema[];
  /** Duração default em segundos. */
  defaultDuration: number;
  /** Ícone curto para UI. */
  icon?: string;
  /** Cor de acento para chip. */
  color?: string;
};

export type TransitionInstance = {
  id: string;
  /** id da TransitionDef no registry. */
  transitionId: string;
  /** clipes envolvidos (na mesma track). */
  leftClipId: string;
  rightClipId: string;
  duration: number;
  params?: Record<string, number>;
};
