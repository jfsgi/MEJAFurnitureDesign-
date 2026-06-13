// Documents workspace: live cut list & BOM, stock breakdown with sheet nesting.
// Drawings and CNC exports arrive in Phase 2.

import { useState } from 'react';
import { boardFeet, buildCutList, cutListCSV, totalBoardFeet } from '../core/cutlist';
import { SHEET_L, SHEET_W, buildStockBreakdown, type SheetLayout } from '../core/stock';
import { MATERIAL_BY_ID } from '../core/materials';
import { formatLength, formatLengthBare } from '../core/units';
import { useStore } from '../core/store';
import { exportModel, type ModelFormat } from '../studio/exportModel';
import { instanceShopDrawingSVG, shopDrawingsSVG } from '../studio/shopDrawing';
import { quoteApiConfigured, sendQuote } from '../studio/quoteApi';
import { quotePayloadJSON } from '../core/quote';
import { DownloadIcon, WarningIcon } from './icons';

function SheetDiagram({ layout, index, units }: { layout: SheetLayout; index: number; units: 'imperial' | 'metric' }) {
  const matName = MATERIAL_BY_ID[layout.material]?.name ?? layout.material;
  const fill = MATERIAL_BY_ID[layout.material]?.color ?? '#D9CFBA';
  return (
    <figure className="stock-sheet">
      <figcaption className="stock-sheet-caption">
        Sheet {index + 1} — {matName} {formatLength(layout.thickness, units)} ·{' '}
        {Math.round(layout.usedFraction * 100)}% used
      </figcaption>
      <svg
        className="stock-sheet-svg"
        viewBox={`-10 -10 ${SHEET_L + 20} ${SHEET_W + 20}`}
        role="img"
        aria-label={`Cutting layout for sheet ${index + 1}`}
      >
        <rect x={0} y={0} width={SHEET_L} height={SHEET_W} className="stock-sheet-stock" />
        {layout.placements.map((pl, i) => (
          <g key={i}>
            <rect x={pl.x} y={pl.y} width={pl.w} height={pl.h} fill={fill} className="stock-part" />
            {pl.w > 220 && pl.h > 90 && (
              <text x={pl.x + pl.w / 2} y={pl.y + pl.h / 2} className="stock-part-label">
                {pl.part.name}
                {pl.h > 170 && (
                  <tspan x={pl.x + pl.w / 2} dy={56}>
                    {formatLengthBare(pl.part.length, units)} × {formatLengthBare(pl.part.width, units)}
                  </tspan>
                )}
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function DocumentsView() {
  const doc = useStore((s) => s.doc);
  const [page, setPage] = useState<'cutlist' | 'stock' | 'drawings'>('cutlist');
  const groups = buildCutList(doc);
  const units = doc.units;
  const unitMark = units === 'imperial' ? 'inches' : 'mm';
  const dim = (mm: number) => formatLengthBare(mm, units);

  const download = (blob: Blob, suffix: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name.replace(/[^\w.-]+/g, '-')}-${suffix}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCSV = () => download(new Blob([cutListCSV(doc, units)], { type: 'text/csv' }), 'cutlist.csv');

  const exportDrawings = () => {
    if (doc.instances.length === 0) {
      useStore.getState().showToast('Nothing to draw — add a piece first.');
      return;
    }
    download(new Blob([shopDrawingsSVG(doc, units)], { type: 'image/svg+xml' }), 'shop-drawings.svg');
  };

  const export3D = (format: ModelFormat) => {
    if (doc.instances.length === 0) {
      useStore.getState().showToast('Nothing to export — add a piece first.');
      return;
    }
    download(exportModel(doc, format), `model.${format}`);
    useStore.getState().showToast(`${format.toUpperCase()} exported (millimeters, Z-up)`);
  };

  // Quote export: each piece is sent as a product with its child parts. POSTs
  // to the configured quoting API, or downloads the JSON when none is set.
  const exportQuote = async () => {
    const toast = useStore.getState().showToast;
    if (doc.instances.length === 0) {
      toast('Nothing to quote — add a piece first.');
      return;
    }
    if (!quoteApiConfigured()) {
      download(new Blob([quotePayloadJSON(doc)], { type: 'application/json' }), 'quote.json');
      toast('No quote API configured — downloaded the quote JSON instead.');
      return;
    }
    toast('Sending quote to the quoting system…');
    const result = await sendQuote(doc);
    toast(result.message);
  };

  const stock = page === 'stock' ? buildStockBreakdown(doc) : null;

  return (
    <div className="documents">
      <aside className="panel panel--left">
        <div className="panel-tabs">
          <span className="panel-title">Documents</span>
        </div>
        <div className="panel-scroll">
          <button
            className={`doc-item${page === 'cutlist' ? ' doc-item--active' : ''}`}
            onClick={() => setPage('cutlist')}
          >
            Cut list &amp; BOM
          </button>
          <button
            className={`doc-item${page === 'stock' ? ' doc-item--active' : ''}`}
            onClick={() => setPage('stock')}
          >
            Stock breakdown
          </button>
          <button
            className={`doc-item${page === 'drawings' ? ' doc-item--active' : ''}`}
            onClick={() => setPage('drawings')}
          >
            Shop drawings
          </button>
          <button className="doc-item" disabled title="3D export (STL / OBJ) lives on the cut list page; DXF / STEP arrive in Phase 2">
            DXF / STEP export
          </button>
        </div>
      </aside>

      <main className="documents-main">
        {page === 'cutlist' && (
          <div className="sheet">
            <div className="sheet-header">
              <div>
                <h1 className="sheet-title">Cut list</h1>
                <div className="sheet-sub">
                  {doc.name} · regenerated live from the model · dimensions in {unitMark}
                </div>
              </div>
              <div className="sheet-actions">
                <button className="btn" onClick={exportCSV}>
                  <DownloadIcon /> Export CSV
                </button>
                <button className="btn" onClick={() => export3D('stl')} title="3D mesh for CAM / 3D printing">
                  <DownloadIcon /> Export STL
                </button>
                <button className="btn" onClick={() => export3D('obj')} title="3D model with per-part names">
                  <DownloadIcon /> Export OBJ
                </button>
                <button
                  className="btn"
                  onClick={exportQuote}
                  title="Send each piece to the quoting system as a product with its child parts"
                >
                  <DownloadIcon /> Send to quote
                </button>
              </div>
            </div>

            {groups.length === 0 && (
              <div className="empty-state">
                <p>No parts yet.</p>
                <p className="empty-hint">Add components in the Design workspace first.</p>
              </div>
            )}

            {groups.map((group) => (
              <section key={group.instance.id} className="sheet-section">
                <h2 className="sheet-section-title">{group.instance.name}</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th className="num">Qty</th>
                      <th className="num">Length</th>
                      <th className="num">Width</th>
                      <th className="num">Thickness</th>
                      <th>Material</th>
                      <th className="num">Bd ft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.part}</td>
                        <td className="num">{row.qty}</td>
                        <td className="num">{dim(row.length)}</td>
                        <td className="num">{dim(row.width)}</td>
                        <td className="num">{dim(row.thickness)}</td>
                        <td>{MATERIAL_BY_ID[row.material]?.name ?? row.material}</td>
                        <td className="num">{boardFeet(row).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            {groups.length > 0 && (
              <div className="sheet-total">
                Total lumber: <b>{totalBoardFeet(groups).toFixed(1)} board feet</b>
              </div>
            )}
          </div>
        )}

        {page === 'stock' && stock && (
          <div className="sheet">
            <div className="sheet-header">
              <div>
                <h1 className="sheet-title">Stock breakdown</h1>
                <div className="sheet-sub">
                  {doc.name} · sheet goods nested on 4×8 sheets with ⅛″ kerf · lumber with 15%
                  milling allowance
                </div>
              </div>
            </div>

            {stock.lumber.length === 0 && stock.sheets.length === 0 && (
              <div className="empty-state">
                <p>No parts yet.</p>
                <p className="empty-hint">Add components in the Design workspace first.</p>
              </div>
            )}

            {stock.unplaced.length > 0 && (
              <div className="check-warning">
                <WarningIcon />
                <span>
                  {stock.unplaced.length} part{stock.unplaced.length === 1 ? '' : 's'} exceed a 4×8
                  sheet and need special stock: {stock.unplaced.map((p) => p.name).join(', ')}.
                </span>
              </div>
            )}

            {stock.lumber.length > 0 && (
              <section className="sheet-section">
                <h2 className="sheet-section-title">Solid lumber</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th className="num">Thickness</th>
                      <th className="num">In parts</th>
                      <th className="num">Buy (≈15% waste)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.lumber.map((line, i) => (
                      <tr key={i}>
                        <td>{MATERIAL_BY_ID[line.material]?.name ?? line.material}</td>
                        <td className="num">{dim(line.thickness)}</td>
                        <td className="num">{line.boardFeet.toFixed(1)} bd ft</td>
                        <td className="num">
                          <b>{line.buyBoardFeet.toFixed(1)} bd ft</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {stock.sheets.length > 0 && (
              <section className="sheet-section">
                <h2 className="sheet-section-title">
                  Sheet goods — {stock.sheets.length} sheet{stock.sheets.length === 1 ? '' : 's'}
                </h2>
                {stock.sheets.map((layout, i) => (
                  <SheetDiagram key={i} layout={layout} index={i} units={units} />
                ))}
              </section>
            )}
          </div>
        )}

        {page === 'drawings' && (
          <div className="sheet">
            <div className="sheet-header">
              <div>
                <h1 className="sheet-title">Shop drawings</h1>
                <div className="sheet-sub">
                  {doc.name} · third-angle elevations with overall dimensions · {unitMark}
                </div>
              </div>
              <div className="sheet-actions">
                <button className="btn" onClick={exportDrawings}>
                  <DownloadIcon /> Export SVG
                </button>
                <button className="btn" onClick={() => window.print()}>Print</button>
              </div>
            </div>
            {doc.instances.length === 0 ? (
              <p className="sheet-empty">Add a piece to the design to generate its shop drawing.</p>
            ) : (
              doc.instances.map((inst) => (
                <figure key={inst.id} className="shop-drawing">
                  <div
                    className="shop-drawing-svg"
                    // SVG is generated from the model; no user HTML is injected.
                    dangerouslySetInnerHTML={{ __html: instanceShopDrawingSVG(inst, units) }}
                  />
                </figure>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
