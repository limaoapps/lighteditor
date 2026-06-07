import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (instance) {
    if (onLog) instance.on("log", ({ message }) => onLog(message));
    return instance;
  }
  if (!loading) {
    loading = (async () => {
      try {
        console.log("Carregando FFmpeg WASM de:", CORE_BASE);
        const ff = new FFmpeg();
        ff.on("log", ({ message }) => {
          console.log("[FFmpeg]", message);
          if (onLog) onLog(message);
        });
        const [coreURL, wasmURL] = await Promise.all([
          toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
          toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        ]);
        await ff.load({ coreURL, wasmURL });
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
