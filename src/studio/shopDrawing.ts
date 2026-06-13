// Shop drawings: dimensioned third-angle elevations (Front, Top, Right) of
// each piece as print-ready SVG, drawn from the real geometry. Every part's
// feature edges are extracted (EdgesGeometry), projected to each view, and
// run through hidden-line removal — edges you can see are solid, edges behind
// a surface are dashed — the woodworking-drawing convention. Model space is
// Z-up, mm; the projections emit straight into SVG space (y-down).

import * as THREE from 'three';
import type { Instance, ProjectDoc, Units } from '../core/types';
import { evaluateInstance, modelBBox } from '../core/evaluate';
import { formatLength } from '../core/units';
import type { Primitive } from '../core/types';
import { buildCutList, boardFeet } from '../core/cutlist';
import { MATERIAL_BY_ID } from '../core/materials';
import { buildExportGroup, buildPartGroup } from './exportModel';
// Embedded as a base64 data URI so every drawing carries the MEJA logo and
// stays self-contained when the SVG is downloaded or printed.
import mejaLogo from '../assets/meja-logo.png?inline';

const LOGO_W = 803; // native pixels of meja-logo.png (for the symbol viewBox)
const LOGO_H = 868;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

type V3 = [number, number, number];
interface Piece {
  segs: number[][]; // [ax,ay,az,bx,by,bz] in model space (mm)
  min: V3;
  max: V3;
}
type Proj = (x: number, y: number, z: number) => [number, number];
type Depth = (x: number, y: number, z: number) => number; // larger = nearer the viewer

/** Feature edges + bbox for every mesh in a group, in model space. */
function groupToPieces(group: THREE.Group): Piece[] {
  group.updateMatrixWorld(true);
  const pieces: Piece[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const edges = new THREE.EdgesGeometry(o.geometry, 1);
    const pos = edges.getAttribute('position');
    const segs: number[][] = [];
    for (let i = 0; i < pos.count; i += 2) {
      a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld);
      segs.push([a.x, a.y, a.z, b.x, b.y, b.z]);
    }
    const bb = new THREE.Box3().setFromObject(o);
    pieces.push({ segs, min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
    edges.dispose();
    o.geometry.dispose();
  });
  return pieces;
}

/** Real feature edges + bbox for every primitive of one piece, in the piece's
 * local model space (instance placement/rotation dropped — a shop drawing is
 * the canonical piece). */
function collectPieces(inst: Instance): Piece[] {
  const local: Instance = { ...inst, position: [0, 0], rotationZ: 0 };
  const doc: ProjectDoc = { schema: 1, name: inst.name, units: 'imperial', instances: [local] };
  return groupToPieces(buildExportGroup(doc));
}

/** Feature edges for a single part, framed on its own. */
function collectPartPieces(primitives: Primitive[]): Piece[] {
  return groupToPieces(buildPartGroup(primitives));
}

const lerp = (A: number[], B: number[], t: number): V3 => [
  A[0] + (B[0] - A[0]) * t,
  A[1] + (B[1] - A[1]) * t,
  A[2] + (B[2] - A[2]) * t,
];

