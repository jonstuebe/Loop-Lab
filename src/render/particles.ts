import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, type Scene, ShaderMaterial, Vector3,
} from 'three';

const MAX = 1024;

const VERTEX = /* glsl */ `
attribute vec3 tint;
attribute float alpha;
attribute float size;
uniform float scale;
varying vec3 vTint;
varying float vAlpha;
void main() {
  vTint = tint;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
varying vec3 vTint;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  // hot core with a soft falloff
  float core = exp(-d * 4.0);
  gl_FragColor = vec4(vTint * core * vAlpha, 1.0);
}`;

export interface EmitOptions {
  /** Count of particles. */
  count: number;
  color: number;
  /** HDR multiplier on the colour (above ~2 catches the bloom). */
  intensity?: number;
  /** Mean launch speed along `dir`, world units/s. */
  speed: number;
  /** 0 = tight jet along `dir`, 1 = full hemisphere around it. */
  spread: number;
  life: number;
  /** World-space size of each particle. */
  size: number;
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
}

/**
 * One pooled additive point cloud for every spark and mote in the game.
 * Dead particles are recycled; when the pool is full the oldest is overwritten.
 */
export class Particles {
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly tint = new Float32Array(MAX * 3);
  private readonly alpha = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly baseSize = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly gravity = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private next = 0;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly points: Points;

  constructor(scene: Scene) {
    const g = this.geometry;
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('tint', new BufferAttribute(this.tint, 3));
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1));
    g.setAttribute('size', new BufferAttribute(this.size, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { scale: { value: 500 } },
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Pixels per world unit at distance 1; call on resize. */
  setViewScale(drawHeight: number, fovDeg: number): void {
    this.material.uniforms.scale.value = drawHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  private static readonly _c = new Color();
  private static readonly _t1 = new Vector3();
  private static readonly _t2 = new Vector3();
  private static readonly _d = new Vector3();

  /** Emits particles from `origin` in a cone around `dir` (unit vector). */
  emit(origin: Vector3, dir: Vector3, o: EmitOptions, jitter = 0): void {
    const c = Particles._c.setHex(o.color).multiplyScalar(o.intensity ?? 3);
    // tangent basis around dir
    const t1 = Particles._t1.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0).cross(dir).normalize();
    const t2 = Particles._t2.crossVectors(dir, t1);
    const d = Particles._d;
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * o.spread;
      d.copy(dir).multiplyScalar(Math.sqrt(Math.max(0, 1 - r * r)))
        .addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
      const sp = o.speed * (0.4 + Math.random() * 0.9);
      const i3 = i * 3;
      this.pos[i3] = origin.x + (Math.random() - 0.5) * jitter;
      this.pos[i3 + 1] = origin.y + (Math.random() - 0.5) * jitter;
      this.pos[i3 + 2] = origin.z + (Math.random() - 0.5) * jitter;
      this.vel[i3] = d.x * sp;
      this.vel[i3 + 1] = d.y * sp;
      this.vel[i3 + 2] = d.z * sp;
      const shade = 0.75 + Math.random() * 0.5;
      this.tint[i3] = c.r * shade;
      this.tint[i3 + 1] = c.g * shade;
      this.tint[i3 + 2] = c.b * shade;
      const life = o.life * (0.6 + Math.random() * 0.7);
      this.life[i] = this.maxLife[i] = life;
      this.baseSize[i] = o.size * (0.6 + Math.random() * 0.8);
      this.gravity[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
    }
  }

  /** Spawns one particle at an exact point with an exact velocity (for ambient motes). */
  spawn(p: Vector3, v: Vector3, color: number, intensity: number, life: number, size: number, gravity = 0, drag = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const c = Particles._c.setHex(color).multiplyScalar(intensity);
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.tint[i3] = c.r; this.tint[i3 + 1] = c.g; this.tint[i3 + 2] = c.b;
    this.life[i] = this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.markDirty();
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        if (this.size[i] !== 0) { this.size[i] = 0; this.alpha[i] = 0; }
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.gravity[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      // quick fade-in, long fade-out, shrink as they die
      this.alpha[i] = Math.min(1, (1 - t) * 8) * t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.markDirty();
  }

  private markDirty(): void {
    const a = this.geometry.attributes;
    a.position.needsUpdate = true;
    a.tint.needsUpdate = true;
    a.alpha.needsUpdate = true;
    a.size.needsUpdate = true;
  }
}
