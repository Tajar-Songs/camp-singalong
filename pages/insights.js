import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import {
  SUPABASE_URL, authHeaders, getJson, writeJson, runReport, ReportResult,
  PERSONAL_TEXT, PERSONAL_FILL, GREY_TEXT, DANGER_TEXT
} from '../lib/reports';

// Tajar Tracks: each person's own hub for insights about their songs, and
// their saved reports. Named for the tracks Tajar leaves around camp - and
// the songs you've sung, and keeping track of them. Personal tier, so blue
// leads (style guide: ownership tiers).
export default function TajarTracks() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [fieldsByDataset, setFieldsByDataset] = useState({});
  const [results, setResults] = useState({});   // report id -> { result } or { error }
  const [busy, setBusy] = useState(false);

  useEffect(() => { start(); }, []);

  const start = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { router.push('/?login=true'); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(false) });
      if (!res.ok) { router.push('/?login=true'); return; }
      const me = await res.json();
      setUser(me);

      const fields = await getJson('report_fields?select=*&order=display_order.asc');
      const byDataset = {};
      fields.forEach(f => { (byDataset[f.dataset_key] = byDataset[f.dataset_key] || []).push(f); });
      setFieldsByDataset(byDataset);

      await addStarterReportsOnce(me.id);
      await loadReports();
    } catch (error) {
      console.error('Error loading Tajar Tracks:', error);
      notify.error(`Couldn't load Tajar Tracks: ${error.message}`);
    }
    setLoading(false);
  };

  // The first time someone opens Tajar Tracks, copy in the starter reports
  // they're able to use. After that they're theirs to change or remove.
  const addStarterReportsOnce = async (userId) => {
    const profiles = await getJson(`user_profiles?id=eq.${userId}&select=tracks_started_at`);
    if (profiles[0]?.tracks_started_at) return;

    const [templates, datasets, permissions] = await Promise.all([
      getJson('report_templates?select=*&order=display_order.asc'),
      getJson('report_datasets?select=key,audience,required_permission'),
      fetchMyPermissions(authHeaders(false))
    ]);
    const usable = (key) => {
      const d = datasets.find(x => x.key === key);
      return d && (d.audience === 'self' || permissions.includes(d.required_permission));
    };
    const copies = templates.filter(t => usable(t.dataset_key)).map((t, i) => ({
      owner_id: userId,
      title: t.title,
      description: t.description,
      dataset_key: t.dataset_key,
      definition: t.definition,
      display: t.display,
      hub_order: i + 1,
      template_key: t.key
    }));
    if (copies.length > 0) await writeJson('saved_reports', 'POST', copies);
    await writeJson(`user_profiles?id=eq.${userId}`, 'PATCH', { tracks_started_at: new Date().toISOString() });
  };

  const loadReports = async () => {
    const rows = await getJson('saved_reports?select=*&show_on_hub=eq.true&order=hub_order.asc,created_at.asc');
    setReports(rows);
    rows.forEach(r => runOne(r));
  };

  const runOne = async (report) => {
    try {
      const result = await runReport(report.dataset_key, { ...report.definition, limit: 200 });
      setResults(prev => ({ ...prev, [report.id]: { result } }));
    } catch (error) {
      setResults(prev => ({ ...prev, [report.id]: { error: error.message } }));
    }
  };

  const duplicate = async (report) => {
    setBusy(true);
    try {
      const maxOrder = Math.max(0, ...reports.map(r => r.hub_order || 0));
      await writeJson('saved_reports', 'POST', {
        owner_id: user.id,
        title: `${report.title} (copy)`,
        description: report.description,
        dataset_key: report.dataset_key,
        definition: report.definition,
        display: report.display,
        hub_order: maxOrder + 1
      });
      notify.success(`Made a copy of "${report.title}"`);
      await loadReports();
    } catch (error) {
      notify.error(`Couldn't copy "${report.title}": ${error.message}`);
    }
    setBusy(false);
  };

  // Swap positions with the neighbor above or below.
  const move = async (index, direction) => {
    const other = index + direction;
    if (other < 0 || other >= reports.length) return;
    setBusy(true);
    const a = reports[index];
    const b = reports[other];
    try {
      const orderA = a.hub_order === b.hub_order ? index + 1 : a.hub_order;
      const orderB = a.hub_order === b.hub_order ? other + 1 : b.hub_order;
      await writeJson(`saved_reports?id=eq.${a.id}`, 'PATCH', { hub_order: orderB, updated_at: new Date().toISOString() });
      await writeJson(`saved_reports?id=eq.${b.id}`, 'PATCH', { hub_order: orderA, updated_at: new Date().toISOString() });
      const next = [...reports];
      next[index] = { ...b, hub_order: orderA };
      next[other] = { ...a, hub_order: orderB };
      setReports(next);
    } catch (error) {
      notify.error(`Couldn't move "${a.title}": ${error.message}`);
    }
    setBusy(false);
  };

  const remove = async (report) => {
    if (!window.confirm(`Delete "${report.title}"? This can't be undone, but you can always build it again.`)) return;
    setBusy(true);
    try {
      await writeJson(`saved_reports?id=eq.${report.id}`, 'DELETE');
      notify.success(`Deleted "${report.title}"`);
      setReports(reports.filter(r => r.id !== report.id));
    } catch (error) {
      notify.error(`Couldn't delete "${report.title}": ${error.message}`);
    }
    setBusy(false);
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    headerRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    subtitle: { color: GREY_TEXT, margin: '0.25rem 0 0' },
    newBtn: { background: PERSONAL_FILL, color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '1rem' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', display: 'flex', flexDirection: 'column' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', margin: 0 },
    cardDesc: { color: GREY_TEXT, fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' },
    actions: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #334155' },
    action: { background: 'none', border: '1px solid #334155', color: GREY_TEXT, borderRadius: '0.375rem', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading Tajar Tracks…</p></div></div>;
  }

  return (
    <div style={s.container}>
      <div style={s.wrapper}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.title}>Tajar Tracks</h1>
            <p style={s.subtitle}>Your songs, stats and reports. Only you can see your own data here.</p>
          </div>
          <Link href="/reports" style={s.newBtn}>
            <i className="ti ti-plus" aria-hidden="true"></i> New report
          </Link>
        </div>

        {reports.length === 0 ? (
          <div style={{ ...s.card, alignItems: 'flex-start' }}>
            <p style={{ margin: '0 0 0.75rem' }}>You don't have any reports here yet.</p>
            <Link href="/reports" style={s.newBtn}><i className="ti ti-plus" aria-hidden="true"></i> Build your first report</Link>
          </div>
        ) : (
          <div style={s.grid}>
            {reports.map((report, index) => {
              const state = results[report.id];
              const fields = fieldsByDataset[report.dataset_key] || [];
              return (
                <section key={report.id} style={s.card} aria-label={report.title}>
                  <h2 style={s.cardTitle}>{report.title}</h2>
                  {report.description ? <p style={s.cardDesc}>{report.description}</p> : <div style={{ height: '0.75rem' }} />}
                  <div style={{ marginBottom: '0.5rem' }}>
                    {!state ? (
                      <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Loading…</p>
                    ) : state.error ? (
                      <p style={{ color: DANGER_TEXT, fontSize: '0.875rem', margin: 0 }}>
                        <i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {state.error}
                      </p>
                    ) : (
                      <ReportResult result={state.result} fields={fields} display={report.display} maxRows={10} />
                    )}
                  </div>
                  <div style={s.actions}>
                    <Link href={`/reports?id=${report.id}`} style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
                      <i className="ti ti-pencil" aria-hidden="true"></i> Open &amp; edit
                    </Link>
                    <button type="button" style={s.action} disabled={busy} onClick={() => duplicate(report)}>
                      <i className="ti ti-copy" aria-hidden="true"></i> Duplicate
                    </button>
                    <button type="button" style={s.action} disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move "${report.title}" earlier`}>
                      <i className="ti ti-arrow-up" aria-hidden="true"></i> Earlier
                    </button>
                    <button type="button" style={s.action} disabled={busy || index === reports.length - 1} onClick={() => move(index, 1)} aria-label={`Move "${report.title}" later`}>
                      <i className="ti ti-arrow-down" aria-hidden="true"></i> Later
                    </button>
                    <button type="button" style={{ ...s.action, color: DANGER_TEXT }} disabled={busy} onClick={() => remove(report)}>
                      <i className="ti ti-trash" aria-hidden="true"></i> Delete
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
