import {
  Color, CylinderGeometry, Group, type Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { BLUE } from '../config';
import { springStep, type Spring } from '../world/props';
import { roundedBoxGeometry } from './geometry';

const REST = new Vector3(0.21, -0.2, -0.42);
/** HDR boost for the glowing parts, so they catch the bloom pass. */
const GLOW = 3.2;

/** The view-model portal device held in front of the camera. */
export class Gun {
  readonly group = new Group();
  /** Glossy cream shell with a clear lacquer coat. */
  readonly bodyMaterial = new MeshPhysicalMaterial({
    color: 0xfff1de, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1,
  });
  /** Dark navy trim, also reused for the floor button base. */
  readonly darkMaterial = new MeshStandardMaterial({ color: 0x2b4060, roughness: 0.35, metalness: 0.2, envMapIntensity: 1 });
  private readonly chromeMaterial = new MeshStandardMaterial({ color: 0xb9c6d6, roughness: 0.28, metalness: 1, envMapIntensity: 0.75 });
  private readonly ringMaterial = new MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 1.6, roughness: 0.3 });
  private readonly glowMaterial = new MeshBasicMaterial({ color: new Color(BLUE).multiplyScalar(GLOW), toneMapped: true });
  private readonly coreMaterial = new MeshBasicMaterial({ color: new Color(BLUE).multiplyScalar(GLOW * 1.6) });
  private readonly tip: Mesh;
  private readonly prongs = new Group();
  private readonly recoil: Spring = { x: 0, v: 0 };
  private bob = 0;
  private spin = 0;

  constructor() {
    const g = this.group;

    // main shell
    const body = new Mesh(roundedBoxGeometry(0.13, 0.12, 0.3, 0.05, 8), this.bodyMaterial);
    body.position.z = 0.02;
    const back = new Mesh(new SphereGeometry(0.068, 32, 20), this.bodyMaterial);
    back.scale.set(1, 0.92, 0.85);
    back.position.z = 0.165;
    const backRing = new Mesh(new TorusGeometry(0.058, 0.009, 12, 40), this.darkMaterial);
    backRing.position.z = 0.15;

    // top fin and under-grip
    const fin = new Mesh(roundedBoxGeometry(0.028, 0.06, 0.18, 0.012, 4), this.darkMaterial);
    fin.position.set(0, 0.078, 0.04);
    const grip = new Mesh(roundedBoxGeometry(0.05, 0.11, 0.06, 0.02, 4), this.darkMaterial);
    grip.position.set(0, -0.085, 0.07);
    grip.rotation.x = -0.35;

    // glowing side strips show the active portal colour
    for (const side of [-1, 1]) {
      const strip = new Mesh(roundedBoxGeometry(0.006, 0.018, 0.16, 0.003, 2), this.glowMaterial);
      strip.position.set(side * 0.066, 0.012, 0.02);
      g.add(strip);
    }

    // emitter: collar, barrel, ring, three claws around a glowing core
    const collar = new Mesh(new CylinderGeometry(0.072, 0.072, 0.03, 40), this.chromeMaterial);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = -0.135;
    const barrel = new Mesh(new CylinderGeometry(0.068, 0.054, 0.1, 40), this.darkMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.195;
    const ring = new Mesh(new TorusGeometry(0.056, 0.012, 16, 40), this.ringMaterial);
    ring.position.z = -0.245;

    for (let i = 0; i < 3; i++) {
      const arm = new Group();
      arm.rotation.z = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const claw = new Mesh(roundedBoxGeometry(0.018, 0.022, 0.085, 0.008, 3), this.chromeMaterial);
      claw.position.set(0, 0.058, -0.03);
      claw.rotation.x = 0.32;
      arm.add(claw);
      this.prongs.add(arm);
    }
    this.prongs.position.z = -0.25;

    this.tip = new Mesh(new SphereGeometry(0.03, 24, 16), this.coreMaterial);
    this.tip.position.z = -0.262;
    const halo = new Mesh(new SphereGeometry(0.042, 24, 16), new MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false,
    }));
    this.tip.add(halo);

    g.add(body, back, backRing, fin, grip, collar, barrel, ring, this.prongs, this.tip);
    g.position.copy(REST);
  }

  get materials(): Material[] {
    return [this.bodyMaterial, this.darkMaterial, this.chromeMaterial, this.ringMaterial];
  }

  /** Recolours the emitter and side strips and kicks the gun back. */
  fire(color: number): void {
    this.coreMaterial.color.setHex(color).multiplyScalar(GLOW * 1.6);
    this.glowMaterial.color.setHex(color).multiplyScalar(GLOW);
    this.ringMaterial.color.setHex(color);
    this.ringMaterial.emissive.setHex(color);
    this.recoil.v += 3.2;
    this.spin += 2.1;
  }

  tipWorldPosition(target: Vector3): Vector3 {
    return this.tip.getWorldPosition(target);
  }

  /**
   * @param groundSpeed horizontal speed while grounded (0 when airborne), drives the walk bob
   * @param dip landing dip offset of the camera
   */
  animate(dt: number, groundSpeed: number, dip: number): void {
    springStep(this.recoil, 0, 180, 10, dt);
    if (groundSpeed > 0.5) this.bob += dt * groundSpeed * 1.8;
    const r = this.recoil.x;
    this.group.position.set(
      REST.x + Math.sin(this.bob) * 0.01,
      REST.y + Math.abs(Math.cos(this.bob)) * 0.01 - r * 0.012 - dip * 0.25,
      REST.z + r * 0.05,
    );
    this.group.rotation.x = r * 0.18;
    // claws idle-rotate slowly and whip round on each shot
    this.spin *= Math.exp(-4 * dt);
    this.prongs.rotation.z += dt * (0.6 + this.spin * 6);
    this.prongs.scale.setScalar(1 + r * 0.12);
  }
}
