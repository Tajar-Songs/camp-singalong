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



export default function TagManagement() {
  // Session name for tracking who makes changes
  const [sessionName, setSessionName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('camp_admin_name') || '';
    }
    return '';
  });

  // Data state
  const [tags, setTags] = useState([]);
  const [songs, setSongs] = useState([]);
  const [songTags, setSongTags] = useState([]); // All song-tag relationships

  // UI state
  const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'apply'
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Tag form state
  const [editingTag, setEditingTag] = useState(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagDescription, setTagDescription] = useState('');

  // Song filtering state (for Apply tab)
  const [selectedSections, setSelectedSections] = useState(Object.keys(SECTION_INFO));
  const [filterByTag, setFilterByTag] = useState(''); // 'has:tagId', 'missing:tagId', or ''
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSongs, setSelectedSongs] = useState([]); // Array of song IDs
  const [applyTagId, setApplyTagId] = useState(''); // Tag to apply to selected songs

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tagsRes, songsRes, songTagsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/tags?select=*&order=name.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        })
      ]);
      setTags(await tagsRes.json());
      setSongs(await songsRes.json());
      setSongTags(await songTagsRes.json());
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // Get tags for a specific song
  const getTagsForSong = (songId) => {
    const tagIds = songTags.filter(st => st.song_id === songId).map(st => st.tag_id);
    return tags.filter(t => tagIds.includes(t.id));
  };

  // Check if song has a specific tag
  const songHasTag = (songId, tagId) => {
    return songTags.some(st => st.song_id === songId && st.tag_id === tagId);
  };

  // ============ TAG MANAGEMENT ============

  const startAddTag = () => {
    setEditingTag(null);
    setTagName('');
    setTagDescription('');
    setIsAddingTag(true);
  };

  const startEditTag = (tag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagDescription(tag.description || '');
    setIsAddingTag(false);
  };

  const cancelTagEdit = () => {
    setEditingTag(null);
    setIsAddingTag(false);
  };

  const saveTag = async () => {
    if (!sessionName.trim()) {
      showMessage('❌ Please enter your name first');
      return;
    }
    if (!tagName.trim()) {
      showMessage('❌ Tag name is required');
      return;
    }

    try {
      const tagData = {
        name: tagName.trim(),
        description: tagDescription.trim() || null,
        created_by: sessionName
      };

      if (isAddingTag) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/tags`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(tagData)
        });
        if (response.ok) {
          showMessage('✅ Tag created!');
          setIsAddingTag(false);
          await loadData();
        } else {
          const error = await response.json();
          showMessage(`❌ Error: ${error.message || 'Could not create tag'}`);
        }
      } else {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/tags?id=eq.${editingTag.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(tagData)
        });
        if (response.ok) {
          showMessage('✅ Tag updated!');
          setEditingTag(null);
          await loadData();
        }
      }
    } catch (error) {
      console.error('Error saving tag:', error);
      showMessage('❌ Error saving tag');
    }
  };

  const deleteTag = async (tag) => {
    if (!confirm(`Delete tag "${tag.name}"? This will remove it from all songs.`)) return;
    
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/tags?id=eq.${tag.id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (response.ok) {
        showMessage('✅ Tag deleted');
        await loadData();
      }
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  };

  // ============ SONG TAGGING ============

  const toggleSection = (section) => {
    setSelectedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const toggleSongSelection = (songId) => {
    setSelectedSongs(prev =>
      prev.includes(songId) ? prev.filter(id => id !== songId) : [...prev, songId]
    );
  };

  const selectAllVisible = () => {
    setSelectedSongs(filteredSongs.map(s => s.id));
  };

  const clearSelection = () => {
    setSelectedSongs([]);
  };

  // Filter songs based on section, tag filter, and search
  const filteredSongs = songs.filter(song => {
    // Section filter
    if (!selectedSections.includes(song.section)) return false;

    // Tag filter
    if (filterByTag) {
      const [filterType, tagId] = filterByTag.split(':');
      const hasTag = songHasTag(song.id, tagId);
      if (filterType === 'has' && !hasTag) return false;
      if (filterType === 'missing' && hasTag) return false;
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesTitle = song.title.toLowerCase().includes(searchLower);
      const matchesPage = song.page?.toLowerCase().includes(searchLower);
      if (!matchesTitle && !matchesPage) return false;
    }

    return true;
  });

  const applyTagToSelected = async () => {
    if (!applyTagId) {
      showMessage('❌ Please select a tag to apply');
      return;
    }
    if (selectedSongs.length === 0) {
      showMessage('❌ Please select at least one song');
      return;
    }

    try {
      // Filter out songs that already have this tag
      const songsToTag = selectedSongs.filter(songId => !songHasTag(songId, applyTagId));
      
      if (songsToTag.length === 0) {
        showMessage('ℹ️ All selected songs already have this tag');
        return;
      }

      const inserts = songsToTag.map(songId => ({
        song_id: songId,
        tag_id: applyTagId
      }));

      const response = await fetch(`${SUPABASE_URL}/rest/v1/song_tags`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(inserts)
      });

      if (response.ok) {
        showMessage(`✅ Tag applied to ${songsToTag.length} song(s)`);
        setSelectedSongs([]);
        await loadData();
      }
    } catch (error) {
      console.error('Error applying tag:', error);
      showMessage('❌ Error applying tag');
    }
  };

  const removeTagFromSelected = async () => {
    if (!applyTagId) {
      showMessage('❌ Please select a tag to remove');
      return;
    }
    if (selectedSongs.length === 0) {
      showMessage('❌ Please select at least one song');
      return;
    }

    try {
      // Only remove from songs that have this tag
      const songsWithTag = selectedSongs.filter(songId => songHasTag(songId, applyTagId));
      
      if (songsWithTag.length === 0) {
        showMessage('ℹ️ None of the selected songs have this tag');
        return;
      }

      // Delete each song_tag relationship
      for (const songId of songsWithTag) {
        await fetch(`${SUPABASE_URL}/rest/v1/song_tags?song_id=eq.${songId}&tag_id=eq.${applyTagId}`, {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
      }

      showMessage(`✅ Tag removed from ${songsWithTag.length} song(s)`);
      setSelectedSongs([]);
      await loadData();
    } catch (error) {
      console.error('Error removing tag:', error);
      showMessage('❌ Error removing tag');
    }
  };

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 pb-32">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black flex items-center gap-3 text-white">
              <span className="text-green-500">🏷️</span> Tag Management
            </h1>
            <p className="text-slate-400 mt-1 font-medium">
              {tags.length} tags • {songs.length} songs
            </p>
          </div>
          <div className="flex gap-3">
            <a href="/admin" className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-2.5 rounded-lg font-bold border border-slate-700 transition-all text-center">
              ← Song Admin
            </a>
            <a href="/" className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-2.5 rounded-lg font-bold border border-slate-700 transition-all text-center">
              ← Back
            </a>
          </div>
        </header>

        {/* Name Input */}
        <section className={`sticky top-4 z-40 p-4 rounded-xl mb-8 border transition-all duration-300 shadow-2xl flex flex-col sm:flex-row items-center gap-4 ${
          sessionName.trim() 
            ? 'bg-slate-800/95 backdrop-blur border-slate-700' 
            : 'bg-red-950/90 backdrop-blur border-red-500'
        }`}>
          <label className="font-bold flex items-center gap-2 whitespace-nowrap">
            <span className="text-xl">👤</span> Your Name:
          </label>
          <input 
            type="text" 
            placeholder="Type your name to unlock editing..." 
            value={sessionName} 
            onChange={(e) => {
              setSessionName(e.target.value);
              localStorage.setItem('camp_admin_name', e.target.value);
            }}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder:text-slate-500 focus:border-green-500 outline-none transition-all" 
          />
          {!sessionName.trim() && (
            <span className="text-red-400 font-bold text-sm animate-pulse whitespace-nowrap">
              ⚠️ Required to save
            </span>
          )}
        </section>

        {/* Status Message */}
        {message && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold shadow-2xl border border-slate-600">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'manage'
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🏷️ Manage Tags
          </button>
          <button
            onClick={() => setActiveTab('apply')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'apply'
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🎵 Apply Tags to Songs
          </button>
        </div>

        {/* ============ MANAGE TAGS TAB ============ */}
        {activeTab === 'manage' && (
          <div>
            {/* Add/Edit Tag Form */}
            {(isAddingTag || editingTag) && (
              <div className="bg-slate-800 border-2 border-green-500/30 rounded-2xl p-6 mb-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black">
                    {isAddingTag ? '✨ Create New Tag' : `✏️ Edit: ${editingTag.name}`}
                  </h2>
                  <button onClick={cancelTagEdit} className="text-slate-400 hover:text-white p-2">✕</button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">Tag Name *</label>
                    <input
                      type="text"
                      value={tagName}
                      onChange={(e) => setTagName(e.target.value)}
                      placeholder="e.g., Round, High Energy, Pre-1950s"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-green-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">Description (optional)</label>
                    <input
                      type="text"
                      value={tagDescription}
                      onChange={(e) => setTagDescription(e.target.value)}
                      placeholder="Brief explanation of what this tag means"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-green-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-6 pt-6 border-t border-slate-700">
                  <button onClick={saveTag} className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-xl font-black">
                    {isAddingTag ? 'Create Tag' : 'Save Changes'}
                  </button>
                  <button onClick={cancelTagEdit} className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-xl font-bold">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Add Tag Button */}
            {!isAddingTag && !editingTag && (
              <button
                onClick={startAddTag}
                className="mb-6 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-bold"
              >
                + Create New Tag
              </button>
            )}

            {/* Tags List */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-700 bg-slate-800">
                <h3 className="font-bold">All Tags ({tags.length})</h3>
              </div>
              <div className="divide-y divide-slate-700/50">
                {tags.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    No tags yet. Create your first tag above!
                  </div>
                ) : (
                  tags.map(tag => {
                    const songCount = songTags.filter(st => st.tag_id === tag.id).length;
                    return (
                      <div key={tag.id} className="p-4 flex items-center justify-between hover:bg-slate-700/30">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-white">{tag.name}</span>
                            <span className="text-xs text-slate-500">
                              {songCount} song{songCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {tag.description && (
                            <div className="text-sm text-slate-400 mt-1">{tag.description}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditTag(tag)}
                            className="px-3 py-1.5 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTag(tag)}
                            className="px-3 py-1.5 text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ APPLY TAGS TAB ============ */}
        {activeTab === 'apply' && (
          <div>
            {/* Filters */}
            <div className="bg-slate-800 rounded-2xl p-6 mb-6 space-y-4">
              <h3 className="font-bold text-lg mb-4">Filter Songs</h3>
              
              {/* Section Filter */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-bold text-slate-400">Sections</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedSections(Object.keys(SECTION_INFO))} className="text-xs text-green-500 hover:text-green-400">Select All</button>
                    <button onClick={() => setSelectedSections([])} className="text-xs text-slate-400 hover:text-slate-300">Clear</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {Object.entries(SECTION_INFO).map(([letter, name]) => (
                    <label key={letter} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-700/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedSections.includes(letter)}
                        onChange={() => toggleSection(letter)}
                        className="rounded"
                      />
                      <span className="truncate">{letter}: {name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tag Filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-2">Filter by Tag</label>
                  <select
                    value={filterByTag}
                    onChange={(e) => setFilterByTag(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white cursor-pointer"
                  >
                    <option value="">All songs</option>
                    <optgroup label="Has tag">
                      {tags.map(tag => (
                        <option key={`has:${tag.id}`} value={`has:${tag.id}`}>Has: {tag.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Missing tag">
                      {tags.map(tag => (
                        <option key={`missing:${tag.id}`} value={`missing:${tag.id}`}>Missing: {tag.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-2">Search</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by title or page..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="bg-slate-800 rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-4">Bulk Actions</h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">{selectedSongs.length} selected</span>
                  <button onClick={selectAllVisible} className="text-xs text-green-500 hover:text-green-400">Select All Visible ({filteredSongs.length})</button>
                  <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-slate-300">Clear</button>
                </div>
                <div className="flex-1" />
                <select
                  value={applyTagId}
                  onChange={(e) => setApplyTagId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white cursor-pointer"
                >
                  <option value="">Select tag...</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
                <button
                  onClick={applyTagToSelected}
                  disabled={!applyTagId || selectedSongs.length === 0}
                  className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold"
                >
                  + Apply Tag
                </button>
                <button
                  onClick={removeTagFromSelected}
                  disabled={!applyTagId || selectedSongs.length === 0}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold"
                >
                  − Remove Tag
                </button>
              </div>
            </div>

            {/* Songs List */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-700 bg-slate-800">
                <h3 className="font-bold">Songs ({filteredSongs.length} of {songs.length})</h3>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-700/50">
                {filteredSongs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">No songs match your filters</div>
                ) : (
                  filteredSongs.map(song => {
                    const songTagList = getTagsForSong(song.id);
                    const isSelected = selectedSongs.includes(song.id);
                    return (
                      <div
                        key={song.id}
                        onClick={() => toggleSongSelection(song.id)}
                        className={`p-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-green-900/30' : 'hover:bg-slate-700/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white">{song.title}</div>
                            <div className="text-sm text-slate-400">
                              Section {song.section} • Page {song.page || '—'}
                            </div>
                            {songTagList.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {songTagList.map(tag => (
                                  <span key={tag.id} className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-300">
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}