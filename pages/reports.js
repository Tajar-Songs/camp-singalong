import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import {
  SUPABASE_URL, authHeaders, getJson, writeJson, runReport, ReportResult, downloadCsv, slugify,
  PERSONAL_TEXT, PERSONAL_FILL, GREY_TEXT, DANGER_TEXT
} from '../lib/reports';

// Report builder for Tajar Tracks. Everyone can use it; what each person can
// report on depends on their permissions, and every report runs through the
// database function run_report(), which enforces the field registry.

const NO_VALUE_OPS = ['is_null', 'not_null'];

// Which filters make sense for each kind of field, in plain words.
const opsFor = (field) => {
  if (!field) return [];
  switch (field.value_type) {
    case 'list':
      return [
        { op: 'contains', label: 'includes' },
        { op: 'not_contains', label: "doesn't include" },
        { op: 'not_null', label: 'has any' },
        { op: 'is_null', label: 'is empty' }
      ];
    case 'date':
    case 'timestamp':
      return [
        { op: 'gte', label: 'is on or after' },
        { op: 'lte', label: 'is on or before' }
      ];
    case 'number':
      return [
        { op: 'eq', label: 'is' },
        { op: 'gte', label: 'is at least' },
        { op: 'lte', label: 'is at most' }
      ];
    case 'boolean':
      return [{ op: 'eq', label: 'is' }];
    default: {
      const ops = [
        { op: 'eq', label: 'is' },
        { op: 'neq', label: 'is not' },
        { op: 'like', label: 'contains' },
        { op: 'not_null', label: 'is not empty' },
        { op: 'is_null', label: 'is empty' }
      ];
      if (field.options_list) ops.splice(2, 0, { op: 'at_least', label: 'is at least' });
      return ops;
    }
  }
};

