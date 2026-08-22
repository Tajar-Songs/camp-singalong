import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function Songs() {
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [songs, setSongs] = useState([]);
  const [songbooks, setSongbooks] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [userPrefs, setUserPrefs] = useState({});
  const [versions, setVersions] = useState([]);
  const [songNotes, setSongNotes] = useState([]);
  const [songMedia, setSongMedia] = useState([]);

  // UI state
  const [selectedSong, setSelectedSong] = useState(null);
  const [search, setSearch] = useState('');
  const [songbookFilter, setSongbookFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '', 'favorite', 'known', 'want_to_learn'
  const [personalTagFilter, setPersonalTagFilter] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('lyrics'); // 'lyrics', 'info', 'media', 'notes'
  const [personalTagInput, setPersonalTagInput] = useState('');

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (user) loadData(); }, [user]);
  useEffect(() => { if (selectedSong) loadSongDetails(selectedSong.id); }, [selectedSong?.id]);

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
      // Load songs
      const songsRes = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, { headers: getAuthHeaders(false) });
      const songsData = await songsRes.json();
      
      // Load songbooks
      const songbooksRes = await fetch(`${SUPABASE_URL}/rest/v1/songbooks?select=*`, { headers: getAuthHeaders(false) });
      const songbooksData = await songbooksRes.json();
      
      // Load songbook entries
      const entriesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, { headers: getAuthHeaders(false) });
      const entriesData = await entriesRes.json();
      
      // Load tags
      const tagsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, { headers: getAuthHeaders(false) });
      const tagsData = await tagsRes.json();
      
      // Load user preferences
      if (user) {
        const prefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
        const prefsData = await prefsRes.json();
        const prefsMap = {};
        if (Array.isArray(prefsData)) {
          prefsData.forEach(p => { prefsMap[p.song_id] = p; });
        }
        setUserPrefs(prefsMap);
      }

      // Build songbook map
      const songbookMap = {};
      if (Array.isArray(songbooksData)) {
        songbooksData.forEach(sb => { songbookMap[sb.id] = sb.name; });
      }

      // Enrich songs with songbooks and tags
      const enrichedSongs = (Array.isArray(songsData) ? songsData : []).map(song => {
        const songEntries = (Array.isArray(entriesData) ? entriesData : []).filter(e => e.song_id === song.id);
        const songTags = (Array.isArray(tagsData) ? tagsData : []).filter(t => t.song_id === song.id).map(t => t.tag);
        return {
          ...song,
          tags: songTags,
          songbooks: songEntries.map(e => ({
            id: e.songbook_id,
            name: songbookMap[e.songbook_id] || 'Unknown',
            section: e.section,
            page: e.page
          }))
        };
      });

      setSongs(enrichedSongs);
      setSongbooks(Array.isArray(songbooksData) ? songbooksData : []);
      
      // Collect all unique tags
      const tagSet = new Set();
      enrichedSongs.forEach(s => s.tags?.forEach(t => tagSet.add(t)));
      setAllTags([...tagSet].sort());

    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadSongDetails = async (songId) => {
    try {
      // Load versions
      const versionsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${songId}&select=*`, { headers: getAuthHeaders(false) });
      const versionsData = await versionsRes.json();
      setVersions(Array.isArray(versionsData) ? versionsData : []);

      // Load notes
      const notesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_notes?song_id=eq.${songId}&select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const notesData = await notesRes.json();
      setSongNotes(Array.isArray(notesData) ? notesData : []);

      // Load media (if table exists)
      try {
        const mediaRes = await fetch(`${SUPABASE_URL}/rest/v1/song_media?song_id=eq.${songId}&select=*`, { headers: getAuthHeaders(false) });
        const mediaData = await mediaRes.json();
        setSongMedia(Array.isArray(mediaData) ? mediaData : []);
      } catch { setSongMedia([]); }

    } catch (error) {
      console.error('Error loading song details:', error);
    }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  // Get unique sections for current songbook filter
  const availableSections = useMemo(() => {
    if (!songbookFilter) return [];
    const sections = new Set();
    songs.forEach(song => {
      song.songbooks?.forEach(sb => {
        if (sb.name === songbookFilter && sb.section) sections.add(sb.section);
      });
    });
    return [...sections].sort();
  }, [songs, songbookFilter]);

  // Get all personal tags
  const allPersonalTags = useMemo(() => {
    const tags = new Set();
    Object.values(userPrefs).forEach(p => {
      if (p.personal_tags) p.personal_tags.forEach(t => tags.add(t));
    });
    return [...tags].sort();
  }, [userPrefs]);

  // Filter songs
  const filteredSongs = useMemo(() => {
    return songs.filter(song => {
      // Search filter
      if (search) {
        const s = search.toLowerCase();
        if (!song.title?.toLowerCase().includes(s) && 
            !song.author?.toLowerCase().includes(s) &&
            !song.composer?.toLowerCase().includes(s)) return false;
      }
      // Songbook filter
      if (songbookFilter && !song.songbooks?.some(sb => sb.name === songbookFilter)) return false;
      // Section filter
      if (sectionFilter && !song.songbooks?.some(sb => sb.name === songbookFilter && sb.section === sectionFilter)) return false;
      // Tag filter
      if (tagFilter && !song.tags?.includes(tagFilter)) return false;
      // Status filters
      const pref = userPrefs[song.id];
      if (statusFilter === 'favorite' && !pref?.is_favorite) return false;
      if (statusFilter === 'known' && pref?.status !== 'known') return false;
      if (statusFilter === 'want_to_learn' && pref?.status !== 'want_to_learn') return false;
      // Personal tag filter
      if (personalTagFilter && !pref?.personal_tags?.includes(personalTagFilter)) return false;
      return true;
    });
  }, [songs, search, songbookFilter, sectionFilter, tagFilter, statusFilter, personalTagFilter, userPrefs]);

  // Save user preference
  const savePreference = async (songId, updates) => {
    if (!user) return;
    
    const existing = userPrefs[songId];
    const newPref = { ...existing, ...updates, user_id: user.id, song_id: songId, updated_at: new Date().toISOString() };
    
    try {
      if (existing?.id) {
        // Update
        await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?id=eq.${existing.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(updates)
        });
      } else {
        // Insert
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(newPref)
        });
        const created = await res.json();
        if (created[0]) newPref.id = created[0].id;
      }
      setUserPrefs(prev => ({ ...prev, [songId]: newPref }));
    } catch (error) {
      console.error('Error saving preference:', error);
      showMessage('❌ Error saving');
    }
  };

  const toggleFavorite = (songId) => {
    const current = userPrefs[songId]?.is_favorite || false;
    savePreference(songId, { is_favorite: !current });
  };

  const setStatus = (songId, status) => {
    const current = userPrefs[songId]?.status;
    // Toggle off if clicking same status
    savePreference(songId, { status: current === status ? null : status });
  };

  const addPersonalTag = (songId, tag) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const current = userPrefs[songId]?.personal_tags || [];
    if (!current.includes(t)) {
      savePreference(songId, { personal_tags: [...current, t] });
    }
    setPersonalTagInput('');
  };

  const removePersonalTag = (songId, tag) => {
    const current = userPrefs[songId]?.personal_tags || [];
    savePreference(songId, { personal_tags: current.filter(t => t !== tag) });
  };

  // Get page for selected songbook
  const getPageForSongbook = (song) => {
    if (!songbookFilter) return song.songbooks?.[0]?.page || '';
    const entry = song.songbooks?.find(sb => sb.name === songbookFilter);
    return entry?.page || '';
  };

  // Render media embed
  const renderMedia = (url) => {
    if (!url) return null;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (ytMatch) {
      return (
        <iframe
          width="100%"
          height="200"
          src={`https://www.youtube.com/embed/${ytMatch[1]}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: '0.5rem' }}
        />
      );
    }
    // Generic link
    return <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e' }}>{url}</a>;
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: selectedSong ? '400px 1fr' : '1fr', gap: '1.5rem' },
    header: { marginBottom: '1rem' },
    title: { fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    subtitle: { color: '#94a3b8', fontSize: '0.875rem' },
    filters: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' },
    input: { padding: '0.5rem 0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', outline: 'none', fontSize: '0.875rem' },
    select: { padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    filterLabel: { fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', overflow: 'hidden' },
    songList: { maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' },
    songItem: (active) => ({ 
      padding: '0.75rem 1rem', 
      borderBottom: '1px solid #334155', 
      cursor: 'pointer', 
      background: active ? '#22c55e15' : 'transparent',
      borderLeft: active ? '3px solid #22c55e' : '3px solid transparent',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '0.5rem'
    }),
    songTitle: { fontWeight: '500', marginBottom: '0.25rem' },
    songMeta: { fontSize: '0.75rem', color: '#64748b' },
    songPage: { fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' },
    favStar: (active) => ({ 
      color: active ? '#fbbf24' : '#475569', 
      cursor: 'pointer', 
      fontSize: '1.25rem',
      lineHeight: 1
    }),
    main: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.5rem', minHeight: '60vh' },
    tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' },
    tab: (active) => ({ 
      padding: '0.5rem 1rem', 
      background: active ? '#334155' : 'transparent', 
      border: 'none', 
      borderRadius: '0.375rem', 
      color: active ? '#fff' : '#94a3b8', 
      cursor: 'pointer',
      fontSize: '0.875rem'
    }),
    btn: { background: '#22c55e', color: '#fff', border: 'none', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    btnSmall: { background: '#334155', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' },
    statusBtn: (active, color) => ({
      background: active ? color : '#334155',
      color: '#fff',
      border: 'none',
      padding: '0.375rem 0.75rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.75rem',
      opacity: active ? 1 : 0.6
    }),
    tag: { display: 'inline-block', background: '#334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    personalTag: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#6366f133', border: '1px solid #6366f1', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    lyrics: { whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: '1.1rem', lineHeight: '1.8', padding: '1rem', background: '#0f172a', borderRadius: '0.5rem' },
    versionCard: { padding: '1rem', background: '#0f172a', borderRadius: '0.5rem', marginBottom: '1rem' },
    versionLabel: { fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#22c55e' },
    infoRow: { display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' },
    infoLabel: { color: '#64748b', minWidth: '120px' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#64748b' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={{ ...s.container, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <div style={{ fontSize: '4rem' }}>🎵</div>
        <h1 style={{ fontSize: '1.5rem' }}>Song Library</h1>
        <p style={{ color: '#94a3b8' }}>Please log in to explore songs.</p>
        <Link href="/" style={{ ...s.btn, textDecoration: 'none' }}>Go to Login</Link>
      </div>
    );
  }

  const pref = selectedSong ? userPrefs[selectedSong.id] : null;

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}

      <div style={s.wrapper}>
        {/* Song List Panel */}
        <div>
          <div style={s.header}>
            <h1 style={s.title}>🎵 Songs</h1>
            <p style={s.subtitle}>{filteredSongs.length} of {songs.length} songs</p>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search songs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...s.input, width: '100%', marginBottom: '0.75rem' }}
          />

          {/* Filters */}
          <div style={s.filters}>
            <div style={s.filterGroup}>
              <span style={s.filterLabel}>Songbook</span>
              <select value={songbookFilter} onChange={(e) => { setSongbookFilter(e.target.value); setSectionFilter(''); }} style={s.select}>
                <option value="">All</option>
                {songbooks.map(sb => <option key={sb.id} value={sb.name}>{sb.name}</option>)}
              </select>
            </div>

            {songbookFilter && availableSections.length > 0 && (
              <div style={s.filterGroup}>
                <span style={s.filterLabel}>Section</span>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={s.select}>
                  <option value="">All</option>
                  {availableSections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                </select>
              </div>
            )}

            {allTags.length > 0 && (
              <div style={s.filterGroup}>
                <span style={s.filterLabel}>Tag</span>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={s.select}>
                  <option value="">All</option>
                  {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>
            )}

            <div style={s.filterGroup}>
              <span style={s.filterLabel}>My Songs</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={s.select}>
                <option value="">All</option>
                <option value="favorite">⭐ Favorites</option>
                <option value="known">✓ Known</option>
                <option value="want_to_learn">📚 Want to Learn</option>
              </select>
            </div>

            {allPersonalTags.length > 0 && (
              <div style={s.filterGroup}>
                <span style={s.filterLabel}>My Tags</span>
                <select value={personalTagFilter} onChange={(e) => setPersonalTagFilter(e.target.value)} style={s.select}>
                  <option value="">All</option>
                  {allPersonalTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Song List */}
          <div style={s.card}>
            <div style={s.songList}>
              {filteredSongs.map(song => {
                const songPref = userPrefs[song.id];
                return (
                  <div key={song.id} onClick={() => setSelectedSong(song)} style={s.songItem(selectedSong?.id === song.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.songTitle}>
                        {songPref?.is_favorite && <span style={{ marginRight: '0.25rem' }}>⭐</span>}
                        {song.title}
                        {songPref?.status === 'known' && <span style={{ marginLeft: '0.5rem', color: '#22c55e', fontSize: '0.75rem' }}>✓</span>}
                        {songPref?.status === 'want_to_learn' && <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.75rem' }}>📚</span>}
                      </div>
                      <div style={s.songMeta}>
                        {song.author && <span>{song.author}</span>}
                        {song.tags?.length > 0 && (
                          <span style={{ marginLeft: song.author ? '0.5rem' : 0 }}>
                            {song.tags.slice(0, 2).map(t => <span key={t} style={{ ...s.tag, padding: '0.1rem 0.3rem', marginRight: '0.2rem' }}>{t}</span>)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={s.songPage}>{getPageForSongbook(song)}</div>
                  </div>
                );
              })}
              {filteredSongs.length === 0 && (
                <div style={s.emptyState}>No songs match your filters</div>
              )}
            </div>
          </div>
        </div>

        {/* Song Detail Panel */}
        {selectedSong && (
          <div style={s.main}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{selectedSong.title}</h2>
                <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                  {selectedSong.songbooks?.map(sb => (
                    <span key={sb.id} style={{ marginRight: '1rem' }}>{sb.name}: {sb.page}</span>
                  ))}
                </div>
              </div>
              <button style={s.btnSec} onClick={() => setSelectedSong(null)}>×</button>
            </div>

            {/* Personal Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem' }}>
              <button 
                onClick={() => toggleFavorite(selectedSong.id)} 
                style={s.statusBtn(pref?.is_favorite, '#f59e0b')}
              >
                ⭐ Favorite
              </button>
              <button 
                onClick={() => setStatus(selectedSong.id, 'known')} 
                style={s.statusBtn(pref?.status === 'known', '#22c55e')}
              >
                ✓ Known
              </button>
              <button 
                onClick={() => setStatus(selectedSong.id, 'want_to_learn')} 
                style={s.statusBtn(pref?.status === 'want_to_learn', '#6366f1')}
              >
                📚 Want to Learn
              </button>
            </div>

            {/* Personal Tags */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>My Tags:</div>
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {pref?.personal_tags?.map(tag => (
                  <span key={tag} style={s.personalTag}>
                    {tag}
                    <button onClick={() => removePersonalTag(selectedSong.id, tag)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="+ Add tag"
                  value={personalTagInput}
                  onChange={(e) => setPersonalTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addPersonalTag(selectedSong.id, personalTagInput); } }}
                  style={{ ...s.input, width: '100px', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                />
              </div>
            </div>

            {/* Global Tags */}
            {selectedSong.tags?.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Tags:</div>
                {selectedSong.tags.map(tag => <span key={tag} style={s.tag}>{tag}</span>)}
              </div>
            )}

            {/* Tabs */}
            <div style={s.tabs}>
              <button style={s.tab(activeTab === 'lyrics')} onClick={() => setActiveTab('lyrics')}>Lyrics</button>
              <button style={s.tab(activeTab === 'info')} onClick={() => setActiveTab('info')}>Info</button>
              <button style={s.tab(activeTab === 'media')} onClick={() => setActiveTab('media')}>Media {songMedia.length > 0 && `(${songMedia.length})`}</button>
              <button style={s.tab(activeTab === 'notes')} onClick={() => setActiveTab('notes')}>Notes {songNotes.length > 0 && `(${songNotes.length})`}</button>
            </div>

            {/* Tab Content */}
            {activeTab === 'lyrics' && (
              <div>
                {versions.length > 0 ? (
                  versions.map(v => (
                    <div key={v.id} style={s.versionCard}>
                      {v.label && <div style={s.versionLabel}>{v.label}</div>}
                      {v.lyrics ? (
                        <div style={s.lyrics}>{v.lyrics}</div>
                      ) : (
                        <div style={{ color: '#64748b', fontStyle: 'italic' }}>No lyrics available</div>
                      )}
                      {v.performance_notes && (
                        <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          <strong>Performance notes:</strong> {v.performance_notes}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={s.emptyState}>
                    <p>No versions yet</p>
                    {selectedSong.lyrics_text && (
                      <div style={{ ...s.lyrics, marginTop: '1rem' }}>{selectedSong.lyrics_text}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'info' && (
              <div>
                {selectedSong.author && <div style={s.infoRow}><span style={s.infoLabel}>Author:</span> {selectedSong.author}</div>}
                {selectedSong.composer && <div style={s.infoRow}><span style={s.infoLabel}>Composer:</span> {selectedSong.composer}</div>}
                {selectedSong.origin && <div style={s.infoRow}><span style={s.infoLabel}>Origin:</span> {selectedSong.origin}</div>}
                {selectedSong.year_written && <div style={s.infoRow}><span style={s.infoLabel}>Year:</span> {selectedSong.year_written}</div>}
                {selectedSong.tune_of && <div style={s.infoRow}><span style={s.infoLabel}>Tune of:</span> {selectedSong.tune_of}</div>}
                {selectedSong.original_language && <div style={s.infoRow}><span style={s.infoLabel}>Language:</span> {selectedSong.original_language}</div>}
                {!selectedSong.author && !selectedSong.composer && !selectedSong.origin && (
                  <div style={s.emptyState}>No additional info available</div>
                )}
              </div>
            )}

            {activeTab === 'media' && (
              <div>
                {songMedia.length > 0 ? (
                  songMedia.map(m => (
                    <div key={m.id} style={{ marginBottom: '1rem' }}>
                      {m.label && <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{m.label}</div>}
                      {renderMedia(m.url)}
                    </div>
                  ))
                ) : (
                  <div style={s.emptyState}>No media available</div>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div>
                {songNotes.length > 0 ? (
                  songNotes.map(n => (
                    <div key={n.id} style={{ padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                      {n.note_type && <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{n.note_type}</span>}
                      <div style={{ marginTop: '0.25rem' }}>{n.note}</div>
                    </div>
                  ))
                ) : (
                  <div style={s.emptyState}>No notes available</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state when no song selected */}
        {!selectedSong && (
          <div style={{ ...s.main, ...s.emptyState }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎶</div>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Select a song</div>
            <div>Click a song from the list to view details</div>
          </div>
        )}
      </div>
    </div>
  );
}
