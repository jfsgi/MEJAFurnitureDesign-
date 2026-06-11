// Documents workspace: live cut list & BOM. Drawings and CNC exports arrive in Phase 2.

import { boardFeet, buildCutList, cutListCSV, totalBoardFeet } from '../core/cutlist';
import { MATERIAL_BY_ID } from '../core/materials';
import { formatLengthBare } from '../core/units';
import { useStore } from '../core/store';
import { DownloadIcon } from './icons';

export function DocumentsView() {
  const doc = useStore((s) => s.doc);
  const groups = buildCutList(doc);
  const units = doc.units;
  const unitMark = units === 'imperial' ? 'inches' : 'mm';
  const dim = (mm: number) => formatLengthBare(mm, units);

  const exportCSV = () => {
    const blob = new Blob([cutListCSV(doc, units)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name.replace(/[^\w.-]+/g, '-')}-cutlist.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="documents">
      <aside className="panel panel--left">
        <div className="panel-tabs">
          <span className="panel-title">Documents</span>
        </div>
        <div className="panel-scroll">
          <button className="doc-item doc-item--active">Cut list &amp; BOM</button>
          <button className="doc-item" disabled title="Arrives in Phase 2">
            Assembly drawings
          </button>
          <button className="doc-item" disabled title="Arrives in Phase 2">
            DXF / STEP export
          </button>
        </div>
      </aside>

      <main className="documents-main">
        <div className="sheet">
          <div className="sheet-header">
            <div>
              <h1 className="sheet-title">Cut list</h1>
              <div className="sheet-sub">
                {doc.name} · regenerated live from the model · dimensions in {unitMark}
              </div>
            </div>
            <button className="btn" onClick={exportCSV}>
              <DownloadIcon /> Export CSV
            </button>
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
      </main>
    </div>
  );
}
