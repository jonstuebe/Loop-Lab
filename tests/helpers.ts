import { MeshStandardMaterial, Scene, Vector3 } from 'three';
import { GRAVITY, MAX_FALL_SPEED, WALK_SPEED } from '../src/config';
import { type Body, physicsStep } from '../src/physics';
import { PortalSystem } from '../src/portals';
import { LEVELS, type LevelSetup } from '../src/world/levels';
import { World } from '../src/world/world';

export function makeWorld(): World {
  const m = new MeshStandardMaterial();
  return new World({ white: m, metal: m, door: m });
}

export interface LevelHarness {
  world: World;
  portals: PortalSystem;
  setup: LevelSetup;
  player: Body;
}

export function loadLevel(index: number): LevelHarness {
  const world = makeWorld();
  const setup = LEVELS[index].build(world);
  const portals = new PortalSystem(new Scene());
  const player: Body = {
    pos: new Vector3(setup.spawn[0], setup.spawn[1] + 0.902, setup.spawn[2]),
    vel: new Vector3(),
    half: new Vector3(0.3, 0.9, 0.3),
    onGround: false,
    isPlayer: true,
  };
  return { world, portals, setup, player };
}

/** Fires a portal from `origin` toward `target`, like the game's shoot(). */
export function shootAt(h: LevelHarness, idx: 0 | 1, origin: Vector3, target: Vector3) {
  const dir = target.clone().sub(origin).normalize();
  const hit = h.world.raycast(origin, dir);
  if (!hit) throw new Error('shot hit nothing');
  if (hit.block.type !== 'white') return null; // portals only stick to cream panels
  const point = origin.clone().addScaledVector(dir, hit.t);
  return h.portals.place(idx, point, hit.normal, dir, hit.block, h.world.blocks);
}

/** Desired horizontal movement direction for this step (unit length), or null for no input. */
export type Steer = (p: Body) => Vector3 | null;

/**
 * Steps the player with the same movement model as the game: smoothed walking
 * on the ground, and air control that can steer but never adds speed beyond
 * walking pace (so flings keep their momentum). Returns true once `done` holds.
 */
export function simulate(h: LevelHarness, seconds: number, steer: Steer, done: (p: Body) => boolean): boolean {
  const dt = 1 / 120;
  const p = h.player;
  for (let t = 0; t < seconds; t += dt) {
    const wish = steer(p);
    const wx = wish?.x ?? 0;
    const wz = wish?.z ?? 0;
    if (p.onGround) {
      const k = 1 - Math.exp(-14 * dt);
      p.vel.x += (wx * WALK_SPEED - p.vel.x) * k;
      p.vel.z += (wz * WALK_SPEED - p.vel.z) * k;
    } else if (wish) {
      const add = WALK_SPEED - (p.vel.x * wx + p.vel.z * wz);
      if (add > 0) {
        const acc = Math.min(add, 24 * dt);
        p.vel.x += wx * acc;
        p.vel.z += wz * acc;
      }
    }
    p.vel.y = Math.max(p.vel.y - GRAVITY * dt, -MAX_FALL_SPEED);
    physicsStep(p, dt, h.world.blocks, h.portals);
    if (done(p)) return true;
  }
  return false;
}

/** Steers straight toward the level's goal. */
export function towardGoal(h: LevelHarness): Steer {
  return (p) => {
    const d = new Vector3(h.setup.goal[0] - p.pos.x, 0, h.setup.goal[2] - p.pos.z);
    return d.lengthSq() > 1e-6 ? d.normalize() : null;
  };
}

/** Same test as the game's goal check. */
export function atGoal(h: LevelHarness, p: Body): boolean {
  const [gx, gy, gz] = h.setup.goal;
  const feetY = p.pos.y - p.half.y;
  return Math.hypot(p.pos.x - gx, p.pos.z - gz) < 0.85 && feetY > gy - 0.3 && feetY < gy + 1.2;
}
