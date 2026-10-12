import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import {
  SUPABASE_URL, authHeaders, getJson, writeJson, errorDetail, runReport, ReportResult,
  PERSONAL_TEXT, PERSONAL_FILL, GREY_TEXT, DANGER_TEXT
} from '../lib/reports';

// A dashboard: a named page of saved reports, in order, each normal or wide.
// It points to the reports themselves, so changing a report changes it on
// every dashboard it's on.
//
//   /dashboard?id=…           view
//   /dashboard?id=…&edit=1    change it (if allowed)
//   /dashboard?new=1          make one (&for=role to start it as a role dashboard)
//
// Personal dashboards hold any report you can see. Role dashboards hold only
// that role's reports, and everyone in the role arranges their own view of
// them (order, hidden) in dashboard_item_preferences.
export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);
  const [myRoles, setMyRoles] = useState([]);              // [{ key, label }]
  const [datasets, setDatasets] = useState([]);
  const [fieldsByDataset, setFieldsByDataset] = useState({});

  const [dashboard, setDashboard] = useState(null);        // saved row, or null when new
  const [items, setItems] = useState([]);                  // saved items
  const [reportsById, setReportsById] = useState({});      // reports this person can see
  const [itemPrefs, setItemPrefs] = useState({});          // item id -> { sort_order, is_hidden }
  const [results, setResults] = useState({});
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // Editing
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [draft, setDraft] = useState([]);                  // [{ id?, report_id, size }]
  const [eligible, setEligible] = useState([]);            // reports that could go on it

  useEffect(() => { if (router.isReady) start(); }, [router.isReady, router.query.id]);

  const start = async () => {
    setLoading(true);
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

      // Every report this person can see (their own and their roles').
      const visible = await getJson(`saved_reports?select=*&or=(and(owner_id.eq.${me.id},role_key.is.null),role_key.not.is.null)&order=title.asc`);
      const byId = {};
      visible.forEach(r => { byId[r.id] = r; });
      setReportsById(byId);
      setEligible(visible);

      const id = router.query.id;
      if (!id) {
        setDashboard(null);
        setItems([]);
        setTitle('');
        setDescription('');
        setRoleKey(router.query.for === 'role' && held.length > 0 ? held[0].key : '');
        setDraft([]);
        setEditing(true);
        setLoading(false);
        return;
      }

      const found = (await getJson(`report_dashboards?id=eq.${id}&select=*`))[0];
      if (!found) {
        notify.error("That dashboard wasn't found. It may have been deleted, or it belongs to someone else.");
        router.replace('/insights?tab=dashboards');
        return;
      }
      const savedItems = await getJson(`report_dashboard_items?dashboard_id=eq.${id}&select=*&order=position.asc`);
      setDashboard(found);
      setItems(savedItems);
      if (found.role_key) {
        const prefs = await getJson(`dashboard_item_preferences?select=item_id,sort_order,is_hidden`);
        const map = {};
        prefs.forEach(p => { map[p.item_id] = p; });
        setItemPrefs(map);
      }
      const canUseNow = (key) => {
        const d = datasetRows.find(x => x.key === key);
        return !!d && (d.audience === 'self' || perms.includes(d.required_permission));
      };
      savedItems.forEach(it => { if (byId[it.report_id]) runOne(byId[it.report_id], canUseNow); });

      const wantsEdit = router.query.edit === '1';
      startEditing(found, savedItems, wantsEdit);
    } catch (error) {
      console.error('Error loading the dashboard:', error);
      notify.error(`Couldn't load the dashboard: ${error.message}`);
    }
    setLoading(false);
  };

  const canUse = (key) => {
    const d = datasets.find(x => x.key === key);
    return !!d && (d.audience === 'self' || permissions.includes(d.required_permission));
  };

  const runOne = async (report, usable = canUse) => {
    if (!usable(report.dataset_key)) {
      setResults(prev => ({ ...prev, [report.id]: { noAccess: true } }));
      return;
    }
    try {
      const result = await runReport(report.dataset_key, { ...report.definition, limit: report.definition?.builder === 'pivot' ? 5000 : 500 });
      setResults(prev => ({ ...prev, [report.id]: { result } }));
    } catch (error) {
      setResults(prev => ({ ...prev, [report.id]: { error: error.message } }));
    }
  };

  const roleOf = (key) => myRoles.find(r => r.key === key);
  const canEdit = !dashboard
    || (!dashboard.role_key && dashboard.owner_id === user?.id)
    || (!!dashboard.role_key && !!roleOf(dashboard.role_key)
        && (dashboard.owner_id === user?.id || permissions.includes('reporting.manage.content')));

  const startEditing = (d, savedItems, on = true) => {
    setTitle(d.title || '');
    setDescription(d.description || '');
    setRoleKey(d.role_key || '');
    setDraft(savedItems.map(it => ({ id: it.id, report_id: it.report_id, size: it.size })));
    setEditing(on);
  };

  // ---------- Viewing ----------
  // Role dashboards: each person's own order, then the dashboard's order.
  const ordered = [...items].sort((a, b) => {
    if (dashboard?.role_key) {
      const pa = itemPrefs[a.id]?.sort_order;
      const pb = itemPrefs[b.id]?.sort_order;
      if (pa != null && pb != null && pa !== pb) return pa - pb;
      if (pa != null && pb == null) return -1;
      if (pa == null && pb != null) return 1;
    }
    return a.position - b.position;
  });
  const hiddenCount = dashboard?.role_key ? ordered.filter(it => itemPrefs[it.id]?.is_hidden).length : 0;
  const shown = ordered.filter(it => showHidden || !itemPrefs[it.id]?.is_hidden);

  const saveItemPrefs = async (rows) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_item_preferences?on_conflict=user_id,item_id`, {
      method: 'POST',
      headers: { ...authHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows.map(r => ({ user_id: user.id, updated_at: new Date().toISOString(), ...r })))
    });
    if (!res.ok) throw new Error(await errorDetail(res));
    const saved = await res.json().catch(() => []);
    if (!Array.isArray(saved) || saved.length === 0) throw new Error('nothing was saved - try reloading, or logging out and back in');
    setItemPrefs(prev => {
      const next = { ...prev };
      saved.forEach(p => { next[p.item_id] = p; });
      return next;
    });
  };

  // Move a report earlier or later. On a role dashboard this only changes
  // your own view; on your own dashboard it changes the dashboard.
  const moveItem = async (item, direction) => {
    const i = shown.indexOf(item);
    const neighbor = shown[i + direction];
    if (!neighbor) return;
    const all = [...ordered];
    const a = all.indexOf(item);
    const b = all.indexOf(neighbor);
    [all[a], all[b]] = [all[b], all[a]];
    setBusy(true);
    try {
      if (dashboard.role_key) {
        await saveItemPrefs(all.map((it, index) => ({ item_id: it.id, sort_order: index + 1, is_hidden: !!itemPrefs[it.id]?.is_hidden })));
      } else {
        await Promise.all(all.map((it, index) => writeJson(`report_dashboard_items?id=eq.${it.id}`, 'PATCH', { position: index + 1 })));
        setItems(all.map((it, index) => ({ ...it, position: index + 1 })));
      }
    } catch (error) {
      notify.error(`Couldn't move it: ${error.message}`);
    }
    setBusy(false);
  };

  const setItemHidden = async (item, hidden) => {
    setBusy(true);
    try {
      await saveItemPrefs([{ item_id: item.id, sort_order: itemPrefs[item.id]?.sort_order ?? null, is_hidden: hidden }]);
    } catch (error) {
      notify.error(`Couldn't change it: ${error.message}`);
    }
    setBusy(false);
  };

  // ---------- Editing ----------
  const allowedOn = (report, key) => (key
    ? report.role_key === key
    : (report.role_key === null && report.owner_id === user?.id) || (!!report.role_key && !!roleOf(report.role_key)));
  const draftIds = draft.map(d => d.report_id);
  const addable = eligible.filter(r => allowedOn(r, roleKey) && !draftIds.includes(r.id));

  const changeRole = (key) => {
    const dropped = draft.filter(d => reportsById[d.report_id] && !allowedOn(reportsById[d.report_id], key));
    if (dropped.length > 0) {
      notify.info(`Took off ${dropped.length} report${dropped.length === 1 ? '' : 's'} that can't go on ${key ? `a ${roleOf(key)?.label} dashboard` : 'a personal dashboard'}.`);
    }
    setDraft(draft.filter(d => !dropped.includes(d)));
    setRoleKey(key);
  };

  const nudgeDraft = (index, by) => {
    const to = index + by;
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    [next[index], next[to]] = [next[to], next[index]];
    setDraft(next);
  };

  const save = async () => {
    if (!title.trim()) { notify.error('Give the dashboard a name before saving.'); return; }
    if (roleKey && !description.trim()) { notify.error('Say what this dashboard is for before adding it to a role - it\'s how everyone else will know why it\'s there.'); return; }
    setBusy(true);
    try {
      let d = dashboard;
      const body = { title: title.trim(), description: description.trim() || null };
      if (d) {
        d = (await writeJson(`report_dashboards?id=eq.${d.id}`, 'PATCH', body))[0];
      } else {
        let hubOrder = 0;
        if (!roleKey) {
          const last = await getJson(`report_dashboards?select=hub_order&owner_id=eq.${user.id}&role_key=is.null&order=hub_order.desc&limit=1`);
          hubOrder = (last[0]?.hub_order || 0) + 1;
        }
        d = (await writeJson('report_dashboards', 'POST', { ...body, owner_id: user.id, role_key: roleKey || null, hub_order: hubOrder }))[0];
      }

      // Bring the saved reports in line with the draft, keeping existing
      // entries (and everyone's own arrangement of them) where possible.
      const keepIds = draft.filter(x => x.id).map(x => x.id);
      const removed = items.filter(it => !keepIds.includes(it.id));
      for (const it of removed) await writeJson(`report_dashboard_items?id=eq.${it.id}`, 'DELETE');
      for (let i = 0; i < draft.length; i++) {
        const x = draft[i];
        if (x.id) {
          await writeJson(`report_dashboard_items?id=eq.${x.id}`, 'PATCH', { position: i + 1, size: x.size });
        } else {
          await writeJson('report_dashboard_items', 'POST', { dashboard_id: d.id, report_id: x.report_id, position: i + 1, size: x.size });
        }
      }
      notify.success(d.role_key ? `Saved "${d.title}" - everyone with the ${roleOf(d.role_key)?.label} role sees the change` : `Saved "${d.title}"`);
      setEditing(false);
      if (dashboard) start();
      else router.replace(`/dashboard?id=${d.id}`);
    } catch (error) {
      notify.error(`Couldn't save: ${error.message}`);
    }
    setBusy(false);
  };

  const remove = async () => {
    const forEveryone = dashboard.role_key ? ` It disappears for everyone with the ${roleOf(dashboard.role_key)?.label} role.` : '';
    if (!window.confirm(`Delete the dashboard "${dashboard.title}"?${forEveryone} The reports on it stay where they are. This can't be undone.`)) return;
    setBusy(true);
    try {
      await writeJson(`report_dashboards?id=eq.${dashboard.id}`, 'DELETE');
      notify.success(`Deleted "${dashboard.title}"`);
      router.push('/insights?tab=dashboards');
    } catch (error) {
      notify.error(`Couldn't delete: ${error.message}`);
      setBusy(false);
    }
  };

  // ---------- Styles ----------
  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    back: { color: PERSONAL_TEXT, textDecoration: 'none', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    help: { color: GREY_TEXT, fontSize: '0.85rem', margin: '0.25rem 0 0' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '1rem' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', display: 'flex', flexDirection: 'column' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', margin: 0 },
    actions: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #334155' },
    action: { background: 'none', border: '1px solid #334155', color: GREY_TEXT, borderRadius: '0.375rem', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' },
    primary: { background: PERSONAL_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' },
    secondary: { background: 'transparent', color: '#fff', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.1rem 0.45rem' },
    label: { display: 'block', fontSize: '0.85rem', fontWeight: 'bold', margin: '0.9rem 0 0.35rem' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem' },
    segment: { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden' },
    segmentBtn: (on) => ({ padding: '0.4rem 0.85rem', border: 'none', background: on ? PERSONAL_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    pill: (on) => ({ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${on ? PERSONAL_TEXT : '#334155'}`, background: on ? `${PERSONAL_FILL}40` : 'transparent', color: on ? '#fff' : '#cbd5e1', fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }),
    row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0', borderTop: '1px solid #334155' },
    link: { background: 'none', border: 'none', color: PERSONAL_TEXT, cursor: 'pointer', padding: 0, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading the dashboard…</p></div></div>;
  }

  const backLink = <Link href="/insights?tab=dashboards" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>;
  const reportLabel = (r) => (r.role_key ? `${r.title} (${roleOf(r.role_key)?.label || 'role'} report)` : r.title);

  // ---------- Edit screen ----------
  if (editing && canEdit) {
    return (
      <div style={s.container}><div style={{ ...s.wrapper, maxWidth: '900px' }}>
        {backLink}
        <h1 style={{ ...s.title, marginBottom: '1rem' }}>{dashboard ? 'Edit dashboard' : 'New dashboard'}</h1>

        <div style={{ ...s.card, marginBottom: '1rem' }}>
          {!dashboard && myRoles.length > 0 && (
            <>
              <span style={{ ...s.label, marginTop: 0 }}>Where should it go?</span>
              <div style={s.segment} role="group" aria-label="Where to save">
                <button type="button" style={s.segmentBtn(!roleKey)} aria-pressed={!roleKey} onClick={() => changeRole('')}>My dashboards</button>
                <button type="button" style={s.segmentBtn(!!roleKey)} aria-pressed={!!roleKey} onClick={() => changeRole(roleKey || myRoles[0].key)}>Role dashboards</button>
              </div>
              {roleKey && myRoles.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }} role="group" aria-label="Which role">
                  {myRoles.map(r => (
                    <button key={r.key} type="button" style={s.pill(roleKey === r.key)} aria-pressed={roleKey === r.key} onClick={() => changeRole(r.key)}>
                      {roleKey === r.key && <i className="ti ti-check" aria-hidden="true"></i>}{r.label}
                    </button>
                  ))}
                </div>
              )}
              <p style={s.help}>
                {roleKey
                  ? `Everyone with the ${roleOf(roleKey)?.label} role will see this dashboard, and it can only hold that role's reports. Each person can arrange their own view of it.`
                  : 'Only you will see this dashboard. It can hold your own reports and your roles\' reports.'}
              </p>
            </>
          )}
          {dashboard?.role_key && (
            <p style={{ ...s.help, marginTop: 0 }}><i className="ti ti-users" aria-hidden="true"></i> A {roleOf(dashboard.role_key)?.label} dashboard. Changes show for everyone with that role.</p>
          )}

          <label style={s.label} htmlFor="dash-title">Name <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(required)</span></label>
          <input id="dash-title" value={title} onChange={(e) => setTitle(e.target.value)} style={s.input} placeholder="For example: Songbook work" />
          <label style={s.label} htmlFor="dash-desc">
            {roleKey ? 'What it\'s for' : 'Description'}{' '}
            <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>{roleKey ? '(required for role dashboards)' : '(optional)'}</span>
          </label>
          <input id="dash-desc" value={description} onChange={(e) => setDescription(e.target.value)} style={s.input}
            placeholder={roleKey ? 'Why this dashboard is here and when to use it' : 'A short note about what this dashboard is for'} />
        </div>

        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Reports on it</h2>
          <p style={{ ...s.help, margin: '0 0 0.5rem' }}>In the order they'll appear. Wide reports take the whole width, which suits big tables.</p>
          {draft.length === 0 && <p style={{ color: GREY_TEXT, fontSize: '0.85rem', fontStyle: 'italic' }}>Nothing yet. Add reports below.</p>}
          {draft.map((x, i) => {
            const r = reportsById[x.report_id];
            return (
              <div key={x.report_id} style={s.row}>
                <span style={{ flex: 1, minWidth: '12rem' }}>
                  <span style={{ color: GREY_TEXT }}>{i + 1}. </span>{r ? reportLabel(r) : <em style={{ color: GREY_TEXT }}>A report you can't see</em>}
                </span>
                <div style={s.segment} role="group" aria-label={`Size of ${r?.title || 'this report'}`}>
                  <button type="button" style={s.segmentBtn(x.size === 'normal')} aria-pressed={x.size === 'normal'} onClick={() => setDraft(draft.map((y, j) => (j === i ? { ...y, size: 'normal' } : y)))}>Normal</button>
                  <button type="button" style={s.segmentBtn(x.size === 'wide')} aria-pressed={x.size === 'wide'} onClick={() => setDraft(draft.map((y, j) => (j === i ? { ...y, size: 'wide' } : y)))}>Wide</button>
                </div>
                <button type="button" style={{ ...s.action, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0} onClick={() => nudgeDraft(i, -1)} aria-label={`Move ${r?.title || 'this report'} earlier`}><i className="ti ti-arrow-up" aria-hidden="true"></i></button>
                <button type="button" style={{ ...s.action, opacity: i === draft.length - 1 ? 0.4 : 1 }} disabled={i === draft.length - 1} onClick={() => nudgeDraft(i, 1)} aria-label={`Move ${r?.title || 'this report'} later`}><i className="ti ti-arrow-down" aria-hidden="true"></i></button>
                <button type="button" style={s.action} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                  <i className="ti ti-x" aria-hidden="true"></i> Take off
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Add reports</h2>
          <p style={{ ...s.help, margin: '0 0 0.5rem' }}>
            {roleKey ? `${roleOf(roleKey)?.label} reports that aren't on it yet.` : 'Your reports and your roles\' reports that aren\'t on it yet.'}
          </p>
          {addable.length === 0 ? (
            <p style={{ color: GREY_TEXT, fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
              {roleKey ? 'No more reports for this role. Add one from the report builder by saving it to Role reports.' : 'Every report you can use is already on it.'}
            </p>
          ) : addable.map(r => (
            <div key={r.id} style={s.row}>
              <span style={{ flex: 1, minWidth: '12rem' }}>{reportLabel(r)}</span>
              <button type="button" style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }} onClick={() => setDraft([...draft, { report_id: r.id, size: 'normal' }])}>
                <i className="ti ti-plus" aria-hidden="true"></i> Add
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" style={s.primary} onClick={save} disabled={busy}>
            <i className="ti ti-device-floppy" aria-hidden="true"></i> {busy ? 'Saving…' : dashboard ? 'Save changes' : 'Save dashboard'}
          </button>
          <button type="button" style={s.secondary} onClick={() => (dashboard ? startEditing(dashboard, items, false) : router.push('/insights?tab=dashboards'))} disabled={busy}>Cancel</button>
          {dashboard && (
            <button type="button" style={{ ...s.secondary, color: DANGER_TEXT, borderColor: `${DANGER_TEXT}66`, marginLeft: 'auto' }} onClick={remove} disabled={busy}>
              <i className="ti ti-trash" aria-hidden="true"></i> {dashboard.role_key ? 'Delete for everyone' : 'Delete dashboard'}
            </button>
          )}
        </div>
      </div></div>
    );
  }

  if (!dashboard) return null;

  // ---------- View screen ----------
  const resultArea = (report) => {
    const state = results[report.id];
    const source = datasets.find(d => d.key === report.dataset_key)?.title || report.dataset_key;
    if (!state) return <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Loading…</p>;
    if (state.noAccess) return <p style={{ color: '#cbd5e1', fontSize: '0.875rem', margin: 0 }}><i className="ti ti-lock" aria-hidden="true"></i> This report uses {source}, which you don't have access to.</p>;
    if (state.error) return <p style={{ color: DANGER_TEXT, fontSize: '0.875rem', margin: 0 }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {state.error}</p>;
    return <ReportResult result={state.result} fields={fieldsByDataset[report.dataset_key] || []} display={report.display} definition={report.definition} maxRows={25} />;
  };

  return (
    <div style={s.container}><div style={s.wrapper}>
      {backLink}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          {dashboard.role_key && <span style={{ ...s.tag, marginBottom: '0.4rem' }}><i className="ti ti-users" aria-hidden="true"></i>{roleOf(dashboard.role_key)?.label || 'Role'} dashboard</span>}
          <h1 style={s.title}>{dashboard.title}</h1>
          {dashboard.description && (
            <p style={{ ...s.help, color: '#cbd5e1' }}>{dashboard.role_key ? <><strong>What it's for:</strong> {dashboard.description}</> : dashboard.description}</p>
          )}
          {dashboard.role_key && <p style={s.help}>Moving or hiding reports here only changes your own view.</p>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {hiddenCount > 0 && (
            <button type="button" style={s.link} onClick={() => setShowHidden(!showHidden)} aria-pressed={showHidden}>
              <i className={`ti ${showHidden ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true"></i>
              {showHidden ? 'Leave out the ones I hid' : `Show the ${hiddenCount} I hid`}
            </button>
          )}
          {canEdit && (
            <button type="button" style={s.secondary} onClick={() => startEditing(dashboard, items)}>
              <i className="ti ti-pencil" aria-hidden="true"></i> Edit dashboard
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ ...s.card, alignItems: 'flex-start' }}>
          <p style={{ margin: '0 0 0.75rem' }}>{items.length > 0 ? 'You\'ve hidden every report on this dashboard.' : 'There are no reports on this dashboard yet.'}</p>
          {canEdit && items.length === 0 && (
            <button type="button" style={s.primary} onClick={() => startEditing(dashboard, items)}><i className="ti ti-plus" aria-hidden="true"></i> Add reports</button>
          )}
        </div>
      ) : (
        <div style={s.grid}>
          {shown.map((item, index) => {
            const report = reportsById[item.report_id];
            const hidden = !!itemPrefs[item.id]?.is_hidden;
            const canArrange = dashboard.role_key || canEdit;
            return (
              <section key={item.id} style={{ ...s.card, gridColumn: item.size === 'wide' ? '1 / -1' : undefined, opacity: hidden ? 0.6 : 1 }}
                aria-label={report?.title || 'A report you can\'t see'}>
                {report ? (
                  <>
                    <h2 style={s.cardTitle}>{report.title}{hidden && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.8rem' }}> (hidden)</span>}</h2>
                    {report.description ? <p style={{ ...s.help, margin: '0.25rem 0 0.75rem' }}>{report.description}</p> : <div style={{ height: '0.75rem' }} />}
                    {!hidden && <div style={{ marginBottom: '0.5rem' }}>{resultArea(report)}</div>}
                  </>
                ) : (
                  <p style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>
                    <i className="ti ti-lock" aria-hidden="true"></i> A report on this dashboard isn't available to you - it may belong to a role you no longer have.
                  </p>
                )}
                <div style={s.actions}>
                  {report && (
                    <Link href={`/reports?id=${report.id}&view=full`} style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
                      <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open
                    </Link>
                  )}
                  {canArrange && (
                    <>
                      <button type="button" style={s.action} disabled={busy || index === 0} onClick={() => moveItem(item, -1)} aria-label={`Move ${report?.title || 'this report'} earlier`}>
                        <i className="ti ti-arrow-up" aria-hidden="true"></i> Earlier
                      </button>
                      <button type="button" style={s.action} disabled={busy || index === shown.length - 1} onClick={() => moveItem(item, 1)} aria-label={`Move ${report?.title || 'this report'} later`}>
                        <i className="ti ti-arrow-down" aria-hidden="true"></i> Later
                      </button>
                    </>
                  )}
                  {dashboard.role_key && (
                    <button type="button" style={s.action} disabled={busy} onClick={() => setItemHidden(item, !hidden)}>
                      <i className={`ti ${hidden ? 'ti-eye' : 'ti-eye-off'}`} aria-hidden="true"></i> {hidden ? 'Show again' : 'Hide for me'}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div></div>
  );
}
