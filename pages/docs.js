import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Clean up messy HTML (strip inline styles, normalize tags)
const cleanHtml = (html) => {
  if (!html) return '';
  return html
    // Remove inline styles
    .replace(/\s*style="[^"]*"/gi, '')
    // Remove empty tags
    .replace(/<(\w+)[^>]*>\s*<\/\1>/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Clean up br tags
    .replace(/<br\s*\/?>/gi, '<br>')
    .trim();
};

// Convert HTML to simple markdown
const htmlToMarkdown = (html) => {
  if (!html) return '';
  let md = html
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    // Bold
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    // Italic
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Line breaks and paragraphs
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return md;
};

// Simple markdown to HTML converter
const markdownToHtml = (md) => {
  if (!md) return '';
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '').replace(/<p><br><\/p>/g, '');
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
  
  const [editMode, setEditMode] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editorMode, setEditorMode] = useState('wysiwyg'); // 'wysiwyg', 'markdown', 'code'
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editContentHtml, setEditContentHtml] = useState(''); // HTML content
  const [editContentMd, setEditContentMd] = useState(''); // Markdown content
  const [editFolder, setEditFolder] = useState('');
  const [editVisibility, setEditVisibility] = useState('admin');
  const [editTags, setEditTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  
  const editorRef = useRef(null);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); loadDocs(); }, []);
  useEffect(() => { if (user) loadDocs(); }, [user, userProfile]); // Reload when user changes to get admin-only docs

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
    // Use markdown if available, otherwise use HTML
    if (doc.content_md) {
      setEditContentMd(doc.content_md);
      setEditContentHtml(markdownToHtml(doc.content_md));
      setEditorMode('markdown');
    } else {
      setEditContentHtml(doc.content || '');
      setEditContentMd(htmlToMarkdown(doc.content || ''));
      setEditorMode('wysiwyg');
    }
    setEditFolder(doc.folder || '');
    setEditVisibility(doc.visibility || 'admin');
    setEditTags(doc.tags || []);
  };

  const startCreate = () => {
    setSelectedDoc(null);
    setEditMode(true);
    setIsCreatingNew(true);
    setEditTitle('');
    setEditSlug('');
    setEditContentHtml('');
    setEditContentMd('');
    setEditFolder('');
    setEditVisibility('admin');
    setEditTags([]);
    setEditorMode('wysiwyg');
  };

  const cancelEdit = () => { setEditMode(false); setIsCreatingNew(false); };
  const viewDoc = (doc) => { setSelectedDoc(doc); setEditMode(false); setIsCreatingNew(false); };
  const addTag = (tag) => { const t = tag.trim().toLowerCase(); if (t && !editTags.includes(t)) setEditTags([...editTags, t]); setTagInput(''); };
  const removeTag = (tag) => { setEditTags(editTags.filter(t => t !== tag)); };

  // Sync content when switching modes
  const switchEditorMode = (newMode) => {
    // Save current content first
    if (editorMode === 'wysiwyg' && editorRef.current) {
      setEditContentHtml(editorRef.current.innerHTML);
    }
    
    if (newMode === 'markdown' && editorMode !== 'markdown') {
      // Convert HTML to markdown
      const html = editorMode === 'wysiwyg' && editorRef.current ? editorRef.current.innerHTML : editContentHtml;
      setEditContentMd(htmlToMarkdown(html));
    } else if (newMode === 'wysiwyg' && editorMode === 'markdown') {
      // Convert markdown to HTML
      setEditContentHtml(markdownToHtml(editContentMd));
    } else if (newMode === 'code' && editorMode === 'markdown') {
      // Convert markdown to HTML for code view
      setEditContentHtml(markdownToHtml(editContentMd));
    }
    
    setEditorMode(newMode);
  };

  // WYSIWYG toolbar commands
  const execCommand = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) execCommand('createLink', url);
  };

  const saveDoc = async () => {
    if (!editTitle.trim()) { showMessage('❌ Title is required'); return; }
    if (!editSlug.trim()) { showMessage('❌ Slug is required'); return; }
    
    // Get final content based on current mode
    let finalHtml = editContentHtml;
    let finalMd = editContentMd;
    
    if (editorMode === 'wysiwyg' && editorRef.current) {
      finalHtml = cleanHtml(editorRef.current.innerHTML);
      finalMd = htmlToMarkdown(finalHtml);
    } else if (editorMode === 'markdown') {
      finalHtml = markdownToHtml(editContentMd);
      finalMd = editContentMd;
    } else if (editorMode === 'code') {
      finalHtml = cleanHtml(editContentHtml);
      finalMd = htmlToMarkdown(finalHtml);
    }
    
    setSaving(true);
    try {
      const docData = {
        title: editTitle.trim(),
        slug: editSlug.trim(),
        content_md: finalMd,
        content: finalHtml,
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
          if (created[0]) { setSelectedDoc(created[0]); setIsCreatingNew(false); setEditMode(false); }
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
    toolbarBtn: { padding: '0.375rem 0.625rem', background: '#334155', border: 'none', borderRadius: '0.25rem', color: '#fff', cursor: 'pointer', fontSize: '0.875rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', overflow: 'hidden' },
    docList: { maxHeight: '60vh', overflowY: 'auto' },
    docItem: (active) => ({ padding: '0.75rem 1rem', borderBottom: '1px solid #334155', cursor: 'pointer', background: active ? '#22c55e22' : 'transparent', borderLeft: active ? '3px solid #22c55e' : '3px solid transparent' }),
    folderHeader: { padding: '0.75rem 1rem', background: '#0f172a', fontWeight: 'bold', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
    main: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.5rem', minHeight: '70vh' },
    label: { display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', fontWeight: '500' },
    formGroup: { marginBottom: '1rem' },
    textarea: { width: '100%', minHeight: '400px', padding: '1rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.875rem', lineHeight: '1.6', resize: 'vertical', outline: 'none' },
    wysiwygEditor: { width: '100%', minHeight: '400px', padding: '1rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0', fontSize: '1rem', lineHeight: '1.7', outline: 'none', overflow: 'auto' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    tagRemove: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0', fontSize: '1rem', lineHeight: 1 },
    existingTag: { background: '#1e293b', border: '1px solid #334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.25rem', marginBottom: '0.25rem', color: '#94a3b8' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    editorTab: (active) => ({ padding: '0.5rem 1rem', background: active ? '#22c55e' : '#334155', border: 'none', borderRadius: '0.375rem', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: active ? '600' : '400' }),
  };

  if (loading) return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

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
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{isCreatingNew ? '📝 New Document' : '📝 Editing'}</h2>
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
                  {allExistingTags.filter(t => !editTags.includes(t)).length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem' }}>Existing tags:</div>
                      <div>{allExistingTags.filter(t => !editTags.includes(t)).map(tag => <button key={tag} style={s.existingTag} onClick={() => addTag(tag)}>{tag}</button>)}</div>
                    </div>
                  )}
                </div>

                {/* Content Editor */}
                <div style={s.formGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={s.label}>Content</label>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button style={s.editorTab(editorMode === 'wysiwyg')} onClick={() => switchEditorMode('wysiwyg')}>Visual</button>
                      <button style={s.editorTab(editorMode === 'markdown')} onClick={() => switchEditorMode('markdown')}>Markdown</button>
                      <button style={s.editorTab(editorMode === 'code')} onClick={() => switchEditorMode('code')}>HTML</button>
                    </div>
                  </div>
                  
                  {editorMode === 'wysiwyg' && (
                    <>
                      {/* WYSIWYG Toolbar */}
                      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap', padding: '0.5rem', background: '#1e293b', borderRadius: '0.375rem' }}>
                        <button style={s.toolbarBtn} onClick={() => execCommand('bold')} title="Bold"><b>B</b></button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('italic')} title="Italic"><i>I</i></button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('underline')} title="Underline"><u>U</u></button>
                        <span style={{ borderLeft: '1px solid #475569', margin: '0 0.25rem' }}></span>
                        <button style={s.toolbarBtn} onClick={() => execCommand('formatBlock', 'h1')} title="Heading 1">H1</button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('formatBlock', 'h2')} title="Heading 2">H2</button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('formatBlock', 'h3')} title="Heading 3">H3</button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('formatBlock', 'p')} title="Paragraph">P</button>
                        <span style={{ borderLeft: '1px solid #475569', margin: '0 0.25rem' }}></span>
                        <button style={s.toolbarBtn} onClick={() => execCommand('insertUnorderedList')} title="Bullet List">• List</button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('insertOrderedList')} title="Numbered List">1. List</button>
                        <span style={{ borderLeft: '1px solid #475569', margin: '0 0.25rem' }}></span>
                        <button style={s.toolbarBtn} onClick={insertLink} title="Insert Link">🔗 Link</button>
                        <button style={s.toolbarBtn} onClick={() => execCommand('removeFormat')} title="Clear Formatting">✖ Clear</button>
                      </div>
                      <div
                        ref={editorRef}
                        contentEditable
                        style={s.wysiwygEditor}
                        className="doc-content"
                        dangerouslySetInnerHTML={{ __html: editContentHtml }}
                        onBlur={() => setEditContentHtml(editorRef.current?.innerHTML || '')}
                      />
                    </>
                  )}
                  
                  {editorMode === 'markdown' && (
                    <textarea 
                      value={editContentMd} 
                      onChange={(e) => setEditContentMd(e.target.value)} 
                      style={s.textarea} 
                      placeholder="# Heading&#10;&#10;Regular paragraph text.&#10;&#10;**bold** and *italic*&#10;&#10;- List item&#10;- Another item&#10;&#10;[Link text](url)" 
                    />
                  )}
                  
                  {editorMode === 'code' && (
                    <textarea 
                      value={editContentHtml} 
                      onChange={(e) => setEditContentHtml(e.target.value)} 
                      style={{ ...s.textarea, fontFamily: 'monospace', fontSize: '0.8rem' }} 
                      placeholder="<h1>Heading</h1>&#10;<p>Paragraph text</p>" 
                    />
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
                    {isAdmin && <button style={s.btnSec} onClick={startCreate}>+ New</button>}
                    <button style={s.btnSec} onClick={() => setSelectedDoc(null)}>×</button>
                  </div>
                </div>
                <div className="doc-content" dangerouslySetInnerHTML={{ __html: selectedDoc.content || '<p>No content yet.</p>' }} style={{ lineHeight: '1.7' }} />
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
        .doc-content strong, .doc-content b { font-weight: bold; color: #fff; }
        .doc-content em, .doc-content i { font-style: italic; }
        .doc-content code { background: #334155; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace; }
      `}</style>
    </div>
  );
}
