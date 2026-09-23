import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function AdminSuggestions() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [songs, setSongs] = useState({});
  const [users, setUsers] = useState({});
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [adminNotes, setAdminNotes] = useState({});
  const [batchNotes, setBatchNotes] = useState('');

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
      
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userData.id}`, { headers: getAuthHeaders(false) });
      const profileData = await profileRes.json();
      const roleKeys = await fetchUserRoleKeys(userData.id, getAuthHeaders(false));
      if (!profileData[0] || !hasAnyRole(roleKeys)) {
        router.push('/');
        return;
      }
      setUserProfile(profileData[0]);
      setUserRoleKeys(roleKeys);
      
      await loadData();
    } catch (error) {
      console.log('Auth check failed');
      router.push('/?login=true');
    }
    setLoading(false);
  };

  const loadData = async () => {
    try {
      const sugRes = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions?select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const sugData = await sugRes.json();
      setSuggestions(Array.isArray(sugData) ? sugData : []);

      const songsRes = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=id,title`, { headers: getAuthHeaders(false) });
      const songsData = await songsRes.json();
      const songsMap = {};
      if (Array.isArray(songsData)) songsData.forEach(s => { songsMap[s.id] = s; });
      setSongs(songsMap);

      const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=id,display_name,email`, { headers: getAuthHeaders(false) });
      const usersData = await usersRes.json();
      const usersMap = {};
      if (Array.isArray(usersData)) usersData.forEach(u => { usersMap[u.id] = u; });
      setUsers(usersMap);

    } catch (error) { console.error('Error loading data:', error); }
  };

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  // Group suggestions by batch_id (null batch_id = standalone)
  const groupedSuggestions = useMemo(() => {
    const batches = [];
    const seenBatchIds = new Set();
    
    suggestions.forEach(sug => {
      if (sug.batch_id && !seenBatchIds.has(sug.batch_id)) {
        seenBatchIds.add(sug.batch_id);
        const batchItems = suggestions.filter(s => s.batch_id === sug.batch_id);
        batches.push({
          type: 'batch',
          batchId: sug.batch_id,
          items: batchItems,
          createdAt: sug.created_at,
          createdBy: sug.created_by,
          songId: batchItems[0]?.song_id,
          songTitle: batchItems[0]?.title, // For new songs
          // Batch is pending if ANY item is pending
          hasPending: batchItems.some(i => i.status === 'pending'),
          allApproved: batchItems.every(i => i.status === 'approved'),
          allRejected: batchItems.every(i => i.status === 'rejected')
        });
      } else if (!sug.batch_id) {
        batches.push({
          type: 'single',
          batchId: sug.id, // Use id as key
          items: [sug],
          createdAt: sug.created_at,
          createdBy: sug.created_by,
          songId: sug.song_id,
          songTitle: sug.title,
          hasPending: sug.status === 'pending',
          allApproved: sug.status === 'approved',
          allRejected: sug.status === 'rejected'
        });
      }
    });
    
    return batches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [suggestions]);

  // Apply filter
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return groupedSuggestions;
    if (statusFilter === 'pending') return groupedSuggestions.filter(b => b.hasPending);
    if (statusFilter === 'approved') return groupedSuggestions.filter(b => b.allApproved);
    if (statusFilter === 'rejected') return groupedSuggestions.filter(b => b.allRejected);
    return groupedSuggestions;
  }, [groupedSuggestions, statusFilter]);

  const updateStatus = async (id, status, note = '') => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions?id=eq.${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status,
          admin_notes: note || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
      });
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status, admin_notes: note || s.admin_notes } : s));
      showMsg(`✅ Marked as ${status}`);
    } catch (error) {
      console.error('Error updating:', error);
      showMsg('❌ Error updating');
    }
  };

  const updateBatchStatus = async (batchId, status) => {
    const batchItems = suggestions.filter(s => s.batch_id === batchId);
    const note = batchNotes.trim();
    
    for (const item of batchItems) {
      if (item.status === 'pending') {
        await updateStatus(item.id, status, note);
      }
    }
    setBatchNotes('');
  };

  const getUserName = (userId) => users[userId]?.display_name || users[userId]?.email?.split('@')[0] || 'Unknown';
  const getSongTitle = (songId) => songs[songId]?.title || 'Unknown song';

  const typeLabels = {
    new_song: { icon: 'music', label: 'New Song' },
    new_version: { icon: 'file-text', label: 'New Version' },
    media: { icon: 'movie', label: 'Media' },
    note: { icon: 'notes', label: 'Note' },
    edit: { icon: 'edit', label: 'Edit' },
    add_alias: { icon: 'tag', label: 'Alias' },
    add_flag: { icon: 'flag', label: 'Flag' }
  };

  const statusColors = {
    pending: { bg: '#D45D2520', text: '#D45D25' },
    approved: { bg: '#3B9B7320', text: '#3B9B73' },
    rejected: { bg: '#D45D2520', text: '#D45D25' }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '900px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', fontFamily: "'Gloria Hallelujah', cursive" },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', marginBottom: '1rem', overflow: 'hidden' },
    batchCard: { background: '#1e293b', borderRadius: '0.75rem', border: '2px solid #6882B6', marginBottom: '1rem', overflow: 'hidden' },
    filters: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
    filterBtn: (active) => ({
      background: active ? '#256B45' : '#334155',
      color: '#fff',
      border: 'none',
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem'
    }),
    btn: { background: '#256B45', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' },
    btnDanger: { background: '#C35522', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' },
    input: { width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem', marginBottom: '0.5rem' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    row: { display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.875rem' },
    label: { color: '#838C95' },
    pre: { background: '#0f172a', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' },
    itemCard: { background: '#0f172a', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.75rem', border: '1px solid #334155' },
    batchBadge: { background: '#6882B620', color: '#6882B6', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 'bold' }
  };

  const renderSuggestionItem = (sug, isPartOfBatch = false) => {
    const statusColor = statusColors[sug.status] || statusColors.pending;
    const noteKey = sug.id;
    
    return (
      <div key={sug.id} style={isPartOfBatch ? s.itemCard : {}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 'bold' }}>
            {typeLabels[sug.suggestion_type]
              ? <><i className={`ti ti-${typeLabels[sug.suggestion_type].icon}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {typeLabels[sug.suggestion_type].label}</>
              : sug.suggestion_type}
          </span>
          <span style={{
            fontSize: '0.7rem',
            padding: '0.2rem 0.5rem',
            borderRadius: '0.25rem',
            background: statusColor.bg,
            color: statusColor.text,
            textTransform: 'uppercase'
          }}>
            {sug.status}
          </span>
        </div>

        {/* Type-specific content */}
        {sug.suggestion_type === 'new_song' && (
          <>
            {sug.title && <div style={s.row}><span style={s.label}>Title:</span> {sug.title}</div>}
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

        {sug.suggestion_type === 'media' && (
          <>
            <div style={s.row}><span style={s.label}>Type:</span> {sug.media_type}</div>
            <div style={s.row}><span style={s.label}>URL:</span> <a href={sug.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#6882B6' }}>{sug.media_url}</a></div>
            {sug.media_label && <div style={s.row}><span style={s.label}>Label:</span> {sug.media_label}</div>}
          </>
        )}

        {sug.suggestion_type === 'note' && (
          <>
            <div style={s.row}><span style={s.label}>Note Type:</span> {sug.note_type}</div>
            <div style={{ marginTop: '0.5rem' }}>
              <span style={s.label}>Content:</span>
              <pre style={s.pre}>{sug.note_content}</pre>
            </div>
          </>
        )}

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

        {sug.suggestion_type === 'add_alias' && (
          <div style={s.row}><span style={s.label}>Alternate Name:</span> {sug.title}</div>
        )}

        {sug.suggestion_type === 'add_flag' && (
          <>
            <div style={s.row}><span style={s.label}>Flag Type:</span> {sug.note_type}</div>
            <div style={{ marginTop: '0.5rem' }}>
              <span style={s.label}>Description:</span>
              <pre style={s.pre}>{sug.note_content}</pre>
            </div>
          </>
        )}

        {/* Source URL */}
        {sug.source_url && (
          <div style={{ marginTop: '0.5rem' }}>
            <span style={s.label}>Source: </span>
            <a href={sug.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3B9B73', fontSize: '0.875rem' }}>{sug.source_url}</a>
          </div>
        )}

        {/* Reason */}
        {sug.reason && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#1e293b', borderRadius: '0.375rem' }}>
            <span style={s.label}>Context:</span> {sug.reason}
          </div>
        )}

        {/* Existing admin notes */}
        {sug.admin_notes && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#3B9B7315', borderRadius: '0.375rem', border: '1px solid #3B9B7330' }}>
            <span style={{ color: '#3B9B73', fontWeight: 'bold' }}>Admin notes:</span> {sug.admin_notes}
          </div>
        )}

        {/* Individual actions (if part of batch or standalone) */}
        {sug.status === 'pending' && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #334155' }}>
            <input
              type="text"
              placeholder="Note (optional)..."
              value={adminNotes[noteKey] || ''}
              onChange={(e) => setAdminNotes(prev => ({ ...prev, [noteKey]: e.target.value }))}
              style={s.input}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => { updateStatus(sug.id, 'approved', adminNotes[noteKey] || ''); setAdminNotes(prev => ({ ...prev, [noteKey]: '' })); }} style={s.btn}><i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Approve</button>
              <button onClick={() => { updateStatus(sug.id, 'rejected', adminNotes[noteKey] || ''); setAdminNotes(prev => ({ ...prev, [noteKey]: '' })); }} style={s.btnDanger}><i className="ti ti-x" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Reject</button>
            </div>
          </div>
        )}

        {sug.status !== 'pending' && (
          <div style={{ marginTop: '0.5rem' }}>
            <button onClick={() => updateStatus(sug.id, 'pending')} style={{ ...s.btnSec, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}><i className="ti ti-arrow-back-up" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Pending</button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!userProfile || !hasAnyRole(userRoleKeys)) {
    return <div style={s.container}><div style={s.wrapper}>Access denied</div></div>;
  }

  const pendingCount = groupedSuggestions.filter(b => b.hasPending).length;

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      
      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={s.title}><i className="ti ti-inbox" aria-hidden="true"></i> Review Suggestions</h1>
          <p style={{ color: '#838C95', fontSize: '0.875rem' }}>{filtered.length} submission(s)</p>
        </div>

        {/* Filters */}
        <div style={s.filters}>
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={s.filterBtn(statusFilter === f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && ` (${pendingCount})`}
            </button>
          ))}
        </div>

        {/* Suggestions */}
        {filtered.length === 0 ? (
          <div style={{ ...s.card, padding: '2rem', textAlign: 'center', color: '#838C95' }}>
            No suggestions to show
          </div>
        ) : (
          filtered.map(batch => {
            const isExpanded = expandedBatch === batch.batchId;
            const isBatch = batch.type === 'batch';
            const pendingInBatch = batch.items.filter(i => i.status === 'pending').length;
            
            return (
              <div key={batch.batchId} style={isBatch ? s.batchCard : s.card}>
                {/* Header */}
                <div 
                  onClick={() => setExpandedBatch(isExpanded ? null : batch.batchId)}
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
                      {isBatch && <span style={s.batchBadge}>BATCH ({batch.items.length})</span>}
                      
                      {/* Show primary info */}
                      {batch.items.some(i => i.suggestion_type === 'new_song') ? (
                        <span style={{ fontWeight: 'bold' }}><i className="ti ti-music" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> New Song: "{batch.items.find(i => i.suggestion_type === 'new_song')?.title}"</span>
                      ) : batch.songId ? (
                        <span style={{ fontWeight: 'bold' }}>For: "{getSongTitle(batch.songId)}"</span>
                      ) : (
                        <span style={{ fontWeight: 'bold' }}>
                          {typeLabels[batch.items[0]?.suggestion_type] && (
                            <><i className={`ti ti-${typeLabels[batch.items[0]?.suggestion_type].icon}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {typeLabels[batch.items[0]?.suggestion_type].label}</>
                          )}
                        </span>
                      )}
                      
                      {/* Show what types are in the batch - uses .label directly now,
                          fixing a real pre-existing bug where splitting the old
                          emoji+text string on spaces truncated "New Song" and "New
                          Version" both down to just "New", so a batch containing
                          both types would silently show only one, deduplicated
                          entry instead of two. */}
                      {isBatch && (
                        <span style={{ color: '#838C95', fontSize: '0.8rem' }}>
                          ({[...new Set(batch.items.map(i => typeLabels[i.suggestion_type]?.label || i.suggestion_type))].join(', ')})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#838C95', marginTop: '0.25rem' }}>
                      by {getUserName(batch.createdBy)} • {new Date(batch.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {pendingInBatch > 0 && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: statusColors.pending.bg,
                        color: statusColors.pending.text
                      }}>
                        {pendingInBatch} pending
                      </span>
                    )}
                    {batch.allApproved && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: statusColors.approved.bg,
                        color: statusColors.approved.text
                      }}>
                        ALL APPROVED
                      </span>
                    )}
                    {batch.allRejected && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: statusColors.rejected.bg,
                        color: statusColors.rejected.text
                      }}>
                        ALL REJECTED
                      </span>
                    )}
                    <span style={{ color: '#838C95' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #334155' }}>
                    <div style={{ paddingTop: '1rem' }}>
                      
                      {/* Batch actions */}
                      {isBatch && pendingInBatch > 0 && (
                        <div style={{ 
                          background: '#6882B610', 
                          border: '1px solid #6882B640', 
                          borderRadius: '0.5rem', 
                          padding: '1rem', 
                          marginBottom: '1rem' 
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#6882B6' }}>
                            Batch Actions ({pendingInBatch} pending)
                          </div>
                          <input
                            type="text"
                            placeholder="Note for all (optional)..."
                            value={batchNotes}
                            onChange={(e) => setBatchNotes(e.target.value)}
                            style={s.input}
                          />
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => updateBatchStatus(batch.batchId, 'approved')} style={s.btn}><i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Approve All</button>
                            <button onClick={() => updateBatchStatus(batch.batchId, 'rejected')} style={s.btnDanger}><i className="ti ti-x" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Reject All</button>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#838C95', marginTop: '0.5rem' }}>
                            Or review items individually below
                          </p>
                        </div>
                      )}

                      {/* Individual items */}
                      {batch.items.map(sug => renderSuggestionItem(sug, isBatch))}

                      <p style={{ fontSize: '0.75rem', color: '#838C95', marginTop: '0.5rem' }}>
                        Note: Approving doesn't auto-create the content. You'll need to add it manually in Admin.
                      </p>
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
