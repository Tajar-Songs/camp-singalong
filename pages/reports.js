import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import {
  SUPABASE_URL, authHeaders, getJson, writeJson, runReport, ReportResult, downloadCsv, slugify, errorDetail,
  PERSONAL_TEXT, PERSONAL_FILL, GREY_TEXT, DANGER_TEXT
} from '../lib/reports';

// Report builder for Tajar Tracks. Everyone can use it; what each person can
// report on depends on their permissions. Every report runs through the
// database function run_report(), which enforces the field registry.
//
// Filters follow the style guide: choose from values that exist (never type
// them in), buttons for a handful of options, a browsable list with chips
// for many, "any / all" on multi-select lists, separate Include and Exclude
// for large sets, and an explicit Run step rather than applying live.
//
// There are two ways to build the same kind of report:
//   Guided - answer a few questions in order.
//   Pivot  - place fields into Filters, Rows, Columns and Values, by dragging
//            or by tapping a field and choosing where it goes.
// Both produce a definition for run_report(); a pivot report also remembers
// its layout (definition.builder = 'pivot', definition.pivot).

const SMALL_SET = 8;          // up to this many options: buttons; more: browsable list
const DATE_PRESETS = [
  { key: 'any', label: 'Any time' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'Last year' },
  { key: 'custom', label: 'Between dates' }
];

const emptyChoice = () => ({ include: [], exclude: [], mode: 'any' });

// Stands in for "Not set" (empty) among a field's choices.
const NOT_SET = '__not_set__';
const realValues = (values) => values.filter(v => v !== NOT_SET);

// Turn a saved definition's filters into choices per field. Anything the
// builder can't show as a choice is kept as-is so it isn't lost on save.
const choicesFromFilters = (filters = []) => {
  const choices = {};
  const kept = [];
  const get = (k) => (choices[k] = choices[k] || emptyChoice());
  const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
  filters.forEach(f => {
    const values = asArray(f.value);
    const c = () => get(f.field);
    switch (f.op) {
      case 'eq': case 'in': case 'contains': case 'contains_any':
        c().include.push(...values); break;
      case 'contains_all':
        c().include.push(...values); c().mode = 'all'; break;
      case 'at_least':
        c().include = values.slice(0, 1); c().mode = 'at_least'; break;
      case 'neq': case 'not_in': case 'not_contains': case 'not_contains_any':
        c().exclude.push(...values); break;
      case 'is_null':
        c().include.push(NOT_SET); break;
      case 'not_null':
        c().exclude.push(NOT_SET); break;
      default:
        kept.push(f);
    }
    if (f.include_empty && choices[f.field]) choices[f.field].include.push(NOT_SET);
  });
  return { choices, kept };
};

