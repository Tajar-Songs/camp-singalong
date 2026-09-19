import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

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
  let md = html;

  // FIX: merge adjacent identical inline formatting tags BEFORE converting
  // them to markdown. Without this, <strong>A</strong><strong>B</strong>
  // (two separately-bolded spans sitting next to each other, e.g. from
  // selecting and bolding a label, then separately bolding the text after
  // it) converts independently into "**A****B**" - four consecutive
  // asterisks with no way for any markdown parser to know where one bold
  // span ends and the next begins. This was a real, reproducible cause of
  // corrupted docs (confirmed against this project's Admin Model doc).
  // Repeated until no more merges happen, since 3+ adjacent spans can occur.
  ['strong', 'b', 'em', 'i'].forEach(tag => {
    let prev;
    do {
      prev = md;
      md = md.replace(new RegExp(`</${tag}>\\s*<${tag}[^>]*>`, 'gi'), '');
    } while (prev !== md);
  });

  md = md
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
    // FIX: use [\s\S] instead of . for the bold/italic body match. '.' does
    // not match newlines by default, so a bold span whose ** markers land on
    // different lines (which happens with this project's older docs, a
    // leftover from earlier lossy HTML->MD conversions before the adjacent-tag
    // fix above existed) was left as literal, unconverted "**" characters
    // instead of becoming <strong>. [\s\S] matches any character including
    // newlines, so the pairing now works regardless of line breaks.
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  // FIX: group consecutive list-item lines into ONE <ul> each, done here -
  // before the paragraph/<br> conversion below - using placeholder markers.
  // Previously, "- item1\n- item2" converted each line to its own <li>, then
  // the <br> insertion ran on what was still separate lines, placing a <br>
  // between sibling <li> elements - which broke the "consecutive <li> tags"
  // pattern the old list-wrapping regex needed to find them as one group.
  // Each item ended up wrapped in its own single-item <ul> instead of one
  // shared list. Marking items first and grouping BEFORE <br> insertion
  // fixes this; blank lines between item lines (common in this project's
  // docs) are tolerated by the grouping regex below.
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '@@LI@@$1@@/LI@@');
  html = html.replace(/(?:@@LI@@[\s\S]*?@@\/LI@@\s*\n?)+/g, (block) => {
    const items = [...block.matchAll(/@@LI@@([\s\S]*?)@@\/LI@@/g)].map(m => `<li>${m[1]}</li>`);
    return `<ul>${items.join('')}</ul>`;
  });

  html = html
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '').replace(/<p><br><\/p>/g, '');
  // Clean up: a <ul> shouldn't be trapped inside a stray <p>, and shouldn't
  // have a dangling <br> immediately touching it on either side.
  html = html.replace(/<p>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<\/p>/g, '</ul>');
  html = html.replace(/<br>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<br>/g, '</ul>');
  // Cleanup: strip stray <p> wrapping that lands around headers (harmless to
  // browsers either way, but not clean output).
  html = html.replace(/<p>\s*(<h[123]>)/g, '$1').replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
  return html;
};

