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

// Turn a saved definition's filters into choices per field. Anything the
// builder can't show as a choice is kept as-is so it isn't lost on save.
const choicesFromFilters = (filters = []) => {
  const choices = {};
  const kept = [];
  const get = (k) => (choices[k] = choices[k] || emptyChoice());
  const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
  filters.forEach(f => {
    const values = asArray(f.value);
    switch (f.op) {
      case 'eq': case 'in': case 'contains': case 'contains_any':
        get(f.field).include.push(...values); break;
      case 'contains_all':
        get(f.field).include.push(...values); get(f.field).mode = 'all'; break;
      case 'at_least':
        get(f.field).include = values.slice(0, 1); get(f.field).mode = 'at_least'; break;
      case 'neq': case 'not_in': case 'not_contains': case 'not_contains_any':
        get(f.field).exclude.push(...values); break;
      default:
        kept.push(f);
    }
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

  const shown = options.filter(o => o.value.toLowerCase().includes(text.trim().toLowerCase()));

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
                  <span style={{ flex: 1 }}>{o.value}</span>
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
            {v}
            <button type="button" onClick={() => onToggle(v)} aria-label={`Remove ${v}`} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
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
  useEffect(() => {
    if (!showFilters || !datasetKey) return;
    choosable.forEach(f => {
      const key = `${datasetKey}|${f.field_key}`;
      if (!valuesByField[key]) loadValues(datasetKey, f.field_key);
    });
  }, [showFilters, datasetKey, allFields]);

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
  };

  const activeChoiceCount = Object.values(choices).filter(c => c.include.length > 0 || c.exclude.length > 0).length + keptFilters.length;

  const buildDefinition = () => {
    const def = {};
    if (mode === 'count') def.group_by = [groupBy1, groupBy2].filter(Boolean);
    else def.fields = columns;

    const filters = [...keptFilters];
    Object.entries(choices).forEach(([key, c]) => {
      const field = fieldByKey(key);
      if (!field) return;
      if (c.include.length > 0) {
        if (c.mode === 'at_least') filters.push({ field: key, op: 'at_least', value: c.include[0] });
        else if (field.value_type === 'list') filters.push({ field: key, op: c.mode === 'all' ? 'contains_all' : 'contains_any', value: c.include });
        else filters.push({ field: key, op: 'in', value: c.include });
      }
      if (c.exclude.length > 0) {
        filters.push({ field: key, op: field.value_type === 'list' ? 'not_contains_any' : 'not_in', value: c.exclude });
      }
    });
    def.filters = filters;
    if (filters.length > 1 && matchAny) def.filters_match = 'any';

    if (dataset?.date_column) {
      if (['7', '30', '90', '365'].includes(datePreset)) def.last_days = Number(datePreset);
      if (datePreset === 'custom') {
        if (dateFrom) def.date_from = dateFrom;
        if (dateTo) def.date_to = dateTo;
      }
    }
    if (sortChoice) {
      const [field, dir] = sortChoice.split(':');
      def.order_by = [{ field, dir }];
    }
    return def;
  };

  const run = async (key = datasetKey, definition = buildDefinition()) => {
    setRunning(true);
    setRunError('');
    try {
      setResult(await runReport(key, definition));
    } catch (error) {
      setResult(null);
      setRunError(error.message);
    }
    setRunning(false);
  };

  const download = async () => {
    try {
      const data = await runReport(datasetKey, { ...buildDefinition(), export: true, limit: 5000 });
      downloadCsv(`${slugify(title || dataset?.title)}.csv`, data.columns, data.rows, fields);
    } catch (error) {
      notify.error(`Couldn't download: ${error.message}`);
    }
  };

  const save = async (asNew) => {
    if (!title.trim()) { notify.error('Give the report a name before saving - it\'s how you\'ll find it in Tajar Tracks.'); return; }
    setSaving(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      dataset_key: datasetKey,
      definition: buildDefinition(),
      display: mode === 'count' && !groupBy2 ? display : 'table',
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

  const filterControl = (field) => {
    const state = valuesByField[`${datasetKey}|${field.field_key}`];
    const c = choices[field.field_key] || emptyChoice();
    const hasAny = c.include.length > 0 || c.exclude.length > 0;
    const ordered = !!field.options_list;
    const isList = field.value_type === 'list';

    let body;
    if (!state || state.loading) {
      body = <p style={{ ...s.help, margin: 0 }}>Loading options…</p>;
    } else if (state.error) {
      body = <p style={{ color: DANGER_TEXT, fontSize: '0.85rem', margin: 0 }}>Couldn't load options: {state.error}</p>;
    } else if (state.list.length === 0) {
      body = <p style={{ ...s.help, margin: 0 }}>Nothing to choose from yet.</p>;
    } else if (state.list.length <= SMALL_SET) {
      const single = c.mode === 'at_least';
      body = (
        <div>
          {(ordered || (isList && c.include.length > 1)) && (
            <div style={{ ...s.segment, marginBottom: '0.5rem' }} role="group" aria-label={`How to match ${field.label}`}>
              {isList ? (
                <>
                  <button type="button" style={s.segmentBtn(c.mode !== 'all')} aria-pressed={c.mode !== 'all'} onClick={() => updateChoice(field.field_key, { mode: 'any' })}>Any of these</button>
                  <button type="button" style={s.segmentBtn(c.mode === 'all')} aria-pressed={c.mode === 'all'} onClick={() => updateChoice(field.field_key, { mode: 'all' })}>All of these</button>
                </>
              ) : (
                <>
                  <button type="button" style={s.segmentBtn(!single)} aria-pressed={!single} onClick={() => updateChoice(field.field_key, { mode: 'any' })}>Is one of</button>
                  <button type="button" style={s.segmentBtn(single)} aria-pressed={single}
                    onClick={() => updateChoice(field.field_key, { mode: 'at_least', include: c.include.slice(0, 1) })}>Is at least</button>
                </>
              )}
            </div>
          )}
          {single && <p style={{ ...s.help, margin: '0 0 0.5rem' }}>Pick one level. Everything at that level or above counts, in the order of the list below.</p>}
          <div style={s.pills}>
            {state.list.map(o => {
              const on = c.include.includes(o.value);
              return (
                <button key={o.value} type="button" style={s.pill(on)} aria-pressed={on} onClick={() => toggleIn(field.field_key, 'include', o.value, single)}>
                  <i className={`ti ${on ? 'ti-check' : 'ti-plus'}`} aria-hidden="true"></i>{o.value}
                  {o.n !== null && o.n !== undefined && <span style={{ color: GREY_TEXT, fontSize: '0.75rem' }}>{o.n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      );
    } else {
      const opts = state.list;
      body = (
        <div>
          {isList && c.include.length > 1 && (
            <div style={{ ...s.segment, marginBottom: '0.5rem' }} role="group" aria-label={`How to match ${field.label}`}>
              <button type="button" style={s.segmentBtn(c.mode !== 'all')} aria-pressed={c.mode !== 'all'} onClick={() => updateChoice(field.field_key, { mode: 'any' })}>Any of these</button>
              <button type="button" style={s.segmentBtn(c.mode === 'all')} aria-pressed={c.mode === 'all'} onClick={() => updateChoice(field.field_key, { mode: 'all' })}>All of these</button>
            </div>
          )}
          <BrowsableList id={`inc-${field.field_key}`} label="Include" options={opts} selected={c.include} accent={PERSONAL_TEXT}
            onToggle={(v) => toggleIn(field.field_key, 'include', v)} />
          <BrowsableList id={`exc-${field.field_key}`} label="Exclude" options={opts} selected={c.exclude} accent={DANGER_TEXT}
            onToggle={(v) => toggleIn(field.field_key, 'exclude', v)} />
        </div>
      );
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

  return (
    <div style={s.container}>
      <div style={s.wrapper}>
        <Link href="/insights" style={s.back}><i className="ti ti-arrow-left" aria-hidden="true"></i> Tajar Tracks</Link>
        <h1 style={{ ...s.title, marginBottom: '1.25rem' }}>{reportId ? 'Edit report' : 'New report'}</h1>

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
                  {dataset?.date_column && (
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
                  )}

                  {activeChoiceCount > 1 && (
                    <div style={{ padding: '0.75rem 0', borderTop: '1px solid #334155' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.9rem', marginRight: '0.5rem' }}>{noun.charAt(0).toUpperCase() + noun.slice(1)} must match</span>
                      <div style={s.segment} role="group" aria-label="Match all or any filters">
                        <button type="button" style={s.segmentBtn(!matchAny)} aria-pressed={!matchAny} onClick={() => setMatchAny(false)}>All of the filters</button>
                        <button type="button" style={s.segmentBtn(matchAny)} aria-pressed={matchAny} onClick={() => setMatchAny(true)}>Any of the filters</button>
                      </div>
                    </div>
                  )}

                  {choosable.map(filterControl)}

                  {keptFilters.length > 0 && (
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
                  )}
                </div>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.question}>In what order?</h2>
              <select value={sortChoice} onChange={(e) => setSortChoice(e.target.value)} style={s.select} aria-label="Order">
                {sortOptions.map(o => <option key={o.value || 'default'} value={o.value}>{o.label}</option>)}
              </select>
            </div>
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
              </div>
              {runError ? (
                <p style={{ color: DANGER_TEXT, margin: 0 }}><i className="ti ti-alert-triangle" aria-hidden="true"></i> Couldn't run this report: {runError}</p>
              ) : result ? (
                <ReportResult result={result} fields={fields} display={oneGroup ? display : 'table'} />
              ) : (
                <p style={{ color: GREY_TEXT, margin: 0 }}>Pick your settings, then run the report to see the results here.</p>
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
