import { BoxGeometry, Vector3 } from 'three';

/**
 * A box whose UVs are scaled so the texture tiles once every `tileLength`
 * world units on every face, instead of stretching.
 */
export function tiledBoxGeometry(w: number, h: number, d: number, tileLength: number): BoxGeometry {
  const geo = new BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    let su: number;
    let sv: number;
    if (face < 2) { su = d; sv = h; }
    else if (face < 4) { su = w; sv = d; }
    else { su = w; sv = h; }
    uv.setXY(i, (uv.getX(i) * su) / tileLength, (uv.getY(i) * sv) / tileLength);
  }
  uv.needsUpdate = true;
  return geo;
}

/** A box with rounded edges and corners of radius `r`. */
export function roundedBoxGeometry(w: number, h: number, d: number, r: number, segments: number): BoxGeometry {
  const geo = new BoxGeometry(w, h, d, segments, segments, segments);
  const pos = geo.attributes.position;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;
  const v = new Vector3();
  const inner = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(
      Math.max(-hx, Math.min(hx, v.x)),
      Math.max(-hy, Math.min(hy, v.y)),
      Math.max(-hz, Math.min(hz, v.z)),
    );
    v.sub(inner);
    if (v.lengthSq() > 0) v.setLength(r);
    v.add(inner);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
