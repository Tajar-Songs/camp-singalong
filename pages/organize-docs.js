import { useState, useEffect } from 'react';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function OrganizeDocs() {
  const [user, setUser] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [docs, setDocs] = useState([]);
  const [docAudiences, setDocAudiences] = useState({}); // doc_id -> [audience_value_key]
  const [audienceOptions, setAudienceOptions] = useState([]);
  const [allExistingTags, setAllExistingTags] = useState([]);

  // Filters - same shape as docs.js so this feels consistent
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);
  const [applying, setApplying] = useState(false);

  // Bulk-action working values
  const [bulkFolder, setBulkFolder] = useState('');
  const [bulkVisibility, setBulkVisibility] = useState('admin');
  const [bulkTag, setBulkTag] = useState('');
  const [bulkAudience, setBulkAudience] = useState('');

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
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        const roleKeys = await fetchUserRoleKeys(userData.id, getAuthHeaders(false));
        setUserRoleKeys(roleKeys);
        await loadAll();
      }
    } catch (error) { console.error('Auth check failed:', error); }
    setLoading(false);
  };

  const isAdmin = hasAnyRole(userRoleKeys);
  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const loadAll = async () => {
    try {
      const [docsRes, audRes, optRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/docs?select=id,title,folder,visibility,tags&order=title.asc`, { headers: getAuthHeaders(false) }),
        fetch(`${SUPABASE_URL}/rest/v1/doc_audiences?select=doc_id,audience_value_key`, { headers: getAuthHeaders(false) }),
        fetch(`${SUPABASE_URL}/rest/v1/option_lists?list_key=eq.doc_audiences&select=*&order=display_order.asc`, { headers: getAuthHeaders(false) })
      ]);
      const docsData = await docsRes.json();
      const audData = await audRes.json();
      const optData = await optRes.json();

      setDocs(Array.isArray(docsData) ? docsData : []);

      const audMap = {};
      if (Array.isArray(audData)) {
        audData.forEach(row => {
          if (!audMap[row.doc_id]) audMap[row.doc_id] = [];
          audMap[row.doc_id].push(row.audience_value_key);
        });
      }
      setDocAudiences(audMap);
      setAudienceOptions(Array.isArray(optData) ? optData : []);

      const tagSet = new Set();
      if (Array.isArray(docsData)) docsData.forEach(d => { if (d.tags) d.tags.forEach(t => tagSet.add(t)); });
      setAllExistingTags([...tagSet].sort());
    } catch (error) {
      console.error('Error loading docs for bulk organize:', error);
    }
  };

  const folders = [...new Set(docs.map(d => d.folder).filter(Boolean))].sort();

  const filteredDocs = docs.filter(doc => {
    if (folderFilter && doc.folder !== folderFilter) return false;
    if (visibilityFilter && doc.visibility !== visibilityFilter) return false;
    if (tagFilter && !(doc.tags || []).includes(tagFilter)) return false;
    if (audienceFilter && !(docAudiences[doc.id] || []).includes(audienceFilter)) return false;
    if (search && !doc.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const selectAllVisible = () => setSelectedIds(filteredDocs.map(d => d.id));
  const clearSelection = () => setSelectedIds([]);

  // --- Bulk actions ---
  const applySetFolder = async () => {
    if (selectedIds.length === 0) return;
    setApplying(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?id=in.(${selectedIds.join(',')})`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ folder: bulkFolder.trim() || null })
      });
      if (res.ok) { showMessage(`✅ Folder set for ${selectedIds.length} doc(s)`); await loadAll(); }
      else { showMessage('❌ Error setting folder'); }
    } catch (error) { console.error(error); showMessage('❌ Error setting folder'); }
    setApplying(false);
  };

  const applySetVisibility = async () => {
    if (selectedIds.length === 0) return;
    setApplying(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?id=in.(${selectedIds.join(',')})`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ visibility: bulkVisibility })
      });
      if (res.ok) { showMessage(`✅ Visibility set for ${selectedIds.length} doc(s)`); await loadAll(); }
      else { showMessage('❌ Error setting visibility'); }
    } catch (error) { console.error(error); showMessage('❌ Error setting visibility'); }
    setApplying(false);
  };

  // Tags live directly on the docs row as an array, so applying/removing
  // across many docs means patching each one's array individually - no bulk
  // array-append operation in PostgREST, so this is N sequential requests.
  const applyTag = async (add) => {
    const tag = bulkTag.trim().toLowerCase();
    if (!tag || selectedIds.length === 0) return;
    setApplying(true);
    try {
      const targets = docs.filter(d => selectedIds.includes(d.id));
      for (const doc of targets) {
        const current = doc.tags || [];
        const hasIt = current.includes(tag);
        if (add && hasIt) continue; // already has it, skip
        if (!add && !hasIt) continue; // doesn't have it, skip
        const nextTags = add ? [...current, tag] : current.filter(t => t !== tag);
        await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${doc.id}`, {
          method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ tags: nextTags })
        });
      }
      showMessage(`✅ Tag ${add ? 'applied' : 'removed'} for ${targets.length} doc(s)`);
      await loadAll();
    } catch (error) { console.error(error); showMessage('❌ Error updating tag'); }
    setApplying(false);
  };

  const applyAudience = async (add) => {
    if (!bulkAudience || selectedIds.length === 0) return;
    setApplying(true);
    try {
      if (add) {
        // Only insert for docs that don't already have it - avoids violating
        // the (doc_id, audience_value_key) unique constraint.
        const toInsert = selectedIds.filter(id => !(docAudiences[id] || []).includes(bulkAudience));
        if (toInsert.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/doc_audiences`, {
            method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify(toInsert.map(id => ({ doc_id: id, audience_value_key: bulkAudience })))
          });
        }
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/doc_audiences?doc_id=in.(${selectedIds.join(',')})&audience_value_key=eq.${bulkAudience}`, {
          method: 'DELETE', headers: getAuthHeaders(false)
        });
      }
      showMessage(`✅ Audience ${add ? 'applied' : 'removed'} for ${selectedIds.length} doc(s)`);
      await loadAll();
    } catch (error) { console.error(error); showMessage('❌ Error updating audience'); }
    setApplying(false);
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1000px', margin: '0 auto', padding: '2rem' },
    title: { fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    subtitle: { color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' },
    input: { padding: '0.5rem 0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', outline: 'none', fontSize: '0.875rem' },
    select: { padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem' },
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', overflow: 'hidden' },
    docRow: (selected) => ({ padding: '0.6rem 1rem', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '0.75rem', background: selected ? '#22c55e11' : 'transparent', cursor: 'pointer' }),
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    actionGroup: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' },
    actionLabel: { fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }
  };

  if (loading) return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  if (!isAdmin) return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Admin access required.</div>;

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      <div style={s.wrapper}>
        <h1 style={s.title}>🗂 Bulk Organize Docs</h1>
        <p style={s.subtitle}>Filter to a set of docs, select as many as you need, then apply a folder, visibility, tag, or audience change to all of them at once.</p>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="text" placeholder="Search title..." value={search} onChange={(e) => setSearch(e.target.value)} style={s.input} />
          <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} style={s.select}>
            <option value="">All Folders</option>
            {folders.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)} style={s.select}>
            <option value="">All Visibility</option>
            <option value="admin">🔒 Admin Only</option>
            <option value="user">👤 All Users</option>
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={s.select}>
            <option value="">All Tags</option>
            {allExistingTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)} style={s.select}>
            <option value="">All Audiences</option>
            {audienceOptions.map(a => <option key={a.value_key} value={a.value_key}>{a.label}</option>)}
          </select>
        </div>

        {/* Selection controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{filteredDocs.length} docs shown · {selectedIds.length} selected</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={s.btnSec} onClick={selectAllVisible}>Select all shown</button>
            <button style={s.btnSec} onClick={clearSelection}>Clear selection</button>
          </div>
        </div>

        {/* Doc list */}
        <div style={{ ...s.card, maxHeight: '40vh', overflowY: 'auto', marginBottom: '1.5rem' }}>
          {filteredDocs.map(doc => (
            <div key={doc.id} style={s.docRow(selectedIds.includes(doc.id))} onClick={() => toggleSelect(doc.id)}>
              <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleSelect(doc.id)} onClick={(e) => e.stopPropagation()} />
              <span style={{ flex: 1 }}>{doc.title}</span>
              {doc.folder && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>📁 {doc.folder}</span>}
            </div>
          ))}
          {filteredDocs.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No docs match these filters</div>}
        </div>

        {/* Bulk actions - disabled state communicated via opacity, not hidden,
            so it's clear selection is the missing step rather than the
            feature being unavailable. */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>Apply to {selectedIds.length} selected</h2>
        <div style={{ opacity: selectedIds.length === 0 ? 0.5 : 1, pointerEvents: selectedIds.length === 0 ? 'none' : 'auto' }}>
          <div style={s.actionGroup}>
            <div style={s.actionLabel}>Set Folder</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={bulkFolder} onChange={(e) => setBulkFolder(e.target.value)} placeholder="Folder name (blank = remove)" style={{ ...s.input, flex: 1 }} list="bulk-folders-list" />
              <datalist id="bulk-folders-list">{folders.map(f => <option key={f} value={f} />)}</datalist>
              <button style={s.btn} onClick={applySetFolder} disabled={applying}>Apply</button>
            </div>
          </div>
          <div style={s.actionGroup}>
            <div style={s.actionLabel}>Set Visibility</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={bulkVisibility} onChange={(e) => setBulkVisibility(e.target.value)} style={{ ...s.select, flex: 1 }}>
                <option value="admin">🔒 Admin Only</option>
                <option value="user">👤 All Users</option>
              </select>
              <button style={s.btn} onClick={applySetVisibility} disabled={applying}>Apply</button>
            </div>
          </div>
          <div style={s.actionGroup}>
            <div style={s.actionLabel}>Tag</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Tag name" style={{ ...s.input, flex: 1 }} list="bulk-tags-list" />
              <datalist id="bulk-tags-list">{allExistingTags.map(t => <option key={t} value={t} />)}</datalist>
              <button style={s.btn} onClick={() => applyTag(true)} disabled={applying}>Add</button>
              <button style={s.btnSec} onClick={() => applyTag(false)} disabled={applying}>Remove</button>
            </div>
          </div>
          <div style={s.actionGroup}>
            <div style={s.actionLabel}>Audience</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={bulkAudience} onChange={(e) => setBulkAudience(e.target.value)} style={{ ...s.select, flex: 1 }}>
                <option value="">Choose an audience...</option>
                {audienceOptions.map(a => <option key={a.value_key} value={a.value_key}>{a.label}</option>)}
              </select>
              <button style={s.btn} onClick={() => applyAudience(true)} disabled={applying}>Add</button>
              <button style={s.btnSec} onClick={() => applyAudience(false)} disabled={applying}>Remove</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
