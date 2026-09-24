import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Lightweight, dependency-free formatter for idea/feedback descriptions.
// Supports: **bold**, *italic*, # / ## headers, - or * bullet lists, blank-line paragraphs.
// Deliberately does NOT support raw HTML - everything renders as React text nodes, so
// there's no injection risk from user-submitted content.
function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(p => p !== '');
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function FormattedText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let currentList = null;
  let currentParagraph = [];

  const flushParagraph = (key) => {
    if (currentParagraph.length > 0) {
      blocks.push(
        <p key={`p-${key}`} style={{ margin: '0 0 0.5rem 0' }}>
          {currentParagraph.map((line, i) => (
            <span key={i}>{renderInline(line, `p-${key}-${i}`)}{i < currentParagraph.length - 1 && <br />}</span>
          ))}
        </p>
      );
      currentParagraph = [];
    }
  };
  const flushList = (key) => {
    if (currentList) {
      blocks.push(<ul key={`ul-${key}`} style={{ margin: '0 0 0.5rem 0', paddingLeft: '1.25rem' }}>{currentList}</ul>);
      currentList = null;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      flushParagraph(idx);
      flushList(idx);
    } else if (trimmed.startsWith('## ')) {
      flushParagraph(idx);
      flushList(idx);
      blocks.push(<h4 key={`h-${idx}`} style={{ margin: '0.75rem 0 0.25rem 0', fontSize: '1rem', fontWeight: 'bold' }}>{renderInline(trimmed.slice(3), `h-${idx}`)}</h4>);
    } else if (trimmed.startsWith('# ')) {
      flushParagraph(idx);
      flushList(idx);
      blocks.push(<h3 key={`h-${idx}`} style={{ margin: '0.75rem 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>{renderInline(trimmed.slice(2), `h-${idx}`)}</h3>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph(idx);
      if (!currentList) currentList = [];
      currentList.push(<li key={`li-${idx}`}>{renderInline(trimmed.slice(2), `li-${idx}`)}</li>);
    } else {
      flushList(idx);
      currentParagraph.push(trimmed);
    }
  });
  flushParagraph('end');
  flushList('end');

  return <>{blocks}</>;
}

export default function Ideas() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  
  const [requests, setRequests] = useState([]);
  const [votes, setVotes] = useState({});
  const [comments, setComments] = useState({});
  const [userProfiles, setUserProfiles] = useState({});
  
  const [sortBy, setSortBy] = useState('votes');
  // Status: multi-select now (someone may want "everything not done" =
  // Open + Planned together), defaulting to just Open to match the
  // previous default view. Empty selection means no filter (show all),
  // same convention used elsewhere.
  const [statusFilters, setStatusFilters] = useState(['open']);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('feature');
  const [newOptions, setNewOptions] = useState(['', '']);
  const [newTopics, setNewTopics] = useState([]); // value_keys selected for the new submission

  const [typeFilter, setTypeFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState([]); // multi-select, [] = any topic
  const [topicFilterMode, setTopicFilterMode] = useState('any');
  const [expandedId, setExpandedId] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [message, setMessage] = useState('');
  const [pollOptions, setPollOptions] = useState({});
  const [pollVotes, setPollVotes] = useState({});
  const [myPollVote, setMyPollVote] = useState({});
  const [pollBreakdown, setPollBreakdown] = useState({});
  const [breakdownOpenFor, setBreakdownOpenFor] = useState(null);

  const [topicOptions, setTopicOptions] = useState([]); // option_lists rows, list_key='feedback_topics'
  const [requestTopics, setRequestTopics] = useState({}); // request_id -> [value_key, ...]

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!user) { setMyPollVote({}); return; }
    const loadMyVotes = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_option_votes?select=request_id,option_id&user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
        const data = await res.json();
        const map = {};
        if (Array.isArray(data)) data.forEach(v => { map[v.request_id] = v.option_id; });
        setMyPollVote(map);
      } catch (error) { console.error('Error loading my poll votes:', error); }
    };
    loadMyVotes();
  }, [user]);

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
      const headers = getAuthHeaders(false);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setUserProfile(data[0]);
      const roleKeys = await fetchUserRoleKeys(userId, headers);
      setUserRoleKeys(roleKeys);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadData = async () => {
    try {
      const reqRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_requests?select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const reqData = await reqRes.json();
      setRequests(Array.isArray(reqData) ? reqData : []);

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

      const optRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_options?select=*&order=display_order.asc`, { headers: getAuthHeaders(false) });
      const optData = await optRes.json();
      const optMap = {};
      if (Array.isArray(optData)) {
        optData.forEach(o => {
          if (!optMap[o.request_id]) optMap[o.request_id] = [];
          optMap[o.request_id].push(o);
        });
      }
      setPollOptions(optMap);

      const pvRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_poll_vote_counts`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const pvData = await pvRes.json();
      const countMap = {};
      if (Array.isArray(pvData)) {
        pvData.forEach(row => { countMap[row.option_id] = Number(row.vote_count); });
      }
      setPollVotes(countMap);

      const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=id,display_name,email`, { headers: getAuthHeaders(false) });
      const profilesData = await profilesRes.json();
      const profilesMap = {};
      if (Array.isArray(profilesData)) {
        profilesData.forEach(p => { profilesMap[p.id] = p; });
      }
      setUserProfiles(profilesMap);

      // Load topic option definitions (admin-editable via /option-lists, list_key='feedback_topics')
      const topicOptRes = await fetch(`${SUPABASE_URL}/rest/v1/option_lists?list_key=eq.feedback_topics&select=*&order=display_order.asc`, { headers: getAuthHeaders(false) });
      const topicOptData = await topicOptRes.json();
      setTopicOptions(Array.isArray(topicOptData) ? topicOptData : []);

      // Load topic assignments (join table, many-to-many: a submission can span multiple topics)
      const reqTopicsRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_topics?select=request_id,topic_value_key`, { headers: getAuthHeaders(false) });
      const reqTopicsData = await reqTopicsRes.json();
      const reqTopicsMap = {};
      if (Array.isArray(reqTopicsData)) {
        reqTopicsData.forEach(rt => {
          if (!reqTopicsMap[rt.request_id]) reqTopicsMap[rt.request_id] = [];
          reqTopicsMap[rt.request_id].push(rt.topic_value_key);
        });
      }
      setRequestTopics(reqTopicsMap);

    } catch (error) { console.error('Error loading data:', error); }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const getVoteCount = (requestId) => votes[requestId]?.length || 0;
  const hasVoted = (requestId) => user && votes[requestId]?.includes(user.id);
  const getComments = (requestId) => comments[requestId] || [];
  const getUserName = (userId) => userProfiles[userId]?.display_name || userProfiles[userId]?.email?.split('@')[0] || 'Anonymous';
  const getTopicsForRequest = (requestId) => requestTopics[requestId] || [];
  const getTopicLabel = (valueKey) => topicOptions.find(t => t.value_key === valueKey)?.label || valueKey;
  const isAdmin = hasAnyRole(userRoleKeys);

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

  const toggleBreakdown = async (requestId) => {
    if (breakdownOpenFor === requestId) { setBreakdownOpenFor(null); return; }
    setBreakdownOpenFor(requestId);
    if (pollBreakdown[requestId]) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_poll_vote_breakdown_by_role`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ p_request_id: requestId })
      });
      const data = await res.json();
      const byOption = {};
      if (Array.isArray(data)) {
        data.forEach(row => {
          if (!byOption[row.option_id]) byOption[row.option_id] = {};
          byOption[row.option_id][row.role] = Number(row.vote_count);
        });
      }
      setPollBreakdown(prev => ({ ...prev, [requestId]: byOption }));
    } catch (error) {
      console.error('Error loading vote breakdown:', error);
      showMessage('❌ Could not load breakdown');
    }
  };

  const castPollVote = async (requestId, optionId) => {
    if (!user) return;
    const previousOptionId = myPollVote[requestId];
    try {
      if (previousOptionId === optionId) return;
      if (previousOptionId) {
        await fetch(`${SUPABASE_URL}/rest/v1/feature_request_option_votes?request_id=eq.${requestId}&user_id=eq.${user.id}`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ option_id: optionId })
        });
        setPollVotes(prev => ({
          ...prev,
          [previousOptionId]: Math.max(0, (prev[previousOptionId] || 1) - 1),
          [optionId]: (prev[optionId] || 0) + 1
        }));
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/feature_request_option_votes`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ request_id: requestId, option_id: optionId, user_id: user.id })
        });
        setPollVotes(prev => ({ ...prev, [optionId]: (prev[optionId] || 0) + 1 }));
      }
      setMyPollVote(prev => ({ ...prev, [requestId]: optionId }));
    } catch (error) {
      console.error('Error voting on option:', error);
      showMessage('❌ Error voting');
    }
  };

  const submitIdea = async () => {
    if (!user || !newTitle.trim()) return;
    if (ADMIN_ONLY_TYPES.includes(newType) && !isAdmin) {
      showMessage('❌ Only admins can post this type');
      return;
    }
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
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Idea submit failed:', res.status, errorText);
        showMessage(`❌ Error submitting: ${errorText.substring(0, 200)}`);
        return;
      }
      const data = await res.json();
      if (data[0]) {
        const newRequestId = data[0].id;
        setRequests(prev => [data[0], ...prev]);

        const filledOptions = newOptions.map(o => o.trim()).filter(Boolean);
        if (newType === 'needs_input' && filledOptions.length > 0) {
          const optRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_options`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
            body: JSON.stringify(filledOptions.map((text, i) => ({
              request_id: newRequestId,
              option_text: text,
              display_order: i
            })))
          });
          const optData = await optRes.json();
          if (Array.isArray(optData)) {
            setPollOptions(prev => ({ ...prev, [newRequestId]: optData }));
          }
        }

        // Save topic assignments, if any were selected - topics are optional.
        // If this write fails, the idea itself was still created successfully,
        // so we don't roll anything back - just tell the person the topics
        // specifically didn't save.
        let topicsSavedOk = true;
        if (newTopics.length > 0) {
          const topicRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_topics`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify(newTopics.map(topicValueKey => ({
              request_id: newRequestId,
              topic_value_key: topicValueKey
            })))
          });
          if (topicRes.ok) {
            setRequestTopics(prev => ({ ...prev, [newRequestId]: newTopics }));
          } else {
            const errorText = await topicRes.text();
            console.error('Topic assignment failed:', topicRes.status, errorText);
            topicsSavedOk = false;
          }
        }

        setNewTitle('');
        setNewDescription('');
        setNewType('feature');
        setNewOptions(['', '']);
        setNewTopics([]);
        setShowNewForm(false);
        showMessage(topicsSavedOk ? '✅ Idea submitted!' : '✅ Idea submitted, but topics could not be saved');
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
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_requests?id=eq.${requestId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() })
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Status update failed:', res.status, errorText);
        showMessage(`❌ Could not update status: ${errorText.substring(0, 200)}`);
        return;
      }
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
      showMessage('✅ Status updated');
    } catch (error) {
      console.error('Error updating status:', error);
      showMessage('❌ Error updating');
    }
  };

  // Toggle a topic on an existing request (admin-only from the list view - the
  // submitter picks topics at creation time via newTopics, but admins can
  // recategorize afterward since they're the ones who'll rely on filtering by it).
  const toggleRequestTopic = async (requestId, topicValueKey) => {
    const current = getTopicsForRequest(requestId);
    const isSet = current.includes(topicValueKey);
    try {
      if (isSet) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_topics?request_id=eq.${requestId}&topic_value_key=eq.${topicValueKey}`, {
          method: 'DELETE', headers: getAuthHeaders(false)
        });
        if (!res.ok) { showMessage('❌ Could not remove topic'); return; }
        setRequestTopics(prev => ({ ...prev, [requestId]: current.filter(t => t !== topicValueKey) }));
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_request_topics`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ request_id: requestId, topic_value_key: topicValueKey })
        });
        if (!res.ok) { showMessage('❌ Could not add topic'); return; }
        setRequestTopics(prev => ({ ...prev, [requestId]: [...current, topicValueKey] }));
      }
    } catch (error) {
      console.error('Error toggling topic:', error);
      showMessage('❌ Error updating topic');
    }
  };

  // Base filter (everything except type) - used both for the main list and
  // for computing per-type counts, so the counts reflect status/topic filters
  // currently active without also collapsing to the selected type itself.
  const matchesNonTypeFilters = (r) => {
    if (statusFilters.length > 0 && !statusFilters.includes(r.status)) return false;
    if (topicFilter.length > 0) {
      const reqTopics = getTopicsForRequest(r.id);
      const matches = topicFilterMode === 'all'
        ? topicFilter.every(t => reqTopics.includes(t))
        : topicFilter.some(t => reqTopics.includes(t));
      if (!matches) return false;
    }
    return true;
  };

  const filteredRequests = requests
    .filter(matchesNonTypeFilters)
    .filter(r => typeFilter === 'all' || (r.request_type || 'feature') === typeFilter)
    .sort((a, b) => {
      if (sortBy === 'votes') return getVoteCount(b.id) - getVoteCount(a.id);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  // Count of items matching a given type AND all currently-active non-type
  // filters (status, topic) - this is what makes the tab badges reflect the
  // active filter instead of always showing the all-time total for that type.
  const countForType = (t) => requests.filter(r => matchesNonTypeFilters(r) && (r.request_type || 'feature') === t).length;

  const typeLabels = {
    feature: { icon: 'star', label: 'Feature Request', color: '#3B9B73' },
    bug: { icon: 'bug', label: 'Bug Report', color: '#D45D25' },
    improvement: { icon: 'bulb', label: 'Improvement', color: '#6882B6' },
    needs_input: { icon: 'message-question', label: 'Needs Input', color: '#8F74B4' }
  };
  // Separate fill-specific shades for the one spot (active type tab) that
  // uses these as a solid background with white text - the accent shades
  // above are calibrated for text-on-dark-background contrast, not
  // necessarily deep enough for white text on top of them as a fill.
  const typeFillColors = {
    feature: '#256B45',
    bug: '#C35522',
    improvement: '#5371AC',
    needs_input: '#7959A6'
  };

  const POSTABLE_TYPES = ['feature', 'bug', 'improvement'];
  const ADMIN_ONLY_TYPES = ['needs_input'];

  const statusColors = {
    open: { bg: '#334155', text: '#838C95' },
    planned: { bg: '#6882B620', text: '#6882B6' },
    done: { bg: '#3B9B7320', text: '#3B9B73' },
    declined: { bg: '#D45D2520', text: '#D45D25' }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '800px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    subtitle: { color: '#838C95', fontSize: '0.875rem' },
    btn: { background: '#256B45', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    input: { width: '100%', padding: '0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '0.75rem' },
    textarea: { width: '100%', padding: '0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '0.75rem', minHeight: '100px', resize: 'vertical' },
    select: { padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', marginBottom: '1rem', overflow: 'hidden' },
    filters: { display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    topicChip: (selected) => ({
      padding: '0.3rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', cursor: 'pointer',
      border: selected ? '2px solid #3B9B73' : '1px solid #334155',
      background: selected ? '#3B9B7320' : '#1e293b',
      color: selected ? '#3B9B73' : '#838C95'
    }),
    topicBadge: { display: 'inline-block', background: '#334155', color: '#838C95', padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.7rem', marginRight: '0.375rem', marginBottom: '0.25rem' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      
      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={{ ...s.title, fontFamily: "'Gloria Hallelujah', cursive" }}><i className="ti ti-message-2" aria-hidden="true"></i> Feedback</h1>
          <p style={s.subtitle}>Share feedback, vote on ideas, and weigh in when we need your input</p>
        </div>

        {user ? (
          showNewForm ? (
            <div style={{ ...s.card, padding: '1rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 'bold', marginBottom: '0.75rem' }}>Submit Feedback</h3>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {[...POSTABLE_TYPES, ...(isAdmin ? ADMIN_ONLY_TYPES : [])].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setNewType(t)}
                    style={{
                      ...s.btnSec,
                      flex: 1,
                      background: newType === t ? `${typeLabels[t].color}20` : '#334155',
                      border: newType === t ? `2px solid ${typeLabels[t].color}` : '2px solid transparent',
                      color: newType === t ? typeLabels[t].color : '#838C95'
                    }}
                  >
                    <i className={`ti ti-${typeLabels[t].icon}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {typeLabels[t].label}
                  </button>
                ))}
              </div>
              
              <div style={{ fontSize: '0.75rem', color: '#838C95', marginBottom: '0.25rem' }}>
                Title <span style={{ color: '#D45D25' }}>*</span> required
              </div>
              <input
                type="text"
                placeholder={newType === 'bug' ? "What's the bug?" : newType === 'improvement' ? "What could be better?" : newType === 'needs_input' ? "What's the idea we need to think through?" : "What's your idea?"}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={s.input}
              />
              <textarea
                placeholder={newType === 'needs_input' ? "Describe the idea, the issue it raises, and what input or thoughts you're looking for..." : "Tell us more... (optional)"}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                style={s.textarea}
              />
              <div style={{ fontSize: '0.75rem', color: '#838C95', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                Formatting supported: **bold**, *italic*, # heading, ## subheading, - bullet list
              </div>
              {newDescription.trim() && (
                <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#838C95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Preview</div>
                  <div style={{ color: '#e2e8f0', fontSize: '0.875rem' }}><FormattedText text={newDescription} /></div>
                </div>
              )}

              {/* Topics (optional) */}
              {topicOptions.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#838C95', marginBottom: '0.5rem' }}>
                    What part of the platform is this about? (optional, pick any that apply)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {topicOptions.map(topic => {
                      const selected = newTopics.includes(topic.value_key);
                      return (
                        <button
                          key={topic.value_key}
                          type="button"
                          onClick={() => setNewTopics(prev => selected ? prev.filter(t => t !== topic.value_key) : [...prev, topic.value_key])}
                          style={s.topicChip(selected)}
                        >
                          {selected ? '✓ ' : ''}{topic.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {newType === 'needs_input' && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#838C95', marginBottom: '0.5rem' }}>
                    Optional: add options for people to vote on
                  </div>
                  {newOptions.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder={`Option ${i + 1}`}
                        value={opt}
                        onChange={(e) => setNewOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
                        style={{ ...s.input, marginBottom: 0 }}
                      />
                      {newOptions.length > 2 && (
                        <button
                          onClick={() => setNewOptions(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ ...s.btnSec, padding: '0.5rem 0.75rem' }}
                        >✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setNewOptions(prev => [...prev, ''])} style={{ ...s.btnSec, fontSize: '0.8rem' }}>
                    + Add another option
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={submitIdea} disabled={!newTitle.trim()} style={{ ...s.btn, opacity: newTitle.trim() ? 1 : 0.5 }}>Submit</button>
                <button onClick={() => { setShowNewForm(false); setNewTitle(''); setNewDescription(''); setNewType('feature'); setNewOptions(['', '']); setNewTopics([]); }} style={s.btnSec}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewForm(true)} style={{ ...s.btn, marginBottom: '1.5rem' }}>+ Submit Feedback</button>
          )
        ) : (
          <div style={{ ...s.card, padding: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <Link href="/?login=true" style={{ color: '#3B9B73' }}>Log in</Link> to submit ideas and vote
          </div>
        )}

        {/* Type filter - these are filters within one list (an "All" option
            already shows everything), not a switch to a different view, so
            they stay as standalone chips rather than a connected segmented
            control - per the style guide's distinction between the two. */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setTypeFilter('all')} 
            style={{ 
              ...s.btnSec, 
              background: typeFilter === 'all' ? '#256B45' : '#334155',
              fontWeight: typeFilter === 'all' ? '600' : '400'
            }}
          >
            All ({requests.filter(matchesNonTypeFilters).length})
          </button>
          {[...POSTABLE_TYPES, ...ADMIN_ONLY_TYPES].map(t => (
            <button 
              key={t} 
              onClick={() => setTypeFilter(t)}
              style={{ 
                ...s.btnSec, 
                background: typeFilter === t ? `${typeFillColors[t]}` : '#334155',
                fontWeight: typeFilter === t ? '600' : '400'
              }}
            >
              <i className={`ti ti-${typeLabels[t].icon}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {typeLabels[t].label}
              {' '}({countForType(t)})
            </button>
          ))}
        </div>

        {/* Filters - collapsible by default, matching the pattern. Status is
            now checkboxes (multi-select - someone may want "everything not
            done" = Open + Planned together); Topic keeps its chip UI but
            now has a real any/all toggle, since a submission can span
            several topics. Sort isn't a filter (doesn't include/exclude
            anything) so it stays outside, always visible. */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              style={{ ...s.btnSec, display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              <span>Filter{(statusFilters.length !== 1 || statusFilters[0] !== 'open' || topicFilter.length > 0) ? ` (${statusFilters.length + topicFilter.length})` : ''}</span>
              <i className={`ti ti-chevron-${filtersExpanded ? 'up' : 'down'}`} aria-hidden="true"></i>
            </button>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...s.select, marginBottom: 0 }}>
              <option value="votes">Most Votes</option>
              <option value="recent">Most Recent</option>
            </select>
            <span style={{ color: '#838C95', fontSize: '0.875rem' }}>{filteredRequests.length} items</span>
          </div>
          {filtersExpanded && (
            <div style={{ ...s.card, padding: '0.75rem' }}>
              <div style={{ marginBottom: topicOptions.length > 0 ? '0.75rem' : 0 }}>
                <div style={{ fontSize: '0.7rem', color: '#838C95', textTransform: 'uppercase', marginBottom: '0.375rem' }}>Status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['open', 'planned', 'done', 'declined'].map(st => (
                    <label key={st} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={statusFilters.includes(st)}
                        onChange={() => setStatusFilters(prev => prev.includes(st) ? prev.filter(v => v !== st) : [...prev, st])}
                      />
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              {topicOptions.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <div style={{ fontSize: '0.7rem', color: '#838C95', textTransform: 'uppercase' }}>Topic</div>
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                        <input type="radio" name="topicFilterMode" checked={topicFilterMode === 'any'} onChange={() => setTopicFilterMode('any')} /> any
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                        <input type="radio" name="topicFilterMode" checked={topicFilterMode === 'all'} onChange={() => setTopicFilterMode('all')} /> all
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {topicOptions.map(topic => {
                      const selected = topicFilter.includes(topic.value_key);
                      return (
                        <button
                          key={topic.value_key}
                          onClick={() => setTopicFilter(prev => selected ? prev.filter(t => t !== topic.value_key) : [...prev, topic.value_key])}
                          style={s.topicChip(selected)}
                        >
                          {selected ? '✓ ' : ''}{topic.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {(statusFilters.length > 0 || topicFilter.length > 0) && (
                <button
                  onClick={() => { setStatusFilters([]); setTopicFilter([]); }}
                  style={{ ...s.btnSec, marginTop: '0.75rem', width: '100%', fontSize: '0.8rem' }}
                >Clear all filters</button>
              )}
            </div>
          )}
        </div>

        {filteredRequests.map(req => {
          const voteCount = getVoteCount(req.id);
          const voted = hasVoted(req.id);
          const reqComments = getComments(req.id);
          const isExpanded = expandedId === req.id;
          const statusColor = statusColors[req.status] || statusColors.open;
          const reqType = typeLabels[req.request_type] || typeLabels.feature;
          const reqTopics = getTopicsForRequest(req.id);

          return (
            <div key={req.id} style={s.card}>
              <div style={{ display: 'flex' }}>
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
                      background: voted ? '#256B45' : '#334155',
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
                        <i className={`ti ti-${reqType.icon}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {reqType.label}
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

                  {/* Topic badges */}
                  {reqTopics.length > 0 && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      {reqTopics.map(tk => <span key={tk} style={s.topicBadge}>{getTopicLabel(tk)}</span>)}
                    </div>
                  )}
                  
                  {req.description && (
                    <div style={{ color: '#838C95', fontSize: '0.875rem', marginBottom: '0.5rem' }}><FormattedText text={req.description} /></div>
                  )}
                  {pollOptions[req.id] && pollOptions[req.id].length > 0 && (() => {
                    const options = pollOptions[req.id];
                    const counts = options.map(o => pollVotes[o.id] || 0);
                    const totalVotes = counts.reduce((a, b) => a + b, 0);
                    const myVote = myPollVote[req.id];
                    return (
                      <div style={{ marginBottom: '0.75rem' }}>
                        {options.map((opt, i) => {
                          const count = counts[i];
                          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                          const isMine = myVote === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => castPollVote(req.id, opt.id)}
                              disabled={!user}
                              style={{
                                position: 'relative',
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                background: '#334155',
                                border: isMine ? '2px solid #6882B6' : '2px solid transparent',
                                borderRadius: '0.375rem',
                                padding: '0.5rem 0.75rem',
                                marginBottom: '0.375rem',
                                cursor: user ? 'pointer' : 'default',
                                overflow: 'hidden'
                              }}
                            >
                              <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${pct}%`, background: '#3B9B7320', zIndex: 0
                              }} />
                              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                <span>{isMine && '✓ '}{opt.option_text}</span>
                                <span style={{ color: '#838C95' }}>{count} {count === 1 ? 'vote' : 'votes'} ({pct}%)</span>
                              </div>
                            </button>
                          );
                        })}
                        {!user && <div style={{ fontSize: '0.75rem', color: '#838C95' }}>Log in to vote</div>}
                        {isAdmin && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <button onClick={() => toggleBreakdown(req.id)} style={{ ...s.btnSec, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                              {breakdownOpenFor === req.id ? 'Hide' : 'Show'} breakdown by role
                            </button>
                            {breakdownOpenFor === req.id && (
                              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#838C95' }}>
                                {!pollBreakdown[req.id] ? 'Loading...' : options.map(opt => {
                                  const roleCounts = pollBreakdown[req.id][opt.id] || {};
                                  const roleEntries = Object.entries(roleCounts);
                                  return (
                                    <div key={opt.id} style={{ marginBottom: '0.375rem' }}>
                                      <strong style={{ color: '#e2e8f0' }}>{opt.option_text}:</strong>{' '}
                                      {roleEntries.length === 0 ? 'no votes' : roleEntries.map(([role, count]) => `${role}: ${count}`).join(', ')}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {req.admin_response && (
                    <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                      <span style={{ color: '#3B9B73', fontWeight: 'bold' }}>Admin:</span> {req.admin_response}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.75rem', color: '#838C95', flexWrap: 'wrap' }}>
                    <span>by {getUserName(req.created_by)}</span>
                    <span>{new Date(req.created_at).toLocaleDateString()}</span>
                    <button 
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      style={{ background: 'none', border: 'none', color: '#838C95', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      💬 {reqComments.length} {isExpanded ? '▼' : '▶'}
                    </button>
                    
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

                  {/* Admin: recategorize topics after the fact */}
                  {isAdmin && topicOptions.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {topicOptions.map(topic => {
                          const selected = reqTopics.includes(topic.value_key);
                          return (
                            <button
                              key={topic.value_key}
                              onClick={() => toggleRequestTopic(req.id, topic.value_key)}
                              style={{ ...s.topicChip(selected), padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            >
                              {selected ? '✓ ' : '+ '}{topic.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                      {reqComments.length === 0 && (
                        <p style={{ color: '#838C95', fontSize: '0.875rem', fontStyle: 'italic' }}>No comments yet</p>
                      )}
                      
                      {reqComments.map(c => (
                        <div key={c.id} style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                          <span style={{ fontWeight: 'bold', color: '#3B9B73' }}>{getUserName(c.user_id)}</span>
                          <span style={{ color: '#838C95', marginLeft: '0.5rem' }}>{new Date(c.created_at).toLocaleDateString()}</span>
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
                        <p style={{ color: '#838C95', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                          <Link href="/?login=true" style={{ color: '#3B9B73' }}>Log in</Link> to comment
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
          <div style={{ textAlign: 'center', padding: '3rem', color: '#838C95' }}>
            <p>No ideas yet. Be the first to suggest something!</p>
          </div>
        )}
      </div>
    </div>
  );
}
