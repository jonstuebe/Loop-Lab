import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, DoubleSide, Line, LineBasicMaterial, Mesh,
  MeshBasicMaterial, PlaneGeometry, RingGeometry, type Scene, Vector3,
} from 'three';
import { PORTAL_HALF_H, PORTAL_HALF_W } from '../config';
import { Particles } from './particles';

interface Effect {
  life: number;
  readonly max: number;
  /** Called each frame with remaining life in 0..1. */
  tick(t: number): void;
  done(): void;
}

/** Minimal view of a portal the ambient emitter needs. */
export interface PortalLike {
  placed: boolean;
  color: number;
  center: Vector3;
  normal: Vector3;
  up: Vector3;
  right: Vector3;
}

const SCORCH_LIFE = 9;
const MAX_SCORCHES = 14;

/** Soft, ragged dark blotch used for shot marks on surfaces that reject portals. */
function scorchTexture(): CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * s * 0.16;
    const x = s / 2 + Math.cos(a) * r;
    const y = s / 2 + Math.sin(a) * r;
    const rad = s * (0.12 + Math.random() * 0.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  // a few radial streaks
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(s / 2 + Math.cos(a) * s * 0.1, s / 2 + Math.sin(a) * s * 0.1);
    g.lineTo(s / 2 + Math.cos(a) * s * (0.3 + Math.random() * 0.17), s / 2 + Math.sin(a) * s * (0.3 + Math.random() * 0.17));
    g.stroke();
  }
  return new CanvasTexture(c);
}

/** Short-lived visual effects: shot tracers, impact rings, sparks, scorch marks and ambient motes. */
export class Effects {
  private readonly active: Effect[] = [];
  readonly particles: Particles;
  private readonly scorchMap = scorchTexture();
  private readonly scorchGeo = new PlaneGeometry(1, 1);
  private readonly scorches: Effect[] = [];
  private moteClock = 0;

  constructor(private readonly scene: Scene) {
    this.particles = new Particles(scene);
  }

  tracer(from: Vector3, to: Vector3, color: number): void {
    const geo = new BufferGeometry().setFromPoints([from, to]);
    const mat = new LineBasicMaterial({
      color: new Color(color).multiplyScalar(4), transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false,
    });
    const line = new Line(geo, mat);
    this.scene.add(line);
    this.active.push({
      life: 0.14, max: 0.14,
      tick: (t) => { mat.opacity = t; },
      done: () => { this.scene.remove(line); geo.dispose(); mat.dispose(); },
    });
    // a sparse trail of glowing beads along the shot
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    const p = new Vector3();
    for (let d = 0.4; d < len; d += 0.55) {
      p.copy(from).addScaledVector(dir, d);
      this.particles.spawn(p, dir.clone().multiplyScalar(0.6), color, 2.5, 0.25 + Math.random() * 0.15, 0.05);
    }
  }

