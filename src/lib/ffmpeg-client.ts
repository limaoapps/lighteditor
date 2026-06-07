// Lazy singleton wrapper around ffmpeg.wasm (single-threaded, no SharedArrayBuffer required).
// Loaded only in the browser, only when the user runs an export/cut operation.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg();
      if (onLog) ff.on("log", ({ message }) => onLog(message));
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      instance = ff;
      return ff;
    })().catch((err) => {
      loading = null;
      instance = null;
      throw err;
    });
  }
  return loading;
}

export function resetFFmpeg() {
  instance = null;
  loading = null;
}

export { fetchFile };
