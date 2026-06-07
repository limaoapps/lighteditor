import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

const CORE_BASE = "/ffmpeg";
const LOAD_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} demorou demais para carregar.`)), LOAD_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) window.clearTimeout(timer);
  });
}

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (instance) {
    if (onLog) instance.on("log", ({ message }) => onLog(message));
    return instance;
  }
  if (!loading) {
    loading = (async () => {
      try {
        console.log("Carregando FFmpeg WASM local de:", CORE_BASE);
        const ff = new FFmpeg();
        ff.on("log", ({ message }) => {
          console.log("[FFmpeg]", message);
          if (onLog) onLog(message);
        });
        const coreURL = `${CORE_BASE}/ffmpeg-core.js`;
        const wasmURL = `${CORE_BASE}/ffmpeg-core.wasm`;
        console.log("FFmpeg core:", coreURL);
        console.log("FFmpeg wasm:", wasmURL);
        await withTimeout(ff.load({ coreURL, wasmURL }), "FFmpeg");
        instance = ff;
        console.log("FFmpeg carregado com sucesso.");
        return ff;
      } catch (err) {
        loading = null;
        instance = null;
        console.error("Falha ao carregar FFmpeg:", err);
        throw err;
      }
    })();
  }
  return loading;
}

export function resetFFmpeg() {
  instance = null;
  loading = null;
}

export { fetchFile };
