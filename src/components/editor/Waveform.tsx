import { useEffect, useRef, useState } from "react";
import { getCachedPeaks, loadPeaks, type Peaks } from "@/lib/waveform-cache";

type Props = {
  url: string;
  inPoint: number;   // segundos no source
  outPoint: number;  // segundos no source
  color?: string;
  className?: string;
};

/** Desenha forma de onda do trecho [inPoint, outPoint] em canvas, escalando ao tamanho. */
export function Waveform({ url, inPoint, outPoint, color = "rgba(255,255,255,0.55)", className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(() => getCachedPeaks(url));

  useEffect(() => {
    let alive = true;
    const cached = getCachedPeaks(url);
    if (cached) { setPeaks(cached); return; }
    setPeaks(null);
    loadPeaks(url).then(p => { if (alive) setPeaks(p); });
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
      if (!peaks || peaks.duration <= 0) return;

      const total = peaks.min.length;
      const startIdx = Math.max(0, Math.min(total - 1, Math.floor((inPoint / peaks.duration) * total)));
      const endIdx = Math.max(startIdx + 1, Math.min(total, Math.ceil((outPoint / peaks.duration) * total)));
      const span = endIdx - startIdx;
      const W = canvas.width;
      const H = canvas.height;
      const mid = H / 2;
      ctx.fillStyle = color;
      const step = Math.max(1, Math.floor(span / W));
      for (let x = 0; x < W; x++) {
        const a = startIdx + Math.floor((x / W) * span);
        const b = Math.min(endIdx, a + step);
        let mn = 1, mx = -1;
        for (let k = a; k < b; k++) {
          if (peaks.min[k] < mn) mn = peaks.min[k];
          if (peaks.max[k] > mx) mx = peaks.max[k];
        }
        if (mn > mx) { mn = 0; mx = 0; }
        const y1 = mid + mn * mid * 0.95;
        const y2 = mid + mx * mid * 0.95;
        const h = Math.max(1, y2 - y1);
        ctx.fillRect(x, y1, 1, h);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [peaks, inPoint, outPoint, color]);

  return <canvas ref={canvasRef} className={className} />;
}
