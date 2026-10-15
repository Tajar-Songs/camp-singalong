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
//   /dashboard?new=1          make one
//       &template=1             … as a template (&for=role for a role's template)
//       &from=<id>              … starting from one of your dashboards
//
// Templates (is_template) are starting points other people can use: for
// everyone, or for one role (role_key). "Use as my own dashboard" makes the
// person their own dashboard from it (use_dashboard_template). A role's
// shared report on a template stays linked; any other report is stored on
// the template as a snapshot and copied for each person who uses it.
//
// Layout (report_dashboards.layout) is a grid 12 columns wide:
//   { "version": 2, "boxes": [ { "x", "y", "w", "h" }, … ] }
// x and w count columns (so a quarter is 3, a third 4, a half 6); y and h
// count height units, and a box is 1 to 4 units tall. Boxes are kept in
// reading order (top to bottom, then left to right), and a report's position
// is the number of its box in that order. Each box also says how many results
// to show (report_dashboard_items.row_limit; empty = all).
//
// Older dashboards stored a list of row types, or nothing at all (just
// normal/wide sizes); they're converted on the way in and saved in the new
// form the next time they're edited.
//
// Order follows the style guide: drag and drop wherever things are put in
// order, always with a way to do the same thing without dragging.

const COLUMNS = 12;
const MAX_HEIGHT = 4;
const WIDTHS = [3, 4, 6, 8, 9, 12];   // quarter, third, half, two thirds, three quarters, full
const WIDTH_WORDS = { 3: 'a quarter wide', 4: 'a third wide', 6: 'half wide', 8: 'two thirds wide', 9: 'three quarters wide', 12: 'full width' };
const LIMIT_CHOICES = [5, 10, 25, 50];
const SLOW_ABOVE = 100;

const b = (x, y, w, h) => ({ x, y, w, h });
const PRESETS = [
  { label: 'Two on top, one wide below', boxes: [b(0, 0, 6, 1), b(6, 0, 6, 1), b(0, 1, 12, 1)] },
  { label: 'One wide on top, two below', boxes: [b(0, 0, 12, 1), b(0, 1, 6, 1), b(6, 1, 6, 1)] },
  { label: 'Three across', boxes: [b(0, 0, 4, 1), b(4, 0, 4, 1), b(8, 0, 4, 1)] },
  { label: 'Four across', boxes: [b(0, 0, 3, 1), b(3, 0, 3, 1), b(6, 0, 3, 1), b(9, 0, 3, 1)] },
  { label: 'Four in a grid', boxes: [b(0, 0, 6, 1), b(6, 0, 6, 1), b(0, 1, 6, 1), b(6, 1, 6, 1)] },
  { label: 'One big beside two small', boxes: [b(0, 0, 8, 2), b(8, 0, 4, 1), b(8, 1, 4, 1)] },
  { label: 'One big beside three small', boxes: [b(0, 0, 8, 3), b(8, 0, 4, 1), b(8, 1, 4, 1), b(8, 2, 4, 1)] },
  { label: 'One under another', boxes: [b(0, 0, 12, 1), b(0, 1, 12, 1), b(0, 2, 12, 1)] }
];

const readingOrder = (list) => [...list].sort((p, q) => p.y - q.y || p.x - q.x);
const sizeWords = (box) => `${WIDTH_WORDS[box.w] || `${box.w} of 12 columns wide`}, ${box.h} unit${box.h === 1 ? '' : 's'} tall`;
const sameShape = (p, q) => p.length === q.length && readingOrder(p).every((x, i) => {
  const y = readingOrder(q)[i];
  return x.x === y.x && x.y === y.y && x.w === y.w && x.h === y.h;
});

// Which grid cells are taken, ignoring the boxes listed in `skip`.
const taken = (boxes, skip = []) => {
  const cells = new Set();
  boxes.forEach((box, i) => {
    if (skip.includes(i)) return;
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) cells.add(`${x},${y}`);
    }
  });
  return cells;
};
const areaFree = (cells, x, y, w, h) => {
  if (x < 0 || x + w > COLUMNS) return false;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) if (cells.has(`${xx},${yy}`)) return false;
  }
  return true;
};
const gridHeight = (boxes) => boxes.reduce((n, box) => Math.max(n, box.y + box.h), 0);

// Empty stretches of the grid, row by row, for "add a box here".
const emptySpaces = (boxes) => {
  const cells = taken(boxes);
  const spaces = [];
  for (let y = 0; y < gridHeight(boxes); y++) {
    let x = 0;
    while (x < COLUMNS) {
      if (cells.has(`${x},${y}`)) { x++; continue; }
      const start = x;
      while (x < COLUMNS && !cells.has(`${x},${y}`)) x++;
      spaces.push({ x: start, y, w: x - start, h: 1 });
    }
  }
  return spaces;
};

// ---------- Older layouts ----------
const OLD_ROWS = {
  '1': (y) => [b(0, y, 12, 1)],
  '2': (y) => [b(0, y, 6, 1), b(6, y, 6, 1)],
  '3': (y) => [b(0, y, 4, 1), b(4, y, 4, 1), b(8, y, 4, 1)],
  'big-left': (y) => [b(0, y, 8, 2), b(8, y, 4, 1), b(8, y + 1, 4, 1)],
  'big-right': (y) => [b(4, y, 8, 2), b(0, y, 4, 1), b(0, y + 1, 4, 1)]
};
const OLD_HEIGHT = { '1': 1, '2': 1, '3': 1, 'big-left': 2, 'big-right': 2 };