export default function ReportBuilder() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [options, setOptions] = useState({});      // list_key -> [labels]

  // The report being built
  const [reportId, setReportId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [datasetKey, setDatasetKey] = useState('');
  const [mode, setMode] = useState('summary');     // 'summary' | 'rows'
  const [groupBy1, setGroupBy1] = useState('');
  const [groupBy2, setGroupBy2] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  const [filters, setFilters] = useState([]);      // [{ field, op, value }]
  const [showFilters, setShowFilters] = useState(false);
  const [dateMode, setDateMode] = useState('any'); // 'any' | 'last' | 'custom'
  const [lastDays, setLastDays] = useState('30');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [display, setDisplay] = useState('table');

  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const dataset = datasets.find(d => d.key === datasetKey);
  const fields = allFields.filter(f => f.dataset_key === datasetKey && f.reportable);
  const fieldByKey = (key) => fields.find(f => f.field_key === key);
  const groupable = fields.filter(f => f.groupable);
  const showable = fields.filter(f => !f.aggregation_required);
  const filterable = fields.filter(f => f.filterable);

  useEffect(() => { if (router.isReady) start(); }, [router.isReady]);

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
      const usable = allDatasets.filter(d => d.audience === 'self' || permissions.includes(d.required_permission));
      setDatasets(usable);
      setAllFields(fieldRows);

      const listKeys = [...new Set(fieldRows.map(f => f.options_list).filter(Boolean))];
      if (listKeys.length > 0) {
        const optionRows = await getJson(`option_lists?select=list_key,label,display_order&list_key=in.(${listKeys.join(',')})&order=display_order.asc`);
        const byList = {};
        optionRows.forEach(o => { (byList[o.list_key] = byList[o.list_key] || []).push(o.label); });
        setOptions(byList);
      }

      const id = router.query.id;
      if (id) {
        const saved = await getJson(`saved_reports?id=eq.${id}&select=*`);
        if (saved[0]) {
          loadReport(saved[0], fieldRows);
          run(saved[0].dataset_key, saved[0].definition);
        } else {
          notify.error("That report wasn't found. It may have been deleted, or it belongs to someone else.");
        }
      } else if (usable.length > 0) {
        chooseDataset(usable[0].key, fieldRows, usable);
      }
    } catch (error) {
      console.error('Error loading the report builder:', error);
      notify.error(`Couldn't load the report builder: ${error.message}`);
    }
    setLoading(false);
  };

  // Put a saved report's settings into the form.
  const loadReport = (report, fieldRows) => {
    const def = report.definition || {};
    setReportId(report.id);
    setTitle(report.title || '');
    setDescription(report.description || '');
    setDatasetKey(report.dataset_key);
    const grouped = Array.isArray(def.group_by) && def.group_by.length > 0;
    setMode(grouped ? 'summary' : 'rows');
    setGroupBy1(grouped ? def.group_by[0] : '');
    setGroupBy2(grouped ? (def.group_by[1] || '') : '');
    setSelectedFields(grouped ? [] : (def.fields || []));
    const loadedFilters = (def.filters || []).map(f => ({ field: f.field, op: f.op, value: f.value ?? '' }));
    setFilters(loadedFilters);
    setShowFilters(loadedFilters.length > 0 || !!def.last_days || !!def.date_from || !!def.date_to);
    if (def.last_days) { setDateMode('last'); setLastDays(String(def.last_days)); }
    else if (def.date_from || def.date_to) { setDateMode('custom'); setDateFrom(def.date_from || ''); setDateTo(def.date_to || ''); }
    else setDateMode('any');
    const sort = (def.order_by || [])[0];
    setSortField(sort?.field || '');
    setSortDir(sort?.dir || 'desc');
    setDisplay(report.display || 'table');
  };

  const chooseDataset = (key, fieldRows = allFields, list = datasets) => {
    const d = list.find(x => x.key === key);
    const dsFields = fieldRows.filter(f => f.dataset_key === key && f.reportable);
    setDatasetKey(key);
    const firstGroup = dsFields.find(f => f.groupable)?.field_key || '';
    setMode(firstGroup ? 'summary' : 'rows');
    setGroupBy1(firstGroup);
    setGroupBy2('');
    setSelectedFields(dsFields.filter(f => !f.aggregation_required).slice(0, 4).map(f => f.field_key));
    setFilters([]);
    setDateMode('any');
    setSortField('');
    setDisplay(firstGroup ? 'bar' : 'table');
    setResult(null);
    setRunError('');
    if (d && !d.row_level_allowed) setMode('summary');
  };

  const buildDefinition = () => {
    const def = {};
    if (mode === 'summary') def.group_by = [groupBy1, groupBy2].filter(Boolean);
    else def.fields = selectedFields;
    def.filters = filters
      .filter(f => f.field && f.op && (NO_VALUE_OPS.includes(f.op) || String(f.value).trim() !== ''))
      .map(f => (NO_VALUE_OPS.includes(f.op) ? { field: f.field, op: f.op } : { field: f.field, op: f.op, value: f.value }));
    if (dataset?.date_column) {
      if (dateMode === 'last' && Number(lastDays) > 0) def.last_days = Number(lastDays);
      if (dateMode === 'custom') {
        if (dateFrom) def.date_from = dateFrom;
        if (dateTo) def.date_to = dateTo;
      }
    }
    if (sortField) def.order_by = [{ field: sortField, dir: sortDir }];
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
    if (!title.trim()) { notify.error('Give the report a name before saving.'); return; }
    setSaving(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      dataset_key: datasetKey,
      definition: buildDefinition(),
      display: mode === 'summary' && !groupBy2 ? display : 'table',
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

  const updateFilter = (index, changes) => {
    setFilters(filters.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  };

  const toggleField = (key) => {
    setSelectedFields(selectedFields.includes(key) ? selectedFields.filter(k => k !== key) : [...selectedFields, key]);
  };

  // ---------- Styles ----------
  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    back: { color: PERSONAL_TEXT, textDecoration: 'none', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' },
    layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1rem', alignItems: 'start' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1rem' },
    cardTitle: { fontWeight: 'bold', fontSize: '1rem', margin: '0 0 0.75rem' },
    label: { display: 'block', fontSize: '0.8rem', color: GREY_TEXT, marginBottom: '0.3rem' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem' },
    select: { background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem', maxWidth: '100%' },
    hint: { color: GREY_TEXT, fontSize: '0.8rem', margin: '0.3rem 0 0' },
    choice: (on) => ({ textAlign: 'left', width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${on ? PERSONAL_TEXT : '#334155'}`, background: on ? `${PERSONAL_FILL}33` : 'transparent', color: '#fff', cursor: 'pointer', marginBottom: '0.5rem' }),
    segment: { display: 'inline-flex', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden', marginBottom: '0.75rem' },
    segmentBtn: (on) => ({ padding: '0.45rem 0.9rem', border: 'none', background: on ? PERSONAL_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    primary: { background: PERSONAL_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    secondary: { background: 'transparent', color: '#fff', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    link: { background: 'none', border: 'none', color: PERSONAL_TEXT, cursor: 'pointer', padding: 0, fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }
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

  const canBar = mode === 'summary' && groupBy1 && !groupBy2;
  const sortChoices = mode === 'summary'
    ? [...[groupBy1, groupBy2].filter(Boolean), 'count']
    : selectedFields;

  const valueInput = (filter, index) => {
    const field = fieldByKey(filter.field);
    if (!field || NO_VALUE_OPS.includes(filter.op)) return null;
    const listOptions = field.options_list ? options[field.options_list] : null;
    if (listOptions) {
      return (
        <select value={filter.value} onChange={(e) => updateFilter(index, { value: e.target.value })} style={s.select} aria-label="Value">
          <option value="">Choose…</option>
          {listOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (field.value_type === 'boolean') {
      return (
        <select value={filter.value} onChange={(e) => updateFilter(index, { value: e.target.value })} style={s.select} aria-label="Value">
          <option value="">Choose…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    const type = field.value_type === 'date' || field.value_type === 'timestamp' ? 'date'
      : field.value_type === 'number' ? 'number' : 'text';
    return (
      <input type={type} value={filter.value} onChange={(e) => updateFilter(index, { value: e.target.value })}
        style={{ ...s.select, minWidth: '10rem' }} aria-label="Value" placeholder={type === 'text' ? 'Type a value' : undefined} />
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
              <h2 style={s.cardTitle}>1. What to report on</h2>
              {datasets.map(d => (
                <button key={d.key} type="button" style={s.choice(d.key === datasetKey)} aria-pressed={d.key === datasetKey}
                  onClick={() => { if (d.key !== datasetKey) chooseDataset(d.key); }}>
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {d.key === datasetKey && <i className="ti ti-check" aria-hidden="true"></i>}{d.title}
                  </div>
                  <div style={{ color: GREY_TEXT, fontSize: '0.8rem', marginTop: '0.2rem' }}>{d.description}</div>
                </button>
              ))}
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>2. What to show</h2>
              <div style={s.segment} role="group" aria-label="Report type">
                <button type="button" style={s.segmentBtn(mode === 'summary')} aria-pressed={mode === 'summary'} onClick={() => setMode('summary')}>Counts</button>
                {dataset?.row_level_allowed && (
                  <button type="button" style={s.segmentBtn(mode === 'rows')} aria-pressed={mode === 'rows'} onClick={() => setMode('rows')}>List</button>
                )}
              </div>

              {mode === 'summary' ? (
                <div>
                  <label style={s.label} htmlFor="group1">Count by</label>
                  <select id="group1" value={groupBy1} onChange={(e) => setGroupBy1(e.target.value)} style={s.select}>
                    {groupable.map(f => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                  </select>
                  <label style={{ ...s.label, marginTop: '0.75rem' }} htmlFor="group2">Then by (optional)</label>
                  <select id="group2" value={groupBy2} onChange={(e) => setGroupBy2(e.target.value)} style={s.select}>
                    <option value="">Nothing else</option>
                    {groupable.filter(f => f.field_key !== groupBy1).map(f => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                  </select>
                  {canBar && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <span style={s.label}>Show as</span>
                      <div style={s.segment} role="group" aria-label="Show as">
                        <button type="button" style={s.segmentBtn(display === 'bar')} aria-pressed={display === 'bar'} onClick={() => setDisplay('bar')}>Bars</button>
                        <button type="button" style={s.segmentBtn(display === 'table')} aria-pressed={display === 'table'} onClick={() => setDisplay('table')}>Table</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                  <legend style={s.label}>Columns to show</legend>
                  {showable.map(f => (
                    <label key={f.field_key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedFields.includes(f.field_key)} onChange={() => toggleField(f.field_key)} style={{ marginTop: '0.2rem' }} />
                      <span>{f.label}{f.description && <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}> — {f.description}</span>}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>

            <div style={s.card}>
              <button type="button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
                style={{ ...s.cardTitle, background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <i className={`ti ${showFilters ? 'ti-chevron-down' : 'ti-chevron-right'}`} aria-hidden="true"></i>
                3. Narrow it down {filters.length > 0 && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.85rem' }}>({filters.length} filter{filters.length === 1 ? '' : 's'})</span>}
              </button>
              {showFilters && (
                <div style={{ marginTop: '0.75rem' }}>
                  {filters.length > 0 && <p style={s.hint}>Results must match every filter.</p>}
                  {filters.map((filter, index) => {
                    const field = fieldByKey(filter.field);
                    return (
                      <div key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #334155' }}>
                        <select value={filter.field} aria-label="Field" style={s.select}
                          onChange={(e) => { const next = fieldByKey(e.target.value); updateFilter(index, { field: e.target.value, op: opsFor(next)[0]?.op || 'eq', value: '' }); }}>
                          {filterable.map(f => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
                        </select>
                        <select value={filter.op} aria-label="Condition" style={s.select} onChange={(e) => updateFilter(index, { op: e.target.value })}>
                          {opsFor(field).map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                        </select>
                        {valueInput(filter, index)}
                        <button type="button" style={{ ...s.link, color: DANGER_TEXT }} onClick={() => setFilters(filters.filter((_, i) => i !== index))} aria-label="Remove this filter">
                          <i className="ti ti-x" aria-hidden="true"></i> Remove
                        </button>
                      </div>
                    );
                  })}
                  {filterable.length > 0 && (
                    <button type="button" style={{ ...s.link, marginTop: '0.6rem' }}
                      onClick={() => { const first = filterable[0]; setFilters([...filters, { field: first.field_key, op: opsFor(first)[0].op, value: '' }]); }}>
                      <i className="ti ti-plus" aria-hidden="true"></i> Add a filter
                    </button>
                  )}

                  {dataset?.date_column && (
                    <div style={{ marginTop: '1rem' }}>
                      <label style={s.label} htmlFor="dateMode">When</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <select id="dateMode" value={dateMode === 'last' ? `last-${lastDays}` : dateMode} style={s.select}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v.startsWith('last-')) { setDateMode('last'); setLastDays(v.slice(5)); } else setDateMode(v);
                          }}>
                          <option value="any">Any time</option>
                          <option value="last-7">Last 7 days</option>
                          <option value="last-30">Last 30 days</option>
                          <option value="last-90">Last 90 days</option>
                          <option value="last-365">Last year</option>
                          <option value="custom">Between dates…</option>
                        </select>
                        {dateMode === 'custom' && (
                          <>
                            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={s.select} aria-label="From" />
                            <span style={{ color: GREY_TEXT }}>to</span>
                            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={s.select} aria-label="To" />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>4. Order</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <select value={sortField} onChange={(e) => setSortField(e.target.value)} style={s.select} aria-label="Sort by">
                  <option value="">{mode === 'summary' ? 'Largest count first' : 'Default order'}</option>
                  {sortChoices.map(k => <option key={k} value={k}>{k === 'count' ? 'Count' : (fieldByKey(k)?.label || k)}</option>)}
                </select>
                {sortField && (
                  <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={s.select} aria-label="Direction">
                    <option value="asc">A to Z / smallest first / oldest first</option>
                    <option value="desc">Z to A / largest first / newest first</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* ---------- Results and saving ---------- */}
          <div>
            <div style={s.card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <button type="button" style={s.primary} onClick={() => run()} disabled={running}>
                  <i className="ti ti-player-play" aria-hidden="true"></i> {running ? 'Running…' : 'Run report'}
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
                <ReportResult result={result} fields={fields} display={canBar ? display : 'table'} />
              ) : (
                <p style={{ color: GREY_TEXT, margin: 0 }}>Choose your settings, then run the report to see results.</p>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Save to Tajar Tracks</h2>
              <label style={s.label} htmlFor="title">Name (required)</label>
              <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} style={s.input} placeholder="For example: Songs I haven't sung in a while" />
              <label style={{ ...s.label, marginTop: '0.75rem' }} htmlFor="description">Description (optional)</label>
              <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} style={s.input} placeholder="A short note about what this shows" />
              <p style={s.hint}>Saved reports show on your Tajar Tracks page. They save your settings, not the results, so they're always up to date.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
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
