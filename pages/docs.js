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

// --- Word-level diff (LCS-based) ---
// Tokenizes into runs of non-whitespace and runs of whitespace, so spacing
// reconstructs exactly, then finds the longest common subsequence of tokens
// between old and new text. Anything not part of that shared subsequence is
// either a removal (only in old) or an addition (only in new). Chosen over a
// character-level diff because word-level is what's actually readable to a
// person reviewing "what changed" in prose - it's also the closest analog to
// how a lawyer's redline works, which is explicitly what this feature is
// meant to approximate for lyrics/doc-text changes.
const tokenizeForDiff = (text) => (text || '').match(/\S+|\s+/g) || [];

const diffTokens = (oldText, newText) => {
  const a = tokenizeForDiff(oldText);
  const b = tokenizeForDiff(newText);
  const n = a.length, m = b.length;
  // LCS length table
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  // Backtrack to build the segment sequence
  const segments = [];
  let i = 0, j = 0;
  const push = (type, text) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) { last.text += text; } else { segments.push({ type, text }); }
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push('removed', a[i]); i++; }
    else { push('added', b[j]); j++; }
  }
  while (i < n) { push('removed', a[i]); i++; }
  while (j < m) { push('added', b[j]); j++; }
  return segments;
};

// --- Rendered markdown diff (line-level structure + word-level detail) ---
// A pure word-level diff across the whole text can place a highlighted span
// across a structural boundary (e.g. a whole new list item), which breaks
// markdownToHtml's regex-based list/header detection and produces malformed,
// overlapping HTML - tested and confirmed during development. The fix: diff
// at the LINE level first, so unchanged structural lines (list items,
// headers) are never touched at all; only within a single replaced line is
// word-level diffing applied, with any markdown structural prefix (list
// marker, header hashes) stripped before diffing and re-attached unmarked
// afterward, so it's always recognized correctly regardless of what's
// highlighted within the line.

const lineLCS = (oldLines, newLines) => {
  const n = oldLines.length, m = newLines.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) { ops.push({ type: 'same', line: oldLines[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ type: 'del', line: oldLines[i] }); i++; }
    else { ops.push({ type: 'ins', line: newLines[j] }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', line: oldLines[i] }); i++; }
  while (j < m) { ops.push({ type: 'ins', line: newLines[j] }); j++; }
  return ops;
};

// Coalesce raw line ops: a run of deletions immediately followed by a run of
// insertions is a "replace" block (a line that was edited, worth word-diffing);
// a del or ins run with no adjacent partner is a pure removal/addition.
const coalesceLineOps = (ops) => {
  const blocks = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'same') {
      const lines = [];
      while (i < ops.length && ops[i].type === 'same') { lines.push(ops[i].line); i++; }
      blocks.push({ type: 'same', lines });
    } else {
      const delLines = [];
      while (i < ops.length && ops[i].type === 'del') { delLines.push(ops[i].line); i++; }
      const insLines = [];
      while (i < ops.length && ops[i].type === 'ins') { insLines.push(ops[i].line); i++; }
      if (delLines.length && insLines.length) blocks.push({ type: 'replace', oldLines: delLines, newLines: insLines });
      else if (delLines.length) blocks.push({ type: 'removed', lines: delLines });
      else blocks.push({ type: 'added', lines: insLines });
    }
  }
  return blocks;
};

