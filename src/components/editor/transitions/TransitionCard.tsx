import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { renderThumbnailFrame } from "@/lib/transitions/thumbnail";
import type { TransitionDef } from "@/lib/transitions/types";

type Props = {
  def: TransitionDef;
  favorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  recent?: boolean;
};

export function TransitionCard({
  def,
  favorite,
  onToggleFavorite,
  onClick,
  onDragStart,
  onDragEnd,
  recent,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  // Render frame estático (progress ≈ 0.5) ao montar
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 120 * dpr;
    c.height = 64 * dpr;
    try { renderThumbnailFrame(c, def, 0.5); } catch { /* ignore */ }
  }, [def]);

  // Loop animado no hover
  useEffect(() => {
    if (!hover) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const c = canvasRef.current;
    if (!c) return;
    startRef.current = performance.now();
    const loop = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const duration = 1.4;
      const p = (elapsed % duration) / duration;
      try { renderThumbnailFrame(c, def, p); } catch { /* ignore */ }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hover, def]);

  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${def.name} — arraste entre dois clipes ou clique para aplicar (${def.defaultDuration.toFixed(1)}s)`}
      className="group relative flex w-full cursor-grab flex-col gap-1 overflow-hidden rounded-md border border-border bg-card p-1 text-left transition hover:border-primary/60 active:cursor-grabbing"
    >
      <div className="relative aspect-[15/8] w-full overflow-hidden rounded-sm bg-black/50">
        <canvas ref={canvasRef} className="block h-full w-full" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`absolute right-1 top-1 rounded p-0.5 transition ${favorite ? "text-amber-400" : "text-white/60 opacity-0 group-hover:opacity-100"} hover:bg-black/40`}
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Star className={`h-3 w-3 ${favorite ? "fill-current" : ""}`} />
        </button>
        {recent && (
          <span className="absolute left-1 top-1 rounded bg-primary/80 px-1 text-[8px] font-semibold text-primary-foreground">
            ↻
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 px-0.5 text-[10px] leading-tight">
        <span className="flex items-center gap-1 truncate font-medium">
          {def.icon && <span aria-hidden>{def.icon}</span>}
          {def.name}
        </span>
        <span className="shrink-0 text-muted-foreground">{def.defaultDuration.toFixed(1)}s</span>
      </div>
    </button>
  );
}
