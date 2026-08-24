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
  const [allVersions, setAllVersions] = useState([]);
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

  const [versionAttrs, setVersionAttrs] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState(null);
  const [listWidth, setListWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [versionPrefs, setVersionPrefs] = useState({});

  const VERSION_ATTRIBUTE_LABELS = {
    'gender_neutral': 'Gender Neutral',
    'secular': 'Secular',
    'kid_friendly': 'Kid Friendly',
    'addresses_sensitivity': 'Addresses Sensitivity',
    'camp_specific': 'Camp-Specific',
    'other': 'Other'
  };

  const FAMILIARITY_OPTIONS = [
    { value: 'teach', label: '🎓 Can teach', color: '#22c55e' },
    { value: 'sing_along', label: '🎤 Sing along', color: '#3b82f6' },
    { value: 'heard_it', label: '👂 Heard it', color: '#f59e0b' },
    { value: 'dont_know', label: '❓ Don\'t know', color: '#64748b' }
  ];

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); loadData(); }, []);
  useEffect(() => { if (user) loadUserPrefs(); }, [user]);
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

  const loadUserPrefs = async () => {
    if (!user) return;
    try {
      const prefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
      const prefsData = await prefsRes.json();
      const prefsMap = {};
      if (Array.isArray(prefsData)) {
        prefsData.forEach(p => { prefsMap[p.song_id] = p; });
      }
      setUserPrefs(prefsMap);
      
      // Load version preferences
      const vPrefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
      const vPrefsData = await vPrefsRes.json();
      const vPrefsMap = {};
      if (Array.isArray(vPrefsData)) {
        vPrefsData.forEach(vp => { vPrefsMap[vp.version_id] = vp; });
      }
      setVersionPrefs(vPrefsMap);
    } catch (error) { console.error('Error loading preferences:', error); }
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
      
      // Load all versions for filtering
      const allVersionsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=id,song_id`, { headers: getAuthHeaders(false) });
      const allVersionsData = await allVersionsRes.json();
      setAllVersions(Array.isArray(allVersionsData) ? allVersionsData : []);

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
      const versionsArray = Array.isArray(versionsData) ? versionsData : [];
      setVersions(versionsArray);
      
      // Set default selected version (prefer singalong default)
      const defaultV = versionsArray.find(v => v.is_default_singalong) || versionsArray[0];
      setSelectedVersionId(defaultV?.id || null);
      setCompareVersionId(null);
      setCompareMode(false);

      // Load version attributes
      if (versionsArray.length > 0) {
        const versionIds = versionsArray.map(v => v.id).join(',');
        const attrsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_version_attributes?song_version_id=in.(${versionIds})&select=*`, { headers: getAuthHeaders(false) });
        const attrsData = await attrsRes.json();
        setVersionAttrs(Array.isArray(attrsData) ? attrsData : []);
      } else {
        setVersionAttrs([]);
      }

      // Load notes
      const notesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_notes?song_id=eq.${songId}&select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const notesData = await notesRes.json();
      setSongNotes(Array.isArray(notesData) ? notesData : []);

      // Load media
      try {
        const mediaRes = await fetch(`${SUPABASE_URL}/rest/v1/song_media?song_id=eq.${songId}&select=*&order=display_order.asc`, { headers: getAuthHeaders(false) });
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
      if (statusFilter === 'dislike' && !pref?.is_dislike) return false;
      if (statusFilter === 'known' && pref?.status !== 'known') return false;
      if (statusFilter === 'want_to_learn' && pref?.status !== 'want_to_learn') return false;
      // Untagged: no song-level preferences set at all
      if (statusFilter === 'untagged') {
        if (pref && (pref.is_favorite || pref.is_dislike || pref.status || (pref.personal_tags && pref.personal_tags.length > 0))) {
          return false;
        }
      }
      // No familiarity: none of the song's versions have familiarity set
      if (statusFilter === 'no_familiarity') {
        const songVers = allVersions.filter(v => v.song_id === song.id);
        const hasFamiliarity = songVers.some(v => versionPrefs[v.id]?.familiarity);
        if (hasFamiliarity) return false;
      }
      // Personal tag filter
      if (personalTagFilter && !pref?.personal_tags?.includes(personalTagFilter)) return false;
      return true;
    });
  }, [songs, search, songbookFilter, sectionFilter, tagFilter, statusFilter, personalTagFilter, userPrefs, allVersions, versionPrefs]);

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

  const toggleDislike = (songId) => {
    const current = userPrefs[songId]?.is_dislike || false;
    savePreference(songId, { is_dislike: !current });
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

  const setVersionFamiliarity = async (versionId, familiarity) => {
    if (!user) return;
    const existing = versionPrefs[versionId];
    
    try {
      if (existing) {
        if (familiarity === null || familiarity === '') {
          // Remove
          await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?id=eq.${existing.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          setVersionPrefs(prev => { const n = {...prev}; delete n[versionId]; return n; });
        } else {
          // Update
          await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?id=eq.${existing.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ familiarity, updated_at: new Date().toISOString() })
          });
          setVersionPrefs(prev => ({ ...prev, [versionId]: { ...existing, familiarity } }));
        }
      } else if (familiarity) {
        // Create
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ user_id: user.id, version_id: versionId, familiarity })
        });
        const data = await res.json();
        if (data[0]) {
          setVersionPrefs(prev => ({ ...prev, [versionId]: data[0] }));
        }
      }
    } catch (error) {
      console.error('Error setting familiarity:', error);
      showMessage('❌ Error saving');
    }
  };

  // Resize handlers
  const startResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(250, Math.min(600, e.clientX - 24)); // 24px for padding
      setListWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Get page for selected songbook
  const getPageForSongbook = (song) => {
    if (!songbookFilter) return song.songbooks?.[0]?.page || '';
    const entry = song.songbooks?.find(sb => sb.name === songbookFilter);
    return entry?.page || '';
  };

  // Render media embed
  const renderMedia = (media) => {
    const url = media.url || media.media_url;
    if (!url) return null;
    
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (ytMatch) {
      return (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, maxWidth: '400px' }}>
          <iframe
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '0.5rem' }}
            src={`https://www.youtube.com/embed/${ytMatch[1]}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    
    // Spotify
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([^?]+)/);
    if (spotifyMatch) {
      return (
        <iframe
          style={{ borderRadius: '0.5rem', maxWidth: '400px' }}
          src={`https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`}
          width="100%"
          height="152"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      );
    }
    
    // Generic link with preview card
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer" 
        style={{ 
          display: 'block',
          padding: '0.75rem',
          background: '#0f172a',
          borderRadius: '0.5rem',
          color: '#22c55e',
          textDecoration: 'none',
          fontSize: '0.875rem',
          wordBreak: 'break-all'
        }}
      >
        🔗 {url}
      </a>
    );
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: selectedSong ? `${listWidth}px 8px 1fr` : '1fr', gap: '0.5rem' },
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

            {user && (
              <div style={s.filterGroup}>
                <span style={s.filterLabel}>My Songs</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={s.select}>
                  <option value="">All</option>
                  <option value="favorite">⭐ Favorites</option>
                  <option value="dislike">👎 Dislikes</option>
                  <option value="known">✓ Known</option>
                  <option value="want_to_learn">📚 Want to Learn</option>
                  <option value="untagged">🔍 Untagged (no prefs)</option>
                  <option value="no_familiarity">🔍 No familiarity set</option>
                </select>
              </div>
            )}

            {user && allPersonalTags.length > 0 && (
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

        {/* Resize handle */}
        {selectedSong && (
          <div
            onMouseDown={startResize}
            style={{
              width: '8px',
              cursor: 'col-resize',
              background: isResizing ? '#22c55e' : '#334155',
              borderRadius: '4px',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.target.style.background = '#22c55e'}
            onMouseLeave={(e) => { if (!isResizing) e.target.style.background = '#334155'; }}
          >
            <div style={{ width: '2px', height: '40px', background: '#64748b', borderRadius: '1px' }} />
          </div>
        )}

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

            {/* Personal Actions - only for logged in users */}
            {user ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem' }}>
                <button 
                  onClick={() => toggleFavorite(selectedSong.id)} 
                  style={s.statusBtn(pref?.is_favorite, '#f59e0b')}
                >
                  ⭐ Favorite
                </button>
                <button 
                  onClick={() => toggleDislike(selectedSong.id)} 
                  style={s.statusBtn(pref?.is_dislike, '#ef4444')}
                >
                  👎 Dislike
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
            ) : (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                <Link href="/" style={{ color: '#22c55e' }}>Log in</Link> to save favorites and track songs you know
              </div>
            )}

            {/* Personal Tags - only for logged in users */}
            {user && (
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
            )}

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
                  <>
                    {/* Version selector */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Version:</span>
                      <select 
                        value={selectedVersionId || ''} 
                        onChange={(e) => setSelectedVersionId(e.target.value)}
                        style={{ ...s.select, minWidth: '200px' }}
                      >
                        {versions.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.label || 'Untitled'} 
                            {v.is_default_singalong ? ' ★' : ''}
                            {v.version_type === 'alternate' ? ' (alt)' : ''}
                          </option>
                        ))}
                      </select>
                      
                      {versions.length > 1 && (
                        <button 
                          style={compareMode ? s.btn : s.btnSec}
                          onClick={() => {
                            setCompareMode(!compareMode);
                            if (!compareMode && !compareVersionId) {
                              // Set compare to a different version
                              const other = versions.find(v => v.id !== selectedVersionId);
                              setCompareVersionId(other?.id || null);
                            }
                          }}
                        >
                          {compareMode ? '✓ Comparing' : '⇄ Compare'}
                        </button>
                      )}
                      
                      {compareMode && (
                        <select 
                          value={compareVersionId || ''} 
                          onChange={(e) => setCompareVersionId(e.target.value)}
                          style={{ ...s.select, minWidth: '200px' }}
                        >
                          {versions.filter(v => v.id !== selectedVersionId).map(v => (
                            <option key={v.id} value={v.id}>
                              {v.label || 'Untitled'}
                              {v.is_default_singalong ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Version display */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: compareMode ? '1fr 1fr' : '1fr', 
                      gap: '1rem' 
                    }}>
                      {/* Primary version */}
                      {(() => {
                        const v = versions.find(ver => ver.id === selectedVersionId) || versions[0];
                        const attrs = versionAttrs.filter(a => a.song_version_id === v?.id);
                        if (!v) return null;
                        return (
                          <div style={s.versionCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <span style={s.versionLabel}>{v.label || 'Version'}</span>
                                {v.version_type === 'alternate' && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#94a3b8' }}>(Alternate)</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {v.is_default_singalong && <span style={{ fontSize: '0.65rem', background: '#22c55e33', color: '#22c55e', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>★ Singalong</span>}
                                {v.is_default_explore && <span style={{ fontSize: '0.65rem', background: '#6366f133', color: '#6366f1', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>Explore</span>}
                              </div>
                            </div>
                            
                            {/* Version attributes */}
                            {attrs.length > 0 && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {attrs.map(a => (
                                  <span key={a.id} style={{ fontSize: '0.7rem', background: '#334155', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                                    {VERSION_ATTRIBUTE_LABELS[a.attribute_type] || a.attribute_type}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Version familiarity - logged in users */}
                            {user && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>How well I know this:</span>
                                <select
                                  value={versionPrefs[v.id]?.familiarity || ''}
                                  onChange={(e) => setVersionFamiliarity(v.id, e.target.value || null)}
                                  style={{ ...s.select, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                >
                                  <option value="">Not set</option>
                                  {FAMILIARITY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                {versionPrefs[v.id]?.familiarity && (
                                  <span style={{ 
                                    fontSize: '0.7rem', 
                                    padding: '0.2rem 0.5rem', 
                                    borderRadius: '0.25rem',
                                    background: `${FAMILIARITY_OPTIONS.find(o => o.value === versionPrefs[v.id]?.familiarity)?.color}20`,
                                    color: FAMILIARITY_OPTIONS.find(o => o.value === versionPrefs[v.id]?.familiarity)?.color
                                  }}>
                                    {FAMILIARITY_OPTIONS.find(o => o.value === versionPrefs[v.id]?.familiarity)?.label}
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {v.lyrics_content ? (
                              <div style={s.lyrics}>{v.lyrics_content}</div>
                            ) : (
                              <div style={{ color: '#64748b', fontStyle: 'italic', padding: '1rem' }}>No lyrics available for this version</div>
                            )}
                            
                            {v.version_notes && (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#94a3b8', padding: '0.5rem', background: '#1e293b', borderRadius: '0.25rem' }}>
                                <strong>Notes:</strong> {v.version_notes}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Compare version */}
                      {compareMode && (() => {
                        const v = versions.find(ver => ver.id === compareVersionId);
                        const attrs = versionAttrs.filter(a => a.song_version_id === v?.id);
                        if (!v) return <div style={s.versionCard}><p style={{ color: '#64748b' }}>Select a version to compare</p></div>;
                        return (
                          <div style={s.versionCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <span style={s.versionLabel}>{v.label || 'Version'}</span>
                                {v.version_type === 'alternate' && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#94a3b8' }}>(Alternate)</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {v.is_default_singalong && <span style={{ fontSize: '0.65rem', background: '#22c55e33', color: '#22c55e', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>★ Singalong</span>}
                                {v.is_default_explore && <span style={{ fontSize: '0.65rem', background: '#6366f133', color: '#6366f1', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>Explore</span>}
                              </div>
                            </div>
                            
                            {attrs.length > 0 && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {attrs.map(a => (
                                  <span key={a.id} style={{ fontSize: '0.7rem', background: '#334155', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                                    {VERSION_ATTRIBUTE_LABELS[a.attribute_type] || a.attribute_type}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Version familiarity - logged in users */}
                            {user && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>How well I know this:</span>
                                <select
                                  value={versionPrefs[v.id]?.familiarity || ''}
                                  onChange={(e) => setVersionFamiliarity(v.id, e.target.value || null)}
                                  style={{ ...s.select, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                >
                                  <option value="">Not set</option>
                                  {FAMILIARITY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            
                            {v.lyrics_content ? (
                              <div style={s.lyrics}>{v.lyrics_content}</div>
                            ) : (
                              <div style={{ color: '#64748b', fontStyle: 'italic', padding: '1rem' }}>No lyrics available</div>
                            )}
                            
                            {v.version_notes && (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#94a3b8', padding: '0.5rem', background: '#1e293b', borderRadius: '0.25rem' }}>
                                <strong>Notes:</strong> {v.version_notes}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <div style={s.emptyState}>
                    <p>No versions yet</p>
                    {selectedSong.lyrics_text && (
                      <div style={{ ...s.lyrics, marginTop: '1rem', maxWidth: '600px' }}>{selectedSong.lyrics_text}</div>
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
                    <div key={m.id} style={{ marginBottom: '1.5rem' }}>
                      {(m.label || m.title) && <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{m.label || m.title}</div>}
                      {m.description && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{m.description}</div>}
                      {renderMedia(m)}
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