// Strip a leading list marker or header prefix from a line, so it can be
// re-attached unmarked - structural regexes must see it at the true start
// of the line regardless of what's highlighted in the rest of the line.
const splitMarkdownPrefix = (line) => {
  const m = line.match(/^(\s*(?:[-*]\s+|#{1,3}\s+))(.*)$/);
  return m ? [m[1], m[2]] : ['', line];
};

const buildDiffMarkdown = (segments) => segments.map(seg => {
  if (seg.type === 'same') return seg.text;
  if (seg.type === 'added') return `@@DIFFADD@@${seg.text}@@/DIFFADD@@`;
  return `@@DIFFDEL@@${seg.text}@@/DIFFDEL@@`;
}).join('');

const applyDiffStyling = (html) => html
  .replace(/@@DIFFADD@@/g, '<span class="diff-added">')
  .replace(/@@\/DIFFADD@@/g, '</span>')
  .replace(/@@DIFFDEL@@/g, '<span class="diff-removed">')
  .replace(/@@\/DIFFDEL@@/g, '</span>');

// The main entry point: takes two markdown strings, returns fully-rendered,
// diff-highlighted HTML (via the existing markdownToHtml pipeline), safe to
// drop into dangerouslySetInnerHTML alongside the .doc-content styles.
const renderMarkdownDiff = (oldMd, newMd) => {
  const oldLines = (oldMd || '').split('\n');
  const newLines = (newMd || '').split('\n');
  const blocks = coalesceLineOps(lineLCS(oldLines, newLines));

  const outputLines = [];
  for (const block of blocks) {
    if (block.type === 'same') {
      outputLines.push(...block.lines);
    } else if (block.type === 'replace') {
      if (block.oldLines.length === 1 && block.newLines.length === 1) {
        const [, oldRest] = splitMarkdownPrefix(block.oldLines[0]);
        const [newPrefix, newRest] = splitMarkdownPrefix(block.newLines[0]);
        outputLines.push(newPrefix + buildDiffMarkdown(diffTokens(oldRest, newRest)));
      } else {
        outputLines.push(buildDiffMarkdown(diffTokens(block.oldLines.join('\n'), block.newLines.join('\n'))));
      }
    } else if (block.type === 'removed') {
      block.lines.forEach(line => {
        const [prefix, rest] = splitMarkdownPrefix(line);
        outputLines.push(`${prefix}@@DIFFDEL@@${rest}@@/DIFFDEL@@`);
      });
    } else if (block.type === 'added') {
      block.lines.forEach(line => {
        const [prefix, rest] = splitMarkdownPrefix(line);
        outputLines.push(`${prefix}@@DIFFADD@@${rest}@@/DIFFADD@@`);
      });
    }
  }
  return applyDiffStyling(markdownToHtml(outputLines.join('\n')));
};

// Simple added/removed set comparison for list-shaped fields (tags), where
// word-level diffing inside a comma-joined string wouldn't read cleanly.
const diffTags = (oldTags, newTags) => {
  const oldSet = new Set(oldTags || []);
  const newSet = new Set(newTags || []);
  return {
    removed: (oldTags || []).filter(t => !newSet.has(t)),
    added: (newTags || []).filter(t => !oldSet.has(t)),
    unchanged: (oldTags || []).filter(t => newSet.has(t))
  };
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

  // --- Organize panel state (folder/tags/visibility/audience) ---
  // Pulled out of the content editor entirely - these are organizational
  // metadata, not content, and are edited/saved independently. For an
  // existing doc, saving here writes straight to the database immediately
  // (no draft, no publish step). For a not-yet-published new doc, this same
  // state just rides along in the autosaved draft (see currentDraftContent)
  // until first publish applies it for real - there's no live doc row to
  // write to yet, so there's nothing else it could do in the meantime.
  const [showOrganize, setShowOrganize] = useState(false);
  const [orgFolder, setOrgFolder] = useState('');
  const [orgVisibility, setOrgVisibility] = useState('admin');
  const [orgTags, setOrgTags] = useState([]);
  const [orgTagInput, setOrgTagInput] = useState('');
  const [orgAudienceKeys, setOrgAudienceKeys] = useState([]);
  const [docAudienceOptions, setDocAudienceOptions] = useState([]); // option_lists rows, list_key='doc_audiences'
  const [savingOrganize, setSavingOrganize] = useState(false);

  // --- Draft autosave state (Piece 1 of version history/publishing work) ---
  // A draft is a private, unpublished snapshot of in-progress edits, stored
  // separately from the real doc so it never overwrites published content.
  // Cleared once the doc is actually published, or explicitly discarded.
  const [currentUserId, setCurrentUserId] = useState(null);
  const [draftStatus, setDraftStatus] = useState(''); // '', 'saving', 'saved'
  const [showDrafts, setShowDrafts] = useState(false); // toggles the sidebar list between Published and Drafts
  const [userDrafts, setUserDrafts] = useState([]);
  // --- Version history state (Piece 3) ---
  const [showHistory, setShowHistory] = useState(false);
  const [docVersions, setDocVersions] = useState([]);
  const [versionAuthors, setVersionAuthors] = useState({}); // user_id -> display name, only for authors actually seen in a version list
  // --- Diff/comparison state ---
  const [compareSelection, setCompareSelection] = useState([]); // up to 2 version ids being compared
  const [showDiff, setShowDiff] = useState(false);
  const [diffMode, setDiffMode] = useState('wysiwyg'); // 'wysiwyg' | 'markdown' | 'code' - mirrors the editor's tab order/preference
  const autosaveTimerRef = useRef(null);
  const skipNextAutosaveRef = useRef(false); // set true right after loading a draft/doc, so loading doesn't immediately re-trigger a save
  // Stable client-generated id for a new, not-yet-published doc's draft.
  // Necessary because content_drafts' uniqueness (table_name, record_id,
  // user_id) can't rely on record_id being null while unpublished - Postgres
  // treats every NULL as distinct from every other NULL in a unique
  // constraint, so every autosave with record_id=null would insert a brand
  // new row instead of updating the same one (confirmed: this is exactly
  // what caused duplicate drafts to appear during testing). Using a stable
  // pending UUID instead of null means the constraint actually works while
  // a new doc is still unpublished.
  const pendingNewDocIdRef = useRef(null);
  
  const editorRef = useRef(null);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); loadDocs(); loadAudienceOptions(); }, []);
  useEffect(() => { if (user) loadDocs(); }, [user, userRoleKeys]); // Reload when roles are known, to get admin-only docs
  useEffect(() => { if (currentUserId) loadUserDrafts(); }, [currentUserId]); // populate the Drafts count badge as soon as we know who's logged in

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
    resetHistoryView();
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

  // Note: no longer async, and no longer auto-checks for a prior in-progress
  // new-doc draft - now that the Drafts sidebar toggle exists and can show
  // ALL in-progress new docs (not just the single most recent one, which is
  // all the old single-draft check here could ever find), "+ New" always
  // starts genuinely blank. Picking up an unfinished new doc now happens via
  // the Drafts list instead.
  const startCreate = () => {
    setSelectedDoc(null);
    setEditMode(true);
    setIsCreatingNew(true);
    resetHistoryView();
    skipNextAutosaveRef.current = true;
    // Fresh pending id for this new, unpublished doc's drafts - see the
    // comment on pendingNewDocIdRef above for why this can't be null.
    pendingNewDocIdRef.current = crypto.randomUUID();
    setEditTitle('');
    setEditSlug('');
    setEditContentHtml('');
    setEditContentMd('');
    setEditorMode('wysiwyg');
    setDraftStatus('');
    // Org fields for THIS new doc reset to defaults too - a fresh "+ New"
    // starts a genuinely blank doc in every respect, not just its content.
    setOrgFolder('');
    setOrgVisibility('admin');
    setOrgTags([]);
    setOrgAudienceKeys([]);
  };

  const cancelEdit = () => { setEditMode(false); setIsCreatingNew(false); setDraftStatus(''); };
  const viewDoc = (doc) => { setSelectedDoc(doc); setEditMode(false); setIsCreatingNew(false); resetHistoryView(); };
  const addOrgTag = (tag) => { const t = tag.trim().toLowerCase(); if (t && !orgTags.includes(t)) setOrgTags([...orgTags, t]); setOrgTagInput(''); };
  const removeOrgTag = (tag) => { setOrgTags(orgTags.filter(t => t !== tag)); };

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
      // NOTE: folder/visibility/tags are deliberately NOT part of this
      // shared payload anymore - they're pure organization, not content
      // (see the Organize panel). For an existing doc they're saved
      // separately and immediately, never touched by publishing. For a
      // brand-new doc there's no live row yet for Organize to write to, so
      // the current org* state (already captured in the draft) is included
      // just this once, at creation time, below.
      const docData = {
        title: editTitle.trim(),
        slug: editSlug.trim(),
        content_md: finalMd,
        content: finalHtml,
        updated_at: new Date().toISOString(),
        updated_by: userProfile?.display_name || user?.email || 'unknown'
      };
      if (isCreatingNew) {
        docData.created_by = userProfile?.display_name || user?.email || 'unknown';
        // Org fields included here ONLY because this is the one moment a new
        // doc's organization becomes real - it has never had a live row to
        // save directly to before now.
        docData.folder = orgFolder.trim() || null;
        docData.visibility = orgVisibility;
        docData.tags = orgTags;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/docs`, {
          method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(docData)
        });
        if (res.ok) {
          const created = await res.json();
          const newDoc = created[0];
          // First publish of a new doc = version 1. No prior version to
          // compare against, but recorded the same way for consistency.
          // Content only - folder/tags/visibility are organization, not
          // content, and aren't part of version history at all anymore.
          if (newDoc) {
            await fetch(`${SUPABASE_URL}/rest/v1/content_versions`, {
              method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                table_name: 'docs', record_id: newDoc.id, changed_by: currentUserId,
                content: { title: newDoc.title, slug: newDoc.slug, content: newDoc.content, content_md: newDoc.content_md }
              })
            });
            // Apply the audience selection captured during drafting, now
            // that a real doc_id finally exists to attach it to.
            if (orgAudienceKeys.length > 0) {
              await fetch(`${SUPABASE_URL}/rest/v1/doc_audiences`, {
                method: 'POST', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
                body: JSON.stringify(orgAudienceKeys.map(k => ({ doc_id: newDoc.id, audience_value_key: k })))
              });
            }
          }
          await clearDraft(pendingNewDocIdRef.current); // clears the pending-id draft now that it's really published
          pendingNewDocIdRef.current = null;
          showMessage('✅ Document created!');
          await loadDocs();
          if (newDoc) { setSelectedDoc(newDoc); setIsCreatingNew(false); setEditMode(false); }
        } else { const error = await res.json(); showMessage(`❌ Error: ${error.message || 'Could not create'}`); }
      } else {
        // Only create a new version if a field that actually counts as
        // "meaningful content" changed - folder/tags/visibility are pure
        // organization now and were never part of this check to begin with.
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
                content: { title: docData.title, slug: docData.slug, content: docData.content, content_md: docData.content_md }
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
  // change". Org fields (folder/tags/visibility/audience) are only included
  // here for a NOT-YET-PUBLISHED new doc - once a doc is published,
  // organization is saved directly and immediately via the Organize panel,
  // independent of the draft/publish content cycle entirely, so there's
  // nothing useful to capture here for an existing doc's draft.
  const currentDraftContent = () => ({
    title: editTitle,
    slug: editSlug,
    content: editorMode === 'wysiwyg' && editorRef.current ? editorRef.current.innerHTML : editContentHtml,
    content_md: editContentMd,
    ...(isCreatingNew ? { folder: orgFolder, visibility: orgVisibility, tags: orgTags, audienceKeys: orgAudienceKeys } : {})
  });

  const saveDraft = async () => {
    if (!currentUserId) return;
    setDraftStatus('saving');
    try {
      const draftRow = {
        table_name: 'docs',
        // Use the stable pending id for an unpublished new doc, never null -
        // see pendingNewDocIdRef's comment for why null breaks the upsert.
        record_id: isCreatingNew ? pendingNewDocIdRef.current : (selectedDoc?.id || null),
        user_id: currentUserId,
        content: currentDraftContent(),
        updated_at: new Date().toISOString()
      };
      // Upsert on the (table_name, record_id, user_id) unique constraint.
      // on_conflict must be given explicitly - without it, PostgREST targets
      // the primary key (id) for conflict detection, which never collides
      // since every insert gets a fresh random id, so "merge-duplicates"
      // would silently never actually merge anything onto the same row.
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/content_drafts?on_conflict=table_name,record_id,user_id`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(draftRow)
        }
      );
      if (res.ok) {
        setDraftStatus('saved');
        loadUserDrafts(); // keep the Drafts list/badge in sync
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
      loadUserDrafts(); // keep the Drafts list/badge in sync
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  };

  // Apply a draft's saved content into the editor's live state. Content
  // only - org fields (for a new doc) are restored separately in resumeDraft.
  const applyDraft = (draft) => {
    skipNextAutosaveRef.current = true;
    const c = draft.content || {};
    setEditTitle(c.title || '');
    setEditSlug(c.slug || '');
    setEditContentHtml(c.content || '');
    setEditContentMd(c.content_md || '');
  };

  // Loads every draft the current user owns for docs (across ALL records,
  // not just the one currently open) - powers the "Drafts" sidebar toggle.
  const loadUserDrafts = async () => {
    if (!currentUserId) return;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/content_drafts?table_name=eq.docs&user_id=eq.${currentUserId}&select=*&order=updated_at.desc`,
        { headers: getAuthHeaders(false) }
      );
      const data = await res.json();
      setUserDrafts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading drafts list:', error);
    }
  };

  // --- Organize panel functions ---
  const loadAudienceOptions = async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/option_lists?list_key=eq.doc_audiences&select=*&order=display_order.asc`,
        { headers: getAuthHeaders(false) }
      );
      const data = await res.json();
      setDocAudienceOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading audience options:', error);
    }
  };

  const loadDocAudiencesFor = async (docId) => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/doc_audiences?doc_id=eq.${docId}&select=audience_value_key`,
        { headers: getAuthHeaders(false) }
      );
      const data = await res.json();
      return Array.isArray(data) ? data.map(r => r.audience_value_key) : [];
    } catch (error) {
      console.error('Error loading doc audiences:', error);
      return [];
    }
  };

  // Opens the panel. For an existing, already-published doc, always loads
  // fresh values from the live doc + doc_audiences (so it reflects reality,
  // not stale local state). For a not-yet-published new doc, deliberately
  // does NOT reset - org* state is already the working draft for this
  // in-progress doc, carried since startCreate or restored by resumeDraft.
  const openOrganize = async () => {
    if (!isCreatingNew && selectedDoc) {
      setOrgFolder(selectedDoc.folder || '');
      setOrgVisibility(selectedDoc.visibility || 'admin');
      setOrgTags(selectedDoc.tags || []);
      const audienceKeys = await loadDocAudiencesFor(selectedDoc.id);
      setOrgAudienceKeys(audienceKeys);
    }
    setShowOrganize(true);
  };

  // Saves the panel's values. For an existing doc: writes directly to the
  // database immediately (folder/visibility/tags on the docs row, plus
  // reconciling doc_audiences to match the selection) - organization is no
  // longer tied to the content draft/publish cycle at all. For a new,
  // unpublished doc: there's no live row yet, so this just closes the panel
  // - the values are already captured in org* state and will ride along in
  // the next autosave (see currentDraftContent) and get applied for real
  // when the doc is actually published.
  const saveOrganize = async () => {
    if (isCreatingNew || !selectedDoc) { setShowOrganize(false); return; }
    setSavingOrganize(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?id=eq.${selectedDoc.id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ folder: orgFolder.trim() || null, visibility: orgVisibility, tags: orgTags })
      });
      if (!res.ok) { showMessage('❌ Error saving organization'); setSavingOrganize(false); return; }

      // Reconcile doc_audiences: delete rows no longer selected, insert rows
      // newly selected. Simpler and safer than trying to diff precisely,
      // given the small scale (a handful of audience values at most).
      const currentKeys = await loadDocAudiencesFor(selectedDoc.id);
      const toRemove = currentKeys.filter(k => !orgAudienceKeys.includes(k));
      const toAdd = orgAudienceKeys.filter(k => !currentKeys.includes(k));
      if (toRemove.length > 0) {
        const keyList = toRemove.map(k => `"${k}"`).join(',');
        await fetch(`${SUPABASE_URL}/rest/v1/doc_audiences?doc_id=eq.${selectedDoc.id}&audience_value_key=in.(${keyList})`, {
          method: 'DELETE', headers: getAuthHeaders(false)
        });
      }
      if (toAdd.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/doc_audiences`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify(toAdd.map(k => ({ doc_id: selectedDoc.id, audience_value_key: k })))
        });
      }

      const updatedDoc = { ...selectedDoc, folder: orgFolder.trim() || null, visibility: orgVisibility, tags: orgTags };
      setSelectedDoc(updatedDoc);
      await loadDocs();
      showMessage('✅ Organization saved');
      setShowOrganize(false);
    } catch (error) {
      console.error('Error saving organization:', error);
      showMessage('❌ Error saving organization');
    }
    setSavingOrganize(false);
  };

  // Loads a doc's version history (content_versions), newest first, and
  // resolves display names only for the authors that actually appear -
  // avoids pulling every user profile in the system just to show a few names.
  const loadDocVersions = async (doc) => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/content_versions?table_name=eq.docs&record_id=eq.${doc.id}&select=*&order=created_at.desc`,
        { headers: getAuthHeaders(false) }
      );
      const data = await res.json();
      const versions = Array.isArray(data) ? data : [];
      setDocVersions(versions);

      const authorIds = [...new Set(versions.map(v => v.changed_by).filter(Boolean))];
      const missingIds = authorIds.filter(id => !(id in versionAuthors));
      if (missingIds.length > 0) {
        // FIX: no quotes around each id - PostgREST's in.() list takes plain
        // comma-separated values; wrapping each UUID in literal quote
        // characters makes it search for that string WITH the quotes
        // included, which never matches a real UUID, so this always
        // returned zero rows (silently, no error) and the "Loading..."
        // label in the UI never resolved.
        const idList = missingIds.join(',');
        // FIX: user_profiles has no email column at all (confirmed against
        // the live schema) - selecting it made this query fail outright,
        // which is the real reason names were stuck as 'Unknown'. Only
        // display_name actually exists here to fall back on.
        const profRes = await fetch(
          `${SUPABASE_URL}/rest/v1/user_profiles?id=in.(${idList})&select=id,display_name`,
          { headers: getAuthHeaders(false) }
        );
        const profData = profRes.ok ? await profRes.json() : [];
        setVersionAuthors(prev => {
          const next = { ...prev };
          if (Array.isArray(profData)) {
            profData.forEach(p => { next[p.id] = p.display_name || 'Unknown'; });
          }
          // FIX: whether or not the lookup found every id, fall back to
          // 'Unknown' for any that are still missing afterward - previously
          // an id that failed to resolve (for any reason - a bad query, a
          // deleted user, a network hiccup) stayed stuck on "Loading..."
          // forever instead of ever settling on something to display.
          missingIds.forEach(id => { if (!(id in next)) next[id] = 'Unknown'; });
          return next;
        });
      }
    } catch (error) {
      console.error('Error loading version history:', error);
      setDocVersions([]);
    }
  };

  // Toggle a version's selection for comparison. Caps at 2: picking a 3rd
  // drops the older of the two currently selected, so the person can just
  // keep clicking through versions rather than having to manually deselect first.
  const toggleCompareSelection = (versionId) => {
    setCompareSelection(prev => {
      if (prev.includes(versionId)) return prev.filter(id => id !== versionId);
      if (prev.length < 2) return [...prev, versionId];
      return [prev[1], versionId];
    });
  };

  // Shared reset for all History/diff-related view state - called any time
  // the main panel switches away from "viewing this doc's history" (entering
  // edit mode, switching to a different doc, closing the doc entirely), so
  // a stale selection or an open diff view never resurfaces somewhere it
  // doesn't belong.
  const resetHistoryView = () => {
    setShowHistory(false);
    setShowDiff(false);
    setCompareSelection([]);
  };

  // Resume editing a draft picked from the Drafts list. "Published" here
  // means the draft's record_id actually matches a real doc already loaded
  // in `docs` - that's true for an edit-in-progress on an existing doc, and
  // false for an unpublished new doc (whether its record_id is the pending
  // client-generated id, or - for any leftover rows from before that fix -
  // still literally null; either way, no real published doc will match it).
  const resumeDraft = (draft) => {
    setEditMode(true);
    resetHistoryView();
    skipNextAutosaveRef.current = true;
    setDraftStatus('');
    const liveDoc = draft.record_id ? docs.find(d => d.id === draft.record_id) : null;
    if (liveDoc) {
      setSelectedDoc(liveDoc);
      setIsCreatingNew(false);
    } else {
      // Not a real published doc - resuming an unpublished new-doc draft.
      // Restore the pending id so further saves keep targeting this same row.
      setSelectedDoc(null);
      setIsCreatingNew(true);
      pendingNewDocIdRef.current = draft.record_id || crypto.randomUUID();
      // Org fields only ever got captured in the draft for this exact case
      // (see currentDraftContent) - restore them here too, so a resumed
      // new-doc draft doesn't lose organization the person already set.
      const c = draft.content || {};
      setOrgFolder(c.folder || '');
      setOrgVisibility(c.visibility || 'admin');
      setOrgTags(c.tags || []);
      setOrgAudienceKeys(c.audienceKeys || []);
    }
    setEditorMode('wysiwyg');
    applyDraft(draft);
    // Deliberately NOT switching showDrafts back to Published here - stays
    // on whichever tab was active until the person clicks the toggle themselves.
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
  }, [editTitle, editSlug, editContentMd, editContentHtml, orgFolder, orgVisibility, orgTags, orgAudienceKeys]);

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

  // Discards the in-progress DRAFT only - never touches the published doc.
  // Distinct from Cancel (which just exits editing but leaves the autosaved
  // draft intact for next time) - Discard is the destructive, confirm-gated
  // action that actually deletes it.
  const discardDraft = async () => {
    if (!confirm('Discard this draft? Any unsaved changes will be permanently lost.')) return;
    const recordId = isCreatingNew ? pendingNewDocIdRef.current : (selectedDoc?.id || null);
    await clearDraft(recordId);
    if (isCreatingNew) {
      setEditMode(false);
      setIsCreatingNew(false);
    } else {
      cancelEdit();
    }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    // Full-screen dim backdrop; clicking it closes the panel (stopPropagation
    // on the panel itself prevents clicks inside from bubbling up and closing it).
    organizeOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
    organizePanel: { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto' },
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
      {showOrganize && (
        <div style={s.organizeOverlay} onClick={() => setShowOrganize(false)}>
          <div style={s.organizePanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>🗂 Organize</h3>
              <button style={s.btnSec} onClick={() => setShowOrganize(false)}>×</button>
            </div>
            {isCreatingNew && (
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                This doc has not been published yet - these settings are saved once you Save &amp; Publish.
              </div>
            )}
            <div style={s.formGroup}>
              <label style={s.label}>Folder</label>
              <input type="text" value={orgFolder} onChange={(e) => setOrgFolder(e.target.value)} style={{ ...s.input, marginBottom: 0 }} placeholder="e.g. Getting Started" list="doc-folders-list" />
              <datalist id="doc-folders-list">{folders.map(f => <option key={f} value={f} />)}</datalist>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Visibility</label>
              <select value={orgVisibility} onChange={(e) => setOrgVisibility(e.target.value)} style={{ ...s.select, marginBottom: 0 }}>
                <option value="admin">🔒 Admin Only</option>
                <option value="user">👤 All Users</option>
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Audience</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {docAudienceOptions.map(opt => {
                  const isSelected = orgAudienceKeys.includes(opt.value_key);
                  return (
                    <button
                      key={opt.value_key}
                      type="button"
                      onClick={() => setOrgAudienceKeys(prev => isSelected ? prev.filter(k => k !== opt.value_key) : [...prev, opt.value_key])}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', cursor: 'pointer',
                        border: isSelected ? '2px solid #22c55e' : '1px solid #334155',
                        background: isSelected ? '#22c55e20' : '#1e293b',
                        color: isSelected ? '#22c55e' : '#94a3b8'
                      }}
                    >{isSelected ? '✓ ' : ''}{opt.label}</button>
                  );
                })}
                {docAudienceOptions.length === 0 && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>No audience options configured yet.</div>}
              </div>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Tags</label>
              <div style={{ marginBottom: '0.5rem' }}>
                {orgTags.map(tag => <span key={tag} style={s.tag}>{tag}<button style={s.tagRemove} onClick={() => removeOrgTag(tag)}>×</button></span>)}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input type="text" value={orgTagInput} onChange={(e) => setOrgTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOrgTag(orgTagInput); } }} style={{ ...s.input, marginBottom: 0, flex: 1 }} placeholder="Add tag and press Enter" />
                <button style={s.btnSmall} onClick={() => addOrgTag(orgTagInput)}>Add</button>
              </div>
              {allExistingTags.filter(t => !orgTags.includes(t)).length > 0 && (
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem' }}>Existing tags:</div>
                  <div>{allExistingTags.filter(t => !orgTags.includes(t)).map(tag => <button key={tag} style={s.existingTag} onClick={() => addOrgTag(tag)}>{tag}</button>)}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #334155' }}>
              <button style={s.btn} onClick={saveOrganize} disabled={savingOrganize}>{savingOrganize ? 'Saving...' : (isCreatingNew ? 'Done' : 'Save')}</button>
              <button style={s.btnSec} onClick={() => setShowOrganize(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div style={s.wrapper}>
        {/* Sidebar */}
        <div>
          <div style={s.header}>
            <h1 style={s.title}>📚 Docs</h1>
            {isAdmin && !editMode && <button style={s.btn} onClick={startCreate}>+ New</button>}
          </div>
          {/* Published / Drafts toggle - reuses the same list styling below,
              just swaps the data source, rather than building a separate UI. */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                style={{ ...s.btnSec, flex: 1, background: !showDrafts ? '#22c55e' : '#334155', fontWeight: !showDrafts ? '600' : '400' }}
                onClick={() => setShowDrafts(false)}
              >Published{docs.length > 0 ? ` (${docs.length})` : ''}</button>
              <button
                style={{ ...s.btnSec, flex: 1, background: showDrafts ? '#22c55e' : '#334155', fontWeight: showDrafts ? '600' : '400' }}
                onClick={() => { setShowDrafts(true); loadUserDrafts(); }}
              >Drafts{userDrafts.length > 0 ? ` (${userDrafts.length})` : ''}</button>
            </div>
          )}
          {!showDrafts && (
            <>
              <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={s.input} />
              {folders.length > 0 && (
                <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} style={s.select}>
                  <option value="">All Folders</option>
                  {folders.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
            </>
          )}
          <div style={s.card}>
            <div style={s.docList}>
              {!showDrafts ? (
                <>
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
                </>
              ) : (
                <>
                  {userDrafts.map(draft => {
                    const label = draft.content?.title?.trim() || 'Untitled draft';
                    const isNewDoc = !docs.find(d => d.id === draft.record_id);
                    return (
                      <div key={draft.id} onClick={() => resumeDraft(draft)} style={{ ...s.docItem(false), display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: '500' }}>{label}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                            {isNewDoc ? '🆕 unpublished new doc' : '✏️ unpublished edit'} · saved {new Date(draft.updated_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // don't also trigger resumeDraft on the parent
                            if (confirm(`Discard this draft ("${label}")? This can't be undone.`)) {
                              clearDraft(draft.record_id || null);
                            }
                          }}
                          style={{ ...s.btnSmall, background: '#334155', flexShrink: 0 }}
                          title="Discard draft"
                        >🗑</button>
                      </div>
                    );
                  })}
                  {userDrafts.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No drafts</div>}
                </>
              )}
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
                    {/* Available while editing (including a brand-new, not-yet-
                        published doc) so organization can be set from the very
                        start, without a separate trip after publishing. */}
                    <button style={s.btnSec} onClick={openOrganize}>🗂 Organize</button>
                    {/* Discard replaces the old Delete here - this only ever
                        removes the in-progress DRAFT, never the published doc
                        itself. Real deletion lives in view mode now (see below). */}
                    <button style={s.btnDanger} onClick={discardDraft}>Discard</button>
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

                {/* Folder, Visibility, Tags, and Audience moved out of editing
                    entirely - see the Organize panel (button in the toolbar
                    above), reachable during editing without leaving the
                    content form. */}

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
                    {isAdmin && <button style={s.btnSec} onClick={() => { setShowHistory(true); loadDocVersions(selectedDoc); }}>🕐 History</button>}
                    {isAdmin && <button style={s.btnSec} onClick={openOrganize}>🗂 Organize</button>}
                    {isAdmin && <button style={s.btnSec} onClick={startCreate}>+ New</button>}
                    {/* Real deletion, moved here from the editor toolbar - it now
                        only ever appears alongside an already-published doc, never
                        implied to be "just discard my edits" the way it read before. */}
                    {isAdmin && <button style={s.btnDanger} onClick={deleteDoc}>🗑 Delete</button>}
                    <button style={s.btnSec} onClick={() => { setSelectedDoc(null); resetHistoryView(); }}>×</button>
                  </div>
                </div>
                {showHistory ? (
                  showDiff ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ fontWeight: 'bold' }}>Comparing Versions</h3>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button style={s.editorTab(diffMode === 'wysiwyg')} onClick={() => setDiffMode('wysiwyg')}>Visual</button>
                          <button style={s.editorTab(diffMode === 'markdown')} onClick={() => setDiffMode('markdown')}>Markdown</button>
                          <button style={s.editorTab(diffMode === 'code')} onClick={() => setDiffMode('code')}>HTML</button>
                        </div>
                        <button style={s.btnSec} onClick={() => setShowDiff(false)}>← Back to version list</button>
                      </div>
                      {(() => {
                        // '__current__' is a synthetic entry representing the live
                        // doc right now, not any saved content_versions row - built
                        // directly from selectedDoc so it's always accurate, even in
                        // the edge case where the newest saved version doesn't
                        // perfectly reflect current state (e.g. folder/tags changed
                        // without a version-triggering content edit since).
                        const resolveVersion = (id) => {
                          if (id === '__current__') {
                            return {
                              id: '__current__',
                              created_at: selectedDoc.updated_at || selectedDoc.created_at,
                              content: { title: selectedDoc.title, slug: selectedDoc.slug, content: selectedDoc.content, content_md: selectedDoc.content_md, folder: selectedDoc.folder, tags: selectedDoc.tags }
                            };
                          }
                          return docVersions.find(v => v.id === id);
                        };
                        // compareSelection order isn't chronological (whichever was
                        // clicked first) - sort so "old"/"new" always means what they say.
                        const [vA, vB] = compareSelection.map(resolveVersion).filter(Boolean);
                        if (!vA || !vB) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Select two versions to compare.</div>;
                        const [older, newer] = new Date(vA.created_at) <= new Date(vB.created_at) ? [vA, vB] : [vB, vA];
                        const oldC = older.content || {}, newC = newer.content || {};
                        return (
                          <div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                              Comparing {older.id === '__current__' ? 'Current' : new Date(older.created_at).toLocaleString()} → {newer.id === '__current__' ? 'Current' : new Date(newer.created_at).toLocaleString()}
                            </div>
                            {oldC.title !== newC.title && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Title</div>
                                <div dangerouslySetInnerHTML={{ __html: applyDiffStyling(buildDiffMarkdown(diffTokens(oldC.title || '', newC.title || ''))) }} />
                              </div>
                            )}
                            {oldC.slug !== newC.slug && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Slug</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} dangerouslySetInnerHTML={{ __html: applyDiffStyling(buildDiffMarkdown(diffTokens(oldC.slug || '', newC.slug || ''))) }} />
                              </div>
                            )}
                            {/* Folder/Tags/Visibility deliberately not diffed here anymore -
                                they're pure organization now (see the Organize panel),
                                not content, and aren't captured in version snapshots at all. */}
                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Content</div>
                            {diffMode === 'wysiwyg' && (
                              <div className="doc-content" style={{ lineHeight: '1.7' }} dangerouslySetInnerHTML={{ __html: renderMarkdownDiff(oldC.content_md || '', newC.content_md || '') }} />
                            )}
                            {diffMode === 'markdown' && (
                              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', background: '#0f172a', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                                {diffTokens(oldC.content_md || '', newC.content_md || '').map((seg, idx) => (
                                  <span key={idx} className={seg.type === 'added' ? 'diff-added' : seg.type === 'removed' ? 'diff-removed' : undefined}>{seg.text}</span>
                                ))}
                              </pre>
                            )}
                            {diffMode === 'code' && (
                              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem', background: '#0f172a', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                                {renderMarkdownDiff(oldC.content_md || '', newC.content_md || '')}
                              </pre>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h3 style={{ fontWeight: 'bold' }}>Version History</h3>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {compareSelection.length === 2 && <button style={s.btn} onClick={() => setShowDiff(true)}>Compare Selected</button>}
                        <button style={s.btnSec} onClick={() => resetHistoryView()}>← Back to document</button>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
                      Select two to compare them ({compareSelection.length}/2 selected)
                    </div>
                    <div>
                      {/* Synthetic "Current (Live)" entry - always shown, always
                          accurate, built from the live doc rather than from
                          whichever saved version happens to be newest (which can
                          drift slightly out of sync - see comment on resolveVersion
                          in the diff view above). */}
                      {(() => {
                        const isSelected = compareSelection.includes('__current__');
                        return (
                          <div
                            onClick={() => toggleCompareSelection('__current__')}
                            style={{ padding: '0.75rem 1rem', background: '#0f172a', border: isSelected ? '2px solid #22c55e' : '1px solid #334155', borderRadius: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '500' }}>{isSelected ? '✓ ' : ''}Current (Live)</span>
                              <span style={{ fontSize: '0.7rem', background: '#22c55e33', color: '#22c55e', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>Current</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>what's actually live right now</div>
                          </div>
                        );
                      })()}
                      {docVersions.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                          No saved version history yet - this doc has not been saved & published since version tracking was added, or has never been edited.
                        </div>
                      ) : (
                        docVersions.map((v, i) => {
                          const authorName = v.changed_by ? (versionAuthors[v.changed_by] || 'Loading...') : 'Unknown';
                          const isLatestSaved = i === 0;
                          const isSelected = compareSelection.includes(v.id);
                          return (
                            <div
                              key={v.id}
                              onClick={() => toggleCompareSelection(v.id)}
                              style={{ padding: '0.75rem 1rem', background: '#0f172a', border: isSelected ? '2px solid #22c55e' : '1px solid #334155', borderRadius: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '500' }}>{isSelected ? '✓ ' : ''}{new Date(v.created_at).toLocaleString()}</span>
                                {/* Renamed from "Current" to avoid implying this saved
                                    row necessarily matches live state exactly - see the
                                    Current (Live) entry above for that. */}
                                {isLatestSaved && <span style={{ fontSize: '0.7rem', background: '#334155', color: '#94a3b8', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>Latest saved</span>}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>by {authorName}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  )
                ) : (
                  <div className="doc-content" dangerouslySetInnerHTML={{ __html: selectedDoc.content || '<p>No content yet.</p>' }} style={{ lineHeight: '1.7' }} />
                )}
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
        .diff-added { background: #22c55e33; color: #86efac; text-decoration: none; padding: 0.05em 0.15em; border-radius: 0.15em; }
        .diff-removed { background: #ef444433; color: #fca5a5; text-decoration: line-through; padding: 0.05em 0.15em; border-radius: 0.15em; }
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
