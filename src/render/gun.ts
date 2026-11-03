import {
  CylinderGeometry, Group, type Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry,
  TorusGeometry, Vector3,
} from 'three';
import { BLUE } from '../config';
import { springStep, type Spring } from '../world/props';
import { roundedBoxGeometry } from './geometry';

const REST = new Vector3(0.21, -0.2, -0.42);

/** The view-model portal device held in front of the camera. */
export class Gun {
  readonly group = new Group();
  readonly bodyMaterial = new MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.3, envMapIntensity: 0.9 });
  /** Dark navy trim, also reused for the floor button base. */
  readonly darkMaterial = new MeshStandardMaterial({ color: 0x2f4766, roughness: 0.35, envMapIntensity: 0.8 });
  private readonly ringMaterial = new MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.6, roughness: 0.3 });
  private readonly tipMaterial = new MeshBasicMaterial({ color: BLUE });
  private readonly tip: Mesh;
  private readonly recoil: Spring = { x: 0, v: 0 };
  private bob = 0;

  constructor() {
    const body = new Mesh(roundedBoxGeometry(0.13, 0.13, 0.34, 0.05, 4), this.bodyMaterial);
    const cap = new Mesh(new SphereGeometry(0.07, 20, 14), this.bodyMaterial);
    cap.scale.set(1, 1, 0.8);
    cap.position.z = 0.17;
    const barrel = new Mesh(new CylinderGeometry(0.055, 0.07, 0.12, 24), this.darkMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.21;
    const ring = new Mesh(new TorusGeometry(0.062, 0.018, 12, 28), this.ringMaterial);
    ring.position.z = -0.275;
    this.tip = new Mesh(new SphereGeometry(0.036, 18, 12), this.tipMaterial);
    this.tip.position.z = -0.28;
    const fin = new Mesh(roundedBoxGeometry(0.03, 0.07, 0.16, 0.012, 2), this.darkMaterial);
    fin.position.set(0, 0.085, 0.03);
    this.group.add(body, cap, barrel, ring, this.tip, fin);
    this.group.position.copy(REST);
  }

  get materials(): Material[] {
    return [this.bodyMaterial, this.darkMaterial, this.ringMaterial];
  }

  /** Recolours the barrel tip and kicks the gun back. */
  fire(color: number): void {
    this.tipMaterial.color.setHex(color);
    this.ringMaterial.color.setHex(color);
    this.ringMaterial.emissive.setHex(color);
    this.recoil.v += 3.2;
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
  }
}
