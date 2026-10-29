import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { notify } from '../lib/notify';
import { fetchMyPermissions } from '../lib/permissions';
import { SUPABASE_URL, authHeaders, errorDetail, GREY_TEXT, DANGER_TEXT } from '../lib/reports';

// Reported content: feedback, comments and suggestions people have reported
// as concerning. Open to people with "Review reported content"
// (feedback.reports.review, platform health admins).
//   - Each report shows a copy of the content as it was when reported, so it
//     can be reviewed even if it was edited or deleted afterwards.
//   - Who posted it and who reported it are never shown. (Seeing someone's
//     display name, or their other posts, is planned for later and will need
//     two admins to agree.)
//   - Reporting and closing are recorded in the audit trail, under
//     moderation and safety.
// Reports and their copies are kept with no end date until a retention policy
// is decided.

// Admin pages lead with the platform green (style guide: ownership tiers).
const ADMIN_TEXT = '#3B9B73';
const ADMIN_FILL = '#318160';

const KIND_ICONS = { Feedback: 'message-2', Comment: 'message-circle', Suggestion: 'link' };

const STATE_WORDS = {
  'as reported': { text: 'Still up, unchanged', color: GREY_TEXT },
  edited: { text: 'Edited since it was reported', color: '#6882B6' },
  deleted: { text: 'Deleted by the person who posted it (in their trash)', color: DANGER_TEXT },
  removed: { text: 'Gone from the site (this copy is all that\'s left)', color: DANGER_TEXT }
};

const rpc = async (name, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json().catch(() => null);
};

