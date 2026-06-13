/**
 * Cache compartilhado de mídia (vídeo/imagem) — usado por preview e export.
 *
 * Garante que o mesmo HTMLVideoElement seekado seja consumido pelos dois lados,
 * eliminando uma classe de divergências de frame entre preview e export.
 */

import type { MediaResolver, MediaSource, SceneItem } from "./scene-renderer";

export interface CachedMediaItem extends SceneItem {
  file?: File;
  url?: string;
}

export class MediaCache implements MediaResolver {
  private videos = new Map<string, HTMLVideoElement>();
  private images = new Map<string, HTMLImageElement>();
  private urls = new Map<string, string>();

  /** Pré-carrega elementos para uma lista de items (resolve quando metadados prontos). */
  async preload(items: CachedMediaItem[]): Promise<void> {
    await Promise.all(items.map(it => this.ensure(it).catch(() => null)));
  }

  /** Garante que o elemento existe e seus metadados foram carregados. */
  async ensure(item: CachedMediaItem): Promise<HTMLVideoElement | HTMLImageElement | null> {
    if (item.kind === "video") {
      let v = this.videos.get(item.id);
      if (v) return v;
      const url = item.url ?? (item.file ? URL.createObjectURL(item.file) : null);
      if (!url) return null;
      if (!item.url && item.file) this.urls.set(item.id, url);
      v = document.createElement("video");
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        const ok = () => { v!.removeEventListener("loadeddata", ok); v!.removeEventListener("error", err); resolve(); };
        const err = () => { v!.removeEventListener("loadeddata", ok); v!.removeEventListener("error", err); reject(new Error(`video ${item.name}`)); };
        v!.addEventListener("loadeddata", ok);
        v!.addEventListener("error", err);
      });
      this.videos.set(item.id, v);
      return v;
    }
    if (item.kind === "image") {
      let img = this.images.get(item.id);
      if (img) return img;
      const url = item.url ?? (item.file ? URL.createObjectURL(item.file) : null);
      if (!url) return null;
      if (!item.url && item.file) this.urls.set(item.id, url);
      img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img!.onload = () => resolve();
        img!.onerror = () => reject(new Error(`image ${item.name}`));
        img!.src = url;
      });
      this.images.set(item.id, img);
      return img;
    }
    return null;
  }

  /** Seek (async) — utilizado pelo exportador (preview usa o currentTime corrente). */
  seek(item: SceneItem, t: number): Promise<void> {
    const v = this.videos.get(item.id);
    if (!v) return Promise.resolve();
    return new Promise(resolve => {
      const onSeeked = () => { v.removeEventListener("seeked", onSeeked); resolve(); };
      v.addEventListener("seeked", onSeeked);
      try { v.currentTime = Math.max(0, t); } catch { resolve(); }
    });
  }

  /** MediaResolver síncrono — usado pelo drawScene. */
  resolve(item: SceneItem, absT: number): MediaSource | null {
    if (item.kind === "video") {
      const v = this.videos.get(item.id);
      if (!v) return null;
      const speed = item.speed && item.speed > 0 ? item.speed : 1;
      const want = item.inPoint + (absT - item.start) * speed;
      // Preview: ajusta currentTime sem aguardar seek (faz catch-up no próximo frame).
      if (Math.abs(v.currentTime - want) > 0.05) {
        try { v.currentTime = Math.max(0, want); } catch { /* ignore */ }
      }
      try { v.playbackRate = speed; (v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true; } catch { /* ignore */ }
      return v as unknown as MediaSource;
    }
    if (item.kind === "image") {
      const img = this.images.get(item.id);
      return (img as unknown as MediaSource) ?? null;
    }
    return null;
  }

  /** Sincroniza play/pause dos vídeos com o playhead (apenas preview). */
  setPlaying(playing: boolean, items: SceneItem[], absT: number) {
    for (const it of items) {
      if (it.kind !== "video") continue;
      const v = this.videos.get(it.id);
      if (!v) continue;
      const speed = it.speed && it.speed > 0 ? it.speed : 1;
      const tlDuration = (it.outPoint - it.inPoint); // já achatado no projeto da cena
      const localActive = absT >= it.start && absT < it.start + tlDuration;
      try { v.playbackRate = speed; } catch { /* ignore */ }
      if (playing && localActive) {
        if (v.paused) { v.play().catch(() => { /* ignore */ }); }
      } else if (!v.paused) {
        v.pause();
      }
    }
  }

  dispose() {
    for (const v of this.videos.values()) { try { v.pause(); v.src = ""; v.load(); } catch { /* ignore */ } }
    this.videos.clear();
    this.images.clear();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
