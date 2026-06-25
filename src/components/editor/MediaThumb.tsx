import { useEffect, useMemo, useRef, useState } from "react";
import { Music2 } from "lucide-react";

type Props = {
  kind: "video" | "image" | "audio" | "text";
  url?: string;
  file?: File;
  name: string;
  className?: string;
};

/** Miniatura visual para um asset de mídia (imagem/vídeo/áudio). */
export function MediaThumb({ kind, url, file, name, className }: Props) {
  const resolved = useMemo(() => {
    if (url) return url;
    if (file) return URL.createObjectURL(file);
    return null;
  }, [url, file]);

  useEffect(() => {
    return () => {
      if (!url && resolved) URL.revokeObjectURL(resolved);
    };
  }, [url, resolved]);

  if (kind === "image" && resolved) {
    return (
      <img
        src={resolved}
        alt={name}
        loading="lazy"
        className={className}
        draggable={false}
      />
    );
  }
  if (kind === "video" && resolved) {
    return <VideoThumb src={resolved} className={className} />;
  }
  return (
    <div className={`${className ?? ""} flex items-center justify-center bg-muted`}>
      <Music2 className="h-6 w-6 text-primary/60" />
    </div>
  );
}

function VideoThumb({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onLoaded = () => {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) * 0.1); } catch { /* ignore */ }
    };
    const onSeeked = () => setReady(true);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="metadata"
      className={className}
      style={{ opacity: ready ? 1 : 0.6 }}
    />
  );
}
