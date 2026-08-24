import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const SECTION_INFO = {
  A: "Graces", B: "Girl Scout Standards", C: "Camp Arrowhead Songs", D: "Patriotic Songs",
  E: "Traditional & Folk Songs", F: "Morning Songs", G: "Animal Songs", H: "Action Songs",
  I: "Silly Songs", J: "Food Songs", K: "Echo/Repeat Songs", L: "Campfire Songs",
  M: "Lullabies", N: "Friendship Songs", O: "Happiness, Fun & Laughter", P: "Love Songs",
  Q: "Peace Songs", R: "Outdoor Songs", S: "Songs to be Sung Together",
  T: "Rounds that need Translation", U: "Rounds & Canons", V: "Contemporary Folk Songs",
  W: "Kids' Movies & Musicals"
};

const ROOM_CODE_WORDS = [
  'SUNSHINE', 'MOONLIGHT', 'STARLIGHT', 'RAINBOW', 'BARGES', 'CAMPFIRE',
  'MOUNTAIN', 'MEADOW', 'RIVER', 'FOREST', 'WILDFLOWER', 'BLACKBERRY',
  'SPARROW', 'TURTLE', 'CRICKET', 'HARMONY', 'MELODY', 'LULLABY',
  'CANOE', 'LANTERN', 'DEWDROP', 'SUNRISE', 'SUNSET', 'MAGIC',
  'DREAM', 'WIND', 'PEACE', 'FRIENDS', 'LINGER', 'WANDER',
  'ROVER', 'HAPPY', 'BUGS', 'LAKE', 'WANEEYA', 'ELAHAN',
  'TAHOMA', 'MOWICH', 'KLICKITAT', 'LOOWIT', 'TYHEE', 'ILLAHEE',
  'WYEAST', 'CELILO', 'ROMANY', 'CHEESIAH', 'DOGMTN', 'WINDMTN',
  'TAJAR', 'PHIF', 'TILLIE', 'CEDAR', 'MAPLE', 'HEMLOCK',
  'ALDER', 'CASCADE', 'GORGE', 'RAPIDS', 'SALMON', 'TRILLIUM',
  'FERN', 'MOSS', 'HUCKLEBERRY', 'CHINOOK', 'RAVEN', 'EAGLE',
  'VOLCANO', 'LANDSLIDE', 'BANDANA', 'TRAILHEAD', 'SUMMIT', 'RIDGE',
  'CREEK', 'PINE', 'SPRUCE', 'EVERGREEN', 'PIXIE'
];

