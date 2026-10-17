import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';
import { notify } from '../lib/notify';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Deliberately minimal - this used to also show song stats, personal tags,
// and version familiarity, but that was a second-rate duplicate of what
// "My Songs" on the home page should eventually be (a real personal
// insights page, once Insights is built). Cut down to just the one thing
// that's actually a profile setting: display name. See the Ideas board for
// the plan to build the real version elsewhere instead of maintaining two
// half-versions of the same idea here.
export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [displayName, setDisplayName] = useState('');
  // "Hide things I can't change" - only shown to people with an admin role.
  const [hideViewOnly, setHideViewOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Reports other people send (Tajar Tracks)
  const [findable, setFindable] = useState(false);
  const [sentMode, setSentMode] = useState('ask');
  const [newLabel, setNewLabel] = useState('until_opened');
  // Home page pins: my own number, up to the admins' maximum
  const [pinLimit, setPinLimit] = useState(3);
  const [pinMax, setPinMax] = useState(6);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) {
        router.push('/?login=true');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        await loadUserProfile(userData.id);
      } else {
        router.push('/?login=true');
      }
    } catch (error) {
      console.log('Auth check failed');
      router.push('/?login=true');
    }
    setLoading(false);
  };

  const loadUserProfile = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setDisplayName(data[0].display_name || '');
        setHideViewOnly(!!data[0].hide_view_only);
        setFindable(!!data[0].findable_for_reports);
        setSentMode(data[0].sent_reports_mode || 'ask');
        setNewLabel(data[0].sent_reports_new_label || 'until_opened');
        setPinLimit(data[0].home_pins_limit ?? 3);
      }
      const limitsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/home_pin_limits`, { method: 'POST', headers: getAuthHeaders(), body: '{}' });
      if (limitsRes.ok) {
        const limits = await limitsRes.json();
        if (limits?.max) setPinMax(limits.max);
      }
      setIsAdmin(hasAnyRole(await fetchUserRoleKeys(userId, getAuthHeaders(false))));
    } catch (error) { console.error('Error loading profile:', error); }
  };

  // Saves only the fields passed, and checks that the save actually
  // happened (previously it showed "Profile saved" without checking).
  const saveFields = async (fields, successText) => {
    if (!user) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(fields)
      });
      if (!res.ok) {
        let detail = `the database returned ${res.status}`;
        try { const err = await res.json(); detail = err.message || detail; } catch (e) { /* not JSON */ }
        throw new Error(detail);
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('nothing was saved - try logging out and back in');
      notify.success(successText);
      // Let the nav bar (and anything else listening) pick up the change
      window.dispatchEvent(new Event('auth-changed'));
      return true;
    } catch (error) {
      console.error('Error saving profile:', error);
      notify.error(`Couldn't save: ${error.message}`);
      return false;
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    await saveFields({ display_name: displayName.trim() || null }, 'Profile saved');
    setSaving(false);
  };

  const toggleHideViewOnly = async (next) => {
    setHideViewOnly(next);
    const ok = await saveFields({ hide_view_only: next }, next
      ? "Areas you can't change will now be hidden"
      : "Areas you can't change will now be shown, marked view only");
    if (!ok) setHideViewOnly(!next);
  };

  // Each choice saves on its own, and goes back if the save fails.
  const saveChoice = async (column, value, previous, setter, successText) => {
    setter(value);
    const ok = await saveFields({ [column]: value }, successText);
    if (!ok) setter(previous);
  };

  const choiceRow = (name, options, value, onPick) => (
    <div role="radiogroup" aria-label={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {options.map(o => (
        <label key={o.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onPick(o.value)}
            style={{ marginTop: '0.2rem', width: '1.05rem', height: '1.05rem', accentColor: '#5371AC' }} />
          <span>
            <span style={{ fontWeight: 'bold' }}>{o.label}</span>
            {o.help && <span style={{ display: 'block', color: '#838C95', fontSize: '0.85rem', marginTop: '0.1rem' }}>{o.help}</span>}
          </span>
        </label>
      ))}
    </div>
  );

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '800px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', fontFamily: "'Gloria Hallelujah', cursive" },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1rem' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem' },
    input: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem' },
    // Personal-tier: this whole page is the person's own settings, so the
    // action leads blue rather than the platform-default green.
    btn: { background: '#5371AC', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={s.container}>
        <div style={{ ...s.wrapper, textAlign: 'center', paddingTop: '4rem' }}>
          <p>Please <Link href="/?login=true" style={{ color: '#3B9B73' }}>log in</Link> to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>

      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={s.title}><i className="ti ti-user-square-rounded" aria-hidden="true"></i> Your Profile</h1>
          <p style={{ color: '#838C95', fontSize: '0.875rem' }}>{user.email}</p>
        </div>

        {/* Edit Profile */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Edit Profile</h2>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#838C95' }}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we call you?"
            style={{ ...s.input, marginBottom: '1rem' }}
          />
          <button onClick={saveProfile} disabled={saving} style={s.btn}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Reports other people send - personal (blue) */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Reports sent to me</h2>
          <p style={{ color: '#838C95', fontSize: '0.85rem', margin: '-0.5rem 0 1rem' }}>
            People can send you a copy of a report from Tajar Tracks. It becomes your own copy, and it shows you your own data, never theirs.
          </p>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', marginBottom: '1.25rem' }}>
            <input
              type="checkbox"
              checked={findable}
              onChange={(e) => saveChoice('findable_for_reports', e.target.checked, findable, setFindable, e.target.checked
                ? 'People can now find you by your display name to send you reports'
                : "People can't find you to send you reports any more")}
              style={{ marginTop: '0.2rem', width: '1.05rem', height: '1.05rem', accentColor: '#5371AC' }}
            />
            <span>
              <span style={{ fontWeight: 'bold' }}>Let people find me to send me reports</span>
              <span style={{ display: 'block', color: '#838C95', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Off by default. When it's on, anyone signed in can find you by your display name when they're sending a report. Nothing else about you is shown.
                {!displayName.trim() && ' You\'ll need a display name first.'}
              </span>
            </span>
          </label>

          <p style={{ fontWeight: 'bold', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>When someone sends me a report</p>
          {choiceRow('sent-mode', [
            { value: 'ask', label: 'Let me accept or decline each one', help: 'They wait at the top of My reports until you choose.' },
            { value: 'auto', label: 'Add them to my reports automatically', help: 'You can always delete one you don\'t want.' }
          ], sentMode, (v) => saveChoice('sent_reports_mode', v, sentMode, setSentMode, 'Saved how reports sent to you are handled'))}

          <p style={{ fontWeight: 'bold', fontSize: '0.9rem', margin: '1.25rem 0 0.5rem' }}>Label reports sent to me as "New"</p>
          {choiceRow('new-label', [
            { value: 'until_opened', label: 'Until I open it' },
            { value: 'until_dismissed', label: 'Until I mark it as seen' },
            { value: 'none', label: 'Don\'t label them' }
          ], newLabel, (v) => saveChoice('sent_reports_new_label', v, newLabel, setNewLabel, 'Saved how new reports are labeled'))}
          <p style={{ color: '#838C95', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
            Either way, you can use "Mark as new" on a report to flag it again for a while.
          </p>
        </div>

        {/* Home page pins - personal (blue) */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Home page</h2>
          <label htmlFor="pin-limit" style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem' }}>How many things can I pin to my home page?</label>
          <select id="pin-limit" value={Math.min(pinLimit, pinMax)}
            onChange={(e) => saveChoice('home_pins_limit', Number(e.target.value), pinLimit, setPinLimit, 'Saved how many things you can pin')}
            style={{ ...s.input, width: 'auto', minWidth: '6rem' }}>
            {Array.from({ length: pinMax + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}
          </select>
          <p style={{ color: '#838C95', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
            Pin reports and dashboards from Tajar Tracks, and they'll show on your home page. Admins set the most anyone can pin (currently {pinMax}).
            If you lower this below how many you've already pinned, those pins stay until you unpin them.
          </p>
        </div>

        {/* Admin display preference - personal (blue), only for people with an admin role */}
        {isAdmin && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Admin areas</h2>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hideViewOnly}
                onChange={(e) => toggleHideViewOnly(e.target.checked)}
                style={{ marginTop: '0.2rem', width: '1.05rem', height: '1.05rem', accentColor: '#5371AC' }}
              />
              <span>
                <span style={{ fontWeight: 'bold' }}>Hide things I can't change</span>
                <span style={{ display: 'block', color: '#838C95', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  By default, admin areas you can view but not change are still shown, marked "view only". Turn this on to hide them instead: admin menu links, Settings sections and roles you can't grant. You can turn it back off any time. Pages you open directly still load, view only.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
