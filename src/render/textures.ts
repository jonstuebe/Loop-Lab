import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { isTouch } from '../config';

/**
 * All drawing is authored on a 256 × 256 design grid and scaled up to the
 * real texture size, so the art reads the same at any resolution.
 */
const DESIGN = 256;
/** Real texture resolution. Phones get half to save memory. */
const SIZE = isTouch ? 512 : 1024;

type Draw = (g: CanvasRenderingContext2D) => void;

function canvas2d(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas context unavailable');
  return [canvas, g];
}

function draw(fn: Draw): HTMLCanvasElement {
  const [canvas, g] = canvas2d(SIZE);
  g.scale(SIZE / DESIGN, SIZE / DESIGN);
  fn(g);
  return canvas;
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ---------- pixel helpers ----------

/** Cheap deterministic hash noise in 0..1. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise that tiles every `period` pixels. */
function valueNoise(x: number, y: number, period: number, cells: number, seed: number): number {
  const fx = (x / period) * cells;
  const fy = (y / period) * cells;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const w = (v: number) => ((v % cells) + cells) % cells;
  const a = hash(w(x0), w(y0), seed);
  const b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed);
  const d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable multi-octave noise in roughly 0..1. */
function fbm(x: number, y: number, size: number, seed: number): number {
  return (valueNoise(x, y, size, 4, seed) * 0.5 + valueNoise(x, y, size, 8, seed + 1) * 0.3 +
    valueNoise(x, y, size, 32, seed + 2) * 0.2);
}

/**
 * Noise is the slow part of texture generation, so one smooth field and one
 * grain field are built once and shared; each texture reads them at its own
 * wrap-around offset so they don't visibly repeat between surfaces.
 */
let noiseFields: { smooth: Float32Array; grain: Float32Array } | null = null;
function getNoise() {
  if (noiseFields) return noiseFields;
  const smooth = new Float32Array(SIZE * SIZE);
  const grain = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      smooth[y * SIZE + x] = fbm(x, y, SIZE, 1);
      grain[y * SIZE + x] = hash(x, y, 7);
    }
  }
  noiseFields = { smooth, grain };
  return noiseFields;
}

/** Index into the shared noise fields, shifted by `seed`. */
function noiseIndex(x: number, y: number, seed: number): number {
  return ((y + seed * 389) % SIZE) * SIZE + ((x + seed * 211) % SIZE);
}

/** Separable wrap-around box blur, applied `passes` times (≈ gaussian). */
function blur(src: Float32Array, size: number, radius: number, passes = 3): void {
  if (radius < 1) return;
  const tmp = new Float32Array(src.length);
  const cols = new Float32Array(size);
  const norm = 1 / (radius * 2 + 1);
  // Wrapped indices of the samples entering and leaving the running window.
  const enter = new Int32Array(size);
  const leave = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    enter[i] = (i + radius + 1) % size;
    leave[i] = (i - radius + size) % size;
  }
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let acc = 0;
      for (let k = -radius; k <= radius; k++) acc += src[row + ((k + size) % size)];
      for (let x = 0; x < size; x++) {
        tmp[row + x] = acc * norm;
        acc += src[row + enter[x]] - src[row + leave[x]];
      }
    }
    // Vertical pass, row by row with one running sum per column (cache-friendly).
    cols.fill(0);
    for (let k = -radius; k <= radius; k++) {
      const row = ((k + size) % size) * size;
      for (let x = 0; x < size; x++) cols[x] += tmp[row + x];
    }
    for (let y = 0; y < size; y++) {
      const row = y * size;
      const inRow = enter[y] * size;
      const outRow = leave[y] * size;
      for (let x = 0; x < size; x++) {
        src[row + x] = cols[x] * norm;
        cols[x] += tmp[inRow + x] - tmp[outRow + x];
      }
    }
  }
}

/** Reads a grayscale canvas (red channel) into 0..1 floats. */
function readGray(canvas: HTMLCanvasElement): Float32Array {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Float32Array(canvas.width * canvas.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4] / 255;
  return out;
}

/**
 * A height field built in layers: each layer is drawn as a white-on-black
 * mask, softened by `bevel` design pixels, and added with `amount`.
 */
interface HeightLayer {
  mask: Draw;
  bevel: number;
  amount: number;
}

