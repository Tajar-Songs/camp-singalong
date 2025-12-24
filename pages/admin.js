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
    <div style={{minHeight:'100vh',background:theme.bg,color:theme.text,padding:'2rem'}}>
      <div style={{maxWidth:'64rem',margin:'0 auto'}}>
        
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
          <div>
            <h1 style={{fontSize:'1.875rem',fontWeight:'bold',marginBottom:'0.25rem'}}>🎵 Song Admin</h1>
            <p style={{color:theme.textSecondary}}>{allSongs.length} songs in database</p>
          </div>
          <div style={{display:'flex',gap:'0.5rem'}}>
            <button onClick={startAddNew} style={{background:theme.primary,color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',cursor:'pointer',fontWeight:'600'}}>+ Add Song</button>
            <a href="/" style={{background:theme.bgSecondary,color:theme.text,padding:'0.5rem 1rem',borderRadius:'0.5rem',border:`1px solid ${theme.border}`,textDecoration:'none',display:'flex',alignItems:'center'}}>← Back to App</a>
          </div>
        </div>

        {/* Sticky Name Bar */}
        <div style={{ 
          position: 'sticky', top: '1rem', zIndex: 100,
          background: sessionName.trim() ? theme.bgSecondary : '#450a0a', 
          padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', 
          border: `1px solid ${sessionName.trim() ? theme.border : '#dc2626'}`,
          display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
        }}>
          <span style={{ fontWeight: 'bold' }}>👤 Your Name:</span>
          <input 
            type="text" placeholder="Enter name to enable saving..." value={sessionName} 
            onChange={(e) => {
              setSessionName(e.target.value);
              localStorage.setItem('camp_admin_name', e.target.value);
            }}
            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.25rem', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text }} 
          />
          {!sessionName.trim() && <span style={{ color: '#f87171', fontSize: '0.875rem', fontWeight: 'bold' }}>⚠️ Required to save</span>}
        </div>

        {/* Status Message */}
        {message && (
          <div style={{background:theme.primary,color:'white',padding:'0.75rem 1rem',borderRadius:'0.5rem',marginBottom:'1rem'}}>{message}</div>
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

        {/* List Section */}
        <input type="text" placeholder="Search songs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{width:'100%',padding:'0.75rem 1rem',borderRadius:'0.5rem',border:`1px solid ${theme.border}`,background:theme.bgSecondary,color:theme.text,marginBottom:'1rem'}}/>
        
        <div style={{background:theme.bgSecondary,borderRadius:'0.75rem',border:`1px solid ${theme.border}`,overflow:'hidden',marginBottom:'3rem'}}>
          <div style={{maxHeight:'60vh',overflowY:'auto'}}>
            {filteredSongs.map(song => (
              <div key={song.id} onClick={() => startEdit(song)} style={{padding:'0.75rem 1rem',borderBottom:`1px solid ${theme.border}`,cursor:'pointer',display:'flex',justifyContent:'space-between',background: editingSong?.id === song.id ? theme.bg : 'transparent'}}>
                <div>
                 <div style={{fontWeight:'500'}}>{song.title}{song.has_lyrics && ' 📄'}</div>
                  <div style={{fontSize:'0.875rem',color:theme.textSecondary}}>Section {song.section} • Page {song.page}</div>
                </div>
                <div style={{color:theme.textSecondary,fontSize:'0.875rem'}}>Edit</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{marginTop:'0.5rem',color:theme.textSecondary,fontSize:'0.875rem'}}>Showing {filteredSongs.length} of {allSongs.length} songs</div>

        <div style={{position:'fixed',bottom:'1rem',left:'0',right:'0',textAlign:'center',background:theme.bg,paddingTop:'0.5rem'}}>
          <a href="https://docs.google.com/forms/..." target="_blank" rel="noopener noreferrer" style={{color:'#9ca3af',fontSize:'0.875rem',textDecoration:'none'}}>📝 Share Feedback</a>
        </div>
      </div>
    </div>
  );
}