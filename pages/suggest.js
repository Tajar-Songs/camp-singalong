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

  // Data
  const [songs, setSongs] = useState([]);
  const [versions, setVersions] = useState([]);

  // Mode: 'new_song' or 'existing_song'
  const [mode, setMode] = useState('existing_song');
  const [selectedSongId, setSelectedSongId] = useState('');

  // What to include (checkboxes)
  const [includeAuthor, setIncludeAuthor] = useState(false);
  const [includeComposer, setIncludeComposer] = useState(false);
  const [includeYear, setIncludeYear] = useState(false);
  const [includeOrigin, setIncludeOrigin] = useState(false);
  const [includeTuneOf, setIncludeTuneOf] = useState(false);
  const [includeVersion, setIncludeVersion] = useState(false);
  const [includeMedia, setIncludeMedia] = useState(false);
  const [includeNote, setIncludeNote] = useState(false);
  const [includeAlias, setIncludeAlias] = useState(false);
  const [includeFlag, setIncludeFlag] = useState(false);

  // Field values
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [composer, setComposer] = useState('');
  const [year, setYear] = useState('');
  const [origin, setOrigin] = useState('');
  const [tuneOf, setTuneOf] = useState('');
  
  const [versionLabel, setVersionLabel] = useState('');
  const [versionLyrics, setVersionLyrics] = useState('');
  
  const [mediaItems, setMediaItems] = useState([{ type: 'youtube', url: '', label: '' }]);
  const [noteItems, setNoteItems] = useState([{ type: 'history', content: '' }]);
  const [aliasItems, setAliasItems] = useState([{ title: '' }]);
  const [flagItems, setFlagItems] = useState([{ type: 'content_warning', notes: '' }]);

  // Common fields
  const [sourceUrl, setSourceUrl] = useState('');
  const [reason, setReason] = useState('');

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
  
  // Handle query params
  useEffect(() => {
    if (router.isReady && songs.length > 0) {
      const { song_id } = router.query;
      if (song_id) {
        setSelectedSongId(song_id);
        setMode('existing_song');
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
      const res = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions?created_by=eq.${userId}&order=created_at.desc&limit=50`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setMySuggestions(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading suggestions:', error); }
  };

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 4000); };

  const resetForm = () => {
    setIncludeAuthor(false); setIncludeComposer(false); setIncludeYear(false);
    setIncludeOrigin(false); setIncludeTuneOf(false); setIncludeVersion(false);
    setIncludeMedia(false); setIncludeNote(false); setIncludeAlias(false); setIncludeFlag(false);
    setTitle(''); setAuthor(''); setComposer(''); setYear(''); setOrigin(''); setTuneOf('');
    setVersionLabel(''); setVersionLyrics('');
    setMediaItems([{ type: 'youtube', url: '', label: '' }]);
    setNoteItems([{ type: 'history', content: '' }]);
    setAliasItems([{ title: '' }]);
    setFlagItems([{ type: 'content_warning', notes: '' }]);
    setSourceUrl(''); setReason('');
  };

  // Media helpers
  const addMediaItem = () => {
    setMediaItems([...mediaItems, { type: 'youtube', url: '', label: '' }]);
  };

  const updateMediaItem = (index, field, value) => {
    const updated = [...mediaItems];
    updated[index][field] = value;
    setMediaItems(updated);
  };

  const removeMediaItem = (index) => {
    if (mediaItems.length > 1) setMediaItems(mediaItems.filter((_, i) => i !== index));
  };

  // Note helpers
  const addNoteItem = () => {
    setNoteItems([...noteItems, { type: 'history', content: '' }]);
  };

  const updateNoteItem = (index, field, value) => {
    const updated = [...noteItems];
    updated[index][field] = value;
    setNoteItems(updated);
  };

  const removeNoteItem = (index) => {
    if (noteItems.length > 1) setNoteItems(noteItems.filter((_, i) => i !== index));
  };

  // Alias helpers
  const addAliasItem = () => {
    setAliasItems([...aliasItems, { title: '' }]);
  };

  const updateAliasItem = (index, value) => {
    const updated = [...aliasItems];
    updated[index].title = value;
    setAliasItems(updated);
  };

  const removeAliasItem = (index) => {
    if (aliasItems.length > 1) setAliasItems(aliasItems.filter((_, i) => i !== index));
  };

  // Flag helpers
  const addFlagItem = () => {
    setFlagItems([...flagItems, { type: 'content_warning', notes: '' }]);
  };

  const removeFlagItem = (index) => {
    if (flagItems.length > 1) setFlagItems(flagItems.filter((_, i) => i !== index));
  };

  // Generate UUID for batch
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const submitSuggestions = async () => {
    if (!user) return;

    // Validation
    if (mode === 'new_song' && !title.trim()) {
      showMsg('❌ Please enter a song title');
      return;
    }
    if (mode === 'existing_song' && !selectedSongId) {
      showMsg('❌ Please select a song');
      return;
    }

    // Check at least one thing is being suggested
    const hasAnySuggestion = mode === 'new_song' || 
      includeAuthor || includeComposer || includeYear || includeOrigin || includeTuneOf ||
      includeVersion || includeMedia || includeNote || includeAlias || includeFlag;
    
    if (!hasAnySuggestion) {
      showMsg('❌ Please select at least one thing to suggest');
      return;
    }

    // Validate filled fields
    if (includeVersion && !versionLabel.trim()) {
      showMsg('❌ Please enter a version label');
      return;
    }
    if (includeMedia && !mediaItems.some(m => m.url.trim())) {
      showMsg('❌ Please enter at least one media URL');
      return;
    }
    if (includeNote && !noteItems.some(n => n.content.trim())) {
      showMsg('❌ Please enter at least one note');
      return;
    }
    if (includeAlias && !aliasItems.some(a => a.title.trim())) {
      showMsg('❌ Please enter at least one alternate name');
      return;
    }
    if (includeFlag && !flagItems.some(f => f.notes.trim())) {
      showMsg('❌ Please describe at least one flag');
      return;
    }

    setSubmitting(true);
    const batchId = generateUUID();
    const suggestions = [];
    const songId = mode === 'new_song' ? null : selectedSongId;
    const songTitle = mode === 'new_song' ? title.trim() : songs.find(s => s.id === selectedSongId)?.title;

    // Build suggestion list
    if (mode === 'new_song') {
      suggestions.push({
        suggestion_type: 'new_song',
        song_id: null,
        title: title.trim(),
        author: author.trim() || null,
        composer: composer.trim() || null,
        lyrics_text: versionLyrics.trim() || null,
        source_url: sourceUrl.trim() || null,
        reason: reason.trim() || null,
        batch_id: batchId,
        created_by: user.id
      });
      
      // If also including other fields for new song, add separate suggestions
      if (includeOrigin && origin.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: null,
          field_name: 'origin',
          suggested_value: origin.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
      if (includeYear && year.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: null,
          field_name: 'year_written',
          suggested_value: year.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
      if (includeTuneOf && tuneOf.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: null,
          field_name: 'tune_of',
          suggested_value: tuneOf.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
    } else {
      // Existing song edits
      if (includeAuthor && author.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: songId,
          field_name: 'author',
          suggested_value: author.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
      if (includeComposer && composer.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: songId,
          field_name: 'composer',
          suggested_value: composer.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
      if (includeYear && year.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: songId,
          field_name: 'year_written',
          suggested_value: year.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
      if (includeOrigin && origin.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: songId,
          field_name: 'origin',
          suggested_value: origin.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
      if (includeTuneOf && tuneOf.trim()) {
        suggestions.push({
          suggestion_type: 'edit',
          song_id: songId,
          field_name: 'tune_of',
          suggested_value: tuneOf.trim(),
          source_url: sourceUrl.trim() || null,
          reason: reason.trim() || null,
          batch_id: batchId,
          created_by: user.id
        });
      }
    }

    // Version (both modes)
    if (includeVersion && versionLabel.trim()) {
      suggestions.push({
        suggestion_type: 'new_version',
        song_id: songId,
        version_label: versionLabel.trim(),
        lyrics_content: versionLyrics.trim() || null,
        source_url: sourceUrl.trim() || null,
        reason: reason.trim() || null,
        batch_id: batchId,
        created_by: user.id
      });
    }

    // Media items
    if (includeMedia) {
      mediaItems.forEach(m => {
        if (m.url.trim()) {
          suggestions.push({
            suggestion_type: 'media',
            song_id: songId,
            media_type: m.type,
            media_url: m.url.trim(),
            media_label: m.label.trim() || null,
            source_url: sourceUrl.trim() || null,
            reason: reason.trim() || null,
            batch_id: batchId,
            created_by: user.id
          });
        }
      });
    }

    // Note items
    if (includeNote) {
      noteItems.forEach(n => {
        if (n.content.trim()) {
          suggestions.push({
            suggestion_type: 'note',
            song_id: songId,
            note_type: n.type,
            note_content: n.content.trim(),
            source_url: sourceUrl.trim() || null,
            reason: reason.trim() || null,
            batch_id: batchId,
            created_by: user.id
          });
        }
      });
    }

    // Alias items
    if (includeAlias) {
      aliasItems.forEach(a => {
        if (a.title.trim()) {
          suggestions.push({
            suggestion_type: 'add_alias',
            song_id: songId,
            title: a.title.trim(),
            source_url: sourceUrl.trim() || null,
            reason: reason.trim() || null,
            batch_id: batchId,
            created_by: user.id
          });
        }
      });
    }

    // Flag items
    if (includeFlag) {
      flagItems.forEach(f => {
        if (f.notes.trim()) {
          suggestions.push({
            suggestion_type: 'add_flag',
            song_id: songId,
            note_type: f.type,
            note_content: f.notes.trim(),
            source_url: sourceUrl.trim() || null,
            reason: reason.trim() || null,
            batch_id: batchId,
            created_by: user.id
          });
        }
      });
    }

    // Submit all
    let successCount = 0;
    let failCount = 0;
    const newSuggestions = [];

    for (const suggestion of suggestions) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(suggestion)
        });
        const data = await res.json();
        if (data[0]) {
          newSuggestions.push(data[0]);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error('Error submitting:', error);
        failCount++;
      }
    }

    setMySuggestions(prev => [...newSuggestions, ...prev]);
    resetForm();
    setSubmitting(false);

    if (failCount === 0) {
      showMsg(`✅ Submitted ${successCount} suggestion(s)! An admin will review them.`);
    } else {
      showMsg(`⚠️ ${successCount} submitted, ${failCount} failed`);
    }
  };

  const typeLabels = {
    new_song: '🎵 New Song',
    new_version: '📝 New Version',
    media: '🎬 Media',
    note: '📋 Note',
    edit: '✏️ Edit',
    add_alias: '🏷️ Alias',
    add_flag: '⚠️ Flag'
  };

  const statusColors = {
    pending: { bg: '#f59e0b20', text: '#f59e0b' },
    approved: { bg: '#22c55e20', text: '#22c55e' },
    rejected: { bg: '#ef444420', text: '#ef4444' }
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '800px', margin: '0 auto', padding: '1.5rem' },
    card: { background: '#1e293b', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1.5rem' },
    cardTitle: { fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' },
    label: { display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem', marginTop: '0.75rem' },
    input: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', fontSize: '1rem' },
    textarea: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', fontSize: '1rem', minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' },
    select: { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', fontSize: '1rem' },
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', fontSize: '1rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' },
    checkbox: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' },
    checkboxActive: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#22c55e20', border: '1px solid #22c55e40', borderRadius: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' },
    fieldGroup: { background: '#0f172a', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.75rem', border: '1px solid #334155' },
    msg: { position: 'fixed', top: '4.5rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 1000 },
    modeBtn: (active) => ({ 
      flex: 1, 
      padding: '1rem', 
      background: active ? '#22c55e20' : '#0f172a', 
      border: active ? '2px solid #22c55e' : '1px solid #334155', 
      borderRadius: '0.5rem', 
      color: active ? '#22c55e' : '#94a3b8',
      cursor: 'pointer',
      fontWeight: active ? '600' : '400',
      fontSize: '1rem'
    })
  };

  if (loading) {
    return <div style={s.container}><div style={s.wrapper}><p>Loading...</p></div></div>;
  }

  const selectedSong = songs.find(s => s.id === selectedSongId);

  return (
    <div style={s.container}>
      <div style={s.wrapper}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>💡 Suggest Song Info</h1>

        {message && <div style={s.msg}>{message}</div>}

        {/* Mode Selection */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>What do you want to suggest?</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => setMode('new_song')} style={s.modeBtn(mode === 'new_song')}>
              🎵 New Song
            </button>
            <button onClick={() => setMode('existing_song')} style={s.modeBtn(mode === 'existing_song')}>
              ✏️ Add to Existing Song
            </button>
          </div>
        </div>

        {/* Main Form */}
        <div style={s.card}>
          {mode === 'new_song' ? (
            <>
              <h2 style={s.cardTitle}>🎵 Suggest a New Song</h2>
              <p style={{ color: '#94a3b8', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Fill in what you know - only the title is required.
              </p>

              <label style={s.label}>Song Title *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" style={s.input} />

              <label style={s.label}>Author / Lyricist</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Who wrote the lyrics?" style={s.input} />

              <label style={s.label}>Composer</label>
              <input type="text" value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Who wrote the music?" style={s.input} />

              <label style={s.label}>Lyrics</label>
              <textarea value={versionLyrics} onChange={(e) => setVersionLyrics(e.target.value)} placeholder="Paste the lyrics here..." style={{ ...s.textarea, minHeight: '200px', fontFamily: 'monospace' }} />
            </>
          ) : (
            <>
              <h2 style={s.cardTitle}>✏️ Add Info to Existing Song</h2>
              
              <label style={s.label}>Select Song *</label>
              <select value={selectedSongId} onChange={(e) => setSelectedSongId(e.target.value)} style={s.select}>
                <option value="">Choose a song...</option>
                {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              {selectedSongId && (
                <>
                  <p style={{ color: '#94a3b8', marginTop: '1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    Check what you want to add for "<strong style={{ color: '#fff' }}>{selectedSong?.title}</strong>"
                  </p>
                </>
              )}
            </>
          )}

          {/* Optional sections - show for both modes */}
          {(mode === 'new_song' || selectedSongId) && (
            <>
              <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#94a3b8' }}>Additional Info (check what you want to add)</h3>
              </div>

              {/* Basic Info */}
              {mode === 'existing_song' && (
                <>
                  <label style={includeAuthor ? s.checkboxActive : s.checkbox} onClick={() => setIncludeAuthor(!includeAuthor)}>
                    <input type="checkbox" checked={includeAuthor} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                    <span>✏️ Author / Lyricist</span>
                  </label>
                  {includeAuthor && (
                    <div style={s.fieldGroup}>
                      <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Who wrote the lyrics?" style={s.input} />
                    </div>
                  )}

                  <label style={includeComposer ? s.checkboxActive : s.checkbox} onClick={() => setIncludeComposer(!includeComposer)}>
                    <input type="checkbox" checked={includeComposer} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                    <span>🎼 Composer</span>
                  </label>
                  {includeComposer && (
                    <div style={s.fieldGroup}>
                      <input type="text" value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Who wrote the music?" style={s.input} />
                    </div>
                  )}
                </>
              )}

              <label style={includeYear ? s.checkboxActive : s.checkbox} onClick={() => setIncludeYear(!includeYear)}>
                <input type="checkbox" checked={includeYear} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>📅 Year Written</span>
              </label>
              {includeYear && (
                <div style={s.fieldGroup}>
                  <input type="text" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g., 1965" style={s.input} />
                </div>
              )}

              <label style={includeOrigin ? s.checkboxActive : s.checkbox} onClick={() => setIncludeOrigin(!includeOrigin)}>
                <input type="checkbox" checked={includeOrigin} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>🌍 Origin / Source</span>
              </label>
              {includeOrigin && (
                <div style={s.fieldGroup}>
                  <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g., American folk song, Hebrew, Camp tradition" style={s.input} />
                </div>
              )}

              <label style={includeTuneOf ? s.checkboxActive : s.checkbox} onClick={() => setIncludeTuneOf(!includeTuneOf)}>
                <input type="checkbox" checked={includeTuneOf} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>🎵 Tune Of (if sung to another melody)</span>
              </label>
              {includeTuneOf && (
                <div style={s.fieldGroup}>
                  <input type="text" value={tuneOf} onChange={(e) => setTuneOf(e.target.value)} placeholder="Name of the original song" style={s.input} />
                </div>
              )}

              <label style={includeAlias ? s.checkboxActive : s.checkbox} onClick={() => setIncludeAlias(!includeAlias)}>
                <input type="checkbox" checked={includeAlias} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>🏷️ Alternate Name(s)</span>
              </label>
              {includeAlias && (
                <div style={s.fieldGroup}>
                  {aliasItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: idx < aliasItems.length - 1 ? '0.5rem' : 0 }}>
                      <input type="text" value={item.title} onChange={(e) => updateAliasItem(idx, e.target.value)} placeholder="Another name this song is known by" style={{ ...s.input, flex: 1, marginBottom: 0 }} />
                      {aliasItems.length > 1 && (
                        <button onClick={() => removeAliasItem(idx)} style={{ ...s.btnSec, padding: '0.5rem 0.75rem' }}>×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addAliasItem} style={{ ...s.btnSec, marginTop: '0.5rem' }}>+ Add Another Name</button>
                </div>
              )}

              {/* Version */}
              <label style={includeVersion ? s.checkboxActive : s.checkbox} onClick={() => setIncludeVersion(!includeVersion)}>
                <input type="checkbox" checked={includeVersion} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>📝 {mode === 'new_song' ? 'Additional Version' : 'Add Version / Lyrics'}</span>
              </label>
              {includeVersion && (
                <div style={s.fieldGroup}>
                  <label style={{ ...s.label, marginTop: 0 }}>Version Label *</label>
                  <input type="text" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g., Camp version, Gender-neutral version" style={s.input} />
                  <label style={s.label}>Lyrics</label>
                  <textarea value={versionLyrics} onChange={(e) => setVersionLyrics(e.target.value)} placeholder="Paste the lyrics here..." style={{ ...s.textarea, minHeight: '150px', fontFamily: 'monospace' }} />
                </div>
              )}

              {/* Media */}
              <label style={includeMedia ? s.checkboxActive : s.checkbox} onClick={() => setIncludeMedia(!includeMedia)}>
                <input type="checkbox" checked={includeMedia} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>🎬 Media Links (YouTube, Spotify, etc.)</span>
              </label>
              {includeMedia && (
                <div style={s.fieldGroup}>
                  {mediaItems.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: idx < mediaItems.length - 1 ? '1rem' : 0, paddingBottom: idx < mediaItems.length - 1 ? '1rem' : 0, borderBottom: idx < mediaItems.length - 1 ? '1px solid #334155' : 'none' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <select value={item.type} onChange={(e) => updateMediaItem(idx, 'type', e.target.value)} style={{ ...s.select, flex: 1 }}>
                          <option value="youtube">YouTube</option>
                          <option value="spotify">Spotify</option>
                          <option value="soundcloud">SoundCloud</option>
                          <option value="audio">Other Audio</option>
                          <option value="video">Other Video</option>
                        </select>
                        {mediaItems.length > 1 && (
                          <button onClick={() => removeMediaItem(idx)} style={{ ...s.btnSec, padding: '0.5rem 0.75rem' }}>×</button>
                        )}
                      </div>
                      <input type="text" value={item.url} onChange={(e) => updateMediaItem(idx, 'url', e.target.value)} placeholder="https://..." style={{ ...s.input, marginBottom: '0.5rem' }} />
                      <input type="text" value={item.label} onChange={(e) => updateMediaItem(idx, 'label', e.target.value)} placeholder="Label (optional) - e.g., 'Official recording'" style={s.input} />
                    </div>
                  ))}
                  <button onClick={addMediaItem} style={{ ...s.btnSec, marginTop: '0.75rem' }}>+ Add Another Media Link</button>
                </div>
              )}

              {/* Note */}
              <label style={includeNote ? s.checkboxActive : s.checkbox} onClick={() => setIncludeNote(!includeNote)}>
                <input type="checkbox" checked={includeNote} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>📋 Note(s) (history, teaching tips, etc.)</span>
              </label>
              {includeNote && (
                <div style={s.fieldGroup}>
                  {noteItems.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: idx < noteItems.length - 1 ? '1rem' : 0, paddingBottom: idx < noteItems.length - 1 ? '1rem' : 0, borderBottom: idx < noteItems.length - 1 ? '1px solid #334155' : 'none' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <select value={item.type} onChange={(e) => updateNoteItem(idx, 'type', e.target.value)} style={{ ...s.select, flex: 1 }}>
                          <option value="history">History / Background</option>
                          <option value="teaching">Teaching Tips</option>
                          <option value="motions">Motions / Actions</option>
                          <option value="performance">Performance Notes</option>
                          <option value="other">Other</option>
                        </select>
                        {noteItems.length > 1 && (
                          <button onClick={() => removeNoteItem(idx)} style={{ ...s.btnSec, padding: '0.5rem 0.75rem' }}>×</button>
                        )}
                      </div>
                      <textarea value={item.content} onChange={(e) => updateNoteItem(idx, 'content', e.target.value)} placeholder="Share what you know..." style={s.textarea} />
                    </div>
                  ))}
                  <button onClick={addNoteItem} style={{ ...s.btnSec, marginTop: '0.5rem' }}>+ Add Another Note</button>
                </div>
              )}

              {/* Flag */}
              <label style={includeFlag ? s.checkboxActive : s.checkbox} onClick={() => setIncludeFlag(!includeFlag)}>
                <input type="checkbox" checked={includeFlag} onChange={() => {}} style={{ accentColor: '#22c55e' }} />
                <span>⚠️ Flag Issue(s)</span>
              </label>
              {includeFlag && (
                <div style={s.fieldGroup}>
                  {flagItems.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: idx < flagItems.length - 1 ? '1rem' : 0, paddingBottom: idx < flagItems.length - 1 ? '1rem' : 0, borderBottom: idx < flagItems.length - 1 ? '1px solid #334155' : 'none' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <select value={item.type} onChange={(e) => updateFlagItem(idx, 'type', e.target.value)} style={{ ...s.select, flex: 1 }}>
                          <option value="content_warning">Content Warning</option>
                          <option value="cultural_sensitivity">Cultural Sensitivity</option>
                          <option value="outdated_language">Outdated Language</option>
                          <option value="historical_context">Needs Historical Context</option>
                          <option value="other">Other</option>
                        </select>
                        {flagItems.length > 1 && (
                          <button onClick={() => removeFlagItem(idx)} style={{ ...s.btnSec, padding: '0.5rem 0.75rem' }}>×</button>
                        )}
                      </div>
                      <textarea value={item.notes} onChange={(e) => updateFlagItem(idx, 'notes', e.target.value)} placeholder="Describe the issue..." style={s.textarea} />
                    </div>
                  ))}
                  <button onClick={addFlagItem} style={{ ...s.btnSec, marginTop: '0.5rem' }}>+ Add Another Flag</button>
                </div>
              )}
            </>
          )}

          {/* Source and Reason */}
          {(mode === 'new_song' || selectedSongId) && (
            <>
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                <label style={s.label}>Where did you find this info? (optional)</label>
                <input type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Link to source (Wikipedia, camp website, etc.)" style={s.input} />

                <label style={s.label}>Any additional context? (optional)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Anything else you want to share..." style={{ ...s.textarea, minHeight: '80px' }} />
              </div>

              <button onClick={submitSuggestions} disabled={submitting} style={{ ...s.btn, width: '100%', marginTop: '1.5rem', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Submitting...' : '🚀 Submit Suggestion(s)'}
              </button>
            </>
          )}
        </div>

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
                    <div key={sug.id} style={{ padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div>
                          <span style={{ fontWeight: 'bold' }}>{typeLabels[sug.suggestion_type]}</span>
                          {song && <span style={{ color: '#94a3b8' }}> for "{song.title}"</span>}
                          {sug.title && <span style={{ color: '#94a3b8' }}> - {sug.title}</span>}
                          {sug.field_name && <span style={{ color: '#94a3b8' }}> ({sug.field_name})</span>}
                        </div>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          background: statusColor.bg,
                          color: statusColor.text
                        }}>
                          {sug.status}
                        </span>
                      </div>
                      {sug.admin_notes && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                          Admin: {sug.admin_notes}
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
