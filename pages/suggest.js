import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function Suggest() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Data for dropdowns
  const [songs, setSongs] = useState([]);
  const [versions, setVersions] = useState([]);

  // Form state
  const [suggestionType, setSuggestionType] = useState('new_song');
  const [selectedSongId, setSelectedSongId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');

  // New song fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [composer, setComposer] = useState('');
  const [lyricsText, setLyricsText] = useState('');

  // New version fields
  const [versionLabel, setVersionLabel] = useState('');
  const [lyricsContent, setLyricsContent] = useState('');

  // Media fields
  const [mediaType, setMediaType] = useState('youtube');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaLabel, setMediaLabel] = useState('');

  // Note fields
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('history');

  // Edit fields
  const [fieldName, setFieldName] = useState('title');
  const [currentValue, setCurrentValue] = useState('');
  const [suggestedValue, setSuggestedValue] = useState('');

  // Alias fields
  const [aliasTitle, setAliasTitle] = useState('');

  // Flag fields
  const [flagType, setFlagType] = useState('content_warning');
  const [flagNotes, setFlagNotes] = useState('');

  // Common
  const [reason, setReason] = useState('');

  // Multi-suggestion support
  const [pendingSuggestions, setPendingSuggestions] = useState([]);

  // My suggestions
  const [mySuggestions, setMySuggestions] = useState([]);
  const [showMySuggestions, setShowMySuggestions] = useState(false);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (selectedSongId) loadVersions(selectedSongId); }, [selectedSongId]);
  
  // Handle query params from songs page
  useEffect(() => {
    if (router.isReady && songs.length > 0) {
      const { song_id, type } = router.query;
      if (song_id) {
        setSelectedSongId(song_id);
        // Map modal types to form types
        const typeMap = {
          'new_version': 'new_version',
          'edit_info': 'edit',
          'add_media': 'media',
          'add_note': 'note',
          'add_alias': 'add_alias',
          'add_flag': 'add_flag'
        };
        if (type && typeMap[type]) {
          setSuggestionType(typeMap[type]);
        }
      }
    }
  }, [router.isReady, router.query, songs]);

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
        await loadSongs();
        await loadMySuggestions(userData.id);
      } else {
        router.push('/?login=true');
      }
    } catch (error) {
      console.log('Auth check failed');
      router.push('/?login=true');
    }
    setLoading(false);
  };

  const loadSongs = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=id,title&order=title.asc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setSongs(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading songs:', error); }
  };

  const loadVersions = async (songId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${songId}&select=id,label`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setVersions(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading versions:', error); }
  };

  const loadMySuggestions = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions?created_by=eq.${userId}&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setMySuggestions(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading suggestions:', error); }
  };

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const resetForm = () => {
    setSelectedSongId('');
    setSelectedVersionId('');
    setTitle(''); setAuthor(''); setComposer(''); setLyricsText('');
    setVersionLabel(''); setLyricsContent('');
    setMediaType('youtube'); setMediaUrl(''); setMediaLabel('');
    setNoteContent(''); setNoteType('history');
    setFieldName('title'); setCurrentValue(''); setSuggestedValue('');
    setAliasTitle('');
    setFlagType('content_warning'); setFlagNotes('');
    setReason('');
  };

  const submitSuggestion = async () => {
    if (!user) return;
    
    // Validation
    if (suggestionType === 'new_song' && !title.trim()) {
      showMsg('❌ Please enter a song title');
      return;
    }
    if (['new_version', 'media', 'note', 'edit', 'add_alias', 'add_flag'].includes(suggestionType) && !selectedSongId) {
      showMsg('❌ Please select a song');
      return;
    }
    if (suggestionType === 'new_version' && !versionLabel.trim()) {
      showMsg('❌ Please enter a version label');
      return;
    }
    if (suggestionType === 'media' && !mediaUrl.trim()) {
      showMsg('❌ Please enter a media URL');
      return;
    }
    if (suggestionType === 'note' && !noteContent.trim()) {
      showMsg('❌ Please enter note content');
      return;
    }
    if (suggestionType === 'edit' && !suggestedValue.trim()) {
      showMsg('❌ Please enter the suggested value');
      return;
    }
    if (suggestionType === 'add_alias' && !aliasTitle.trim()) {
      showMsg('❌ Please enter the alternate name');
      return;
    }
    if (suggestionType === 'add_flag' && !flagNotes.trim()) {
      showMsg('❌ Please describe the flag');
      return;
    }

    // Build payload
    const songName = songs.find(s => s.id === selectedSongId)?.title || '';
    const payload = {
      suggestion_type: suggestionType,
      song_id: selectedSongId || null,
      version_id: selectedVersionId || null,
      title: suggestionType === 'new_song' ? title.trim() : (suggestionType === 'add_alias' ? aliasTitle.trim() : null),
      author: suggestionType === 'new_song' ? author.trim() || null : null,
      composer: suggestionType === 'new_song' ? composer.trim() || null : null,
      lyrics_text: suggestionType === 'new_song' ? lyricsText.trim() || null : null,
      version_label: suggestionType === 'new_version' ? versionLabel.trim() : null,
      lyrics_content: suggestionType === 'new_version' ? lyricsContent.trim() || null : null,
      media_type: suggestionType === 'media' ? mediaType : null,
      media_url: suggestionType === 'media' ? mediaUrl.trim() : null,
      media_label: suggestionType === 'media' ? mediaLabel.trim() || null : null,
      note_content: suggestionType === 'note' ? noteContent.trim() : (suggestionType === 'add_flag' ? flagNotes.trim() : null),
      note_type: suggestionType === 'note' ? noteType : (suggestionType === 'add_flag' ? flagType : null),
      field_name: suggestionType === 'edit' ? fieldName : null,
      current_value: suggestionType === 'edit' ? currentValue.trim() || null : null,
      suggested_value: suggestionType === 'edit' ? suggestedValue.trim() : null,
      reason: reason.trim() || null,
      created_by: user.id,
      // For display purposes
      _display: {
        type: typeLabels[suggestionType],
        songName,
        summary: getSuggestionSummary(suggestionType)
      }
    };

    // Add to pending list
    setPendingSuggestions(prev => [...prev, { ...payload, _tempId: Date.now() }]);
    resetForm();
    showMsg('✅ Added to list! Add more or submit all.');
  };

  // Get a short summary of the suggestion for display
  const getSuggestionSummary = (type) => {
    switch(type) {
      case 'new_song': return title.trim();
      case 'new_version': return versionLabel.trim();
      case 'media': return mediaLabel.trim() || mediaUrl.trim().substring(0, 30) + '...';
      case 'note': return noteContent.trim().substring(0, 40) + (noteContent.length > 40 ? '...' : '');
      case 'edit': return `${fieldName}: ${suggestedValue.trim().substring(0, 30)}`;
      case 'add_alias': return aliasTitle.trim();
      case 'add_flag': return `${flagType}: ${flagNotes.trim().substring(0, 30)}`;
      default: return '';
    }
  };

  // Remove from pending list
  const removePending = (tempId) => {
    setPendingSuggestions(prev => prev.filter(p => p._tempId !== tempId));
  };

  // Submit all pending suggestions
  const submitAllSuggestions = async () => {
    if (pendingSuggestions.length === 0) {
      showMsg('❌ No suggestions to submit');
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    for (const suggestion of pendingSuggestions) {
      // Remove display fields before submitting
      const { _display, _tempId, ...payload } = suggestion;
      
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data[0]) {
          setMySuggestions(prev => [data[0], ...prev]);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error('Error submitting:', error);
        failCount++;
      }
    }

    setPendingSuggestions([]);
    setSubmitting(false);
    
    if (failCount === 0) {
      showMsg(`✅ All ${successCount} suggestion(s) submitted!`);
    } else {
      showMsg(`⚠️ ${successCount} submitted, ${failCount} failed`);
    }
  };

  // Submit single suggestion immediately (legacy behavior)
  const submitSingleSuggestion = async () => {
    if (!user) return;
    
    // Validation
    if (suggestionType === 'new_song' && !title.trim()) {
      showMsg('❌ Please enter a song title');
      return;
    }
    if (['new_version', 'media', 'note', 'edit', 'add_alias', 'add_flag'].includes(suggestionType) && !selectedSongId) {
      showMsg('❌ Please select a song');
      return;
    }
    if (suggestionType === 'new_version' && !versionLabel.trim()) {
      showMsg('❌ Please enter a version label');
      return;
    }
    if (suggestionType === 'media' && !mediaUrl.trim()) {
      showMsg('❌ Please enter a media URL');
      return;
    }
    if (suggestionType === 'note' && !noteContent.trim()) {
      showMsg('❌ Please enter note content');
      return;
    }
    if (suggestionType === 'edit' && !suggestedValue.trim()) {
      showMsg('❌ Please enter the suggested value');
      return;
    }
    if (suggestionType === 'add_alias' && !aliasTitle.trim()) {
      showMsg('❌ Please enter the alternate name');
      return;
    }
    if (suggestionType === 'add_flag' && !flagNotes.trim()) {
      showMsg('❌ Please describe the flag');
      return;
    }

    setSubmitting(true);

    const payload = {
      suggestion_type: suggestionType,
      song_id: selectedSongId || null,
      version_id: selectedVersionId || null,
      title: suggestionType === 'new_song' ? title.trim() : (suggestionType === 'add_alias' ? aliasTitle.trim() : null),
      author: suggestionType === 'new_song' ? author.trim() || null : null,
      composer: suggestionType === 'new_song' ? composer.trim() || null : null,
      lyrics_text: suggestionType === 'new_song' ? lyricsText.trim() || null : null,
      version_label: suggestionType === 'new_version' ? versionLabel.trim() : null,
      lyrics_content: suggestionType === 'new_version' ? lyricsContent.trim() || null : null,
      media_type: suggestionType === 'media' ? mediaType : null,
      media_url: suggestionType === 'media' ? mediaUrl.trim() : null,
      media_label: suggestionType === 'media' ? mediaLabel.trim() || null : null,
      note_content: suggestionType === 'note' ? noteContent.trim() : (suggestionType === 'add_flag' ? flagNotes.trim() : null),
      note_type: suggestionType === 'note' ? noteType : (suggestionType === 'add_flag' ? flagType : null),
      field_name: suggestionType === 'edit' ? fieldName : null,
      current_value: suggestionType === 'edit' ? currentValue.trim() || null : null,
      suggested_value: suggestionType === 'edit' ? suggestedValue.trim() : null,
      reason: reason.trim() || null,
      created_by: user.id
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data[0]) {
        setMySuggestions(prev => [data[0], ...prev]);
        resetForm();
        showMsg('✅ Suggestion submitted! An admin will review it.');
      } else {
        showMsg('❌ Error submitting suggestion');
      }
    } catch (error) {
      console.error('Error submitting:', error);
      showMsg('❌ Error submitting suggestion');
    }

    setSubmitting(false);
  };

  const typeLabels = {
    new_song: '🎵 New Song',
    new_version: '📝 New Version',
    media: '🎬 Media Link',
    note: '📋 Note',
    edit: '✏️ Edit',
    add_alias: '🏷️ Alternate Name',
    add_flag: '⚠️ Flag'
  };

  const statusColors = {
    pending: { bg: '#f59e0b20', text: '#f59e0b' },
    approved: { bg: '#22c55e20', text: '#22c55e' },
    rejected: { bg: '#ef444420', text: '#ef4444' }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '700px', margin: '0 auto', padding: '1.5rem' },
    header: { marginBottom: '1.5rem' },
    title: { fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    subtitle: { color: '#94a3b8', fontSize: '0.875rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.25rem', marginBottom: '1rem' },
    cardTitle: { fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem' },
    label: { display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.375rem' },
    input: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '1rem' },
    textarea: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '1rem', minHeight: '120px', resize: 'vertical', fontFamily: 'inherit' },
    select: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', outline: 'none', fontSize: '0.875rem', marginBottom: '1rem' },
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    typeBtn: (active) => ({
      background: active ? '#22c55e' : '#334155',
      color: '#fff',
      border: 'none',
      padding: '0.5rem 0.75rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.8rem',
      fontWeight: active ? '600' : '400'
    }),
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    suggestionItem: { padding: '0.75rem', borderBottom: '1px solid #334155', fontSize: '0.875rem' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={s.container}>
        <div style={{ ...s.wrapper, textAlign: 'center', paddingTop: '4rem' }}>
          <p>Please <Link href="/?login=true" style={{ color: '#22c55e' }}>log in</Link> to make suggestions.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}
      
      <div style={s.wrapper}>
        <div style={s.header}>
          <h1 style={s.title}>💡 Suggest a Change</h1>
          <p style={s.subtitle}>Help improve our songbook! Admins will review your suggestions.</p>
        </div>

        {/* Suggestion Type Selector */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>What would you like to suggest?</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.entries(typeLabels).map(([type, label]) => (
              <button
                key={type}
                onClick={() => { setSuggestionType(type); resetForm(); }}
                style={s.typeBtn(suggestionType === type)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Form based on type */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>{typeLabels[suggestionType]}</h2>

          {/* NEW SONG */}
          {suggestionType === 'new_song' && (
            <>
              <label style={s.label}>Song Title *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter song title" style={s.input} />
              
              <label style={s.label}>Author</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Who wrote the lyrics?" style={s.input} />
              
              <label style={s.label}>Composer</label>
              <input type="text" value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Who wrote the music?" style={s.input} />
              
              <label style={s.label}>Lyrics</label>
              <textarea value={lyricsText} onChange={(e) => setLyricsText(e.target.value)} placeholder="Paste lyrics here..." style={s.textarea} />
            </>
          )}

          {/* NEW VERSION */}
          {suggestionType === 'new_version' && (
            <>
              <label style={s.label}>For which song? *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Select a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              
              <label style={s.label}>Version Label *</label>
              <input type="text" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g., 'Camp Arrowhead Version', 'Gender Neutral'" style={s.input} />
              
              <label style={s.label}>Lyrics</label>
              <textarea value={lyricsContent} onChange={(e) => setLyricsContent(e.target.value)} placeholder="Paste version lyrics here..." style={s.textarea} />
            </>
          )}

          {/* MEDIA */}
          {suggestionType === 'media' && (
            <>
              <label style={s.label}>For which song? *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Select a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              {versions.length > 0 && (
                <>
                  <label style={s.label}>For which version? (optional)</label>
                  <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} style={s.select}>
                    <option value="">All versions / general</option>
                    {versions.map(v => <option key={v.id} value={v.id}>{v.label || 'Untitled'}</option>)}
                  </select>
                </>
              )}
              
              <label style={s.label}>Media Type</label>
              <select value={mediaType} onChange={(e) => setMediaType(e.target.value)} style={s.select}>
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="other">Other Link</option>
              </select>
              
              <label style={s.label}>URL *</label>
              <input type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." style={s.input} />
              
              <label style={s.label}>Label (optional)</label>
              <input type="text" value={mediaLabel} onChange={(e) => setMediaLabel(e.target.value)} placeholder="e.g., 'Official recording', 'Live at camp'" style={s.input} />
            </>
          )}

          {/* NOTE */}
          {suggestionType === 'note' && (
            <>
              <label style={s.label}>For which song? *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Select a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              {versions.length > 0 && (
                <>
                  <label style={s.label}>For which version? (optional)</label>
                  <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} style={s.select}>
                    <option value="">All versions / general</option>
                    {versions.map(v => <option key={v.id} value={v.id}>{v.label || 'Untitled'}</option>)}
                  </select>
                </>
              )}
              
              <label style={s.label}>Note Type</label>
              <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={s.select}>
                <option value="history">History / Background</option>
                <option value="teaching">Teaching Tips</option>
                <option value="motions">Motions / Actions</option>
                <option value="other">Other</option>
              </select>
              
              <label style={s.label}>Note Content *</label>
              <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Share what you know..." style={s.textarea} />
            </>
          )}

          {/* EDIT */}
          {suggestionType === 'edit' && (
            <>
              <label style={s.label}>For which song? *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Select a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              
              <label style={s.label}>What needs to be edited?</label>
              <select value={fieldName} onChange={(e) => setFieldName(e.target.value)} style={s.select}>
                <option value="title">Title</option>
                <option value="author">Author</option>
                <option value="composer">Composer</option>
                <option value="origin">Origin</option>
                <option value="year_written">Year Written</option>
                <option value="lyrics">Lyrics</option>
                <option value="other">Other</option>
              </select>
              
              <label style={s.label}>Current Value (if known)</label>
              <input type="text" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="What it currently says..." style={s.input} />
              
              <label style={s.label}>Suggested Value *</label>
              <textarea value={suggestedValue} onChange={(e) => setSuggestedValue(e.target.value)} placeholder="What it should say..." style={s.textarea} />
            </>
          )}

          {/* ADD ALIAS */}
          {suggestionType === 'add_alias' && (
            <>
              <label style={s.label}>For which song? *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Select a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              
              <label style={s.label}>Alternate Name *</label>
              <input type="text" value={aliasTitle} onChange={(e) => setAliasTitle(e.target.value)} placeholder="What else is this song called?" style={s.input} />
            </>
          )}

          {/* ADD FLAG */}
          {suggestionType === 'add_flag' && (
            <>
              <label style={s.label}>For which song? *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Select a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              
              <label style={s.label}>Flag Type</label>
              <select value={flagType} onChange={(e) => setFlagType(e.target.value)} style={s.select}>
                <option value="content_warning">Content Warning</option>
                <option value="cultural_sensitivity">Cultural Sensitivity</option>
                <option value="outdated_language">Outdated Language</option>
                <option value="historical_context">Needs Historical Context</option>
                <option value="other">Other</option>
              </select>
              
              <label style={s.label}>Description *</label>
              <textarea value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)} placeholder="Describe the issue or concern..." style={s.textarea} />
            </>
          )}

          {/* Common: Reason */}
          <label style={s.label}>Why are you suggesting this? (optional)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Any additional context..." style={{ ...s.textarea, minHeight: '80px' }} />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={submitSuggestion} disabled={submitting} style={{ ...s.btn, opacity: submitting ? 0.5 : 1 }}>
              ➕ Add to List
            </button>
            <button onClick={submitSingleSuggestion} disabled={submitting} style={{ ...s.btnSec, opacity: submitting ? 0.5 : 1 }}>
              {submitting ? 'Submitting...' : 'Submit Just This One'}
            </button>
          </div>
        </div>

        {/* Pending Suggestions List */}
        {pendingSuggestions.length > 0 && (
          <div style={{ ...s.card, background: '#1e3a2e', border: '1px solid #22c55e40' }}>
            <h2 style={{ ...s.cardTitle, color: '#22c55e' }}>📋 Ready to Submit ({pendingSuggestions.length})</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>
              These suggestions will be submitted together when you click "Submit All"
            </p>
            
            {pendingSuggestions.map((p, idx) => (
              <div key={p._tempId} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '0.75rem',
                background: '#0f172a',
                borderRadius: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <div>
                  <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{p._display?.type}</span>
                  {p._display?.songName && <span style={{ color: '#94a3b8' }}> for "{p._display.songName}"</span>}
                  {p._display?.summary && <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>{p._display.summary}</div>}
                </div>
                <button 
                  onClick={() => removePending(p._tempId)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  ×
                </button>
              </div>
            ))}
            
            <button 
              onClick={submitAllSuggestions} 
              disabled={submitting}
              style={{ 
                ...s.btn, 
                width: '100%', 
                marginTop: '1rem',
                background: '#22c55e',
                opacity: submitting ? 0.5 : 1
              }}
            >
              {submitting ? 'Submitting...' : `🚀 Submit All ${pendingSuggestions.length} Suggestion(s)`}
            </button>
          </div>
        )}

        {/* My Suggestions */}
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ ...s.cardTitle, marginBottom: 0 }}>My Suggestions ({mySuggestions.length})</h2>
            <button onClick={() => setShowMySuggestions(!showMySuggestions)} style={s.btnSec}>
              {showMySuggestions ? 'Hide' : 'Show'}
            </button>
          </div>

          {showMySuggestions && (
            <div style={{ marginTop: '1rem' }}>
              {mySuggestions.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No suggestions yet</p>
              ) : (
                mySuggestions.map(sug => {
                  const statusColor = statusColors[sug.status] || statusColors.pending;
                  const song = songs.find(s => s.id === sug.song_id);
                  return (
                    <div key={sug.id} style={s.suggestionItem}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div>
                          <span style={{ fontWeight: 'bold' }}>{typeLabels[sug.suggestion_type]}</span>
                          {song && <span style={{ color: '#94a3b8' }}> for "{song.title}"</span>}
                          {sug.title && <span style={{ color: '#94a3b8' }}> - {sug.title}</span>}
                        </div>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          background: statusColor.bg,
                          color: statusColor.text,
                          textTransform: 'uppercase',
                          fontWeight: 'bold'
                        }}>
                          {sug.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        {new Date(sug.created_at).toLocaleDateString()}
                      </div>
                      {sug.admin_notes && (
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#0f172a', borderRadius: '0.25rem', fontSize: '0.8rem' }}>
                          <span style={{ color: '#22c55e' }}>Admin:</span> {sug.admin_notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
