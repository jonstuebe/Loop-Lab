import {
  BufferGeometry, DoubleSide, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, RingGeometry, type Scene,
  type Vector3,
} from 'three';

interface Effect {
  life: number;
  readonly max: number;
  /** Called each frame with remaining life in 0..1. */
  tick(t: number): void;
  done(): void;
}

/** Short-lived visual effects: shot tracers and impact rings. */
export class Effects {
  private readonly active: Effect[] = [];

  constructor(private readonly scene: Scene) {}

  tracer(from: Vector3, to: Vector3, color: number): void {
    const geo = new BufferGeometry().setFromPoints([from, to]);
    const mat = new LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const line = new Line(geo, mat);
    this.scene.add(line);
    this.active.push({
      life: 0.14, max: 0.14,
      tick: (t) => { mat.opacity = t; },
      done: () => { this.scene.remove(line); geo.dispose(); mat.dispose(); },
    });
  }

  impact(point: Vector3, normal: Vector3, color: number, size = 1): void {
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false });
    const geo = new RingGeometry(0.05, 0.13, 28);
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

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        fx.done();
        this.active.splice(i, 1);
      } else {
        fx.tick(fx.life / fx.max);
      }
    }
  }
}
