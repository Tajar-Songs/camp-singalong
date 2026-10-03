// lib/reports.js
//
// Shared pieces for Tajar Tracks (pages/insights.js) and the report builder
// (pages/reports.js). Every report runs through the database function
// run_report(), which checks the field registry and the viewer's own access -
// nothing here decides what someone is allowed to see.

export const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Personal tier leads blue (style guide: ownership tiers).
export const PERSONAL_TEXT = '#6882B6';
export const PERSONAL_FILL = '#5371AC';
export const GREY_TEXT = '#838C95';
export const DANGER_TEXT = '#D45D25';

export const authHeaders = (includeContentType = true) => {
  const token = (typeof window !== 'undefined' && localStorage.getItem('supabase_access_token')) || SUPABASE_KEY;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  return headers;
};

// Reads a failed response's message, so errors can say why.
export async function errorDetail(res) {
  try {
    const body = await res.json();
    return body?.message || body?.error || `the database returned ${res.status}`;
  } catch (e) {
    return `the database returned ${res.status}`;
  }
}

export async function getJson(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders(false), cache: 'no-store' });
  if (!res.ok) throw new Error(await errorDetail(res));
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Writes and checks that something was actually written.
export async function writeJson(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...authHeaders(), Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  const rows = await res.json().catch(() => []);
  if (method !== 'DELETE' && (!Array.isArray(rows) || rows.length === 0)) {
    throw new Error('nothing was saved - try reloading, or logging out and back in');
  }
  return rows;
}

