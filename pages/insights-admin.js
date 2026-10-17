import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import { SUPABASE_URL, authHeaders, errorDetail, GREY_TEXT, DANGER_TEXT } from '../lib/reports';

// Insights admin: reports people have made about dashboard templates.
// Open to everyone with insights.moderate (song, health and governance admins).
//   - Possible duplicates: compare the two side by side, then merge (the
//     admin chooses which to keep; if they're identical, the one with more
//     hearts is chosen to start with) or mark them not duplicates.
//   - Other problems: dismiss the report, or remove the template.
// Nothing is deleted: merged or removed templates are retired, and people who
// already used them keep their own dashboards. The author and the reporter
// get a notice in Tajar Tracks, and every action goes in the audit trail.
// More kinds of insights moderation can be added to this page later.

// Admin pages lead with the platform green (style guide: ownership tiers).
const ADMIN_TEXT = '#3B9B73';
const ADMIN_FILL = '#318160';

const STATUS_WORDS = {
  pending: 'Waiting',
  merged: 'Merged',
  not_duplicate: 'Not a duplicate',
  dismissed: 'Dismissed',
  removed: 'Template removed'
};

const rpc = async (name, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json().catch(() => null);
};

// The same layout and the same reports in the same places (names aside).
const sameTemplate = (a, b) => {
  if (!a || !b) return false;
  if (JSON.stringify(a.layout || null) !== JSON.stringify(b.layout || null)) return false;
  const shape = (d) => JSON.stringify((d.items || []).map(i => [i.position, i.row_limit, i.linked ? i.report_id : [i.dataset_key, i.definition]]));
  return shape(a) === shape(b);
};

