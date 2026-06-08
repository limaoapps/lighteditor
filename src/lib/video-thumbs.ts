/**
 * Cache simples de thumbnails (frames) de vídeo para a timeline.
 * Para cada URL, gera N frames igualmente espaçados no intervalo [0..duration].
 */

export type VideoThumbs = {
  frames: HTMLCanvasElement[]; // largura/altura uniformes
  duration: number;
  width: number;
  height: number;
};

const FRAME_COUNT = 12;
const FRAME_H = 56;

const cache = new Map<string, VideoThumbs>();
const pending = new Map<string, Promise<VideoThumbs | null>>();
const failed = new Set<string>();

export function getCachedThumbs(url: string): VideoThumbs | null {
  return cache.get(url) ?? null;
}

export async function loadThumbs(url: string): Promise<VideoThumbs | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  if (failed.has(url)) return null;
  if (pending.has(url)) return pending.get(url)!;
  const p = (async (): Promise<VideoThumbs | null> => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      await new Promise<void>((res, rej) => {
        const ok = () => { cleanup(); res(); };
        const err = () => { cleanup(); rej(new Error("loadedmetadata")); };
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", ok);
          video.removeEventListener("error", err);
        };
        video.addEventListener("loadedmetadata", ok);
        video.addEventListener("error", err);
      });
      const duration = isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) throw new Error("no duration");
      const vw = video.videoWidth || 160;
      const vh = video.videoHeight || 90;
      const fw = Math.max(32, Math.round((vw / vh) * FRAME_H));
      const frames: HTMLCanvasElement[] = [];
      for (let i = 0; i < FRAME_COUNT; i++) {
        const t = (i + 0.5) * (duration / FRAME_COUNT);
        await seekTo(video, Math.min(duration - 0.01, t));
        const cv = document.createElement("canvas");
        cv.width = fw; cv.height = FRAME_H;
        const ctx = cv.getContext("2d");
        if (ctx) ctx.drawImage(video, 0, 0, fw, FRAME_H);
        frames.push(cv);
      }
      const thumbs: VideoThumbs = { frames, duration, width: fw, height: FRAME_H };
      cache.set(url, thumbs);
      return thumbs;
    } catch (e) {
      console.warn("[video-thumbs] falhou", url, e);
      failed.add(url);
      return null;
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, p);
  return p;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const onSeek = () => { video.removeEventListener("seeked", onSeek); res(); };
    video.addEventListener("seeked", onSeek);
    try { video.currentTime = t; } catch { res(); }
  });
}
