import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { atGoal, loadLevel, shootAt, simulate, towardGoal } from './helpers';

describe('portal placement', () => {
  it('snaps wall portals aimed near the floor down onto it', () => {
    const h = loadLevel(0);
    const eye = new Vector3(0, 1.6, -5);
    const portal = shootAt(h, 1, eye, new Vector3(0, 2, -8));
    expect(portal).not.toBeNull();
    // Bottom edge of the portal rests on the floor (y = 0).
    expect(portal!.center.y).toBeCloseTo(1.15, 1);
    expect(portal!.normal.toArray()).toEqual([0, 0, 1]);
  });

  it('will not stick to metal', () => {
    const h = loadLevel(2);
    expect(shootAt(h, 1, new Vector3(0, 1.6, -2), new Vector3(0, -14, 3))).toBeNull(); // hits the metal ledge
  });

  it('will not overlap the other portal', () => {
    const h = loadLevel(0);
    const eye = new Vector3(0, 1.6, -5);
    const a = shootAt(h, 0, eye, new Vector3(0, 1.6, -8));
    const b = shootAt(h, 1, eye, new Vector3(0, 1.6, -8));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a!.center.x - b!.center.x)).toBeGreaterThanOrEqual(1.4 - 1e-6);
  });
});

describe('level solutions', () => {
  it('chamber 1: walk through a wall portal up onto the ledge', () => {
    const h = loadLevel(0);
    const eye = new Vector3(0, 1.6, -5);
    expect(shootAt(h, 0, eye, new Vector3(0, 7, 8))).not.toBeNull(); // high wall above the ledge
    expect(shootAt(h, 1, eye, new Vector3(0, 1.6, -8))).not.toBeNull(); // wall behind spawn
    const forward = new Vector3(0, 0, -1);
    const reached = simulate(h, 4, () => forward, (p) => atGoal(h, p));
    expect(reached).toBe(true);
  });

  it('chamber 3: fall into a floor portal and fling across the pit', () => {
    const h = loadLevel(2);
    const spawnEye = new Vector3(0, 1.6, -2);
    const edgeEye = new Vector3(0, 1.6, -0.35);
    expect(shootAt(h, 0, spawnEye, new Vector3(0, 2.5, -4))).not.toBeNull(); // low on the cream wall behind spawn
    expect(shootAt(h, 1, edgeEye, new Vector3(0, -14, 6.5))).not.toBeNull(); // pit floor where you land, aimed from the ledge edge
    // Walk off the ledge (+z) onto the floor portal, then steer toward the exit pad.
    const forward = new Vector3(0, 0, 1);
    const steerToGoal = towardGoal(h);
    let flung = false;
    const reached = simulate(h, 8, (p) => {
      if (p.pos.y > 1.5) flung = true; // came out of the wall portal above the start ledge
      return flung ? steerToGoal(p) : forward;
    }, (p) => atGoal(h, p));
    expect(reached).toBe(true);
  });
});
