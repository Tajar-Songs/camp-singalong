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

  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(darkModeQuery.matches);
    const handler = (e) => setIsDark(e.matches);
    darkModeQuery.addEventListener('change', handler);
    return () => darkModeQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => { loadSongs(); }, []);

  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => { loadRoomData(); }, 2000);
    return () => clearInterval(interval);
  }, [roomCode]);

  const loadSongs = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      setAllSongs(await response.json());
    } catch (error) { console.error('Error loading songs:', error); }
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

  const addToQueue = async (song, requester = 'Someone') => {
    if (queue.some(s => s.song_title === song.title)) return;
    const maxPosition = queue.length > 0 ? Math.max(...queue.map(s => s.position)) : -1;
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
          has_lyrics: song.has_lyrics || false,
          lyrics_text: song.lyrics_text || null
        })
      });
    } catch (error) { console.error('Error adding to queue:', error); }
    await loadRoomData();
  };

  const generateRandomSong = () => {
    const availableSongs = allSongs.filter(song =>
      selectedSections.includes(song.section) && !sungSongs.some(s => s.title === song.title)
    );
    if (availableSongs.length === 0) { alert('No songs available with current filters!'); return; }
    addToQueue(availableSongs[Math.floor(Math.random() * availableSongs.length)], 'Random');
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
  const searchLower = searchTerm.toLowerCase().trim();
  if (!searchLower) return true;

  const matchesTitle = song.title.toLowerCase().includes(searchLower);
  const matchesPage = (song.page && song.page.toLowerCase().includes(searchLower)) || 
                      (song.old_page && song.old_page.toLowerCase().includes(searchLower));
  
  const sectionName = SECTION_INFO[song.section] || "";
  const matchesSection = song.section?.toLowerCase() === searchLower || 
                         sectionName.toLowerCase().includes(searchLower);

  return matchesTitle || matchesPage || matchesSection;
});

  // Landing Page - No Room Code

  