const generateRoomCode = () => {
  const word = ROOM_CODE_WORDS[Math.floor(Math.random() * ROOM_CODE_WORDS.length)];
  const number = Math.floor(Math.random() * 90) + 10;
  return word + number;
};

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [view, setView] = useState('control');
  const [queue, setQueue] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [sungSongs, setSungSongs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSections, setSelectedSections] = useState(Object.keys(SECTION_INFO));
  const [showSectionFilter, setShowSectionFilter] = useState(false);
  const [customSongInput, setCustomSongInput] = useState('');
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showLyricsOnTV, setShowLyricsOnTV] = useState(false);
  
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'signup', 'magic'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  
  // Session history
  const [sessionHistory, setSessionHistory] = useState([]);
  const [historyLookback, setHistoryLookback] = useState(3); // number of sessions
  
  // Tag filtering state
  const [tags, setTags] = useState([]);
  const [songTags, setSongTags] = useState([]);
  const [songVersions, setSongVersions] = useState([]);
  const [songNotes, setSongNotes] = useState([]);
  const [songAliases, setSongAliases] = useState([]);
  const [includeTagIds, setIncludeTagIds] = useState([]); // "Also include" tags
  const [excludeTagIds, setExcludeTagIds] = useState([]); // "Exclude" tags
  
  // Expanded notes tracking (which note types are currently shown)
  const [expandedNotes, setExpandedNotes] = useState([]);
  
  // Group data
  const [songGroups, setSongGroups] = useState([]);
  const [songGroupMembers, setSongGroupMembers] = useState([]);
  const [songbookEntries, setSongbookEntries] = useState([]);
  const [songbooks, setSongbooks] = useState([]);
  
  // Group prompt modal
  const [groupPrompt, setGroupPrompt] = useState(null); // { song, groups } when showing prompt

  // Toast notification
  const [toast, setToast] = useState(null); // { message, type }
  
  // Collapsible sections
  const [showQueue, setShowQueue] = useState(true);
  const [showAddSong, setShowAddSong] = useState(true);
  
  // Expanded lyrics in search
  const [expandedLyrics, setExpandedLyrics] = useState([]); // array of song IDs
  
  // Expanded flag details
  const [expandedFlags, setExpandedFlags] = useState([]); // array of flag IDs
  
  // Admin menu dropdown
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  
  // Song flags
  const [songFlags, setSongFlags] = useState([]);

  // Show toast helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper function to get auth headers (uses user token if available, otherwise anon key)
  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(darkModeQuery.matches);
    const handler = (e) => setIsDark(e.matches);
    darkModeQuery.addEventListener('change', handler);
    return () => darkModeQuery.removeEventListener('change', handler);
  }, []);

  // Check for login query param to open auth modal
  useEffect(() => {
    if (router.query.login === 'true') {
      setShowAuthModal(true);
      // Clean up URL
      router.replace('/', undefined, { shallow: true });
    }
  }, [router.query.login]);

  // Check for existing auth session on load
  useEffect(() => {
    checkAuthSession();
  }, []);

  useEffect(() => { loadSongs(); loadTags(); }, []);

  // Load session history when user changes
  useEffect(() => {
    if (user) {
      loadSessionHistory();
    } else {
      setSessionHistory([]);
    }
  }, [user]);

  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => { loadRoomData(); }, 2000);
    return () => clearInterval(interval);
  }, [roomCode]);

  // Auth functions
  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('supabase_refresh_token');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('supabase_access_token', data.access_token);
        localStorage.setItem('supabase_refresh_token', data.refresh_token);
        return true;
      }
    } catch (error) { console.log('Token refresh failed'); }
    return false;
  };

  const checkAuthSession = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) return;
      
      let res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
      
      // If token expired, try to refresh
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` }
          });
        }
      }
      
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        loadUserProfile(userData.id);
      }
    } catch (error) { console.log('No existing session'); }
  };

  const loadUserProfile = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` }
      });
      const data = await res.json();
      if (data.length > 0) setUserProfile(data[0]);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadSessionHistory = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/session_history?user_id=eq.${user.id}&order=sung_at.desc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` }
      });
      const data = await res.json();
      setSessionHistory(data);
    } catch (error) { console.error('Error loading history:', error); }
  };

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://tajar.fun/auth/callback';
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: authEmail, 
          password: authPassword,
          data: { display_name: authDisplayName || authEmail },
          options: { emailRedirectTo: redirectUrl }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      setAuthMessage('Check your email to confirm your account!');
      setAuthMode('login');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      localStorage.setItem('supabase_access_token', data.access_token);
      localStorage.setItem('supabase_refresh_token', data.refresh_token);
      setUser(data.user);
      loadUserProfile(data.user.id);
      setShowAuthModal(false);
      resetAuthForm();
      // Notify _app.js to update nav
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleMagicLink = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://tajar.fun/auth/callback';
      const res = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, options: { emailRedirectTo: redirectUrl } })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      setAuthMessage('Check your email for the magic link!');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('supabase_access_token');
    localStorage.removeItem('supabase_refresh_token');
    setUser(null);
    setUserProfile(null);
    setSessionHistory([]);
  };

  const resetAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthDisplayName('');
    setAuthError('');
    setAuthMessage('');
  };

  const recordSongSung = async (songId) => {
    if (!user) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/session_history`, {
        method: 'POST',
        headers: { 
          'apikey': SUPABASE_KEY, 
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: user.id,
          song_id: songId,
          room_id: roomCode
        })
      });
      loadSessionHistory();
    } catch (error) { console.error('Error recording song:', error); }
  };

  // Get unique session dates for history lookback
  const getRecentSessionDates = () => {
    const dates = [...new Set(sessionHistory.map(h => h.session_date))];
    return dates.slice(0, historyLookback);
  };

  // Get song IDs sung in recent sessions
  const getRecentlySungSongIds = () => {
    const recentDates = getRecentSessionDates();
    return sessionHistory
      .filter(h => recentDates.includes(h.session_date))
      .map(h => h.song_id);
  };

  const loadSongs = async () => {
    try {
      const [songsRes, versionsRes, notesRes, aliasesRes, groupsRes, membersRes, entriesRes, songbooksRes, flagsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_notes?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_aliases?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_groups?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_group_members?select=*&order=position_in_group.asc`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/songbooks?select=*&order=display_order.asc`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_flags?select=*`, {
          headers: getAuthHeaders(false)
        })
      ]);
      
      // Parse responses and ensure they're arrays
      const songs = await songsRes.json();
      const versions = await versionsRes.json();
      const notes = await notesRes.json();
      const aliases = await aliasesRes.json();
      const groups = await groupsRes.json();
      const members = await membersRes.json();
      const entries = await entriesRes.json();
      const books = await songbooksRes.json();
      const flags = await flagsRes.json();
      
      // Only set state if we got arrays (not error objects)
      if (Array.isArray(songs)) setAllSongs(songs);
      if (Array.isArray(versions)) setSongVersions(versions);
      if (Array.isArray(notes)) setSongNotes(notes);
      if (Array.isArray(aliases)) setSongAliases(aliases);
      if (Array.isArray(groups)) setSongGroups(groups);
      if (Array.isArray(members)) setSongGroupMembers(members);
      if (Array.isArray(entries)) setSongbookEntries(entries);
      if (Array.isArray(books)) setSongbooks(books);
      if (Array.isArray(flags)) setSongFlags(flags);
    } catch (error) { console.error('Error loading songs:', error); }
  };

  // Get flags for a song
  const getSongFlags = (songId) => songFlags.filter(f => f.song_id === songId);

  // Get the default singalong version for a song
  const getDefaultVersion = (songId) => {
    return songVersions.find(v => v.song_id === songId && v.is_default_singalong) 
      || songVersions.find(v => v.song_id === songId);
  };

  // Check if a song has any version with lyrics
  const songHasLyrics = (songId) => {
    return songVersions.some(v => v.song_id === songId && v.lyrics_content);
  };

  // Get aliases for a song
  const getSongAliases = (songId) => songAliases.filter(a => a.song_id === songId);

  // Get all versions for a song
  const getSongVersions = (songId) => songVersions.filter(v => v.song_id === songId);

  // Get groups that a song belongs to
  const getGroupsForSong = (songId) => {
    const memberEntries = songGroupMembers.filter(m => m.song_id === songId);
    return memberEntries.map(m => songGroups.find(g => g.id === m.group_id)).filter(Boolean);
  };

  // Get members of a group (in order)
  const getGroupMembers = (groupId) => {
    return songGroupMembers
      .filter(m => m.group_id === groupId)
      .sort((a, b) => a.position_in_group - b.position_in_group);
  };

  // Get page info for a group from songbook entries
  const getGroupPage = (groupId) => {
    // Get primary songbook entry, or fall back to any entry
    const primarySongbook = songbooks.find(sb => sb.is_primary);
    let entry = songbookEntries.find(e => e.song_group_id === groupId && e.songbook_id === primarySongbook?.id);
    if (!entry) {
      entry = songbookEntries.find(e => e.song_group_id === groupId);
    }
    return entry ? { page: entry.page, section: entry.section } : null;
  };

  // Get page info for a song from songbook entries
  const getSongPage = (songId) => {
    // Get primary songbook entry
    const primarySongbook = songbooks.find(sb => sb.is_primary);
    const primaryEntry = songbookEntries.find(e => e.song_id === songId && e.songbook_id === primarySongbook?.id);
    
    // Get old songbook entry (display_order 2 = pre-2025)
    const oldSongbook = songbooks.find(sb => sb.display_order === 2);
    const oldEntry = songbookEntries.find(e => e.song_id === songId && e.songbook_id === oldSongbook?.id);
    
    return {
      page: primaryEntry?.page || null,
      section: primaryEntry?.section || null,
      old_page: oldEntry?.page || null
    };
  };

  // Get display string for page info
  const formatPageDisplay = (pageInfo) => {
    if (!pageInfo) return 'N/A';
    const { page, old_page } = pageInfo;
    if (!page && !old_page) return 'N/A';
    if (page && old_page) return `${page} (${old_page})`;
    return page || old_page || 'N/A';
  };

  // Get notes for a song by type
  const getNotesForSong = (songId) => {
    return songNotes.filter(n => n.song_id === songId);
  };

  // Get notes for a song grouped by type
  const getNotesByType = (songId, noteType) => {
    return songNotes.filter(n => n.song_id === songId && n.note_type === noteType);
  };

  // Toggle a note type expansion
  const toggleNoteType = (noteType) => {
    setExpandedNotes(prev => 
      prev.includes(noteType) 
        ? prev.filter(t => t !== noteType)
        : [...prev, noteType]
    );
  };

  // Note type display names
  const NOTE_TYPE_LABELS = {
    'round_instruction': 'Round Instructions',
    'performance_instruction': 'Performance Tips',
    'history': 'History',
    'pronunciation': 'Pronunciation',
    'call_response_structure': 'Call & Response',
    'accompaniment': 'Accompaniment',
    'fill_in_blank': 'Fill in the Blank',
    'alternate_verse_info': 'Alternate Verses',
    'other': 'Notes'
  };

  // Instruction types (shown above lyrics)
  const INSTRUCTION_TYPES = ['round_instruction', 'performance_instruction', 'call_response_structure'];

  // Get the full song object for the current song (to get ID for notes lookup)
  const getCurrentSongFull = () => {
    if (!currentSong) return null;
    return allSongs.find(s => s.title === currentSong.title);
  };

  const loadTags = async () => {
    try {
      const [tagsRes, songTagsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/tags?select=*&order=name.asc`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, {
          headers: getAuthHeaders(false)
        })
      ]);
      setTags(await tagsRes.json());
      setSongTags(await songTagsRes.json());
    } catch (error) { console.error('Error loading tags:', error); }
  };

  // Helper: Check if song has a specific tag
  const songHasTag = (songId, tagId) => {
    return songTags.some(st => st.song_id === songId && st.tag_id === tagId);
  };

  // Helper: Check if song has ANY of the given tags
  const songHasAnyTag = (songId, tagIds) => {
    if (!tagIds || tagIds.length === 0) return false;
    return tagIds.some(tagId => songHasTag(songId, tagId));
  };

  const createRoom = async () => {
    const code = generateRoomCode();
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rooms`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: code, current_song: null, sung_songs: [] })
      });
      if (response.ok) router.push(`/room/${code}`);
    } catch (error) { console.error('Error creating room:', error); }
    setLoading(false);
  };

  const joinRoom = async () => {
    const code = roomCodeInput.toUpperCase().trim();
    if (!code) return;
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${code}&select=*`, {
        headers: getAuthHeaders(false)
      });
      const data = await response.json();
      if (data && data.length > 0) router.push(`/room/${code}`);
      else alert('Room not found!');
    } catch (error) { console.error('Error joining room:', error); alert('Error joining room'); }
    setLoading(false);
  };

  const loadRoomData = async () => {
    if (!roomCode) return;
    try {
      const roomResponse = await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomCode}&select=*`, {
        headers: getAuthHeaders(false)
      });
      const roomData = await roomResponse.json();
      if (roomData && roomData.length > 0) {
        setCurrentSong(roomData[0].current_song);
        setSungSongs(roomData[0].sung_songs || []);
        setShowLyricsOnTV(roomData[0].show_lyrics_on_tv || false);
      }
      const queueResponse = await fetch(`${SUPABASE_URL}/rest/v1/queue?room_id=eq.${roomCode}&select=*&order=position.asc`, {
        headers: getAuthHeaders(false)
      });
      setQueue((await queueResponse.json()) || []);
    } catch (error) { console.error('Error loading room data:', error); }
  };

  const updateRoom = async (updates) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify(updates)
      });
    } catch (error) { console.error('Error updating room:', error); }
  };

  // Try to add a song - checks for groups first
  const tryAddToQueue = (song, requester = 'Someone') => {
    // Check if song is in any groups
    const groups = getGroupsForSong(song.id);
    if (groups.length > 0) {
      // Show group prompt
      setGroupPrompt({ song, groups });
    } else {
      // No groups, add directly
      addSongToQueue(song, requester);
    }
  };

  // Add a single song to queue (internal)
  const addSongToQueue = async (song, requester = 'Someone', skipWarning = false) => {
    // Check if already in queue
    const inQueue = queue.some(s => s.song_title === song.title);
    // Check if already sung
    const alreadySung = sungSongs.some(s => s.title === song.title);
    // Check if currently playing
    const nowPlaying = currentSong?.title === song.title;
    
    // Show warning if duplicate (unless skipping warning)
    if (!skipWarning && (inQueue || alreadySung || nowPlaying)) {
      const reasons = [];
      if (nowPlaying) reasons.push('currently playing');
      if (inQueue) reasons.push('already in queue');
      if (alreadySung) reasons.push('already sung');
      
      if (!confirm(`"${song.title}" is ${reasons.join(' and ')}. Add anyway?`)) {
        return;
      }
    }
    
    const maxPosition = queue.length > 0 ? Math.max(...queue.map(s => s.position)) : -1;
    const version = getDefaultVersion(song.id);
    const pageInfo = getSongPage(song.id);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          room_id: roomCode,
          song_id: song.id || null,
          song_title: song.title,
          song_page: pageInfo.page || song.page,
          song_section: pageInfo.section || song.section,
          requester: requester,
          position: maxPosition + 1,
          old_page: pageInfo.old_page || song.old_page || null,
          has_lyrics: !!version?.lyrics_content,
          lyrics_text: version?.lyrics_content || null,
          is_group: false,
          group_id: null
        })
      });
      showToast(`✓ "${song.title}" added to queue`);
    } catch (error) { console.error('Error adding to queue:', error); }
    await loadRoomData();
  };

  // Add a group to queue
  const addGroupToQueue = async (group, requester = 'Someone') => {
    // Check if group already in queue
    const inQueue = queue.some(s => s.group_id === group.id);
    const alreadySung = sungSongs.some(s => s.group_id === group.id);
    const nowPlaying = currentSong?.group_id === group.id;
    
    if (inQueue || alreadySung || nowPlaying) {
      const reasons = [];
      if (nowPlaying) reasons.push('currently playing');
      if (inQueue) reasons.push('already in queue');
      if (alreadySung) reasons.push('already sung');
      
      if (!confirm(`"${group.group_name}" is ${reasons.join(' and ')}. Add anyway?`)) {
        return;
      }
    }
    
    const maxPosition = queue.length > 0 ? Math.max(...queue.map(s => s.position)) : -1;
    const pageInfo = getGroupPage(group.id);
    const members = getGroupMembers(group.id);
    
    // Build combined lyrics from fragment_lyrics
    const combinedLyrics = members.map(m => {
      const song = allSongs.find(s => s.id === m.song_id);
      const songName = song?.title || 'Unknown';
      const lyrics = m.fragment_lyrics || '';
      return `═══ ${songName} ═══\n${lyrics}`;
    }).join('\n\n');
    
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          room_id: roomCode,
          song_title: group.group_name,
          song_page: pageInfo?.page || 'N/A',
          song_section: pageInfo?.section || 'S',
          requester: requester,
          position: maxPosition + 1,
          old_page: null, // Groups don't have old_page in new structure
          has_lyrics: true,
          lyrics_text: combinedLyrics,
          is_group: true,
          group_id: group.id,
          group_instructions: group.instructions
        })
      });
      showToast(`✓ "${group.group_name}" added to queue`);
    } catch (error) { console.error('Error adding group to queue:', error); }
    setGroupPrompt(null);
    await loadRoomData();
  };

  // Handle group prompt selection
  const handleGroupPromptChoice = (choice, group = null) => {
    if (choice === 'song') {
      addSongToQueue(groupPrompt.song, 'Someone');
    } else if (choice === 'group' && group) {
      addGroupToQueue(group, 'Someone');
    }
    setGroupPrompt(null);
  };

  // Legacy function name for compatibility
  const addToQueue = async (song, requester = 'Someone') => {
    tryAddToQueue(song, requester);
  };

  const generateRandomSong = () => {
    const availableSongs = allSongs.filter(song => {
      // Already sung? Skip
      if (sungSongs.some(s => s.title === song.title)) return false;
      
      // Already in queue? Skip
      if (queue.some(s => s.song_title === song.title)) return false;
      
      // Check if song should be EXCLUDED (exclude tags take priority)
      if (songHasAnyTag(song.id, excludeTagIds)) return false;
      
      // Check if song matches section OR has an "include" tag
      const matchesSection = selectedSections.includes(song.section);
      const matchesIncludeTag = songHasAnyTag(song.id, includeTagIds);
      
      // Song is eligible if it matches section OR has an include tag
      return matchesSection || matchesIncludeTag;
    });
    if (availableSongs.length === 0) { alert('No songs available with current filters!'); return; }
    
    // Weight songs by history (if user is logged in)
    const recentlySungIds = getRecentlySungSongIds();
    let randomSong;
    
    if (user && recentlySungIds.length > 0) {
      // Separate songs into "not recently sung" and "recently sung"
      const notRecentlySung = availableSongs.filter(s => !recentlySungIds.includes(s.id));
      const recentlySung = availableSongs.filter(s => recentlySungIds.includes(s.id));
      
      if (notRecentlySung.length > 0) {
        // Prefer songs not recently sung (90% chance if available)
        if (Math.random() < 0.9) {
          randomSong = notRecentlySung[Math.floor(Math.random() * notRecentlySung.length)];
        } else {
          randomSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
        }
      } else {
        // All songs have been sung recently - pick any
        randomSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
      }
    } else {
      // No user or no history - pure random
      randomSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
    }
    
    // For random, skip the group prompt and add song directly
    addSongToQueue(randomSong, 'Random');
  };

  const playSong = async (song) => {
    const songObj = {
      title: song.song_title,
      page: song.song_page,
      section: song.song_section,
      old_page: song.old_page,
      has_lyrics: song.has_lyrics || false,
      lyrics_text: song.lyrics_text || null,
      is_group: song.is_group || false,
      group_id: song.group_id || null,
      group_instructions: song.group_instructions || null
    };
    await updateRoom({ current_song: songObj, sung_songs: [...sungSongs, songObj] });
    
    // Record in user's session history
    if (song.song_id) {
      recordSongSung(song.song_id);
    }
    
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${song.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(false)
      });
    } catch (error) { console.error('Error removing from queue:', error); }
    await loadRoomData();
  };

  const moveInQueue = async (song, direction) => {
    const currentIndex = queue.findIndex(s => s.id === song.id);
    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= queue.length) return;
    const otherSong = queue[newIndex];
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${song.id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ position: otherSong.position })
      });
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${otherSong.id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ position: song.position })
      });
      await loadRoomData();
    } catch (error) { console.error('Error reordering queue:', error); }
  };

  const removeFromQueue = async (id) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(false)
      });
      await loadRoomData();
    } catch (error) { console.error('Error removing from queue:', error); }
  };

  const toggleSection = (section) => {
    setSelectedSections(selectedSections.includes(section)
      ? selectedSections.filter(s => s !== section)
      : [...selectedSections, section]);
  };

  const addCustomSong = () => {
    if (customSongInput.trim()) {
      addToQueue({ title: customSongInput.trim(), page: 'Custom', section: 'Custom' });
      setCustomSongInput('');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to normalize search terms (remove leading articles)
  const normalizeForSearch = (text) => {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/^(the|a|an)\s+/i, '');
  };

  const filteredSongs = allSongs.filter(song => {
    // First apply section/tag filters (same as random generator)
    if (songHasAnyTag(song.id, excludeTagIds)) return false;
    const matchesSection = selectedSections.includes(song.section);
    const matchesIncludeTag = songHasAnyTag(song.id, includeTagIds);
    if (!matchesSection && !matchesIncludeTag) return false;
    
    // Then apply search filter
    const searchLower = normalizeForSearch(searchTerm);
    if (!searchLower) return true;
    
    const titleNormalized = normalizeForSearch(song.title);
    const matchesTitle = titleNormalized.includes(searchLower) || song.title.toLowerCase().includes(searchTerm.toLowerCase().trim());
    
    // Get page info from songbook entries (or fall back to song table)
    const pageInfo = getSongPage(song.id);
    const page = pageInfo.page || song.page;
    const oldPage = pageInfo.old_page || song.old_page;
    const matchesPage = (page && page.toLowerCase().includes(searchLower)) || 
                        (oldPage && oldPage.toLowerCase().includes(searchLower));
    
    const sectionName = SECTION_INFO[song.section] || "";
    const matchesSectionSearch = song.section?.toLowerCase() === searchLower || 
                           sectionName.toLowerCase().includes(searchLower);
    
    // Search in aliases
    const aliases = getSongAliases(song.id);
    const matchesAlias = aliases.some(a => normalizeForSearch(a.alias_title).includes(searchLower));
    
    // Search in lyrics
    const lyrics = getSongVersions(song.id).map(v => v.lyrics_content?.toLowerCase() || '').join(' ');
    const matchesLyrics = lyrics.includes(searchLower);
    
    return matchesTitle || matchesPage || matchesSectionSearch || matchesAlias || matchesLyrics;
  });

  // Landing Page
  return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${isDark ? 'bg-slate-950' : 'bg-green-50'}`}>
        {/* Auth Modal */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`rounded-2xl p-6 w-full max-w-sm ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {authMode === 'signup' ? 'Create Account' : authMode === 'magic' ? 'Magic Link' : 'Sign In'}
                </h2>
                <button onClick={() => { setShowAuthModal(false); resetAuthForm(); }} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
              </div>
              
              {authError && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{authError}</div>}
              {authMessage && <div className="bg-green-100 text-green-700 p-3 rounded-lg mb-4 text-sm">{authMessage}</div>}
              
              <div className="space-y-3">
                {authMode === 'signup' && (
                  <input
                    type="text"
                    placeholder="Display Name"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
                />
                {authMode !== 'magic' && (
                  <input
                    type="password"
                    placeholder="Password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
                  />
                )}
                <button
                  onClick={authMode === 'signup' ? handleSignUp : authMode === 'magic' ? handleMagicLink : handleLogin}
                  disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
                  className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold transition-all disabled:opacity-50"
                >
                  {authLoading ? 'Loading...' : authMode === 'signup' ? 'Create Account' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
                </button>
              </div>
              
              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                <div className="flex flex-col gap-2 text-sm text-center">
                  {authMode === 'login' && (
                    <>
                      <button onClick={() => { setAuthMode('signup'); setAuthError(''); }} className="text-green-600 hover:underline">Need an account? Sign up</button>
                      <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} className="text-blue-600 hover:underline">Use magic link instead</button>
                    </>
                  )}
                  {authMode === 'signup' && (
                    <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-green-600 hover:underline">Already have an account? Sign in</button>
                  )}
                  {authMode === 'magic' && (
                    <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-green-600 hover:underline">Use password instead</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className={`shadow-2xl rounded-3xl p-6 sm:p-8 w-full max-w-md border animate-in fade-in zoom-in duration-500 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-green-100'}`}>
          <div className="text-center mb-8">
            <div className="text-6xl mb-4 drop-shadow-lg">🎵</div>
            <h1 className={`text-3xl sm:text-4xl font-black tracking-tight ${isDark ? 'text-white' : 'text-green-900'}`}>
              Tajar's <span className="text-green-600">Songbook</span>
            </h1>
          </div>
          
          <div className="space-y-6">
            <button
              onClick={createRoom}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black text-xl transition-all active:scale-[0.98] shadow-xl shadow-green-900/20 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Start New Room'}
            </button>
            <div className="relative flex items-center py-2">
              <div className={`flex-grow border-t ${isDark ? 'border-slate-800' : 'border-green-100'}`}></div>
              <span className={`flex-shrink mx-4 text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-green-300'}`}>OR JOIN ROOM</span>
              <div className={`flex-grow border-t ${isDark ? 'border-slate-800' : 'border-green-100'}`}></div>
            </div>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="ROOM CODE"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                className={`w-full border-2 rounded-2xl px-4 py-3 text-center text-xl font-black tracking-widest transition-all outline-none focus:ring-4 focus:ring-green-500/10 ${
                  isDark 
                    ? 'bg-slate-950 border-slate-800 text-white focus:border-green-500 placeholder:text-slate-700' 
                    : 'bg-green-50 border-green-100 text-green-900 focus:border-green-500 placeholder:text-green-200'
                }`}
              />
              <button
                onClick={joinRoom}
                disabled={loading || !roomCodeInput}
                className="w-full py-3 rounded-2xl font-black text-white bg-blue-500 hover:bg-blue-500 transition-all disabled:opacity-30 shadow-lg shadow-blue-900/20"
              >
                Join
              </button>
            </div>
          </div>
        </div>
        <div className="fixed bottom-4 left-0 right-0 text-center">
        
         <a href="https://docs.google.com/forms/d/e/1FAIpQLScwkZP7oISooLkhx-gksF8jjmjgMi85Z4WsKEC5eWU_Cdm9sg/viewform?usp=header"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 text-sm hover:text-gray-300 transition-colors"
        >
          📝 Share Feedback
        </a>
      </div>
      </div>
    );
}
