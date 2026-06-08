import { useEffect, useRef, useState } from "react";
import { getCachedThumbs, loadThumbs, type VideoThumbs } from "@/lib/video-thumbs";

type Props = {
  url: string;
  inPoint: number;
  outPoint: number;
  className?: string;
};

/** Desenha tira de thumbnails do vídeo dentro do clipe na timeline. */
export function VideoFilmstrip({ url, inPoint, outPoint, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbs, setThumbs] = useState<VideoThumbs | null>(() => getCachedThumbs(url));

  useEffect(() => {
    let alive = true;
    const c = getCachedThumbs(url);
    if (c) { setThumbs(c); return; }
    setThumbs(null);
    loadThumbs(url).then(t => { if (alive) setThumbs(t); });
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      canvas.width = Math.max(1, Math.floor(cw * dpr));
      canvas.height = Math.max(1, Math.floor(ch * dpr));
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!thumbs || thumbs.frames.length === 0 || thumbs.duration <= 0) return;
      const W = canvas.width;
      const H = canvas.height;
      // Mantém aspect-ratio do vídeo: cada frame ocupa altura H, largura proporcional.
      const fw = Math.max(1, Math.round((thumbs.width / thumbs.height) * H));
      // Conta quantos frames cabem na largura.
      const count = Math.max(1, Math.ceil(W / fw));
      const span = Math.max(0.001, outPoint - inPoint);
      for (let i = 0; i < count; i++) {
        const t = inPoint + ((i + 0.5) / count) * span;
        const idx = Math.max(0, Math.min(thumbs.frames.length - 1,
          Math.floor((t / thumbs.duration) * thumbs.frames.length)));
        const frame = thumbs.frames[idx];
        ctx.drawImage(frame, i * fw, 0, fw, H);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [thumbs, inPoint, outPoint]);

  return <canvas ref={canvasRef} className={className} />;
}
