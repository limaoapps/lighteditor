/**
 * PreviewCanvas — renderiza a cena usando o MESMO motor do exportador (drawScene).
 *
 * É posicionado em `position: absolute; inset: 0` por cima da preview tradicional.
 * Quando ativo, mostra exatamente os pixels que serão gravados — WYSIWYG real.
 *
 * Interações (drag/resize/seleção) continuam ocorrendo no overlay DOM existente
 * por baixo desta camada (pointer-events: none).
 */

import { useEffect, useMemo, useRef } from "react";
import { drawScene, type Scene, type SceneItem } from "@/lib/scene-renderer";
import { MediaCache, type CachedMediaItem } from "@/lib/media-cache";
import type { ProjectAspect } from "@/lib/scene-geometry";

type Props = {
  aspect: ProjectAspect;
  v1Items: CachedMediaItem[];
  visualItems: CachedMediaItem[];
  textItems: SceneItem[];
  /** Playhead absoluto em segundos. */
  time: number;
  /** Se reproduzindo, mantém o RAF rodando mesmo sem mudança de `time`. */
  playing: boolean;
};

export function PreviewCanvas({ aspect, v1Items, visualItems, textItems, time, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<MediaCache | null>(null);
  const getCache = () => {
    if (!cacheRef.current) cacheRef.current = new MediaCache();
    return cacheRef.current;
  };
  const rafRef = useRef<number | null>(null);
  const lastDrawnRef = useRef<{ t: number; key: string } | null>(null);

  const scene: Scene = useMemo(() => ({
    aspect,
    v1Items,
    visualItems,
    textItems,
  }), [aspect, v1Items, visualItems, textItems]);

  // Pré-carrega mídia quando lista de items muda.
  useEffect(() => {
    const cache = getCache();
    const all = [...v1Items, ...visualItems];
    cache.preload(all).catch(() => { /* ignore individual failures */ });
  }, [v1Items, visualItems]);

  // Dispose ao desmontar.
  useEffect(() => () => { cacheRef.current?.dispose(); cacheRef.current = null; }, []);

  // Sincroniza play/pause dos vídeos com o playhead.
  useEffect(() => {
    const cache = getCache();
    cache.setPlaying(playing, [...v1Items, ...visualItems], time);
  }, [playing, time, v1Items, visualItems]);


  // Loop de render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const itemsKey = JSON.stringify({
      v: v1Items.map(i => [i.id, i.transform, i.fx, i.previewBox, i.start, i.inPoint, i.outPoint]),
      ov: visualItems.map(i => [i.id, i.transform, i.fx, i.previewBox, i.start, i.inPoint, i.outPoint]),
      t: textItems.map(i => [i.id, i.transform, i.text, i.fx, i.start, i.inPoint, i.outPoint]),
    });

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      drawScene(ctx, scene, time, canvas.width, canvas.height, getCache());
      lastDrawnRef.current = { t: time, key: itemsKey };
    };

    // Dirty-flag: só redesenha se algo mudou ou se está tocando.
    const last = lastDrawnRef.current;
    if (!last || last.t !== time || last.key !== itemsKey) {
      draw();
    }

    if (playing) {
      const tick = () => { draw(); rafRef.current = requestAnimationFrame(tick); };
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [scene, time, playing, v1Items, visualItems, textItems]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 30, background: "transparent" }}
    />
  );
}