// A browsable list: every option is visible as soon as the field is
// focused, narrowing as you type. Picked options stay in place, marked with
// a check, and show as chips in a fixed-height row below.
function BrowsableList({ id, label, options, selected, onToggle, accent }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const labelFor = (v) => options.find(o => o.value === v)?.label || v;
  const shown = options.filter(o => (o.label || o.value).toLowerCase().includes(text.trim().toLowerCase()));

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: '0.5rem' }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.8rem', color: GREY_TEXT, marginBottom: '0.25rem' }}>{label}</label>
      <input
        id={id}
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={`Browse ${options.length} options, or type to narrow`}
        autoComplete="off"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem' }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-multiselectable="true"
          style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: '0.25rem', maxHeight: '15rem', overflowY: 'auto', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', listStyle: 'none', padding: '0.25rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {shown.length === 0 && <li style={{ padding: '0.5rem', color: GREY_TEXT, fontSize: '0.85rem' }}>Nothing matches "{text}"</li>}
          {shown.map(o => {
            const on = selected.includes(o.value);
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onToggle(o.value)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', background: on ? `${accent}33` : 'transparent', color: '#fff', fontSize: '0.875rem' }}>
                  <i className={`ti ${on ? 'ti-square-check' : 'ti-square'}`} style={{ color: on ? accent : GREY_TEXT }} aria-hidden="true"></i>
                  <span style={{ flex: 1 }}>{o.value === NOT_SET ? <em>{o.label}</em> : (o.label || o.value)}</span>
                  {o.n !== null && o.n !== undefined && <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}>{o.n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Fixed-height row, so picking more never pushes the page down. */}
      <div style={{ height: '2.1rem', marginTop: '0.35rem', display: 'flex', gap: '0.35rem', overflowX: 'auto', whiteSpace: 'nowrap', alignItems: 'center' }} aria-live="polite">
        {selected.length === 0 ? (
          <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>Nothing picked</span>
        ) : selected.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: `1px solid ${accent}66`, background: `${accent}22`, fontSize: '0.8rem' }}>
            {labelFor(v)}
            <button type="button" onClick={() => onToggle(v)} aria-label={`Remove ${labelFor(v)}`} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
              <i className="ti ti-x" aria-hidden="true"></i>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReportBuilder() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [valuesByField, setValuesByField] = useState({});   // `${dataset}|${field}` -> { list } or { error }

  // The report being built
  const [reportId, setReportId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [datasetKey, setDatasetKey] = useState('');
  const [mode, setMode] = useState('count');                // 'count' | 'list'
  const [groupBy1, setGroupBy1] = useState('');
  const [groupBy2, setGroupBy2] = useState('');
  const [display, setDisplay] = useState('bar');
  const [columns, setColumns] = useState([]);
  const [choices, setChoices] = useState({});                // field -> { include, exclude, mode }
  const [keptFilters, setKeptFilters] = useState([]);        // filters with no chooser, kept as-is
  const [matchAny, setMatchAny] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [datePreset, setDatePreset] = useState('any');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortChoice, setSortChoice] = useState('');          // '' = default, else 'field:dir'

  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);   // results in their own screen
  const [ranDef, setRanDef] = useState(null);            // the settings the current results came from

  // Pivot builder
  const [builder, setBuilder] = useState('guided');      // 'guided' | 'pivot'
  const [pRows, setPRows] = useState([]);
  const [pCols, setPCols] = useState([]);
  const [pCount, setPCount] = useState(true);            // "Count" is in Values
  const [pFilters, setPFilters] = useState([]);
  const [pDesc, setPDesc] = useState([]);                // fields sorted in reverse
  const [menuFor, setMenuFor] = useState('');            // field whose "where should this go" menu is open
  const [overZone, setOverZone] = useState('');
  const dragRef = useRef(null);

  const dataset = datasets.find(d => d.key === datasetKey);
  const noun = dataset?.row_noun || 'rows';
  const fields = allFields.filter(f => f.dataset_key === datasetKey && f.reportable);
  const fieldByKey = (key) => fields.find(f => f.field_key === key);
  const labelOf = (key) => (key === 'count' ? 'Count' : fieldByKey(key)?.label || key);
  const groupable = fields.filter(f => f.groupable);
  const showable = fields.filter(f => !f.aggregation_required);
  const choosable = fields.filter(f => f.filterable && f.field_key !== dataset?.date_column);

  useEffect(() => { if (router.isReady) start(); }, [router.isReady]);

  // Load the options for each filter the first time the filters are opened.
  // (The pivot builder loads them for each field as it is put in Filters.)
  useEffect(() => {
    if (!datasetKey) return;
    if (builder === 'guided' && !showFilters) return;
    const wanted = builder === 'pivot' ? choosable.filter(f => pFilters.includes(f.field_key)) : choosable;
    wanted.forEach(f => {
      const key = `${datasetKey}|${f.field_key}`;
      if (!valuesByField[key]) loadValues(datasetKey, f.field_key);
    });
  }, [showFilters, datasetKey, allFields, builder, pFilters]);

  const start = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { router.push('/?login=true'); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(false) });
      if (!res.ok) { router.push('/?login=true'); return; }
      setUser(await res.json());

      const [allDatasets, fieldRows, permissions] = await Promise.all([
        getJson('report_datasets?select=*&order=display_order.asc'),
        getJson('report_fields?select=*&order=display_order.asc'),
        fetchMyPermissions(authHeaders(false))
      ]);
      const canUse = (d) => d.audience === 'self' || permissions.includes(d.required_permission);
      setAllFields(fieldRows);

      const id = router.query.id;
      const saved = id ? (await getJson(`saved_reports?id=eq.${id}&select=*`))[0] : null;
      // Retired sources stay available only for a report that already uses one.
      const usable = allDatasets.filter(d => canUse(d) && (d.is_active || d.key === saved?.dataset_key));
      setDatasets(usable);

      if (saved) {
        loadReport(saved);
        if (router.query.view === 'full') setFullScreen(true);
        run(saved.dataset_key, saved.definition);
      } else {
        if (id) notify.error("That report wasn't found. It may have been deleted, or it belongs to someone else.");
        const first = usable.find(d => d.is_active);
        if (first) chooseDataset(first.key, fieldRows);
      }
    } catch (error) {
      console.error('Error loading the report builder:', error);
      notify.error(`Couldn't load the report builder: ${error.message}`);
    }
    setLoading(false);
  };

  const loadValues = async (dsKey, fieldKey) => {
    const key = `${dsKey}|${fieldKey}`;
    setValuesByField(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/report_field_values`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ p_dataset: dsKey, p_field: fieldKey })
      });
      if (!res.ok) throw new Error(await errorDetail(res));
      const list = await res.json();
      setValuesByField(prev => ({ ...prev, [key]: { list: Array.isArray(list) ? list : [] } }));
    } catch (error) {
      setValuesByField(prev => ({ ...prev, [key]: { error: error.message } }));
    }
  };

  // Put a saved report's settings into the form.
  const loadReport = (report) => {
    const def = report.definition || {};
    setReportId(report.id);
    setTitle(report.title || '');
    setDescription(report.description || '');
    setDatasetKey(report.dataset_key);
    const grouped = Array.isArray(def.group_by) && def.group_by.length > 0;
    setMode(grouped ? 'count' : 'list');
    setGroupBy1(grouped ? def.group_by[0] : '');
    setGroupBy2(grouped ? (def.group_by[1] || '') : '');
    setColumns(grouped ? [] : (def.fields || []));
    setDisplay(report.display || (grouped ? 'bar' : 'table'));
    const { choices: loaded, kept } = choicesFromFilters(def.filters);
    setChoices(loaded);
    setKeptFilters(kept);
    setMatchAny(def.filters_match === 'any');
    if (def.last_days) setDatePreset(String(def.last_days));
    else if (def.date_from || def.date_to) { setDatePreset('custom'); setDateFrom(def.date_from || ''); setDateTo(def.date_to || ''); }
    else setDatePreset('any');
    setShowFilters((def.filters || []).length > 0 || !!def.last_days || !!def.date_from || !!def.date_to);
    const sort = (def.order_by || [])[0];
    setSortChoice(sort ? `${sort.field}:${sort.dir || 'asc'}` : '');

    if (def.builder === 'pivot' && def.pivot) {
      setBuilder('pivot');
      setPRows(def.pivot.rows || []);
      setPCols(def.pivot.columns || []);
      setPCount((def.pivot.values || []).includes('count'));
      setPFilters(def.pivot.filters || []);
      setPDesc(def.pivot.desc || []);
      setSortChoice('');
    } else {
      setBuilder('guided');
    }
  };

  const chooseDataset = (key, fieldRows = allFields) => {
    const dsFields = fieldRows.filter(f => f.dataset_key === key && f.reportable);
    const firstGroup = dsFields.find(f => f.groupable)?.field_key || '';
    setDatasetKey(key);
    setMode(firstGroup ? 'count' : 'list');
    setGroupBy1(firstGroup);
    setGroupBy2('');
    setDisplay(firstGroup ? 'bar' : 'table');
    setColumns(dsFields.filter(f => !f.aggregation_required).slice(0, 4).map(f => f.field_key));
    setChoices({});
    setKeptFilters([]);
    setMatchAny(false);
    setDatePreset('any');
    setSortChoice('');
    setResult(null);
    setRunError('');
    setPRows(firstGroup ? [firstGroup] : dsFields.filter(f => !f.aggregation_required).slice(0, 4).map(f => f.field_key));
    setPCols([]);
    setPCount(!!firstGroup);
    setPFilters([]);
    setPDesc([]);
    setMenuFor('');
  };

  // ---------- Pivot builder ----------
  const isList = (key) => fieldByKey(key)?.value_type === 'list';
  const canFilter = (f) => f.filterable || f.field_key === dataset?.date_column;

  // Why a field can't go somewhere, in words - or '' when it can.
  const placeProblem = (key, zone) => {
    const f = fieldByKey(key);
    if (!f) return 'That field isn\'t part of this source.';
    if (zone === 'filters') {
      return canFilter(f) ? '' : `"${f.label}" can't be filtered on - there are too many different values to choose from.`;
    }
    const counting = pCount || zone === 'columns';
    if (zone === 'columns' && !f.groupable) return `"${f.label}" can't go across the top - it's different for nearly every one of the ${noun}.`;
    if (zone === 'rows' && counting && !f.groupable) return `"${f.label}" can't be counted by. Take Count out of Values to show it in a list instead.`;
    if (counting && f.value_type === 'list' && [...pRows, ...pCols].some(k => k !== key && isList(k))) {
      return `Only one field that can hold several values at once (like "${f.label}") can be used in a count at a time.`;
    }
    return '';
  };

  const without = (list, key) => list.filter(k => k !== key);
  const insertAt = (list, key, before) => {
    const rest = without(list, key);
    const at = before ? rest.indexOf(before) : -1;
    return at >= 0 ? [...rest.slice(0, at), key, ...rest.slice(at)] : [...rest, key];
  };

  // Put a field in a box. A field is in Rows or Columns, not both; Filters is separate.
  const place = (key, zone, before) => {
    setMenuFor('');
    if (key === 'count') {
      if (zone === 'values') setPCount(true);
      else notify.info('Count goes in Values - it\'s what fills in the cells.');
      return;
    }
    if (zone === 'values') { notify.info('Count is the only thing that can go in Values for now. Put fields in Rows or Columns to count by them.'); return; }
    const problem = placeProblem(key, zone);
    if (problem) { notify.error(problem); return; }
    if (zone === 'filters') setPFilters(insertAt(pFilters, key, before));
    if (zone === 'rows') { setPCols(without(pCols, key)); setPRows(insertAt(pRows, key, before)); }
    if (zone === 'columns') { setPRows(without(pRows, key)); setPCols(insertAt(pCols, key, before)); setPCount(true); }
  };

  const takeOut = (key, zone) => {
    if (zone === 'values') setPCount(false);
    if (zone === 'rows') { setPRows(without(pRows, key)); setPDesc(without(pDesc, key)); }
    if (zone === 'columns') { setPCols(without(pCols, key)); setPDesc(without(pDesc, key)); }
    if (zone === 'filters') {
      setPFilters(without(pFilters, key));
      if (key === dataset?.date_column) setDatePreset('any');
      else clearChoice(key);
    }
  };

  const nudge = (key, zone, by) => {
    const list = zone === 'rows' ? pRows : zone === 'columns' ? pCols : pFilters;
    const at = list.indexOf(key);
    const to = at + by;
    if (at < 0 || to < 0 || to >= list.length) return;
    const next = [...list];
    [next[at], next[to]] = [next[to], next[at]];
    if (zone === 'rows') setPRows(next); else if (zone === 'columns') setPCols(next); else setPFilters(next);
  };

  // What stops the pivot layout from running, in words - or ''.
  const pivotProblem = () => {
    const used = [...pRows, ...pCols];
    if (used.length === 0) return 'Put at least one field in Rows to see something.';
    if (!pCount && !dataset?.row_level_allowed) return `This source can only show counts. Add Count to Values.`;
    if (pCount) {
      const stuck = used.map(fieldByKey).find(f => f && !f.groupable);
      if (stuck) return `"${stuck.label}" can't be counted by. Take it out, or take Count out of Values to show a list instead.`;
      if (used.filter(isList).length > 1) return 'Only one field that can hold several values at once (like tags) can be used in a count at a time.';
    }
    return '';
  };

  // Carry the settings across when switching between the two builders.
  const switchBuilder = (next) => {
    if (next === builder) return;
    if (next === 'pivot') {
      const active = Object.entries(choices).filter(([, c]) => c.include.length > 0 || c.exclude.length > 0).map(([k]) => k);
      if (dataset?.date_column && datePreset !== 'any') active.unshift(dataset.date_column);
      setPFilters(active);
      setPRows(mode === 'count' ? [groupBy1, groupBy2].filter(Boolean) : columns);
      setPCols([]);
      setPCount(mode === 'count');
      const [sortField, sortDir] = sortChoice.split(':');
      setPDesc(sortField && sortField !== 'count' && sortDir === 'desc' ? [sortField] : []);
    } else {
      const used = [...pRows, ...pCols];
      if (pCount) {
        setMode('count');
        setGroupBy1(used[0] || groupable[0]?.field_key || '');
        setGroupBy2(used[1] || '');
        setDisplay('table');
        if (used.length > 2) notify.info(`The guided builder counts by up to two things, so it kept "${labelOf(used[0])}" and "${labelOf(used[1])}".`);
      } else {
        setMode('list');
        setColumns(used);
      }
      const first = used[0];
      setSortChoice(first ? `${first}:${pDesc.includes(first) ? 'desc' : 'asc'}` : '');
      setShowFilters(pFilters.length > 0);
    }
    setMenuFor('');
    setBuilder(next);
  };

  const activeChoiceCount = Object.values(choices).filter(c => c.include.length > 0 || c.exclude.length > 0).length + keptFilters.length;
  const includeFieldCount = Object.values(choices).filter(c => c.include.length > 0).length + keptFilters.length;

  const buildDefinition = () => {
    const def = {};
    const pivoting = builder === 'pivot';
    if (pivoting) {
      const used = [...pRows, ...pCols];
      if (pCount) def.group_by = used; else def.fields = used;
      def.builder = 'pivot';
      def.pivot = { rows: pRows, columns: pCols, values: pCount ? ['count'] : [], filters: pFilters, desc: pDesc.filter(k => used.includes(k)) };
      def.limit = 5000;
    }
    else if (mode === 'count') def.group_by = [groupBy1, groupBy2].filter(Boolean);
    else def.fields = columns;

    const filters = [...keptFilters];
    Object.entries(choices).forEach(([key, c]) => {
      const field = fieldByKey(key);
      if (!field) return;
      const include = realValues(c.include);
      const includeNotSet = c.include.includes(NOT_SET);
      if (include.length > 0) {
        const f = c.mode === 'at_least' ? { field: key, op: 'at_least', value: include[0] }
          : field.value_type === 'list' ? { field: key, op: c.mode === 'all' ? 'contains_all' : 'contains_any', value: include }
          : { field: key, op: 'in', value: include };
        if (includeNotSet) f.include_empty = true;
        filters.push(f);
      } else if (includeNotSet) {
        filters.push({ field: key, op: 'is_null' });
      }
      // Exclusions always apply, even when the other filters match "any".
      const exclude = realValues(c.exclude);
      if (exclude.length > 0) {
        filters.push({ field: key, op: field.value_type === 'list' ? 'not_contains_any' : 'not_in', value: exclude, always: true });
      }
      if (c.exclude.includes(NOT_SET)) filters.push({ field: key, op: 'not_null', always: true });
    });
    def.filters = filters;
    if (filters.filter(f => !f.always).length > 1 && matchAny) def.filters_match = 'any';

    if (dataset?.date_column) {
      if (['7', '30', '90', '365'].includes(datePreset)) def.last_days = Number(datePreset);
      if (datePreset === 'custom') {
        if (dateFrom) def.date_from = dateFrom;
        if (dateTo) def.date_to = dateTo;
      }
    }
    if (pivoting) {
      // Organized by the Rows fields in order, then the Columns fields.
      def.order_by = [...pRows, ...pCols].map(k => ({ field: k, dir: pDesc.includes(k) ? 'desc' : 'asc' }));
    } else if (sortChoice) {
      const [field, dir] = sortChoice.split(':');
      def.order_by = [{ field, dir }];
    }
    return def;
  };

  const run = async (key = datasetKey, definition) => {
    if (!definition) {
      const problem = builder === 'pivot' ? pivotProblem() : '';
      if (problem) { setResult(null); setRunError(problem); return; }
      definition = buildDefinition();
    }
    setRunning(true);
    setRunError('');
    try {
      const data = await runReport(key, definition);
      setRanDef(definition);
      setResult(data);
    } catch (error) {
      setResult(null);
      setRunError(error.message);
    }
    setRunning(false);
  };

  const download = async () => {
    const problem = builder === 'pivot' ? pivotProblem() : '';
    if (problem) { notify.error(problem); return; }
    try {
      const data = await runReport(datasetKey, { ...buildDefinition(), export: true, limit: 5000 });
      downloadCsv(`${slugify(title || dataset?.title)}.csv`, data.columns, data.rows, fields);
    } catch (error) {
      notify.error(`Couldn't download: ${error.message}`);
    }
  };

  const save = async (asNew) => {
    if (!title.trim()) { notify.error('Give the report a name before saving - it\'s how you\'ll find it in Tajar Tracks.'); return; }
    const problem = builder === 'pivot' ? pivotProblem() : '';
    if (problem) { notify.error(`This can't be saved yet. ${problem}`); return; }
    setSaving(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      dataset_key: datasetKey,
      definition: buildDefinition(),
      display: builder === 'guided' && mode === 'count' && !groupBy2 ? display : 'table',
      updated_at: new Date().toISOString()
    };
    try {
      if (reportId && !asNew) {
        await writeJson(`saved_reports?id=eq.${reportId}`, 'PATCH', body);
        notify.success(`Saved "${body.title}"`);
      } else {
        const last = await getJson('saved_reports?select=hub_order&order=hub_order.desc&limit=1');
        const rows = await writeJson('saved_reports', 'POST', { ...body, owner_id: user.id, hub_order: (last[0]?.hub_order || 0) + 1 });
        setReportId(rows[0].id);
        router.replace(`/reports?id=${rows[0].id}`, undefined, { shallow: true });
        notify.success(`Saved "${body.title}" to Tajar Tracks`);
      }
    } catch (error) {
      notify.error(`Couldn't save: ${error.message}`);
    }
    setSaving(false);
  };

  const updateChoice = (key, changes) => {
    setChoices(prev => ({ ...prev, [key]: { ...(prev[key] || emptyChoice()), ...changes } }));
  };
  const toggleIn = (key, part, value, single = false) => {
    const current = choices[key]?.[part] || [];
    const next = current.includes(value) ? current.filter(v => v !== value) : single ? [value] : [...current, value];
    updateChoice(key, { [part]: next });
  };
  const clearChoice = (key) => setChoices(prev => { const next = { ...prev }; delete next[key]; return next; });

  // ---------- Styles ----------
  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    back: { color: PERSONAL_TEXT, textDecoration: 'none', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' },
    layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '1rem', alignItems: 'start' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1rem' },
    question: { fontWeight: 'bold', fontSize: '1.05rem', margin: '0 0 0.25rem' },
    help: { color: GREY_TEXT, fontSize: '0.85rem', margin: '0 0 0.75rem' },
    label: { display: 'block', fontSize: '0.85rem', fontWeight: 'bold', margin: '0.75rem 0 0.35rem' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem' },
    select: { background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem', maxWidth: '100%' },
    source: (on) => ({ textAlign: 'left', width: '100%', padding: '0.75rem', borderRadius: '0.375rem', border: `1px solid ${on ? PERSONAL_TEXT : '#334155'}`, background: on ? `${PERSONAL_FILL}33` : 'transparent', color: '#fff', cursor: 'pointer', marginBottom: '0.5rem' }),
    segment: { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden' },
    segmentBtn: (on) => ({ padding: '0.45rem 0.9rem', border: 'none', background: on ? PERSONAL_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    pill: (on) => ({ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${on ? PERSONAL_TEXT : '#334155'}`, background: on ? `${PERSONAL_FILL}40` : 'transparent', color: on ? '#fff' : '#cbd5e1', fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }),
    pills: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
    primary: { background: PERSONAL_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    secondary: { background: 'transparent', color: '#fff', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    link: { background: 'none', border: 'none', color: PERSONAL_TEXT, cursor: 'pointer', padding: 0, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' },
    filterBlock: { padding: '0.75rem 0', borderTop: '1px solid #334155' }
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading the report builder…</p></div></div>;
  }

  if (datasets.length === 0) {
    return (
      <div style={s.container}><div style={s.wrapper}>
        <Link href="/insights" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>
        <h1 style={s.title}>Report builder</h1>
        <p style={{ color: GREY_TEXT }}>There's nothing available for you to report on yet.</p>
      </div></div>
    );
  }

  const oneGroup = mode === 'count' && groupBy1 && !groupBy2;
  const listGroups = groupable.filter(f => f.value_type === 'list').map(f => f.field_key);

  // Sort choices, in words that say what they mean.
  const sortOptions = [];
  if (mode === 'count') {
    sortOptions.push({ value: '', label: `Most ${noun} first` });
    sortOptions.push({ value: 'count:asc', label: `Fewest ${noun} first` });
    [groupBy1, groupBy2].filter(Boolean).forEach(k => {
      sortOptions.push({ value: `${k}:asc`, label: `${labelOf(k)}, A to Z` });
      sortOptions.push({ value: `${k}:desc`, label: `${labelOf(k)}, Z to A` });
    });
  } else {
    sortOptions.push({ value: '', label: dataset?.date_column ? 'Newest first' : 'Default order' });
    columns.forEach(k => {
      const f = fieldByKey(k);
      if (!f) return;
      if (f.value_type === 'date' || f.value_type === 'timestamp') {
        sortOptions.push({ value: `${k}:desc`, label: `${f.label}, newest first` });
        sortOptions.push({ value: `${k}:asc`, label: `${f.label}, oldest first` });
      } else if (f.value_type === 'number') {
        sortOptions.push({ value: `${k}:desc`, label: `${f.label}, largest first` });
        sortOptions.push({ value: `${k}:asc`, label: `${f.label}, smallest first` });
      } else {
        sortOptions.push({ value: `${k}:asc`, label: `${f.label}, A to Z` });
        sortOptions.push({ value: `${k}:desc`, label: `${f.label}, Z to A` });
      }
    });
  }


  // A collapsible list of what each field means, so descriptions aren't only on hover.
  const fieldGuide = (list) => {
    const described = list.filter(f => f.description);
    if (described.length === 0) return null;
    return (
      <details style={{ marginTop: '0.6rem' }}>
        <summary style={{ color: PERSONAL_TEXT, cursor: 'pointer', fontSize: '0.85rem' }}>What do these mean?</summary>
        <dl style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
          {described.map(f => (
            <div key={f.field_key} style={{ marginBottom: '0.35rem' }}>
              <dt style={{ display: 'inline', fontWeight: 'bold' }}>{f.label}: </dt>
              <dd style={{ display: 'inline', margin: 0, color: '#cbd5e1' }}>{f.description}</dd>
            </div>
          ))}
        </dl>
      </details>
    );
  };

  const filterControl = (field) => {
    const state = valuesByField[`${datasetKey}|${field.field_key}`];
    const c = choices[field.field_key] || emptyChoice();
    const hasAny = c.include.length > 0 || c.exclude.length > 0;
    const isList = field.value_type === 'list';
    const single = c.mode === 'at_least';
    const includeCount = realValues(c.include).length;

    const matchToggle = () => {
      if (field.is_ordered) {
        return (
          <div style={{ ...s.segment, marginBottom: '0.5rem' }} role="group" aria-label={`How to match ${field.label}`}>
            <button type="button" style={s.segmentBtn(!single)} aria-pressed={!single} onClick={() => updateChoice(field.field_key, { mode: 'any' })}>Is one of</button>
            <button type="button" style={s.segmentBtn(single)} aria-pressed={single}
              onClick={() => updateChoice(field.field_key, { mode: 'at_least', include: [...realValues(c.include).slice(0, 1), ...c.include.filter(v => v === NOT_SET)] })}>Is at least</button>
          </div>
        );
      }
      if (isList && includeCount > 1) {
        return (
          <div style={{ ...s.segment, marginBottom: '0.5rem' }} role="group" aria-label={`How to match ${field.label}`}>
            <button type="button" style={s.segmentBtn(c.mode !== 'all')} aria-pressed={c.mode !== 'all'} onClick={() => updateChoice(field.field_key, { mode: 'any' })}>Has any of these</button>
            <button type="button" style={s.segmentBtn(c.mode === 'all')} aria-pressed={c.mode === 'all'} onClick={() => updateChoice(field.field_key, { mode: 'all' })}>Has all of these</button>
          </div>
        );
      }
      return null;
    };

    let body;
    if (!state || state.loading) {
      body = <p style={{ ...s.help, margin: 0 }}>Loading options…</p>;
    } else if (state.error) {
      body = <p style={{ color: DANGER_TEXT, fontSize: '0.85rem', margin: 0 }}>Couldn't load options: {state.error}</p>;
    } else {
      // Options that exist, plus "Not set" where it applies. Yes/no fields read as Yes and No.
      const opts = state.list.map(o => ({
        value: o.value,
        label: field.value_type === 'boolean' ? (o.value === 'true' ? 'Yes' : o.value === 'false' ? 'No' : o.value) : o.value,
        n: o.n
      }));
      if (field.not_set_label) opts.push({ value: NOT_SET, label: field.not_set_label, n: null });

      if (opts.length === 0) {
        body = <p style={{ ...s.help, margin: 0 }}>Nothing to choose from yet.</p>;
      } else if (opts.length <= SMALL_SET) {
        const pillRow = (part, accent) => (
          <div style={s.pills}>
            {opts.map(o => {
              const on = c[part].includes(o.value);
              const oneOnly = part === 'include' && single && o.value !== NOT_SET;
              return (
                <button key={o.value} type="button" style={part === 'exclude' && on ? { ...s.pill(true), borderColor: DANGER_TEXT, background: `${DANGER_TEXT}33` } : s.pill(on)}
                  aria-pressed={on}
                  onClick={() => {
                    if (oneOnly) {
                      const rest = c.include.filter(v => v === NOT_SET);
                      updateChoice(field.field_key, { include: on ? rest : [o.value, ...rest] });
                    } else toggleIn(field.field_key, part, o.value);
                  }}>
                  <i className={`ti ${on ? (part === 'exclude' ? 'ti-ban' : 'ti-check') : 'ti-plus'}`} aria-hidden="true"></i>
                  {o.value === NOT_SET ? <em>{o.label}</em> : o.label}
                  {o.n !== null && o.n !== undefined && <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}>{o.n}</span>}
                </button>
              );
            })}
          </div>
        );
        body = (
          <div>
            {matchToggle()}
            {single && <p style={{ ...s.help, margin: '0 0 0.5rem' }}>Pick one level. That level and every level listed before it count.</p>}
            <span style={{ ...s.label, margin: '0 0 0.3rem', fontWeight: 'normal', color: GREY_TEXT }}>Include</span>
            {pillRow('include', PERSONAL_TEXT)}
            <span style={{ ...s.label, margin: '0.6rem 0 0.3rem', fontWeight: 'normal', color: GREY_TEXT }}>Exclude</span>
            {pillRow('exclude', DANGER_TEXT)}
          </div>
        );
      } else {
        body = (
          <div>
            {matchToggle()}
            <BrowsableList id={`inc-${field.field_key}`} label="Include" options={opts} selected={c.include} accent={PERSONAL_TEXT}
              onToggle={(v) => toggleIn(field.field_key, 'include', v, single && v !== NOT_SET)} />
            <BrowsableList id={`exc-${field.field_key}`} label="Exclude" options={opts} selected={c.exclude} accent={DANGER_TEXT}
              onToggle={(v) => toggleIn(field.field_key, 'exclude', v)} />
          </div>
        );
      }
    }

    return (
      <div key={field.field_key} style={s.filterBlock}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div>
            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{field.label}</span>
            {field.description && <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}> — {field.description}</span>}
          </div>
          {hasAny && (
            <button type="button" style={{ ...s.link, color: GREY_TEXT }} onClick={() => clearChoice(field.field_key)}>
              <i className="ti ti-x" aria-hidden="true"></i> Clear
            </button>
          )}
        </div>
        {body}
      </div>
    );
  };


  // The date range, the all/any choice and any carried-over filters are the
  // same in both builders.
  const dateControl = () => (
    <div style={{ paddingBottom: '0.75rem' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{labelOf(dataset.date_column)}</span>
                      <div style={{ ...s.pills, marginTop: '0.4rem' }}>
                        {DATE_PRESETS.map(p => (
                          <button key={p.key} type="button" style={s.pill(datePreset === p.key)} aria-pressed={datePreset === p.key} onClick={() => setDatePreset(p.key)}>{p.label}</button>
                        ))}
                      </div>
                      {datePreset === 'custom' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={s.select} aria-label="From" />
                          <span style={{ color: GREY_TEXT }}>to</span>
                          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={s.select} aria-label="To" />
                        </div>
                      )}
                    </div>
  );

  const matchControl = () => includeFieldCount > 1 && (
    <div style={{ padding: '0.75rem 0', borderTop: '1px solid #334155' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.9rem', marginRight: '0.5rem' }}>{noun.charAt(0).toUpperCase() + noun.slice(1)} must match</span>
                      <div style={s.segment} role="group" aria-label="Match all or any of the Include choices">
                        <button type="button" style={s.segmentBtn(!matchAny)} aria-pressed={!matchAny} onClick={() => setMatchAny(false)}>All of the Include choices</button>
                        <button type="button" style={s.segmentBtn(matchAny)} aria-pressed={matchAny} onClick={() => setMatchAny(true)}>Any of them</button>
                      </div>
                      <p style={{ ...s.help, margin: '0.4rem 0 0' }}>Exclude choices always apply.</p>
                    </div>
  );

  const keptControl = () => keptFilters.length > 0 && (
    <div style={s.filterBlock}>
                      <p style={{ ...s.help, margin: '0 0 0.4rem' }}>Also applied (from this report's original settings):</p>
                      {keptFilters.map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span>{labelOf(f.field)} {f.op === 'not_null' ? 'is not empty' : f.op === 'is_null' ? 'is empty' : f.op}</span>
                          <button type="button" style={{ ...s.link, color: GREY_TEXT }} onClick={() => setKeptFilters(keptFilters.filter((_, j) => j !== i))}>
                            <i className="ti ti-x" aria-hidden="true"></i> Remove
                          </button>
                        </div>
                      ))}
                    </div>
  );

  // ---------- Pivot builder: the fields list and the four boxes ----------
  const zoneInfo = {
    filters: { title: 'Filters', icon: 'ti-filter', help: `Only include ${noun} that match. Your choices appear below.`, empty: 'No filters, so everything is included.' },
    columns: { title: 'Columns', icon: 'ti-columns', help: 'Spread the counts across the top.', empty: 'Nothing across the top.' },
    rows: { title: 'Rows', icon: 'ti-list', help: 'Organize by these, in order: first by the top one, then by the next.', empty: 'Put a field here to start.' },
    values: { title: 'Values', icon: 'ti-hash', help: `What fills the cells. Leave this empty for a plain list of ${noun}.`, empty: `Empty, so you'll get a list of ${noun}.` }
  };
  const zoneItems = (zone) => zone === 'filters' ? pFilters : zone === 'rows' ? pRows : zone === 'columns' ? pCols : (pCount ? ['count'] : []);
  const zonesOf = (key) => ['filters', 'rows', 'columns'].filter(z => zoneItems(z).includes(key));
  const chipLabel = (key) => (key === 'count' ? `Count of ${noun}` : labelOf(key));

  const orderWords = (key, reversed) => {
    const type = fieldByKey(key)?.value_type;
    if (type === 'date' || type === 'timestamp') return reversed ? 'Newest first' : 'Oldest first';
    if (type === 'number') return reversed ? 'Largest first' : 'Smallest first';
    return reversed ? 'Z to A' : 'A to Z';
  };

  const startDrag = (e, key) => {
    dragRef.current = key;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', key); } catch (err) { /* some browsers refuse; the ref is enough */ }
  };
  const dropOn = (e, zone, before) => {
    e.preventDefault();
    e.stopPropagation();
    const key = dragRef.current;
    dragRef.current = null;
    setOverZone('');
    if (!key || key === before) return;
    place(key, zone, before);
  };

  const iconBtn = { background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.2rem', display: 'inline-flex', fontSize: '1rem' };

  const zoneBox = (zone) => {
    const info = zoneInfo[zone];
    const items = zoneItems(zone);
    const over = overZone === zone;
    return (
      <section key={zone} aria-label={info.title}
        onDragOver={(e) => { e.preventDefault(); if (!over) setOverZone(zone); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverZone(''); }}
        onDrop={(e) => dropOn(e, zone)}
        style={{ border: `1px dashed ${over ? PERSONAL_TEXT : '#475569'}`, background: over ? `${PERSONAL_FILL}22` : '#0f172a', borderRadius: '0.5rem', padding: '0.75rem', minHeight: '7.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <i className={`ti ${info.icon}`} aria-hidden="true"></i>{info.title}
        </h3>
        <p style={{ ...s.help, fontSize: '0.8rem', margin: '0.15rem 0 0.5rem' }}>{info.help}</p>
        {items.length === 0 ? (
          <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: 0, fontStyle: 'italic' }}>{info.empty}</p>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((key, i) => (
              <li key={key} draggable onDragStart={(e) => startDrag(e, key)}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropOn(e, zone, key)}
                style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem', padding: '0.3rem 0.4rem', marginBottom: '0.3rem', borderRadius: '0.375rem', border: `1px solid ${PERSONAL_TEXT}66`, background: `${PERSONAL_FILL}33`, fontSize: '0.85rem', cursor: 'grab' }}>
                <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT }} aria-hidden="true"></i>
                <span style={{ flex: 1, minWidth: '6rem' }}>
                  {zone !== 'values' && zone !== 'filters' && items.length > 1 && <span style={{ color: GREY_TEXT }}>{i + 1}. </span>}
                  {chipLabel(key)}
                </span>
                {(zone === 'rows' || zone === 'columns') && (
                  <button type="button" onClick={() => setPDesc(pDesc.includes(key) ? without(pDesc, key) : [...pDesc, key])}
                    aria-label={`${chipLabel(key)} is in order ${orderWords(key, pDesc.includes(key))}. Switch to ${orderWords(key, !pDesc.includes(key))}`}
                    style={{ ...iconBtn, fontSize: '0.75rem', color: PERSONAL_TEXT, gap: '0.2rem', alignItems: 'center' }}>
                    <i className={`ti ${pDesc.includes(key) ? 'ti-sort-descending' : 'ti-sort-ascending'}`} aria-hidden="true"></i>{orderWords(key, pDesc.includes(key))}
                  </button>
                )}
                {zone !== 'values' && items.length > 1 && (
                  <>
                    <button type="button" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }} disabled={i === 0} onClick={() => nudge(key, zone, -1)} aria-label={`Move ${chipLabel(key)} earlier in ${info.title}`}>
                      <i className="ti ti-arrow-up" aria-hidden="true"></i>
                    </button>
                    <button type="button" style={{ ...iconBtn, opacity: i === items.length - 1 ? 0.35 : 1 }} disabled={i === items.length - 1} onClick={() => nudge(key, zone, 1)} aria-label={`Move ${chipLabel(key)} later in ${info.title}`}>
                      <i className="ti ti-arrow-down" aria-hidden="true"></i>
                    </button>
                  </>
                )}
                <button type="button" style={iconBtn} onClick={() => takeOut(key, zone)} aria-label={`Take ${chipLabel(key)} out of ${info.title}`}>
                  <i className="ti ti-x" aria-hidden="true"></i>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  };

  const pivotPanel = () => {
    const problem = pivotProblem();
    const menuField = menuFor ? fieldByKey(menuFor) : null;
    return (
      <>
        <div style={s.card}>
          <h2 style={s.question}>Fields</h2>
          <p style={s.help}>Drag a field into one of the boxes below, or tap it and choose where it goes. A field can be a filter and also be in Rows or Columns.</p>
          <div style={s.pills}>
            {fields.map(f => {
              const used = zonesOf(f.field_key);
              const open = menuFor === f.field_key;
              return (
                <button key={f.field_key} type="button" draggable onDragStart={(e) => startDrag(e, f.field_key)}
                  onClick={() => setMenuFor(open ? '' : f.field_key)} aria-expanded={open} aria-controls="field-placer"
                  style={{ ...s.pill(used.length > 0), cursor: 'grab', outline: open ? `2px solid ${PERSONAL_TEXT}` : undefined }}>
                  <i className="ti ti-grip-vertical" style={{ color: GREY_TEXT }} aria-hidden="true"></i>
                  {f.label}
                  {used.length > 0 && <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}>in {used.map(z => zoneInfo[z].title).join(', ')}</span>}
                </button>
              );
            })}
            <button type="button" draggable onDragStart={(e) => startDrag(e, 'count')} onClick={() => { setMenuFor(''); setPCount(!pCount); }}
              aria-pressed={pCount} style={{ ...s.pill(pCount), cursor: 'grab' }}>
              <i className="ti ti-hash" aria-hidden="true"></i>
              Count of {noun}
              <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}>{pCount ? 'in Values' : 'tap to add to Values'}</span>
            </button>
          </div>

          {menuField && (
            <div id="field-placer" style={{ marginTop: '0.75rem', padding: '0.75rem', border: `1px solid ${PERSONAL_TEXT}`, borderRadius: '0.375rem', background: '#0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Where should "{menuField.label}" go?</span>
                <button type="button" style={{ ...s.link, color: GREY_TEXT }} onClick={() => setMenuFor('')}><i className="ti ti-x" aria-hidden="true"></i> Close</button>
              </div>
              {menuField.description && <p style={{ ...s.help, margin: '0.2rem 0 0' }}>{menuField.description}</p>}
              <div style={{ ...s.pills, marginTop: '0.5rem' }}>
                {['filters', 'rows', 'columns'].map(zone => {
                  const inZone = zoneItems(zone).includes(menuField.field_key);
                  const blocked = inZone ? '' : placeProblem(menuField.field_key, zone);
                  return (
                    <button key={zone} type="button" disabled={!!blocked}
                      style={{ ...(inZone ? s.secondary : s.primary), padding: '0.4rem 0.8rem', fontSize: '0.85rem', opacity: blocked ? 0.45 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}
                      onClick={() => (inZone ? takeOut(menuField.field_key, zone) : place(menuField.field_key, zone))}>
                      <i className={`ti ${inZone ? 'ti-x' : zoneInfo[zone].icon}`} aria-hidden="true"></i>
                      {inZone ? `Take out of ${zoneInfo[zone].title}` : `Add to ${zoneInfo[zone].title}`}
                    </button>
                  );
                })}
              </div>
              {['filters', 'rows', 'columns'].map(zone => {
                const blocked = zoneItems(zone).includes(menuField.field_key) ? '' : placeProblem(menuField.field_key, zone);
                return blocked ? <p key={zone} style={{ ...s.help, fontSize: '0.8rem', margin: '0.4rem 0 0' }}><strong>{zoneInfo[zone].title}:</strong> {blocked}</p> : null;
              })}
            </div>
          )}
          {fieldGuide(fields)}
        </div>

        <div style={s.card}>
          <h2 style={s.question}>Lay out the report</h2>
          <p style={s.help}>With Count in Values you get a table of counts. Without it you get a list, organized by the fields in Rows.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '0.6rem' }}>
            {zoneBox('filters')}
            {zoneBox('columns')}
            {zoneBox('rows')}
            {zoneBox('values')}
          </div>
          {problem && (
            <p role="status" style={{ color: '#fff', fontSize: '0.85rem', margin: '0.75rem 0 0', display: 'flex', gap: '0.4rem' }}>
              <i className="ti ti-alert-triangle" style={{ color: DANGER_TEXT }} aria-hidden="true"></i>{problem}
            </p>
          )}
        </div>

        {(pFilters.length > 0 || keptFilters.length > 0) && (
          <div style={s.card}>
            <h2 style={s.question}>Filter choices</h2>
            <p style={s.help}>Pick what to include or exclude for each field in Filters. A filter with nothing picked doesn't change anything.</p>
            {matchControl()}
            {pFilters.map(key => {
              if (key === dataset?.date_column) return <div key={key} style={s.filterBlock}>{dateControl()}</div>;
              const f = fieldByKey(key);
              return f ? filterControl(f) : null;
            })}
            {keptControl()}
          </div>
        )}
      </>
    );
  };

  // Results in their own screen: the whole width, every row, with the
  // settings tucked away until "Change settings".
  if (fullScreen) {
    return (
      <div style={s.container}>
        <div style={s.wrapper}>
          <Link href="/insights" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <h1 style={s.title}>{title || 'Report'}</h1>
              {description && <p style={{ ...s.help, margin: '0.25rem 0 0' }}>{description}</p>}
              <p style={{ ...s.help, margin: '0.25rem 0 0' }}>From: {dataset?.title}{result && ranDef?.builder !== 'pivot' ? ` · ${result.row_count} row${result.row_count === 1 ? '' : 's'}` : ''}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" style={s.secondary} onClick={() => setFullScreen(false)}>
                <i className="ti ti-adjustments" aria-hidden="true"></i> Change settings
              </button>
              <button type="button" style={s.secondary} onClick={() => run()} disabled={running}>
                <i className="ti ti-refresh" aria-hidden="true"></i> {running ? 'Running…' : 'Refresh'}
              </button>
              {dataset?.exportable && (
                <button type="button" style={s.primary} onClick={download}>
                  <i className="ti ti-download" aria-hidden="true"></i> Download CSV
                </button>
              )}
            </div>
          </div>
          <div style={s.card}>
            {runError ? (
              <p style={{ color: DANGER_TEXT, margin: 0 }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {runError}</p>
            ) : result ? (
              <ReportResult result={result} fields={fields} display={oneGroup ? display : 'table'} definition={ranDef} />
            ) : (
              <p style={{ color: GREY_TEXT, margin: 0 }}>{running ? 'Running…' : 'Run the report to see results.'}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.wrapper}>
        <Link href="/insights" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>
        <h1 style={{ ...s.title, marginBottom: '0.75rem' }}>{reportId ? 'Edit report' : 'New report'}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={s.segment} role="group" aria-label="How to build the report">
            <button type="button" style={s.segmentBtn(builder === 'guided')} aria-pressed={builder === 'guided'} onClick={() => switchBuilder('guided')}>Guided</button>
            <button type="button" style={s.segmentBtn(builder === 'pivot')} aria-pressed={builder === 'pivot'} onClick={() => switchBuilder('pivot')}>Pivot</button>
          </div>
          <span style={{ color: GREY_TEXT, fontSize: '0.85rem' }}>
            {builder === 'guided'
              ? 'Answer a few questions in order. Switch to Pivot to arrange fields yourself, like a pivot table.'
              : 'Arrange fields yourself, like a pivot table. Switch to Guided to answer a few questions instead.'}
          </span>
        </div>

        <div style={s.layout}>
          {/* ---------- Settings ---------- */}
          <div>
            <div style={s.card}>
              <h2 style={s.question}>What do you want to look at?</h2>
              <p style={s.help}>Each choice is a different set of information. You'll only see the ones you have access to.</p>
              {datasets.filter(d => d.is_active || d.key === datasetKey).map(d => {
                const on = d.key === datasetKey;
                return (
                  <button key={d.key} type="button" style={s.source(on)} aria-pressed={on}
                    onClick={() => { if (!on) chooseDataset(d.key); }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <i className={`ti ${on ? 'ti-circle-check' : 'ti-circle'}`} aria-hidden="true"></i>{d.title}
                      {!d.is_active && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.8rem' }}>(older source, no longer offered for new reports)</span>}
                    </div>
                    <div style={{ color: GREY_TEXT, fontSize: '0.85rem', marginTop: '0.25rem' }}>{d.description}</div>
                    {d.examples?.length > 0 && (
                      <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#cbd5e1', fontSize: '0.8rem' }}>
                        {d.examples.map(x => <li key={x}>{x}</li>)}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>

            {builder === 'pivot' ? pivotPanel() : (<>
            <div style={s.card}>
              <h2 style={s.question}>Show me…</h2>
              <p style={s.help}>A count adds things up, like how many {noun} have each status. A list shows the {noun} themselves.</p>
              <div style={s.segment} role="group" aria-label="Count or list">
                <button type="button" style={s.segmentBtn(mode === 'count')} aria-pressed={mode === 'count'} onClick={() => { setMode('count'); setSortChoice(''); }}>A count of {noun}</button>
                {dataset?.row_level_allowed && (
                  <button type="button" style={s.segmentBtn(mode === 'list')} aria-pressed={mode === 'list'} onClick={() => { setMode('list'); setSortChoice(''); }}>A list of {noun}</button>
                )}
              </div>

              {mode === 'count' ? (
                <div>
                  <span style={s.label}>Counted by</span>
                  <div style={s.pills}>
                    {groupable.map(f => (
                      <button key={f.field_key} type="button" style={s.pill(groupBy1 === f.field_key)} aria-pressed={groupBy1 === f.field_key}
                        onClick={() => { setGroupBy1(f.field_key); if (groupBy2 === f.field_key || (listGroups.includes(f.field_key) && listGroups.includes(groupBy2))) setGroupBy2(''); setSortChoice(''); }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {fieldGuide(groupable)}
                  <span style={s.label}>And then by <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(optional)</span></span>
                  <div style={s.pills}>
                    <button type="button" style={s.pill(!groupBy2)} aria-pressed={!groupBy2} onClick={() => { setGroupBy2(''); setSortChoice(''); }}>Nothing else</button>
                    {groupable.filter(f => f.field_key !== groupBy1 && !(listGroups.includes(f.field_key) && listGroups.includes(groupBy1))).map(f => (
                      <button key={f.field_key} type="button" style={s.pill(groupBy2 === f.field_key)} aria-pressed={groupBy2 === f.field_key}
                        onClick={() => { setGroupBy2(f.field_key); setSortChoice(''); }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {oneGroup && (
                    <>
                      <span style={s.label}>Show it as</span>
                      <div style={s.segment} role="group" aria-label="Show it as">
                        <button type="button" style={s.segmentBtn(display === 'bar')} aria-pressed={display === 'bar'} onClick={() => setDisplay('bar')}>Bars</button>
                        <button type="button" style={s.segmentBtn(display === 'table')} aria-pressed={display === 'table'} onClick={() => setDisplay('table')}>Table</button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <span style={s.label}>Columns to include <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(in the order you pick them)</span></span>
                  <div style={s.pills}>
                    {showable.map(f => {
                      const at = columns.indexOf(f.field_key);
                      const on = at >= 0;
                      return (
                        <button key={f.field_key} type="button" style={s.pill(on)} aria-pressed={on} title={f.description || undefined}
                          onClick={() => { setColumns(on ? columns.filter(k => k !== f.field_key) : [...columns, f.field_key]); setSortChoice(''); }}>
                          {on ? <span style={{ fontWeight: 'bold' }}>{at + 1}.</span> : <i className="ti ti-plus" aria-hidden="true"></i>}{f.label}
                        </button>
                      );
                    })}
                  </div>
                  {fieldGuide(showable)}
                </div>
              )}
            </div>

            <div style={s.card}>
              <button type="button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
                style={{ ...s.question, background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', textAlign: 'left' }}>
                <i className={`ti ${showFilters ? 'ti-chevron-down' : 'ti-chevron-right'}`} aria-hidden="true"></i>
                Only include {noun} that…
                {(activeChoiceCount > 0 || datePreset !== 'any') && (
                  <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.85rem' }}>
                    ({[activeChoiceCount > 0 && `${activeChoiceCount} filter${activeChoiceCount === 1 ? '' : 's'}`, datePreset !== 'any' && 'date range'].filter(Boolean).join(', ')})
                  </span>
                )}
              </button>
              {!showFilters && <p style={{ ...s.help, margin: '0.35rem 0 0' }}>Optional. Open this to narrow the report down.</p>}

              {showFilters && (
                <div style={{ marginTop: '0.75rem' }}>
                  {dataset?.date_column && dateControl()}

                  {matchControl()}

                  {choosable.map(filterControl)}

                  {keptControl()}
                </div>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.question}>In what order?</h2>
              <select value={sortChoice} onChange={(e) => setSortChoice(e.target.value)} style={s.select} aria-label="Order">
                {sortOptions.map(o => <option key={o.value || 'default'} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            </>)}
          </div>

          {/* ---------- Results and saving ---------- */}
          <div>
            <div style={s.card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <button type="button" style={s.primary} onClick={() => run()} disabled={running}>
                  <i className="ti ti-player-play" aria-hidden="true"></i> {running ? 'Running…' : result ? 'Run again with these settings' : 'Run report'}
                </button>
                {dataset?.exportable && (
                  <button type="button" style={s.secondary} onClick={download}>
                    <i className="ti ti-download" aria-hidden="true"></i> Download CSV
                  </button>
                )}
                <button type="button" style={s.secondary} onClick={() => { if (!result && !running) run(); setFullScreen(true); }}>
                  <i className="ti ti-arrows-maximize" aria-hidden="true"></i> Open full screen
                </button>
              </div>
              {runError ? (
                <p style={{ color: DANGER_TEXT, margin: 0 }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {runError}</p>
              ) : result ? (
                <ReportResult result={result} fields={fields} display={oneGroup ? display : 'table'} definition={ranDef} />
              ) : (
                <p style={{ color: GREY_TEXT, margin: 0 }}>{builder === 'pivot' ? 'Lay out the report, then run it to see the results here.' : 'Pick your settings, then run the report to see the results here.'}</p>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.question}>Save to Tajar Tracks</h2>
              <p style={s.help}>Saving keeps your settings, not today's results, so the report is always up to date when you open it.</p>
              <label style={s.label} htmlFor="title">Name <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(required)</span></label>
              <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} style={s.input} placeholder="For example: Songs I love but don't know well yet" />
              <label style={s.label} htmlFor="description">Description <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(optional)</span></label>
              <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} style={s.input} placeholder="A short note about what this shows" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.9rem' }}>
                <button type="button" style={s.primary} onClick={() => save(false)} disabled={saving}>
                  <i className="ti ti-device-floppy" aria-hidden="true"></i> {reportId ? 'Save changes' : 'Save'}
                </button>
                {reportId && (
                  <button type="button" style={s.secondary} onClick={() => save(true)} disabled={saving}>
                    <i className="ti ti-copy" aria-hidden="true"></i> Save as a new report
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