  /** Expanding ring where a shot lands; `glow` is the HDR boost (keep low for neutral colours). */
  impact(point: Vector3, normal: Vector3, color: number, size = 1, glow = 3): void {
    const mat = new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(glow), transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false,
      blending: AdditiveBlending,
    });
    const geo = new RingGeometry(0.05, 0.13, 48);
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(point).addScaledVector(normal, 0.03);
    mesh.lookAt(point.clone().add(normal));
    this.scene.add(mesh);
    this.active.push({
      life: 0.4, max: 0.4,
      tick: (t) => {
        mat.opacity = t * 0.9;
        const k = (1 - t * t) * 6 * size + 1;
        mesh.scale.set(k, k, k);
      },
      done: () => { this.scene.remove(mesh); geo.dispose(); mat.dispose(); },
    });
  }

  /** Bouncing sparks for a shot that hit something portals can't stick to. */
  sparks(point: Vector3, normal: Vector3): void {
    const origin = point.clone().addScaledVector(normal, 0.02);
    this.particles.emit(origin, normal, {
      count: 22, color: 0xffd9a0, intensity: 4, speed: 4.5, spread: 0.9, life: 0.45, size: 0.035, gravity: 9, drag: 2,
    });
    this.scorch(point, normal);
  }

  /** A celebratory ring burst when a portal opens. */
  portalBurst(center: Vector3, normal: Vector3, up: Vector3, right: Vector3, color: number): void {
    const p = new Vector3();
    const d = new Vector3();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      p.copy(center).addScaledVector(right, cx * PORTAL_HALF_W * 0.9).addScaledVector(up, cy * PORTAL_HALF_H * 0.9)
        .addScaledVector(normal, 0.05);
      d.copy(right).multiplyScalar(cx).addScaledVector(up, cy).addScaledVector(normal, 0.8 + Math.random() * 0.6)
        .multiplyScalar(1.4 + Math.random() * 1.8);
      this.particles.spawn(p, d, color, 3.5, 0.5 + Math.random() * 0.4, 0.06, 3, 3);
    }
    this.particles.emit(center.clone().addScaledVector(normal, 0.1), normal, {
      count: 30, color: 0xffffff, intensity: 2.5, speed: 2.5, spread: 0.8, life: 0.35, size: 0.05, drag: 5,
    }, 0.4);
  }

  /** Dark mark left on a surface, fading out over several seconds. */
  scorch(point: Vector3, normal: Vector3): void {
    const mat = new MeshBasicMaterial({
      map: this.scorchMap, color: 0x101820, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const mesh = new Mesh(this.scorchGeo, mat);
    const s = 0.35 + Math.random() * 0.15;
    mesh.scale.set(s, s, 1);
    mesh.position.copy(point).addScaledVector(normal, 0.004);
    mesh.lookAt(point.clone().add(normal));
    mesh.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(mesh);
    const fx: Effect = {
      life: SCORCH_LIFE, max: SCORCH_LIFE,
      tick: (t) => { mat.opacity = 0.85 * Math.min(1, t * 4); },
      done: () => { this.scene.remove(mesh); mat.dispose(); },
    };
    this.active.push(fx);
    this.scorches.push(fx);
    if (this.scorches.length > MAX_SCORCHES) {
      const oldest = this.scorches.shift()!;
      oldest.life = Math.min(oldest.life, 0.3);
    }
  }

  /**
   * Ambient motes: open portals shed sparks from their rims and the exit
   * column breathes slow rising specks.
   */
  ambient(dt: number, portals: readonly PortalLike[], goal: Vector3 | null): void {
    this.moteClock += dt;
    const step = 1 / 40;
    const p = new Vector3();
    const v = new Vector3();
    while (this.moteClock > step) {
      this.moteClock -= step;
      for (const portal of portals) {
        if (!portal.placed) continue;
        const a = Math.random() * Math.PI * 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        p.copy(portal.center).addScaledVector(portal.right, cx * PORTAL_HALF_W * 0.86)
          .addScaledVector(portal.up, cy * PORTAL_HALF_H * 0.86).addScaledVector(portal.normal, 0.03);
        v.copy(portal.right).multiplyScalar(cx * 0.25).addScaledVector(portal.up, cy * 0.25)
          .addScaledVector(portal.normal, 0.25 + Math.random() * 0.3);
        this.particles.spawn(p, v, portal.color, 3, 0.6 + Math.random() * 0.5, 0.035, -0.15, 0.6);
      }
      if (goal && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.75;
        p.set(goal.x + Math.cos(a) * r, goal.y + 0.1, goal.z + Math.sin(a) * r);
        v.set(0, 0.6 + Math.random() * 0.6, 0);
        this.particles.spawn(p, v, 0x8dffc8, 2.6, 1.6 + Math.random() * 1.2, 0.045, 0, 0.2);
      }
    }
  }

  /** Drops every effect immediately (on level load). */
  clear(): void {
    for (const fx of this.active) fx.done();
    this.active.length = 0;
    this.scorches.length = 0;
    this.particles.clear();
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        fx.done();
        this.active.splice(i, 1);
        const s = this.scorches.indexOf(fx);
        if (s >= 0) this.scorches.splice(s, 1);
      } else {
        fx.tick(fx.life / fx.max);
      }
    }
    this.particles.update(dt);
  }
}
