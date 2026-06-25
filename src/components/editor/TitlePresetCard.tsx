/**
 * TitlePresetCard — pré-visualização compacta de um preset de título ou
 * lower-third. Renderiza uma miniatura estilizada (fonte, cor, fundo, barra
 * de destaque) sobre um fundo escuro para dar uma ideia visual do efeito,
 * mantendo o card pequeno o suficiente para um grid de 3 colunas.
 */

import { useMemo } from "react";

type AnyPreset = {
  id: string;
  label: string;
  hint: string;
  build: () => {
    content: string;
    size: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    fontFamily?: string;
    letterSpacing?: number;
    align?: "left" | "center" | "right";
    styleKind?: "default" | "title" | "lowerthird";
    accentColor?: string;
    bgColor?: string;
    bgOpacity?: number;
    radius?: number;
    subtitle?: string;
    subtitleSize?: number;
    subtitleColor?: string;
  };
};

export function TitlePresetCard({ preset, onAdd }: { preset: AnyPreset; onAdd: () => void }) {
  const t = useMemo(() => preset.build(), [preset]);
  const isLT = t.styleKind === "lowerthird";
  const accent = t.accentColor || "#22c55e";
  const sample = t.content.length > 22 ? t.content.slice(0, 20) + "…" : t.content;
  const subtitle = t.subtitle ? (t.subtitle.length > 24 ? t.subtitle.slice(0, 22) + "…" : t.subtitle) : "";

  // Tamanho de fonte normalizado (~10-13px) para caber no card.
  const fontSize = Math.max(10, Math.min(13, Math.round((t.size / 96) * 14)));
  const subSize = Math.max(8, Math.round(fontSize * 0.7));

  // Fundo do preview (igual ao canvas: usa bgColor/bgOpacity quando lower-third).
  const bg = isLT && t.bgColor
    ? `${t.bgColor}${Math.round(Math.min(1, Math.max(0, t.bgOpacity ?? 0.85)) * 255).toString(16).padStart(2, "0")}`
    : "transparent";

  return (
    <button
      onClick={onAdd}
      title={`${preset.label} — ${preset.hint}`}
      className="group relative flex aspect-[4/3] flex-col overflow-hidden rounded-md border border-border bg-gradient-to-br from-neutral-900 to-neutral-950 text-left transition hover:border-primary/60 hover:shadow-md"
    >
      {/* Área de preview */}
      <div className="relative flex flex-1 items-center justify-center px-2">
        <div
          className="flex max-w-full items-center"
          style={{ background: bg, borderRadius: isLT ? (t.radius ?? 4) : 0, padding: isLT ? "4px 6px 4px 8px" : 0 }}
        >
          {isLT && (
            <span
              aria-hidden
              style={{ background: accent, width: 3, alignSelf: "stretch", borderRadius: 1, marginRight: 4 }}
            />
          )}
          <div className="min-w-0 leading-tight">
            <div
              className="truncate"
              style={{
                color: t.color || "#fff",
                fontFamily: t.fontFamily,
                fontWeight: t.bold ? 800 : 500,
                fontStyle: t.italic ? "italic" : "normal",
                fontSize,
                letterSpacing: Math.min(2, (t.letterSpacing ?? 0) * 0.3),
                textAlign: (t.align as "left" | "center" | "right") || "center",
              }}
            >
              {sample}
            </div>
            {subtitle && (
              <div
                className="truncate"
                style={{
                  color: t.subtitleColor || "rgba(255,255,255,0.75)",
                  fontFamily: t.fontFamily,
                  fontSize: subSize,
                }}
              >
                {subtitle}
              </div>
            )}
            {t.styleKind === "title" && (
              <div
                aria-hidden
                style={{ background: accent, height: 2, width: "55%", margin: "3px auto 0", borderRadius: 1 }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Rodapé com nome do preset */}
      <div className="flex items-center justify-between border-t border-border/60 bg-card/80 px-1.5 py-1">
        <span className="truncate text-[10px] font-semibold">{preset.label}</span>
        <span className="ml-1 hidden rounded bg-primary/15 px-1 text-[8px] uppercase tracking-wider text-primary group-hover:inline">+</span>
      </div>
    </button>
  );
}
