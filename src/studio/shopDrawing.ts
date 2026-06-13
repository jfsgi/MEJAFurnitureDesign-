// Shop drawings: dimensioned third-angle orthographic elevations (Front,
// Top, Right) of each piece, as print-ready SVG. Built from the evaluated
// model — every part projects to a bounding rectangle in each view, the
// classic woodworking elevation. Overall dimensions and a MEJA title block
// frame the sheet. Model space is Z-up, mm; SVG is y-down (flipped at emit).

import type { Instance, ProjectDoc, Units } from '../core/types';
import { evaluateInstance, modelBBox, partBBox } from '../core/evaluate';
import { formatLength } from '../core/units';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

interface Drawing {
  content: string;
  width: number;
  height: number;
}

/** One piece's three-view drawing as SVG content (no <svg> wrapper), in its
 * own mm coordinate space starting at the origin. */
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
  const gap = span * 0.22; // between views
  const sw = Math.max(span * 0.0025, 0.5); // stroke width
  const ts = Math.max(span * 0.03, 4); // title text size
  const ds = ts * 0.7; // dimension text size
  const dimOff = span * 0.13; // dimension line standoff
  const margin = span * 0.1;

  // View origins in SVG space (y-down).
  const xFrontLeft = margin + dimOff * 1.4; // room for the H dimension on the left
  const topTop = margin;
  const frontTop = topTop + D + gap;
  const frontBottom = frontTop + H;
  const rightLeft = xFrontLeft + W + gap;

  // 3D → SVG projections per view.
  const fX = (x: number) => xFrontLeft + (x - minX);
  const fY = (z: number) => frontBottom - (z - minZ);
  const tY = (y: number) => topTop + (y - minY);
  const rX = (y: number) => rightLeft + (maxY - y);

  const parts: string[] = [];
  const rect = (x0: number, y0: number, x1: number, y1: number) =>
    `<rect x="${Math.min(x0, x1).toFixed(2)}" y="${Math.min(y0, y1).toFixed(2)}" width="${Math.abs(x1 - x0).toFixed(2)}" height="${Math.abs(y1 - y0).toFixed(2)}" fill="none" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`;

  for (const part of model.parts) {
    const b = partBBox(part);
    if (!b) continue;
    parts.push(rect(fX(b.min[0]), fY(b.min[2]), fX(b.max[0]), fY(b.max[2]))); // front
    parts.push(rect(fX(b.min[0]), tY(b.min[1]), fX(b.max[0]), tY(b.max[1]))); // top
    parts.push(rect(rX(b.min[1]), fY(b.min[2]), rX(b.max[1]), fY(b.max[2]))); // right
  }

  // Dimension lines: extension lines, a line with end ticks, and a label.
  const dims: string[] = [];
  const tick = ds * 0.5;
  const dimText = (x: number, y: number, label: string, vertical = false) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" text-anchor="middle" font-family="sans-serif"${vertical ? ` transform="rotate(-90 ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}>${esc(label)}</text>`;
  const hDim = (x0: number, x1: number, y: number, label: string) => {
    dims.push(
      `<line x1="${x0.toFixed(2)}" y1="${y.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
      `<line x1="${x0.toFixed(2)}" y1="${(y - tick).toFixed(2)}" x2="${x0.toFixed(2)}" y2="${(y + tick).toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
      `<line x1="${x1.toFixed(2)}" y1="${(y - tick).toFixed(2)}" x2="${x1.toFixed(2)}" y2="${(y + tick).toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
      dimText((x0 + x1) / 2, y - tick, label),
    );
  };
  const vDim = (y0: number, y1: number, x: number, label: string) => {
    dims.push(
      `<line x1="${x.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
      `<line x1="${(x - tick).toFixed(2)}" y1="${y0.toFixed(2)}" x2="${(x + tick).toFixed(2)}" y2="${y0.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
      `<line x1="${(x - tick).toFixed(2)}" y1="${y1.toFixed(2)}" x2="${(x + tick).toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#1b1b1b" stroke-width="${sw.toFixed(3)}"/>`,
      dimText(x - tick, (y0 + y1) / 2, label, true),
    );
  };
  hDim(fX(minX), fX(maxX), frontBottom + dimOff, formatLength(W, units)); // width under front
  vDim(fY(minZ), fY(maxZ), xFrontLeft - dimOff, formatLength(H, units)); // height left of front
  hDim(rightLeft, rightLeft + D, frontBottom + dimOff, formatLength(D, units)); // depth under right

  // View labels.
  const labels = [
    `<text x="${(xFrontLeft + W / 2).toFixed(2)}" y="${(frontBottom + dimOff + ds * 1.6).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#666" text-anchor="middle" font-family="sans-serif">FRONT</text>`,
    `<text x="${(xFrontLeft + W / 2).toFixed(2)}" y="${(topTop - ds * 0.6).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#666" text-anchor="middle" font-family="sans-serif">TOP</text>`,
    `<text x="${(rightLeft + D / 2).toFixed(2)}" y="${(frontBottom + dimOff + ds * 1.6).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#666" text-anchor="middle" font-family="sans-serif">RIGHT</text>`,
  ];

  // Title block across the bottom.
  const contentRight = rightLeft + D;
  const titleY = frontBottom + dimOff + ds * 3;
  const blockW = contentRight - margin;
  const title = [
    `<line x1="${margin.toFixed(2)}" y1="${titleY.toFixed(2)}" x2="${contentRight.toFixed(2)}" y2="${titleY.toFixed(2)}" stroke="#1b1b1b" stroke-width="${(sw * 1.5).toFixed(3)}"/>`,
    `<text x="${margin.toFixed(2)}" y="${(titleY + ts * 1.3).toFixed(2)}" font-size="${ts.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif" font-weight="600">${esc(inst.name)}</text>`,
    `<text x="${margin.toFixed(2)}" y="${(titleY + ts * 2.6).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" font-family="sans-serif">${esc(`${formatLength(W, units)} W × ${formatLength(D, units)} D × ${formatLength(H, units)} H`)}</text>`,
    `<text x="${contentRight.toFixed(2)}" y="${(titleY + ts * 1.3).toFixed(2)}" font-size="${ds.toFixed(2)}" fill="#1b1b1b" text-anchor="end" font-family="sans-serif">MEJA Designs · mejadesigns.com</text>`,
    `<text x="${contentRight.toFixed(2)}" y="${(titleY + ts * 2.6).toFixed(2)}" font-size="${(ds * 0.85).toFixed(2)}" fill="#999" text-anchor="end" font-family="sans-serif">Proprietary drawing — not for distribution</text>`,
  ];
  void blockW;

  const width = contentRight + margin;
  const height = titleY + ts * 3.4;
  return { content: [...parts, ...dims, ...labels, ...title].join('\n'), width, height };
}

function wrap(content: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}"><rect width="100%" height="100%" fill="#ffffff"/>${content}</svg>`;
}

/** A standalone SVG sheet for one piece (for inline display). */
export function instanceShopDrawingSVG(inst: Instance, units: Units): string {
  const d = instanceDrawing(inst, units);
  return wrap(d.content, d.width, d.height);
}

/** One SVG file with every piece's sheet stacked vertically (for export). */
export function shopDrawingsSVG(doc: ProjectDoc, units: Units): string {
  let y = 0;
  let maxW = 0;
  const blocks: string[] = [];
  for (const inst of doc.instances) {
    const d = instanceDrawing(inst, units);
    if (d.width === 0) continue;
    blocks.push(`<g transform="translate(0 ${y.toFixed(2)})">${d.content}</g>`);
    y += d.height + d.height * 0.08;
    maxW = Math.max(maxW, d.width);
  }
  return wrap(blocks.join('\n'), maxW, Math.max(y, 1));
}
