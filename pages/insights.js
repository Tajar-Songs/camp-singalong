import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import {
  SUPABASE_URL, authHeaders, getJson, writeJson, errorDetail, runReport, ReportResult,
  PERSONAL_TEXT, PERSONAL_FILL, GREY_TEXT, DANGER_TEXT
} from '../lib/reports';

// Tajar Tracks: each person's own hub for insights about their songs, and
// their saved reports. Named for the tracks Tajar leaves around camp - and
// the songs you've sung, and keeping track of them. Personal tier, so blue
// leads (style guide: ownership tiers).
//
// Two tabs:
//   My reports   - reports that belong to you alone.
//   Role reports - one live report per entry, shared with everyone who holds
//                  that role. Each person arranges their own view of them
//                  (order, hidden) in report_view_preferences, which never
//                  changes anything for anyone else.
// A report always runs against the viewer's own access, so a role report
// shows each person their own data - never the author's.
export default function TajarTracks() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');                 // 'mine' | 'roles'
  const [reports, setReports] = useState([]);             // my own
  const [roleReports, setRoleReports] = useState([]);     // my roles'
  const [prefs, setPrefs] = useState({});                 // report id -> { sort_order, is_hidden }
  const [myRoles, setMyRoles] = useState([]);             // [{ key, label }]
  const [roleFilter, setRoleFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [names, setNames] = useState({});                 // user id -> display name
  const [permissions, setPermissions] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [fieldsByDataset, setFieldsByDataset] = useState({});
  const [results, setResults] = useState({});             // report id -> { result } or { error }
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (router.isReady) start(); }, [router.isReady]);

  const start = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { router.push('/?login=true'); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(false) });
      if (!res.ok) { router.push('/?login=true'); return; }
      const me = await res.json();
      setUser(me);

      const [fields, datasetRows, perms, grants, roles] = await Promise.all([
        getJson('report_fields?select=*&order=display_order.asc'),
        getJson('report_datasets?select=key,title,audience,required_permission'),
        fetchMyPermissions(authHeaders(false)),
        getJson(`user_roles?user_id=eq.${me.id}&select=role_id`),
        getJson('roles?select=id,key,label&order=label.asc')
      ]);
      const byDataset = {};
      fields.forEach(f => { (byDataset[f.dataset_key] = byDataset[f.dataset_key] || []).push(f); });
      setFieldsByDataset(byDataset);
      setDatasets(datasetRows);
      setPermissions(perms);
      const held = roles.filter(r => grants.some(g => g.role_id === r.id)).map(r => ({ key: r.key, label: r.label }));
      setMyRoles(held);
      if (router.query.tab === 'roles' && held.length > 0) setTab('roles');

      const canUse = makeCanUse(datasetRows, perms);
      await addStarterReportsOnce(me.id, datasetRows, perms);
      await loadMine(me.id, canUse);
      if (held.length > 0) await loadRoleReports(canUse);
    } catch (error) {
      console.error('Error loading Tajar Tracks:', error);
      notify.error(`Couldn't load Tajar Tracks: ${error.message}`);
    }
    setLoading(false);
  };

  const makeCanUse = (datasetRows, perms) => (key) => {
    const d = datasetRows.find(x => x.key === key);
    return !!d && (d.audience === 'self' || perms.includes(d.required_permission));
  };
  const canUse = makeCanUse(datasets, permissions);

  // The first time someone opens Tajar Tracks, copy in the starter reports
  // they're able to use. After that they're theirs to change or remove.
  const addStarterReportsOnce = async (userId, datasetRows, perms) => {
    const profiles = await getJson(`user_profiles?id=eq.${userId}&select=tracks_started_at`);
    if (profiles[0]?.tracks_started_at) return;
    const usable = makeCanUse(datasetRows, perms);
    const templates = await getJson('report_templates?select=*&order=display_order.asc');
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

  // Run a report, unless it uses information this person can't see.
  const runOne = async (report, usable = canUse) => {
    if (!usable(report.dataset_key)) {
      setResults(prev => ({ ...prev, [report.id]: { noAccess: true } }));
      return;
    }
    try {
      const result = await runReport(report.dataset_key, { ...report.definition, limit: report.definition?.builder === 'pivot' ? 5000 : 200 });
      setResults(prev => ({ ...prev, [report.id]: { result } }));
    } catch (error) {
      setResults(prev => ({ ...prev, [report.id]: { error: error.message } }));
    }
  };

  const loadMine = async (userId = user?.id, usable = canUse) => {
    const rows = await getJson(`saved_reports?select=*&owner_id=eq.${userId}&role_key=is.null&show_on_hub=eq.true&order=hub_order.asc,created_at.asc`);
    setReports(rows);
    rows.forEach(r => runOne(r, usable));
  };

  const loadRoleReports = async (usable = canUse) => {
    const [rows, prefRows] = await Promise.all([
      getJson('saved_reports?select=*&role_key=not.is.null&order=created_at.asc'),
      getJson('report_view_preferences?select=report_id,sort_order,is_hidden')
    ]);
    const byId = {};
    prefRows.forEach(p => { byId[p.report_id] = p; });
    setPrefs(byId);
    setRoleReports(rows);
    const people = [...new Set(rows.flatMap(r => [r.owner_id, r.last_edited_by]).filter(Boolean))];
    if (people.length > 0) {
      const profiles = await getJson(`user_profiles?id=in.(${people.join(',')})&select=id,display_name`);
      const map = {};
      profiles.forEach(p => { map[p.id] = p.display_name; });
      setNames(map);
    }
    rows.forEach(r => { if (!byId[r.id]?.is_hidden) runOne(r, usable); });
  };

  // ---------- My reports ----------
  const copyToMine = async (report, title) => {
    setBusy(true);
    try {
      const maxOrder = Math.max(0, ...reports.map(r => r.hub_order || 0));
      await writeJson('saved_reports', 'POST', {
        owner_id: user.id,
        title,
        description: report.description,
        dataset_key: report.dataset_key,
        definition: report.definition,
        display: report.display,
        hub_order: maxOrder + 1
      });
      notify.success(`Saved "${title}" to My reports`);
      await loadMine();
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
      await writeJson(`saved_reports?id=eq.${a.id}`, 'PATCH', { hub_order: orderB });
      await writeJson(`saved_reports?id=eq.${b.id}`, 'PATCH', { hub_order: orderA });
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

  // ---------- Role reports ----------
  const roleLabel = (key) => myRoles.find(r => r.key === key)?.label || key;
  const canEdit = (report) => myRoles.some(r => r.key === report.role_key)
    && (report.owner_id === user?.id || permissions.includes('reporting.manage.content'));

  // Everyone's own order: their saved position first, then oldest first.
  const orderedRoleReports = [...roleReports].sort((a, b) => {
    const pa = prefs[a.id]?.sort_order;
    const pb = prefs[b.id]?.sort_order;
    if (pa != null && pb != null && pa !== pb) return pa - pb;
    if (pa != null && pb == null) return -1;
    if (pa == null && pb != null) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  const inFilter = orderedRoleReports.filter(r => roleFilter === 'all' || r.role_key === roleFilter);
  const hiddenCount = inFilter.filter(r => prefs[r.id]?.is_hidden).length;
  const shownRoleReports = inFilter.filter(r => showHidden || !prefs[r.id]?.is_hidden);

  // Save this person's arrangement. Writes go to their own preferences only.
  const savePrefs = async (rows) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/report_view_preferences?on_conflict=user_id,report_id`, {
      method: 'POST',
      headers: { ...authHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows.map(r => ({ user_id: user.id, updated_at: new Date().toISOString(), ...r })))
    });
    if (!res.ok) throw new Error(await errorDetail(res));
    const saved = await res.json().catch(() => []);
    if (!Array.isArray(saved) || saved.length === 0) throw new Error('nothing was saved - try reloading, or logging out and back in');
    setPrefs(prev => {
      const next = { ...prev };
      saved.forEach(p => { next[p.report_id] = p; });
      return next;
    });
  };

  // Move within what's shown; positions are kept across all role reports.
  const moveRole = async (report, direction) => {
    const i = shownRoleReports.indexOf(report);
    const neighbor = shownRoleReports[i + direction];
    if (!neighbor) return;
    const all = [...orderedRoleReports];
    const a = all.indexOf(report);
    const b = all.indexOf(neighbor);
    [all[a], all[b]] = [all[b], all[a]];
    setBusy(true);
    try {
      await savePrefs(all.map((r, index) => ({ report_id: r.id, sort_order: index + 1, is_hidden: !!prefs[r.id]?.is_hidden })));
    } catch (error) {
      notify.error(`Couldn't move "${report.title}": ${error.message}`);
    }
    setBusy(false);
  };

  const setHidden = async (report, hidden) => {
    setBusy(true);
    try {
      await savePrefs([{ report_id: report.id, sort_order: prefs[report.id]?.sort_order ?? null, is_hidden: hidden }]);
      if (!hidden && !results[report.id]) runOne(report);
      notify.success(hidden ? `Hid "${report.title}". Only you see this change.` : `"${report.title}" is showing again`);
    } catch (error) {
      notify.error(`Couldn't change "${report.title}": ${error.message}`);
    }
    setBusy(false);
  };

  const removeRoleReport = async (report) => {
    if (!window.confirm(`Delete "${report.title}" from ${roleLabel(report.role_key)} reports? It disappears for everyone with that role. This can't be undone.`)) return;
    setBusy(true);
    try {
      await writeJson(`saved_reports?id=eq.${report.id}`, 'DELETE');
      notify.success(`Deleted "${report.title}"`);
      setRoleReports(roleReports.filter(r => r.id !== report.id));
    } catch (error) {
      notify.error(`Couldn't delete "${report.title}": ${error.message}`);
    }
    setBusy(false);
  };

  // ---------- Styles ----------
  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    headerRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    subtitle: { color: GREY_TEXT, margin: '0.25rem 0 0' },
    newBtn: { background: PERSONAL_FILL, color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    tabs: { display: 'flex', flexWrap: 'wrap', gap: '1px', borderBottom: '1px solid #334155', marginBottom: '1.25rem' },
    tab: (on) => ({ background: 'none', border: 'none', borderBottom: `3px solid ${on ? PERSONAL_TEXT : 'transparent'}`, color: on ? '#fff' : GREY_TEXT, padding: '0.6rem 1rem', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }),
    segment: { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden' },
    segmentBtn: (on) => ({ padding: '0.4rem 0.85rem', border: 'none', background: on ? PERSONAL_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '1rem' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', display: 'flex', flexDirection: 'column' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', margin: 0 },
    cardDesc: { color: GREY_TEXT, fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' },
    roleTag: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.1rem 0.45rem', marginBottom: '0.4rem', alignSelf: 'flex-start' },
    meta: { color: GREY_TEXT, fontSize: '0.75rem', margin: '0 0 0.75rem' },
    actions: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #334155' },
    action: { background: 'none', border: '1px solid #334155', color: GREY_TEXT, borderRadius: '0.375rem', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' },
    link: { background: 'none', border: 'none', color: PERSONAL_TEXT, cursor: 'pointer', padding: 0, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading Tajar Tracks…</p></div></div>;
  }

  const resultArea = (report) => {
    const state = results[report.id];
    const fields = fieldsByDataset[report.dataset_key] || [];
    const datasetTitle = datasets.find(d => d.key === report.dataset_key)?.title || report.dataset_key;
    if (!state) return <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Loading…</p>;
    if (state.noAccess) {
      return (
        <p style={{ color: '#cbd5e1', fontSize: '0.875rem', margin: 0 }}>
          <i className="ti ti-lock" aria-hidden="true"></i> This report uses {datasetTitle}, which you don't have access to, so there's nothing to show you here.
        </p>
      );
    }
    if (state.error) {
      return (
        <p style={{ color: DANGER_TEXT, fontSize: '0.875rem', margin: 0 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {state.error}
        </p>
      );
    }
    return <ReportResult result={state.result} fields={fields} display={report.display} definition={report.definition} maxRows={10} />;
  };

  const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '');

  const switchTab = (next) => {
    setTab(next);
    router.replace(next === 'roles' ? '/insights?tab=roles' : '/insights', undefined, { shallow: true });
  };

  return (
    <div style={s.container}>
      <div style={s.wrapper}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.title}>Tajar Tracks</h1>
            <p style={s.subtitle}>
              {tab === 'mine'
                ? 'Your songs, stats and reports. Only you can see your own data here.'
                : 'Reports shared with everyone who has the same role as you. Each one shows you your own data, and how you arrange them only changes your view.'}
            </p>
          </div>
          <Link href={tab === 'roles' ? '/reports?for=role' : '/reports'} style={s.newBtn}>
            <i className="ti ti-plus" aria-hidden="true"></i> {tab === 'roles' ? 'New role report' : 'New report'}
          </Link>
        </div>

        {myRoles.length > 0 && (
          <div style={s.tabs} role="tablist" aria-label="Which reports">
            <button type="button" role="tab" aria-selected={tab === 'mine'} style={s.tab(tab === 'mine')} onClick={() => switchTab('mine')}>
              <i className="ti ti-user" aria-hidden="true"></i> My reports
            </button>
            <button type="button" role="tab" aria-selected={tab === 'roles'} style={s.tab(tab === 'roles')} onClick={() => switchTab('roles')}>
              <i className="ti ti-users" aria-hidden="true"></i> Role reports
            </button>
          </div>
        )}

        {tab === 'mine' && (reports.length === 0 ? (
          <div style={{ ...s.card, alignItems: 'flex-start' }}>
            <p style={{ margin: '0 0 0.75rem' }}>You don't have any reports here yet.</p>
            <Link href="/reports" style={s.newBtn}><i className="ti ti-plus" aria-hidden="true"></i> Build your first report</Link>
          </div>
        ) : (
          <div style={s.grid}>
            {reports.map((report, index) => (
              <section key={report.id} style={s.card} aria-label={report.title}>
                <h2 style={s.cardTitle}>{report.title}</h2>
                {report.description ? <p style={s.cardDesc}>{report.description}</p> : <div style={{ height: '0.75rem' }} />}
                <div style={{ marginBottom: '0.5rem' }}>{resultArea(report)}</div>
                <div style={s.actions}>
                  <Link href={`/reports?id=${report.id}&view=full`} style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
                    <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open
                  </Link>
                  <Link href={`/reports?id=${report.id}`} style={s.action}>
                    <i className="ti ti-pencil" aria-hidden="true"></i> Edit
                  </Link>
                  <button type="button" style={s.action} disabled={busy} onClick={() => copyToMine(report, `${report.title} (copy)`)}>
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
            ))}
          </div>
        ))}

        {tab === 'roles' && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              {myRoles.length > 1 && (
                <div style={s.segment} role="group" aria-label="Show reports for">
                  <button type="button" style={s.segmentBtn(roleFilter === 'all')} aria-pressed={roleFilter === 'all'} onClick={() => setRoleFilter('all')}>All my roles</button>
                  {myRoles.map(r => (
                    <button key={r.key} type="button" style={s.segmentBtn(roleFilter === r.key)} aria-pressed={roleFilter === r.key} onClick={() => setRoleFilter(r.key)}>{r.label}</button>
                  ))}
                </div>
              )}
              {hiddenCount > 0 && (
                <button type="button" style={s.link} onClick={() => setShowHidden(!showHidden)} aria-pressed={showHidden}>
                  <i className={`ti ${showHidden ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true"></i>
                  {showHidden ? 'Leave out the ones I hid' : `Show the ${hiddenCount} I hid`}
                </button>
              )}
            </div>

            {shownRoleReports.length === 0 ? (
              <div style={{ ...s.card, alignItems: 'flex-start' }}>
                <p style={{ margin: '0 0 0.5rem' }}>
                  {inFilter.length > 0 ? 'You\'ve hidden all of these.' : 'Nobody has added a report for your roles yet.'}
                </p>
                <p style={{ color: GREY_TEXT, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                  To add one, build a report and choose "Role reports" when you save it. Everyone with that role will see it.
                </p>
                <Link href="/reports?for=role" style={s.newBtn}><i className="ti ti-plus" aria-hidden="true"></i> New role report</Link>
              </div>
            ) : (
              <div style={s.grid}>
                {shownRoleReports.map((report, index) => {
                  const hidden = !!prefs[report.id]?.is_hidden;
                  const editable = canEdit(report);
                  const author = names[report.owner_id] || 'someone';
                  const editor = report.last_edited_by && report.last_edited_by !== report.owner_id ? names[report.last_edited_by] : null;
                  return (
                    <section key={report.id} style={{ ...s.card, opacity: hidden ? 0.6 : 1 }} aria-label={report.title}>
                      <span style={s.roleTag}><i className="ti ti-users" aria-hidden="true"></i>{roleLabel(report.role_key)}</span>
                      <h2 style={s.cardTitle}>{report.title}{hidden && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.8rem' }}> (hidden)</span>}</h2>
                      <p style={{ ...s.cardDesc, color: '#cbd5e1', margin: '0.35rem 0 0.25rem' }}><strong>What it's for:</strong> {report.description}</p>
                      <p style={s.meta}>
                        Added by {author}{report.owner_id === user.id ? ' (you)' : ''}
                        {' · '}last changed {when(report.updated_at)}{editor ? ` by ${editor}` : ''}
                      </p>
                      {!hidden && <div style={{ marginBottom: '0.5rem' }}>{resultArea(report)}</div>}
                      <div style={s.actions}>
                        <Link href={`/reports?id=${report.id}&view=full`} style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
                          <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open
                        </Link>
                        {editable && (
                          <Link href={`/reports?id=${report.id}`} style={s.action}>
                            <i className="ti ti-pencil" aria-hidden="true"></i> Edit
                          </Link>
                        )}
                        <button type="button" style={s.action} disabled={busy} onClick={() => copyToMine(report, `${report.title} (my copy)`)}>
                          <i className="ti ti-copy" aria-hidden="true"></i> Make my own copy
                        </button>
                        <button type="button" style={s.action} disabled={busy || index === 0} onClick={() => moveRole(report, -1)} aria-label={`Move "${report.title}" earlier in your view`}>
                          <i className="ti ti-arrow-up" aria-hidden="true"></i> Earlier
                        </button>
                        <button type="button" style={s.action} disabled={busy || index === shownRoleReports.length - 1} onClick={() => moveRole(report, 1)} aria-label={`Move "${report.title}" later in your view`}>
                          <i className="ti ti-arrow-down" aria-hidden="true"></i> Later
                        </button>
                        <button type="button" style={s.action} disabled={busy} onClick={() => setHidden(report, !hidden)}>
                          <i className={`ti ${hidden ? 'ti-eye' : 'ti-eye-off'}`} aria-hidden="true"></i> {hidden ? 'Show again' : 'Hide for me'}
                        </button>
                        {editable && (
                          <button type="button" style={{ ...s.action, color: DANGER_TEXT }} disabled={busy} onClick={() => removeRoleReport(report)}>
                            <i className="ti ti-trash" aria-hidden="true"></i> Delete for everyone
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
