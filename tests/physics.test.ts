import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Body, physicsStep, rayBox } from '../src/physics';
import { makeWorld } from './helpers';

describe('rayBox', () => {
  const min = new Vector3(-1, -1, -1);
  const max = new Vector3(1, 1, 1);

  it('hits the entry face and reports its normal', () => {
    const hit = rayBox(new Vector3(-5, 0, 0), new Vector3(1, 0, 0), min, max);
    expect(hit?.t).toBeCloseTo(4);
    expect(hit?.normal.toArray()).toEqual([-1, 0, 0]);
  });

  it('misses boxes that are beside or behind the ray', () => {
    expect(rayBox(new Vector3(-5, 3, 0), new Vector3(1, 0, 0), min, max)).toBeNull();
    expect(rayBox(new Vector3(5, 0, 0), new Vector3(1, 0, 0), min, max)).toBeNull();
  });
});

describe('physicsStep', () => {
  const body = (): Body => ({
    pos: new Vector3(0, 3, 0), vel: new Vector3(), half: new Vector3(0.3, 0.9, 0.3), onGround: false, isPlayer: true,
  });

  it('lands a falling body on the floor', () => {
    const world = makeWorld();
    world.block(-5, -1, -5, 5, 0, 5, 'metal');
    const b = body();
    for (let i = 0; i < 240; i++) {
      b.vel.y -= 22 / 120;
      physicsStep(b, 1 / 120, world.blocks, null);
    }
    expect(b.onGround).toBe(true);
    expect(b.pos.y - b.half.y).toBeCloseTo(0, 2);
  });

  it('stops a body at a wall', () => {
    const world = makeWorld();
    world.block(-5, -1, -5, 5, 0, 5, 'metal');
    world.block(2, 0, -5, 3, 5, 5, 'metal');
    const b = body();
    b.pos.y = 0.91;
    for (let i = 0; i < 240; i++) {
      b.vel.set(5, b.vel.y - 22 / 120, 0);
      physicsStep(b, 1 / 120, world.blocks, null);
    }
    expect(b.pos.x + b.half.x).toBeLessThanOrEqual(2);
    expect(b.pos.x + b.half.x).toBeGreaterThan(1.99);
  });
});
