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

/** Shop notes for a part: joinery, corner radii, edge treatments, and other
 * machining a maker needs beyond the stock size. Read off the real primitives
 * plus the instance's joint assignments. */
function partDetails(
  part: { id: string; primitives: Primitive[]; cut: { note?: string } },
  joints: Record<string, string> | undefined,
  units: Units,
): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  if (part.cut.note) add(part.cut.note);
  for (const prim of part.primitives) {
    if (prim.shape === 'roundedSlab') {
      if (prim.radius > 0.5) add(`${formatLength(prim.radius, units)} corner radius`);
      if (prim.edge && prim.edge > 0.5)
        add(`${formatLength(prim.edge, units)} ${prim.edgeMode === 'top' ? 'half-bullnose' : 'bullnose'} edge${prim.squareBack ? ' (square back)' : ''}`);
    } else if (prim.shape === 'roundedNotchedSlab') {
      if (prim.radius > 0.5) add(`${formatLength(prim.radius, units)} corner radius`);
      add('Notched at the posts');
    } else if (prim.shape === 'mortisedPost') {
      if (prim.radius > 0.5) add(`${formatLength(prim.radius, units)} corner radius`);
      const open = prim.mortises.some((m) => m.openTop);
      const n = prim.mortises.length;
      if (n) add(`${n} ${open ? 'sliding-dovetail socket' : 'mortise'}${n > 1 ? 's' : ''}`);
    } else if (prim.shape === 'frenchDovetail') {
      add('French dovetail key (slides in from the top)');
    } else if (prim.shape === 'jointedBoard') {
      add(prim.joint === 'box-joint' ? 'Box joint' : prim.lip ? 'Half-blind dovetail' : 'Through dovetail');
    } else if (prim.shape === 'taperedBox') {
      add('Tapered');
    } else if (prim.shape === 'archedBoard') {
      add(prim.arch === 'scoop' ? 'Finger-pull scoop' : 'Relief arch');
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
  const label = `<text x="${x0.toFixed(2)}" y="${labelY.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif" font-weight="600">${esc(qty > 1 ? `${name} ×${qty}` : name)}</text>`;
  const noteTop = yLen + ds * 1.9;
  const notes = details.map(
    (d, i) =>
      `<text x="${x0.toFixed(2)}" y="${(noteTop + i * ds * 0.95).toFixed(2)}" font-size="${(ds * 0.78).toFixed(2)}" fill="#555" font-family="sans-serif">• ${esc(d)}</text>`,
  );
  const bottom = details.length ? noteTop + (details.length - 1) * ds * 0.95 + ds * 0.6 : yLen + ds;
  return { svg: [label, views, ...dims, ...notes].join('\n'), height: bottom - yTop };
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
      const c = renderPartCell(
        collectPartPieces(d.part.primitives),
        d.part.name,
        d.row.qty,
        { length: d.row.length, width: d.row.width, thickness: d.row.thickness },
        partDetails(d.part, inst.joints, units),
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