// Landing Page - No Room Code
  if (!roomCode) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${isDark ? 'bg-slate-950' : 'bg-green-50'}`}>
        <div className={`shadow-2xl rounded-3xl p-8 w-full max-w-md border animate-in fade-in zoom-in duration-500 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-green-100'}`}>
          <div className="text-center mb-10">
            <div className="text-6xl mb-4 drop-shadow-lg">🎵</div>
            <h1 className={`text-4xl font-black tracking-tight ${isDark ? 'text-white' : 'text-green-900'}`}>
              Camp <span className="text-green-600">Singalong</span>
            </h1>
            <p className={`mt-2 font-medium ${isDark ? 'text-slate-400' : 'text-green-700/70'}`}>
              Ready to lead the choir?
            </p>
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

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="CODE"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                  className={`flex-1 border-2 rounded-2xl px-4 py-3 text-xl font-black tracking-widest transition-all outline-none focus:ring-4 focus:ring-green-500/10 ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-white focus:border-green-500 placeholder:text-slate-800' 
                      : 'bg-green-50 border-green-100 text-green-900 focus:border-green-500 placeholder:text-green-200'
                  }`}
                />
                <button
                  onClick={joinRoom}
                  disabled={loading || !roomCodeInput}
                  className="px-6 py-3 rounded-2xl font-black text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-30 shadow-lg shadow-blue-900/20"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-6 left-0 right-0 text-center">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLScwkZP7oISooLkhx-gksF5jjmjgMi85Z4WsKEC5eWU_Cdm9sg/viewform?usp=header"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-green-500 text-sm font-medium transition-colors"
          >
            📝 Share Feedback
          </a>
        </div>
      </div>
    );
  }



  // Display View - Full Screen Lyrics
  if (view === 'display' && showLyrics && currentSong) {
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-green-900 via-green-700 to-green-900'} text-white`}>
        {/* Sticky Header */}
        <div className="sticky top-0 bg-black/80 backdrop-blur p-3 sm:p-4 z-10 border-b border-white/10">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <button
              onClick={() => setShowLyrics(false)}
              className="bg-white/20 hover:bg-white/30 px-3 py-2 sm:px-4 rounded-lg transition-colors flex items-center gap-2"
            >
              ← Back
            </button>
            <div className="text-center">
              <div className="text-base sm:text-xl font-bold">{currentSong.title}</div>
              <div className="text-xs sm:text-sm text-green-300">
                Page {currentSong.page}{currentSong.old_page ? ` (${currentSong.old_page})` : ''}
              </div>
            </div>
            <div className="w-16 sm:w-20"></div>
          </div>
        </div>

        {/* Scrollable Lyrics */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-sm text-green-300 mb-4 text-center">Now Singing</div>
            {currentSong.lyrics_text ? (
              <div className="text-base sm:text-lg lg:text-xl tv:text-2xl leading-relaxed whitespace-pre-wrap">
                {currentSong.lyrics_text}
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">
                <div className="text-5xl mb-4">📄</div>
                <div>No lyrics available for this song</div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Button */}
        <div className="p-4 bg-black/80 border-t border-white/10">
          <button
            onClick={() => setShowLyrics(false)}
            className={`w-full max-w-3xl mx-auto block py-3 rounded-lg font-semibold transition-colors
              ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'} text-white`}
          >
            Back to Queue
          </button>
        </div>
      </div>
    );
  }

  // Display View - Main
  if (view === 'display') {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-green-900 via-green-700 to-green-900'} text-white`}>
        {/* Header */}
        <div className="flex justify-between items-start p-3 sm:p-4 flex-wrap gap-2">
          <div className="bg-white/20 px-3 py-2 sm:px-4 rounded-lg">
            <div className="text-xs text-green-300">Room Code</div>
            <div className="text-lg sm:text-xl font-bold">{roomCode}</div>
          </div>
          <button
            onClick={() => setView('control')}
            className="bg-white/20 hover:bg-white/30 px-3 py-2 sm:px-4 rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            📱 Control View
          </button>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 tv:px-8">
          {/* Now Singing */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl tv:text-6xl font-bold mb-2">🎵 Now Singing</h1>
            {currentSong ? (
              <>
                <div className="text-3xl sm:text-5xl lg:text-6xl tv:text-7xl font-bold mb-2">{currentSong.title}</div>
                <div className="text-2xl sm:text-4xl lg:text-5xl tv:text-6xl text-green-300">
                  Page {currentSong.page}{currentSong.old_page ? ` (${currentSong.old_page})` : ''}
                </div>

                {/* View Lyrics Button */}
                {currentSong.has_lyrics && (
                  <button
                    onClick={() => setShowLyrics(true)}
                    className={`mt-4 px-6 py-3 rounded-lg font-semibold text-base sm:text-lg transition-colors
                      ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'} text-white`}
                  >
                    📄 View Lyrics
                  </button>
                )}

                {/* TV Lyrics Display */}
                {showLyricsOnTV && currentSong.lyrics_text && (
                  <div className="mt-6 sm:mt-8 text-left bg-white/10 rounded-xl p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
                    <div className="text-base sm:text-lg lg:text-xl tv:text-2xl leading-relaxed whitespace-pre-wrap">
                      {currentSong.lyrics_text}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-2xl sm:text-4xl lg:text-5xl tv:text-6xl text-green-400">Pick a song to start!</div>
            )}
          </div>

          {/* Up Next Queue */}
          <div className="bg-white/10 rounded-xl p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl lg:text-3xl tv:text-4xl font-bold mb-4">👥 Up Next ({queue.length})</h2>
            {queue.length === 0 ? (
              <p className="text-lg sm:text-xl lg:text-2xl tv:text-3xl text-green-300">No songs in queue yet</p>
            ) : (
              <div className="flex flex-col gap-3">
                {queue.slice(0, 8).map((song, idx) => (
                  <div key={song.id} className="bg-white/10 rounded-xl p-3 sm:p-4 flex justify-between items-center">
                    <div>
                      <div className="text-base sm:text-xl lg:text-2xl tv:text-3xl font-semibold">
                        {idx + 1}. {song.song_title}
                        {song.has_lyrics && <span className="ml-2 text-sm" title="Lyrics available">📄</span>}
                      </div>
                      <div className="text-sm sm:text-base lg:text-lg tv:text-xl text-green-300">
                        Page {song.song_page}{song.old_page ? ` (${song.old_page})` : ''}
                      </div>
                      <div className="text-sm sm:text-lg lg:text-xl tv:text-2xl text-green-400">- {song.requester}</div>
                    </div>
                  </div>
                ))}
                {queue.length > 8 && (
                  <div className="text-sm sm:text-lg lg:text-xl tv:text-2xl text-green-400 text-center">
                    + {queue.length - 8} more songs
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Control View
  return (
    <div className={`min-h-screen p-2 sm:p-4 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-green-50 to-blue-50'}`}>
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">

        {/* Header Card */}
        <div className={`rounded-xl shadow-lg p-4 sm:p-6 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h1 className={`text-xl sm:text-2xl font-bold flex items-center gap-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              🎵 Camp Singalong
            </h1>
            <button
              onClick={() => setView('display')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 font-semibold transition-colors
                ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'} text-white`}
            >
              📺 Display View
            </button>
          </div>

          {/* Room Code */}
          <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 sm:p-4 rounded-lg border
            ${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'}`}>
            <div className="flex-1">
              <div className={`text-sm font-semibold ${isDark ? 'text-green-300' : 'text-green-700'}`}>Room Code</div>
              <div className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{roomCode}</div>
            </div>
            <button
              onClick={copyRoomCode}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors
                ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'} text-white`}
            >
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>

          {/* Now Singing */}
          {currentSong && (
            <div className={`mt-4 p-4 rounded-lg border-2
              ${isDark ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border-green-300'}`}>
              <div className={`text-sm font-semibold mb-1 ${isDark ? 'text-green-300' : 'text-green-700'}`}>NOW SINGING</div>
              <div className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{currentSong.title}</div>
              <div className={`text-base sm:text-lg ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                Page {currentSong.page}{currentSong.old_page ? ` (${currentSong.old_page})` : ''}
              </div>
              {currentSong.has_lyrics && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowLyricsOnTV(!showLyricsOnTV)}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors border
                      ${showLyricsOnTV
                        ? (isDark ? 'bg-green-600 text-white border-green-600' : 'bg-green-600 text-white border-green-600')
                        : (isDark ? 'bg-gray-800 text-gray-100 border-gray-600' : 'bg-gray-100 text-gray-900 border-gray-300')
                      }`}
                  >
                    {showLyricsOnTV ? '📄 Lyrics on TV: ON' : '📄 Lyrics on TV: OFF'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Random Song Generator */}
        <div className={`rounded-xl shadow-lg p-4 sm:p-6 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
          <h2 className={`text-lg sm:text-xl font-bold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            🎲 Random Song Generator
          </h2>

          <button
            onClick={() => setShowSectionFilter(!showSectionFilter)}
            className={`w-full p-3 rounded-lg mb-4 border text-left transition-colors
              ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700' : 'bg-gray-50 border-gray-300 text-gray-900 hover:bg-gray-100'}`}
          >
            Filter Sections ({selectedSections.length} selected)
          </button>

          {showSectionFilter && (
            <div className={`mb-4 p-3 sm:p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'}`}>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setSelectedSections(Object.keys(SECTION_INFO))}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-colors
                    ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'} text-white`}
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedSections([])}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-colors
                    ${isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-100' : 'bg-gray-300 hover:bg-gray-400 text-gray-900'}`}
                >
                  Clear All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                {Object.entries(SECTION_INFO).map(([letter, name]) => (
                  <label key={letter} className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(letter)}
                      onChange={() => toggleSection(letter)}
                      className="w-4 h-4 flex-shrink-0"
                    />
                    <span>{letter}: {name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={generateRandomSong}
            disabled={allSongs.length === 0}
            className={`w-full py-3 sm:py-4 rounded-lg font-semibold text-lg transition-colors
              ${allSongs.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}
              ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'} text-white`}
          >
            Generate Random Song
          </button>
        </div>


{/* Request a Song Section */}
        <div className={`rounded-xl shadow-lg p-4 sm:p-6 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-green-100'}`}>
          <h2 className={`text-lg sm:text-xl font-bold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Request a Song
          </h2>

          <input
            type="text"
            placeholder="Search by title, page, or section..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full px-4 py-3 rounded-lg mb-4 border text-base transition-all
              ${isDark ? 'bg-slate-800 border-slate-700 text-gray-100 focus:border-green-500' : 'bg-white border-gray-300 text-gray-900 focus:border-green-500'}
              focus:outline-none focus:ring-2 focus:ring-green-500/20`}
          />

          <div className="max-h-80 overflow-y-auto mb-4 space-y-2 pr-1 custom-scrollbar">
            {filteredSongs.slice(0, 50).map(song => (
              <div key={song.id} className={`flex justify-between items-center p-4 rounded-xl border transition-all ${
                isDark 
                  ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800' 
                  : 'bg-white border-green-100 hover:bg-green-50/50 shadow-sm'
              }`}>
                <div className="min-w-0 flex-1">
                  <div className={`font-bold truncate text-lg ${isDark ? 'text-white' : 'text-green-900'}`}>
                    {song.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isDark ? 'bg-slate-700 text-slate-300' : 'bg-green-100 text-green-700'
                    }`}>
                      Sec {song.section}
                    </span>
                    <span className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-green-600'}`}>
                      Page {song.page || '—'} {song.old_page && <span className="opacity-60 text-xs">({song.old_page})</span>}
                    </span>
                    {song.has_lyrics && (
                      <span className="text-[10px] font-bold text-green-500 flex items-center gap-1 uppercase tracking-tighter">
                        <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></span> Lyrics
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => addToQueue(song)}
                  className="ml-4 shrink-0 bg-green-600 hover:bg-green-500 text-white p-3 rounded-xl font-bold transition-all active:scale-90 shadow-lg shadow-green-900/20"
                >
                  ➕
                </button>
              </div>
            ))}
          </div>

          <div className={`border-t pt-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Request unlisted song:
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter song title..."
                value={customSongInput}
                onChange={(e) => setCustomSongInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addCustomSong()}
                className={`flex-1 px-4 py-2 rounded-lg border text-base
                  ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}
                  focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
              <button
                onClick={addCustomSong}
                className="px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Queue Section */}
        <div className={`rounded-xl shadow-lg p-4 sm:p-6 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
          <h2 className={`text-lg sm:text-xl font-bold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Queue ({queue.length} songs)
          </h2>

          {queue.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              No songs in queue
            </p>
          ) : (
            <div className="space-y-2">
              {queue.map((song, idx) => (
                <div key={song.id} className={`flex items-center gap-2 sm:gap-3 p-3 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveInQueue(song, -1)} className="p-1 hover:bg-gray-700 rounded text-xs">▲</button>
                    <button onClick={() => moveInQueue(song, 1)} className="p-1 hover:bg-gray-700 rounded text-xs">▼</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{song.song_title}</div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Page {song.song_page}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => playSong(song)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
                    >
                      Play
                    </button>
                    <button
                      onClick={() => removeFromQueue(song.id)}
                      className="px-3 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded text-sm font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}