function heightField(layers: HeightLayer[], grain = 0, seed = 1): Float32Array {
  const h = new Float32Array(SIZE * SIZE);
  const k = SIZE / DESIGN;
  for (const layer of layers) {
    const field = readGray(draw((g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, DESIGN, DESIGN);
      g.fillStyle = '#fff';
      layer.mask(g);
    }));
    blur(field, SIZE, Math.round((layer.bevel * k) / 1.7));
    for (let i = 0; i < h.length; i++) h[i] += field[i] * layer.amount;
  }
  if (grain > 0) {
    const { smooth } = getNoise();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) h[y * SIZE + x] += (smooth[noiseIndex(x, y, seed)] - 0.5) * grain;
    }
  }
  return h;
}

/** Converts a height field (in design-pixel units of height) to a tangent-space normal map. */
function normalMapFrom(h: Float32Array, strength: number): HTMLCanvasElement {
  const [canvas, g] = canvas2d(SIZE);
  const img = g.createImageData(SIZE, SIZE);
  const d = img.data;
  // Height is in "design pixels", gradients are per texel, so rescale.
  const s = strength * (SIZE / DESIGN);
  for (let y = 0; y < SIZE; y++) {
    const up = ((y - 1 + SIZE) % SIZE) * SIZE;
    const dn = ((y + 1) % SIZE) * SIZE;
    const row = y * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const l = (x - 1 + SIZE) % SIZE;
      const r = (x + 1) % SIZE;
      // Canvas rows run top-down while texture v runs bottom-up.
      const nx = (h[row + l] - h[row + r]) * s;
      const ny = (h[dn + x] - h[up + x]) * s;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (row + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/** Multiplies a canvas by subtle low-frequency mottling and fine grain. */
function addGrain(canvas: HTMLCanvasElement, mottle: number, grain: number, seed: number): void {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  const noise = getNoise();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const n = noiseIndex(x, y, seed);
      const f = 1 + (noise.smooth[n] - 0.5) * mottle + (noise.grain[noiseIndex(x, y, seed + 5)] - 0.5) * grain;
      d[i] = Math.min(255, d[i] * f);
      d[i + 1] = Math.min(255, d[i + 1] * f);
      d[i + 2] = Math.min(255, d[i + 2] * f);
    }
  }
  g.putImageData(img, 0, 0);
}

// ---------- drawing primitives ----------

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

interface TileStyle {
  grout: string;
  top: string;
  bottom: string;
  /** Inner rim light, kept subtle: the normal map supplies most of the bevel now. */
  highlight: string;
  shadow: string;
  inset: number;
  radius: number;
}

function tileRect(g: CanvasRenderingContext2D, t: TileStyle, grow = 0): void {
  roundRect(g, t.inset - grow, t.inset - grow, DESIGN - (t.inset - grow) * 2, DESIGN - (t.inset - grow) * 2, t.radius + grow);
}

/** A single chunky rounded tile with a contact shadow and soft inner highlight. */
function drawTile(g: CanvasRenderingContext2D, t: TileStyle): void {
  g.fillStyle = t.grout;
  g.fillRect(0, 0, DESIGN, DESIGN);
  // soft contact shadow into the grout
  g.save();
  g.filter = 'blur(3px)';
  g.translate(1.5, 3);
  tileRect(g, t, 1);
  g.fillStyle = t.shadow;
  g.fill();
  g.restore();

  tileRect(g, t);
  const grd = g.createLinearGradient(0, t.inset, 0, DESIGN - t.inset);
  grd.addColorStop(0, t.top);
  grd.addColorStop(1, t.bottom);
  g.fillStyle = grd;
  g.fill();

  g.save();
  tileRect(g, t);
  g.clip();
  g.strokeStyle = t.highlight;
  g.lineWidth = 4;
  g.filter = 'blur(1.5px)';
  roundRect(g, t.inset + 2.5, t.inset + 2.5, DESIGN - t.inset * 2 - 2, DESIGN - t.inset * 2 - 2, t.radius);
  g.stroke();
  g.restore();
}

function grayCanvas(fn: Draw): HTMLCanvasElement {
  return draw(fn);
}

/** Roughness map: grout and tile face values, with noise-driven variation on the face. */
function roughnessFor(t: { inset: number; radius: number }, face: number, grout: number, seed: number, extra?: Draw): HTMLCanvasElement {
  const canvas = grayCanvas((g) => {
    const v = (n: number) => `rgb(${n * 255},${n * 255},${n * 255})`;
    g.fillStyle = v(grout);
    g.fillRect(0, 0, DESIGN, DESIGN);
    roundRect(g, t.inset, t.inset, DESIGN - t.inset * 2, DESIGN - t.inset * 2, t.radius);
    g.fillStyle = v(face);
    g.fill();
    extra?.(g);
  });
  addGrain(canvas, 0.35, 0.08, seed);
  return canvas;
}

// ---------- texture sets ----------

export interface SurfaceMaps {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

export interface GameTextures {
  white: SurfaceMaps;
  metal: SurfaceMaps;
  door: SurfaceMaps;
  cube: SurfaceMaps;
  cubeEmissive: Texture;
  all: Texture[];
}

function surface(albedo: HTMLCanvasElement, normal: HTMLCanvasElement, rough: HTMLCanvasElement): SurfaceMaps {
  return { map: toTexture(albedo, true), normalMap: toTexture(normal, false), roughnessMap: toTexture(rough, false) };
}

export function createTextures(): GameTextures {
  // Cream panels: portal-friendly, glossy ceramic.
  const whiteStyle: TileStyle = {
    grout: '#cdb79c', top: '#fff9ef', bottom: '#f3e4cf',
    highlight: 'rgba(255,255,255,.55)', shadow: 'rgba(130,90,50,.35)', inset: 9, radius: 30,
  };
  const whiteAlbedo = draw((g) => drawTile(g, whiteStyle));
  addGrain(whiteAlbedo, 0.05, 0.025, 11);
  const white = surface(
    whiteAlbedo,
    normalMapFrom(heightField([
      { mask: (g) => { tileRect(g, whiteStyle); g.fill(); }, bevel: 7, amount: 3.2 },
    ], 0.25, 12), 1),
    roughnessFor(whiteStyle, 0.42, 0.9, 13),
  );

  // Blue metal: portal-proof, riveted, brushed.
  const metalStyle: TileStyle = {
    grout: '#1c2c42', top: '#56789f', bottom: '#3d5a82',
    highlight: 'rgba(170,205,255,.3)', shadow: 'rgba(0,0,0,.4)', inset: 10, radius: 34,
  };
  const rivets = [[34, 34], [DESIGN - 34, 34], [34, DESIGN - 34], [DESIGN - 34, DESIGN - 34]] as const;
  const metalAlbedo = draw((g) => {
    drawTile(g, metalStyle);
    // brushed streaks
    g.save();
    tileRect(g, metalStyle);
    g.clip();
    g.globalAlpha = 0.025;
    for (let i = 0; i < 120; i++) {
      const y = hash(i, 1, 77) * DESIGN;
      g.fillStyle = hash(i, 2, 77) > 0.5 ? '#ffffff' : '#0b1a2e';
      g.fillRect(0, y, DESIGN, 0.4 + hash(i, 3, 77) * 0.8);
    }
    g.restore();
    for (const [x, y] of rivets) {
      circle(g, x + 0.8, y + 1.5, 7.5, 'rgba(10,20,35,.45)');
      circle(g, x, y, 7, '#7f9dc4');
      circle(g, x - 2, y - 2, 2.5, 'rgba(255,255,255,.45)');
    }
  });
  addGrain(metalAlbedo, 0.08, 0.02, 21);
  const metal = surface(
    metalAlbedo,
    normalMapFrom(heightField([
      { mask: (g) => { tileRect(g, metalStyle); g.fill(); }, bevel: 8, amount: 3 },
      { mask: (g) => { for (const [x, y] of rivets) circle(g, x, y, 6.5, '#fff'); }, bevel: 3, amount: 2.2 },
    ], 0.5, 22), 1),
    roughnessFor(metalStyle, 0.38, 0.85, 23, (g) => {
      for (const [x, y] of rivets) circle(g, x, y, 7, 'rgb(60,60,60)');
    }),
  );

  // Yellow hazard door.
  const doorStyle: TileStyle = {
    grout: '#a87812', top: '#ffd866', bottom: '#ffb92a',
    highlight: 'rgba(255,255,255,.45)', shadow: 'rgba(110,60,0,.4)', inset: 8, radius: 26,
  };
  const stripes = (g: CanvasRenderingContext2D, fill: string) => {
    g.save();
    tileRect(g, doorStyle);
    g.clip();
    g.fillStyle = fill;
    for (let x = -DESIGN; x < DESIGN * 2; x += 56) {
      g.beginPath();
      g.moveTo(x, DESIGN);
      g.lineTo(x + 28, DESIGN);
      g.lineTo(x + 70, DESIGN * 0.78);
      g.lineTo(x + 42, DESIGN * 0.78);
      g.fill();
    }
    g.restore();
  };
  const slot = (g: CanvasRenderingContext2D) => roundRect(g, DESIGN * 0.47, 14, DESIGN * 0.06, DESIGN * 0.6, 8);
  const doorAlbedo = draw((g) => {
    drawTile(g, doorStyle);
    stripes(g, '#2f4766');
    slot(g);
    g.fillStyle = 'rgba(47,71,102,.6)';
    g.fill();
  });
  addGrain(doorAlbedo, 0.08, 0.03, 31);
  const door = surface(
    doorAlbedo,
    normalMapFrom(heightField([
      { mask: (g) => { tileRect(g, doorStyle); g.fill(); }, bevel: 7, amount: 3 },
      { mask: (g) => stripes(g, '#fff'), bevel: 1.5, amount: 0.6 },
      { mask: (g) => { slot(g); g.fill(); }, bevel: 3, amount: -1.6 },
    ], 0.3, 32), 1),
    roughnessFor(doorStyle, 0.4, 0.85, 33),
  );

  // Companion-style cube face.
  const cubeAlbedo = draw((g) => {
    g.fillStyle = '#2ec4b6';
    g.fillRect(0, 0, DESIGN, DESIGN);
    // corner bumpers, a shade darker
    g.fillStyle = '#25a89c';
    for (const [x, y] of [[0, 0], [DESIGN - 40, 0], [0, DESIGN - 40], [DESIGN - 40, DESIGN - 40]] as const) {
      roundRect(g, x + 4, y + 4, 32, 32, 10);
      g.fill();
    }
    g.save();
    g.filter = 'blur(3px)';
    roundRect(g, 27, 29, DESIGN - 52, DESIGN - 52, 34);
    g.fillStyle = 'rgba(0,40,40,.35)';
    g.fill();
    g.restore();
    roundRect(g, 26, 26, DESIGN - 52, DESIGN - 52, 34);
    g.fillStyle = '#fff3e2';
    g.fill();
    circle(g, DESIGN / 2, DESIGN / 2, 56, '#2c2442');
    circle(g, DESIGN / 2, DESIGN / 2, 38, '#ffd36b');
  });
  addGrain(cubeAlbedo, 0.06, 0.03, 41);
  const cube = surface(
    cubeAlbedo,
    normalMapFrom(heightField([
      { mask: (g) => { roundRect(g, 26, 26, DESIGN - 52, DESIGN - 52, 34); g.fill(); }, bevel: 5, amount: -2 },
      { mask: (g) => circle(g, DESIGN / 2, DESIGN / 2, 56, '#fff'), bevel: 4, amount: 2.4 },
      { mask: (g) => circle(g, DESIGN / 2, DESIGN / 2, 38, '#fff'), bevel: 2, amount: -1 },
    ], 0.2, 42), 1),
    grayCanvas((g) => {
      g.fillStyle = 'rgb(110,110,110)';
      g.fillRect(0, 0, DESIGN, DESIGN);
      roundRect(g, 26, 26, DESIGN - 52, DESIGN - 52, 34);
      g.fillStyle = 'rgb(90,90,90)';
      g.fill();
      circle(g, DESIGN / 2, DESIGN / 2, 38, 'rgb(40,40,40)');
    }),
  );

  const cubeEmissive = toTexture(draw((g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, DESIGN, DESIGN);
    g.save();
    g.filter = 'blur(4px)';
    circle(g, DESIGN / 2, DESIGN / 2, 40, '#a86a00');
    g.restore();
    circle(g, DESIGN / 2, DESIGN / 2, 37, '#ffc23d');
  }), true);

  const all = [white, metal, door, cube].flatMap((s) => [s.map, s.normalMap, s.roughnessMap]);
  all.push(cubeEmissive);
  return { white, metal, door, cube, cubeEmissive, all };
}
