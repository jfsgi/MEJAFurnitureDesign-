/**
 * Finger-pull slab front: a handle-less drawer front whose top edge carries
 * a routed pull channel (Freeborn 57-024). Matching the cutter drawing laid
 * onto a top edge: the BACK side of the edge stays at full height with an
 * eased crest, a deep cove sweeps down and forward, and a rounded hook lobe
 * rises near the front — the grab — before the cut breaks out of the front
 * face below it. Fingers curl over the hook into the cove; no hardware.
 *
 * The cross-section is swept exactly along the full width with analytic
 * normals (creased at the cut's arrises), and the profile shows as a
 * witness on both end-grain faces. The board below the channel band keeps
 * the door-edge detail on its sides and bottom. All meters.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { profiledBoardGeometry, type EdgeProfileId } from './profiledBoard.js';

/** Height of the top band that carries the pull channel. */
export const FINGER_PULL_BAND = 0.022;

interface Row {
  z: number; // across the thickness, front (+) to back (−)
  y: number; // top surface height within the band
  slope: number; // dy/dz
}

/**
 * Channel cross-section rows, digitized from MEJA's to-scale AutoCAD
 * drawing of the cut on 3/4" stock: the front face breaks out 15/32"
 * below the crest with a 3/32"-radius bullnose lip, a short wall drops
 * 1/8" into a 5/32"-radius cove bowl whose bottom sits 3/4" below the
 * crest, and a steep tangent wall climbs to the narrow back lip — the
 * tall side — crowned with its own 3/32" bullnose 3/8" above the front
 * lip. The path is tangent-continuous (cutter grind), so slopes come
 * from central differences; the profile scales with stock thickness and
 * the bowl is kept above the band bottom on short fronts.
 */
function channelRows(bh: number, T: number): Row[] {
  const IN = 0.0254;
  const s = T / (0.75 * IN); // the drawing is 3/4" stock
  const ds = Math.min(s, (bh - 0.0015) / (0.75 * IN));
  const top = bh / 2;
  const X0 = 7.0761; // drawing x of the front face
  const APEX = 17.9788; // drawing y of the back lip crest (the part top)

  const pts: Array<[number, number]> = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(7.1699, 17.51, 0.09375, 180, 0, 20); // front lip bullnose
  arc(7.4199, 17.385, 0.15625, 189, 353.32, 24); // wall, then the cove bowl
  arc(7.7324, 17.885, 0.09375, 173.08, 0, 20); // tangent wall, back lip crest

  const rows: Row[] = pts.map(([x, y]) => ({
    z: T / 2 - (x - X0) * IN * s,
    y: top - (APEX - y) * IN * ds,
    slope: 0,
  }));
  for (let i = 0; i < rows.length; i++) {
    const a = rows[Math.max(0, i - 1)];
    const b = rows[Math.min(rows.length - 1, i + 1)];
    rows[i].slope = Math.abs(b.z - a.z) > 1e-9 ? (b.y - a.y) / (b.z - a.z) : 0;
  }
  return rows;
}

/**
 * The top band: channel surface swept along the length, front/back/bottom
 * walls, and end caps showing the channel witness on the end grain.
 */
function bandGeometry(L: number, bh: number, T: number): THREE.BufferGeometry {
  const rows = channelRows(bh, T);
  const positions: number[] = [];
  const normals: number[] = [];
  const yBottom = -bh / 2;

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    na: [number, number, number],
    nb: [number, number, number],
    nc: [number, number, number],
    nd: [number, number, number],
  ) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    normals.push(...na, ...nb, ...nc, ...na, ...nc, ...nd);
  };

  // Channel surface: sweep row pairs along x, analytic creased normals.
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i];
    const r1 = rows[i + 1];
    if (r0.z - r1.z < 1e-7) continue;
    // Surface y = f(z) has outward normal (0, 1, −f′).
    const n = (slope: number): [number, number, number] => {
      const len = Math.hypot(slope, 1);
      return [0, 1 / len, -slope / len];
    };
    const n0 = n(r0.slope);
    const n1 = n(r1.slope);
    quad(
      [-L / 2, r0.y, r0.z],
      [L / 2, r0.y, r0.z],
      [L / 2, r1.y, r1.z],
      [-L / 2, r1.y, r1.z],
      n0,
      n0,
      n1,
      n1,
    );
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  // Front wall (full height up to where the arris ease begins).
  quad(
    [-L / 2, yBottom, T / 2],
    [L / 2, yBottom, T / 2],
    [L / 2, first.y, T / 2],
    [-L / 2, first.y, T / 2],
    [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1],
  );
  // Back wall.
  quad(
    [L / 2, yBottom, -T / 2],
    [-L / 2, yBottom, -T / 2],
    [-L / 2, last.y, -T / 2],
    [L / 2, last.y, -T / 2],
    [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1],
  );
  // Bottom (seam face against the board below).
  quad(
    [-L / 2, yBottom, -T / 2],
    [L / 2, yBottom, -T / 2],
    [L / 2, yBottom, T / 2],
    [-L / 2, yBottom, T / 2],
    [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0],
  );
  // End caps: column strips from each channel row down to the band bottom —
  // the channel cross-section witness on the end grain.
  for (const sign of [1, -1] as const) {
    const x = (sign * L) / 2;
    const nx: [number, number, number] = [sign, 0, 0];
    for (let i = 0; i < rows.length - 1; i++) {
      const r0 = rows[i];
      const r1 = rows[i + 1];
      if (r0.z - r1.z < 1e-7) continue;
      // Wind so the face points out of the end (+x or −x).
      const p0: [number, number, number] = [x, r0.y, r0.z];
      const p1: [number, number, number] = [x, r1.y, r1.z];
      const b0: [number, number, number] = [x, yBottom, r0.z];
      const b1: [number, number, number] = [x, yBottom, r1.z];
      if (sign > 0) quad(b0, b1, p1, p0, nx, nx, nx, nx);
      else quad(b1, b0, p0, p1, nx, nx, nx, nx);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  return geometry;
}

/**
 * Complete slab front with the pull channel: door-edge detail (if any) on
 * the sides and bottom, channel band across the top. One board, one part.
 */
export function fingerPullFrontGeometry(
  width: number,
  height: number,
  thickness: number,
  outer?: EdgeProfileId,
  /** Exact 45° bevel size for the side/bottom face edges (beveled openings). */
  bevel?: number,
): THREE.BufferGeometry {
  const bh = Math.min(FINGER_PULL_BAND, height * 0.35);
  const lowerH = height - bh;
  const lower = outer
    ? profiledBoardGeometry(width, lowerH, thickness, {
        depth: bevel ?? Math.min(0.005, thickness * 0.35),
        outer: {
          profile: outer,
          width: bevel ?? 0.011,
          uMin: true,
          uMax: true,
          vMin: true,
          vMax: false,
        },
      })
    : new THREE.BoxGeometry(width, lowerH, thickness);
  lower.translate(0, -bh / 2, 0);
  const band = bandGeometry(width, bh, thickness);
  band.translate(0, lowerH / 2, 0);
  const merged = mergeGeometries(
    [lower.index ? lower.toNonIndexed() : lower, band],
    false,
  );
  lower.dispose();
  band.dispose();
  return merged!;
}