// Returns boxes (each with its saved item, if any) in reading order, plus any
// saved items that had no box.
const layoutOf = (dashboard, items) => {
  const sorted = [...items].sort((p, q) => p.position - q.position);
  let shapes;    // boxes in the order positions refer to
  const layout = dashboard?.layout;
  if (layout && Array.isArray(layout.boxes)) {
    shapes = layout.boxes.map(x => ({ ...x }));
  } else if (Array.isArray(layout) && layout.length > 0) {
    shapes = [];
    let y = 0;
    layout.forEach(t => { if (OLD_ROWS[t]) { shapes.push(...OLD_ROWS[t](y)); y += OLD_HEIGHT[t]; } });
  } else {
    // No layout at all: wide reports get a row of their own, the rest pair up.
    shapes = [];
    let y = 0;
    let half = null;
    sorted.forEach(it => {
      if (it.size === 'wide') { shapes.push(b(0, y, 12, 1)); y += 1; half = null; }
      else if (half) { shapes.push(b(6, half, 6, 1)); half = null; }
      else { shapes.push(b(0, y, 6, 1)); half = y; y += 1; }
    });
    if (shapes.length === 0) shapes = PRESETS[0].boxes.map(x => ({ ...x }));
    return { boxes: readingOrder(shapes.map((s, i) => ({ ...s, item: sorted[i] || null }))), extra: [] };
  }
  const boxes = shapes.map(s => ({ ...s, item: null }));
  const extra = [];
  sorted.forEach(it => {
    if (it.position >= 0 && it.position < boxes.length && !boxes[it.position].item) boxes[it.position].item = it;
    else extra.push(it);
  });
  return { boxes: readingOrder(boxes), extra };
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

// The grid itself. Each child is placed by its box.
function Grid({ boxes, narrow, render, extra }) {
  if (narrow) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{boxes.map((box, i) => <div key={i}>{render(box, i)}</div>)}{extra}</div>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`, gridAutoRows: 'minmax(9rem, auto)', gap: '1rem' }}>
      {boxes.map((box, i) => (
        <div key={i} style={{ gridColumn: `${box.x + 1} / span ${box.w}`, gridRow: `${box.y + 1} / span ${box.h}`, display: 'flex', minWidth: 0 }}>
          {render(box, i)}
        </div>
      ))}
      {extra}
    </div>
  );
}

// A small picture of a layout, for choosing one.
function LayoutPicture({ boxes }) {
  const rows = Math.max(1, gridHeight(boxes));
  return (
    <div aria-hidden="true" style={{ width: '4.5rem', display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${rows}, 0.55rem)`, gap: '2px' }}>
      {boxes.map((box, i) => (
        <div key={i} style={{ gridColumn: `${box.x + 1} / span ${box.w}`, gridRow: `${box.y + 1} / span ${box.h}`, background: '#475569', borderRadius: '2px' }} />
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
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);

  // Editing
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roleKey, setRoleKey] = useState('');              // a template's role ('' = for everyone)
  const [isTemplate, setIsTemplate] = useState(false);
  const [boxes, setBoxes] = useState([]);                  // [{ x, y, w, h, entry }] in reading order
  const [tray, setTray] = useState([]);                    // added but not in a box yet
  const [selected, setSelected] = useState(-1);            // box whose shape is being changed
  const [eligible, setEligible] = useState([]);
  const [over, setOver] = useState('');
  const drag = useRef(null);                               // { kind: 'box'|'tray', index }

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
        const template = router.query.template === '1';
        setDashboard(null);
        setItems([]);
        setTitle('');
        setDescription('');
        setIsTemplate(template);
        setRoleKey(template && router.query.for === 'role' && held.length > 0 ? held[0].key : '');
        setBoxes(PRESETS[0].boxes.map(x => ({ ...x, entry: null })));
        setTray([]);
        // Starting a template from one of your own dashboards.
        if (router.query.from) {
          const source = (await getJson(`report_dashboards?id=eq.${router.query.from}&select=*`))[0];
          if (source) {
            const sourceItems = await getJson(`report_dashboard_items?dashboard_id=eq.${source.id}&select=*`);
            const laid = layoutOf(source, sourceItems);
            const asNew = (it) => (it ? { report_id: it.report_id, snapshot: it.snapshot, row_limit: it.row_limit } : null);
            setTitle(source.title);
            setDescription(source.description || '');
            setBoxes(laid.boxes.map(({ item, ...shape }) => ({ ...shape, entry: asNew(item) })));
            setTray(laid.extra.map(asNew));
            // If it uses a role's reports, start it as that role's template.
            const roleUsed = sourceItems.map(it => byId[it.report_id]?.role_key).find(k => k && held.some(r => r.key === k));
            if (template && roleUsed) setRoleKey(roleUsed);
          }
        }
        setSelected(-1);
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
      const canUseNow = (key) => {
        const d = datasetRows.find(x => x.key === key);
        return !!d && (d.audience === 'self' || perms.includes(d.required_permission));
      };
      savedItems.forEach(it => {
        const report = it.snapshot ? snapshotReport(it) : byId[it.report_id];
        if (report) runOne(report, it.row_limit, canUseNow);
      });

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

  // Ask only for about as many results as the box shows (all, when it shows all).
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

  // A report stored on a template as a snapshot, shaped like a saved report.
  // It always runs against the viewer's own data.
  const snapshotReport = (it) => ({ ...it.snapshot, id: `snap-${it.id}`, role_key: null, isCopy: true });
  const itemReport = (it) => (it.snapshot ? snapshotReport(it) : reportsById[it.report_id]);

  const roleOf = (key) => myRoles.find(r => r.key === key);
  const audienceWords = (key) => (key ? `everyone with the ${roleOf(key)?.label || 'role'} role` : 'everyone');
  const canEdit = !dashboard
    || (!dashboard.role_key && dashboard.owner_id === user?.id)
    || (!!dashboard.role_key && !!roleOf(dashboard.role_key)
        && (dashboard.owner_id === user?.id || permissions.includes('reporting.manage.content')));

  const startEditing = (d, savedItems, on = true) => {
    setTitle(d.title || '');
    setDescription(d.description || '');
    setRoleKey(d.role_key || '');
    setIsTemplate(!!d.is_template);
    const laid = layoutOf(d, savedItems);
    const asDraft = (it) => (it ? { id: it.id, report_id: it.report_id, snapshot: it.snapshot, row_limit: it.row_limit } : null);
    setBoxes(laid.boxes.map(({ item, ...shape }) => ({ ...shape, entry: asDraft(item) })));
    setTray(laid.extra.map(asDraft));
    setSelected(-1);
    setEditing(on);
  };

  // ---------- Using a template ----------
  const copyTemplate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/use_dashboard_template`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ p_template_id: dashboard.id })
      });
      if (!res.ok) throw new Error(await errorDetail(res));
      const newId = await res.json();
      notify.success(`"${dashboard.title}" is now one of your dashboards. Change it however you like - the template stays as it is.`);
      router.push(`/dashboard?id=${newId}`);
    } catch (error) {
      notify.error(`Couldn't use the template: ${error.message}`);
      setBusy(false);
    }
  };

  // ---------- Editing: the shape of the layout ----------
  // Every change keeps boxes in reading order and keeps track of which
  // report is in which box. `keep` is the box to leave selected afterwards.
  const commit = (next, extraTray = [], keep = null) => {
    const ordered = readingOrder(next);
    setBoxes(ordered);
    if (extraTray.length > 0) setTray([...tray, ...extraTray]);
    setSelected(keep ? ordered.indexOf(keep) : -1);
  };

  // Start from a ready-made layout; reports already placed keep their order.
  const applyPreset = (preset) => {
    const placed = boxes.filter(x => x.entry).map(x => x.entry);
    const next = preset.boxes.map(x => ({ ...x, entry: null }));
    placed.slice(0, next.length).forEach((entry, i) => { next[i].entry = entry; });
    const leftOver = placed.slice(next.length);
    if (leftOver.length > 0) notify.info(`${leftOver.length} report${leftOver.length === 1 ? ' doesn\'t' : 's don\'t'} fit this layout, so ${leftOver.length === 1 ? 'it\'s' : 'they\'re'} waiting below to be placed.`);
    commit(next, leftOver);
  };

  // What each shape change would do to the selected box, or why it can't.
  const shapeOptions = (i) => {
    const box = boxes[i];
    const others = taken(boxes, [i]);
    const opts = {};

    [2, 3, 4].forEach(n => {
      opts[`across${n}`] = box.w % n !== 0 || box.w / n < 3
        ? { why: `It's too narrow to split into ${n} side by side (the smallest box is a quarter wide).` }
        : { run: () => {
            const part = box.w / n;
            const pieces = Array.from({ length: n }, (_, k) => ({ x: box.x + k * part, y: box.y, w: part, h: box.h, entry: k === 0 ? box.entry : null }));
            commit([...boxes.filter((_, j) => j !== i), ...pieces], [], pieces[0]);
          } };
      opts[`down${n}`] = box.h % n !== 0
        ? { why: `It's ${box.h} unit${box.h === 1 ? '' : 's'} tall, which doesn't split evenly into ${n}. Make it taller first.` }
        : { run: () => {
            const part = box.h / n;
            const pieces = Array.from({ length: n }, (_, k) => ({ x: box.x, y: box.y + k * part, w: box.w, h: part, entry: k === 0 ? box.entry : null }));
            commit([...boxes.filter((_, j) => j !== i), ...pieces], [], pieces[0]);
          } };
    });

    const join = (j, merged) => () => {
      const other = boxes[j];
      // Keep a report if there is one; if both have one, the second waits to be placed.
      const entry = box.entry || other.entry;
      const bumped = box.entry && other.entry ? [other.entry] : [];
      const next = { ...merged, entry };
      commit([...boxes.filter((_, k) => k !== i && k !== j), next], bumped, next);
    };
    const right = boxes.findIndex(o => o.x === box.x + box.w && o.y === box.y && o.h === box.h);
    opts.mergeRight = right < 0
      ? { why: 'There\'s no box to the right with the same top and height, so they can\'t be joined.' }
      : { run: join(right, { x: box.x, y: box.y, w: box.w + boxes[right].w, h: box.h }) };
    const below = boxes.findIndex(o => o.y === box.y + box.h && o.x === box.x && o.w === box.w);
    opts.mergeBelow = below < 0
      ? { why: 'There\'s no box underneath with the same left edge and width, so they can\'t be joined.' }
      : { run: join(below, { x: box.x, y: box.y, w: box.w, h: box.h + boxes[below].h }) };

    const reshape = (shape) => () => {
      const next = { ...box, ...shape };
      commit([...boxes.filter((_, j) => j !== i), next], [], next);
    };
    const wider = WIDTHS.find(w => w > box.w && box.x + w <= COLUMNS);
    opts.wider = !wider
      ? { why: 'It already reaches the right edge.' }
      : !areaFree(others, box.x, box.y, wider, box.h)
        ? { why: 'Another box is in the way on the right. Make that one narrower, or remove it, first.' }
        : { run: reshape({ w: wider }) };
    const narrower = [...WIDTHS].reverse().find(w => w < box.w);
    opts.narrower = !narrower ? { why: 'It\'s already as narrow as a box can be (a quarter).' } : { run: reshape({ w: narrower }) };
    opts.taller = box.h >= MAX_HEIGHT
      ? { why: `It's already as tall as a box can be (${MAX_HEIGHT} units).` }
      : !areaFree(others, box.x, box.y, box.w, box.h + 1)
        ? { why: 'Another box is right underneath. Make that one shorter, or remove it, first.' }
        : { run: reshape({ h: box.h + 1 }) };
    opts.shorter = box.h <= 1 ? { why: 'It\'s already as short as a box can be (1 unit).' } : { run: reshape({ h: box.h - 1 }) };
    return opts;
  };

  const removeBox = (i) => {
    const gone = boxes[i];
    commit(boxes.filter((_, j) => j !== i), gone.entry ? [gone.entry] : []);
  };

  const addBoxAt = (space) => {
    const next = { ...space, entry: null };
    commit([...boxes, next], [], next);
  };

  const addRowBelow = () => {
    const next = { x: 0, y: gridHeight(boxes), w: 12, h: 1, entry: null };
    commit([...boxes, next], [], next);
  };

  // ---------- Editing: placing reports ----------
  const usedIds = [...boxes.map(x => x.entry).filter(Boolean), ...tray].map(x => x.report_id).filter(Boolean);
  // What can go where:
  //   your own dashboard: your reports and your roles' reports
  //   a role's template: that role's reports (linked) and your own (copied)
  //   a template for everyone: your own reports (copied)
  const allowedOn = (report, template, key) => {
    const mine = report.role_key === null && report.owner_id === user?.id;
    if (!template) return mine || (!!report.role_key && !!roleOf(report.role_key));
    return mine || (!!key && report.role_key === key);
  };
  const addable = eligible.filter(r => allowedOn(r, isTemplate, roleKey) && !usedIds.includes(r.id));
  const entryTitle = (entry) => (entry.snapshot ? entry.snapshot.title : reportsById[entry.report_id]?.title) || 'a report you can\'t see';
  // How a report behaves when someone uses the template.
  const entryNote = (entry) => {
    if (!isTemplate) return '';
    if (entry.snapshot) return 'each person gets their own copy';
    const r = reportsById[entry.report_id];
    if (r?.role_key) return `shared ${roleOf(r.role_key)?.label || 'role'} report - stays linked`;
    return 'each person gets their own copy';
  };

  // Put something in a box. Whatever was there swaps places with it.
  const placeInBox = (source, target) => {
    const next = boxes.map(x => ({ ...x }));
    let nextTray = [...tray];
    let moving;
    if (source.kind === 'box') {
      if (source.index === target) return;
      moving = next[source.index].entry;
      next[source.index].entry = next[target].entry;
    } else {
      moving = nextTray[source.index];
      nextTray.splice(source.index, 1);
      if (next[target].entry) nextTray = [...nextTray, next[target].entry];
    }
    next[target].entry = moving;
    setBoxes(next);
    setTray(nextTray);
  };

  const backToTray = (i) => {
    if (!boxes[i].entry) return;
    setTray([...tray, boxes[i].entry]);
    setBoxes(boxes.map((x, j) => (j === i ? { ...x, entry: null } : x)));
  };

  const addReport = (report) => {
    const entry = { report_id: report.id, row_limit: 10 };
    const free = boxes.findIndex(x => !x.entry);
    if (free >= 0) setBoxes(boxes.map((x, j) => (j === free ? { ...x, entry } : x)));
    else setTray([...tray, entry]);
  };

  const setLimit = (where, index, value) => {
    if (where === 'box') setBoxes(boxes.map((x, j) => (j === index ? { ...x, entry: { ...x.entry, row_limit: value } } : x)));
    else setTray(tray.map((x, j) => (j === index ? { ...x, row_limit: value } : x)));
  };

  // Switch between your own dashboard, a template for everyone, and a
  // role's template, taking off any report that can't go on the new kind.
  const changeTarget = (template, key) => {
    const fits = (x) => !x || (x.snapshot ? template : !reportsById[x.report_id] || allowedOn(reportsById[x.report_id], template, key));
    const dropped = [...boxes.map(x => x.entry), ...tray].filter(x => x && !fits(x));
    if (dropped.length > 0) {
      const where = !template ? 'your own dashboard' : key ? `a ${roleOf(key)?.label} template` : 'a template for everyone';
      notify.info(`Took off ${dropped.length} report${dropped.length === 1 ? '' : 's'} that can't go on ${where}.`);
    }
    setBoxes(boxes.map(x => (fits(x.entry) ? x : { ...x, entry: null })));
    setTray(tray.filter(fits));
    setIsTemplate(template);
    setRoleKey(template ? key : '');
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
    if (isTemplate && !description.trim()) { notify.error('Say what this template is for - it\'s how other people will know whether it\'s useful to them.'); return; }
    if (boxes.length === 0) { notify.error('Add at least one box to the layout before saving.'); return; }
    if (tray.length > 0 && !window.confirm(`${tray.length} report${tray.length === 1 ? ' isn\'t' : 's aren\'t'} in a box yet, so ${tray.length === 1 ? 'it' : 'they'} won't be on the dashboard. Save anyway?`)) return;
    const badLimit = boxes.find(x => x.entry && x.entry.row_limit !== null && !(Number.isInteger(x.entry.row_limit) && x.entry.row_limit > 0));
    if (badLimit) { notify.error('Each "how many results" needs to be a whole number above 0, or All.'); return; }

    setBusy(true);
    try {
      let d = dashboard;
      const ordered = readingOrder(boxes);
      const layout = { version: 2, boxes: ordered.map(({ x, y, w, h }) => ({ x, y, w, h })) };
      const body = { title: title.trim(), description: description.trim() || null, layout };
      if (d) {
        d = (await writeJson(`report_dashboards?id=eq.${d.id}`, 'PATCH', body))[0];
      } else {
        let hubOrder = 0;
        if (!isTemplate) {
          const last = await getJson(`report_dashboards?select=hub_order&owner_id=eq.${user.id}&is_template=eq.false&order=hub_order.desc&limit=1`);
          hubOrder = (last[0]?.hub_order || 0) + 1;
        }
        d = (await writeJson('report_dashboards', 'POST', { ...body, owner_id: user.id, is_template: isTemplate, role_key: isTemplate && roleKey ? roleKey : null, hub_order: hubOrder }))[0];
      }

      // On a template, your own reports are stored as a snapshot, so other
      // people can preview them and each get their own copy.
      const asSaved = (x) => {
        if (!d.is_template || x.snapshot) return { report_id: x.report_id || null, snapshot: x.snapshot || null };
        const r = reportsById[x.report_id];
        if (r && !r.role_key) {
          return { report_id: null, snapshot: { title: r.title, description: r.description, dataset_key: r.dataset_key, definition: r.definition, display: r.display } };
        }
        return { report_id: x.report_id, snapshot: null };
      };

      // Bring the saved reports in line with the boxes, keeping existing
      // entries where possible.
      const placed = ordered.map((x, position) => (x.entry ? { ...x.entry, position } : null)).filter(Boolean);
      const keepIds = placed.filter(x => x.id).map(x => x.id);
      for (const it of items.filter(i => !keepIds.includes(i.id))) {
        await writeJson(`report_dashboard_items?id=eq.${it.id}`, 'DELETE');
      }
      for (const x of placed) {
        if (x.id) {
          await writeJson(`report_dashboard_items?id=eq.${x.id}`, 'PATCH', { position: x.position, row_limit: x.row_limit });
        } else {
          await writeJson('report_dashboard_items', 'POST', { dashboard_id: d.id, ...asSaved(x), position: x.position, row_limit: x.row_limit });
        }
      }
      notify.success(d.is_template ? `Saved the template "${d.title}" for ${audienceWords(d.role_key)}` : `Saved "${d.title}"`);
      setEditing(false);
      if (dashboard) start();
      else router.replace(`/dashboard?id=${d.id}`);
    } catch (error) {
      notify.error(`Couldn't save: ${error.message}`);
    }
    setBusy(false);
  };

  const remove = async () => {
    const what = dashboard.is_template ? 'template' : 'dashboard';
    const extra = dashboard.is_template ? ` It disappears for ${audienceWords(dashboard.role_key)}, but anyone who already used it keeps their own dashboard.` : '';
    if (!window.confirm(`Delete the ${what} "${dashboard.title}"?${extra} The reports on it stay where they are. This can't be undone.`)) return;
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
    drop: (on, chosen) => ({ border: `${chosen ? 2 : 1}px ${chosen ? 'solid' : 'dashed'} ${on || chosen ? PERSONAL_TEXT : '#475569'}`, background: on ? `${PERSONAL_FILL}22` : '#0f172a', borderRadius: '0.5rem', padding: '0.6rem', minHeight: '7rem', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '0.4rem' }),
    tool: (ok) => ({ background: 'none', border: '1px solid #334155', color: ok ? '#fff' : GREY_TEXT, borderRadius: '0.375rem', padding: '0.35rem 0.6rem', fontSize: '0.8rem', cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' })
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading the dashboard…</p></div></div>;
  }

  const backLink = <Link href="/insights?tab=dashboards" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>;
  const reportLabel = (r) => (r.role_key ? `${r.title} (${roleOf(r.role_key)?.label || 'role'} report)` : r.title);
  const templateTag = (d) => (
    <span style={{ ...s.tag, marginBottom: '0.4rem', color: '#fff', borderColor: PERSONAL_TEXT }}>
      <i className="ti ti-template" aria-hidden="true"></i>Template · for {d.role_key ? `${roleOf(d.role_key)?.label || 'a role'}` : 'everyone'}
    </span>
  );
  const boxName = (i) => `Box ${i + 1}`;

  // How many results a box shows: a few set choices, All, or any number.
  const limitControl = (entry, where, index) => {
    const value = entry.row_limit;
    const custom = value !== null && !LIMIT_CHOICES.includes(value);
    const choice = value === null ? 'all' : custom ? 'other' : String(value);
    const name = entryTitle(entry);
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
    const note = entryNote(entry);
    return (
      <div draggable onDragStart={(e) => startDrag(e, { kind: where, index })}
        style={{ border: `1px solid ${PERSONAL_TEXT}66`, background: `${PERSONAL_FILL}33`, borderRadius: '0.375rem', padding: '0.5rem', cursor: 'grab', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
          <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT, marginTop: '0.15rem' }} aria-hidden="true"></i>
          <span style={{ flex: 1, fontWeight: 'bold', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
            {entry.snapshot || reportsById[entry.report_id] ? (entry.snapshot ? entry.snapshot.title : reportLabel(reportsById[entry.report_id])) : <em style={{ color: GREY_TEXT }}>A report you can't see</em>}
            {note && <span style={{ display: 'block', color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.75rem' }}>{note}</span>}
          </span>
          <button type="button" style={{ ...s.link, color: GREY_TEXT }} aria-label={`Take ${entryTitle(entry)} off the dashboard`}
            onClick={() => (where === 'box' ? setBoxes(boxes.map((x, j) => (j === index ? { ...x, entry: null } : x))) : setTray(tray.filter((_, j) => j !== index)))}>
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
            {boxes.map((box, j) => (where === 'box' && j === index ? null : (
              <option key={j} value={String(j)}>
                {boxName(j)} ({sizeWords(box)}){box.entry ? ` - swap with ${entryTitle(box.entry)}` : ''}
              </option>
            )))}
            {where === 'box' && <option value="tray">Out of the layout, for now</option>}
          </select>
        </div>
      </div>
    );
  };

  // ---------- Edit screen ----------
  if (editing && canEdit) {
    const opts = selected >= 0 && boxes[selected] ? shapeOptions(selected) : null;
    const tool = (key, icon, text) => {
      const o = opts[key];
      return (
        <button key={key} type="button" style={s.tool(!!o.run)} disabled={!o.run} onClick={o.run} title={o.why || undefined}>
          <i className={`ti ${icon}`} aria-hidden="true"></i>{text}
        </button>
      );
    };
    const reasons = opts ? Object.entries(opts).filter(([, o]) => o.why) : [];
    const spaces = emptySpaces(boxes);

    return (
      <div style={s.container}><div style={{ ...s.wrapper, maxWidth: '1200px' }}>
        {backLink}
        <h1 style={{ ...s.title, marginBottom: '1rem' }}>
          {dashboard ? (isTemplate ? 'Edit template' : 'Edit dashboard') : (isTemplate ? 'New template' : 'New dashboard')}
        </h1>
        {dashboard?.is_template && (
          <div role="note" style={{ ...s.card, marginBottom: '1rem', borderColor: PERSONAL_TEXT, background: `${PERSONAL_FILL}22`, flexDirection: 'row', gap: '0.6rem', alignItems: 'flex-start' }}>
            <i className="ti ti-template" style={{ fontSize: '1.3rem', color: PERSONAL_TEXT }} aria-hidden="true"></i>
            <div>
              <strong>You're editing the template for {audienceWords(dashboard.role_key)}, not your own copy.</strong>
              <p style={{ ...s.help, margin: '0.2rem 0 0' }}>
                Changes affect what people get when they use it from now on. Dashboards people already made from it don't change.
                To change only your own version, use the template and change your copy instead.
              </p>
            </div>
          </div>
        )}

        <div style={{ ...s.card, marginBottom: '1rem' }}>
          {!dashboard && (
            <>
              <span style={{ ...s.label, marginTop: 0 }}>What are you making?</span>
              <div style={s.segment} role="group" aria-label="Dashboard or template">
                <button type="button" style={s.segmentBtn(!isTemplate)} aria-pressed={!isTemplate} onClick={() => changeTarget(false, '')}>My own dashboard</button>
                <button type="button" style={s.segmentBtn(isTemplate)} aria-pressed={isTemplate} onClick={() => changeTarget(true, roleKey)}>A template for other people</button>
              </div>
              {isTemplate && (
                <>
                  <span style={s.label}>Who's it for?</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }} role="group" aria-label="Who the template is for">
                    <button type="button" style={s.pill(!roleKey)} aria-pressed={!roleKey} onClick={() => changeTarget(true, '')}>
                      {!roleKey && <i className="ti ti-check" aria-hidden="true"></i>}Everyone
                    </button>
                    {myRoles.map(r => (
                      <button key={r.key} type="button" style={s.pill(roleKey === r.key)} aria-pressed={roleKey === r.key} onClick={() => changeTarget(true, r.key)}>
                        {roleKey === r.key && <i className="ti ti-check" aria-hidden="true"></i>}{r.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p style={s.help}>
                {!isTemplate
                  ? 'Only you will see this dashboard. It can hold your own reports and your roles\' reports.'
                  : roleKey
                    ? `Everyone with the ${roleOf(roleKey)?.label} role can preview it and use it as their own dashboard. ${roleOf(roleKey)?.label} reports on it stay linked, so their updates reach everyone; your own reports are copied for each person.`
                    : 'Anyone signed in can preview it and use it as their own dashboard. Your reports on it are copied for each person, so later changes don\'t affect them.'}
              </p>
            </>
          )}

          <label style={s.label} htmlFor="dash-title">Name <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(required)</span></label>
          <input id="dash-title" value={title} onChange={(e) => setTitle(e.target.value)} style={s.input} placeholder="For example: Songbook work" />
          <label style={s.label} htmlFor="dash-desc">
            {isTemplate ? 'What it\'s for' : 'Description'}{' '}
            <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>{isTemplate ? '(required for templates)' : '(optional)'}</span>
          </label>
          <input id="dash-desc" value={description} onChange={(e) => setDescription(e.target.value)} style={s.input}
            placeholder={isTemplate ? 'Who this is useful for, and what it helps with' : 'A short note about what this dashboard is for'} />
        </div>

        {/* Ready-made layouts */}
        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Start from a layout</h2>
          <p style={{ ...s.help, margin: '0 0 0.75rem' }}>Pick one to start from, then change any box below. Reports already placed keep their order.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }} role="group" aria-label="Ready-made layouts">
            {PRESETS.map(p => {
              const on = sameShape(p.boxes, boxes);
              return (
                <button key={p.label} type="button" onClick={() => applyPreset(p)} aria-pressed={on}
                  style={{ ...s.pill(on), flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', padding: '0.5rem 0.65rem', width: '9.5rem' }}>
                  <LayoutPicture boxes={p.boxes} />
                  <span style={{ fontSize: '0.8rem', textAlign: 'left' }}>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The grid */}
        <div style={{ ...s.card, marginBottom: '1rem' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: '0.25rem' }}>Boxes and reports</h2>
          <p style={{ ...s.help, margin: '0 0 0.75rem' }}>
            Drag a report into a box, or use "Move to". Dropping on a box that's taken swaps the two.
            Choose "Change shape" on a box to split it, join it to a neighbor, or make it bigger or smaller.
          </p>

          <Grid boxes={boxes} narrow={narrow}
            render={(box, i) => {
              const key = `box-${i}`;
              const chosen = selected === i;
              return (
                <div onDragOver={allowDrop(key)} onDragLeave={() => setOver('')}
                  onDrop={(e) => { const d = endDrop(e); if (d && (d.kind === 'box' || d.kind === 'tray')) placeInBox(d, i); }}
                  style={s.drop(over === key, chosen)} aria-label={`${boxName(i)}, ${sizeWords(box)}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}><strong style={{ color: '#cbd5e1' }}>{boxName(i)}</strong> · {sizeWords(box)}</span>
                    <button type="button" style={{ ...s.link, fontSize: '0.75rem' }} aria-pressed={chosen} onClick={() => setSelected(chosen ? -1 : i)}>
                      <i className="ti ti-layout-grid" aria-hidden="true"></i> {chosen ? 'Done changing shape' : 'Change shape'}
                    </button>
                  </div>
                  {box.entry ? entryCard(box.entry, 'box', i) : <span style={{ color: GREY_TEXT, fontSize: '0.8rem', fontStyle: 'italic' }}>Empty - drop a report here</span>}
                </div>
              );
            }}
            extra={!narrow && spaces.map((sp, k) => (
              <div key={`space-${k}`} style={{ gridColumn: `${sp.x + 1} / span ${sp.w}`, gridRow: `${sp.y + 1} / span 1`, display: 'flex' }}>
                <button type="button" onClick={() => addBoxAt(sp)}
                  style={{ width: '100%', border: '1px dashed #334155', borderRadius: '0.5rem', background: 'transparent', color: GREY_TEXT, cursor: 'pointer', fontSize: '0.8rem' }}>
                  <i className="ti ti-plus" aria-hidden="true"></i> Add a box here
                </button>
              </div>
            ))}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" style={s.tool(true)} onClick={addRowBelow}><i className="ti ti-row-insert-bottom" aria-hidden="true"></i> Add a full-width box at the bottom</button>
            {narrow && spaces.length > 0 && <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>There's empty space in the layout. It's easier to fill on a wider screen.</span>}
          </div>

          {opts && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', border: `1px solid ${PERSONAL_TEXT}`, borderRadius: '0.5rem', background: '#0f172a' }} aria-live="polite">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 'bold' }}>Change the shape of {boxName(selected)} <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.85rem' }}>({sizeWords(boxes[selected])})</span></span>
                <button type="button" style={{ ...s.link, color: GREY_TEXT }} onClick={() => setSelected(-1)}><i className="ti ti-x" aria-hidden="true"></i> Close</button>
              </div>
              <p style={{ ...s.help, margin: '0.5rem 0 0.3rem' }}>Split it side by side:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {tool('across2', 'ti-columns-2', 'In half')}{tool('across3', 'ti-columns-3', 'In thirds')}{tool('across4', 'ti-layout-columns', 'In quarters')}
              </div>
              <p style={{ ...s.help, margin: '0.5rem 0 0.3rem' }}>Split it top and bottom:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {tool('down2', 'ti-layout-rows', 'In half')}{tool('down3', 'ti-layout-rows', 'In thirds')}{tool('down4', 'ti-layout-rows', 'In quarters')}
              </div>
              <p style={{ ...s.help, margin: '0.5rem 0 0.3rem' }}>Join or resize:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {tool('mergeRight', 'ti-arrow-merge-right', 'Join with the box to the right')}
                {tool('mergeBelow', 'ti-arrow-merge', 'Join with the box below')}
                {tool('wider', 'ti-arrows-horizontal', 'Wider')}
                {tool('narrower', 'ti-arrows-diagonal-minimize-2', 'Narrower')}
                {tool('taller', 'ti-arrows-vertical', 'Taller')}
                {tool('shorter', 'ti-arrows-diagonal-minimize', 'Shorter')}
                <button type="button" style={{ ...s.tool(true), color: DANGER_TEXT }} onClick={() => removeBox(selected)}>
                  <i className="ti ti-trash" aria-hidden="true"></i> Remove this box
                </button>
              </div>
              {reasons.length > 0 && (
                <details style={{ marginTop: '0.6rem' }}>
                  <summary style={{ color: PERSONAL_TEXT, cursor: 'pointer', fontSize: '0.8rem' }}>Why are some of these unavailable?</summary>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#cbd5e1', fontSize: '0.8rem' }}>
                    {[...new Set(reasons.map(([, o]) => o.why))].map(why => <li key={why}>{why}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

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
            {!isTemplate ? 'Your reports and your roles\' reports that aren\'t on it yet.'
              : roleKey ? `${roleOf(roleKey)?.label} reports (linked) and your own reports (copied for each person) that aren't on it yet.`
                : 'Your own reports that aren\'t on it yet. Each person who uses the template gets their own copy.'}
            {' '}Each one goes in the first empty box, or waits to be placed.
          </p>
          {addable.length === 0 ? (
            <p style={{ color: GREY_TEXT, fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
              Every report that can go on it is already there.
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
              <i className="ti ti-trash" aria-hidden="true"></i> {dashboard.is_template ? 'Delete template' : 'Delete dashboard'}
            </button>
          )}
        </div>
      </div></div>
    );
  }

  if (!dashboard) return null;

  // ---------- View screen ----------
  const laid = layoutOf(dashboard, items);
  const visibleBoxes = laid.boxes.filter(box => box.item);

  const resultArea = (report, rowLimit) => {
    const state = results[report.id];
    const source = datasets.find(d => d.key === report.dataset_key)?.title || report.dataset_key;
    if (!state) return <p style={{ color: GREY_TEXT, fontSize: '0.875rem', margin: 0 }}>Loading…</p>;
    if (state.noAccess) return <p style={{ color: '#cbd5e1', fontSize: '0.875rem', margin: 0 }}><i className="ti ti-lock" aria-hidden="true"></i> This report uses {source}, which you don't have access to.</p>;
    if (state.error) return <p style={{ color: DANGER_TEXT, fontSize: '0.875rem', margin: 0 }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {state.error}</p>;
    return <ReportResult result={state.result} fields={fieldsByDataset[report.dataset_key] || []} display={report.display} definition={report.definition} maxRows={rowLimit || undefined} />;
  };

  const viewCard = (item) => {
    const report = itemReport(item);
    return (
      <section style={s.card} aria-label={report?.title || 'A report you can\'t see'}>
        {report ? (
          <>
            <h2 style={s.cardTitle}>{report.title}</h2>
            {dashboard.is_template && (
              <p style={{ ...s.help, margin: '0.2rem 0 0', fontSize: '0.75rem' }}>
                {report.isCopy ? 'You\'ll get your own copy of this report' : `Shared ${roleOf(report.role_key)?.label || 'role'} report - stays linked`}
              </p>
            )}
            {report.description ? <p style={{ ...s.help, margin: '0.25rem 0 0.75rem' }}>{report.description}</p> : <div style={{ height: '0.75rem' }} />}
            <div style={{ marginBottom: '0.5rem', overflowX: 'auto' }}>{resultArea(report, item.row_limit)}</div>
          </>
        ) : (
          <p style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>
            <i className="ti ti-lock" aria-hidden="true"></i> A report on this dashboard isn't available to you - it may belong to a role you no longer have.
          </p>
        )}
        <div style={s.actions}>
          {report && !report.isCopy && (
            <Link href={`/reports?id=${report.id}&view=full`} style={{ ...s.action, color: PERSONAL_TEXT, borderColor: `${PERSONAL_TEXT}66` }}>
              <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open
            </Link>
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
          {dashboard.is_template && templateTag(dashboard)}
          <h1 style={s.title}>{dashboard.title}</h1>
          {dashboard.description && (
            <p style={{ ...s.help, color: '#cbd5e1' }}>{dashboard.is_template ? <><strong>What it's for:</strong> {dashboard.description}</> : dashboard.description}</p>
          )}
          {dashboard.is_template && (
            <p style={s.help}>This is a preview, showing your own data. Use it as your own dashboard to change anything - the template stays as it is.</p>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {dashboard.is_template && (
            <button type="button" style={s.primary} onClick={copyTemplate} disabled={busy}>
              <i className="ti ti-copy" aria-hidden="true"></i> Use as my own dashboard
            </button>
          )}
          {!dashboard.is_template && (
            <Link href={`/dashboard?new=1&template=1&from=${dashboard.id}`} style={{ ...s.secondary, textDecoration: 'none' }}>
              <i className="ti ti-template" aria-hidden="true"></i> Make a template from this
            </Link>
          )}
          {canEdit && (
            <button type="button" style={s.secondary} onClick={() => startEditing(dashboard, items)}>
              <i className="ti ti-layout" aria-hidden="true"></i> {dashboard.is_template ? 'Edit template' : 'Edit dashboard'}
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
        <Grid boxes={visibleBoxes} narrow={narrow} render={(box) => viewCard(box.item)}
          extra={laid.extra.length > 0 ? laid.extra.map((item, k) => (
            <div key={`extra-${k}`} style={narrow ? {} : { gridColumn: '1 / span 12', display: 'flex' }}>{viewCard(item)}</div>
          )) : null} />
      )}
    </div></div>
  );
}