export async function runReport(datasetKey, definition) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_report`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ p_dataset: datasetKey, p_definition: definition })
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

const isTimestamp = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function formatCell(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isTimestamp(v)) return new Date(v).toLocaleString();
  if (isDate(v)) return new Date(`${v}T00:00:00`).toLocaleDateString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function columnLabel(key, fields) {
  if (key === 'count') return 'Count';
  return fields.find(f => f.field_key === key)?.label || key;
}

export function downloadCsv(filename, columns, rows, fields) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map(c => cell(columnLabel(c, fields)))];
  rows.forEach(r => lines.push(columns.map(c => cell(Array.isArray(r[c]) ? r[c].join(', ') : r[c]))));
  const blob = new Blob([lines.map(l => l.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const slugify = (text) => (text || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'report';

// A result as a table, or as labeled bars for a one-field summary. Bars
// always show the label and the number, so nothing relies on color alone.
export function ReportResult({ result, fields, display = 'table', maxRows, definition }) {
  if (!result) return null;
  if (definition?.builder === 'pivot' && definition.pivot) {
    return <PivotResult result={result} fields={fields} pivot={definition.pivot} maxRows={maxRows} />;
  }
  const columns = result.columns || [];
  const allRows = result.rows || [];
  const rows = maxRows ? allRows.slice(0, maxRows) : allRows;

  if (allRows.length === 0) {
    return <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Nothing to show yet.</p>;
  }

  const canBar = display === 'bar' && columns.length === 2 && columns[1] === 'count';
  if (canBar) {
    const max = Math.max(...allRows.map(r => Number(r.count) || 0), 1);
    return (
      <div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.875rem', marginBottom: '0.2rem' }}>
                <span>{formatCell(r[columns[0]]) || <em style={{ color: GREY_TEXT }}>(none)</em>}</span>
                <span style={{ fontWeight: 'bold' }}>{r.count}</span>
              </div>
              <div style={{ height: '0.5rem', background: '#1e293b', borderRadius: '0.25rem', overflow: 'hidden' }} aria-hidden="true">
                <div style={{ width: `${Math.max(2, (Number(r.count) / max) * 100)}%`, height: '100%', background: PERSONAL_TEXT, borderRadius: '0.25rem' }} />
              </div>
            </li>
          ))}
        </ul>
        {maxRows && allRows.length > maxRows && (
          <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Showing {maxRows} of {allRows.length}.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #334155', color: GREY_TEXT, whiteSpace: 'nowrap' }}>{columnLabel(c, fields)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e293b', verticalAlign: 'top' }}>{formatCell(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {maxRows && allRows.length > maxRows && (
        <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Showing {maxRows} of {allRows.length}. Open the report to see them all.</p>
      )}
      {!maxRows && result.limited && (
        <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Showing the first {allRows.length} rows. Add a filter to narrow it down.</p>
      )}
    </div>
  );
}

// ---------- Pivot-style results ----------
// The database returns one row per combination (plus a count). This lays
// those out the way the pivot builder was arranged: Rows down the side,
// "organized by this, then by this", and Columns across the top.

const pivotKey = (v) => (v === null || v === undefined || v === '' ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const compareKeys = (a, b) => {
  if (a === b) return 0;
  if (a === '') return 1;      // "not set" goes last
  if (b === '') return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

export function PivotResult({ result, fields, pivot, maxRows }) {
  const allRows = result?.rows || [];
  if (allRows.length === 0) {
    return <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Nothing to show yet.</p>;
  }
  const rowFields = pivot.rows || [];
  const colFields = pivot.columns || [];
  const counting = (pivot.values || []).includes('count');
  const fieldOf = (k) => fields.find(f => f.field_key === k);
  const show = (k, v) => formatCell(v) || fieldOf(k)?.not_set_label || '(not set)';
  // Something with several tags is counted once under each tag, so adding
  // those counts together would count it more than once.
  const listField = [...rowFields, ...colFields].map(fieldOf).find(f => f?.value_type === 'list');
  const showTotals = counting && !listField;

  const th = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #334155', color: GREY_TEXT, whiteSpace: 'nowrap', fontWeight: 'bold' };
  const td = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e293b', verticalAlign: 'top' };
  const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const total = { fontWeight: 'bold', borderTop: '1px solid #334155' };

  // The leading cells of a line: a value is left blank when it repeats the
  // line above, so each group reads as one block.
  const leadCells = (keys, values, previous, blankLast) => keys.map((k, i) => {
    const repeats = previous && (blankLast || i < keys.length - 1)
      && keys.slice(0, i + 1).every(x => pivotKey(previous[x]) === pivotKey(values[x]));
    return (
      <td key={k} style={{ ...td, color: repeats ? 'transparent' : undefined }} aria-hidden={repeats ? 'true' : undefined}>
        {repeats ? '' : show(k, values[k])}
      </td>
    );
  });

  const note = (shownCount, totalCount) => (
    <>
      {maxRows && totalCount > maxRows && (
        <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Showing {shownCount} of {totalCount} lines. Open the report to see them all.</p>
      )}
      {!maxRows && result.limited && (
        <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>This report is too big to show all of it. Add a filter to narrow it down.</p>
      )}
      {counting && listField && (
        <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          Totals aren't shown: anything with more than one "{listField.label}" is counted under each of them, so adding the counts up would count it more than once.
        </p>
      )}
    </>
  );

  // A list, or a count with nothing across the top.
  if (!counting || colFields.length === 0) {
    const keys = counting ? rowFields : [...rowFields, ...colFields];
    const organized = counting ? keys.length : rowFields.length;
    const rows = maxRows ? allRows.slice(0, maxRows) : allRows;
    const grand = allRows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    return (
      <div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                {keys.map(k => <th key={k} scope="col" style={th}>{columnLabel(k, fields)}</th>)}
                {counting && <th scope="col" style={{ ...th, ...num }}>Count</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {leadCells(keys.slice(0, organized), r, i > 0 ? rows[i - 1] : null, false)}
                  {keys.slice(organized).map(k => <td key={k} style={td}>{formatCell(r[k])}</td>)}
                  {counting && <td style={{ ...td, ...num }}>{r.count}</td>}
                </tr>
              ))}
              {showTotals && !maxRows && !result.limited && (
                <tr>
                  <th scope="row" colSpan={keys.length} style={{ ...td, ...total, textAlign: 'left' }}>Total</th>
                  <td style={{ ...td, ...num, ...total }}>{grand}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {note(rows.length, allRows.length)}
      </div>
    );
  }

  // A count with fields across the top.
  const rowId = (r) => rowFields.map(k => pivotKey(r[k])).join('\u0001');
  const colId = (r) => colFields.map(k => pivotKey(r[k])).join('\u0001');
  const lines = [];
  const lineById = {};
  const colById = {};
  allRows.forEach(r => {
    const rid = rowId(r);
    if (!lineById[rid]) { lineById[rid] = { values: r, cells: {}, sum: 0 }; lines.push(lineById[rid]); }
    const cid = colId(r);
    if (!colById[cid]) colById[cid] = { id: cid, values: r, sum: 0 };
    const n = Number(r.count) || 0;
    lineById[rid].cells[cid] = (lineById[rid].cells[cid] || 0) + n;
    lineById[rid].sum += n;
    colById[cid].sum += n;
  });
  // Same order the database uses: each field A to Z (or reversed if the
  // builder said so), with "not set" last either way.
  const reversed = pivot.desc || [];
  const byFields = (keys) => (a, b) => {
    for (const k of keys) {
      const x = pivotKey(a.values[k]);
      const y = pivotKey(b.values[k]);
      const c = compareKeys(x, y);
      if (c !== 0) return reversed.includes(k) && x !== '' && y !== '' ? -c : c;
    }
    return 0;
  };
  lines.sort(byFields(rowFields));
  const cols = Object.values(colById).sort(byFields(colFields));
  const shownLines = maxRows ? lines.slice(0, maxRows) : lines;
  const grand = cols.reduce((sum, c) => sum + c.sum, 0);
  const acrossLabel = colFields.map(k => columnLabel(k, fields)).join(' / ');

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: '100%' }}>
          <thead>
            <tr>
              {rowFields.length > 0
                ? rowFields.map(k => <th key={k} scope="col" style={th}>{columnLabel(k, fields)}</th>)
                : <th scope="col" style={th}>{acrossLabel}</th>}
              {cols.map(c => (
                <th key={c.id} scope="col" style={{ ...th, ...num }} title={acrossLabel}>
                  {colFields.map(k => show(k, c.values[k])).join(' / ')}
                </th>
              ))}
              {showTotals && <th scope="col" style={{ ...th, ...num }}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {shownLines.map((line, i) => (
              <tr key={i}>
                {rowFields.length > 0
                  ? leadCells(rowFields, line.values, i > 0 ? shownLines[i - 1].values : null, false)
                  : <td style={td}>Count</td>}
                {cols.map(c => (
                  <td key={c.id} style={{ ...td, ...num, color: line.cells[c.id] ? undefined : GREY_TEXT }}>{line.cells[c.id] || 0}</td>
                ))}
                {showTotals && <td style={{ ...td, ...num, fontWeight: 'bold' }}>{line.sum}</td>}
              </tr>
            ))}
            {showTotals && rowFields.length > 0 && !maxRows && !result.limited && (
              <tr>
                <th scope="row" colSpan={rowFields.length} style={{ ...td, ...total, textAlign: 'left' }}>Total</th>
                {cols.map(c => <td key={c.id} style={{ ...td, ...num, ...total }}>{c.sum}</td>)}
                <td style={{ ...td, ...num, ...total }}>{grand}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rowFields.length > 0 && <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Across the top: {acrossLabel}.</p>}
      {note(shownLines.length, lines.length)}
    </div>
  );
}
