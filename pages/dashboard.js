import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import {
  SUPABASE_URL, authHeaders, getJson, writeJson, errorDetail, runReport, ReportResult,
  PERSONAL_TEXT, PERSONAL_FILL, GREY_TEXT, DANGER_TEXT
} from '../lib/reports';

// A dashboard: a named page of saved reports laid out in boxes.
// It points to the reports themselves, so changing a report changes it on
// every dashboard it's on.
//
//   /dashboard?id=…           view
//   /dashboard?id=…&edit=1    change it (if allowed)
//   /dashboard?new=1          make one (&for=role to start it as a role dashboard)
//
// Layout (report_dashboards.layout) is a list of rows; each row type has a
// fixed number of boxes. A report's position is the number of its box,
// counting from the top left. Each box also says how many results to show
// (row_limit; empty = all).
//
// Order follows the style guide: drag and drop wherever things are put in
// order, always with a way to do the same thing without dragging.

const ROW_TYPES = {
  '1': { label: 'One wide box', boxes: 1 },
  '2': { label: 'Two side by side', boxes: 2 },
  '3': { label: 'Three side by side', boxes: 3 },
  'big-left': { label: 'One big box, two small on the right', boxes: 3 },
  'big-right': { label: 'One big box, two small on the left', boxes: 3 }
};
const BOX_NAMES = {
  '1': [''],
  '2': ['left', 'right'],
  '3': ['left', 'middle', 'right'],
  'big-left': ['big box', 'top right', 'bottom right'],
  'big-right': ['big box', 'top left', 'bottom left']
};
const PRESETS = [
  { label: 'Two on top, one wide below', rows: ['2', '1'] },
  { label: 'One wide on top, two below', rows: ['1', '2'] },
  { label: 'Three across', rows: ['3'] },
  { label: 'One big beside two small', rows: ['big-left'] },
  { label: 'Four in a grid', rows: ['2', '2'] },
  { label: 'One under another', rows: ['1', '1', '1'] }
];
const LIMIT_CHOICES = [5, 10, 25, 50];
const SLOW_ABOVE = 100;

const boxCount = (rows) => rows.reduce((n, t) => n + (ROW_TYPES[t]?.boxes || 0), 0);
const rowStarts = (rows) => {
  const starts = [];
  let n = 0;
  rows.forEach(t => { starts.push(n); n += ROW_TYPES[t]?.boxes || 0; });
  return starts;
};
const boxName = (rows, box) => {
  const starts = rowStarts(rows);
  for (let r = rows.length - 1; r >= 0; r--) {
    if (box >= starts[r]) {
      const part = BOX_NAMES[rows[r]]?.[box - starts[r]];
      return `Row ${r + 1}${part ? `, ${part}` : ''}`;
    }
  }
  return `Box ${box + 1}`;
};

// Dashboards made before layouts: wide reports get a row of their own, the
// rest pair up two to a row.
const layoutFromOldSizes = (items) => {
  const rows = [];
  const boxes = [];
  let openPair = -1;
  [...items].sort((a, b) => a.position - b.position).forEach(it => {
    if (it.size === 'wide') {
      rows.push('1');
      boxes.push(it);
      openPair = -1;
    } else if (openPair >= 0) {
      boxes[openPair] = it;
      openPair = -1;
    } else {
      rows.push('2');
      boxes.push(it, null);
      openPair = boxes.length - 1;
    }
  });
  if (rows.length === 0) rows.push('2', '1');
  while (boxes.length < boxCount(rows)) boxes.push(null);
  return { rows, boxes };
};

const layoutOf = (dashboard, items) => {
  const rows = Array.isArray(dashboard?.layout) && dashboard.layout.length > 0 ? dashboard.layout : null;
  if (!rows) return layoutFromOldSizes(items);
  const boxes = Array(boxCount(rows)).fill(null);
  const extra = [];
  [...items].sort((a, b) => a.position - b.position).forEach(it => {
    if (it.position >= 0 && it.position < boxes.length && !boxes[it.position]) boxes[it.position] = it;
    else extra.push(it);
  });
  return { rows, boxes, extra };
};

