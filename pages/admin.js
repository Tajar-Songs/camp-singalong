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

export default function Admin() {
  const [sessionName, setSessionName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('camp_admin_name') || '';
    }
    return '';
  });
  
  const [allSongs, setAllSongs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSong, setEditingSong] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [formTitle, setFormTitle] = useState('');
  const [formPage, setFormPage] = useState('');
  const [formOldPage, setFormOldPage] = useState('');
  const [formSection, setFormSection] = useState('A');
  const [formLyrics, setFormLyrics] = useState('');
  const [formHasLyrics, setFormHasLyrics] = useState(false);

  useEffect(() => { loadSongs(); }, []);

  const loadSongs = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      setAllSongs(await response.json());
    } catch (error) { console.error('Error loading songs:', error); }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const logChange = async (action, song, fieldChanged = null, oldValue = null, newValue = null, fullBefore = null, fullAfter = null) => {
    try {
      const payload = {
        action: action,
        song_id: song?.id || null,
        song_title: song?.title || fieldChanged,
        field_changed: fieldChanged,
        old_value: oldValue ? String(oldValue) : null,
        new_value: newValue ? String(newValue) : null,
        full_song_before: fullBefore,
        full_song_after: fullAfter,
        changed_by: sessionName || 'unknown'
      };

      await fetch(`${SUPABASE_URL}/rest/v1/change_log`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Logging Error:', error);
    }
  };

  const startEdit = (song) => {
    setEditingSong(song);
    setFormTitle(song.title);
    setFormPage(song.page || '');
    setFormOldPage(song.old_page || '');
    setFormSection(song.section || 'A');
    setIsAddingNew(false);
    setFormLyrics(song.lyrics_text || '');
    setFormHasLyrics(song.has_lyrics || false);
  };

  const startAddNew = () => {
    setEditingSong(null);
    setFormTitle('');
    setFormPage('');
    setFormOldPage('');
    setFormSection('A');
    setIsAddingNew(true);
    setFormLyrics('');
    setFormHasLyrics(false);
  };

  const cancelEdit = () => {
    setEditingSong(null);
    setIsAddingNew(false);
  };

  const saveSong = async () => {
    if (!sessionName.trim()) {
      showMessage('❌ Please enter your name at the top of the page before saving.');
      return;
    }
    if (!formTitle.trim()) {
      showMessage('Title is required');
      return;
    }
    setSaving(true);
    try {
      const newSongData = {
        title: formTitle.trim(),
        page: formPage.trim() || null,
        old_page: formOldPage.trim() || null,
        section: formSection,
        lyrics_text: formLyrics.trim() || null,
        has_lyrics: formLyrics.trim().length > 0
      };

      if (isAddingNew) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/songs`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=representation'
          },
          body: JSON.stringify(newSongData)
        });
        if (response.ok) {
          const createdSong = await response.json();
          await logChange('add', createdSong[0], null, null, null, null, createdSong[0]);
          showMessage('Song added!');
          setIsAddingNew(false);
          await loadSongs();
        }
      } else {
        const oldSong = editingSong;
        const changes = [];
        if (oldSong.title !== newSongData.title) changes.push({ field: 'title', old: oldSong.title, new: newSongData.title });
        if (oldSong.page !== newSongData.page) changes.push({ field: 'page', old: oldSong.page, new: newSongData.page });
        if (oldSong.old_page !== newSongData.old_page) changes.push({ field: 'old_page', old: oldSong.old_page, new: newSongData.old_page });
        if (oldSong.section !== newSongData.section) changes.push({ field: 'section', old: oldSong.section, new: newSongData.section });

        const response = await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${editingSong.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          },
          body: JSON.stringify(newSongData)
        });
        if (response.ok) {
          const fullAfter = { ...oldSong, ...newSongData };
          for (const change of changes) {
            await logChange('edit', oldSong, change.field, change.old, change.new, oldSong, fullAfter);
          }
          showMessage('Song updated!');
          setEditingSong(null);
          await loadSongs();
        }
      }
    } catch (error) {
      console.error('Error saving:', error);
    }
    setSaving(false);
  };

  const deleteSong = async () => {
    if (!sessionName.trim()) {
      showMessage('❌ Please enter your name at the top of the page before deleting.');
      return;
    }
    if (!editingSong || !confirm(`Are you sure you want to delete "${editingSong.title}"?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${editingSong.id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (response.ok) {
        await logChange('delete', editingSong, null, null, null, editingSong, null);
        showMessage('Song deleted');
        setEditingSong(null);
        await loadSongs();
      }
    } catch (error) { console.error('Error deleting:', error); }
    setSaving(false);
  };

  const filteredSongs = allSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (song.page && song.page.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const theme = {
    bg: '#111827',
    bgSecondary: '#1f2937',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    primary: '#22c55e',
    border: '#374151',
    danger: '#dc2626'
  };

  
  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 selection:bg-green-500/30">
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black flex items-center gap-3">
              <span className="text-green-500">🎵</span> Song Admin
            </h1>
            <p className="text-slate-400 mt-1 font-medium">
              {allSongs.length} songs in database
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={startAddNew} 
              className="flex-1 md:flex-none bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg font-bold transition-all active:scale-95 shadow-lg shadow-green-900/20 focus:ring-4 focus:ring-green-500/50 outline-none"
            >
              + Add Song
            </button>
            <a 
              href="/" 
              className="flex-1 md:flex-none bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-2.5 rounded-lg font-bold border border-slate-700 transition-all text-center focus:ring-4 focus:ring-slate-500/50 outline-none"
            >
              ← Back
            </a>
          </div>
        </header>

        {/* Sticky Name Bar - Accessible Version */}
        <section 
          className={`sticky top-4 z-50 p-4 rounded-xl mb-8 border transition-all duration-300 shadow-2xl flex flex-col sm:flex-row items-center gap-4 ${
            sessionName.trim() 
              ? 'bg-slate-800/95 backdrop-blur border-slate-700 shadow-black/50' 
              : 'bg-red-950/90 backdrop-blur border-red-500 shadow-red-900/20'
          }`}
        >
          <label htmlFor="admin-name" className="font-bold flex items-center gap-2 whitespace-nowrap">
            <span className="text-xl">👤</span> Your Name:
          </label>
          <input 
            id="admin-name"
            type="text" 
            placeholder="Type your name to unlock editing..." 
            value={sessionName} 
            onChange={(e) => {
              setSessionName(e.target.value);
              localStorage.setItem('camp_admin_name', e.target.value);
            }}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder:text-slate-500 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 outline-none transition-all" 
          />
          {!sessionName.trim() && (
            <span className="text-red-400 font-bold text-sm animate-pulse whitespace-nowrap text-center">
              ⚠️ Required to save
            </span>
          )}
        </section>

        {/* Status Message - Toast style */}
        {message && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-8 py-4 rounded-2xl font-bold shadow-2xl flex items-center gap-3 border border-green-400 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <span>✅</span> {message}
          </div>
        )}

        {/* Form Section */}
        {(editingSong || isAddingNew) && (
          <div style={{background:theme.bgSecondary,borderRadius:'0.75rem',padding:'1.5rem',marginBottom:'1.5rem',border:`1px solid ${theme.border}`}}>
            <h2 style={{fontSize:'1.25rem',fontWeight:'bold',marginBottom:'1rem'}}>{isAddingNew ? 'Add New Song' : `Editing: ${editingSong.title}`}</h2>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',color:theme.textSecondary,marginBottom:'0.25rem'}}>Title *</label>
                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',color:theme.textSecondary,marginBottom:'0.25rem'}}>Section</label>
                <select value={formSection} onChange={(e) => setFormSection(e.target.value)} style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}>
                  {Object.entries(SECTION_INFO).map(([letter, name]) => <option key={letter} value={letter}>{letter}: {name}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Page (new)" value={formPage} onChange={(e) => setFormPage(e.target.value)} style={{padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}/>
              <input type="text" placeholder="Old Page" value={formOldPage} onChange={(e) => setFormOldPage(e.target.value)} style={{padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}/>
            </div>
            <textarea value={formLyrics} onChange={(e) => setFormLyrics(e.target.value)} placeholder="Lyrics..." rows={10} style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text,marginBottom:'1rem'}}/>
            <div style={{display:'flex',gap:'0.5rem'}}>
              <button onClick={saveSong} disabled={saving} style={{background:theme.primary,color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',fontWeight:'600'}}>{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={cancelEdit} style={{background:theme.bgSecondary,color:theme.text,padding:'0.5rem 1rem',borderRadius:'0.5rem',border:`1px solid ${theme.border}`}}>Cancel</button>
              {editingSong && <button onClick={deleteSong} style={{background:theme.danger,color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',marginLeft:'auto'}}>Delete</button>}
            </div>
          </div>
        )}

        {/* Search & Stats Bar */}
        <div className="mb-6 space-y-2">
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-green-500 transition-colors">
              🔍
            </span>
            <input 
              type="text" 
              placeholder="Search by title, page, or section..."
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-12 pr-4 py-4 text-white placeholder:text-slate-500 focus:bg-slate-800 focus:border-green-500 focus:ring-4 focus:ring-green-500/10 outline-none transition-all shadow-inner"
            />
          </div>
          <div className="flex justify-between items-center px-2">
            <p className="text-sm text-slate-400 font-medium">
              Showing <span className="text-green-400 font-bold">{filteredSongs.length}</span> of {allSongs.length} songs
            </p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="text-sm text-green-500 hover:text-green-400 font-bold transition-colors"
              >
                Clear Search
              </button>
            )}
          </div>
        </div>

        {/* Song List Container */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl mb-12">
          <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
            {filteredSongs.length > 0 ? (
              <div className="divide-y divide-slate-700/50">
                {filteredSongs.map(song => (
                  <button 
                    key={song.id} 
                    onClick={() => startEdit(song)}
                    className={`w-full text-left p-4 sm:px-6 transition-all flex items-center justify-between group hover:bg-slate-700/40 outline-none focus:bg-slate-700/60 ${
                      editingSong?.id === song.id ? 'bg-green-500/10 border-l-4 border-l-green-500' : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-100 group-hover:text-white transition-colors truncate text-lg">
                        {song.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-black bg-slate-700 text-slate-300">
                          Sec {song.section}
                        </span>
                        <span className="text-sm text-slate-400 flex items-center gap-1">
                          📄 Page {song.page || '—'}
                          {song.old_page && (
                            <span className="text-slate-500 text-xs">(Old: {song.old_page})</span>
                          )}
                        </span>
                        {song.has_lyrics && (
                          <span className="text-xs text-green-500 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Lyrics
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 shrink-0 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity hidden sm:block">
                      <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-md text-xs font-bold flex items-center gap-2 border border-slate-600">
                        EDIT ✏️
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-16 text-center">
                <div className="text-5xl mb-4 grayscale opacity-20">📂</div>
                <h3 className="text-lg font-bold text-slate-300">No matches found</h3>
                <p className="text-slate-500 text-sm mt-1">Try a different title or page number</p>
              </div>
            )}
          </div>
        </div>
        
        <div style={{position:'fixed',bottom:'1rem',left:'0',right:'0',textAlign:'center',background:theme.bg,paddingTop:'0.5rem'}}>
          <a href="https://docs.google.com/forms/..." target="_blank" rel="noopener noreferrer" style={{color:'#9ca3af',fontSize:'0.875rem',textDecoration:'none'}}>📝 Share Feedback</a>
        </div>
      </div>
    </div>
  );
}