// lib/homePins.js
//
// The reports and dashboards someone has pinned to their home page from
// Tajar Tracks. Shown on the home page (pages/index.js) below the cards.
// Each pinned report shows its first few results; each pinned dashboard is
// a link. People reorder pins by dragging, or with Earlier / Later, and can
// unpin from here or from Tajar Tracks. How many they can pin is their own
// number (Profile), up to the admins' maximum (Settings).

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getJson, writeJson, runReport, ReportResult, PERSONAL_TEXT, GREY_TEXT, DANGER_TEXT } from './reports';

const SHOW_ROWS = 5;

export default function HomePins({ isDark }) {
  const [pins, setPins] = useState(null);           // null while loading
  const [reports, setReports] = useState({});
  const [dashboards, setDashboards] = useState({});
  const [fieldsByDataset, setFieldsByDataset] = useState({});
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState('');
  const drag = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const rows = await getJson('home_pins?select=*&order=position.asc,created_at.asc');
      const reportIds = rows.filter(p => p.report_id).map(p => p.report_id);
      const dashIds = rows.filter(p => p.dashboard_id).map(p => p.dashboard_id);
      const [reportRows, dashRows, fields] = await Promise.all([
        reportIds.length ? getJson(`saved_reports?select=*&id=in.(${reportIds.join(',')})`) : [],
        dashIds.length ? getJson(`report_dashboards?select=*&id=in.(${dashIds.join(',')})`) : [],
        reportIds.length ? getJson('report_fields?select=*&order=display_order.asc') : []
      ]);
      const rMap = {};
      reportRows.forEach(r => { rMap[r.id] = r; });
      const dMap = {};
      dashRows.forEach(d => { dMap[d.id] = d; });
      const byDataset = {};
      fields.forEach(f => { (byDataset[f.dataset_key] = byDataset[f.dataset_key] || []).push(f); });
      setReports(rMap);
      setDashboards(dMap);
      setFieldsByDataset(byDataset);
      setPins(rows);
      reportRows.forEach(async (r) => {
        try {
          const result = await runReport(r.dataset_key, { ...r.definition, limit: r.definition?.builder === 'pivot' ? 5000 : 50 });
          setResults(prev => ({ ...prev, [r.id]: { result } }));
        } catch (error) {
          setResults(prev => ({ ...prev, [r.id]: { error: error.message } }));
        }
      });
    } catch (error) {
      // The home page still works without pins; just leave them out.
      console.error('Could not load pins:', error);
      setPins([]);
    }
  };

  const saveOrder = async (next) => {
    setBusy(true);
    setPins(next.map((p, i) => ({ ...p, position: i + 1 })));
    try {
      await Promise.all(next.map((p, i) => (p.position === i + 1 ? null : writeJson(`home_pins?id=eq.${p.id}`, 'PATCH', { position: i + 1 }))));
    } catch (error) {
      console.error('Could not save the order:', error);
      load();
    }
    setBusy(false);
  };

  const move = (index, by) => {
    const to = index + by;
    if (to < 0 || to >= pins.length) return;
    const next = [...pins];
    [next[index], next[to]] = [next[to], next[index]];
    saveOrder(next);
  };

  const dropOn = (targetId) => {
    const fromId = drag.current;
    drag.current = null;
    setOver('');
    if (!fromId || fromId === targetId) return;
    const next = [...pins];
    const from = next.findIndex(p => p.id === fromId);
    const to = next.findIndex(p => p.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  };

  const unpin = async (pin) => {
    setBusy(true);
    try {
      await writeJson(`home_pins?id=eq.${pin.id}`, 'DELETE');
      setPins(pins.filter(p => p.id !== pin.id));
    } catch (error) {
      console.error('Could not unpin:', error);
    }
    setBusy(false);
  };

  if (!pins || pins.length === 0) return null;

  const text = isDark ? '#fff' : '#0f172a';
  const cardBg = isDark ? '#0f172a' : '#ffffff';
  const border = isDark ? 'rgba(131,140,149,0.25)' : 'rgba(83,113,172,0.25)';
  const action = { background: 'none', border: `1px solid ${border}`, color: GREY_TEXT, borderRadius: '0.375rem', padding: '0.25rem 0.55rem', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' };

  return (
    <section aria-label="Pinned from Tajar Tracks" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, color: isDark ? '#fff' : '#3a4a6b' }}>Pinned from Tajar Tracks</h2>
        <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>Drag to reorder. Pin more from Tajar Tracks.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
        {pins.map((pin, index) => {
          const report = pin.report_id ? reports[pin.report_id] : null;
          const dash = pin.dashboard_id ? dashboards[pin.dashboard_id] : null;
          const title = report?.title || dash?.title;
          const state = report ? results[report.id] : null;
          return (
            <div key={pin.id} draggable
              onDragStart={(e) => { drag.current = pin.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', pin.id); } catch (err) { /* ref is enough */ } }}
              onDragOver={(e) => { e.preventDefault(); if (over !== pin.id) setOver(pin.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(''); }}
              onDrop={(e) => { e.preventDefault(); dropOn(pin.id); }}
              style={{ background: cardBg, color: text, border: `1px solid ${border}`, borderRadius: '1rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'grab', outline: over === pin.id ? `2px dashed ${PERSONAL_TEXT}` : 'none', outlineOffset: '2px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <i className={`ti ${dash ? 'ti-layout-dashboard' : 'ti-report-analytics'}`} style={{ color: PERSONAL_TEXT, marginTop: '0.15rem' }} aria-hidden="true"></i>
                <span style={{ flex: 1, fontWeight: 'bold' }}>{title || 'Something you no longer have access to'}</span>
                <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT }} title="Drag to move" aria-hidden="true"></i>
              </div>
              {report && (
                <div style={{ overflowX: 'auto', fontSize: '0.85rem' }}>
                  {!state ? <span style={{ color: GREY_TEXT }}>Loading…</span>
                    : state.error ? <span style={{ color: DANGER_TEXT }}>Couldn't run this report: {state.error}</span>
                      : <ReportResult result={state.result} fields={fieldsByDataset[report.dataset_key] || []} display={report.display} definition={report.definition} maxRows={SHOW_ROWS} />}
                </div>
              )}
              {dash && <p style={{ color: GREY_TEXT, fontSize: '0.85rem', margin: 0 }}>{dash.description || 'A dashboard of your reports.'}</p>}
              {!report && !dash && <p style={{ color: GREY_TEXT, fontSize: '0.85rem', margin: 0 }}>It may have been deleted, or it belongs to a role you no longer have. You can unpin it.</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: 'auto' }}>
                {(report || dash) && (
                  <Link href={report ? `/reports?id=${report.id}&view=full` : `/dashboard?id=${dash.id}`} style={{ ...action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
                    <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open
                  </Link>
                )}
                <button type="button" style={action} disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${title || 'this pin'} earlier`}>
                  <i className="ti ti-arrow-left" aria-hidden="true"></i> Earlier
                </button>
                <button type="button" style={action} disabled={busy || index === pins.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${title || 'this pin'} later`}>
                  <i className="ti ti-arrow-right" aria-hidden="true"></i> Later
                </button>
                <button type="button" style={action} disabled={busy} onClick={() => unpin(pin)}>
                  <i className="ti ti-pinned-off" aria-hidden="true"></i> Unpin
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
