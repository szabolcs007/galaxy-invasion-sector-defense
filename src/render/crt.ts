/**
 * CRT pass — hand-written WebGL2 fullscreen-quad post-processing.
 *
 * Fragment shader applies, in order:
 *   1. scanline darkening every 3rd output row,
 *   2. phosphor bloom (luminance blur of the game frame) plus a faint
 *      persistence blend of the previous composited frame,
 *   3. slight barrel distortion + vignette.
 *
 * Uniform uTint selects the phosphor color: green (default), white, amber.
 * If WebGL2 is unavailable the constructor logs once and returns null; the
 * caller falls back to plain integer upscaling (never crashes).
 */
import { FB_W, FB_H } from "./framebuffer";

export type Tint = "green" | "white" | "amber";

const TINT_COLORS: Record<Tint, [number, number, number]> = {
  green: [0.35, 1.0, 0.42],
  white: [1.0, 1.0, 0.94],
  amber: [1.0, 0.72, 0.28],
};

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uFrame;   // current 128x48 game frame (NEAREST)
uniform sampler2D uPrev;    // previous composited frame
uniform vec2  uRes;         // output resolution in pixels
uniform vec3  uTint;
uniform float uPersist;     // persistence blend factor (0..1)
in vec2 vUV;
out vec4 outColor;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  // Barrel distortion (pincushion on the borders).
  vec2 d = vUV - 0.5;
  float r2 = dot(d, d);
  vec2 uv = vUV + d * (0.045 * r2 + 0.012 * r2 * r2);

  vec2 px = 1.0 / uRes;
  vec2 texel = vec2(1.0) / vec2(textureSize(uFrame, 0));

  // Game frame + neighbor taps for phosphor bloom.
  vec3 frame = texture(uFrame, uv).rgb;
  vec3 bloom = vec3(0.0);
  bloom += texture(uFrame, clamp(uv + vec2( texel.x, 0.0), 0.0, 1.0)).rgb;
  bloom += texture(uFrame, clamp(uv + vec2(-texel.x, 0.0), 0.0, 1.0)).rgb;
  bloom += texture(uFrame, clamp(uv + vec2(0.0,  texel.y), 0.0, 1.0)).rgb;
  bloom += texture(uFrame, clamp(uv + vec2(0.0, -texel.y), 0.0, 1.0)).rgb;
  bloom *= 0.25;

  vec3 prev = texture(uPrev, uv).rgb;
  vec3 c = mix(frame, max(frame, bloom * 0.55), 0.85);
  c = mix(c, prev, uPersist * 0.22);
  c *= uTint;

  // Scanlines: darken every 3rd output row (classic low-res look).
  float row = gl_FragCoord.y;
  float scan = mod(row, 3.0) < 1.0 ? 0.62 : 1.0;

  // Vignette.
  float vig = 1.0 - 0.38 * r2;

  outColor = vec4(c * scan * vig, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // eslint-disable-next-line no-console
    console.warn("CRT shader compile failed:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export class CrtRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private frameTex: WebGLTexture;
  private prevTex: WebGLTexture;
  private fboTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private uFrame: WebGLUniformLocation | null;
  private uPrev: WebGLUniformLocation | null;
  private uRes: WebGLUniformLocation | null;
  private uTint: WebGLUniformLocation | null;
  private uPersist: WebGLUniformLocation | null;
  private tint: Tint = "green";
  private warned = false;

  static create(canvas: HTMLCanvasElement): CrtRenderer | null {
    try {
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) return null;
      return new CrtRenderer(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // DOM-source uploads (the 128x48 frame canvas in render()) are top-down;
    // flip them so texture row 0 holds the source's bottom row, matching
    // vUV.y = 0 at the quad's bottom. copyTexImage2D ignores this flag, so
    // the FBO/persistence textures keep GL-native orientation.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) throw new Error("shader compile");

    const prog = gl.createProgram();
    if (!prog) throw new Error("program create");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("program link");
    }
    this.prog = prog;

    // Fullscreen quad (two triangles).
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao");
    this.vao = vao;
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Textures.
    this.frameTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FB_W, FB_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.prevTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.prevTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Render target FBO (full canvas res) + its texture.
    this.fbo = gl.createFramebuffer()!;
    this.fboTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.useProgram(prog);
    this.uFrame = gl.getUniformLocation(prog, "uFrame");
    this.uPrev = gl.getUniformLocation(prog, "uPrev");
    this.uRes = gl.getUniformLocation(prog, "uRes");
    this.uTint = gl.getUniformLocation(prog, "uTint");
    this.uPersist = gl.getUniformLocation(prog, "uPersist");
    gl.uniform1i(this.uFrame, 0);
    gl.uniform1i(this.uPrev, 1);
  }

  setTint(t: Tint): void {
    this.tint = t;
  }

  /** Resize the internal render target to the canvas size. */
  resize(w: number, h: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Render the game frame (a 128x48 canvas) onto the display canvas.
   * `persist` enables the previous-frame phosphor blend.
   */
  render(frame: TexImageSource, persist: boolean): void {
    const gl = this.gl;
    const cw = gl.canvas.width;
    const ch = gl.canvas.height;
    if (cw === 0 || ch === 0) return;

    gl.viewport(0, 0, cw, ch);

    // Upload the game frame.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTex);

    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, cw, ch);
    gl.uniform3fv(this.uTint, TINT_COLORS[this.tint]);
    gl.uniform1f(this.uPersist, persist ? 1 : 0);

    gl.bindVertexArray(this.vao);

    // Pass 1: composite into the FBO.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2: draw the composited result to the canvas (no persistence).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1f(this.uPersist, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Save the composited frame as the next frame's persistence source.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, cw, ch, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindVertexArray(null);
  }

  /** Log a fallback notice once (called by the caller when WebGL2 is absent). */
  warnFallback(): void {
    if (this.warned) return;
    this.warned = true;
    // eslint-disable-next-line no-console
    console.warn("WebGL2 unavailable — falling back to plain integer upscale (no CRT effects).");
  }
}
