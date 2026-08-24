import { useState, useEffect } from 'react';
import Link from 'next/link';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function Ideas() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [requests, setRequests] = useState([]);
  const [votes, setVotes] = useState({});
  const [comments, setComments] = useState({});
  const [userProfiles, setUserProfiles] = useState({});
  
  const [sortBy, setSortBy] = useState('votes'); // 'votes', 'recent'
  const [statusFilter, setStatusFilter] = useState('open'); // 'all', 'open', 'planned', 'done', 'declined'
  
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('feature');
  
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'feature', 'bug', 'improvement'
  const [expandedId, setExpandedId] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [message, setMessage] = useState('');

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { loadData(); }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        await loadUserProfile(userData.id);
      }
    } catch (error) { console.log('Auth check failed'); }
    setLoading(false);
  };

  const loadUserProfile = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setUserProfile(data[0]);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadData = async () => {
    try {
      // Load requests
      const reqRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_requests?select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const reqData = await reqRes.json();
      setRequests(Array.isArray(reqData) ? reqData : []);

      // Load votes
      const votesRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_votes?select=*`, { headers: getAuthHeaders(false) });
      const votesData = await votesRes.json();
      const votesMap = {};
      if (Array.isArray(votesData)) {
        votesData.forEach(v => {
          if (!votesMap[v.request_id]) votesMap[v.request_id] = [];
          votesMap[v.request_id].push(v.user_id);
        });
      }
      setVotes(votesMap);

      // Load comments
      const commentsRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_comments?select=*&order=created_at.asc`, { headers: getAuthHeaders(false) });
      const commentsData = await commentsRes.json();
      const commentsMap = {};
      if (Array.isArray(commentsData)) {
        commentsData.forEach(c => {
          if (!commentsMap[c.request_id]) commentsMap[c.request_id] = [];
          commentsMap[c.request_id].push(c);
        });
      }
      setComments(commentsMap);

      // Load user profiles for display names
      const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=id,display_name,email`, { headers: getAuthHeaders(false) });
      const profilesData = await profilesRes.json();
      const profilesMap = {};
      if (Array.isArray(profilesData)) {
        profilesData.forEach(p => { profilesMap[p.id] = p; });
      }
      setUserProfiles(profilesMap);

    } catch (error) { console.error('Error loading data:', error); }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const getVoteCount = (requestId) => votes[requestId]?.length || 0;
  const hasVoted = (requestId) => user && votes[requestId]?.includes(user.id);
  const getComments = (requestId) => comments[requestId] || [];
  const getUserName = (userId) => userProfiles[userId]?.display_name || userProfiles[userId]?.email?.split('@')[0] || 'Anonymous';
  const isAdmin = userProfile?.role === 'admin';

  const toggleVote = async (requestId) => {
    if (!user) return;
    
    const alreadyVoted = hasVoted(requestId);
    
    try {
      if (alreadyVoted) {
        await fetch(`${SUPABASE_URL}/rest/v1/feature_votes?request_id=eq.${requestId}&user_id=eq.${user.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        setVotes(prev => ({
          ...prev,
          [requestId]: prev[requestId].filter(id => id !== user.id)
        }));
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/feature_votes`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ request_id: requestId, user_id: user.id })
        });
        setVotes(prev => ({
          ...prev,
          [requestId]: [...(prev[requestId] || []), user.id]
        }));
      }
    } catch (error) {
      console.error('Error toggling vote:', error);
      showMessage('❌ Error voting');
    }
  };

  const submitIdea = async () => {
    if (!user || !newTitle.trim()) return;
    
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_requests`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          request_type: newType,
          created_by: user.id
        })
      });
      const data = await res.json();
      if (data[0]) {
        setRequests(prev => [data[0], ...prev]);
        setNewTitle('');
        setNewDescription('');
        setNewType('feature');
        setShowNewForm(false);
        showMessage('✅ Idea submitted!');
      }
    } catch (error) {
      console.error('Error submitting idea:', error);
      showMessage('❌ Error submitting');
    }
  };

  const addComment = async (requestId) => {
    if (!user || !newComment.trim()) return;
    
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_comments`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({
          request_id: requestId,
          user_id: user.id,
          comment: newComment.trim()
        })
      });
      const data = await res.json();
      if (data[0]) {
        setComments(prev => ({
          ...prev,
          [requestId]: [...(prev[requestId] || []), data[0]]
        }));
        setNewComment('');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      showMessage('❌ Error commenting');
    }
  };

  const updateStatus = async (requestId, newStatus) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/feature_requests?id=eq.${requestId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() })
      });
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
      showMessage('✅ Status updated');
    } catch (error) {
      console.error('Error updating status:', error);
      showMessage('❌ Error updating');
    }
  };

  // Filter and sort
  const filteredRequests = requests
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => typeFilter === 'all' || (r.request_type || 'feature') === typeFilter)
    .sort((a, b) => {
      if (sortBy === 'votes') return getVoteCount(b.id) - getVoteCount(a.id);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const typeLabels = {
    feature: { icon: '🌟', label: 'Feature Request', color: '#3b82f6' },
    bug: { icon: '🐛', label: 'Bug Report', color: '#ef4444' },
    improvement: { icon: '💡', label: 'Improvement', color: '#f59e0b' }
  };

  const statusColors = {
    open: { bg: '#334155', text: '#94a3b8' },
    planned: { bg: '#3b82f620', text: '#3b82f6' },
    done: { bg: '#22c55e20', text: '#22c55e' },
    declined: { bg: '#ef444420', text: '#ef4444' }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '800px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    subtitle: { color: '#94a3b8', fontSize: '0.875rem' },
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    input: { width: '100%', padding: '0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '0.75rem' },
    textarea: { width: '100%', padding: '0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '0.75rem', minHeight: '100px', resize: 'vertical' },
    select: { padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', marginBottom: '1rem', overflow: 'hidden' },
    filters: { display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      
      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={s.title}>💡 Ideas & Feedback</h1>
          <p style={s.subtitle}>Suggest features, vote on what matters to you</p>
        </div>

        {/* New idea button / form */}
        {user ? (
          showNewForm ? (
            <div style={{ ...s.card, padding: '1rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 'bold', marginBottom: '0.75rem' }}>Submit Feedback</h3>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {['feature', 'bug', 'improvement'].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setNewType(t)}
                    style={{
                      ...s.btnSec,
                      flex: 1,
                      background: newType === t ? `${typeLabels[t].color}20` : '#334155',
                      border: newType === t ? `2px solid ${typeLabels[t].color}` : '2px solid transparent',
                      color: newType === t ? typeLabels[t].color : '#94a3b8'
                    }}
                  >
                    {typeLabels[t].icon} {typeLabels[t].label.split(' ')[0]}
                  </button>
                ))}
              </div>
              
              <input
                type="text"
                placeholder={newType === 'bug' ? "What's the bug?" : newType === 'improvement' ? "What could be better?" : "What's your idea?"}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={s.input}
              />
              <textarea
                placeholder="Tell us more... (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                style={s.textarea}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={submitIdea} disabled={!newTitle.trim()} style={{ ...s.btn, opacity: newTitle.trim() ? 1 : 0.5 }}>Submit</button>
                <button onClick={() => { setShowNewForm(false); setNewTitle(''); setNewDescription(''); setNewType('feature'); }} style={s.btnSec}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewForm(true)} style={{ ...s.btn, marginBottom: '1.5rem' }}>+ Submit Feedback</button>
          )
        ) : (
          <div style={{ ...s.card, padding: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <Link href="/?login=true" style={{ color: '#22c55e' }}>Log in</Link> to submit ideas and vote
          </div>
        )}

        {/* Type tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setTypeFilter('all')} 
            style={{ 
              ...s.btnSec, 
              background: typeFilter === 'all' ? '#22c55e' : '#334155',
              fontWeight: typeFilter === 'all' ? '600' : '400'
            }}
          >
            All
          </button>
          {['feature', 'bug', 'improvement'].map(t => (
            <button 
              key={t} 
              onClick={() => setTypeFilter(t)}
              style={{ 
                ...s.btnSec, 
                background: typeFilter === t ? `${typeLabels[t].color}` : '#334155',
                fontWeight: typeFilter === t ? '600' : '400'
              }}
            >
              {typeLabels[t].icon} {typeLabels[t].label.split(' ')[0]}
              {' '}({requests.filter(r => (r.request_type || 'feature') === t).length})
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={s.filters}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={s.select}>
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="planned">Planned</option>
            <option value="done">Done</option>
            <option value="declined">Declined</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={s.select}>
            <option value="votes">Most Votes</option>
            <option value="recent">Most Recent</option>
          </select>
          <span style={{ color: '#64748b', fontSize: '0.875rem' }}>{filteredRequests.length} items</span>
        </div>

        {/* Ideas list */}
        {filteredRequests.map(req => {
          const voteCount = getVoteCount(req.id);
          const voted = hasVoted(req.id);
          const reqComments = getComments(req.id);
          const isExpanded = expandedId === req.id;
          const statusColor = statusColors[req.status] || statusColors.open;
          const reqType = typeLabels[req.request_type] || typeLabels.feature;

          return (
            <div key={req.id} style={s.card}>
              <div style={{ display: 'flex' }}>
                {/* Vote column */}
                <div style={{ 
                  padding: '1rem', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  borderRight: '1px solid #334155',
                  minWidth: '60px'
                }}>
                  <button
                    onClick={() => user && toggleVote(req.id)}
                    disabled={!user}
                    style={{
                      background: voted ? '#22c55e' : '#334155',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem',
                      cursor: user ? 'pointer' : 'default',
                      opacity: user ? 1 : 0.5,
                      transition: 'background 0.2s'
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>▲</span>
                  </button>
                  <span style={{ fontWeight: 'bold', fontSize: '1.25rem', marginTop: '0.25rem' }}>{voteCount}</span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '0.25rem',
                        background: `${reqType.color}20`,
                        color: reqType.color
                      }}>
                        {reqType.icon} {reqType.label.split(' ')[0]}
                      </span>
                      <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{req.title}</h3>
                    </div>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '0.25rem',
                      background: statusColor.bg,
                      color: statusColor.text,
                      textTransform: 'uppercase',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap'
                    }}>
                      {req.status}
                    </span>
                  </div>
                  
                  {req.description && (
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{req.description}</p>
                  )}

                  {req.admin_response && (
                    <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                      <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Admin:</span> {req.admin_response}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>by {getUserName(req.created_by)}</span>
                    <span>{new Date(req.created_at).toLocaleDateString()}</span>
                    <button 
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      💬 {reqComments.length} {isExpanded ? '▼' : '▶'}
                    </button>
                    
                    {/* Admin status controls */}
                    {isAdmin && (
                      <select
                        value={req.status}
                        onChange={(e) => updateStatus(req.id, e.target.value)}
                        style={{ ...s.select, padding: '0.25rem', fontSize: '0.7rem' }}
                      >
                        <option value="open">Open</option>
                        <option value="planned">Planned</option>
                        <option value="done">Done</option>
                        <option value="declined">Declined</option>
                      </select>
                    )}
                  </div>

                  {/* Comments section */}
                  {isExpanded && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                      {reqComments.length === 0 && (
                        <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic' }}>No comments yet</p>
                      )}
                      
                      {reqComments.map(c => (
                        <div key={c.id} style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                          <span style={{ fontWeight: 'bold', color: '#22c55e' }}>{getUserName(c.user_id)}</span>
                          <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                          <p style={{ marginTop: '0.25rem', color: '#e2e8f0' }}>{c.comment}</p>
                        </div>
                      ))}

                      {user ? (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={expandedId === req.id ? newComment : ''}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addComment(req.id)}
                            style={{ ...s.input, marginBottom: 0, flex: 1 }}
                          />
                          <button onClick={() => addComment(req.id)} disabled={!newComment.trim()} style={s.btn}>Post</button>
                        </div>
                      ) : (
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                          <Link href="/?login=true" style={{ color: '#22c55e' }}>Log in</Link> to comment
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredRequests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <p>No ideas yet. Be the first to suggest something!</p>
          </div>
        )}
      </div>
    </div>
  );
}
