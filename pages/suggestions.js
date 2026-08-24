import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function AdminSuggestions() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [songs, setSongs] = useState({});
  const [users, setUsers] = useState({});
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');

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
      if (!token) { router.push('/?login=true'); return; }
      
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (!res.ok) { router.push('/?login=true'); return; }
      
      const userData = await res.json();
      setUser(userData);
      
      // Check admin
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userData.id}`, { headers: getAuthHeaders(false) });
      const profileData = await profileRes.json();
      if (!profileData[0] || profileData[0].role !== 'admin') {
        router.push('/');
        return;
      }
      setUserProfile(profileData[0]);
      
      await loadData();
    } catch (error) {
      console.log('Auth check failed');
      router.push('/?login=true');
    }
    setLoading(false);
  };

  const loadData = async () => {
    try {
      // Load suggestions
      const sugRes = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions?select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const sugData = await sugRes.json();
      setSuggestions(Array.isArray(sugData) ? sugData : []);

      // Load songs for reference
      const songsRes = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=id,title`, { headers: getAuthHeaders(false) });
      const songsData = await songsRes.json();
      const songsMap = {};
      if (Array.isArray(songsData)) songsData.forEach(s => { songsMap[s.id] = s; });
      setSongs(songsMap);

      // Load users for display
      const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=id,display_name,email`, { headers: getAuthHeaders(false) });
      const usersData = await usersRes.json();
      const usersMap = {};
      if (Array.isArray(usersData)) usersData.forEach(u => { usersMap[u.id] = u; });
      setUsers(usersMap);

    } catch (error) { console.error('Error loading data:', error); }
  };

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const updateStatus = async (id, status) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions?id=eq.${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status,
          admin_notes: adminNotes.trim() || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
      });
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status, admin_notes: adminNotes.trim() || s.admin_notes } : s));
      setAdminNotes('');
      showMsg(`✅ Marked as ${status}`);
    } catch (error) {
      console.error('Error updating:', error);
      showMsg('❌ Error updating');
    }
  };

  const getUserName = (userId) => users[userId]?.display_name || users[userId]?.email?.split('@')[0] || 'Unknown';
  const getSongTitle = (songId) => songs[songId]?.title || 'Unknown song';

  const typeLabels = {
    new_song: '🎵 New Song',
    new_version: '📝 New Version',
    media: '🎬 Media',
    note: '📋 Note',
    edit: '✏️ Edit'
  };

  const statusColors = {
    pending: { bg: '#f59e0b20', text: '#f59e0b' },
    approved: { bg: '#22c55e20', text: '#22c55e' },
    rejected: { bg: '#ef444420', text: '#ef4444' }
  };

  const filtered = suggestions.filter(s => statusFilter === 'all' || s.status === statusFilter);

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '900px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', marginBottom: '1rem', overflow: 'hidden' },
    filters: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
    filterBtn: (active) => ({
      background: active ? '#22c55e' : '#334155',
      color: '#fff',
      border: 'none',
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem'
    }),
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' },
    btnDanger: { background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' },
    input: { width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem', marginBottom: '0.5rem' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    row: { display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.875rem' },
    label: { color: '#64748b' },
    pre: { background: '#0f172a', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!userProfile || userProfile.role !== 'admin') {
    return <div style={s.container}><div style={s.wrapper}>Access denied</div></div>;
  }

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      
      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={s.title}>📥 Review Suggestions</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{filtered.length} suggestions</p>
        </div>

        {/* Filters */}
        <div style={s.filters}>
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={s.filterBtn(statusFilter === f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && ` (${suggestions.filter(sg => sg.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Suggestions */}
        {filtered.length === 0 ? (
          <div style={{ ...s.card, padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No suggestions to show
          </div>
        ) : (
          filtered.map(sug => {
            const isExpanded = expandedId === sug.id;
            const statusColor = statusColors[sug.status] || statusColors.pending;
            
            return (
              <div key={sug.id} style={s.card}>
                {/* Header row */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : sug.id)}
                  style={{ 
                    padding: '1rem', 
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold' }}>{typeLabels[sug.suggestion_type]}</span>
                      {sug.song_id && <span style={{ color: '#94a3b8' }}>for "{getSongTitle(sug.song_id)}"</span>}
                      {sug.title && <span style={{ color: '#3b82f6' }}>"{sug.title}"</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      by {getUserName(sug.created_by)} • {new Date(sug.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      background: statusColor.bg,
                      color: statusColor.text,
                      textTransform: 'uppercase',
                      fontWeight: 'bold'
                    }}>
                      {sug.status}
                    </span>
                    <span style={{ color: '#64748b' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #334155' }}>
                    <div style={{ paddingTop: '1rem' }}>
                      
                      {/* New Song details */}
                      {sug.suggestion_type === 'new_song' && (
                        <>
                          {sug.author && <div style={s.row}><span style={s.label}>Author:</span> {sug.author}</div>}
                          {sug.composer && <div style={s.row}><span style={s.label}>Composer:</span> {sug.composer}</div>}
                          {sug.lyrics_text && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <span style={s.label}>Lyrics:</span>
                              <pre style={s.pre}>{sug.lyrics_text}</pre>
                            </div>
                          )}
                        </>
                      )}

                      {/* New Version details */}
                      {sug.suggestion_type === 'new_version' && (
                        <>
                          <div style={s.row}><span style={s.label}>Version Label:</span> {sug.version_label}</div>
                          {sug.lyrics_content && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <span style={s.label}>Lyrics:</span>
                              <pre style={s.pre}>{sug.lyrics_content}</pre>
                            </div>
                          )}
                        </>
                      )}

                      {/* Media details */}
                      {sug.suggestion_type === 'media' && (
                        <>
                          <div style={s.row}><span style={s.label}>Type:</span> {sug.media_type}</div>
                          <div style={s.row}><span style={s.label}>URL:</span> <a href={sug.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>{sug.media_url}</a></div>
                          {sug.media_label && <div style={s.row}><span style={s.label}>Label:</span> {sug.media_label}</div>}
                        </>
                      )}

                      {/* Note details */}
                      {sug.suggestion_type === 'note' && (
                        <>
                          <div style={s.row}><span style={s.label}>Note Type:</span> {sug.note_type}</div>
                          <div style={{ marginTop: '0.5rem' }}>
                            <span style={s.label}>Content:</span>
                            <pre style={s.pre}>{sug.note_content}</pre>
                          </div>
                        </>
                      )}

                      {/* Edit details */}
                      {sug.suggestion_type === 'edit' && (
                        <>
                          <div style={s.row}><span style={s.label}>Field:</span> {sug.field_name}</div>
                          {sug.current_value && <div style={s.row}><span style={s.label}>Current:</span> {sug.current_value}</div>}
                          <div style={{ marginTop: '0.5rem' }}>
                            <span style={s.label}>Suggested:</span>
                            <pre style={s.pre}>{sug.suggested_value}</pre>
                          </div>
                        </>
                      )}

                      {/* Reason */}
                      {sug.reason && (
                        <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#0f172a', borderRadius: '0.375rem' }}>
                          <span style={s.label}>Their reason:</span> {sug.reason}
                        </div>
                      )}

                      {/* Existing admin notes */}
                      {sug.admin_notes && (
                        <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#22c55e15', borderRadius: '0.375rem', border: '1px solid #22c55e30' }}>
                          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Admin notes:</span> {sug.admin_notes}
                        </div>
                      )}

                      {/* Actions */}
                      {sug.status === 'pending' && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                          <input
                            type="text"
                            placeholder="Add a note (optional)..."
                            value={expandedId === sug.id ? adminNotes : ''}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            style={s.input}
                          />
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => updateStatus(sug.id, 'approved')} style={s.btn}>✓ Approve</button>
                            <button onClick={() => updateStatus(sug.id, 'rejected')} style={s.btnDanger}>✗ Reject</button>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Note: Approving doesn't auto-create the content. You'll need to add it manually in Admin.
                          </p>
                        </div>
                      )}

                      {sug.status !== 'pending' && (
                        <div style={{ marginTop: '1rem' }}>
                          <button onClick={() => updateStatus(sug.id, 'pending')} style={s.btnSec}>↩ Move back to Pending</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