/** Renders one view's pieces with hidden-line removal. */
function renderView(
  pieces: Piece[],
  proj: Proj,
  depth: Depth,
  sw: number,
  span: number,
): string {
  const inset = span * 0.004;
  const eps = span * 0.005;
  const step = Math.max(span * 0.04, 1);
  // 2D rectangle + nearest depth of every piece, for occlusion tests.
  const rects = pieces.map((p) => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, near = -Infinity;
    for (const x of [p.min[0], p.max[0]])
      for (const y of [p.min[1], p.max[1]])
        for (const z of [p.min[2], p.max[2]]) {
          const [u, v] = proj(x, y, z);
          u0 = Math.min(u0, u); u1 = Math.max(u1, u);
          v0 = Math.min(v0, v); v1 = Math.max(v1, v);
          near = Math.max(near, depth(x, y, z));
        }
    return { u0, u1, v0, v1, near };
  });

  const occluded = (u: number, v: number, d: number, self: number): boolean => {
    for (let i = 0; i < rects.length; i++) {
      if (i === self) continue;
      const r = rects[i];
      if (r.near > d + eps && u > r.u0 + inset && u < r.u1 - inset && v > r.v0 + inset && v < r.v1 - inset)
        return true;
    }
    return false;
  };

  const solid: string[] = [];
  const hidden: string[] = [];
  pieces.forEach((p, pi) => {
    for (const s of p.segs) {
      const A = [s[0], s[1], s[2]];
      const B = [s[3], s[4], s[5]];
      const [pax, pay] = proj(A[0], A[1], A[2]);
      const [pbx, pby] = proj(B[0], B[1], B[2]);
      const n = Math.min(48, Math.max(1, Math.round(Math.hypot(pbx - pax, pby - pay) / step)));
      const flag = (i: number) => {
        const m = lerp(A, B, (i + 0.5) / n);
        const [u, v] = proj(m[0], m[1], m[2]);
        return occluded(u, v, depth(m[0], m[1], m[2]), pi);
      };
      // Coalesce consecutive intervals that share visibility into one line.
      let runStart = 0;
      let runHidden = flag(0);
      for (let i = 1; i <= n; i++) {
        const h = i < n ? flag(i) : !runHidden;
        if (i === n || h !== runHidden) {
          const p0 = lerp(A, B, runStart / n);
          const p1 = lerp(A, B, i / n);
          const [x0, y0] = proj(p0[0], p0[1], p0[2]);
          const [x1, y1] = proj(p1[0], p1[1], p1[2]);
          const line = `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}"`;
          (runHidden ? hidden : solid).push(line);
          runStart = i;
          runHidden = h;
        }
      }
    }
  });
  return [
    `<g fill="none" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}" stroke-linecap="round">${solid.map((l) => l + '/>').join('')}</g>`,
    `<g fill="none" stroke="#8a8a8a" stroke-width="${(sw * 0.8).toFixed(3)}" stroke-dasharray="${(sw * 4).toFixed(2)} ${(sw * 3).toFixed(2)}">${hidden.map((l) => l + '/>').join('')}</g>`,
  ].join('\n');
}

const JOINT_LABEL: Record<string, string> = {
  'mortise-tenon': 'Mortise & tenon',
  'french-dovetail': 'French dovetail',
  'through-dovetail': 'Through dovetail',
  'half-blind-dovetail': 'Half-blind dovetail',
  'box-joint': 'Box joint',
  dowel: 'Dowel',
  butt: 'Butt',
};

/** The part's corner radius (rounded slab / post), 0 if none — for a callout. */
function partCornerRadius(part: { primitives: Primitive[] }): number {
  for (const p of part.primitives) {
    if ((p.shape === 'roundedSlab' || p.shape === 'roundedNotchedSlab' || p.shape === 'mortisedPost') && p.radius > 0.5)
      return p.radius;
  }
  return 0;
}

/** A dimensionable joinery feature read off a part's primitives. */
type JointFeature =
  | { kind: 'tenon'; length: number; width: number; thickness: number }
  | { kind: 'key'; depth: number; runH: number; rootThin: number; tipThin: number };

/** The joinery features on a part worth a dimensioned detail: tenons (boxes
 * projecting past the body when the part is in a mortise-tenon joint) and
 * French-dovetail keys. De-duplicated by size. */
function partJointFeatures(part: { primitives: Primitive[] }, inMT: boolean): JointFeature[] {
  const out: JointFeature[] = [];
  const seen = new Set<string>();
  const boxes = part.primitives.filter((p) => p.shape === 'box') as Extract<Primitive, { shape: 'box' }>[];
  const vol = (b: Extract<Primitive, { shape: 'box' }>) => b.size[0] * b.size[1] * b.size[2];
  let body: Extract<Primitive, { shape: 'box' }> | null = null;
  for (const b of boxes) if (!body || vol(b) > vol(body)) body = b;
  for (const prim of part.primitives) {
    if (prim.shape === 'box' && inMT && body && prim !== body) {
      const off = [0, 1, 2].map((i) => Math.abs(prim.at[i] - body!.at[i]));
      const ax = off.indexOf(Math.max(off[0], off[1], off[2]));
      const perp = [0, 1, 2].filter((i) => i !== ax);
      const a = prim.size[perp[0]];
      const b = prim.size[perp[1]];
      const f: JointFeature = { kind: 'tenon', length: prim.size[ax], width: Math.max(a, b), thickness: Math.min(a, b) };
      const key = `t${f.length.toFixed(1)}|${f.width.toFixed(1)}|${f.thickness.toFixed(1)}`;
      if (!seen.has(key)) { seen.add(key); out.push(f); }
    } else if (prim.shape === 'frenchDovetail') {
      const f: JointFeature = { kind: 'key', depth: prim.depth, runH: prim.runH, rootThin: prim.rootThin, tipThin: prim.tipThin };
      if (!seen.has('k')) { seen.add('k'); out.push(f); }
    }
  }
  return out;
}