function LayoutPicture({ layout }) {
  const boxes = layout && Array.isArray(layout.boxes) ? layout.boxes : null;
  if (!boxes) return <span style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>Older layout</span>;
  const rows = Math.max(1, ...boxes.map(b => b.y + b.h));
  return (
    <div aria-hidden="true" style={{ width: '7rem', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridTemplateRows: `repeat(${rows}, 0.8rem)`, gap: '2px' }}>
      {boxes.map((b, i) => (
        <div key={i} style={{ gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}`, background: '#475569', borderRadius: '2px', color: '#fff', fontSize: '0.55rem', textAlign: 'center' }}>{i + 1}</div>
      ))}
    </div>
  );
}

export default function InsightsAdmin() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');   // 'pending' | 'done' | 'all'
  const [kindFilter, setKindFilter] = useState('all');           // 'all' | 'duplicate' | 'problem'
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState({});                    // template id -> details
  const [keep, setKeep] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { start(); }, []);

  const start = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { router.push('/?login=true'); return; }
      const perms = await fetchMyPermissions(authHeaders(false));
      const ok = perms.includes('insights.moderate');
      setAllowed(ok);
      if (ok) await loadReports();
    } catch (error) {
      notify.error(`Couldn't load Insights admin: ${error.message}`);
    }
    setLoading(false);
  };

  const loadReports = async () => {
    const rows = await rpc('dashboard_template_report_list');
    setReports(Array.isArray(rows) ? rows : []);
  };

  const loadDetails = async (id) => {
    if (!id || details[id]) return details[id];
    const d = await rpc('dashboard_template_details', { p_dashboard_id: id });
    setDetails(prev => ({ ...prev, [id]: d }));
    return d;
  };

  const select = async (r) => {
    setSelectedId(r.id);
    setNote('');
    setKeep(null);
    try {
      const [a, b] = await Promise.all([loadDetails(r.dashboard_id), r.duplicate_of_id ? loadDetails(r.duplicate_of_id) : null]);
      // Identical: start with the one with more hearts. Different: the admin chooses.
      if (r.kind === 'duplicate' && a && b && sameTemplate(a, b)) setKeep((b.hearts || 0) > (a.hearts || 0) ? b.id : a.id);
    } catch (error) {
      notify.error(`Couldn't load the templates: ${error.message}`);
    }
  };

  const act = async (fn, body, success) => {
    setBusy(true);
    try {
      await rpc(fn, body);
      notify.success(success);
      setDetails({});
      setSelectedId(null);
      await loadReports();
    } catch (error) {
      notify.error(error.message);
    }
    setBusy(false);
  };

  const shown = reports.filter(r =>
    (statusFilter === 'all' || (statusFilter === 'pending' ? r.status === 'pending' : r.status !== 'pending'))
    && (kindFilter === 'all' || r.kind === kindFilter));
  const selected = reports.find(r => r.id === selectedId);
  const waitingCount = reports.filter(r => r.status === 'pending').length;

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    help: { color: GREY_TEXT, fontSize: '0.85rem', margin: '0.25rem 0 0' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem' },
    segment: { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden' },
    segmentBtn: (on) => ({ padding: '0.4rem 0.85rem', border: 'none', background: on ? ADMIN_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.1rem 0.45rem' },
    primary: { background: ADMIN_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    secondary: { background: 'transparent', color: '#fff', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    danger: { background: 'transparent', color: DANGER_TEXT, border: `1px solid ${DANGER_TEXT}88`, borderRadius: '0.375rem', padding: '0.55rem 1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem', boxSizing: 'border-box' }
  };

  if (loading) return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading…</p></div></div>;

  if (!allowed) {
    return (
      <div style={s.container}><div style={s.wrapper}>
        <h1 style={s.title}>Insights admin</h1>
        <p style={{ color: '#cbd5e1' }}>This page is for admins who look after reports about dashboard templates. You don't have access to it.</p>
      </div></div>
    );
  }

  const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '');

  // One template, as a column in the comparison.
  const templateColumn = (d, choosable) => {
    if (!d) return <div style={s.card}><p style={{ color: GREY_TEXT, margin: 0 }}>Loading…</p></div>;
    const chosen = keep === d.id;
    return (
      <div style={{ ...s.card, borderColor: chosen ? ADMIN_TEXT : '#334155', borderWidth: chosen ? 2 : 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={s.tag}><i className="ti ti-template" aria-hidden="true"></i>Dashboard template · for {d.role_key ? (d.role_label || d.role_key) : 'everyone'}</span>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{d.title}</h3>
        {d.retired_at && <p style={{ color: DANGER_TEXT, margin: 0, fontSize: '0.85rem' }}>Already retired ({d.retired_reason}).</p>}
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.85rem' }}><strong>What it's for:</strong> {d.description}</p>
        <p style={{ ...s.help, margin: 0 }}>
          Made by {d.author || 'someone'} on {when(d.created_at)} · last changed {when(d.updated_at)}<br />
          <i className="ti ti-heart" aria-hidden="true"></i> {d.hearts} heart{d.hearts === 1 ? '' : 's'} · used {d.uses} time{d.uses === 1 ? '' : 's'}
        </p>
        <LayoutPicture layout={d.layout} />
        <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
          {(d.items || []).map((i, k) => (
            <li key={k}>
              {i.title || <em style={{ color: GREY_TEXT }}>Untitled report</em>}
              <span style={{ color: GREY_TEXT }}> · {i.linked ? 'shared role report, linked' : 'copied for each person'} · box {i.position + 1} · {i.row_limit ? `${i.row_limit} results` : 'all results'}</span>
            </li>
          ))}
          {(d.items || []).length === 0 && <li style={{ color: GREY_TEXT, listStyle: 'none', marginLeft: '-1.2rem' }}>No reports on it</li>}
        </ol>
        <Link href={`/dashboard?id=${d.id}`} style={{ color: ADMIN_TEXT, fontSize: '0.85rem' }}>Open the preview</Link>
        {choosable && (
          <button type="button" style={chosen ? s.primary : s.secondary} aria-pressed={chosen} onClick={() => setKeep(d.id)} disabled={!!d.retired_at}>
            <i className={`ti ${chosen ? 'ti-circle-check' : 'ti-circle'}`} aria-hidden="true"></i> {chosen ? 'Keeping this one' : 'Keep this one'}
          </button>
        )}
      </div>
    );
  };

  const detailPanel = () => {
    if (!selected) {
      return <div style={s.card}><p style={{ color: GREY_TEXT, margin: 0 }}>Choose a report on the left to look at it.</p></div>;
    }
    const a = details[selected.dashboard_id];
    const b = selected.duplicate_of_id ? details[selected.duplicate_of_id] : null;
    const waiting = selected.status === 'pending';
    const identical = selected.kind === 'duplicate' && a && b ? sameTemplate(a, b) : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={s.card}>
          <span style={s.tag}>{selected.kind === 'duplicate' ? 'Possible duplicate' : 'Other problem'} · {STATUS_WORDS[selected.status]}</span>
          <p style={{ margin: '0.5rem 0 0' }}>
            Reported by {selected.reported_by_name || 'someone'} on {when(selected.created_at)}
            {selected.note ? <>: <em>"{selected.note}"</em></> : '.'}
          </p>
          {!waiting && (
            <p style={{ ...s.help, marginTop: '0.4rem' }}>
              {STATUS_WORDS[selected.status]} by {selected.resolved_by_name || 'an admin'} on {when(selected.resolved_at)}
              {selected.resolution_note ? `: "${selected.resolution_note}"` : '.'}
            </p>
          )}
          {identical !== null && (
            <p style={{ margin: '0.6rem 0 0', fontWeight: 'bold' }}>
              <i className={`ti ${identical ? 'ti-equal' : 'ti-equal-not'}`} aria-hidden="true"></i>{' '}
              {identical
                ? 'Identical: same layout and the same reports in the same places. The one with more hearts is chosen to keep, but you can change that.'
                : 'Different: the layout or the reports aren\'t the same. Choose which one to keep, or mark them as not duplicates.'}
            </p>
          )}
        </div>

        {selected.kind === 'duplicate' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
            {templateColumn(a, waiting)}
            {templateColumn(b, waiting)}
          </div>
        ) : templateColumn(a, false)}

        {waiting && (
          <div style={s.card}>
            <label htmlFor="admin-note" style={{ display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
              Note {selected.kind === 'problem'
                ? <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(required to remove it - the author will see it)</span>
                : <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>(optional, goes in the audit trail)</span>}
            </label>
            <textarea id="admin-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...s.input, resize: 'vertical' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {selected.kind === 'duplicate' ? (
                <>
                  <button type="button" style={s.primary} disabled={busy || !keep}
                    onClick={() => {
                      const kept = details[keep];
                      const other = keep === selected.dashboard_id ? b : a;
                      if (!window.confirm(`Keep "${kept?.title}" and retire "${other?.title}"?\n\n"${kept?.title}" gets both sets of hearts. Anyone who already used "${other?.title}" keeps their own dashboard, and its author gets a notice.`)) return;
                      act('merge_dashboard_templates', { p_report_id: selected.id, p_keep: keep, p_note: note }, `Merged - kept "${kept?.title}"`);
                    }}>
                    <i className="ti ti-arrow-merge" aria-hidden="true"></i> Merge
                  </button>
                  <button type="button" style={s.secondary} disabled={busy}
                    onClick={() => act('resolve_dashboard_template_report', { p_report_id: selected.id, p_outcome: 'not_duplicate', p_note: note }, 'Marked as not a duplicate')}>
                    <i className="ti ti-x" aria-hidden="true"></i> Not a duplicate
                  </button>
                  {!keep && <span style={{ color: GREY_TEXT, fontSize: '0.85rem', alignSelf: 'center' }}>Choose which one to keep to merge them.</span>}
                </>
              ) : (
                <>
                  <button type="button" style={s.secondary} disabled={busy}
                    onClick={() => act('resolve_dashboard_template_report', { p_report_id: selected.id, p_outcome: 'dismissed', p_note: note }, 'Report dismissed')}>
                    <i className="ti ti-check" aria-hidden="true"></i> Nothing needs changing
                  </button>
                  <button type="button" style={s.danger} disabled={busy}
                    onClick={() => {
                      if (!note.trim()) { notify.error('Say why it\'s being removed - the author will see this.'); return; }
                      if (!window.confirm(`Remove "${a?.title}"? It stops being available to use. Anyone who already used it keeps their own dashboard, and its author gets a notice with your note.`)) return;
                      act('resolve_dashboard_template_report', { p_report_id: selected.id, p_outcome: 'removed', p_note: note }, 'Template removed');
                    }}>
                    <i className="ti ti-archive" aria-hidden="true"></i> Remove the template
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={s.container}><div style={s.wrapper}>
      <h1 style={s.title}>Insights admin</h1>
      <p style={{ ...s.help, marginBottom: '1.25rem' }}>
        Reports people have made about dashboard templates. {waitingCount} waiting.
        Nothing here deletes anything: merged or removed templates are retired, and everyone who already used one keeps their own dashboard.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={s.segment} role="group" aria-label="Which reports">
          <button type="button" style={s.segmentBtn(statusFilter === 'pending')} aria-pressed={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')}>Waiting</button>
          <button type="button" style={s.segmentBtn(statusFilter === 'done')} aria-pressed={statusFilter === 'done'} onClick={() => setStatusFilter('done')}>Done</button>
          <button type="button" style={s.segmentBtn(statusFilter === 'all')} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</button>
        </div>
        <div style={s.segment} role="group" aria-label="Kind of report">
          <button type="button" style={s.segmentBtn(kindFilter === 'all')} aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}>Every kind</button>
          <button type="button" style={s.segmentBtn(kindFilter === 'duplicate')} aria-pressed={kindFilter === 'duplicate'} onClick={() => setKindFilter('duplicate')}>Possible duplicates</button>
          <button type="button" style={s.segmentBtn(kindFilter === 'problem')} aria-pressed={kindFilter === 'problem'} onClick={() => setKindFilter('problem')}>Other problems</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ ...s.card, padding: '0.5rem', flex: '1 1 300px', minWidth: 0 }}>
          {shown.length === 0 ? (
            <p style={{ color: GREY_TEXT, margin: '0.75rem' }}>{statusFilter === 'pending' ? 'Nothing waiting. Nice.' : 'No reports here.'}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {shown.map(r => (
                <li key={r.id}>
                  <button type="button" onClick={() => select(r)} aria-pressed={selectedId === r.id}
                    style={{ width: '100%', textAlign: 'left', background: selectedId === r.id ? `${ADMIN_FILL}33` : 'transparent', border: 'none', borderLeft: `3px solid ${selectedId === r.id ? ADMIN_TEXT : 'transparent'}`, color: '#fff', padding: '0.6rem 0.75rem', cursor: 'pointer', borderRadius: '0.25rem' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {r.kind === 'duplicate' ? <>"{r.dashboard_title}" and "{r.duplicate_of_title}"</> : <>"{r.dashboard_title}"</>}
                    </div>
                    <div style={{ color: GREY_TEXT, fontSize: '0.8rem' }}>
                      {r.kind === 'duplicate' ? 'Possible duplicate' : 'Other problem'} · {STATUS_WORDS[r.status]} · {when(r.created_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ flex: '2 1 520px', minWidth: 0 }}>{detailPanel()}</div>
      </div>
    </div></div>
  );
}
