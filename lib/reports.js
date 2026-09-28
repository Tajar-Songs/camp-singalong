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
export function ReportResult({ result, fields, display = 'table', maxRows }) {
  if (!result) return null;
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
