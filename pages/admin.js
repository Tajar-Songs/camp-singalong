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
  const [allSongs, setAllSongs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSong, setEditingSong] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formPage, setFormPage] = useState('');
  const [formOldPage, setFormOldPage] = useState('');
  const [formSection, setFormSection] = useState('A');

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

  const startEdit = (song) => {
    setEditingSong(song);
    setFormTitle(song.title);
    setFormPage(song.page || '');
    setFormOldPage(song.old_page || '');
    setFormSection(song.section || 'A');
    setIsAddingNew(false);
  };

  const startAddNew = () => {
    setEditingSong(null);
    setFormTitle('');
    setFormPage('');
    setFormOldPage('');
    setFormSection('A');
    setIsAddingNew(true);
  };

  const cancelEdit = () => {
    setEditingSong(null);
    setIsAddingNew(false);
  };

  const saveSong = async () => {
    if (!formTitle.trim()) {
      showMessage('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (isAddingNew) {
        // Create new song
        const response = await fetch(`${SUPABASE_URL}/rest/v1/songs`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            title: formTitle.trim(),
            page: formPage.trim() || null,
            old_page: formOldPage.trim() || null,
            section: formSection
          })
        });
        if (response.ok) {
          showMessage('Song added!');
          setIsAddingNew(false);
          await loadSongs();
        } else {
          showMessage('Error adding song');
        }
      } else {
        // Update existing song
        const response = await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${editingSong.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            title: formTitle.trim(),
            page: formPage.trim() || null,
            old_page: formOldPage.trim() || null,
            section: formSection
          })
        });
        if (response.ok) {
          showMessage('Song updated!');
          setEditingSong(null);
          await loadSongs();
        } else {
          showMessage('Error updating song');
        }
      }
    } catch (error) {
      console.error('Error saving song:', error);
      showMessage('Error saving song');
    }
    setSaving(false);
  };

  const deleteSong = async () => {
    if (!editingSong) return;
    if (!confirm(`Are you sure you want to delete "${editingSong.title}"?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${editingSong.id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (response.ok) {
        showMessage('Song deleted');
        setEditingSong(null);
        await loadSongs();
      } else {
        showMessage('Error deleting song');
      }
    } catch (error) {
      console.error('Error deleting song:', error);
      showMessage('Error deleting song');
    }
    setSaving(false);
  };

  const filteredSongs = allSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (song.page && song.page.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.section && song.section.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Styles
  const theme = {
    bg: '#111827',
    bgSecondary: '#1f2937',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    primary: '#22c55e',
    primaryHover: '#16a34a',
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
            <button onClick={startAddNew}
              style={{background:theme.primary,color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',cursor:'pointer',fontWeight:'600'}}>
              + Add Song
            </button>
            <a href="/"
              style={{background:theme.bgSecondary,color:theme.text,padding:'0.5rem 1rem',borderRadius:'0.5rem',border:`1px solid ${theme.border}`,textDecoration:'none',display:'flex',alignItems:'center'}}>
              ← Back to App
            </a>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div style={{background:theme.primary,color:'white',padding:'0.75rem 1rem',borderRadius:'0.5rem',marginBottom:'1rem'}}>
            {message}
          </div>
        )}

        {/* Edit/Add Form */}
        {(editingSong || isAddingNew) && (
          <div style={{background:theme.bgSecondary,borderRadius:'0.75rem',padding:'1.5rem',marginBottom:'1.5rem',border:`1px solid ${theme.border}`}}>
            <h2 style={{fontSize:'1.25rem',fontWeight:'bold',marginBottom:'1rem'}}>
              {isAddingNew ? 'Add New Song' : `Editing: ${editingSong.title}`}
            </h2>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',color:theme.textSecondary,marginBottom:'0.25rem'}}>Title *</label>
                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                  style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',color:theme.textSecondary,marginBottom:'0.25rem'}}>Section</label>
                <select value={formSection} onChange={(e) => setFormSection(e.target.value)}
                  style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}>
                  {Object.entries(SECTION_INFO).map(([letter, name]) => (
                    <option key={letter} value={letter}>{letter}: {name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',color:theme.textSecondary,marginBottom:'0.25rem'}}>Page (new)</label>
                <input type="text" value={formPage} onChange={(e) => setFormPage(e.target.value)}
                  placeholder="e.g. F-2"
                  style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',color:theme.textSecondary,marginBottom:'0.25rem'}}>Old Page</label>
                <input type="text" value={formOldPage} onChange={(e) => setFormOldPage(e.target.value)}
                  placeholder="e.g. 42"
                  style={{width:'100%',padding:'0.5rem',borderRadius:'0.25rem',border:`1px solid ${theme.border}`,background:theme.bg,color:theme.text}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'0.5rem'}}>
              <button onClick={saveSong} disabled={saving}
                style={{background:theme.primary,color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',cursor:'pointer',fontWeight:'600',opacity:saving?0.5:1}}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={cancelEdit}
                style={{background:theme.bgSecondary,color:theme.text,padding:'0.5rem 1rem',borderRadius:'0.5rem',border:`1px solid ${theme.border}`,cursor:'pointer'}}>
                Cancel
              </button>
              {editingSong && (
                <button onClick={deleteSong} disabled={saving}
                  style={{background:theme.danger,color:'white',padding:'0.5rem 1rem',borderRadius:'0.5rem',border:'none',cursor:'pointer',marginLeft:'auto',opacity:saving?0.5:1}}>
                  Delete
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{marginBottom:'1rem'}}>
          <input type="text" placeholder="Search songs by title, page, or section..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            style={{width:'100%',padding:'0.75rem 1rem',borderRadius:'0.5rem',border:`1px solid ${theme.border}`,background:theme.bgSecondary,color:theme.text,fontSize:'1rem'}}/>
        </div>

        {/* Song List */}
        <div style={{background:theme.bgSecondary,borderRadius:'0.75rem',border:`1px solid ${theme.border}`,overflow:'hidden'}}>
          <div style={{maxHeight:'60vh',overflowY:'auto'}}>
            {filteredSongs.map(song => (
              <div key={song.id} onClick={() => startEdit(song)}
                style={{padding:'0.75rem 1rem',borderBottom:`1px solid ${theme.border}`,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',
                  background: editingSong?.id === song.id ? theme.bg : 'transparent'}}>
                <div>
                  <div style={{fontWeight:'500'}}>{song.title}</div>
                  <div style={{fontSize:'0.875rem',color:theme.textSecondary}}>
                    Section {song.section} • Page {song.page}{song.old_page ? ` (${song.old_page})` : ''}
                  </div>
                </div>
                <div style={{color:theme.textSecondary,fontSize:'0.875rem'}}>
                  Click to edit
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Results count */}
        <div style={{marginTop:'0.5rem',color:theme.textSecondary,fontSize:'0.875rem'}}>
          Showing {filteredSongs.length} of {allSongs.length} songs
        </div>

      </div>
    </div>
  );
}