import { useState, useEffect, useRef } from 'react';
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
//
// A third tab lists dashboards: named pages of reports (pages/dashboard.js).
// Personal ones are ordered with hub_order; role ones are arranged per person
// in dashboard_view_preferences, like role reports.
//
// Reports can also be sent to one person, who gets their own copy (theirs to
// change). Depending on their profile settings a sent report either waits
// for them to accept it or goes straight in, and may be labeled "New".
export default function TajarTracks() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');                 // 'mine' | 'roles' | 'dashboards'
  const [dashboards, setDashboards] = useState([]);
  const [dashPrefs, setDashPrefs] = useState({});         // dashboard id -> { sort_order, is_hidden }
  const [itemCounts, setItemCounts] = useState({});       // dashboard id -> number of reports
  const [showHiddenDash, setShowHiddenDash] = useState(false);
  const [templateFilter, setTemplateFilter] = useState('all');   // 'all' | 'everyone' | a role key
  const [templateSort, setTemplateSort] = useState('mine');      // 'mine' | 'hearts' | 'uses' | 'newest'
  const [stats, setStats] = useState({});                        // template id -> { hearts, uses }
  const [myHearts, setMyHearts] = useState([]);                  // template ids I've hearted
  const [notices, setNotices] = useState([]);
  const [reporting, setReporting] = useState(null);              // template being reported
  const [pins, setPins] = useState([]);                          // my home page pins
  const dragRef = useRef(null);                           // { list, id } being dragged
  const [dragOver, setDragOver] = useState('');
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
  const [pending, setPending] = useState([]);             // reports sent to me, waiting for an answer
  const [newLabel, setNewLabel] = useState('until_opened');
  const [sending, setSending] = useState(null);           // the report being sent

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
      if (router.query.tab === 'dashboards') setTab('dashboards');

      const canUse = makeCanUse(datasetRows, perms);
      await addStarterReportsOnce(me.id, datasetRows, perms);
      const profile = (await getJson(`user_profiles?id=eq.${me.id}&select=sent_reports_new_label`))[0];
      if (profile?.sent_reports_new_label) setNewLabel(profile.sent_reports_new_label);
      await loadMine(me.id, canUse);
      await loadPending(me.id);
      if (held.length > 0) await loadRoleReports(canUse);
      await loadDashboards(me.id);
      setPins(await getJson('home_pins?select=*&order=position.asc'));
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

  // Display names for the people shown on cards.
  const loadNames = async (ids) => {
    const wanted = [...new Set(ids.filter(Boolean))];
    if (wanted.length === 0) return;
    const profiles = await getJson(`user_profiles?id=in.(${wanted.join(',')})&select=id,display_name`);
    setNames(prev => {
      const next = { ...prev };
      profiles.forEach(p => { next[p.id] = p.display_name; });
      return next;
    });
  };

  const loadMine = async (userId = user?.id, usable = canUse) => {
    const rows = await getJson(`saved_reports?select=*&owner_id=eq.${userId}&role_key=is.null&show_on_hub=eq.true&order=hub_order.asc,created_at.asc`);
    setReports(rows);
    loadNames(rows.map(r => r.sent_by));
    rows.forEach(r => runOne(r, usable));
  };

  const loadPending = async (userId = user?.id) => {
    const rows = await getJson(`report_sends?select=*&recipient_id=eq.${userId}&status=eq.pending&order=created_at.asc`);
    setPending(rows);
    loadNames(rows.map(r => r.sender_id));
  };

  const rpc = async (name, body) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await errorDetail(res));
    return res.json().catch(() => null);
  };

  const respond = async (send, accept) => {
    setBusy(true);
    try {
      await rpc('respond_to_sent_report', { p_send_id: send.id, p_accept: accept });
      setPending(pending.filter(p => p.id !== send.id));
      if (accept) {
        notify.success(`Added "${send.title}" to My reports`);
        await loadMine();
      } else {
        notify.success(`Said no thanks to "${send.title}"`);
      }
    } catch (error) {
      notify.error(`Couldn't answer: ${error.message}`);
    }
    setBusy(false);
  };

  const setNew = async (report, value) => {
    setBusy(true);
    try {
      await writeJson(`saved_reports?id=eq.${report.id}`, 'PATCH', { is_new: value });
      setReports(reports.map(r => (r.id === report.id ? { ...r, is_new: value } : r)));
    } catch (error) {
      notify.error(`Couldn't change "${report.title}": ${error.message}`);
    }
    setBusy(false);
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
    loadNames(rows.flatMap(r => [r.owner_id, r.last_edited_by]));
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

  // ---------- Dashboards ----------
  const loadDashboards = async (userId = user?.id) => {
    const [allRows, prefRows, itemRows, statRows, heartRows, noticeRows] = await Promise.all([
      getJson('report_dashboards?select=*&order=hub_order.asc,created_at.asc'),
      getJson('dashboard_view_preferences?select=dashboard_id,sort_order,is_hidden'),
      getJson('report_dashboard_items?select=dashboard_id'),
      getJson('dashboard_template_stats?select=*'),
      getJson(`dashboard_template_hearts?select=dashboard_id&user_id=eq.${userId}`),
      getJson(`insights_notices?select=*&user_id=eq.${userId}&dismissed_at=is.null&order=created_at.desc`)
    ]);
    // Retired dashboard templates (merged or removed) drop out of the list.
    const rows = allRows.filter(d => !d.retired_at);
    const statMap = {};
    statRows.forEach(x => { statMap[x.dashboard_id] = x; });
    setStats(statMap);
    setMyHearts(heartRows.map(h => h.dashboard_id));
    setNotices(noticeRows);
    const prefMap = {};
    prefRows.forEach(p => { prefMap[p.dashboard_id] = p; });
    const counts = {};
    itemRows.forEach(it => { counts[it.dashboard_id] = (counts[it.dashboard_id] || 0) + 1; });
    setDashPrefs(prefMap);
    setItemCounts(counts);
    setDashboards(rows);
    loadNames(rows.map(d => d.owner_id));
  };

  // Your own dashboards, and the templates you can use (for everyone, or for
  // a role you hold). Each person orders and hides templates for themselves.
  const myDashboards = dashboards.filter(d => !d.is_template);
  const roleDashboardsAll = [...dashboards.filter(d => d.is_template)].sort((a, b) => {
    const pa = dashPrefs[a.id]?.sort_order;
    const pb = dashPrefs[b.id]?.sort_order;
    if (pa != null && pb != null && pa !== pb) return pa - pb;
    if (pa != null && pb == null) return -1;
    if (pa == null && pb != null) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  const hiddenDashCount = roleDashboardsAll.filter(d => dashPrefs[d.id]?.is_hidden).length;
  const inTemplateFilter = (d) => templateFilter === 'all' || (templateFilter === 'everyone' ? !d.role_key : d.role_key === templateFilter);
  const sortedTemplates = templateSort === 'mine' ? roleDashboardsAll : [...roleDashboardsAll].sort((a, b) => {
    if (templateSort === 'hearts') return (stats[b.id]?.hearts || 0) - (stats[a.id]?.hearts || 0) || a.title.localeCompare(b.title);
    if (templateSort === 'uses') return (stats[b.id]?.uses || 0) - (stats[a.id]?.uses || 0) || a.title.localeCompare(b.title);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const roleDashboards = sortedTemplates.filter(d => inTemplateFilter(d) && (showHiddenDash || !dashPrefs[d.id]?.is_hidden));

  const moveMyDashboard = async (index, direction) => {
    const other = index + direction;
    if (other < 0 || other >= myDashboards.length) return;
    const next = [...myDashboards];
    [next[index], next[other]] = [next[other], next[index]];
    setBusy(true);
    try {
      await Promise.all(next.map((d, i) => writeJson(`report_dashboards?id=eq.${d.id}`, 'PATCH', { hub_order: i + 1 })));
      setDashboards([...next.map((d, i) => ({ ...d, hub_order: i + 1 })), ...dashboards.filter(d => d.is_template)]);
    } catch (error) {
      notify.error(`Couldn't move it: ${error.message}`);
    }
    setBusy(false);
  };

  const saveDashPrefs = async (rows) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_view_preferences?on_conflict=user_id,dashboard_id`, {
      method: 'POST',
      headers: { ...authHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows.map(r => ({ user_id: user.id, updated_at: new Date().toISOString(), ...r })))
    });
    if (!res.ok) throw new Error(await errorDetail(res));
    const saved = await res.json().catch(() => []);
    if (!Array.isArray(saved) || saved.length === 0) throw new Error('nothing was saved - try reloading, or logging out and back in');
    setDashPrefs(prev => {
      const next = { ...prev };
      saved.forEach(p => { next[p.dashboard_id] = p; });
      return next;
    });
  };

  const moveRoleDashboard = async (d, direction) => {
    const i = roleDashboards.indexOf(d);
    const neighbor = roleDashboards[i + direction];
    if (!neighbor) return;
    const all = [...roleDashboardsAll];
    const a = all.indexOf(d);
    const b = all.indexOf(neighbor);
    [all[a], all[b]] = [all[b], all[a]];
    setBusy(true);
    try {
      await saveDashPrefs(all.map((x, index) => ({ dashboard_id: x.id, sort_order: index + 1, is_hidden: !!dashPrefs[x.id]?.is_hidden })));
    } catch (error) {
      notify.error(`Couldn't move it: ${error.message}`);
    }
    setBusy(false);
  };

  const setDashHidden = async (d, hidden) => {
    setBusy(true);
    try {
      await saveDashPrefs([{ dashboard_id: d.id, sort_order: dashPrefs[d.id]?.sort_order ?? null, is_hidden: hidden }]);
      notify.success(hidden ? `Hid "${d.title}". Only you see this change.` : `"${d.title}" is showing again`);
    } catch (error) {
      notify.error(`Couldn't change "${d.title}": ${error.message}`);
    }
    setBusy(false);
  };

  // ---------- Drag and drop to reorder (Earlier / Later still work too) ----------
  // Dropping a card on another puts it in that card's place.
  const reorder = (list, fromId, toId) => {
    const next = [...list];
    const from = next.findIndex(x => x.id === fromId);
    const to = next.findIndex(x => x.id === toId);
    if (from < 0 || to < 0) return null;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const dropOn = async (list, fromId, toId) => {
    setBusy(true);
    try {
      if (list === 'mine') {
        const next = reorder(reports, fromId, toId);
        if (!next) return;
        setReports(next.map((r, i) => ({ ...r, hub_order: i + 1 })));
        await Promise.all(next.map((r, i) => (r.hub_order === i + 1 ? null : writeJson(`saved_reports?id=eq.${r.id}`, 'PATCH', { hub_order: i + 1 }))));
      } else if (list === 'roles') {
        const next = reorder(orderedRoleReports, fromId, toId);
        if (next) await savePrefs(next.map((r, i) => ({ report_id: r.id, sort_order: i + 1, is_hidden: !!prefs[r.id]?.is_hidden })));
      } else if (list === 'mydash') {
        const next = reorder(myDashboards, fromId, toId);
        if (!next) return;
        setDashboards([...next.map((d, i) => ({ ...d, hub_order: i + 1 })), ...dashboards.filter(d => d.is_template)]);
        await Promise.all(next.map((d, i) => (d.hub_order === i + 1 ? null : writeJson(`report_dashboards?id=eq.${d.id}`, 'PATCH', { hub_order: i + 1 }))));
      } else if (list === 'roledash') {
        const next = reorder(roleDashboardsAll, fromId, toId);
        if (next) await saveDashPrefs(next.map((d, i) => ({ dashboard_id: d.id, sort_order: i + 1, is_hidden: !!dashPrefs[d.id]?.is_hidden })));
      }
    } catch (error) {
      notify.error(`Couldn't move it: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const dragProps = (list, id) => ({
    draggable: true,
    onDragStart: (e) => {
      dragRef.current = { list, id };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* the ref is enough */ }
    },
    onDragOver: (e) => {
      if (dragRef.current?.list !== list) return;
      e.preventDefault();
      if (dragOver !== id) setDragOver(id);
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(''); },
    onDrop: (e) => {
      e.preventDefault();
      const d = dragRef.current;
      dragRef.current = null;
      setDragOver('');
      if (d && d.list === list && d.id !== id) dropOn(list, d.id, id);
    },
    onDragEnd: () => { dragRef.current = null; setDragOver(''); }
  });
  const dragStyle = (id) => (dragOver === id ? { outline: `2px dashed ${PERSONAL_TEXT}`, outlineOffset: '2px' } : {}) ;
  const grip = <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT, position: 'absolute', top: '0.6rem', right: '0.6rem', cursor: 'grab' }} title="Drag to move" aria-hidden="true"></i>;

  // Hearts: one per person per dashboard template.
  const toggleHeart = async (d) => {
    const on = myHearts.includes(d.id);
    setMyHearts(on ? myHearts.filter(x => x !== d.id) : [...myHearts, d.id]);
    setStats(prev => ({ ...prev, [d.id]: { ...(prev[d.id] || { uses: 0 }), hearts: Math.max(0, (prev[d.id]?.hearts || 0) + (on ? -1 : 1)) } }));
    try {
      if (on) await writeJson(`dashboard_template_hearts?dashboard_id=eq.${d.id}&user_id=eq.${user.id}`, 'DELETE');
      else await writeJson('dashboard_template_hearts', 'POST', { user_id: user.id, dashboard_id: d.id });
    } catch (error) {
      notify.error(`Couldn't change your heart: ${error.message}`);
      loadDashboards();
    }
  };

  const dismissNotice = async (n) => {
    try {
      await writeJson(`insights_notices?id=eq.${n.id}`, 'PATCH', { dismissed_at: new Date().toISOString() });
      setNotices(notices.filter(x => x.id !== n.id));
    } catch (error) {
      notify.error(`Couldn't dismiss it: ${error.message}`);
    }
  };

  // ---------- Home page pins ----------
  const pinFor = (kind, id) => pins.find(p => (kind === 'report' ? p.report_id : p.dashboard_id) === id);
  const togglePin = async (kind, item) => {
    const existing = pinFor(kind, item.id);
    setBusy(true);
    try {
      if (existing) {
        await writeJson(`home_pins?id=eq.${existing.id}`, 'DELETE');
        setPins(pins.filter(p => p.id !== existing.id));
        notify.success(`Unpinned "${item.title}" from your home page`);
      } else {
        const position = Math.max(0, ...pins.map(p => p.position || 0)) + 1;
        const rows = await writeJson('home_pins', 'POST', { user_id: user.id, [kind === 'report' ? 'report_id' : 'dashboard_id']: item.id, position });
        setPins([...pins, rows[0]]);
        notify.success(`Pinned "${item.title}" to your home page`);
      }
    } catch (error) {
      notify.error(error.message);
    }
    setBusy(false);
  };
  const pinButton = (kind, item) => {
    const on = !!pinFor(kind, item.id);
    return (
      <button type="button" style={{ ...s.action, color: on ? '#fff' : GREY_TEXT }} disabled={busy} aria-pressed={on} onClick={() => togglePin(kind, item)}>
        <i className={`ti ${on ? 'ti-pinned-filled' : 'ti-pin'}`} style={{ color: on ? PERSONAL_TEXT : undefined }} aria-hidden="true"></i> {on ? 'Pinned to home' : 'Pin to home'}
      </button>
    );
  };

  const copyTemplate = async (d) => {
    setBusy(true);
    try {
      const newId = await rpc('use_dashboard_template', { p_template_id: d.id });
      notify.success(`"${d.title}" is now one of your dashboards. Change it however you like - the dashboard template stays as it is.`);
      router.push(`/dashboard?id=${newId}`);
    } catch (error) {
      notify.error(`Couldn't use the dashboard template: ${error.message}`);
      setBusy(false);
    }
  };

  const canEditDashboard = (d) => (!d.role_key
    ? d.owner_id === user?.id
    : myRoles.some(r => r.key === d.role_key) && (d.owner_id === user?.id || permissions.includes('reporting.manage.content')));

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
    router.replace(next === 'mine' ? '/insights' : `/insights?tab=${next}`, undefined, { shallow: true });
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
                : tab === 'roles'
                  ? 'Reports shared with everyone who has the same role as you. Each one shows you your own data, and how you arrange them only changes your view.'
                  : 'Pages that gather several reports in one place. Your dashboards are only for you. Dashboard templates are starting points other people made - use one to get your own copy to change however you like.'}
            </p>
          </div>
          <Link href={tab === 'roles' ? '/reports?for=role' : tab === 'dashboards' ? '/dashboard?new=1' : '/reports'} style={s.newBtn}>
            <i className="ti ti-plus" aria-hidden="true"></i> {tab === 'roles' ? 'New role report' : tab === 'dashboards' ? 'New dashboard' : 'New report'}
          </Link>
        </div>

        <div style={s.tabs} role="tablist" aria-label="Which reports">
          <button type="button" role="tab" aria-selected={tab === 'mine'} style={s.tab(tab === 'mine')} onClick={() => switchTab('mine')}>
            <i className="ti ti-user" aria-hidden="true"></i> My reports
          </button>
          {myRoles.length > 0 && (
            <button type="button" role="tab" aria-selected={tab === 'roles'} style={s.tab(tab === 'roles')} onClick={() => switchTab('roles')}>
              <i className="ti ti-users" aria-hidden="true"></i> Role reports
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'dashboards'} style={s.tab(tab === 'dashboards')} onClick={() => switchTab('dashboards')}>
            <i className="ti ti-layout-dashboard" aria-hidden="true"></i> Dashboards
          </button>
        </div>

        {notices.length > 0 && (
          <section aria-label="Notices" style={{ ...s.card, marginBottom: '1.25rem', borderColor: PERSONAL_TEXT }}>
            {notices.map((n, i) => (
              <div key={n.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', paddingTop: i ? '0.6rem' : 0, marginTop: i ? '0.6rem' : 0, borderTop: i ? '1px solid #334155' : 'none' }}>
                <i className="ti ti-info-circle" style={{ color: PERSONAL_TEXT, fontSize: '1.2rem' }} aria-hidden="true"></i>
                <div style={{ flex: 1, fontSize: '0.9rem' }}>
                  {n.message}
                  <div style={{ ...s.meta, margin: '0.2rem 0 0' }}>
                    {when(n.created_at)}
                    {n.link && <> · <Link href={n.link} style={{ color: PERSONAL_TEXT }}>Take a look</Link></>}
                  </div>
                </div>
                <button type="button" style={s.action} onClick={() => dismissNotice(n)}><i className="ti ti-x" aria-hidden="true"></i> Dismiss</button>
              </div>
            ))}
          </section>
        )}

        {tab === 'mine' && pending.length > 0 && (
          <section aria-label="Reports sent to you" style={{ ...s.card, marginBottom: '1.25rem', borderColor: PERSONAL_TEXT }}>
            <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Sent to you</h2>
            <p style={{ ...s.meta, margin: '0 0 0.5rem' }}>
              Adding one gives you your own copy, to change however you like. It shows you your own data, not the sender's.
            </p>
            {pending.map(send => (
              <div key={send.id} style={{ borderTop: '1px solid #334155', padding: '0.75rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: '14rem', flex: 1 }}>
                  <div style={{ fontWeight: 'bold' }}>{send.title}</div>
                  <div style={s.meta}>
                    From {names[send.sender_id] || 'someone'} on {when(send.created_at)}
                    {' · '}{datasets.find(d => d.key === send.dataset_key)?.title || send.dataset_key}
                  </div>
                  {send.note && <p style={{ margin: '0.2rem 0 0', color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.85rem' }}>"{send.note}"</p>}
                  {!canUse(send.dataset_key) && (
                    <p style={{ margin: '0.3rem 0 0', color: '#cbd5e1', fontSize: '0.8rem' }}>
                      <i className="ti ti-lock" aria-hidden="true"></i> This uses information you don't have access to, so it won't show you anything yet.
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="button" style={{ ...s.newBtn, border: 'none', cursor: 'pointer', fontSize: '0.85rem' }} disabled={busy} onClick={() => respond(send, true)}>
                    <i className="ti ti-check" aria-hidden="true"></i> Add to my reports
                  </button>
                  <button type="button" style={s.action} disabled={busy} onClick={() => respond(send, false)}>
                    <i className="ti ti-x" aria-hidden="true"></i> No thanks
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === 'mine' && (reports.length === 0 ? (
          <div style={{ ...s.card, alignItems: 'flex-start' }}>
            <p style={{ margin: '0 0 0.75rem' }}>You don't have any reports here yet.</p>
            <Link href="/reports" style={s.newBtn}><i className="ti ti-plus" aria-hidden="true"></i> Build your first report</Link>
          </div>
        ) : (
          <div style={s.grid}>
            {reports.map((report, index) => (
              <section key={report.id} {...dragProps('mine', report.id)} style={{ ...s.card, position: 'relative', cursor: 'grab', ...dragStyle(report.id) }} aria-label={report.title}>
                {grip}
                {report.is_new && (
                  <span style={{ ...s.roleTag, color: '#fff', borderColor: PERSONAL_TEXT, background: `${PERSONAL_FILL}55` }}>
                    <i className="ti ti-sparkles" aria-hidden="true"></i> New
                  </span>
                )}
                <h2 style={s.cardTitle}>{report.title}</h2>
                {report.description ? <p style={s.cardDesc}>{report.description}</p> : <div style={{ height: '0.75rem' }} />}
                {report.sent_by && (
                  <div style={{ ...s.meta, margin: '-0.4rem 0 0.75rem' }}>
                    Sent by {names[report.sent_by] || 'someone'} on {when(report.sent_at)}
                    {report.sent_note && <p style={{ margin: '0.3rem 0 0', color: '#cbd5e1', fontStyle: 'italic' }}>"{report.sent_note}"</p>}
                  </div>
                )}
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
                  <button type="button" style={s.action} disabled={busy} onClick={() => setSending(report)}>
                    <i className="ti ti-send" aria-hidden="true"></i> Send a copy
                  </button>
                  {pinButton('report', report)}
                  {report.sent_by && (
                    <button type="button" style={s.action} disabled={busy} onClick={() => setNew(report, !report.is_new)}>
                      <i className={`ti ${report.is_new ? 'ti-mail-opened' : 'ti-mail'}`} aria-hidden="true"></i> {report.is_new ? 'Mark as seen' : 'Mark as new'}
                    </button>
                  )}
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
                    <section key={report.id} {...dragProps('roles', report.id)} style={{ ...s.card, opacity: hidden ? 0.6 : 1, position: 'relative', cursor: 'grab', ...dragStyle(report.id) }} aria-label={report.title}>
                      {grip}
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
                        <button type="button" style={s.action} disabled={busy} onClick={() => setSending(report)}>
                          <i className="ti ti-send" aria-hidden="true"></i> Send a copy
                        </button>
                        {pinButton('report', report)}
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

        {tab === 'dashboards' && (
          <div>
            <h2 style={{ ...s.cardTitle, margin: '0 0 0.75rem' }}>My dashboards</h2>
            {myDashboards.length === 0 ? (
              <div style={{ ...s.card, alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <p style={{ margin: '0 0 0.75rem' }}>You don't have any dashboards yet. A dashboard gathers several reports on one page, in the order you choose.</p>
                <Link href="/dashboard?new=1" style={s.newBtn}><i className="ti ti-plus" aria-hidden="true"></i> Make a dashboard</Link>
              </div>
            ) : (
              <div style={{ ...s.grid, marginBottom: '1.5rem' }}>
                {myDashboards.map((d, index) => (
                  <section key={d.id} {...dragProps('mydash', d.id)} style={{ ...s.card, position: 'relative', cursor: 'grab', ...dragStyle(d.id) }} aria-label={d.title}>
                    {grip}
                    <h3 style={s.cardTitle}>{d.title}</h3>
                    {d.description && <p style={s.cardDesc}>{d.description}</p>}
                    <p style={s.meta}>{itemCounts[d.id] || 0} report{(itemCounts[d.id] || 0) === 1 ? '' : 's'}</p>
                    <div style={s.actions}>
                      <Link href={`/dashboard?id=${d.id}`} style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
                        <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open
                      </Link>
                      <Link href={`/dashboard?id=${d.id}&edit=1`} style={s.action}>
                        <i className="ti ti-pencil" aria-hidden="true"></i> Edit
                      </Link>
                      {pinButton('dashboard', d)}
                      <button type="button" style={s.action} disabled={busy || index === 0} onClick={() => moveMyDashboard(index, -1)} aria-label={`Move "${d.title}" earlier`}>
                        <i className="ti ti-arrow-up" aria-hidden="true"></i> Earlier
                      </button>
                      <button type="button" style={s.action} disabled={busy || index === myDashboards.length - 1} onClick={() => moveMyDashboard(index, 1)} aria-label={`Move "${d.title}" later`}>
                        <i className="ti ti-arrow-down" aria-hidden="true"></i> Later
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', margin: '0 0 0.5rem' }}>
              <h2 style={{ ...s.cardTitle, margin: 0 }}>Dashboard templates</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                {hiddenDashCount > 0 && (
                  <button type="button" style={s.link} onClick={() => setShowHiddenDash(!showHiddenDash)} aria-pressed={showHiddenDash}>
                    <i className={`ti ${showHiddenDash ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true"></i>
                    {showHiddenDash ? 'Leave out the ones I hid' : `Show the ${hiddenDashCount} I hid`}
                  </button>
                )}
                <Link href="/dashboard?new=1&template=1" style={s.link}><i className="ti ti-plus" aria-hidden="true"></i> New dashboard template</Link>
              </div>
            </div>
            <p style={{ ...s.meta, margin: '0 0 0.75rem' }}>
              Using a dashboard template gives you your own dashboard. A role's shared reports on it stay linked, so their updates reach you; everything else becomes your own copy.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <label htmlFor="template-sort" style={{ color: GREY_TEXT, fontSize: '0.85rem' }}>Order:</label>
              <select id="template-sort" value={templateSort} onChange={(e) => setTemplateSort(e.target.value)}
                style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}>
                <option value="mine">My order</option>
                <option value="hearts">Most hearted</option>
                <option value="uses">Most used</option>
                <option value="newest">Newest first</option>
              </select>
              {templateSort !== 'mine' && <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>Switch to "My order" to drag them into your own order.</span>}
            </div>
            {myRoles.length > 0 && (
              <div style={{ ...s.segment, marginBottom: '0.75rem' }} role="group" aria-label="Show dashboard templates for">
                <button type="button" style={s.segmentBtn(templateFilter === 'all')} aria-pressed={templateFilter === 'all'} onClick={() => setTemplateFilter('all')}>All</button>
                <button type="button" style={s.segmentBtn(templateFilter === 'everyone')} aria-pressed={templateFilter === 'everyone'} onClick={() => setTemplateFilter('everyone')}>For everyone</button>
                {myRoles.map(r => (
                  <button key={r.key} type="button" style={s.segmentBtn(templateFilter === r.key)} aria-pressed={templateFilter === r.key} onClick={() => setTemplateFilter(r.key)}>For {r.label}</button>
                ))}
              </div>
            )}
            {roleDashboards.length === 0 ? (
              <div style={{ ...s.card, alignItems: 'flex-start' }}>
                <p style={{ margin: 0 }}>
                  {roleDashboardsAll.some(inTemplateFilter) ? 'You\'ve hidden all of these.' : 'There aren\'t any dashboard templates here yet. You can make one from any of your dashboards with "Make a dashboard template from this".'}
                </p>
              </div>
            ) : (
              <div style={s.grid}>
                {roleDashboards.map((d, index) => {
                  const hidden = !!dashPrefs[d.id]?.is_hidden;
                  return (
                    <section key={d.id} {...(templateSort === 'mine' ? dragProps('roledash', d.id) : {})} style={{ ...s.card, opacity: hidden ? 0.6 : 1, position: 'relative', cursor: templateSort === 'mine' ? 'grab' : 'default', ...dragStyle(d.id) }} aria-label={d.title}>
                      {templateSort === 'mine' && grip}
                      <span style={{ ...s.roleTag, color: '#fff', borderColor: PERSONAL_TEXT }}>
                        <i className="ti ti-template" aria-hidden="true"></i>Dashboard template · for {d.role_key ? roleLabel(d.role_key) : 'everyone'}
                      </span>
                      <h3 style={s.cardTitle}>{d.title}{hidden && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.8rem' }}> (hidden)</span>}</h3>
                      <p style={{ ...s.cardDesc, color: '#cbd5e1', margin: '0.35rem 0 0.25rem' }}><strong>What it's for:</strong> {d.description}</p>
                      <p style={s.meta}>
                        {itemCounts[d.id] || 0} report{(itemCounts[d.id] || 0) === 1 ? '' : 's'}
                        {' · '}used {stats[d.id]?.uses || 0} time{(stats[d.id]?.uses || 0) === 1 ? '' : 's'}
                        {' · '}made by {names[d.owner_id] || 'someone'}{d.owner_id === user.id ? ' (you)' : ''}
                        {' · '}last changed {when(d.updated_at)}
                      </p>
                      <div style={s.actions}>
                        <button type="button" style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }} disabled={busy} onClick={() => copyTemplate(d)}>
                          <i className="ti ti-copy" aria-hidden="true"></i> Use as my own dashboard
                        </button>
                        <Link href={`/dashboard?id=${d.id}`} style={s.action}>
                          <i className="ti ti-eye" aria-hidden="true"></i> Preview
                        </Link>
                        <button type="button" style={{ ...s.action, color: myHearts.includes(d.id) ? '#fff' : GREY_TEXT }} aria-pressed={myHearts.includes(d.id)}
                          onClick={() => toggleHeart(d)} aria-label={`${myHearts.includes(d.id) ? 'Take back your heart for' : 'Heart'} "${d.title}" (${stats[d.id]?.hearts || 0} so far)`}>
                          <i className={`ti ${myHearts.includes(d.id) ? 'ti-heart-filled' : 'ti-heart'}`} style={{ color: myHearts.includes(d.id) ? DANGER_TEXT : undefined }} aria-hidden="true"></i>
                          {stats[d.id]?.hearts || 0}{myHearts.includes(d.id) ? ' · hearted' : ''}
                        </button>
                        {canEditDashboard(d) && (
                          <Link href={`/dashboard?id=${d.id}&edit=1`} style={s.action}>
                            <i className="ti ti-pencil" aria-hidden="true"></i> Edit dashboard template
                          </Link>
                        )}
                        {templateSort === 'mine' && (
                          <>
                            <button type="button" style={s.action} disabled={busy || index === 0} onClick={() => moveRoleDashboard(d, -1)} aria-label={`Move "${d.title}" earlier in your view`}>
                              <i className="ti ti-arrow-up" aria-hidden="true"></i> Earlier
                            </button>
                            <button type="button" style={s.action} disabled={busy || index === roleDashboards.length - 1} onClick={() => moveRoleDashboard(d, 1)} aria-label={`Move "${d.title}" later in your view`}>
                              <i className="ti ti-arrow-down" aria-hidden="true"></i> Later
                            </button>
                          </>
                        )}
                        <button type="button" style={s.action} disabled={busy} onClick={() => setDashHidden(d, !hidden)}>
                          <i className={`ti ${hidden ? 'ti-eye' : 'ti-eye-off'}`} aria-hidden="true"></i> {hidden ? 'Show again' : 'Hide for me'}
                        </button>
                        {d.owner_id !== user.id && (
                          <button type="button" style={s.action} onClick={() => setReporting(d)}>
                            <i className="ti ti-flag" aria-hidden="true"></i> Report
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
      {sending && <SendDialog report={sending} rpc={rpc} datasets={datasets} onClose={() => setSending(null)} />}
      {reporting && <ReportTemplateDialog template={reporting} templates={roleDashboardsAll} rpc={rpc} roleLabel={roleLabel} onClose={() => setReporting(null)} />}
    </div>
  );
}

// Send someone their own copy of a report. Only people who have chosen to be
// findable show up, by display name.
function SendDialog({ report, rpc, datasets, onClose }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const [person, setPerson] = useState(null);
  const [canSee, setCanSee] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const source = datasets.find(d => d.key === report.dataset_key)?.title || report.dataset_key;

  useEffect(() => {
    const close = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);

  // Search as they type, once there are at least two letters.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setFound([]); return; }
    let stale = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await rpc('find_people_for_reports', { p_query: text });
        if (!stale) setFound(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (!stale) notify.error(`Couldn't search: ${error.message}`);
      }
      if (!stale) setSearching(false);
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  const choose = async (p) => {
    setPerson(p);
    try {
      setCanSee(!!(await rpc('report_recipient_can_use', { p_recipient: p.id, p_dataset: report.dataset_key })));
    } catch (error) {
      setCanSee(true);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const outcome = await rpc('send_report', { p_report_id: report.id, p_recipient: person.id, p_note: note });
      notify.success(outcome === 'added'
        ? `Sent "${report.title}" to ${person.display_name}. It's in their reports now.`
        : `Sent "${report.title}" to ${person.display_name}. They'll see it and can choose to add it.`);
      onClose();
    } catch (error) {
      notify.error(`Couldn't send: ${error.message}`);
      setBusy(false);
    }
  };

  const box = { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem' };
  const btn = (primary) => ({ background: primary ? PERSONAL_FILL : 'transparent', color: '#fff', border: primary ? 'none' : '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' });

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5rem 1rem 1rem', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="send-title"
        style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', width: '100%', maxWidth: '32rem', color: '#fff' }}>
        <h2 id="send-title" style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>Send a copy of "{report.title}"</h2>
        <p style={{ color: GREY_TEXT, fontSize: '0.85rem', margin: '0 0 1rem' }}>
          They get their own copy to change however they like. It shows them their own data, never yours.
          Only people who have chosen to be findable on their profile show up here.
        </p>

        {!person ? (
          <>
            <label htmlFor="send-search" style={{ display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Who should get it?</label>
            <input id="send-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} style={box} placeholder="Type at least two letters of their display name" autoComplete="off" />
            <div style={{ minHeight: '6rem', marginTop: '0.5rem' }} aria-live="polite">
              {query.trim().length >= 2 && !searching && found.length === 0 && (
                <p style={{ color: GREY_TEXT, fontSize: '0.85rem' }}>Nobody findable by that name. They may need to turn on "Let people find me to send me reports" on their profile.</p>
              )}
              {found.map(p => (
                <button key={p.id} type="button" onClick={() => choose(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'transparent', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', padding: '0.5rem 0.6rem', marginBottom: '0.35rem', cursor: 'pointer' }}>
                  <i className="ti ti-user" aria-hidden="true"></i>{p.display_name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0.6rem', border: `1px solid ${PERSONAL_TEXT}`, borderRadius: '0.375rem', background: `${PERSONAL_FILL}33` }}>
              <span><i className="ti ti-user" aria-hidden="true"></i> {person.display_name}</span>
              <button type="button" onClick={() => { setPerson(null); setCanSee(true); }} style={{ background: 'none', border: 'none', color: PERSONAL_TEXT, cursor: 'pointer', fontSize: '0.85rem' }}>Choose someone else</button>
            </div>
            {!canSee && (
              <p style={{ fontSize: '0.85rem', margin: '0.6rem 0 0', color: '#cbd5e1' }}>
                <i className="ti ti-alert-triangle" style={{ color: DANGER_TEXT }} aria-hidden="true"></i>{' '}
                {person.display_name} doesn't have access to {source}, so the report won't show them anything unless that changes. You can still send it.
              </p>
            )}
            <label htmlFor="send-note" style={{ display: 'block', fontWeight: 'bold', fontSize: '0.85rem', margin: '0.9rem 0 0.3rem' }}>
              A note <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(optional)</span>
            </label>
            <textarea id="send-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} style={{ ...box, resize: 'vertical' }}
              placeholder="For example: this is the one I use to see what changed in the camp songbook" />
          </>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" style={btn(true)} disabled={!person || busy} onClick={send}>
            <i className="ti ti-send" aria-hidden="true"></i> {busy ? 'Sending…' : 'Send'}
          </button>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Report a dashboard template: as a possible duplicate of another one, or
// for some other problem. Goes to the Insights admin page.
function ReportTemplateDialog({ template, templates, rpc, roleLabel, onClose }) {
  const [kind, setKind] = useState('duplicate');
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const others = templates.filter(t => t.id !== template.id);

  useEffect(() => {
    const close = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);

  const send = async () => {
    if (kind === 'duplicate' && !other) { notify.error('Choose the dashboard template it duplicates.'); return; }
    if (kind === 'problem' && !note.trim()) { notify.error('Say what the problem is, so an admin knows what to look for.'); return; }
    setBusy(true);
    try {
      await rpc('report_dashboard_template', { p_dashboard_id: template.id, p_kind: kind, p_duplicate_of: kind === 'duplicate' ? other : null, p_note: note });
      notify.success('Thanks - an admin will take a look. You\'ll get a notice here in Tajar Tracks when they do.');
      onClose();
    } catch (error) {
      notify.error(`Couldn't send the report: ${error.message}`);
      setBusy(false);
    }
  };

  const box = { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem', boxSizing: 'border-box' };
  const btn = (primary) => ({ background: primary ? PERSONAL_FILL : 'transparent', color: '#fff', border: primary ? 'none' : '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' });
  const seg = (on) => ({ padding: '0.4rem 0.85rem', border: 'none', background: on ? PERSONAL_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' });

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5rem 1rem 1rem', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-title"
        style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', width: '100%', maxWidth: '32rem', color: '#fff' }}>
        <h2 id="report-title" style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>Report "{template.title}"</h2>
        <p style={{ color: GREY_TEXT, fontSize: '0.85rem', margin: '0 0 1rem' }}>Reports go to the admins. The person who made it isn't told who reported it.</p>
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden', marginBottom: '0.9rem' }} role="group" aria-label="What's wrong">
          <button type="button" style={seg(kind === 'duplicate')} aria-pressed={kind === 'duplicate'} onClick={() => setKind('duplicate')}>It's a duplicate</button>
          <button type="button" style={seg(kind === 'problem')} aria-pressed={kind === 'problem'} onClick={() => setKind('problem')}>Something else is wrong</button>
        </div>
        {kind === 'duplicate' && (
          <>
            <label htmlFor="dup-of" style={{ display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Which dashboard template does it duplicate?</label>
            <select id="dup-of" value={other} onChange={(e) => setOther(e.target.value)} style={box}>
              <option value="">Choose one…</option>
              {others.map(t => <option key={t.id} value={t.id}>{t.title} (for {t.role_key ? roleLabel(t.role_key) : 'everyone'})</option>)}
            </select>
          </>
        )}
        <label htmlFor="report-note" style={{ display: 'block', fontWeight: 'bold', fontSize: '0.85rem', margin: '0.9rem 0 0.3rem' }}>
          {kind === 'problem' ? 'What\'s wrong?' : 'A note'} <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>{kind === 'problem' ? '(required)' : '(optional)'}</span>
        </label>
        <textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} style={{ ...box, resize: 'vertical' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" style={btn(true)} disabled={busy} onClick={send}><i className="ti ti-flag" aria-hidden="true"></i> {busy ? 'Sending…' : 'Send report'}</button>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
