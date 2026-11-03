import { type Matrix4, Vector3 } from 'three';
import { PORTAL_HALF_H, PORTAL_HALF_W, type PortalIndex } from './config';
import type { Portal, PortalSystem } from './portals';
import type { Collider } from './world/world';

/** A moving axis-aligned box: the player or the cube. */
export interface Body {
  pos: Vector3;
  vel: Vector3;
  /** Half extents of the box. */
  half: Vector3;
  onGround: boolean;
  isPlayer: boolean;
}

type Axis = 'x' | 'y' | 'z';
const AXES: readonly Axis[] = ['x', 'y', 'z'];
/** Resolve vertical motion first so walking on floors is stable. */
const MOVE_ORDER: readonly Axis[] = ['y', 'x', 'z'];
const EPS = 1e-4;

/** Slab test: distance along d to the entry face of the box, and that face's normal. */
export function rayBox(o: Vector3, d: Vector3, min: Vector3, max: Vector3): { t: number; normal: Vector3 } | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  for (let ai = 0; ai < 3; ai++) {
    const k = AXES[ai];
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    let t1 = (min[k] - o[k]) / d[k];
    let t2 = (max[k] - o[k]) / d[k];
    let s = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1;
    }
    if (t1 > tmin) { tmin = t1; axis = ai; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || axis < 0) return null;
  const normal = new Vector3();
  normal.setComponent(axis, sign);
  return { t: tmin, normal };
}

/** Strictly inside the box (with a tiny margin). */
export function pointInside(q: Vector3, b: Collider): boolean {
  return q.x > b.min.x + EPS && q.x < b.max.x - EPS &&
         q.y > b.min.y + EPS && q.y < b.max.y - EPS &&
         q.z > b.min.z + EPS && q.z < b.max.z - EPS;
}

export function overlaps(e: Body, b: Collider): boolean {
  return e.pos.x + e.half.x > b.min.x && e.pos.x - e.half.x < b.max.x &&
         e.pos.y + e.half.y > b.min.y && e.pos.y - e.half.y < b.max.y &&
         e.pos.z + e.half.z > b.min.z && e.pos.z - e.half.z < b.max.z;
}

/** Half-extent of a box with half sizes h, projected onto direction v. */
export function extentAlong(v: Vector3, h: Vector3): number {
  return Math.abs(v.x) * h.x + Math.abs(v.y) * h.y + Math.abs(v.z) * h.z;
}

/** Is the body (at portal-local position L) entirely within the portal's opening? */
function withinPortal(e: Body, p: Portal, L: Vector3, tolerance: number): boolean {
  const ex = extentAlong(p.right, e.half);
  const ey = extentAlong(p.up, e.half);
  return Math.abs(L.x) + ex <= PORTAL_HALF_W + tolerance && Math.abs(L.y) + ey <= PORTAL_HALF_H + tolerance;
}

/** Push the body out of anything it is already overlapping, along the shallowest axis. */
function depenetrate(e: Body, cols: readonly Collider[], ignore: ReadonlySet<Collider>): void {
  for (const b of cols) {
    if (!b.active || ignore.has(b) || !overlaps(e, b)) continue;
    let best = Infinity;
    let axis: Axis = 'y';
    let s = 0;
    for (const k of AXES) {
      const a = e.pos[k] + e.half[k] - b.min[k];
      const c = b.max[k] - (e.pos[k] - e.half[k]);
      if (a < best) { best = a; axis = k; s = -1; }
      if (c < best) { best = c; axis = k; s = 1; }
    }
    e.pos[axis] += s * (best + EPS);
    if (axis === 'y' && s > 0) {
      e.onGround = true;
      if (e.vel.y < 0) e.vel.y = 0;
    } else if (s * e.vel[axis] < 0) {
      e.vel[axis] = 0;
    }
  }
}

/** Move one axis at a time and clamp against colliders. */
function sweepAxes(e: Body, dt: number, cols: readonly Collider[], ignore: ReadonlySet<Collider>): void {
  for (const k of MOVE_ORDER) {
    const d = e.vel[k] * dt;
    if (d === 0) continue;
    e.pos[k] += d;
    for (const b of cols) {
      if (!b.active || ignore.has(b) || !overlaps(e, b)) continue;
      if (d > 0) {
        e.pos[k] = b.min[k] - e.half[k] - EPS;
      } else {
        e.pos[k] = b.max[k] + e.half[k] + EPS;
        if (k === 'y') e.onGround = true;
      }
      e.vel[k] = 0;
    }
  }
}

const _local = new Vector3();

/**
 * Advances a body by dt. While a body is lined up with an open portal, the wall
 * behind that portal stops being solid so it can pass through.
 *
 * Returns the transfer matrix if the body teleported this step, otherwise null.
 */
export function physicsStep(e: Body, dt: number, cols: readonly Collider[], portals: PortalSystem | null): Matrix4 | null {
  const ignore = new Set<Collider>();
  const prevZ: [number | null, number | null] = [null, null];
  const open = portals !== null && portals.bothOpen;

  if (open) {
    for (const i of [0, 1] as const) {
      const p = portals.list[i];
      _local.copy(e.pos).applyMatrix4(p.inverse);
      prevZ[i] = _local.z;
      if (Math.abs(_local.z) < 1.2 && withinPortal(e, p, _local, 0.15) && p.host) ignore.add(p.host);
    }
  }

  e.onGround = false;
  depenetrate(e, cols, ignore);
  sweepAxes(e, dt, cols, ignore);

  if (open) {
    // The player teleports a touch before its centre crosses, so the camera never clips the wall.
    const threshold = e.isPlayer ? 0.04 : 0;
    for (const i of [0, 1] as const) {
      const p = portals.list[i];
      _local.copy(e.pos).applyMatrix4(p.inverse);
      const before = prevZ[i];
      if (before !== null && before >= threshold && _local.z < threshold && _local.z > -1.5 && withinPortal(e, p, _local, 0.15)) {
        return teleport(e, portals, i);
      }
    }
  }
  return null;
}

/** Moves a body from portal i to its partner, keeping its speed. */
function teleport(e: Body, portals: PortalSystem, i: PortalIndex): Matrix4 {
  const from = portals.list[i];
  const to = portals.list[i === 0 ? 1 : 0];
  const M = portals.transferMatrix(from, to);

  e.pos.applyMatrix4(M);
  const speed = e.vel.length();
  if (speed > 1e-6) e.vel.transformDirection(M).multiplyScalar(speed);

  // Re-seat the body just in front of the exit portal, fully inside its opening.
  const L = e.pos.clone().applyMatrix4(to.inverse);
  const ex = extentAlong(to.right, e.half);
  const ey = extentAlong(to.up, e.half);
  const ez = extentAlong(to.normal, e.half);
  const maxX = Math.max(0, PORTAL_HALF_W - ex);
  const maxY = Math.max(0, PORTAL_HALF_H - ey);
  L.x = Math.max(-maxX, Math.min(maxX, L.x));
  L.y = Math.max(-maxY, Math.min(maxY, L.y));
  L.z = ez + 0.03;
  e.pos.copy(L.applyMatrix4(to.matrix));

  // Floor portals always pop you out with at least a little upward speed.
  if (to.normal.y > 0.5) {
    const vn = e.vel.dot(to.normal);
    if (vn < 5) e.vel.addScaledVector(to.normal, 5 - vn);
  }
  return M;
}
