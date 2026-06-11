// Branded export: stamps studio snapshots with the MEJA plate — logo,
// mejadesigns.com, and the proprietary-drawing disclaimer — centered at the
// bottom of the print viewport. Metrics are designed at 4K and scale with
// the output size.

import logoUrl from '../assets/meja-logo.png';

const SITE = 'mejadesigns.com';
const DISCLAIMER = 'Proprietary drawing — not for distribution';
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

let logoPromise: Promise<HTMLImageElement | null> | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
  return logoPromise;
}

export async function brandSnapshot(blob: Blob, mimeType = 'image/png'): Promise<Blob> {
  const [image, logo] = await Promise.all([createImageBitmap(blob), loadLogo()]);
  const W = image.width;
  const H = image.height;
  const s = W / 3840;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  ctx.drawImage(image, 0, 0);

  // Plate metrics
  const logoH = 200 * s;
  const logoW = logo ? (logo.width / logo.height) * logoH : 0;
  const gap = logo ? 48 * s : 0;
  const siteSize = 58 * s;
  const noteSize = 34 * s;
  const pad = 40 * s;

  ctx.font = `600 ${siteSize}px ${FONT}`;
  const siteW = ctx.measureText(SITE).width;
  ctx.font = `400 ${noteSize}px ${FONT}`;
  const noteW = ctx.measureText(DISCLAIMER).width;
  const textW = Math.max(siteW, noteW);
  const innerW = logoW + gap + textW;
  const innerH = Math.max(logoH, siteSize + noteSize + 22 * s);

  const plateW = innerW + 2 * pad;
  const plateH = innerH + 2 * pad;
  const plateX = W - plateW - 56 * s; // upper-right corner of the print viewport
  const plateY = 56 * s;

  // Light plate reads on any render background, and suits the engraved logo.
  ctx.save();
  ctx.fillStyle = 'rgba(250, 249, 246, 0.92)';
  ctx.strokeStyle = 'rgba(43, 39, 34, 0.25)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.roundRect(plateX, plateY, plateW, plateH, 16 * s);
  ctx.fill();
  ctx.stroke();

  let x = plateX + pad;
  if (logo) {
    ctx.drawImage(logo, x, plateY + (plateH - logoH) / 2, logoW, logoH);
    x += logoW + gap;
  }
  const textMidY = plateY + plateH / 2;
  ctx.fillStyle = '#2b2722';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${siteSize}px ${FONT}`;
  ctx.fillText(SITE, x, textMidY - 12 * s);
  ctx.fillStyle = '#6e675c';
  ctx.font = `400 ${noteSize}px ${FONT}`;
  ctx.fillText(DISCLAIMER, x, textMidY + noteSize + 10 * s);
  ctx.restore();

  return new Promise((resolve) =>
    canvas.toBlob((out) => resolve(out ?? blob), mimeType, 0.95),
  );
}
