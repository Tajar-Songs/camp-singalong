import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

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
      }
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ display_name: displayName.trim() || null })
      });
      showMessage(<><i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Profile saved</>);
      // Dispatch auth change event so nav updates
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('Error saving profile:', error);
      showMessage(<><i className="ti ti-x" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Error saving</>);
    }
    setSaving(false);
  };

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
    btn: { background: '#5371AC', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={s.container}>
        <div style={{ ...s.wrapper, textAlign: 'center', paddingTop: '4rem' }}>
          <p>Please <Link href="/?login=true" style={{ color: '#256B45' }}>log in</Link> to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}

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
      </div>
    </div>
  );
}
