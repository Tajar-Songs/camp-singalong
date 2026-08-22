import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Simple markdown to HTML converter
const markdownToHtml = (md) => {
  if (!md) return '';
  let html = md
    // Headers (must come before other replacements)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Ordered lists  
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines to <br>
    .replace(/\n/g, '<br>');
  
  // Wrap in paragraph
  html = '<p>' + html + '</p>';
  
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '').replace(/<p><br><\/p>/g, '');
  
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
  
  return html;
};

export default function Docs() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  
  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editorMode, setEditorMode] = useState('markdown');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Form state
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [editVisibility, setEditVisibility] = useState('admin');
  const [editTags, setEditTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (user) loadDocs(); }, [user, userProfile]);

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

  const loadDocs = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?select=*&order=title.asc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data)) {
        const isAdmin = userProfile?.role === 'admin';
        const visibleDocs = isAdmin ? data : data.filter(doc => doc.visibility === 'user');
        setDocs(visibleDocs);
      }
    } catch (error) { console.error('Error loading docs:', error); }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };
  const isAdmin = userProfile?.role === 'admin';
  const folders = [...new Set(docs.map(d => d.folder).filter(f => f))].sort();
  
  const allExistingTags = useMemo(() => {
    const tagSet = new Set();
    docs.forEach(doc => { if (doc.tags) doc.tags.forEach(t => tagSet.add(t)); });
    return [...tagSet].sort();
  }, [docs]);

  const filteredDocs = docs.filter(doc => {
    if (folderFilter && doc.folder !== folderFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const matchTitle = doc.title?.toLowerCase().includes(s);
      const matchContent = (doc.content_md || doc.content)?.toLowerCase().includes(s);
      const matchTags = doc.tags?.some(t => t.toLowerCase().includes(s));
      if (!matchTitle && !matchContent && !matchTags) return false;
    }
    return true;
  });

  const docsByFolder = {};
  filteredDocs.forEach(doc => {
    const folder = doc.folder || 'Uncategorized';
    if (!docsByFolder[folder]) docsByFolder[folder] = [];
    docsByFolder[folder].push(doc);
  });

  const generateSlug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const startEdit = (doc) => {
    setSelectedDoc(doc);
    setEditMode(true);
    setIsCreatingNew(false);
    setEditTitle(doc.title || '');
    setEditSlug(doc.slug || '');
    setEditContent(doc.content_md || doc.content || '');
    setEditFolder(doc.folder || '');
    setEditVisibility(doc.visibility || 'admin');
    setEditTags(doc.tags || []);
    setEditorMode('markdown');
  };

  const startCreate = () => {
    setSelectedDoc(null);
    setEditMode(true);
    setIsCreatingNew(true);
    setEditTitle('');
    setEditSlug('');
    setEditContent('');
    setEditFolder('');
    setEditVisibility('admin');
    setEditTags([]);
    setEditorMode('markdown');
  };

  const cancelEdit = () => { setEditMode(false); setIsCreatingNew(false); };
  const viewDoc = (doc) => { setSelectedDoc(doc); setEditMode(false); setIsCreatingNew(false); };
  const addTag = (tag) => { const t = tag.trim().toLowerCase(); if (t && !editTags.includes(t)) setEditTags([...editTags, t]); setTagInput(''); };
  const removeTag = (tag) => { setEditTags(editTags.filter(t => t !== tag)); };

  const saveDoc = async () => {
    if (!editTitle.trim()) { showMessage('❌ Title is required'); return; }
    if (!editSlug.trim()) { showMessage('❌ Slug is required'); return; }
    setSaving(true);
    try {
      const docData = {
        title: editTitle.trim(),
        slug: editSlug.trim(),
        content_md: editContent,
        content: markdownToHtml(editContent),
        visibility: editVisibility,
        folder: editFolder.trim() || null,
        tags: editTags,
        updated_at: new Date().toISOString(),
        updated_by: userProfile?.display_name || user?.email || 'unknown'
      };
      if (isCreatingNew) {
        docData.created_by = userProfile?.display_name || user?.email || 'unknown';
        const res = await fetch(`${SUPABASE_URL}/rest/v1/docs`, {
          method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(docData)
        });
        if (res.ok) {
          const created = await res.json();
          showMessage('✅ Document created!');
          await loadDocs();
          if (created[0]) { setSelectedDoc(created[0]); setIsCreatingNew(false); }
        } else { const error = await res.json(); showMessage(`❌ Error: ${error.message || 'Could not create'}`); }
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${selectedDoc.id}`, {
          method: 'PATCH', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify(docData)
        });
        if (res.ok) { showMessage('✅ Saved!'); await loadDocs(); setSelectedDoc({ ...selectedDoc, ...docData }); }
        else { showMessage('❌ Error saving'); }
      }
    } catch (error) { console.error(error); showMessage('❌ Error saving'); }
    setSaving(false);
  };

  const deleteDoc = async () => {
    if (!confirm(`Delete "${selectedDoc.title}"?`)) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${selectedDoc.id}`, { method: 'DELETE', headers: getAuthHeaders(false) });
      showMessage('✅ Deleted');
      setSelectedDoc(null);
      setEditMode(false);
      await loadDocs();
    } catch (error) { showMessage('❌ Error deleting'); }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '2rem', display: 'grid', gridTemplateColumns: selectedDoc || isCreatingNew ? '280px 1fr' : '1fr', gap: '2rem' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
    title: { fontSize: '1.5rem', fontWeight: 'bold' },
    input: { width: '100%', padding: '0.75rem 1rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', marginBottom: '0.75rem', outline: 'none' },
    select: { width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', marginBottom: '1rem' },
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' },
    btnDanger: { background: '#dc2626', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' },
    btnSmall: { background: '#334155', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', overflow: 'hidden' },
    docList: { maxHeight: '60vh', overflowY: 'auto' },
    docItem: (active) => ({ padding: '0.75rem 1rem', borderBottom: '1px solid #334155', cursor: 'pointer', background: active ? '#22c55e22' : 'transparent', borderLeft: active ? '3px solid #22c55e' : '3px solid transparent' }),
    folderHeader: { padding: '0.75rem 1rem', background: '#0f172a', fontWeight: 'bold', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
    main: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.5rem', minHeight: '70vh' },
    label: { display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', fontWeight: '500' },
    formGroup: { marginBottom: '1rem' },
    textarea: { width: '100%', minHeight: '400px', padding: '1rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.875rem', lineHeight: '1.6', resize: 'vertical', outline: 'none' },
    preview: { padding: '1rem', background: '#0f172a', borderRadius: '0.5rem', minHeight: '400px', lineHeight: '1.7' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    tagRemove: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0', fontSize: '1rem', lineHeight: 1 },
    existingTag: { background: '#1e293b', border: '1px solid #334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.25rem', marginBottom: '0.25rem', color: '#94a3b8' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    editorTab: (active) => ({ padding: '0.5rem 1rem', background: active ? '#334155' : 'transparent', border: '1px solid #334155', borderRadius: '0.375rem', color: active ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }),
  };

  if (loading) return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

  if (!user) return (
    <div style={{ ...s.container, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
      <div style={{ fontSize: '3rem' }}>📚</div>
      <h1 style={{ fontSize: '1.5rem' }}>Documentation</h1>
      <p style={{ color: '#94a3b8' }}>Please log in to view documentation.</p>
      <Link href="/" style={{ ...s.btn, textDecoration: 'none' }}>Go to Login</Link>
    </div>
  );

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      <div style={s.wrapper}>
        {/* Sidebar */}
        <div>
          <div style={s.header}>
            <h1 style={s.title}>📚 Docs</h1>
            {isAdmin && !editMode && <button style={s.btn} onClick={startCreate}>+ New</button>}
          </div>
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={s.input} />
          {folders.length > 0 && (
            <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} style={s.select}>
              <option value="">All Folders</option>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          <div style={s.card}>
            <div style={s.docList}>
              {Object.entries(docsByFolder).map(([folder, folderDocs]) => (
                <div key={folder}>
                  <div style={s.folderHeader}>📁 {folder}</div>
                  {folderDocs.map(doc => (
                    <div key={doc.id} onClick={() => viewDoc(doc)} style={s.docItem(selectedDoc?.id === doc.id && !editMode)}>
                      <div style={{ fontWeight: '500' }}>{doc.title}</div>
                      {doc.tags?.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                          {doc.tags.slice(0, 3).map(tag => <span key={tag} style={{ background: '#334155', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', marginRight: '0.25rem' }}>{tag}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {filteredDocs.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No docs found</div>}
            </div>
          </div>
        </div>

        {/* Main Content */}
        {(selectedDoc || isCreatingNew) && (
          <div style={s.main}>
            {editMode ? (
              <>
                {/* Top toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #334155', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{isCreatingNew ? '📝 New Document' : `📝 Editing: ${editTitle}`}</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button style={s.btn} onClick={saveDoc} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button style={s.btnSec} onClick={cancelEdit}>Cancel</button>
                    {!isCreatingNew && <button style={s.btnDanger} onClick={deleteDoc}>Delete</button>}
                  </div>
                </div>

                {/* Title & Slug */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                  <div style={s.formGroup}>
                    <label style={s.label}>Title *</label>
                    <input type="text" value={editTitle} onChange={(e) => { setEditTitle(e.target.value); if (isCreatingNew) setEditSlug(generateSlug(e.target.value)); }} style={{ ...s.input, marginBottom: 0 }} placeholder="Document title" />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Slug *</label>
                    <input type="text" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} style={{ ...s.input, marginBottom: 0 }} placeholder="url-friendly-slug" />
                  </div>
                </div>

                {/* Folder & Visibility */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={s.formGroup}>
                    <label style={s.label}>Folder</label>
                    <input type="text" value={editFolder} onChange={(e) => setEditFolder(e.target.value)} style={{ ...s.input, marginBottom: 0 }} placeholder="e.g. Getting Started" list="doc-folders-list" />
                    <datalist id="doc-folders-list">{folders.map(f => <option key={f} value={f} />)}</datalist>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Visibility</label>
                    <select value={editVisibility} onChange={(e) => setEditVisibility(e.target.value)} style={{ ...s.select, marginBottom: 0 }}>
                      <option value="admin">🔒 Admin Only</option>
                      <option value="user">👤 All Users</option>
                    </select>
                  </div>
                </div>

                {/* Tags */}
                <div style={s.formGroup}>
                  <label style={s.label}>Tags</label>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {editTags.map(tag => <span key={tag} style={s.tag}>{tag}<button style={s.tagRemove} onClick={() => removeTag(tag)}>×</button></span>)}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }} style={{ ...s.input, marginBottom: 0, flex: 1 }} placeholder="Add tag and press Enter" />
                    <button style={s.btnSmall} onClick={() => addTag(tagInput)}>Add</button>
                  </div>
                  {allExistingTags.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem' }}>Existing tags (click to add):</div>
                      <div>{allExistingTags.filter(t => !editTags.includes(t)).map(tag => <button key={tag} style={s.existingTag} onClick={() => addTag(tag)}>{tag}</button>)}</div>
                    </div>
                  )}
                </div>

                {/* Content Editor */}
                <div style={s.formGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={s.label}>Content (Markdown)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button style={s.editorTab(editorMode === 'markdown')} onClick={() => setEditorMode('markdown')}>Edit</button>
                      <button style={s.editorTab(editorMode === 'preview')} onClick={() => setEditorMode('preview')}>Preview</button>
                      <button style={s.editorTab(editorMode === 'split')} onClick={() => setEditorMode('split')}>Split</button>
                    </div>
                  </div>
                  
                  {editorMode === 'markdown' && (
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={s.textarea} placeholder="Write your content in markdown...

# Heading 1
## Heading 2
### Heading 3

**bold** or __bold__
*italic* or _italic_

- List item
- Another item

1. Numbered item
2. Another item

[Link text](url)
\`inline code\`" />
                  )}
                  
                  {editorMode === 'preview' && (
                    <div style={s.preview} className="doc-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(editContent) || '<p style="color:#64748b">Nothing to preview</p>' }} />
                  )}
                  
                  {editorMode === 'split' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ ...s.textarea, minHeight: '300px' }} placeholder="Write markdown here..." />
                      <div style={{ ...s.preview, minHeight: '300px', overflow: 'auto' }} className="doc-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(editContent) || '<p style="color:#64748b">Preview</p>' }} />
                    </div>
                  )}
                </div>

                {/* Bottom save */}
                <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                  <button style={s.btn} onClick={saveDoc} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                  <button style={s.btnSec} onClick={cancelEdit}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #334155' }}>
                  <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{selectedDoc.title}</h1>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {selectedDoc.folder && <span>📁 {selectedDoc.folder} • </span>}
                      Updated {new Date(selectedDoc.updated_at || selectedDoc.created_at).toLocaleDateString()}
                      {selectedDoc.visibility === 'admin' && <span style={{ marginLeft: '0.5rem', background: '#f59e0b33', color: '#f59e0b', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>Admin Only</span>}
                    </div>
                    {selectedDoc.tags?.length > 0 && <div style={{ marginTop: '0.5rem' }}>{selectedDoc.tags.map(tag => <span key={tag} style={s.tag}>{tag}</span>)}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {isAdmin && <button style={s.btn} onClick={() => startEdit(selectedDoc)}>✏️ Edit</button>}
                    <button style={s.btnSec} onClick={() => setSelectedDoc(null)}>×</button>
                  </div>
                </div>
                <div className="doc-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(selectedDoc.content_md) || selectedDoc.content || '<p>No content yet.</p>' }} style={{ lineHeight: '1.7' }} />
              </>
            )}
          </div>
        )}

        {!selectedDoc && !isCreatingNew && (
          <div style={{ ...s.main, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748b' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📖</div>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Select a document</div>
            <div>Choose a document from the list to view it</div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .doc-content h1 { font-size: 1.75rem; font-weight: bold; margin: 1.5rem 0 0.75rem 0; color: #fff; }
        .doc-content h2 { font-size: 1.5rem; font-weight: bold; margin: 1.5rem 0 0.75rem 0; color: #fff; }
        .doc-content h3 { font-size: 1.25rem; font-weight: bold; margin: 1.25rem 0 0.5rem 0; color: #fff; }
        .doc-content p { margin: 0.75rem 0; color: #e2e8f0; }
        .doc-content ul, .doc-content ol { margin: 0.75rem 0; padding-left: 1.5rem; color: #e2e8f0; }
        .doc-content li { margin: 0.25rem 0; }
        .doc-content a { color: #22c55e; text-decoration: underline; }
        .doc-content a:hover { color: #4ade80; }
        .doc-content strong, .doc-content b { font-weight: bold; }
        .doc-content em, .doc-content i { font-style: italic; }
        .doc-content code { background: #334155; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace; }
      `}</style>
    </div>
  );
}