/** A zoomed, dimensioned detail of one joinery feature, drawn from (dx0, dyTop)
 * within dw. Returns the SVG and the height it consumed. */
function renderJointDetail(
  f: JointFeature,
  units: Units,
  dx0: number,
  dyTop: number,
  dw: number,
  sw: number,
  ds: number,
): { svg: string; height: number } {
  const L = (mm: number) => formatLength(mm, units);
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`;
  const txt = (x: number, y: number, s: string, anchor = 'middle', rot = false) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${(ds * 0.78).toFixed(2)}" fill="#1b1b1b" text-anchor="${anchor}" font-family="sans-serif"${rot ? ` transform="rotate(-90 ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}>${esc(s)}</text>`;
  const tick = ds * 0.32;
  // horizontal dim line with end ticks + centered label below it
  const hdim = (x1: number, x2: number, y: number, s: string) =>
    [line(x1, y, x2, y), line(x1, y - tick, x1, y + tick), line(x2, y - tick, x2, y + tick), txt((x1 + x2) / 2, y + ds * 0.8, s)].join('');
  // vertical dim line + rotated label to its right
  const vdim = (y1: number, y2: number, x: number, s: string) =>
    [line(x, y1, x, y2), line(x - tick, y1, x + tick, y1), line(x - tick, y2, x + tick, y2), txt(x + ds * 0.7, (y1 + y2) / 2, s, 'middle', true)].join('');
  const title = `<text x="${dx0.toFixed(2)}" y="${dyTop.toFixed(2)}" font-size="${(ds * 0.82).toFixed(2)}" fill="#1b1b1b" font-family="sans-serif" font-weight="600">${f.kind === 'tenon' ? 'TENON DETAIL' : 'DOVETAIL KEY DETAIL'}</text>`;
  const parts: string[] = [title];
  const top = dyTop + ds * 0.8;

  if (f.kind === 'tenon') {
    const scale = Math.min((dw * 0.42) / Math.max(f.length, 1), (ds * 4.2) / Math.max(f.width, 1));
    const shX = dx0 + ds * 0.6;
    const planY = top + ds * 0.4;
    const tw = f.width * scale;
    const len = f.length * scale;
    // board shoulder line, then the tenon block projecting right
    parts.push(line(shX, planY - ds * 0.5, shX, planY + tw + ds * 0.5));
    parts.push(`<rect x="${shX.toFixed(2)}" y="${planY.toFixed(2)}" width="${len.toFixed(2)}" height="${tw.toFixed(2)}" fill="none" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`);
    parts.push(hdim(shX, shX + len, planY + tw + ds * 1.0, L(f.length)));
    parts.push(vdim(planY, planY + tw, shX + len + ds * 0.7, L(f.width)));
    // end view (width × thickness)
    const endX = shX + len + ds * 2.6;
    const th = f.thickness * scale;
    parts.push(`<rect x="${endX.toFixed(2)}" y="${planY.toFixed(2)}" width="${th.toFixed(2)}" height="${tw.toFixed(2)}" fill="none" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`);
    parts.push(hdim(endX, endX + th, planY + tw + ds * 1.0, L(f.thickness)));
    return { svg: parts.join(''), height: planY + tw + ds * 2.2 - dyTop };
  }

  // Dovetail key: a flared block — root thin at the shoulder, tip thick at the
  // depth — with depth, root/tip thickness, and run dimensioned.
  const scale = Math.min((dw * 0.5) / Math.max(f.depth, 1), (ds * 4.2) / Math.max(f.tipThin, 1));
  const x0k = dx0 + ds * 1.4;
  const midY = top + ds * 2.6;
  const depthPx = f.depth * scale;
  const rootPx = f.rootThin * scale;
  const tipPx = f.tipThin * scale;
  parts.push(
    `<polygon points="${x0k.toFixed(2)},${(midY - rootPx / 2).toFixed(2)} ${(x0k + depthPx).toFixed(2)},${(midY - tipPx / 2).toFixed(2)} ${(x0k + depthPx).toFixed(2)},${(midY + tipPx / 2).toFixed(2)} ${x0k.toFixed(2)},${(midY + rootPx / 2).toFixed(2)}" fill="none" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
  );
  parts.push(hdim(x0k, x0k + depthPx, midY + Math.max(tipPx, rootPx) / 2 + ds * 1.0, `${L(f.depth)} deep`));
  parts.push(vdim(midY - rootPx / 2, midY + rootPx / 2, x0k - ds * 0.7, L(f.rootThin)));
  parts.push(vdim(midY - tipPx / 2, midY + tipPx / 2, x0k + depthPx + ds * 0.7, L(f.tipThin)));
  parts.push(txt(dx0, midY + Math.max(tipPx, rootPx) / 2 + ds * 2.0, `Run ${L(f.runH)} (slides in from the top)`, 'start'));
  return { svg: parts.join(''), height: midY + Math.max(tipPx, rootPx) / 2 + ds * 2.4 - dyTop };
}
function partDetails(
  part: { id: string; primitives: Primitive[]; cut: { note?: string } },
  joints: Record<string, string> | undefined,
  units: Units,
): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  const L = (mm: number) => formatLength(mm, units);
  if (part.cut.note) add(part.cut.note);

  // Tenons show up as boxes appended beyond the part's body; only treat them as
  // tenons when the part is actually in a mortise-tenon joint.
  const inMT = Object.entries(joints ?? {}).some(
    ([k, s]) => s === 'mortise-tenon' && k.split('|').includes(part.id),
  );
  const boxes = part.primitives.filter((p) => p.shape === 'box') as Extract<Primitive, { shape: 'box' }>[];
  let body: Extract<Primitive, { shape: 'box' }> | null = null;
  const vol = (b: Extract<Primitive, { shape: 'box' }>) => b.size[0] * b.size[1] * b.size[2];
  for (const b of boxes) if (!body || vol(b) > vol(body)) body = b;

  for (const prim of part.primitives) {
    if (prim.shape === 'roundedSlab') {
      if (prim.radius > 0.5) add(`${L(prim.radius)} corner radius`);
      if (prim.edge && prim.edge > 0.5)
        add(`${L(prim.edge)} ${prim.edgeMode === 'top' ? 'half-bullnose' : 'bullnose'} edge${prim.squareBack ? ' (square back)' : ''}`);
    } else if (prim.shape === 'roundedNotchedSlab') {
      if (prim.radius > 0.5) add(`${L(prim.radius)} corner radius`);
      add(`Notched ${L(prim.notch[0])} × ${L(prim.notch[1])} at each post`);
    } else if (prim.shape === 'mortisedPost') {
      if (prim.radius > 0.5) add(`${L(prim.radius)} corner radius`);
      const dimOf = (m: { width: number; height: number; depth: number }) =>
        `${L(m.width)} × ${L(m.height)} × ${L(m.depth)} deep`;
      const sockets = prim.mortises.filter((x) => x.openTop);
      const mortises = prim.mortises.filter((x) => !x.openTop);
      if (mortises.length) add(`${mortises.length} mortise${mortises.length > 1 ? 's' : ''}: ${dimOf(mortises[0])}`);
      if (sockets.length) add(`${sockets.length} dovetail socket${sockets.length > 1 ? 's' : ''}: ${dimOf(sockets[0])}`);
    } else if (prim.shape === 'frenchDovetail') {
      add(`Dovetail key: ${L(prim.depth)} deep × ${L(prim.runH)} long, ${L(prim.rootThin)}–${L(prim.tipThin)} thick`);
    } else if (prim.shape === 'jointedBoard') {
      add(prim.joint === 'box-joint' ? 'Box joint' : prim.lip ? 'Half-blind dovetail' : 'Through dovetail');
    } else if (prim.shape === 'taperedBox') {
      add('Tapered');
    } else if (prim.shape === 'archedBoard') {
      add(prim.arch === 'scoop' ? 'Finger-pull scoop' : 'Relief arch');
    } else if (prim.shape === 'box' && inMT && body && prim !== body) {
      // Tenon: length is along the axis it projects from the body.
      const off = [0, 1, 2].map((i) => Math.abs(prim.at[i] - body!.at[i]));
      const ax = off.indexOf(Math.max(off[0], off[1], off[2]));
      const perp = [0, 1, 2].filter((i) => i !== ax);
      add(`Tenon: ${L(prim.size[ax])} long × ${L(prim.size[perp[0]])} × ${L(prim.size[perp[1]])}`);
    }
  }
  for (const [key, style] of Object.entries(joints ?? {})) {
    if (key.split('|').includes(part.id)) add(`${JOINT_LABEL[style] ?? style} joint`);
  }
  return out;
}

/** A two-view (face + edge) drawing of one part with hidden-line removal, a
 * dimensioned outline, and a shop-note list, laid out from (x0, yTop) within
 * cellW. Returns the SVG and the vertical space it consumed. */
function renderPartCell(
  pieces: Piece[],
  name: string,
  qty: number,
  cut: { length: number; width: number; thickness: number },
  details: string[],
  features: JointFeature[],
  cornerRadius: number,
  units: Units,
  x0: number,
  yTop: number,
  cellW: number,
  sw: number,
): { svg: string; height: number } {
  const mn: V3 = [Infinity, Infinity, Infinity];
  const mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces)
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], p.min[i]);
      mx[i] = Math.max(mx[i], p.max[i]);
    }
  const ext: V3 = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  // thin = thickness (look through it for the face); long = length; mid = width.
  const thin = (ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2) as 0 | 1 | 2;
  const rest = ([0, 1, 2] as const).filter((a) => a !== thin);
  const long = (ext[rest[0]] >= ext[rest[1]] ? rest[0] : rest[1]) as 0 | 1 | 2;
  const mid = (rest[0] === long ? rest[1] : rest[0]) as 0 | 1 | 2;
  const [L, Wd, T] = [ext[long], ext[mid], ext[thin]];

  const ds = Math.max(cellW * 0.035, 3);
  const padL = ds * 2.4; // room for the width/thickness dims on the left
  const drawW = cellW - padL - ds;
  const gap = ds * 1.1;
  const scale = Math.min(drawW / Math.max(L, 1e-3), (cellW * 0.7 - gap) / Math.max(Wd + T, 1e-3));

  const labelY = yTop + ds;
  const faceTop = labelY + ds * 0.9;
  const faceBottom = faceTop + Wd * scale;
  const edgeTop = faceBottom + gap;
  const edgeBottom = edgeTop + T * scale;
  const vx0 = x0 + padL;
  const co = (x: number, y: number, z: number, axis: 0 | 1 | 2) => [x, y, z][axis];

  const projFace: Proj = (x, y, z) => [vx0 + (co(x, y, z, long) - mn[long]) * scale, faceBottom - (co(x, y, z, mid) - mn[mid]) * scale];
  const depthFace: Depth = (x, y, z) => co(x, y, z, thin);
  const projEdge: Proj = (x, y, z) => [vx0 + (co(x, y, z, long) - mn[long]) * scale, edgeBottom - (co(x, y, z, thin) - mn[thin]) * scale];
  const depthEdge: Depth = (x, y, z) => co(x, y, z, mid);

  const span = Math.max(L, Wd, T);
  const views = renderView(pieces, projFace, depthFace, sw, span) + renderView(pieces, projEdge, depthEdge, sw, span);

  const tick = ds * 0.4;
  const xR = vx0 + L * scale;
  const yLen = edgeBottom + ds * 1.2;
  const dl = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`;
  const tx = (x: number, y: number, s: string, rot = false) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${(ds * 0.82).toFixed(2)}" fill="#1b1b1b" text-anchor="middle" font-family="sans-serif"${rot ? ` transform="rotate(-90 ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}>${esc(s)}</text>`;
  const dims = [
    dl(vx0, yLen, xR, yLen),
    dl(vx0, yLen - tick, vx0, yLen + tick),
    dl(xR, yLen - tick, xR, yLen + tick),
    tx((vx0 + xR) / 2, yLen + ds * 0.9, formatLength(cut.length, units)),
    tx(x0 + ds * 0.7, (faceTop + faceBottom) / 2, formatLength(cut.width, units), true),
    tx(x0 + ds * 0.7, (edgeTop + edgeBottom) / 2, formatLength(cut.thickness, units), true),
  ];
  // Radius callout: a leader to the top-right corner (the radius is too small to
  // read at part scale, so it's labelled).
  const radius: string[] = [];
  if (cornerRadius > 0.5) {
    const lx = xR - ds * 0.9;
    const ly = faceTop + ds * 0.9;
    radius.push(
      dl(xR, faceTop, lx, ly),
      `<text x="${(lx - ds * 0.3).toFixed(2)}" y="${(ly + ds * 0.6).toFixed(2)}" font-size="${(ds * 0.82).toFixed(2)}" fill="#1b1b1b" text-anchor="end" font-family="sans-serif">R ${esc(formatLength(cornerRadius, units))}</text>`,
    );
  }
  const label = `<text x="${x0.toFixed(2)}" y="${labelY.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif" font-weight="600">${esc(qty > 1 ? `${name} ×${qty}` : name)}</text>`;
  const noteTop = yLen + ds * 1.9;
  const notes = details.map(
    (d, i) =>
      `<text x="${x0.toFixed(2)}" y="${(noteTop + i * ds * 0.95).toFixed(2)}" font-size="${(ds * 0.78).toFixed(2)}" fill="#555" font-family="sans-serif">• ${esc(d)}</text>`,
  );
  const notesBottom = details.length ? noteTop + (details.length - 1) * ds * 0.95 + ds * 0.6 : yLen + ds;
  // Dimensioned joint detail(s) to the right of the notes.
  const detailX = x0 + cellW * 0.5;
  const detailW = cellW * 0.5;
  const detailSvg: string[] = [];
  let dy = yLen + ds * 1.4;
  for (const f of features) {
    const titleY = dy + ds;
    const d = renderJointDetail(f, units, detailX, titleY, detailW, sw, ds);
    detailSvg.push(d.svg);
    dy = titleY + d.height + ds * 0.8;
  }
  const bottom = Math.max(notesBottom, features.length ? dy : 0);
  return { svg: [label, views, ...dims, ...radius, ...notes, ...detailSvg].join('\n'), height: bottom - yTop };
}

interface Drawing {
  content: string;
  width: number;
  height: number;
}

function instanceDrawing(inst: Instance, units: Units): Drawing {
  const model = evaluateInstance(inst);
  const box = modelBBox(model);
  if (!box) return { content: '', width: 0, height: 0 };
  const [minX, minY, minZ] = box.min;
  const [maxX, maxY, maxZ] = box.max;
  const W = maxX - minX;
  const D = maxY - minY;
  const H = maxZ - minZ;

  const span = Math.max(W, D, H);
  const gap = span * 0.22;
  const sw = Math.max(span * 0.0025, 0.5);
  const ts = Math.max(span * 0.03, 4);
  const ds = ts * 0.7;
  const dimOff = span * 0.13;
  const margin = span * 0.1;

  const xFrontLeft = margin + dimOff * 1.4;
  const topTop = margin;
  const frontTop = topTop + D + gap;
  const frontBottom = frontTop + H;
  const rightLeft = xFrontLeft + W + gap;

  // Per-view projection (model mm → SVG) and depth (larger = nearer viewer).
  const front: Proj = (x, _y, z) => [xFrontLeft + (x - minX), frontBottom - (z - minZ)];
  const frontD: Depth = (_x, y) => y;
  const top: Proj = (x, y) => [xFrontLeft + (x - minX), topTop + (y - minY)];
  const topD: Depth = (_x, _y, z) => z;
  const right: Proj = (_x, y, z) => [rightLeft + (maxY - y), frontBottom - (z - minZ)];
  const rightD: Depth = (x) => x;

  const pieces = collectPieces(inst);
  const views = [
    renderView(pieces, front, frontD, sw, span),
    renderView(pieces, top, topD, sw, span),
    renderView(pieces, right, rightD, sw, span),
  ].join('\n');

  // Overall dimension lines with end ticks.
  const tick = ds * 0.5;
  const dims: string[] = [];
  const lab = (x: number, y: number, label: string, vertical = false) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" text-anchor="middle" font-family="sans-serif"${vertical ? ` transform="rotate(-90 ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}>${esc(label)}</text>`;
  const dl = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`;
  const yW = frontBottom + dimOff;
  dims.push(dl(front(minX, 0, minZ)[0], yW, front(maxX, 0, minZ)[0], yW));
  dims.push(dl(front(minX, 0, minZ)[0], yW - tick, front(minX, 0, minZ)[0], yW + tick));
  dims.push(dl(front(maxX, 0, minZ)[0], yW - tick, front(maxX, 0, minZ)[0], yW + tick));
  dims.push(lab((xFrontLeft + xFrontLeft + W) / 2, yW - tick, formatLength(W, units)));
  const xH = xFrontLeft - dimOff;
  dims.push(dl(xH, frontBottom, xH, frontTop));
  dims.push(dl(xH - tick, frontBottom, xH + tick, frontBottom));
  dims.push(dl(xH - tick, frontTop, xH + tick, frontTop));
  dims.push(lab(xH - tick, (frontTop + frontBottom) / 2, formatLength(H, units), true));
  dims.push(dl(rightLeft, yW, rightLeft + D, yW));
  dims.push(dl(rightLeft, yW - tick, rightLeft, yW + tick));
  dims.push(dl(rightLeft + D, yW - tick, rightLeft + D, yW + tick));
  dims.push(lab(rightLeft + D / 2, yW - tick, formatLength(D, units)));

  const viewLabel = (x: number, y: number, t: string) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#888" text-anchor="middle" font-family="sans-serif">${t}</text>`;
  const labels = [
    viewLabel(xFrontLeft + W / 2, yW + ds * 1.6, 'FRONT'),
    viewLabel(xFrontLeft + W / 2, topTop - ds * 0.6, 'TOP'),
    viewLabel(rightLeft + D / 2, yW + ds * 1.6, 'RIGHT'),
  ];

  // Cut list (bill of materials): every part aggregated by stock size and
  // material, with quantities, dimensions and shop notes — the rest of what a
  // shop needs to build the piece beyond the elevations.
  const rows = buildCutList({ schema: 1, name: inst.name, units: 'imperial', instances: [inst] })[0]?.rows ?? [];
  const partTotal = rows.reduce((s, r) => s + r.qty, 0);
  const bdft = rows.reduce((s, r) => s + boardFeet(r), 0);
  const matNames = [...new Set(rows.map((r) => MATERIAL_BY_ID[r.material]?.name ?? r.material))];

  const contentRight = rightLeft + D;
  const titleY = frontBottom + dimOff + ds * 3;
  const today = new Date().toISOString().slice(0, 10);
  // MEJA logo plate at the top-right of the title block; brand text stacks
  // beneath it, right-aligned.
  const logoH = ts * 2.0;
  const logoW = logoH * (LOGO_W / LOGO_H);
  const logoX = contentRight - logoW;
  const logoY = titleY + ts * 0.4;
  const brandTop = logoY + logoH + ds * 1.1;
  const title = [
    `<line x1="${margin.toFixed(2)}" y1="${titleY.toFixed(2)}" x2="${contentRight.toFixed(2)}" y2="${titleY.toFixed(2)}" stroke="#1b1b1b" stroke-width="${(sw * 1.5).toFixed(3)}"/>`,
    `<text x="${margin.toFixed(2)}" y="${(titleY + ts * 1.3).toFixed(2)}" font-size="${ts.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif" font-weight="600">${esc(inst.name)}</text>`,
    `<text x="${margin.toFixed(2)}" y="${(titleY + ts * 2.6).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif">${esc(`${formatLength(W, units)} W × ${formatLength(D, units)} D × ${formatLength(H, units)} H`)}</text>`,
    `<text x="${margin.toFixed(2)}" y="${(titleY + ts * 3.7).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif">${esc(`${partTotal} parts · ${bdft.toFixed(1)} bd ft · ${matNames.join(', ') || '—'}`)}</text>`,
    `<use href="#meja-logo" xlink:href="#meja-logo" x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}"/>`,
    `<text x="${contentRight.toFixed(2)}" y="${brandTop.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" text-anchor="end" font-family="sans-serif">mejadesigns.com</text>`,
    `<text x="${contentRight.toFixed(2)}" y="${(brandTop + ds * 1.1).toFixed(2)}" font-size="${(ds * 0.85).toFixed(2)}" fill="#666" text-anchor="end" font-family="sans-serif">${esc(`Third-angle · NTS · ${today}`)}</text>`,
    `<text x="${contentRight.toFixed(2)}" y="${(brandTop + ds * 2.2).toFixed(2)}" font-size="${(ds * 0.85).toFixed(2)}" fill="#999" text-anchor="end" font-family="sans-serif">Proprietary drawing — not for distribution</text>`,
  ];

  // Cut-list table, headed and ruled, below the title block (clear of the
  // logo plate, which is the tallest element on the right).
  const tableTop = Math.max(titleY + ts * 4.6, brandTop + ds * 2.9);
  const rowH = ds * 1.7;
  const tableW = contentRight - margin;
  const cx = [0.0, 0.08, 0.42, 0.64, 0.86].map((f) => margin + f * tableW);
  const rule = (y: number, weight = sw) =>
    `<line x1="${margin.toFixed(2)}" y1="${y.toFixed(2)}" x2="${contentRight.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#1b1b1b" stroke-width="${weight.toFixed(3)}"/>`;
  const cell = (x: number, y: number, t: string, bold = false, end = false) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif"${bold ? ' font-weight="600"' : ''}${end ? ' text-anchor="end"' : ''}>${esc(t)}</text>`;
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const table: string[] = [rule(tableTop, sw * 1.5)];
  const hy = tableTop + rowH * 0.85;
  table.push(cell(cx[0], hy, 'QTY', true));
  table.push(cell(cx[1], hy, 'PART', true));
  table.push(cell(cx[2], hy, 'MATERIAL', true));
  table.push(cell(cx[3], hy, 'L × W × T', true));
  table.push(cell(cx[4], hy, 'NOTES', true));
  table.push(rule(tableTop + rowH));
  rows.forEach((r, i) => {
    const y = tableTop + rowH * (i + 1) + rowH * 0.7;
    const dimStr = `${formatLength(r.length, units)} × ${formatLength(r.width, units)} × ${formatLength(r.thickness, units)}`;
    table.push(cell(cx[0], y, `${r.qty}`));
    table.push(cell(cx[1], y, clip(r.part, 28)));
    table.push(cell(cx[2], y, clip(MATERIAL_BY_ID[r.material]?.name ?? r.material, 20)));
    table.push(cell(cx[3], y, dimStr));
    table.push(cell(cx[4], y, clip(r.note ?? '', 22)));
  });
  const tableBottom = tableTop + rowH * (rows.length + 1);
  table.push(rule(tableBottom, sw * 1.5));

  // Part drawings: a dimensioned face + edge view of every unique part, in a
  // grid below the cut list. One representative part per cut-list row.
  const partDefs: { row: (typeof rows)[number]; part: (typeof model.parts)[number] }[] = [];
  for (const r of rows) {
    const part = model.parts.find((p) => p.id === r.partIds[0]);
    if (part) partDefs.push({ row: r, part });
  }
  const parts: string[] = [];
  let partsBottom = tableBottom;
  if (partDefs.length > 0) {
    const headerY = tableBottom + ds * 2.2;
    parts.push(
      `<text x="${margin.toFixed(2)}" y="${headerY.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif" font-weight="600">PART DRAWINGS</text>`,
    );
    // Two columns keep the part views large and readable.
    const gridW = contentRight - margin;
    const cols = Math.max(1, Math.min(2, Math.floor(gridW / (span * 0.7))));
    const cellW = gridW / cols;
    let gy = headerY + ds * 1.4;
    let rowMaxH = 0;
    partDefs.forEach((d, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) {
        gy += rowMaxH + ds * 2;
        rowMaxH = 0;
      }
      const inMT = Object.entries(inst.joints ?? {}).some(
        ([k, s]) => s === 'mortise-tenon' && k.split('|').includes(d.part.id),
      );
      const c = renderPartCell(
        collectPartPieces(d.part.primitives),
        d.part.name,
        d.row.qty,
        { length: d.row.length, width: d.row.width, thickness: d.row.thickness },
        partDetails(d.part, inst.joints, units),
        partJointFeatures(d.part, inMT),
        partCornerRadius(d.part),
        units,
        margin + col * cellW,
        gy,
        cellW - ds * 1.5,
        sw,
      );
      parts.push(c.svg);
      rowMaxH = Math.max(rowMaxH, c.height);
    });
    partsBottom = gy + rowMaxH;
  }

  return {
    content: [views, ...dims, ...labels, ...title, ...table, ...parts].join('\n'),
    width: contentRight + margin,
    height: partsBottom + margin,
  };
}

function wrap(content: string, width: number, height: number): string {
  // The MEJA logo is defined once as a scalable symbol; each drawing places it
  // with <use>, so the base64 image appears a single time per document.
  const defs = `<defs><symbol id="meja-logo" viewBox="0 0 ${LOGO_W} ${LOGO_H}"><image width="${LOGO_W}" height="${LOGO_H}" href="${mejaLogo}" xlink:href="${mejaLogo}"/></symbol></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}">${defs}<rect width="100%" height="100%" fill="#ffffff"/>${content}</svg>`;
}

export function instanceShopDrawingSVG(inst: Instance, units: Units): string {
  const d = instanceDrawing(inst, units);
  return wrap(d.content, d.width, d.height);
}

export function shopDrawingsSVG(doc: ProjectDoc, units: Units): string {
  let y = 0;
  let maxW = 0;
  const blocks: string[] = [];
  for (const inst of doc.instances) {
    const d = instanceDrawing(inst, units);
    if (d.width === 0) continue;
    blocks.push(`<g transform="translate(0 ${y.toFixed(2)})">${d.content}</g>`);
    y += d.height * 1.08;
    maxW = Math.max(maxW, d.width);
  }
  return wrap(blocks.join('\n'), maxW, Math.max(y, 1));
}
