// Processador Chroma Key (WebGL). Recebe uma fonte (vídeo/imagem) e produz
// um canvas com pixels da cor-chave removidos. Usado pelo scene-renderer
// antes do drawImage para vídeos/imagens com fx.chroma.enabled.
//
// Algoritmo: distância no espaço YCbCr entre cada pixel e a cor-chave, com
// duas faixas (similarity = corte total, smoothness = transição suave) e
// supressão de "spill" (vazamento da cor-chave nas bordas) misturando o
// canal dominante com o cinza ponderado.

export type ChromaKeyConfig = {
  enabled: boolean;
  /** Cor-chave em hex (#RRGGBB). Default: verde #00E03C. */
  color: string;
  /** 0..100 — quanto maior, mais cores próximas viram totalmente transparentes. */
  similarity: number;
  /** 0..100 — largura da transição (anti-aliasing das bordas). */
  smoothness: number;
  /** 0..100 — força da supressão de vazamento da cor-chave. */
  spill: number;
};

export const DEFAULT_CHROMA: ChromaKeyConfig = {
  enabled: false,
  color: "#00E03C",
  similarity: 40,
  smoothness: 12,
  spill: 50,
};

const VERT = `
attribute vec2 a_pos;
varying vec2 vUv;
void main(){
  vUv = vec2(a_pos.x * 0.5 + 0.5, 1.0 - (a_pos.y * 0.5 + 0.5));
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_tex;
uniform vec3 u_key;       // RGB 0..1
uniform float u_sim;      // 0..1
uniform float u_smooth;   // 0..1
uniform float u_spill;    // 0..1

// RGB -> YCbCr (BT.601)
vec3 rgb2ycbcr(vec3 c){
  float y  = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = (c.b - y) * 0.564 + 0.5;
  float cr = (c.r - y) * 0.713 + 0.5;
  return vec3(y, cb, cr);
}

void main(){
  vec4 px = texture2D(u_tex, vUv);
  vec3 keyYCC = rgb2ycbcr(u_key);
  vec3 pxYCC  = rgb2ycbcr(px.rgb);
  // distância apenas em croma (Cb/Cr) para tolerar variações de luz
  float d = distance(pxYCC.yz, keyYCC.yz);
  // mascara: 0 = chave (transparente), 1 = mantém
  float edge0 = u_sim;
  float edge1 = u_sim + max(u_smooth, 0.0001);
  float mask = smoothstep(edge0, edge1, d);

  // supressão de spill: se for "puxado" pra cor-chave, desatura nessa direção
  vec3 rgb = px.rgb;
  if (u_spill > 0.0) {
    float spillAmt = (1.0 - mask) * u_spill;
    float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
    // mistura pra cinza apenas no canal dominante da chave (geralmente verde/azul)
    vec3 desat = mix(rgb, vec3(gray), spillAmt);
    // mantém canais que NÃO são a cor-chave
    vec3 keyDir = normalize(u_key + vec3(0.0001));
    float align = max(0.0, dot(normalize(rgb + vec3(0.0001)), keyDir));
    rgb = mix(rgb, desat, align);
  }

  gl_FragColor = vec4(rgb, px.a * mask);
}`;

class ChromaKeyRuntime {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private uKey: WebGLUniformLocation | null = null;
  private uSim: WebGLUniformLocation | null = null;
  private uSmo: WebGLUniformLocation | null = null;
  private uSpi: WebGLUniformLocation | null = null;
  private aPos = -1;
  private failed = false;

  private ensure(w: number, h: number): WebGLRenderingContext | null {
    if (this.failed) return null;
    if (!this.canvas) {
      try {
        this.canvas = typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(w, h)
          : Object.assign(document.createElement("canvas"), { width: w, height: h });
        const gl = (this.canvas as HTMLCanvasElement).getContext("webgl", { premultipliedAlpha: false, alpha: true }) as WebGLRenderingContext | null;
        if (!gl) { this.failed = true; return null; }
        this.gl = gl;
        const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, VERT); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, FRAG); gl.compileShader(fs);
        const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.failed = true; return null; }
        this.prog = prog;
        this.aPos = gl.getAttribLocation(prog, "a_pos");
        this.uTex = gl.getUniformLocation(prog, "u_tex");
        this.uKey = gl.getUniformLocation(prog, "u_key");
        this.uSim = gl.getUniformLocation(prog, "u_sim");
        this.uSmo = gl.getUniformLocation(prog, "u_smooth");
        this.uSpi = gl.getUniformLocation(prog, "u_spill");
        this.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      } catch { this.failed = true; return null; }
    }
    const c = this.canvas as HTMLCanvasElement;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return this.gl;
  }

  render(source: TexImageSource, w: number, h: number, cfg: ChromaKeyConfig): HTMLCanvasElement | OffscreenCanvas | null {
    const gl = this.ensure(w, h);
    if (!gl || !this.prog) return null;
    const [r, g, b] = hexToRgb01(cfg.color);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch { return null; }
    gl.uniform1i(this.uTex, 0);
    gl.uniform3f(this.uKey, r, g, b);
    gl.uniform1f(this.uSim, Math.max(0, Math.min(100, cfg.similarity)) / 100 * 0.5);
    gl.uniform1f(this.uSmo, Math.max(0, Math.min(100, cfg.smoothness)) / 100 * 0.3);
    gl.uniform1f(this.uSpi, Math.max(0, Math.min(100, cfg.spill)) / 100);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0.878, 0.235];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

let sharedRuntime: ChromaKeyRuntime | null = null;
export function getChromaRuntime(): ChromaKeyRuntime {
  if (!sharedRuntime) sharedRuntime = new ChromaKeyRuntime();
  return sharedRuntime;
}

export function applyChromaKey(source: TexImageSource, w: number, h: number, cfg: ChromaKeyConfig): HTMLCanvasElement | OffscreenCanvas | null {
  return getChromaRuntime().render(source, w, h, cfg);
}