// Narrow screens show every box full width, one under another.
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return narrow;
}

// One row of boxes, laid out by its type.
function LayoutRow({ type, narrow, children }) {
  const kids = Array.isArray(children) ? children : [children];
  const gap = '1rem';
  if (narrow || type === '1') {
    return <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap }}>{kids}</div>;
  }
  if (type === '2' || type === '3') {
    return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${type}, minmax(0, 1fr))`, gap }}>{kids}</div>;
  }
  const bigLeft = type === 'big-left';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: bigLeft ? 'minmax(0, 2fr) minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 2fr)', gridTemplateRows: 'auto auto', gap }}>
      <div style={{ gridColumn: bigLeft ? 1 : 2, gridRow: '1 / span 2', display: 'flex' }}>{kids[0]}</div>
      <div style={{ gridColumn: bigLeft ? 2 : 1, gridRow: 1, display: 'flex' }}>{kids[1]}</div>
      <div style={{ gridColumn: bigLeft ? 2 : 1, gridRow: 2, display: 'flex' }}>{kids[2]}</div>
    </div>
  );
}

// A small picture of a layout, for choosing one.
function LayoutPicture({ rows }) {
  const cell = { background: '#475569', borderRadius: '2px', minHeight: '0.6rem' };
  return (
    <div style={{ width: '4.5rem', display: 'flex', flexDirection: 'column', gap: '3px' }} aria-hidden="true">
      {rows.map((t, i) => (
        t === 'big-left' || t === 'big-right' ? (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: t === 'big-left' ? '2fr 1fr' : '1fr 2fr', gridTemplateRows: '0.6rem 0.6rem', gap: '3px' }}>
            <div style={{ ...cell, gridColumn: t === 'big-left' ? 1 : 2, gridRow: '1 / span 2' }} />
            <div style={{ ...cell, gridColumn: t === 'big-left' ? 2 : 1, gridRow: 1 }} />
            <div style={{ ...cell, gridColumn: t === 'big-left' ? 2 : 1, gridRow: 2 }} />
          </div>
        ) : (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${ROW_TYPES[t]?.boxes || 1}, 1fr)`, gap: '3px' }}>
            {Array.from({ length: ROW_TYPES[t]?.boxes || 1 }).map((_, j) => <div key={j} style={cell} />)}
          </div>
        )
      ))}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const narrow = useNarrow();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);
  const [myRoles, setMyRoles] = useState([]);              // [{ key, label }]
  const [datasets, setDatasets] = useState([]);
  const [fieldsByDataset, setFieldsByDataset] = useState({});

  const [dashboard, setDashboard] = useState(null);        // saved row, or null when new
  const [items, setItems] = useState([]);                  // saved items
  const [reportsById, setReportsById] = useState({});      // reports this person can see
  const [itemPrefs, setItemPrefs] = useState({});          // item id -> { is_hidden }
  const [results, setResults] = useState({});
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // Editing
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [rows, setRows] = useState(['2', '1']);
  const [boxes, setBoxes] = useState([null, null, null]);  // per box: { id?, report_id, row_limit } or null
  const [tray, setTray] = useState([]);                    // added but not in a box yet
  const [eligible, setEligible] = useState([]);
  const [over, setOver] = useState('');                    // what's being dragged over
  const drag = useRef(null);                               // { kind: 'box'|'tray'|'row', index }

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
        setRows(['2', '1']);
        setBoxes([null, null, null]);
        setTray([]);
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
        const prefs = await getJson('dashboard_item_preferences?select=item_id,sort_order,is_hidden');
        const map = {};
        prefs.forEach(p => { map[p.item_id] = p; });
        setItemPrefs(map);
      }
      const canUseNow = (key) => {
        const d = datasetRows.find(x => x.key === key);
        return !!d && (d.audience === 'self' || perms.includes(d.required_permission));
      };
      savedItems.forEach(it => { if (byId[it.report_id]) runOne(byId[it.report_id], it.row_limit, canUseNow); });

      startEditing(found, savedItems, router.query.edit === '1');
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

  // Ask only for as many results as the box shows (all, when it shows all).
  const runOne = async (report, rowLimit, usable = canUse) => {
    if (!usable(report.dataset_key)) {
      setResults(prev => ({ ...prev, [report.id]: { noAccess: true } }));
      return;
    }
    try {
      const limit = report.definition?.builder === 'pivot' || !rowLimit ? 5000 : Math.max(rowLimit + 1, 50);
      const result = await runReport(report.dataset_key, { ...report.definition, limit });
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
    const laid = layoutOf(d, savedItems);
    const asDraft = (it) => (it ? { id: it.id, report_id: it.report_id, row_limit: it.row_limit } : null);
    setRows(laid.rows);
    setBoxes(laid.boxes.map(asDraft));
    setTray((laid.extra || []).map(asDraft));
    setEditing(on);
  };

  // ---------- Viewing ----------
  const setItemHidden = async (item, hidden) => {
    setBusy(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_item_preferences?on_conflict=user_id,item_id`, {
        method: 'POST',
        headers: { ...authHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ user_id: user.id, item_id: item.id, is_hidden: hidden, updated_at: new Date().toISOString() }])
      });
      if (!res.ok) throw new Error(await errorDetail(res));
      const saved = await res.json().catch(() => []);
      if (!Array.isArray(saved) || saved.length === 0) throw new Error('nothing was saved - try reloading, or logging out and back in');
      setItemPrefs(prev => ({ ...prev, [item.id]: saved[0] }));
    } catch (error) {
      notify.error(`Couldn't change it: ${error.message}`);
    }
    setBusy(false);
  };

  // ---------- Editing: layout ----------
  const usedIds = [...boxes.filter(Boolean), ...tray].map(x => x.report_id);
  const allowedOn = (report, key) => (key
    ? report.role_key === key
    : (report.role_key === null && report.owner_id === user?.id) || (!!report.role_key && !!roleOf(report.role_key)));
  const addable = eligible.filter(r => allowedOn(r, roleKey) && !usedIds.includes(r.id));

  // Change the rows, keeping reports in the same order; any that no longer
  // fit go back to the list of reports to place.
  const applyRows = (nextRows) => {
    const placed = boxes.filter(Boolean);
    const count = boxCount(nextRows);
    const nextBoxes = Array(count).fill(null);
    placed.slice(0, count).forEach((x, i) => { nextBoxes[i] = x; });
    const leftOver = placed.slice(count);
    if (leftOver.length > 0) notify.info(`${leftOver.length} report${leftOver.length === 1 ? ' doesn\'t' : 's don\'t'} fit the new layout, so ${leftOver.length === 1 ? 'it\'s' : 'they\'re'} waiting below to be placed.`);
    setRows(nextRows);
    setBoxes(nextBoxes);
    setTray([...tray, ...leftOver]);
  };

  // Changing a row's type keeps every box where it is, as far as possible.
  const setRowType = (r, type) => {
    const starts = rowStarts(rows);
    const nextRows = rows.map((t, i) => (i === r ? type : t));
    const nextStarts = rowStarts(nextRows);
    const nextBoxes = Array(boxCount(nextRows)).fill(null);
    const leftOver = [];
    rows.forEach((t, i) => {
      for (let j = 0; j < ROW_TYPES[t].boxes; j++) {
        const x = boxes[starts[i] + j];
        if (!x) continue;
        if (j < ROW_TYPES[nextRows[i]].boxes) nextBoxes[nextStarts[i] + j] = x;
        else leftOver.push(x);
      }
    });
    setRows(nextRows);
    setBoxes(nextBoxes);
    setTray([...tray, ...leftOver]);
  };

  const moveRow = (from, to) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const starts = rowStarts(rows);
    const groups = rows.map((t, i) => ({ type: t, boxes: boxes.slice(starts[i], starts[i] + ROW_TYPES[t].boxes) }));
    const [moved] = groups.splice(from, 1);
    groups.splice(to, 0, moved);
    setRows(groups.map(g => g.type));
    setBoxes(groups.flatMap(g => g.boxes));
  };

  const removeRow = (r) => {
    const starts = rowStarts(rows);
    const gone = boxes.slice(starts[r], starts[r] + ROW_TYPES[rows[r]].boxes).filter(Boolean);
    setRows(rows.filter((_, i) => i !== r));
    setBoxes([...boxes.slice(0, starts[r]), ...boxes.slice(starts[r] + ROW_TYPES[rows[r]].boxes)]);
    setTray([...tray, ...gone]);
  };

  const addRow = (type) => {
    setRows([...rows, type]);
    setBoxes([...boxes, ...Array(ROW_TYPES[type].boxes).fill(null)]);
  };

  // ---------- Editing: placing reports ----------
  // Put something in a box. Whatever was there swaps places with it.
  const placeInBox = (source, box) => {
    const nextBoxes = [...boxes];
    let nextTray = [...tray];
    let moving;
    if (source.kind === 'box') {
      if (source.index === box) return;
      moving = nextBoxes[source.index];
      nextBoxes[source.index] = nextBoxes[box];
    } else {
      moving = nextTray[source.index];
      nextTray.splice(source.index, 1);
      if (nextBoxes[box]) nextTray = [...nextTray, nextBoxes[box]];
    }
    nextBoxes[box] = moving;
    setBoxes(nextBoxes);
    setTray(nextTray);
  };

  const backToTray = (box) => {
    if (!boxes[box]) return;
    setTray([...tray, boxes[box]]);
    setBoxes(boxes.map((x, i) => (i === box ? null : x)));
  };

  const addReport = (report) => {
    const entry = { report_id: report.id, row_limit: 10 };
    const free = boxes.indexOf(null);
    if (free >= 0) setBoxes(boxes.map((x, i) => (i === free ? entry : x)));
    else setTray([...tray, entry]);
  };

  const setLimit = (where, index, value) => {
    if (where === 'box') setBoxes(boxes.map((x, i) => (i === index ? { ...x, row_limit: value } : x)));
    else setTray(tray.map((x, i) => (i === index ? { ...x, row_limit: value } : x)));
  };

  const changeRole = (key) => {
    const fits = (x) => !x || !reportsById[x.report_id] || allowedOn(reportsById[x.report_id], key);
    const dropped = [...boxes, ...tray].filter(x => x && !fits(x));
    if (dropped.length > 0) {
      notify.info(`Took off ${dropped.length} report${dropped.length === 1 ? '' : 's'} that can't go on ${key ? `a ${roleOf(key)?.label} dashboard` : 'a personal dashboard'}.`);
    }
    setBoxes(boxes.map(x => (fits(x) ? x : null)));
    setTray(tray.filter(fits));
    setRoleKey(key);
  };

  // Drag and drop.
  const startDrag = (e, payload) => {
    drag.current = payload;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', JSON.stringify(payload)); } catch (err) { /* the ref is enough */ }
  };
  const allowDrop = (key) => (e) => { e.preventDefault(); if (over !== key) setOver(key); };
  const endDrop = (e) => { e.preventDefault(); e.stopPropagation(); const d = drag.current; drag.current = null; setOver(''); return d; };

  const save = async () => {
    if (!title.trim()) { notify.error('Give the dashboard a name before saving.'); return; }
    if (roleKey && !description.trim()) { notify.error('Say what this dashboard is for before adding it to a role - it\'s how everyone else will know why it\'s there.'); return; }
    if (tray.length > 0 && !window.confirm(`${tray.length} report${tray.length === 1 ? ' isn\'t' : 's aren\'t'} in a box yet, so ${tray.length === 1 ? 'it' : 'they'} won't be on the dashboard. Save anyway?`)) return;
    const badLimit = boxes.find(x => x && x.row_limit !== null && !(Number.isInteger(x.row_limit) && x.row_limit > 0));
    if (badLimit) { notify.error('Each "how many results" needs to be a whole number above 0, or All.'); return; }

    setBusy(true);
    try {
      let d = dashboard;
      const body = { title: title.trim(), description: description.trim() || null, layout: rows };
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

      // Bring the saved reports in line with the boxes, keeping existing
      // entries where possible.
      const placed = boxes.map((x, box) => (x ? { ...x, position: box } : null)).filter(Boolean);
      const keepIds = placed.filter(x => x.id).map(x => x.id);
      for (const it of items.filter(i => !keepIds.includes(i.id))) {
        await writeJson(`report_dashboard_items?id=eq.${it.id}`, 'DELETE');
      }
      for (const x of placed) {
        if (x.id) {
          await writeJson(`report_dashboard_items?id=eq.${x.id}`, 'PATCH', { position: x.position, row_limit: x.row_limit });
        } else {
          await writeJson('report_dashboard_items', 'POST', { dashboard_id: d.id, report_id: x.report_id, position: x.position, row_limit: x.row_limit });
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
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', margin: 0 },
    actions: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #334155' },
    action: { background: 'none', border: '1px solid #334155', color: GREY_TEXT, borderRadius: '0.375rem', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' },
    primary: { background: PERSONAL_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' },
    secondary: { background: 'transparent', color: '#fff', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.1rem 0.45rem' },
    label: { display: 'block', fontSize: '0.85rem', fontWeight: 'bold', margin: '0.9rem 0 0.35rem' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem', boxSizing: 'border-box' },
    select: { background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.35rem 0.5rem', fontSize: '0.8rem', maxWidth: '100%' },
    segment: { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden' },
    segmentBtn: (on) => ({ padding: '0.4rem 0.85rem', border: 'none', background: on ? PERSONAL_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    pill: (on) => ({ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${on ? PERSONAL_TEXT : '#334155'}`, background: on ? `${PERSONAL_FILL}40` : 'transparent', color: on ? '#fff' : '#cbd5e1', fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }),
    row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0', borderTop: '1px solid #334155' },
    link: { background: 'none', border: 'none', color: PERSONAL_TEXT, cursor: 'pointer', padding: 0, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' },
    drop: (on, filled) => ({ border: `1px dashed ${on ? PERSONAL_TEXT : '#475569'}`, background: on ? `${PERSONAL_FILL}22` : filled ? '#1e293b' : '#0f172a', borderRadius: '0.5rem', padding: '0.6rem', minHeight: '5.5rem', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '0.4rem' })
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading the dashboard…</p></div></div>;
  }

  const backLink = <Link href="/insights?tab=dashboards" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>;
  const reportLabel = (r) => (r.role_key ? `${r.title} (${roleOf(r.role_key)?.label || 'role'} report)` : r.title);

  // How many results a box shows: a few set choices, All, or any number.
  const limitControl = (entry, where, index) => {
    const value = entry.row_limit;
    const custom = value !== null && !LIMIT_CHOICES.includes(value);
    const choice = value === null ? 'all' : custom ? 'other' : String(value);
    const name = reportsById[entry.report_id]?.title || 'this report';
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
        <label style={{ color: GREY_TEXT }} htmlFor={`limit-${where}-${index}`}>Show</label>
        <select id={`limit-${where}-${index}`} style={s.select} value={choice} aria-label={`How many results to show for ${name}`}
          onChange={(e) => {
            const v = e.target.value;
            setLimit(where, index, v === 'all' ? null : v === 'other' ? (custom ? value : 100) : Number(v));
          }}>
          {LIMIT_CHOICES.map(n => <option key={n} value={String(n)}>{n}</option>)}
          <option value="all">All</option>
          <option value="other">Another number…</option>
        </select>
        {choice === 'other' && (
          <input type="number" min="1" step="1" value={value ?? ''} aria-label={`Number of results to show for ${name}`}
            onChange={(e) => setLimit(where, index, e.target.value === '' ? 1 : Math.max(1, Math.floor(Number(e.target.value))))}
            style={{ ...s.select, width: '5.5rem' }} />
        )}
        <span style={{ color: GREY_TEXT }}>results</span>
        {(value === null || value > SLOW_ABOVE) && (
          <span style={{ color: '#cbd5e1', flexBasis: '100%' }}>
            <i className="ti ti-alert-triangle" style={{ color: DANGER_TEXT }} aria-hidden="true"></i> Showing {value === null ? 'every result' : `more than ${SLOW_ABOVE}`} can make the dashboard slow to load.
          </span>
        )}
      </div>
    );
  };

  // A placed report or a waiting one, with the non-drag way to move it.
  const entryCard = (entry, where, index) => {
    const r = reportsById[entry.report_id];
    const placeOptions = boxes.map((_, box) => box).filter(box => !(where === 'box' && box === index));
    return (
      <div draggable onDragStart={(e) => startDrag(e, { kind: where, index })}
        style={{ border: `1px solid ${PERSONAL_TEXT}66`, background: `${PERSONAL_FILL}33`, borderRadius: '0.375rem', padding: '0.5rem', cursor: 'grab', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
          <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT, marginTop: '0.15rem' }} aria-hidden="true"></i>
          <span style={{ flex: 1, fontWeight: 'bold', fontSize: '0.875rem' }}>{r ? reportLabel(r) : <em style={{ color: GREY_TEXT }}>A report you can't see</em>}</span>
          <button type="button" style={{ ...s.link, color: GREY_TEXT }} aria-label={`Take ${r?.title || 'this report'} off the dashboard`}
            onClick={() => (where === 'box' ? setBoxes(boxes.map((x, i) => (i === index ? null : x))) : setTray(tray.filter((_, i) => i !== index)))}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        {limitControl(entry, where, index)}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
          <label style={{ color: GREY_TEXT }} htmlFor={`move-${where}-${index}`}>Move to</label>
          <select id={`move-${where}-${index}`} style={s.select} value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'tray') backToTray(index);
              else if (v !== '') placeInBox({ kind: where, index }, Number(v));
            }}>
            <option value="">Choose a box…</option>
            {placeOptions.map(box => (
              <option key={box} value={String(box)}>{boxName(rows, box)}{boxes[box] ? ` (swap with ${reportsById[boxes[box].report_id]?.title || 'the report there'})` : ''}</option>
            ))}
            {where === 'box' && <option value="tray">Out of the layout, for now</option>}
          </select>
        </div>
      </div>
    );
  };

  // ---------- Edit screen ----------
  if (editing && canEdit) {
    const starts = rowStarts(rows);
    return (
      <div style={s.container}><div style={{ ...s.wrapper, maxWidth: '1100px' }}>
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
                  ? `Everyone with the ${roleOf(roleKey)?.label} role will see this dashboard, and it can only hold that role's reports.`
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

        {/* Layout */}
        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Layout</h2>
          <p style={{ ...s.help, margin: '0 0 0.75rem' }}>Start from a ready-made layout, or build your own row by row. Reports already placed keep their order.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }} role="group" aria-label="Ready-made layouts">
            {PRESETS.map(p => {
              const on = p.rows.join() === rows.join();
              return (
                <button key={p.label} type="button" onClick={() => applyRows(p.rows)} aria-pressed={on}
                  style={{ ...s.pill(on), flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', padding: '0.5rem 0.65rem', width: '9.5rem' }}>
                  <LayoutPicture rows={p.rows} />
                  <span style={{ fontSize: '0.8rem', textAlign: 'left' }}>{p.label}</span>
                </button>
              );
            })}
          </div>

          <span style={{ ...s.label, marginTop: 0 }}>Rows</span>
          {rows.map((t, r) => (
            <div key={r} draggable onDragStart={(e) => startDrag(e, { kind: 'row', index: r })}
              onDragOver={allowDrop(`row-${r}`)} onDrop={(e) => { const d = endDrop(e); if (d?.kind === 'row') moveRow(d.index, r); }}
              style={{ ...s.row, borderTop: `1px ${over === `row-${r}` ? 'dashed' : 'solid'} ${over === `row-${r}` ? PERSONAL_TEXT : '#334155'}`, cursor: 'grab' }}>
              <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT }} aria-hidden="true"></i>
              <span style={{ color: GREY_TEXT, minWidth: '3.5rem' }}>Row {r + 1}</span>
              <select style={s.select} value={t} onChange={(e) => setRowType(r, e.target.value)} aria-label={`Kind of row ${r + 1}`}>
                {Object.entries(ROW_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <span style={{ flex: 1 }} />
              <button type="button" style={{ ...s.action, opacity: r === 0 ? 0.4 : 1 }} disabled={r === 0} onClick={() => moveRow(r, r - 1)} aria-label={`Move row ${r + 1} up`}><i className="ti ti-arrow-up" aria-hidden="true"></i></button>
              <button type="button" style={{ ...s.action, opacity: r === rows.length - 1 ? 0.4 : 1 }} disabled={r === rows.length - 1} onClick={() => moveRow(r, r + 1)} aria-label={`Move row ${r + 1} down`}><i className="ti ti-arrow-down" aria-hidden="true"></i></button>
              <button type="button" style={s.action} disabled={rows.length === 1} onClick={() => removeRow(r)}><i className="ti ti-x" aria-hidden="true"></i> Remove row</button>
            </div>
          ))}
          <div style={{ ...s.row, borderTop: '1px solid #334155' }}>
            <label htmlFor="add-row" style={{ color: GREY_TEXT, fontSize: '0.85rem' }}>Add a row:</label>
            <select id="add-row" style={s.select} value="" onChange={(e) => { if (e.target.value) addRow(e.target.value); }}>
              <option value="">Choose a kind of row…</option>
              {Object.entries(ROW_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        {/* Boxes */}
        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Put reports in the boxes</h2>
          <p style={{ ...s.help, margin: '0 0 0.75rem' }}>
            Drag a report into a box, or use "Move to". Dropping on a box that's taken swaps the two. Each box can show a different number of results.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {rows.map((t, r) => (
              <LayoutRow key={r} type={t} narrow={narrow}>
                {Array.from({ length: ROW_TYPES[t].boxes }).map((_, j) => {
                  const box = starts[r] + j;
                  const entry = boxes[box];
                  const key = `box-${box}`;
                  return (
                    <div key={box} onDragOver={allowDrop(key)} onDragLeave={() => setOver('')}
                      onDrop={(e) => { const d = endDrop(e); if (d && (d.kind === 'box' || d.kind === 'tray')) placeInBox(d, box); }}
                      style={s.drop(over === key, !!entry)} aria-label={boxName(rows, box)}>
                      <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}>{boxName(rows, box)}</span>
                      {entry ? entryCard(entry, 'box', box) : <span style={{ color: GREY_TEXT, fontSize: '0.8rem', fontStyle: 'italic' }}>Empty - drop a report here</span>}
                    </div>
                  );
                })}
              </LayoutRow>
            ))}
          </div>

          <div onDragOver={allowDrop('tray')} onDragLeave={() => setOver('')}
            onDrop={(e) => { const d = endDrop(e); if (d?.kind === 'box') backToTray(d.index); }}
            style={{ ...s.drop(over === 'tray', false), marginTop: '1rem', minHeight: '3.5rem' }} aria-label="Reports waiting to be placed">
            <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>
              Waiting to be placed {tray.length === 0 && '- drag a report here to take it out of the layout without removing it'}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '0.5rem' }}>
              {tray.map((entry, i) => <div key={`${entry.report_id}-${i}`}>{entryCard(entry, 'tray', i)}</div>)}
            </div>
          </div>
        </div>

        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Add reports</h2>
          <p style={{ ...s.help, margin: '0 0 0.5rem' }}>
            {roleKey ? `${roleOf(roleKey)?.label} reports that aren't on it yet.` : 'Your reports and your roles\' reports that aren\'t on it yet.'}
            {' '}Each one goes in the first empty box, or waits to be placed.
          </p>
          {addable.length === 0 ? (
            <p style={{ color: GREY_TEXT, fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
              {roleKey ? 'No more reports for this role. Add one from the report builder by saving it to Role reports.' : 'Every report you can use is already on it.'}
            </p>
          ) : addable.map(r => (
            <div key={r.id} style={s.row}>
              <span style={{ flex: 1, minWidth: '12rem' }}>{reportLabel(r)}</span>
              <button type="button" style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }} onClick={() => addReport(r)}>
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
  const laid = layoutOf(dashboard, items);
  const starts = rowStarts(laid.rows);
  const hiddenCount = dashboard.role_key ? items.filter(it => itemPrefs[it.id]?.is_hidden).length : 0;

  const resultArea = (report, rowLimit) => {
    const state = results[report.id];
    const source = datasets.find(d => d.key === report.dataset_key)?.title || report.dataset_key;
    if (!state) return <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Loading…</p>;
    if (state.noAccess) return <p style={{ color: '#cbd5e1', fontSize: '0.875rem', margin: 0 }}><i className="ti ti-lock" aria-hidden="true"></i> This report uses {source}, which you don't have access to.</p>;
    if (state.error) return <p style={{ color: DANGER_TEXT, fontSize: '0.875rem', margin: 0 }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {state.error}</p>;
    return <ReportResult result={state.result} fields={fieldsByDataset[report.dataset_key] || []} display={report.display} definition={report.definition} maxRows={rowLimit || undefined} />;
  };

  const viewCard = (item) => {
    if (!item) return <div style={{ width: '100%' }} />;
    const report = reportsById[item.report_id];
    const hidden = !!itemPrefs[item.id]?.is_hidden;
    if (hidden && !showHidden) return <div style={{ width: '100%' }} />;
    return (
      <section style={{ ...s.card, opacity: hidden ? 0.6 : 1 }} aria-label={report?.title || 'A report you can\'t see'}>
        {report ? (
          <>
            <h2 style={s.cardTitle}>{report.title}{hidden && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.8rem' }}> (hidden)</span>}</h2>
            {report.description ? <p style={{ ...s.help, margin: '0.25rem 0 0.75rem' }}>{report.description}</p> : <div style={{ height: '0.75rem' }} />}
            {!hidden && <div style={{ marginBottom: '0.5rem', overflowX: 'auto' }}>{resultArea(report, item.row_limit)}</div>}
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
          {dashboard.role_key && (
            <button type="button" style={s.action} disabled={busy} onClick={() => setItemHidden(item, !hidden)}>
              <i className={`ti ${hidden ? 'ti-eye' : 'ti-eye-off'}`} aria-hidden="true"></i> {hidden ? 'Show again' : 'Hide for me'}
            </button>
          )}
        </div>
      </section>
    );
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
              <i className="ti ti-layout" aria-hidden="true"></i> Edit dashboard
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ ...s.card, alignItems: 'flex-start' }}>
          <p style={{ margin: '0 0 0.75rem' }}>There are no reports on this dashboard yet.</p>
          {canEdit && (
            <button type="button" style={s.primary} onClick={() => startEditing(dashboard, items)}><i className="ti ti-plus" aria-hidden="true"></i> Add reports</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {laid.rows.map((t, r) => {
            const rowBoxes = laid.boxes.slice(starts[r], starts[r] + ROW_TYPES[t].boxes);
            if (rowBoxes.every(x => !x)) return null;
            return (
              <LayoutRow key={r} type={t} narrow={narrow}>
                {rowBoxes.map((item, j) => <div key={j} style={{ display: 'flex', width: '100%' }}>{viewCard(item)}</div>)}
              </LayoutRow>
            );
          })}
          {(laid.extra || []).length > 0 && (
            <LayoutRow type="2" narrow={narrow}>
              {laid.extra.map(item => <div key={item.id} style={{ display: 'flex', width: '100%' }}>{viewCard(item)}</div>)}
            </LayoutRow>
          )}
        </div>
      )}
    </div></div>
  );
}
