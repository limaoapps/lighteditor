// Runtime WebGL para transições. Compila e cacheia programas por id e renderiza
// um frame de transição entre duas imagens-fonte em um canvas off-screen.
// Em caso de falha de WebGL, retorna null (consumidor deve usar o fallback 2D).

import type { TransitionDef } from "./types";

const VERT = `
attribute vec2 a_pos;
varying vec2 vUv;
void main(){
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

function fragmentFor(def: TransitionDef): string {
  return `
precision highp float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
uniform float ratio;
varying vec2 vUv;
vec4 getFromColor(vec2 uv){ return texture2D(from, uv); }
vec4 getToColor(vec2 uv){ return texture2D(to, uv); }
vec4 transition(vec2 uv){
${def.glsl}
}
void main(){
  gl_FragColor = transition(vUv);
}
`;
}

type Compiled = {
  prog: WebGLProgram;
  aPos: number;
  uFrom: WebGLUniformLocation | null;
  uTo: WebGLUniformLocation | null;
  uProgress: WebGLUniformLocation | null;
  uRatio: WebGLUniformLocation | null;
};

export class GLTransitionRuntime {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGLRenderingContext | null = null;
  private cache = new Map<string, Compiled>();
  private quad: WebGLBuffer | null = null;
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private failed = false;

  ensure(width: number, height: number): WebGLRenderingContext | null {
    if (this.failed) return null;
    if (!this.canvas) {
      try {
        this.canvas =
          typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(width, height)
            : Object.assign(document.createElement("canvas"), { width, height });
      } catch {
        this.failed = true;
        return null;
      }
    }
    if (this.canvas.width !== width) (this.canvas as HTMLCanvasElement).width = width;
    if (this.canvas.height !== height) (this.canvas as HTMLCanvasElement).height = height;
    if (!this.gl) {
      try {
        const ctx = (this.canvas as HTMLCanvasElement).getContext("webgl", {
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          antialias: false,
        }) as WebGLRenderingContext | null;
        if (!ctx) {
          this.failed = true;
          return null;
        }
        this.gl = ctx;
        this.quad = ctx.createBuffer();
        ctx.bindBuffer(ctx.ARRAY_BUFFER, this.quad);
        ctx.bufferData(
          ctx.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          ctx.STATIC_DRAW,
        );
        this.texA = ctx.createTexture();
        this.texB = ctx.createTexture();
        for (const tex of [this.texA, this.texB]) {
          ctx.bindTexture(ctx.TEXTURE_2D, tex);
          ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
          ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
          ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
          ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
        }
      } catch {
        this.failed = true;
        return null;
      }
    }
    return this.gl;
  }

  private compile(def: TransitionDef): Compiled | null {
    const gl = this.gl;
    if (!gl) return null;
    const cached = this.cache.get(def.id);
    if (cached) return cached;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERT);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.warn("[gl-transitions] vertex compile failed", gl.getShaderInfoLog(vs));
      return null;
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentFor(def));
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.warn(`[gl-transitions] fragment compile failed for ${def.id}`, gl.getShaderInfoLog(fs));
      return null;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(`[gl-transitions] link failed for ${def.id}`, gl.getProgramInfoLog(prog));
      return null;
    }
    const c: Compiled = {
      prog,
      aPos: gl.getAttribLocation(prog, "a_pos"),
      uFrom: gl.getUniformLocation(prog, "from"),
      uTo: gl.getUniformLocation(prog, "to"),
      uProgress: gl.getUniformLocation(prog, "progress"),
      uRatio: gl.getUniformLocation(prog, "ratio"),
    };
    this.cache.set(def.id, c);
    return c;
  }

  /** Renderiza progress entre A→B. Devolve o canvas (off-screen) ou null. */
  render(
    def: TransitionDef,
    srcA: TexImageSource,
    srcB: TexImageSource,
    progress: number,
    width: number,
    height: number,
  ): HTMLCanvasElement | OffscreenCanvas | null {
    const gl = this.ensure(width, height);
    if (!gl || !this.canvas) return null;
    const c = this.compile(def);
    if (!c) return null;
    gl.viewport(0, 0, width, height);
    gl.useProgram(c.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(c.aPos);
    gl.vertexAttribPointer(c.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcA);
    } catch {
      return null;
    }
    gl.uniform1i(c.uFrom, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcB);
    } catch {
      return null;
    }
    gl.uniform1i(c.uTo, 1);

    gl.uniform1f(c.uProgress, Math.max(0, Math.min(1, progress)));
    gl.uniform1f(c.uRatio, width / height);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  isAvailable(): boolean {
    return !this.failed && (this.gl !== null || (() => { this.ensure(2, 2); return this.gl !== null; })());
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    for (const c of this.cache.values()) gl.deleteProgram(c.prog);
    this.cache.clear();
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.quad) gl.deleteBuffer(this.quad);
    this.gl = null;
    this.canvas = null;
  }
}

let _shared: GLTransitionRuntime | null = null;
export function sharedRuntime(): GLTransitionRuntime {
  if (!_shared) _shared = new GLTransitionRuntime();
  return _shared;
}
