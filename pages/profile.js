import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Editable fields
  const [displayName, setDisplayName] = useState('');

  // Stats
  const [stats, setStats] = useState({
    favorites: 0,
    dislikes: 0,
    known: 0,
    wantToLearn: 0,
    personalTags: []
  });

  // Version familiarity data
  const [versionPrefs, setVersionPrefs] = useState([]);
  const [songs, setSongs] = useState({});
  const [versions, setVersions] = useState({});

  // Filter for untagged
  const [showUntagged, setShowUntagged] = useState(false);
  const [untaggedVersions, setUntaggedVersions] = useState([]);

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
        await loadStats(userData.id);
        await loadVersionPrefs(userData.id);
        await loadSongsAndVersions();
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
        setUserProfile(data[0]);
        setDisplayName(data[0].display_name || '');
      }
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadStats = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?user_id=eq.${userId}`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data)) {
        const allTags = new Set();
        data.forEach(p => {
          if (p.personal_tags) p.personal_tags.forEach(t => allTags.add(t));
        });
        setStats({
          favorites: data.filter(p => p.is_favorite).length,
          dislikes: data.filter(p => p.is_dislike).length,
          known: data.filter(p => p.status === 'known').length,
          wantToLearn: data.filter(p => p.status === 'want_to_learn').length,
          personalTags: Array.from(allTags)
        });
      }
    } catch (error) { console.error('Error loading stats:', error); }
  };

  const loadVersionPrefs = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?user_id=eq.${userId}`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setVersionPrefs(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading version prefs:', error); }
  };

  const loadSongsAndVersions = async () => {
    try {
      // Load songs
      const songsRes = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=id,title`, { headers: getAuthHeaders(false) });
      const songsData = await songsRes.json();
      const songsMap = {};
      if (Array.isArray(songsData)) {
        songsData.forEach(s => { songsMap[s.id] = s; });
      }
      setSongs(songsMap);

      // Load versions
      const versionsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=id,song_id,label`, { headers: getAuthHeaders(false) });
      const versionsData = await versionsRes.json();
      const versionsMap = {};
      if (Array.isArray(versionsData)) {
        versionsData.forEach(v => { versionsMap[v.id] = v; });
      }
      setVersions(versionsMap);
    } catch (error) { console.error('Error loading songs/versions:', error); }
  };

  useEffect(() => {
    if (showUntagged && Object.keys(versions).length > 0) {
      const taggedVersionIds = new Set(versionPrefs.map(vp => vp.version_id));
      const untagged = Object.values(versions).filter(v => !taggedVersionIds.has(v.id));
      setUntaggedVersions(untagged);
    }
  }, [showUntagged, versions, versionPrefs]);

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
      showMessage('✅ Profile saved');
      // Dispatch auth change event so nav updates
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('Error saving profile:', error);
      showMessage('❌ Error saving');
    }
    setSaving(false);
  };

  const setVersionFamiliarity = async (versionId, familiarity) => {
    if (!user) return;
    
    const existing = versionPrefs.find(vp => vp.version_id === versionId);
    
    try {
      if (existing) {
        if (familiarity === null) {
          // Remove
          await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?id=eq.${existing.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          setVersionPrefs(prev => prev.filter(vp => vp.id !== existing.id));
        } else {
          // Update
          await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?id=eq.${existing.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ familiarity, updated_at: new Date().toISOString() })
          });
          setVersionPrefs(prev => prev.map(vp => vp.id === existing.id ? { ...vp, familiarity } : vp));
        }
      } else if (familiarity) {
        // Create
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ user_id: user.id, version_id: versionId, familiarity })
        });
        const data = await res.json();
        if (data[0]) {
          setVersionPrefs(prev => [...prev, data[0]]);
        }
      }
    } catch (error) {
      console.error('Error setting familiarity:', error);
      showMessage('❌ Error saving');
    }
  };

  const familiarityLabels = {
    teach: "🎓 Comfortable teaching",
    sing_along: "🎤 Can sing along",
    heard_it: "👂 Heard it but...",
    dont_know: "❓ Don't know"
  };

  const familiarityColors = {
    teach: '#22c55e',
    sing_along: '#3b82f6',
    heard_it: '#f59e0b',
    dont_know: '#64748b'
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '800px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.25rem', marginBottom: '1rem' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem' },
    input: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem' },
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    stat: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' },
    tag: { display: 'inline-block', background: '#334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.5rem', marginBottom: '0.5rem' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    select: { padding: '0.375rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={s.container}>
        <div style={{ ...s.wrapper, textAlign: 'center', paddingTop: '4rem' }}>
          <p>Please <Link href="/?login=true" style={{ color: '#22c55e' }}>log in</Link> to view your profile.</p>
        </div>
      </div>
    );
  }

  // Group version prefs by familiarity for display
  const groupedByFamiliarity = {};
  Object.keys(familiarityLabels).forEach(f => { groupedByFamiliarity[f] = []; });
  versionPrefs.forEach(vp => {
    if (vp.familiarity && groupedByFamiliarity[vp.familiarity]) {
      groupedByFamiliarity[vp.familiarity].push(vp);
    }
  });

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      
      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={s.title}>👤 Your Profile</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{user.email}</p>
        </div>

        {/* Edit Profile */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Edit Profile</h2>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Display Name</label>
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

        {/* Song Stats */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Your Song Stats</h2>
          <div style={s.stat}>
            <span>⭐ Favorites</span>
            <span style={{ fontWeight: 'bold' }}>{stats.favorites}</span>
          </div>
          <div style={s.stat}>
            <span>👎 Dislikes</span>
            <span style={{ fontWeight: 'bold' }}>{stats.dislikes}</span>
          </div>
          <div style={s.stat}>
            <span>✓ Marked as "Known"</span>
            <span style={{ fontWeight: 'bold' }}>{stats.known}</span>
          </div>
          <div style={s.stat}>
            <span>📚 Want to Learn</span>
            <span style={{ fontWeight: 'bold' }}>{stats.wantToLearn}</span>
          </div>
          <div style={{ ...s.stat, borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ marginBottom: '0.5rem' }}>🏷️ Your Personal Tags</span>
            <div>
              {stats.personalTags.length === 0 && <span style={{ color: '#64748b', fontSize: '0.875rem' }}>No tags yet</span>}
              {stats.personalTags.map(tag => (
                <span key={tag} style={s.tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Version Familiarity Summary */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>How Well You Know Versions</h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
            Track your familiarity with specific song versions
          </p>
          
          {Object.entries(familiarityLabels).map(([key, label]) => (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: familiarityColors[key] }}>{label}</span>
                <span style={{ fontWeight: 'bold' }}>{groupedByFamiliarity[key].length}</span>
              </div>
              {groupedByFamiliarity[key].length > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', paddingLeft: '1rem' }}>
                  {groupedByFamiliarity[key].slice(0, 5).map(vp => {
                    const version = versions[vp.version_id];
                    const song = version ? songs[version.song_id] : null;
                    return (
                      <div key={vp.id} style={{ marginBottom: '0.25rem' }}>
                        {song?.title || 'Unknown'} {version?.label ? `(${version.label})` : ''}
                      </div>
                    );
                  })}
                  {groupedByFamiliarity[key].length > 5 && (
                    <div style={{ fontStyle: 'italic' }}>...and {groupedByFamiliarity[key].length - 5} more</div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem', marginTop: '1rem' }}>
            <button 
              onClick={() => setShowUntagged(!showUntagged)} 
              style={s.btnSec}
            >
              {showUntagged ? 'Hide' : 'Show'} Untagged Versions ({Object.keys(versions).length - versionPrefs.length})
            </button>
          </div>
        </div>

        {/* Untagged versions list */}
        {showUntagged && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Untagged Versions</h2>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Set your familiarity with these versions
            </p>
            
            {untaggedVersions.length === 0 ? (
              <p style={{ color: '#22c55e' }}>🎉 All versions tagged!</p>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {untaggedVersions.slice(0, 50).map(v => {
                  const song = songs[v.song_id];
                  return (
                    <div key={v.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '0.5rem 0',
                      borderBottom: '1px solid #334155'
                    }}>
                      <span style={{ fontSize: '0.875rem' }}>
                        {song?.title || 'Unknown'} {v.label ? `(${v.label})` : ''}
                      </span>
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && setVersionFamiliarity(v.id, e.target.value)}
                        style={s.select}
                      >
                        <option value="">Set...</option>
                        <option value="teach">🎓 Can teach</option>
                        <option value="sing_along">🎤 Sing along</option>
                        <option value="heard_it">👂 Heard it</option>
                        <option value="dont_know">❓ Don't know</option>
                      </select>
                    </div>
                  );
                })}
                {untaggedVersions.length > 50 && (
                  <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '1rem', fontStyle: 'italic' }}>
                    Showing first 50 of {untaggedVersions.length}. Tag some to see more!
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Link to songs page */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link href="/songs" style={{ color: '#22c55e', fontSize: '0.875rem' }}>
            Browse songs to tag more →
          </Link>
        </div>
      </div>
    </div>
  );
}
