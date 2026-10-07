// Draws the world. The grid is uploaded as-is (one byte per cell) and a fragment
// shader does the rest: palette lookup, box-filtered downsampling when a pixel
// covers many cells, grid lines, the world's border and its shadow on the stage.
// A plain 2D-canvas renderer stands in where WebGL2 is unavailable.

import { hexToRgb } from './palettes.js';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uState;
uniform sampler2D uPalette;
uniform vec2 uWorld;      // world size in cells
uniform vec2 uOrigin;     // world position of the canvas's top-left corner
uniform float uCell;      // device pixels per cell
uniform float uCanvasH;
uniform float uDpr;
uniform int uRowOffset;   // ring-buffer offset for scrolling 1D worlds
uniform vec3 uStage;
uniform vec4 uShadow;
uniform vec4 uGrid;
uniform vec4 uBorder;
uniform int uOpen;        // 1 on an unbounded canvas: past the edge is empty ground, with no border

out vec4 outColor;

vec3 cellColor(vec2 p) {
  ivec2 c = ivec2(p);
  int h = int(uWorld.y);
  int y = c.y + uRowOffset;
  if (y >= h) y -= h;
  uint s = texelFetch(uState, ivec2(c.x, y), 0).r;
  return texelFetch(uPalette, ivec2(int(s), 0), 0).rgb;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvasH - gl_FragCoord.y);
  vec2 w = uOrigin + px / uCell;
  vec2 out2 = max(max(-w, w - uWorld), 0.0) * uCell;
  if (out2.x > 0.0 || out2.y > 0.0) {
    if (uOpen == 1) {
      // Past the world on an unbounded canvas: empty ground, and the grid carries on across it.
      vec3 ground = texelFetch(uPalette, ivec2(0, 0), 0).rgb;
      vec2 f = fract(w) * uCell;
      if (uGrid.a > 0.0 && (f.x < 1.0 || f.y < 1.0)) ground = mix(ground, uGrid.rgb, uGrid.a);
      outColor = vec4(ground, 1.0);
      return;
    }
    // On the stage: a hairline border hugging the world, and a soft shadow dropped 3px below it.
    if (max(out2.x, out2.y) <= 1.0) { outColor = vec4(mix(uStage, uBorder.rgb, uBorder.a), 1.0); return; }
    vec2 ws = w - vec2(0.0, 3.0 * uDpr / uCell);
    float d = length(max(max(-ws, ws - uWorld), 0.0) * uCell) / uDpr;
    float a = uShadow.a * exp(-d / 9.0);
    outColor = vec4(mix(uStage, uShadow.rgb, a), 1.0);
    return;
  }
  vec3 col;
  if (uCell >= 1.0) {
    col = cellColor(w);
  } else {
    float span = 1.0 / uCell;
    int n = int(clamp(ceil(span), 1.0, 4.0));
    vec3 acc = vec3(0.0);
    for (int j = 0; j < 4; j++) {
      if (j >= n) break;
      for (int i = 0; i < 4; i++) {
        if (i >= n) break;
        vec2 p = w + ((vec2(float(i), float(j)) + 0.5) / float(n) - 0.5) * span;
        acc += cellColor(clamp(p, vec2(0.0), uWorld - 0.5));
      }
    }
    col = acc / float(n * n);
  }
  if (uGrid.a > 0.0) {
    vec2 f = fract(w) * uCell;
    if (f.x < 1.0 || f.y < 1.0) col = mix(col, uGrid.rgb, uGrid.a);
  }
  outColor = vec4(col, 1.0);
}`;

export function createRenderer(canvas) {
  // No power preference: the integrated GPU is plenty, and asking for the discrete one wakes it on dual-GPU laptops.
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
  if (gl) {
    try {
      return new GLRenderer(canvas, gl);
    } catch (err) {
      console.warn('WebGL2 renderer failed, using 2D canvas', err);
    }
  }
  return new CanvasRenderer(canvas);
}

const rgb01 = (hex) => hexToRgb(hex).map((v) => v / 255);

class GLRenderer {
  constructor(canvas, gl) {
    this.kind = 'webgl2';
    this.canvas = canvas;
    this.gl = gl;
    this._init();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this._init();
      if (this._palette) this.setColors(...this._palette);
      this.onrestore?.();
    });
  }

  _init() {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {};
    for (const name of ['uState', 'uPalette', 'uWorld', 'uOrigin', 'uCell', 'uCanvasH', 'uDpr', 'uRowOffset', 'uStage', 'uShadow', 'uGrid', 'uBorder', 'uOpen']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.vao = gl.createVertexArray();
    this.stateTex = gl.createTexture();
    this.paletteTex = gl.createTexture();
    for (const tex of [this.stateTex, this.paletteTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.texW = this.texH = 0;
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** colors: cell palette (hex); stage/shadow/border: page colors around the world. */
  setColors(colors, stage, grid, shadow, border) {
    this._palette = [colors, stage, grid, shadow, border];
    if (this.lost) return;
    const gl = this.gl;
    const data = new Uint8Array(256 * 4);
    const rgb = colors.map(hexToRgb);
    for (let i = 0; i < 256; i++) {
      const c = rgb[i % rgb.length];
      data.set([c[0], c[1], c[2], 255], i * 4);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.stage = rgb01(stage);
    this.grid = rgb01(grid.color).concat(grid.alpha);
    this.shadow = rgb01(shadow.color).concat(shadow.alpha);
    this.border = rgb01(border.color).concat(border.alpha);
  }

  /** rows: [first, last] to send only the lines that changed, or nothing to send them all. */
  upload(cells, W, H, rows) {
    if (this.lost) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (W !== this.texW || H !== this.texH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, W, H, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cells);
      this.texW = W;
      this.texH = H;
    } else if (rows) {
      const y0 = Math.max(0, rows[0]), y1 = Math.min(H - 1, rows[1]);
      if (y1 >= y0) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, W, y1 - y0 + 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cells.subarray(y0 * W, (y1 + 1) * W));
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cells);
    }
  }

  /** v: { originX, originY, cell (device px per cell), dpr, rowOffset, gridAlpha, open (no edges to draw) } */
  draw(v) {
    if (this.lost || !this.texW) return;
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
    gl.uniform1i(u.uState, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(u.uPalette, 1);
    gl.uniform2f(u.uWorld, this.texW, this.texH);
    gl.uniform2f(u.uOrigin, v.originX, v.originY);
    gl.uniform1f(u.uCell, v.cell);
    gl.uniform1f(u.uCanvasH, this.canvas.height);
    gl.uniform1f(u.uDpr, v.dpr);
    gl.uniform1i(u.uRowOffset, v.rowOffset | 0);
    gl.uniform3fv(u.uStage, this.stage);
    gl.uniform4fv(u.uShadow, this.shadow);
    gl.uniform4f(u.uGrid, this.grid[0], this.grid[1], this.grid[2], this.grid[3] * v.gridAlpha);
    gl.uniform4fv(u.uBorder, this.border);
    gl.uniform1i(u.uOpen, v.open ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

class CanvasRenderer {
  constructor(canvas) {
    this.kind = '2d';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.lut = new Uint32Array(256);
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setColors(colors, stage, grid, shadow, border) {
    this.ground = colors[0];
    const rgb = colors.map(hexToRgb);
    for (let i = 0; i < 256; i++) {
      const c = rgb[i % rgb.length];
      this.lut[i] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    }
    this.stage = stage;
    this.grid = grid;
    this.shadow = shadow;
    this.border = border;
  }

  upload(cells, W, H) {
    this.cells = cells;
    this.W = W;
    this.H = H;
    this.stale = true;
  }

  draw(v) {
    if (!this.cells) return;
    const { W, H } = this;
    if (this.off.width !== W || this.off.height !== H) {
      this.off.width = W;
      this.off.height = H;
      this.image = this.offCtx.createImageData(W, H);
      this.pixels = new Uint32Array(this.image.data.buffer);
    }
    if (this.stale || this.rowOffset !== v.rowOffset) {
      const src = this.cells, px = this.pixels, lut = this.lut, off = (v.rowOffset | 0) * W, n = W * H;
      for (let i = 0; i < n; i++) px[i] = lut[src[(i + off) % n]];
      this.offCtx.putImageData(this.image, 0, 0);
      this.stale = false;
      this.rowOffset = v.rowOffset;
    }
    const ctx = this.ctx, c = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = v.open ? this.ground : this.stage;
    ctx.fillRect(0, 0, c.width, c.height);
    const x = -v.originX * v.cell, y = -v.originY * v.cell, w = W * v.cell, h = H * v.cell;
    if (v.open) {
      ctx.imageSmoothingEnabled = v.cell < 1;
      ctx.drawImage(this.off, x, y, w, h);
      return this._gridLines(v, x, y, w, h, true);
    }
    ctx.save();
    ctx.shadowColor = this.shadow.color;
    ctx.shadowBlur = 18 * v.dpr;
    ctx.shadowOffsetY = 3 * v.dpr;
    ctx.globalAlpha = this.shadow.alpha;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.imageSmoothingEnabled = v.cell < 1;
    ctx.drawImage(this.off, x, y, w, h);
    ctx.strokeStyle = this.border.color;
    ctx.globalAlpha = this.border.alpha;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
    ctx.globalAlpha = 1;
    this._gridLines(v, x, y, w, h);
  }

  /** Grid lines over the world, or with `open` (an unbounded canvas) over the whole canvas. */
  _gridLines(v, x, y, w, h, open = false) {
    const ctx = this.ctx, c = this.canvas, { W, H } = this;
    const ga = this.grid.alpha * v.gridAlpha;
    if (ga > 0) {
      ctx.fillStyle = this.grid.color;
      ctx.globalAlpha = ga;
      let x0 = Math.floor(v.originX), x1 = Math.ceil(v.originX + c.width / v.cell);
      let y0 = Math.floor(v.originY), y1 = Math.ceil(v.originY + c.height / v.cell);
      let [left, top, across, down] = [0, 0, c.width, c.height];
      if (!open) {
        [x0, x1, y0, y1] = [Math.max(0, x0), Math.min(W, x1), Math.max(0, y0), Math.min(H, y1)];
        [left, top, across, down] = [Math.max(0, x), Math.max(0, y), Math.min(w, c.width), Math.min(h, c.height)];
      }
      for (let gx = x0; gx < x1; gx++) ctx.fillRect(Math.floor(x + gx * v.cell), top, 1, down);
      for (let gy = y0; gy < y1; gy++) ctx.fillRect(left, Math.floor(y + gy * v.cell), across, 1);
      ctx.globalAlpha = 1;
    }
  }
}
