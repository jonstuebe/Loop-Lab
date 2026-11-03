import {
  type BoxGeometry, Color, CylinderGeometry, DoubleSide, Group, type Material, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, SphereGeometry, type Texture, TorusGeometry,
} from 'three';
import { roundedBoxGeometry } from '../render/geometry';

export interface Spring {
  x: number;
  v: number;
}

/** Damped spring integrator used for small bits of juice (button press, landing dip, recoil). */
export function springStep(s: Spring, target: number, stiffness: number, damping: number, dt: number): void {
  s.v += (target - s.x) * stiffness * dt;
  s.v *= Math.exp(-damping * dt);
  s.x += s.v * dt;
}

const BUTTON_UP = 0.14;
const BUTTON_DOWN = 0.04;
const RED = 0xff5a4e;
const RED_GLOW = 0xa1241c;
const GREEN = 0x4fe3a1;
const GREEN_GLOW = 0x1f9e66;

export class ButtonProp {
  readonly group = new Group();
  private readonly cap: Mesh;
  private readonly capMat: MeshStandardMaterial;
  private readonly spring: Spring = { x: BUTTON_UP, v: 0 };
  pressed = false;

  constructor(baseMaterial: Material) {
    const base = new Mesh(new CylinderGeometry(0.95, 1.05, 0.14, 40), baseMaterial);
    base.position.y = 0.07;
    base.receiveShadow = true;
    this.group.add(base);
    this.capMat = new MeshStandardMaterial({ color: RED, emissive: RED_GLOW, emissiveIntensity: 0.5, roughness: 0.3 });
    this.cap = new Mesh(new SphereGeometry(0.7, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.capMat);
    this.cap.scale.set(1, 0.28, 1);
    this.cap.castShadow = true;
    this.group.add(this.cap);
  }

  animate(dt: number): void {
    springStep(this.spring, this.pressed ? BUTTON_DOWN : BUTTON_UP, 260, 9, dt);
    this.cap.position.y = this.spring.x;
    const press = BUTTON_UP - this.spring.x;
    const wide = 1 + press * 0.6;
    this.cap.scale.set(wide, Math.max(0.1, 0.28 - press * 0.8), wide);
    this.capMat.color.setHex(this.pressed ? GREEN : RED);
    this.capMat.emissive.setHex(this.pressed ? GREEN_GLOW : RED_GLOW);
  }
}

export class GoalProp {
  readonly group = new Group();
  private readonly columnMat: MeshBasicMaterial;
  private readonly beacon = new Group();

  constructor() {
    const pad = new Mesh(
      new CylinderGeometry(0.95, 1.05, 0.08, 40),
      new MeshStandardMaterial({ color: GREEN, emissive: GREEN_GLOW, emissiveIntensity: 0.6, roughness: 0.35 }),
    );
    pad.position.y = 0.04;
    this.group.add(pad);

    this.columnMat = new MeshBasicMaterial({ color: 0x7dffc2, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false });
    const column = new Mesh(new CylinderGeometry(0.85, 0.85, 2.6, 40, 1, true), this.columnMat);
    column.position.y = 1.3;
    this.group.add(column);

    const beaconMat = new MeshStandardMaterial({ color: GREEN, emissive: 0x2bd18a, emissiveIntensity: 0.7, roughness: 0.25 });
    this.beacon.add(new Mesh(new TorusGeometry(0.32, 0.09, 16, 32), beaconMat));
    this.beacon.add(new Mesh(new SphereGeometry(0.13, 20, 14), new MeshBasicMaterial({ color: 0xfff7c2 })));
    this.beacon.position.y = 1.9;
    this.group.add(this.beacon);
  }

  animate(time: number): void {
    this.columnMat.opacity = 0.12 + 0.07 * Math.sin(time * 3);
    const phase = (time * 1.6) % 1;
    const h = Math.sin(phase * Math.PI);
    this.beacon.position.y = 1.55 + h * 0.55;
    const squash = phase < 0.12 || phase > 0.88 ? 0.22 * (1 - h) : 0;
    this.beacon.scale.set(1 + squash, 1 - squash, 1 + squash);
    this.beacon.rotation.y = time * 1.4;
  }
}

export const CUBE_SIZE = 0.7;

export function createCubeMesh(map: Texture, emissiveMap: Texture): Mesh<BoxGeometry, MeshStandardMaterial> {
  const mesh = new Mesh(
    roundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 0.11, 5),
    new MeshStandardMaterial({
      map, emissiveMap, emissive: new Color(0xffc23d), emissiveIntensity: 0.8, roughness: 0.35, envMapIntensity: 0.8,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
