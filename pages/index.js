import { useState, useEffect } from 'react';

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
  
  // Tag filtering state
  const [tags, setTags] = useState([]);
  const [songTags, setSongTags] = useState([]);
  const [songVersions, setSongVersions] = useState([]);
  const [songNotes, setSongNotes] = useState([]);
  const [includeTagIds, setIncludeTagIds] = useState([]); // "Also include" tags
  const [excludeTagIds, setExcludeTagIds] = useState([]); // "Exclude" tags
  
  // Expanded notes tracking (which note types are currently shown)
  const [expandedNotes, setExpandedNotes] = useState([]);
  
  // Group data
  const [songGroups, setSongGroups] = useState([]);
  const [songGroupMembers, setSongGroupMembers] = useState([]);
  const [songbookEntries, setSongbookEntries] = useState([]);
  
  // Group prompt modal
  const [groupPrompt, setGroupPrompt] = useState(null); // { song, groups } when showing prompt

  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(darkModeQuery.matches);
    const handler = (e) => setIsDark(e.matches);
    darkModeQuery.addEventListener('change', handler);
    return () => darkModeQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => { loadSongs(); loadTags(); }, []);

  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => { loadRoomData(); }, 2000);
    return () => clearInterval(interval);
  }, [roomCode]);

  const loadSongs = async () => {
    try {
      const [songsRes, versionsRes, notesRes, groupsRes, membersRes, entriesRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_notes?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_groups?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_group_members?select=*&order=position_in_group.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        })
      ]);
      setAllSongs(await songsRes.json());
      setSongVersions(await versionsRes.json());
      setSongNotes(await notesRes.json());
      setSongGroups(await groupsRes.json());
      setSongGroupMembers(await membersRes.json());
      setSongbookEntries(await entriesRes.json());
    } catch (error) { console.error('Error loading songs:', error); }
  };

  // Get the default singalong version for a song
  const getDefaultVersion = (songId) => {
    return songVersions.find(v => v.song_id === songId && v.is_default_singalong) 
      || songVersions.find(v => v.song_id === songId);
  };

  // Check if a song has any version with lyrics
  const songHasLyrics = (songId) => {
    return songVersions.some(v => v.song_id === songId && v.lyrics_content);
  };

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

  // Get page info for a group
  const getGroupPage = (groupId) => {
    const entry = songbookEntries.find(e => e.song_group_id === groupId);
    return entry ? { page: entry.page, section: entry.section, old_page: entry.old_page } : null;
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
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ id: code, current_song: null, sung_songs: [] })
      });
      if (response.ok) setRoomCode(code);
    } catch (error) { console.error('Error creating room:', error); }
    setLoading(false);
  };

  const joinRoom = async () => {
    const code = roomCodeInput.toUpperCase().trim();
    if (!code) return;
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${code}&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const data = await response.json();
      if (data && data.length > 0) { setRoomCode(code); await loadRoomData(); }
      else alert('Room not found!');
    } catch (error) { console.error('Error joining room:', error); alert('Error joining room'); }
    setLoading(false);
  };

  const loadRoomData = async () => {
    if (!roomCode) return;
    try {
      const roomResponse = await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomCode}&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const roomData = await roomResponse.json();
      if (roomData && roomData.length > 0) {
        setCurrentSong(roomData[0].current_song);
        setSungSongs(roomData[0].sung_songs || []);
      }
      const queueResponse = await fetch(`${SUPABASE_URL}/rest/v1/queue?room_id=eq.${roomCode}&select=*&order=position.asc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      setQueue((await queueResponse.json()) || []);
    } catch (error) { console.error('Error loading room data:', error); }
  };

  const updateRoom = async (updates) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomCode}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify(updates)
      });
    } catch (error) { console.error('Error updating room:', error); }
  };

  // Try to add a song - checks for groups first
  const tryAddToQueue = (song, requester = 'Someone') => {
    // Check if already in queue
    if (queue.some(s => s.song_title === song.title)) return;
    
    // Check if already sung - prompt for confirmation
    if (sungSongs.some(s => s.title === song.title)) {
      if (!confirm(`"${song.title}" has already been sung tonight. Add it again?`)) return;
    }
    
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
  const addSongToQueue = async (song, requester = 'Someone') => {
    if (queue.some(s => s.song_title === song.title)) return;
    const maxPosition = queue.length > 0 ? Math.max(...queue.map(s => s.position)) : -1;
    const version = getDefaultVersion(song.id);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          room_id: roomCode,
          song_title: song.title,
          song_page: song.page,
          song_section: song.section,
          requester: requester,
          position: maxPosition + 1,
          old_page: song.old_page || null,
          has_lyrics: !!version?.lyrics_content,
          lyrics_text: version?.lyrics_content || null,
          is_group: false,
          group_id: null
        })
      });
    } catch (error) { console.error('Error adding to queue:', error); }
    await loadRoomData();
  };

  // Add a group to queue
  const addGroupToQueue = async (group, requester = 'Someone') => {
    // Check if group already in queue
    if (queue.some(s => s.group_id === group.id)) return;
    
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
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          room_id: roomCode,
          song_title: group.group_name,
          song_page: pageInfo?.page || 'N/A',
          song_section: pageInfo?.section || 'S',
          requester: requester,
          position: maxPosition + 1,
          old_page: pageInfo?.old_page || null,
          has_lyrics: true,
          lyrics_text: combinedLyrics,
          is_group: true,
          group_id: group.id,
          group_instructions: group.instructions
        })
      });
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
    const randomSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
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
      lyrics_text: song.lyrics_text || null
    };
    await updateRoom({ current_song: songObj, sung_songs: [...sungSongs, songObj] });
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${song.id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ position: otherSong.position })
      });
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${otherSong.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ position: song.position })
      });
      await loadRoomData();
    } catch (error) { console.error('Error reordering queue:', error); }
  };

  const removeFromQueue = async (id) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/queue?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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

  const filteredSongs = allSongs.filter(song => {
    // Hide songs already in queue
    if (queue.some(s => s.song_title === song.title)) return false;
    
    // First apply section/tag filters (same as random generator)
    if (songHasAnyTag(song.id, excludeTagIds)) return false;
    const matchesSection = selectedSections.includes(song.section);
    const matchesIncludeTag = songHasAnyTag(song.id, includeTagIds);
    if (!matchesSection && !matchesIncludeTag) return false;
    
    // Then apply search filter
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return true;
    const matchesTitle = song.title.toLowerCase().includes(searchLower);
    const matchesPage = (song.page && song.page.toLowerCase().includes(searchLower)) || 
                        (song.old_page && song.old_page.toLowerCase().includes(searchLower));
    const sectionName = SECTION_INFO[song.section] || "";
    const matchesSectionSearch = song.section?.toLowerCase() === searchLower || 
                           sectionName.toLowerCase().includes(searchLower);
    return matchesTitle || matchesPage || matchesSectionSearch;
  });

  // Landing Page
  if (!roomCode) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${isDark ? 'bg-slate-950' : 'bg-green-50'}`}>
        <div className={`shadow-2xl rounded-3xl p-6 sm:p-8 w-full max-w-md border animate-in fade-in zoom-in duration-500 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-green-100'}`}>
          <div className="text-center mb-8">
            <div className="text-6xl mb-4 drop-shadow-lg">🎵</div>
            <h1 className={`text-3xl sm:text-4xl font-black tracking-tight ${isDark ? 'text-white' : 'text-green-900'}`}>
              Camp <span className="text-green-600">Singalong</span>
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

  // Display View - Full Screen Lyrics (with sidebar on large screens, column on mobile)
if (view === 'display' && showLyrics && currentSong) {
  const isGroup = currentSong.is_group;
  const groupInstructions = currentSong.group_instructions;
  
  // For groups, get notes and years from all member songs
  // For single songs, get from the single song
  let currentNotes = [];
  let yearsWritten = [];
  
  if (isGroup && currentSong.group_id) {
    const members = getGroupMembers(currentSong.group_id);
    members.forEach(m => {
      const memberSong = allSongs.find(s => s.id === m.song_id);
      if (memberSong) {
        const notes = getNotesForSong(memberSong.id);
        notes.forEach(n => currentNotes.push({ ...n, songTitle: memberSong.title }));
        if (memberSong.year_written) {
          yearsWritten.push({ title: memberSong.title, year: memberSong.year_written });
        }
      }
    });
  } else {
    const currentSongFull = getCurrentSongFull();
    const songId = currentSongFull?.id;
    currentNotes = songId ? getNotesForSong(songId) : [];
    if (currentSongFull?.year_written) {
      yearsWritten.push({ title: currentSongFull.title, year: currentSongFull.year_written });
    }
  }
  
  // Group notes by type
  const instructionNotes = currentNotes.filter(n => INSTRUCTION_TYPES.includes(n.note_type));
  const otherNotes = currentNotes.filter(n => !INSTRUCTION_TYPES.includes(n.note_type));
  
  // Get unique note types for buttons
  const availableNoteTypes = [...new Set(currentNotes.map(n => n.note_type))];
  const instructionTypes = availableNoteTypes.filter(t => INSTRUCTION_TYPES.includes(t));
  const otherTypes = availableNoteTypes.filter(t => !INSTRUCTION_TYPES.includes(t));

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-green-900'} text-white`}>
      {/* Mobile Layout (column) */}
      <div className="lg:hidden flex flex-col min-h-screen">
        {/* Mobile Header */}
        <div className="sticky top-0 bg-black/80 backdrop-blur p-4 z-10 border-b border-white/10">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setShowLyrics(false)} 
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              ← Back
            </button>
            <div className="text-center flex-1 mx-4">
              <div className="text-base font-bold truncate">{currentSong.title}</div>
              <div className="text-xs text-green-300">
                Page {currentSong.page}{currentSong.old_page ? ` (${currentSong.old_page})` : ''}
              </div>
            </div>
            <div className="w-16"></div>
          </div>
        </div>

        {/* Mobile Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Instruction Note Buttons (above lyrics) */}
          {instructionTypes.length > 0 && (
            <div className="space-y-2 mb-4">
              {/* Group instructions (if this is a group) */}
              {isGroup && groupInstructions && (
                <div className="p-4 bg-green-900/30 rounded-xl text-green-100 text-sm mb-4 border border-green-600/30">
                  <div className="font-bold text-green-400 mb-2">Group Instructions</div>
                  <p className="whitespace-pre-wrap">{groupInstructions}</p>
                </div>
              )}
              
              {instructionTypes.map(noteType => (
                <div key={noteType}>
                  <button
                    onClick={() => toggleNoteType(noteType)}
                    className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-colors ${
                      expandedNotes.includes(noteType) 
                        ? 'bg-yellow-600 text-white' 
                        : 'bg-yellow-600/30 text-yellow-200 hover:bg-yellow-600/50'
                    }`}
                  >
                    {expandedNotes.includes(noteType) ? '▼' : '▶'} {NOTE_TYPE_LABELS[noteType] || noteType}
                  </button>
                  {expandedNotes.includes(noteType) && (
                    <div className="mt-2 p-4 bg-yellow-900/30 rounded-xl text-yellow-100 text-sm">
                      {currentNotes.filter(n => n.note_type === noteType).map((note, i) => (
                        <p key={i} className={i > 0 ? 'mt-2' : ''}>
                          {note.songTitle && isGroup && <span className="text-yellow-400 font-bold">{note.songTitle}: </span>}
                          {note.note_content}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Lyrics */}
          <div className="text-center mb-6">
            {currentSong.lyrics_text ? (
              <div className="text-lg leading-relaxed whitespace-pre-wrap">
                {currentSong.lyrics_text}
              </div>
            ) : (
              <div className="text-gray-400 py-8">
                <div className="text-5xl mb-4">📄</div>
                <div>No lyrics available for this song</div>
              </div>
            )}
            
            {/* Year(s) written */}
            {yearsWritten.length > 0 && (
              <div className="mt-6 text-sm text-gray-400 italic">
                {yearsWritten.length === 1 ? (
                  `Written: ${yearsWritten[0].year}`
                ) : (
                  yearsWritten.map((y, i) => (
                    <span key={i}>{i > 0 && ' • '}{y.title}: {y.year}</span>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Other Note Buttons (below lyrics) */}
          {otherTypes.length > 0 && (
            <div className="space-y-2 mb-4">
              {otherTypes.map(noteType => (
                <div key={noteType}>
                  <button
                    onClick={() => toggleNoteType(noteType)}
                    className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-colors ${
                      expandedNotes.includes(noteType) 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-blue-600/30 text-blue-200 hover:bg-blue-600/50'
                    }`}
                  >
                    {expandedNotes.includes(noteType) ? '▼' : '▶'} {NOTE_TYPE_LABELS[noteType] || noteType}
                  </button>
                  {expandedNotes.includes(noteType) && (
                    <div className="mt-2 p-4 bg-blue-900/30 rounded-xl text-blue-100 text-sm">
                      {currentNotes.filter(n => n.note_type === noteType).map((note, i) => (
                        <p key={i} className={i > 0 ? 'mt-2' : ''}>
                          {note.songTitle && isGroup && <span className="text-blue-400 font-bold">{note.songTitle}: </span>}
                          {note.note_content}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mobile Bottom Button */}
        <div className="p-4 bg-black/80 border-t border-white/10">
          <button 
            onClick={() => setShowLyrics(false)}
            className="w-full py-3 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            Back to Display
          </button>
        </div>
      </div>

      {/* Desktop/TV Layout (two-column with sidebar) */}
      <div className="hidden lg:flex min-h-screen">
        {/* Left Sidebar */}
        <div className="w-72 shrink-0 p-6 flex flex-col border-r border-white/10 bg-black/20">
          {/* Room Code */}
          <div className="bg-white/10 p-4 rounded-xl border border-white/10 mb-4 overflow-hidden">
            <div className="text-xs uppercase font-bold opacity-60 mb-1">Room Code</div>
            <div className="text-3xl font-black truncate">{roomCode}</div>
          </div>
          
          {/* Back Button */}
          <button 
            onClick={() => setShowLyrics(false)} 
            className="bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl text-lg font-bold transition-colors mb-4"
          >
            ← Back to Display
          </button>
          
          {/* Instruction Note Buttons */}
          {instructionTypes.length > 0 && (
            <div className="mb-4">
              <div className="text-xs uppercase font-bold opacity-40 mb-2">Instructions</div>
              {instructionTypes.map(noteType => (
                <button
                  key={noteType}
                  onClick={() => toggleNoteType(noteType)}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-colors mb-2 ${
                    expandedNotes.includes(noteType) 
                      ? 'bg-yellow-600 text-white' 
                      : 'bg-yellow-600/30 text-yellow-200 hover:bg-yellow-600/50'
                  }`}
                >
                  {NOTE_TYPE_LABELS[noteType] || noteType}
                </button>
              ))}
            </div>
          )}
          
          {/* Other Note Buttons */}
          {otherTypes.length > 0 && (
            <div className="mb-4">
              <div className="text-xs uppercase font-bold opacity-40 mb-2">More Info</div>
              {otherTypes.map(noteType => (
                <button
                  key={noteType}
                  onClick={() => toggleNoteType(noteType)}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-colors mb-2 ${
                    expandedNotes.includes(noteType) 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-blue-600/30 text-blue-200 hover:bg-blue-600/50'
                  }`}
                >
                  {NOTE_TYPE_LABELS[noteType] || noteType}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Right Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-white/10">
            <h1 className="text-4xl font-black mb-1">{currentSong.title}</h1>
            <div className="text-xl text-green-400">
              Page {currentSong.page}{currentSong.old_page ? ` (${currentSong.old_page})` : ''}
            </div>
          </div>
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Group Instructions (if this is a group) */}
            {isGroup && groupInstructions && (
              <div className="mb-6 p-4 bg-green-900/30 rounded-xl border border-green-600/30">
                <div className="text-sm font-bold text-green-400 mb-2">Group Instructions</div>
                <p className="text-green-100 text-lg whitespace-pre-wrap">{groupInstructions}</p>
              </div>
            )}
            
            {/* Expanded Instruction Notes (above lyrics) */}
            {instructionTypes.filter(t => expandedNotes.includes(t)).map(noteType => (
              <div key={noteType} className="mb-6 p-4 bg-yellow-900/30 rounded-xl border border-yellow-600/30">
                <div className="text-sm font-bold text-yellow-400 mb-2">{NOTE_TYPE_LABELS[noteType]}</div>
                {currentNotes.filter(n => n.note_type === noteType).map((note, i) => (
                  <p key={i} className="text-yellow-100 text-lg">
                    {note.songTitle && isGroup && <span className="text-yellow-400 font-bold">{note.songTitle}: </span>}
                    {note.note_content}
                  </p>
                ))}
              </div>
            ))}
            
            {/* Lyrics */}
            <div className="text-center mb-8">
              {currentSong.lyrics_text ? (
                <div className="text-2xl tv:text-3xl leading-relaxed whitespace-pre-wrap">
                  {currentSong.lyrics_text}
                </div>
              ) : (
                <div className="text-gray-400 py-8">
                  <div className="text-5xl mb-4">📄</div>
                  <div>No lyrics available for this song</div>
                </div>
              )}
              
              {/* Year(s) written */}
              {yearsWritten.length > 0 && (
                <div className="mt-8 text-lg text-gray-400 italic">
                  {yearsWritten.length === 1 ? (
                    `Written: ${yearsWritten[0].year}`
                  ) : (
                    yearsWritten.map((y, i) => (
                      <span key={i}>{i > 0 && ' • '}{y.title}: {y.year}</span>
                    ))
                  )}
                </div>
              )}
            </div>
            
            {/* Expanded Other Notes (below lyrics) */}
            {otherTypes.filter(t => expandedNotes.includes(t)).map(noteType => (
              <div key={noteType} className="mb-6 p-4 bg-blue-900/30 rounded-xl border border-blue-600/30">
                <div className="text-sm font-bold text-blue-400 mb-2">{NOTE_TYPE_LABELS[noteType]}</div>
                {currentNotes.filter(n => n.note_type === noteType).map((note, i) => (
                  <p key={i} className="text-blue-100 text-lg">
                    {note.songTitle && isGroup && <span className="text-blue-400 font-bold">{note.songTitle}: </span>}
                    {note.note_content}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

  // Display View - Main (TV Safe)
  if (view === 'display') {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-green-900'} text-white flex`}>
        
        {/* Left Sidebar - Controls & Options */}
        <div className="w-56 tv:w-72 shrink-0 p-4 tv:p-6 flex flex-col border-r border-white/10">
          {/* Room Code */}
          <div className="bg-white/10 p-4 tv:p-6 rounded-xl border border-white/10 mb-4 overflow-hidden">
            <div className="text-xs tv:text-sm uppercase font-bold opacity-60 mb-1">Room Code</div>
            <div className="text-2xl tv:text-4xl font-black truncate">{roomCode}</div>
          </div>
          
          {/* Control Button */}
          <button 
            onClick={() => setView('control')} 
            className="bg-white/10 hover:bg-white/20 px-4 py-3 tv:py-4 rounded-xl text-base tv:text-xl font-bold transition-colors mb-4"
          >
            📱 Control
          </button>
          
          {/* Lyrics Button (when available) */}
          {currentSong?.has_lyrics && (
            <button 
              onClick={() => setShowLyrics(true)}
              className="bg-green-600 hover:bg-green-500 px-4 py-3 tv:py-4 rounded-xl text-base tv:text-xl font-bold transition-colors mb-4"
            >
              📄 Lyrics
            </button>
          )}
          
          {/* Note Buttons (when song is playing) */}
          {currentSong && (() => {
            const currentSongFull = getCurrentSongFull();
            const songId = currentSongFull?.id;
            if (!songId) return null;
            const currentNotes = getNotesForSong(songId);
            const availableNoteTypes = [...new Set(currentNotes.map(n => n.note_type))];
            const instructionTypes = availableNoteTypes.filter(t => INSTRUCTION_TYPES.includes(t));
            const otherTypes = availableNoteTypes.filter(t => !INSTRUCTION_TYPES.includes(t));
            
            if (availableNoteTypes.length === 0) return null;
            
            return (
              <>
                {instructionTypes.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] tv:text-xs uppercase font-bold opacity-40 mb-2">Instructions</div>
                    {instructionTypes.map(noteType => (
                      <button
                        key={noteType}
                        onClick={() => toggleNoteType(noteType)}
                        className={`w-full text-left px-3 py-2 tv:px-4 tv:py-3 rounded-xl text-sm tv:text-base font-bold transition-colors mb-2 ${
                          expandedNotes.includes(noteType) 
                            ? 'bg-yellow-600 text-white' 
                            : 'bg-yellow-600/30 text-yellow-200 hover:bg-yellow-600/50'
                        }`}
                      >
                        {NOTE_TYPE_LABELS[noteType] || noteType}
                      </button>
                    ))}
                  </div>
                )}
                {otherTypes.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] tv:text-xs uppercase font-bold opacity-40 mb-2">More Info</div>
                    {otherTypes.map(noteType => (
                      <button
                        key={noteType}
                        onClick={() => toggleNoteType(noteType)}
                        className={`w-full text-left px-3 py-2 tv:px-4 tv:py-3 rounded-xl text-sm tv:text-base font-bold transition-colors mb-2 ${
                          expandedNotes.includes(noteType) 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-blue-600/30 text-blue-200 hover:bg-blue-600/50'
                        }`}
                      >
                        {NOTE_TYPE_LABELS[noteType] || noteType}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
        
        {/* Right Main Content - Now Singing & Queue */}
        <div className="flex-1 flex flex-col p-6 tv:p-12 overflow-hidden">
          
          {/* Now Singing Section */}
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-3xl tv:text-5xl font-black mb-2 opacity-40 uppercase tracking-widest">Now Singing</h1>
            {currentSong ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-5xl tv:text-8xl font-black mb-2 leading-tight">
                  {currentSong.title} {currentSong.has_lyrics && '📄'}
                </div>
                <div className="text-3xl tv:text-6xl text-green-400 font-bold">
                  Page {currentSong.page} {currentSong.old_page && `(${currentSong.old_page})`}
                </div>

                {/* Show expanded instruction notes on TV */}
                {(() => {
                  const currentSongFull = getCurrentSongFull();
                  const songId = currentSongFull?.id;
                  if (!songId) return null;
                  const instructionTypes = [...new Set(getNotesForSong(songId).map(n => n.note_type))].filter(t => INSTRUCTION_TYPES.includes(t));
                  const expandedInstructions = instructionTypes.filter(t => expandedNotes.includes(t));
                  if (expandedInstructions.length === 0) return null;
                  
                  return (
                    <div className="mt-6 space-y-4">
                      {expandedInstructions.map(noteType => (
                        <div key={noteType} className="p-4 bg-yellow-900/30 rounded-xl border border-yellow-600/30 text-left">
                          <div className="text-sm font-bold text-yellow-400 mb-2">{NOTE_TYPE_LABELS[noteType]}</div>
                          {getNotesByType(songId, noteType).map((note, i) => (
                            <p key={i} className="text-yellow-100 text-xl tv:text-2xl">{note.note_content}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {showLyricsOnTV && currentSong.lyrics_text && (
                  <>
                    <div className="mt-8 text-xl tv:text-3xl leading-relaxed text-gray-200 max-w-4xl whitespace-pre-wrap">
                      {currentSong.lyrics_text}
                    </div>
                    {/* Year written */}
                    {(() => {
                      const currentSongFull = getCurrentSongFull();
                      if (currentSongFull?.year_written) {
                        return (
                          <div className="mt-6 text-lg tv:text-xl text-gray-400 italic">
                            Written: {currentSongFull.year_written}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}

                {/* Show expanded other notes on TV (below lyrics if showing, otherwise below title) */}
                {(() => {
                  const currentSongFull = getCurrentSongFull();
                  const songId = currentSongFull?.id;
                  if (!songId) return null;
                  const otherTypes = [...new Set(getNotesForSong(songId).map(n => n.note_type))].filter(t => !INSTRUCTION_TYPES.includes(t));
                  const expandedOther = otherTypes.filter(t => expandedNotes.includes(t));
                  if (expandedOther.length === 0) return null;
                  
                  return (
                    <div className="mt-6 space-y-4">
                      {expandedOther.map(noteType => (
                        <div key={noteType} className="p-4 bg-blue-900/30 rounded-xl border border-blue-600/30 text-left">
                          <div className="text-sm font-bold text-blue-400 mb-2">{NOTE_TYPE_LABELS[noteType]}</div>
                          {getNotesByType(songId, noteType).map((note, i) => (
                            <p key={i} className="text-blue-100 text-xl tv:text-2xl">{note.note_content}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-3xl tv:text-5xl opacity-30 italic">Pick a song to begin...</div>
            )}
          </div>

          {/* Up Next Queue */}
          {queue.length > 0 && (
            <div className="mt-auto pt-6 border-t border-white/10">
              <h2 className="text-2xl tv:text-4xl font-bold mb-4 opacity-40">Up Next</h2>
              <div className="space-y-3">
                {queue.slice(0, 5).map((song, i) => (
                  <div key={song.id} className="flex justify-between items-start text-2xl tv:text-4xl font-medium gap-4">
                    <div className="truncate min-w-0">
                      <span className="opacity-50 mr-3">{i+1}.</span>
                      {song.song_title} {song.has_lyrics && '📄'}
                    </div>
                    <div className="text-green-400 shrink-0 text-right">Page {song.song_page}</div>
                  </div>
                ))}
                {queue.length > 5 && (
                  <div className="text-xl opacity-40 italic mt-2">+ {queue.length - 5} more songs</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Control View
  return (
    <div className={`min-h-screen p-2 sm:p-4 pb-20 ${isDark ? 'bg-slate-950 text-white' : 'bg-green-50 text-slate-900'}`}>
      
      {/* Group Prompt Modal */}
      {groupPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className={`max-w-md w-full rounded-2xl p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <h3 className="text-xl font-bold mb-2">Add to Queue</h3>
            <p className="text-sm opacity-70 mb-4">
              "{groupPrompt.song.title}" is part of {groupPrompt.groups.length === 1 ? 'a song group' : 'multiple song groups'}. 
              How would you like to add it?
            </p>
            
            <div className="space-y-3">
              {/* Option: Add just this song */}
              <button
                onClick={() => handleGroupPromptChoice('song')}
                className={`w-full p-4 rounded-xl text-left border-2 transition-colors ${isDark ? 'border-slate-700 hover:border-slate-500' : 'border-gray-200 hover:border-gray-400'}`}
              >
                <div className="font-bold">Just this song</div>
                <div className="text-sm opacity-60">{groupPrompt.song.title} • Page {groupPrompt.song.page}</div>
              </button>
              
              {/* Option: Add as group(s) */}
              {groupPrompt.groups.map(group => {
                const pageInfo = getGroupPage(group.id);
                const members = getGroupMembers(group.id);
                return (
                  <button
                    key={group.id}
                    onClick={() => handleGroupPromptChoice('group', group)}
                    className="w-full p-4 rounded-xl text-left border-2 border-green-600 bg-green-600/10 hover:bg-green-600/20 transition-colors"
                  >
                    <div className="font-bold text-green-600">{group.group_name}</div>
                    <div className="text-sm opacity-60">
                      Page {pageInfo?.page || 'N/A'} • {members.length} songs
                    </div>
                    <div className="text-xs opacity-50 mt-1">
                      {members.map(m => allSongs.find(s => s.id === m.song_id)?.title).filter(Boolean).join(', ')}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setGroupPrompt(null)}
              className="w-full mt-4 py-2 text-sm opacity-60 hover:opacity-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto space-y-4">
        
        {/* Header Section */}
        <div className={`rounded-3xl shadow-xl p-6 ${isDark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-green-100'}`}>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-black tracking-tight">🎵 Camp Singalong</h1>
            <button onClick={() => setView('display')} className="bg-green-600 px-4 py-2 rounded-xl text-white font-bold text-sm">📺 Display View</button>
          </div>
          <div className={`p-4 rounded-2xl mb-4 border-2 ${isDark ? 'bg-green-950/20 border-green-900/50' : 'bg-green-50 border-green-100'}`}>
             <div className="text-[10px] font-black uppercase opacity-60 mb-1">Room Code</div>
             <div className="flex justify-between items-center">
               <span className="text-3xl font-black tracking-tighter">{roomCode}</span>
               <button onClick={copyRoomCode} className="text-xs font-bold opacity-70 hover:opacity-100">{copied ? 'Copied!' : 'Copy Code'}</button>
             </div>
          </div>
          {currentSong && (
            <div className={`p-4 rounded-2xl border-2 ${isDark ? 'bg-blue-950/20 border-blue-900/50' : 'bg-blue-50 border-blue-100'}`}>
              <div className="text-[10px] font-black uppercase opacity-60 mb-1">Now Singing</div>
              <div className="text-xl font-bold mb-2">{currentSong.title} {currentSong.has_lyrics && '📄'}</div>
              {currentSong.has_lyrics && (
                <button 
                  onClick={() => setShowLyricsOnTV(!showLyricsOnTV)}
                  className={`w-full py-2 rounded-xl font-bold text-sm transition-colors border ${showLyricsOnTV ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent border-slate-400 opacity-60'}`}
                >
                  {showLyricsOnTV ? '📄 Lyrics on TV: ON' : '📄 Lyrics on TV: OFF'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Randomizer with Expanded Filters */}
        <div className={`rounded-3xl shadow-lg p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-black text-lg">🎲 Random Song</h2>
            <button onClick={() => setShowSectionFilter(!showSectionFilter)} className="text-xs font-bold text-blue-500 uppercase tracking-wider">
              {showSectionFilter ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
          
          {showSectionFilter && (
            <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
              {/* Section Filters */}
              <div>
                <div className="flex gap-2 mb-4">
                  <button 
                      onClick={() => setSelectedSections(Object.keys(SECTION_INFO))} 
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 ${isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                  >
                      Select All
                  </button>
                  <button 
                      onClick={() => setSelectedSections([])} 
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 ${isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                  >
                      Clear All
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                  {Object.keys(SECTION_INFO).map(sec => (
                    <label key={sec} className="flex items-center gap-3 p-2 hover:bg-black/5 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-black/5">
                      <input type="checkbox" className="w-5 h-5 rounded border-slate-300 accent-blue-600" checked={selectedSections.includes(sec)} onChange={() => toggleSection(sec)} />
                      <span className="text-xs font-medium leading-tight">{sec}: {SECTION_INFO[sec]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tag Filters - Only show if tags exist */}
              {tags.length > 0 && (
                <>
                  {/* Also Include Tags */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                        <span className="hidden sm:inline">Also Include (even if section not selected)</span>
                        <span className="sm:hidden">Also Include</span>
                      </span>
                      {includeTagIds.length > 0 && (
                        <button onClick={() => setIncludeTagIds([])} className="text-xs text-slate-500 hover:text-slate-400">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => {
                        const isSelected = includeTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => setIncludeTagIds(prev => 
                              isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                            )}
                            className={`px-3 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${
                              isSelected 
                                ? 'bg-green-600 text-white' 
                                : isDark 
                                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}{tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Exclude Tags */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                        <span className="hidden sm:inline">Exclude (even if section selected)</span>
                        <span className="sm:hidden">Exclude</span>
                      </span>
                      {excludeTagIds.length > 0 && (
                        <button onClick={() => setExcludeTagIds([])} className="text-xs text-slate-500 hover:text-slate-400">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => {
                        const isSelected = excludeTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => setExcludeTagIds(prev => 
                              isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                            )}
                            className={`px-3 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${
                              isSelected 
                                ? 'bg-red-600 text-white' 
                                : isDark 
                                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isSelected ? '✗ ' : '− '}{tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={generateRandomSong} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-900/20 active:scale-[0.98] transition-all">Pick Random Song</button>
        </div>

        {/* Queue */}
        <div className={`rounded-3xl shadow-lg p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
          <h2 className="font-black text-lg mb-4">👥 Up Next ({queue.length})</h2>
          <div className="space-y-3">
            {queue.map(song => (
              <div key={song.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex flex-col gap-1">
                  <button onClick={() => moveInQueue(song, -1)} className="opacity-40 hover:opacity-100">▲</button>
                  <button onClick={() => moveInQueue(song, 1)} className="opacity-40 hover:opacity-100">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate text-sm flex items-center gap-1">
                    {song.song_title} {song.has_lyrics && '📄'}
                  </div>
                  <div className="text-[10px] opacity-60 uppercase font-black tracking-wide">P.{song.song_page} • {song.requester}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => playSong(song)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Play</button>
                  <button onClick={() => removeFromQueue(song.id)} className="text-xl px-1 opacity-30 hover:opacity-100 hover:text-red-500 transition-all">🗑️</button>
                </div>
              </div>
            ))}
            {queue.length === 0 && <div className="text-center py-6 opacity-30 text-sm italic">The queue is currently empty</div>}
          </div>
        </div>

        {/* History (Sung Songs) */}
        {sungSongs.length > 0 && (
          <div className={`rounded-3xl shadow-lg p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <h2 className="font-black text-[10px] uppercase opacity-40 tracking-widest mb-3">Recently Sung</h2>
            <div className="flex flex-wrap gap-2">
              {sungSongs.slice().reverse().map((s, i) => (
                <div key={i} className="bg-black/5 px-3 py-1 rounded-full text-[10px] font-bold border border-black/5">{s.title}</div>
              ))}
            </div>
          </div>
        )}

        {/* Search & Add */}
        <div className={`rounded-3xl shadow-lg p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
          <h2 className="font-black text-lg mb-4">Add a Song</h2>
          <input 
            type="text" placeholder="Search by title, page, or section..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full p-4 rounded-2xl mb-4 border outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
          />
          <div className="max-h-80 overflow-y-auto space-y-2 mb-6">
            {filteredSongs.map(song => (
              <div key={song.id} className="flex justify-between items-center p-3 rounded-xl border border-black/5 bg-black/5">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{song.title} {songHasLyrics(song.id) && '📄'}</div>
                  <div className="text-[10px] opacity-50 font-black uppercase tracking-tighter">Section {song.section} • Page {song.page}</div>
                </div>
                <button onClick={() => addToQueue(song)} className="ml-3 bg-green-600 text-white w-10 h-10 rounded-full font-bold flex items-center justify-center">＋</button>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <p className="text-[10px] font-black uppercase opacity-40 mb-2">Unlisted Song</p>
            <div className="flex gap-2">
              <input type="text" value={customSongInput} onChange={(e) => setCustomSongInput(e.target.value)} placeholder="Enter song title..." className={`flex-1 p-3 rounded-xl border text-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`} />
              <button onClick={addCustomSong} className="bg-blue-600 text-white px-5 rounded-xl font-bold text-sm">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}