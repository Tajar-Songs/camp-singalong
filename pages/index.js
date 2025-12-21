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

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
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
          room_id: roomCode, song_title: song.title, song_page: song.page,
          song_section: song.section, requester: requester, position: maxPosition + 1
        })
      });
      await loadRoomData();
    } catch (error) { console.error('Error adding to queue:', error); }
  };

  const generateRandomSong = () => {
    const availableSongs = allSongs.filter(song => 
      selectedSections.includes(song.section) && !sungSongs.some(s => s.title === song.title)
    );
    if (availableSongs.length === 0) { alert('No songs available with current filters!'); return; }
    addToQueue(availableSongs[Math.floor(Math.random() * availableSongs.length)], 'Random');
  };

  const playSong = async (song) => {
    const songObj = { title: song.song_title, page: song.song_page, section: song.song_section };
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

  const filteredSongs = allSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!roomCode) {
    return (
      <div style={{minHeight:'100vh',background:'linear-gradient(to bottom right,#14532d,#15803d,#14532d)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
        <div style={{background:'white',borderRadius:'1rem',boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)',padding:'2rem',maxWidth:'28rem',width:'100%'}}>
          <div style={{textAlign:'center',marginBottom:'2rem'}}>
            <div style={{fontSize:'4rem',marginBottom:'1rem'}}>🎵</div>
            <h1 style={{fontSize:'1.875rem',fontWeight:'bold',color:'#111827',marginBottom:'0.5rem'}}>Camp Singalong</h1>
            <p style={{color:'#6b7280'}}>Start or join a singalong session</p>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
            <button onClick={createRoom} disabled={loading}
              style={{width:'100%',background:'#16a34a',color:'white',padding:'1rem',borderRadius:'0.5rem',fontWeight:'600',fontSize:'1.125rem',border:'none',cursor:'pointer',opacity:loading?0.5:1}}>
              {loading?'Creating...':'Create New Room'}
            </button>
            <div style={{position:'relative'}}>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center'}}>
                <div style={{width:'100%',borderTop:'1px solid #d1d5db'}}></div>
              </div>
              <div style={{position:'relative',display:'flex',justifyContent:'center',fontSize:'0.875rem'}}>
                <span style={{padding:'0 1rem',background:'white',color:'#6b7280'}}>OR</span>
              </div>
            </div>
            <div>
              <label style={{display:'block',fontSize:'0.875rem',fontWeight:'500',color:'#374151',marginBottom:'0.5rem'}}>Join Existing Room</label>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <input type="text" placeholder="Enter room code" value={roomCodeInput}
                  onChange={(e)=>setRoomCodeInput(e.target.value.toUpperCase())}
                  onKeyPress={(e)=>e.key==='Enter'&&joinRoom()}
                  style={{flex:1,padding:'0.75rem 1rem',border:'1px solid #d1d5db',borderRadius:'0.5rem',textTransform:'uppercase'}}
                  maxLength={6}/>
                <button onClick={joinRoom} disabled={loading||!roomCodeInput}
                  style={{background:'#2563eb',color:'white',padding:'0.75rem 1.5rem',borderRadius:'0.5rem',fontWeight:'600',border:'none',cursor:'pointer',opacity:(loading||!roomCodeInput)?0.5:1}}>
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view==='display') {
    return (
      <div style={{minHeight:'100vh',background:'linear-gradient(to bottom right,#14532d,#15803d,#14532d)',color:'white',padding:'2rem'}}>
        <button onClick={()=>setView('control')}
          style={{position:'fixed',top:'1rem',right:'1rem',background:'rgba(255,255,255,0.2)',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',color:'white',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.5rem'}}>
          📱 Switch to Control View
        </button>
        <div style={{position:'fixed',top:'1rem',left:'1rem',background:'rgba(255,255,255,0.2)',padding:'0.5rem 1rem',borderRadius:'0.5rem'}}>
          <div style={{fontSize:'0.875rem',color:'#bbf7d0'}}>Room Code</div>
          <div style={{fontSize:'1.5rem',fontWeight:'bold'}}>{roomCode}</div>
        </div>
        <div style={{maxWidth:'96rem',margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:'3rem'}}>
            <h1 style={{fontSize:'3.75rem',fontWeight:'bold',marginBottom:'1rem'}}>🎵 Now Singing</h1>
            {currentSong?(
              <>
                <div style={{fontSize:'5rem',fontWeight:'bold',marginBottom:'1rem'}}>{currentSong.title}</div>
                <div style={{fontSize:'3.75rem',color:'#bbf7d0'}}>Page {currentSong.page}</div>
              </>
            ):(
              <div style={{fontSize:'3.75rem',color:'#86efac'}}>Pick a song to start!</div>
            )}
          </div>
          <div style={{background:'rgba(255,255,255,0.1)',borderRadius:'1rem',padding:'2rem'}}>
            <h2 style={{fontSize:'2.25rem',fontWeight:'bold',marginBottom:'1.5rem'}}>👥 Up Next ({queue.length})</h2>
            {queue.length===0?(
              <p style={{fontSize:'1.875rem',color:'#bbf7d0'}}>No songs in queue yet</p>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {queue.slice(0,8).map((song,idx)=>(
                  <div key={song.id} style={{background:'rgba(255,255,255,0.1)',borderRadius:'0.75rem',padding:'1rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:'1.875rem',fontWeight:'600'}}>{idx+1}. {song.song_title}</div>
                      <div style={{fontSize:'1.5rem',color:'#bbf7d0'}}>Page {song.song_page}</div>
                    </div>
                    <div style={{fontSize:'1.5rem',color:'#86efac'}}>- {song.requester}</div>
                  </div>
                ))}
                {queue.length>8&&(
                  <div style={{fontSize:'1.5rem',color:'#86efac',textAlign:'center'}}>+ {queue.length-8} more songs</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(to bottom right,#f0fdf4,#dbeafe)',padding:'1rem'}}>
      <div style={{maxWidth:'64rem',margin:'0 auto'}}>
        <div style={{background:'white',borderRadius:'0.75rem',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)',padding:'1.5rem',marginBottom:'1.5rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
            <h1 style={{fontSize:'1.875rem',fontWeight:'bold',color:'#166534',display:'flex',alignItems:'center',gap:'0.5rem'}}>
              🎵 Camp Singalong
            </h1>
            <button onClick={()=>setView('display')}
              style={{background:'#16a34a',color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',border:'none',cursor:'pointer',fontWeight:'600'}}>
              📺 Display View
            </button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',background:'#f0fdf4',padding:'0.75rem',borderRadius:'0.5rem'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:'0.875rem',color:'#16a34a',fontWeight:'600'}}>Room Code</div>
              <div style={{fontSize:'1.5rem',fontWeight:'bold',color:'#14532d'}}>{roomCode}</div>
            </div>
            <button onClick={copyRoomCode}
              style={{background:'#16a34a',color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',border:'none',cursor:'pointer'}}>
              {copied?'✓ Copied!':'📋 Copy'}
            </button>
          </div>
          {currentSong&&(
            <div style={{background:'#f0fdf4',borderRadius:'0.5rem',padding:'1rem',border:'2px solid #bbf7d0',marginTop:'1rem'}}>
              <div style={{fontSize:'0.875rem',color:'#16a34a',fontWeight:'600',marginBottom:'0.25rem'}}>NOW SINGING</div>
              <div style={{fontSize:'1.5rem',fontWeight:'bold',color:'#14532d'}}>{currentSong.title}</div>
              <div style={{fontSize:'1.125rem',color:'#15803d'}}>Page {currentSong.page}</div>
            </div>
          )}
        </div>

        <div style={{background:'white',borderRadius:'0.75rem',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)',padding:'1.5rem',marginBottom:'1.5rem'}}>
          <h2 style={{fontSize:'1.25rem',fontWeight:'bold',color:'#166534',marginBottom:'1rem'}}>🎲 Random Song Generator</h2>
          <button onClick={()=>setShowSectionFilter(!showSectionFilter)}
            style={{width:'100%',background:'#f3f4f6',padding:'0.5rem 1rem',borderRadius:'0.5rem',marginBottom:'1rem',border:'none',cursor:'pointer',color:'#1f2937'}}>
            Filter Sections ({selectedSections.length} selected)
          </button>
          {showSectionFilter&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.5rem',marginBottom:'1rem',maxHeight:'15rem',overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:'0.5rem',padding:'0.75rem'}}>
              {Object.entries(SECTION_INFO).map(([letter,name])=>(
                <label key={letter} style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.875rem'}}>
                  <input type="checkbox" checked={selectedSections.includes(letter)}
                    onChange={()=>toggleSection(letter)} style={{width:'1rem',height:'1rem'}}/>
                  <span>{letter}: {name}</span>
                </label>
              ))}
            </div>
          )}
          <button onClick={generateRandomSong} disabled={allSongs.length===0}
            style={{width:'100%',background:'#16a34a',color:'white',padding:'0.75rem 1.5rem',borderRadius:'0.5rem',fontWeight:'600',fontSize:'1.125rem',border:'none',cursor:'pointer',opacity:allSongs.length===0?0.5:1}}>
            Generate Random Song
          </button>
        </div>

        <div style={{background:'white',borderRadius:'0.75rem',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)',padding:'1.5rem',marginBottom:'1.5rem'}}>
          <h2 style={{fontSize:'1.25rem',fontWeight:'bold',color:'#166534',marginBottom:'1rem'}}>Request a Song</h2>
          <input type="text" placeholder="Search songs..." value={searchTerm}
            onChange={(e)=>setSearchTerm(e.target.value)}
            style={{width:'100%',padding:'0.5rem 1rem',border:'1px solid #d1d5db',borderRadius:'0.5rem',marginBottom:'1rem'}}/>
          <div style={{maxHeight:'15rem',overflowY:'auto',marginBottom:'1rem'}}>
            {filteredSongs.slice(0,50).map(song=>(
              <div key={song.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f9fafb',padding:'0.75rem',borderRadius:'0.5rem',marginBottom:'0.5rem'}}>
                <div>
                  <div style={{fontWeight:'600',color:'#111827'}}>{song.title}</div>
                  <div style={{fontSize:'0.875rem',color:'#6b7280'}}>Page {song.page}</div>
                </div>
                <button onClick={()=>addToQueue(song)}
                  style={{background:'#16a34a',color:'white',padding:'0.25rem 0.75rem',borderRadius:'0.25rem',display:'flex',alignItems:'center',gap:'0.25rem',border:'none',cursor:'pointer'}}>
                  ➕ Add
                </button>
              </div>
            ))}
          </div>
          <div style={{borderTop:'1px solid #e5e7eb',paddingTop:'1rem'}}>
            <div style={{fontSize:'0.875rem',fontWeight:'600',color:'#374151',marginBottom:'0.5rem'}}>Request unlisted song:</div>
            <div style={{display:'flex',gap:'0.5rem'}}>
              <input type="text" placeholder="Enter song title..." value={customSongInput}
                onChange={(e)=>setCustomSongInput(e.target.value)}
                onKeyPress={(e)=>e.key==='Enter'&&addCustomSong()}
                style={{flex:1,padding:'0.5rem 1rem',border:'1px solid #d1d5db',borderRadius:'0.5rem'}}/>
              <button onClick={addCustomSong}
                style={{background:'#2563eb',color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',cursor:'pointer'}}>
                Add
              </button>
            </div>
          </div>
        </div>

        <div style={{background:'white',borderRadius:'0.75rem',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)',padding:'1.5rem'}}>
          <h2 style={{fontSize:'1.25rem',fontWeight:'bold',color:'#166534',marginBottom:'1rem'}}>Queue ({queue.length} songs)</h2>
          {queue.length===0?(
            <p style={{color:'#6b7280',textAlign:'center',padding:'2rem'}}>No songs in queue</p>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
              {queue.map((song,idx)=>(
                <div key={song.id} style={{display:'flex',alignItems:'center',gap:'0.5rem',background:'#f9fafb',padding:'0.75rem',borderRadius:'0.5rem'}}>
                  <div style={{display:'flex',flexDirection:'column',gap:'0.25rem'}}>
                    <button onClick={()=>moveInQueue(song,-1)} disabled={idx===0}
                      style={{padding:'0.25rem',background:'transparent',border:'none',cursor:'pointer',opacity:idx===0?0.3:1}}>
                      ▲
                    </button>
                    <button onClick={()=>moveInQueue(song,1)} disabled={idx===queue.length-1}
                      style={{padding:'0.25rem',background:'transparent',border:'none',cursor:'pointer',opacity:idx===queue.length-1?0.3:1}}>
                      ▼
                    </button>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:'600',color:'#111827'}}>{song.song_title}</div>
                    <div style={{fontSize:'0.875rem',color:'#6b7280'}}>Page {song.song_page} • Requested by {song.requester}</div>
                  </div>
                  <button onClick={()=>playSong(song)}
                    style={{background:'#16a34a',color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',fontWeight:'600',border:'none',cursor:'pointer'}}>
                    Play Now
                  </button>
                  <button onClick={()=>removeFromQueue(song.id)}
                    style={{padding:'0.5rem',background:'transparent',border:'none',color:'#dc2626',cursor:'pointer'}}>
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {sungSongs.length>0&&(
          <div style={{background:'white',borderRadius:'0.75rem',boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)',padding:'1.5rem',marginTop:'1.5rem'}}>
            <h2 style={{fontSize:'1.25rem',fontWeight:'bold',color:'#1f2937',marginBottom:'1rem'}}>Already Sung ({sungSongs.length})</h2>
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem'}}>
              {sungSongs.map((song,idx)=>(
                <span key={idx} style={{background:'#f3f4f6',padding:'0.25rem 0.75rem',borderRadius:'9999px',fontSize:'0.875rem'}}>
                  {song.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}