export default function Docs() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
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

  // --- Draft autosave state (Piece 1 of version history/publishing work) ---
  // A draft is a private, unpublished snapshot of in-progress edits, stored
  // separately from the real doc so it never overwrites published content.
  // Cleared once the doc is actually published, or explicitly discarded.
  const [currentUserId, setCurrentUserId] = useState(null);
  const [draftStatus, setDraftStatus] = useState(''); // '', 'saving', 'saved'
  const autosaveTimerRef = useRef(null);
  const skipNextAutosaveRef = useRef(false); // set true right after loading a draft/doc, so loading doesn't immediately re-trigger a save
  
  const editorRef = useRef(null);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); loadDocs(); }, []);
  useEffect(() => { if (user) loadDocs(); }, [user, userRoleKeys]); // Reload when roles are known, to get admin-only docs

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setCurrentUserId(userData.id);
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

  const loadDocsRequestId = useRef(0);

  const loadDocs = async () => {
    // Guard against out-of-order responses: if an earlier-fired request
    // resolves after a later one (normal network timing variance), it must
    // not be allowed to overwrite the more current result.
    const thisRequestId = ++loadDocsRequestId.current;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?select=*&order=title.asc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (thisRequestId !== loadDocsRequestId.current) return; // a newer request has since started; discard this one
      if (Array.isArray(data)) {
        const isAdmin = hasAnyRole(userRoleKeys);
        const visibleDocs = isAdmin ? data : data.filter(doc => doc.visibility === 'user');
        setDocs(visibleDocs);
      }
    } catch (error) { console.error('Error loading docs:', error); }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };
  const isAdmin = hasAnyRole(userRoleKeys);
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

  const startEdit = async (doc) => {
    setSelectedDoc(doc);
    setEditMode(true);
    setIsCreatingNew(false);
    skipNextAutosaveRef.current = true;
    setEditTitle(doc.title || '');
    setEditSlug(doc.slug || '');
    // Use markdown if available, otherwise use HTML - but default the EDITOR
    // VIEW to Visual regardless (see logged feedback: visual should be the
    // default for most people). content_md/content_html are both populated
    // either way, so switching modes still works correctly - only the
    // initially-shown tab changes.
    if (doc.content_md) {
      setEditContentMd(doc.content_md);
      setEditContentHtml(markdownToHtml(doc.content_md));
    } else {
      setEditContentHtml(doc.content || '');
      setEditContentMd(htmlToMarkdown(doc.content || ''));
    }
    setEditorMode('wysiwyg');
    setEditFolder(doc.folder || '');
    setEditVisibility(doc.visibility || 'admin');
    setEditTags(doc.tags || []);
    setDraftStatus('');

    // Check for a newer unpublished draft than what's actually live, and
    // offer to restore it rather than silently discarding in-progress work.
    const draft = await findDraft(doc.id);
    if (draft) {
      const draftIsNewer = !doc.updated_at || new Date(draft.updated_at) > new Date(doc.updated_at);
      if (draftIsNewer) {
        const draftTime = new Date(draft.updated_at).toLocaleString();
        if (confirm(`You have unsaved changes from ${draftTime}. Restore them?`)) {
          applyDraft(draft);
        } else {
          await clearDraft(doc.id);
        }
      }
    }
  };

  const startCreate = async () => {
    setSelectedDoc(null);
    setEditMode(true);
    setIsCreatingNew(true);
    skipNextAutosaveRef.current = true;
    setEditTitle('');
    setEditSlug('');
    setEditContentHtml('');
    setEditContentMd('');
    setEditFolder('');
    setEditVisibility('admin');
    setEditTags([]);
    setEditorMode('wysiwyg');
    setDraftStatus('');

    // Same restoration check, for an in-progress new (never-published) doc.
    const draft = await findDraft(null);
    if (draft) {
      const draftTime = new Date(draft.updated_at).toLocaleString();
      if (confirm(`You have an unsaved new document from ${draftTime}. Restore it?`)) {
        applyDraft(draft);
      } else {
        await clearDraft(null);
      }
    }
  };

  const cancelEdit = () => { setEditMode(false); setIsCreatingNew(false); setDraftStatus(''); };
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

  // Renamed from saveDoc: this is "Save & Publish" - it writes the real,
  // live docs row (same as before) and, new in this pass, also writes a
  // content_versions snapshot and clears any pending draft for this doc,
  // since a published save supersedes whatever draft led up to it.
  const savePublish = async () => {
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
          const newDoc = created[0];
          // First publish of a new doc = version 1. No prior version to
          // compare against, but recorded the same way for consistency.
          if (newDoc) {
            await fetch(`${SUPABASE_URL}/rest/v1/content_versions`, {
              method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                table_name: 'docs', record_id: newDoc.id, changed_by: currentUserId,
                content: { title: newDoc.title, slug: newDoc.slug, content: newDoc.content, content_md: newDoc.content_md, folder: newDoc.folder, tags: newDoc.tags }
              })
            });
          }
          await clearDraft(null); // clears the "new doc, no record_id yet" draft
          showMessage('✅ Document created!');
          await loadDocs();
          if (newDoc) { setSelectedDoc(newDoc); setIsCreatingNew(false); setEditMode(false); }
        } else { const error = await res.json(); showMessage(`❌ Error: ${error.message || 'Could not create'}`); }
      } else {
        // Only create a new version if a field that actually counts as
        // "meaningful content" changed (title/slug/content/content_md) -
        // folder/tags/visibility changing alone does not trigger a version,
        // per the platform's Content Versioning design.
        const meaningfulChange =
          selectedDoc.title !== docData.title ||
          selectedDoc.slug !== docData.slug ||
          (selectedDoc.content || '') !== docData.content ||
          (selectedDoc.content_md || '') !== docData.content_md;

        const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${selectedDoc.id}`, {
          method: 'PATCH', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify(docData)
        });
        if (res.ok) {
          if (meaningfulChange) {
            await fetch(`${SUPABASE_URL}/rest/v1/content_versions`, {
              method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                table_name: 'docs', record_id: selectedDoc.id, changed_by: currentUserId,
                content: { title: docData.title, slug: docData.slug, content: docData.content, content_md: docData.content_md, folder: docData.folder, tags: docData.tags }
              })
            });
          }
          await clearDraft(selectedDoc.id);
          showMessage('✅ Saved!'); await loadDocs(); setSelectedDoc({ ...selectedDoc, ...docData }); setEditMode(false);
        }
        else { showMessage('❌ Error saving'); }
      }
    } catch (error) { console.error(error); showMessage('❌ Error saving'); }
    setSaving(false);
  };

  // --- Draft autosave functions ---
  // Drafts capture everything being edited (not just the fields that trigger
  // a real version) - the goal here is "don't lose my in-progress work,"
  // which is a broader concern than "what counts as a meaningful content
  // change" (see content_versions, which only captures title/slug/content/
  // content_md - drafts capture folder/tags/visibility too since losing
  // those mid-edit would still be a real loss of work).
  const currentDraftContent = () => ({
    title: editTitle,
    slug: editSlug,
    content: editorMode === 'wysiwyg' && editorRef.current ? editorRef.current.innerHTML : editContentHtml,
    content_md: editContentMd,
    folder: editFolder,
    visibility: editVisibility,
    tags: editTags
  });

  const saveDraft = async () => {
    if (!currentUserId) return;
    setDraftStatus('saving');
    try {
      const draftRow = {
        table_name: 'docs',
        record_id: isCreatingNew ? null : (selectedDoc?.id || null),
        user_id: currentUserId,
        content: currentDraftContent(),
        updated_at: new Date().toISOString()
      };
      // Upsert on the (table_name, record_id, user_id) unique constraint.
      const res = await fetch(`${SUPABASE_URL}/rest/v1/content_drafts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(draftRow)
      });
      if (res.ok) {
        setDraftStatus('saved');
      } else {
        const errorText = await res.text();
        console.error('Draft save failed:', res.status, errorText);
        setDraftStatus('');
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      setDraftStatus('');
    }
  };

  // Look up the most recent draft for a given record (or, for a new doc,
  // the most recent draft with no record_id yet - see the note above this
  // section about the "one in-progress new doc at a time" assumption).
  const findDraft = async (recordId) => {
    if (!currentUserId) return null;
    try {
      const filter = recordId
        ? `record_id=eq.${recordId}`
        : `record_id=is.null`;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/content_drafts?table_name=eq.docs&${filter}&user_id=eq.${currentUserId}&select=*&order=updated_at.desc&limit=1`,
        { headers: getAuthHeaders(false) }
      );
      const data = await res.json();
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error checking for draft:', error);
      return null;
    }
  };

  const clearDraft = async (recordId) => {
    if (!currentUserId) return;
    try {
      const filter = recordId
        ? `record_id=eq.${recordId}`
        : `record_id=is.null`;
      await fetch(
        `${SUPABASE_URL}/rest/v1/content_drafts?table_name=eq.docs&${filter}&user_id=eq.${currentUserId}`,
        { method: 'DELETE', headers: getAuthHeaders(false) }
      );
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  };

  // Apply a draft's saved content into the editor's live state.
  const applyDraft = (draft) => {
    skipNextAutosaveRef.current = true;
    const c = draft.content || {};
    setEditTitle(c.title || '');
    setEditSlug(c.slug || '');
    setEditContentHtml(c.content || '');
    setEditContentMd(c.content_md || '');
    setEditFolder(c.folder || '');
    setEditVisibility(c.visibility || 'admin');
    setEditTags(c.tags || []);
  };

  // Debounced autosave: writes a draft a few seconds after the person stops
  // making changes, rather than on every keystroke. Skipped once right after
  // a doc/draft is first loaded into the editor, so opening something for
  // editing doesn't immediately count as "a change" and autosave a no-op draft.
  useEffect(() => {
    if (!editMode) return;
    if (skipNextAutosaveRef.current) { skipNextAutosaveRef.current = false; return; }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { saveDraft(); }, 4000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTitle, editSlug, editContentMd, editContentHtml, editFolder, editVisibility, editTags]);

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
    // Fix: min-width 0 lets this grid child shrink below its content's natural
    // width (the CSS grid default is min-width: auto, which is what silently
    // let wide tables push the whole panel past the viewport with no way to
    // reach the cut-off content). This, combined with the table CSS below,
    // means wide content now reflows/wraps to fit instead of overflowing.
    main: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.5rem', minHeight: '70vh', minWidth: 0 },
    label: { display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', fontWeight: '500' },
    formGroup: { marginBottom: '1rem' },
    textarea: { width: '100%', minHeight: '400px', padding: '1rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.875rem', lineHeight: '1.6', resize: 'vertical', outline: 'none' },
    wysiwygEditor: { width: '100%', minHeight: '400px', padding: '1rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, color: '#e2e8f0', fontSize: '1rem', lineHeight: '1.7', outline: 'none' },
    // The editor + its toolbar now share one scrolling container (wysiwygScrollBox)
    // capped at a fixed viewport-relative height, so long content scrolls WITHIN
    // this box instead of growing the whole page. That's what makes the sticky
    // toolbar below actually have something to stick to - position: sticky only
    // works relative to a scrolling ancestor, and previously there wasn't one;
    // the page itself was scrolling past the toolbar instead.
    wysiwygScrollBox: { maxHeight: '65vh', overflowY: 'auto', border: '1px solid #334155', borderRadius: '0.5rem' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    tagRemove: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0', fontSize: '1rem', lineHeight: 1 },
    existingTag: { background: '#1e293b', border: '1px solid #334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.25rem', marginBottom: '0.25rem', color: '#94a3b8' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    editorTab: (active) => ({ padding: '0.5rem 1rem', background: active ? '#22c55e' : '#334155', border: 'none', borderRadius: '0.375rem', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: active ? '600' : '400' }),
    // Sticky WYSIWYG toolbar: stays pinned to the top of the editor panel while
    // scrolling through long content, rather than scrolling away with the text.
    // Stuck to the editor panel (not the page/viewport) per explicit preference -
    // this only matters while actively editing, not while just reading.
    wysiwygToolbar: { display: 'flex', gap: '0.25rem', marginBottom: 0, flexWrap: 'wrap', padding: '0.5rem', background: '#1e293b', borderTopLeftRadius: '0.5rem', borderTopRightRadius: '0.5rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
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
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Save = draft only, private, does not touch the live doc or
                        create a version. Save & Publish = the real save, as before. */}
                    <button style={s.btnSec} onClick={saveDraft} disabled={draftStatus === 'saving'}>{draftStatus === 'saving' ? 'Saving draft...' : 'Save'}</button>
                    <button style={s.btn} onClick={savePublish} disabled={saving}>{saving ? 'Publishing...' : 'Save & Publish'}</button>
                    <button style={s.btnSec} onClick={cancelEdit}>Cancel</button>
                    {!isCreatingNew && <button style={s.btnDanger} onClick={deleteDoc}>Delete</button>}
                    {/* "+ New" while already editing/viewing a doc - previously only
                        available from the sidebar or the view-mode header, not from
                        inside the editor itself. */}
                    <button style={s.btnSec} onClick={startCreate}>+ New</button>
                    {draftStatus === 'saved' && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Draft saved</span>}
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
                      {/* Toolbar + editable area now share one scrolling container
                          (wysiwygScrollBox) so the sticky toolbar has a scrolling
                          ancestor to stick within - see style comment above. */}
                      <div style={s.wysiwygScrollBox}>
                        <div style={s.wysiwygToolbar}>
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
                      </div>
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
                <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #334155', alignItems: 'center' }}>
                  <button style={s.btnSec} onClick={saveDraft} disabled={draftStatus === 'saving'}>{draftStatus === 'saving' ? 'Saving draft...' : 'Save'}</button>
                  <button style={s.btn} onClick={savePublish} disabled={saving}>{saving ? 'Publishing...' : 'Save & Publish'}</button>
                  <button style={s.btnSec} onClick={cancelEdit}>Cancel</button>
                  {draftStatus === 'saved' && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Draft saved</span>}
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

        /* Table fix: previously tables had no styling at all, so a wide table
           (several migrated docs have side-by-side comparison tables) rendered
           at its natural width and pushed past the container with no
           scrollbar to reach the cut-off content. table-layout: fixed forces
           columns to share the available width instead of growing to fit
           their content, and word-wrap/overflow-wrap let long cell text wrap
           onto multiple lines rather than forcing the column wider. Net
           effect: tables now reflow to fit the screen, matching "responsive
           by default" from Design Principles, instead of requiring a
           horizontal scrollbar. */
        .doc-content table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin: 1rem 0;
        }
        .doc-content th, .doc-content td {
          border: 1px solid #334155;
          padding: 0.5rem 0.75rem;
          text-align: left;
          word-wrap: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
        }
        .doc-content th {
          background: #1e293b;
          font-weight: bold;
          color: #fff;
        }
        .doc-content td {
          color: #e2e8f0;
        }
        /* General safety net: anything else that could still overflow (a very
           long unbroken URL or code string with no natural break point) wraps
           instead of pushing the layout wider. This is a fallback, not the
           primary fix - tables above are handled specifically so they reflow
           column-by-column rather than just wrapping as one wide block. */
        .doc-content {
          overflow-wrap: break-word;
          word-wrap: break-word;
        }
        .doc-content pre, .doc-content code {
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
      `}</style>
    </div>
  );
}