export default function ReportedContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' | 'closed' | 'all'
  const [closingId, setClosingId] = useState(null);
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { start(); }, []);

  const start = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { router.push('/?login=true'); return; }
      const perms = await fetchMyPermissions(authHeaders(false));
      const ok = perms.includes('feedback.reports.review');
      setAllowed(ok);
      if (ok) await loadReports();
    } catch (error) {
      notify.error(`Couldn't load reported content: ${error.message}`);
    }
    setLoading(false);
  };

  const loadReports = async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/concern_reports_review?select=*&order=created_at.desc`, { headers: authHeaders(false), cache: 'no-store' });
    if (!res.ok) throw new Error(await errorDetail(res));
    const rows = await res.json();
    setReports(Array.isArray(rows) ? rows : []);
  };

  const closeReport = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      await rpc('close_concern_report', { p_report_id: id, p_outcome: outcome });
      notify.success('Report closed');
      setClosingId(null);
      setOutcome('');
      await loadReports();
    } catch (error) {
      notify.error(`Couldn't close that report: ${error.message}`);
    }
    setBusy(false);
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '900px', margin: '0 auto', padding: '1.5rem' },
    title: { fontSize: '2.25rem', lineHeight: 1.2, fontWeight: 'bold', margin: 0, fontFamily: "'Gloria Hallelujah', cursive" },
    help: { color: GREY_TEXT, fontSize: '0.85rem', margin: '0.25rem 0 0' },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1rem' },
    segment: { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid #334155', borderRadius: '0.375rem', overflow: 'hidden' },
    segmentBtn: (on) => ({ padding: '0.4rem 0.85rem', border: 'none', background: on ? ADMIN_FILL : 'transparent', color: on ? '#fff' : GREY_TEXT, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }),
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.1rem 0.45rem' },
    primary: { background: ADMIN_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontWeight: 'bold', cursor: 'pointer' },
    secondary: { background: 'transparent', color: '#fff', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontWeight: 'bold', cursor: 'pointer' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '0.375rem', padding: '0.5rem 0.6rem', fontSize: '0.9rem', boxSizing: 'border-box' },
    quote: { background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.75rem', margin: '0.5rem 0', whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#e2e8f0' }
  };

  if (loading) return <div style={s.container}><div style={s.wrapper}><p style={{ color: GREY_TEXT }}>Loading…</p></div></div>;

  if (!allowed) {
    return (
      <div style={s.container}><div style={s.wrapper}>
        <h1 style={s.title}>Reported content</h1>
        <p style={{ color: '#cbd5e1' }}>This page is for platform health admins who review content people have reported as concerning. You don't have access to it.</p>
      </div></div>
    );
  }

  const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '');
  const openCount = reports.filter(r => r.status === 'open').length;
  const shown = reports.filter(r => statusFilter === 'all' || r.status === statusFilter);

  return (
    <div style={s.container}>
      <div style={s.wrapper}>
        <h1 style={s.title}><i className="ti ti-flag" aria-hidden="true"></i> Reported content</h1>
        <p style={s.help}>
          Feedback, comments and suggestions people have reported as concerning. Each one shows the content as it was when it was reported,
          even if it's been edited or deleted since. Who posted it and who reported it stay private.
        </p>

        <div style={{ margin: '1.25rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={s.segment} role="group" aria-label="Which reports">
            <button type="button" style={s.segmentBtn(statusFilter === 'open')} aria-pressed={statusFilter === 'open'} onClick={() => setStatusFilter('open')}>Open ({openCount})</button>
            <button type="button" style={s.segmentBtn(statusFilter === 'closed')} aria-pressed={statusFilter === 'closed'} onClick={() => setStatusFilter('closed')}>Closed ({reports.length - openCount})</button>
            <button type="button" style={s.segmentBtn(statusFilter === 'all')} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All ({reports.length})</button>
          </div>
        </div>

        {shown.length === 0 && (
          <div style={s.card}><p style={{ color: GREY_TEXT, margin: 0 }}>{statusFilter === 'open' ? 'Nothing waiting. Nobody has reported anything that still needs a look.' : 'No reports here.'}</p></div>
        )}

        {shown.map(r => {
          const snap = r.snapshot || {};
          const state = STATE_WORDS[r.current_state] || { text: r.current_state, color: GREY_TEXT };
          const closing = closingId === r.id;
          return (
            <div key={r.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={s.tag}>
                  <i className={`ti ti-${KIND_ICONS[snap.kind] || 'flag'}`} aria-hidden="true"></i>
                  {snap.kind || 'Content'}{snap.kind === 'Comment' ? ' on' : snap.kind === 'Suggestion' ? ' linking' : ''}{snap.title ? `: ${snap.title}` : ''}
                </span>
                <span style={{ fontSize: '0.8rem', color: r.status === 'open' ? ADMIN_TEXT : GREY_TEXT, fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {r.status === 'open' ? 'Open' : `Closed ${when(r.closed_at)}`}
                </span>
              </div>

              <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
                <strong>Why it was reported:</strong> {r.reason}
              </p>
              <p style={{ ...s.help, margin: '0.15rem 0 0' }}>
                Reported {when(r.created_at)}{r.times_reported > 1 ? ` · reported ${r.times_reported} times in all` : ''}
              </p>

              <div style={s.quote}>
                {snap.kind === 'Feedback' && snap.title && <div style={{ fontWeight: 'bold', marginBottom: snap.text ? '0.4rem' : 0 }}>{snap.title}</div>}
                {snap.text || <em style={{ color: GREY_TEXT }}>{snap.kind === 'Feedback' ? 'No description' : 'No text'}</em>}
              </div>
              <p style={{ ...s.help, margin: 0 }}>
                Shown as {snap.shown_as || 'Anonymous'} · posted {when(snap.posted_at)}{snap.edited_at ? ` · edited ${when(snap.edited_at)} (before the report)` : ''}
              </p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: state.color }}>
                Now: {state.text}
              </p>

              {r.status === 'closed' && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
                  <strong>Outcome:</strong> {r.outcome || <em style={{ color: GREY_TEXT }}>No note</em>}
                </p>
              )}

              {r.status === 'open' && (
                closing ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label htmlFor={`outcome-${r.id}`} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>What did you decide? (optional, kept in the audit trail)</label>
                    <textarea id={`outcome-${r.id}`} value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ ...s.input, minHeight: '4rem', marginBottom: '0.5rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => closeReport(r.id)} disabled={busy} style={{ ...s.primary, opacity: busy ? 0.5 : 1 }}>Close report</button>
                      <button type="button" onClick={() => { setClosingId(null); setOutcome(''); }} style={s.secondary}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" onClick={() => { setClosingId(r.id); setOutcome(''); }} style={s.primary}>Close report…</button>
                    {(r.current_state === 'as reported' || r.current_state === 'edited') && (
                      <Link href="/ideas" style={{ color: ADMIN_TEXT, fontSize: '0.85rem' }}>Go to the Feedback page</Link>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
