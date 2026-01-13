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
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  // Data state
  const [tags, setTags] = useState([]);
  const [songs, setSongs] = useState([]);
  const [songTags, setSongTags] = useState([]); // All song-tag relationships
  const [songVersions, setSongVersions] = useState([]); // For lyrics
  const [expandedLyrics, setExpandedLyrics] = useState({}); // { songId: true/false }

  // UI state
  const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'apply'
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [viewingTag, setViewingTag] = useState(null); // Tag currently being viewed (to see its songs)

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

  // Check auth on load
  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { if (userProfile?.role === 'admin') loadData(); }, [userProfile]);

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
      if (!token) { setAuthChecked(true); return; }
      
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
        await loadUserProfile(userData.id);
      }
    } catch (error) { console.log('No existing session'); }
    setAuthChecked(true);
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
      await loadUserProfile(data.user.id);
      setAuthEmail('');
      setAuthPassword('');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleMagicLink = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
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
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [tagsRes, songsRes, songTagsRes, versionsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/tags?select=*&order=name.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=*`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        })
      ]);
      setTags(await tagsRes.json());
      setSongs(await songsRes.json());
      setSongTags(await songTagsRes.json());
      setSongVersions(await versionsRes.json());
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

  // Get songs for a specific tag
  const getSongsForTag = (tagId) => {
    const songIds = songTags.filter(st => st.tag_id === tagId).map(st => st.song_id);
    return songs.filter(s => songIds.includes(s.id)).sort((a, b) => a.title.localeCompare(b.title));
  };

  // Check if song has a specific tag
  const songHasTag = (songId, tagId) => {
    return songTags.some(st => st.song_id === songId && st.tag_id === tagId);
  };

  // Get lyrics for a song
  const getSongLyrics = (songId) => {
    const version = songVersions.find(v => v.song_id === songId && v.is_default_singalong) 
      || songVersions.find(v => v.song_id === songId);
    return version?.lyrics_content || null;
  };

  // Toggle lyrics expansion for a song
  const toggleLyrics = (songId, e) => {
    e.stopPropagation(); // Don't trigger song selection
    setExpandedLyrics(prev => ({ ...prev, [songId]: !prev[songId] }));
  };

  // Remove a single song from a tag
  const removeSongFromTag = async (songId, tagId) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_tags?song_id=eq.${songId}&tag_id=eq.${tagId}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      showMessage('✅ Song removed from tag');
      await loadData();
    } catch (error) {
      console.error('Error removing song from tag:', error);
      showMessage('❌ Error removing song');
    }
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
    if (!tagName.trim()) {
      showMessage('❌ Tag name is required');
      return;
    }

    try {
      const tagData = {
        name: tagName.trim(),
        description: tagDescription.trim() || null,
        created_by: userProfile?.display_name || user?.email || 'Unknown'
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

  // Auth check must come first - loading state only matters after auth is confirmed
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏷️</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Auth gate - require login
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🏷️</div>
            <h1 className="text-2xl font-bold mb-1">Tag Management</h1>
            <p className="text-slate-400 text-sm">Sign in to manage tags</p>
          </div>
          
          {authError && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg mb-4 text-sm">{authError}</div>}
          {authMessage && <div className="bg-green-900/50 text-green-200 p-3 rounded-lg mb-4 text-sm">{authMessage}</div>}
          
          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="p-3 rounded-lg border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-green-500"
            />
            {authMode !== 'magic' && (
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="p-3 rounded-lg border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
            <button
              onClick={authMode === 'magic' ? handleMagicLink : handleLogin}
              disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
              className="p-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-all disabled:opacity-50"
            >
              {authLoading ? 'Loading...' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
            </button>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-700 text-center">
            {authMode === 'login' ? (
              <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} className="text-blue-400 hover:underline text-sm">
                Use magic link instead
              </button>
            ) : (
              <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-blue-400 hover:underline text-sm">
                Use password instead
              </button>
            )}
          </div>
          
          <div className="mt-6 text-center">
            <a href="/" className="text-slate-400 text-sm hover:text-slate-300">← Back to Singalong</a>
          </div>
        </div>
      </div>
    );
  }

  // Admin role check - with waiting room for profile to load
  if (user && !userProfile) {
    // User is logged in but profile hasn't loaded yet - wait
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏷️</div>
          <div>Loading profile...</div>
        </div>
      </div>
    );
  }

  if (userProfile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-6">You need admin privileges to access this page.</p>
          <div className="flex flex-col gap-3">
            <a href="/" className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-lg font-bold transition-all">
              ← Back to Singalong
            </a>
            <button onClick={handleLogout} className="text-red-400 hover:text-red-300 text-sm">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Data loading state (after auth is confirmed)
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
          <div className="flex gap-3 items-center flex-wrap">
            <a href="/" className="text-slate-400 hover:text-slate-300 text-sm">← Singalong</a>
            <a href="/admin" className="text-slate-400 hover:text-slate-300 text-sm">Songs</a>
            <a href="/admin/users" className="text-slate-400 hover:text-slate-300 text-sm">Users</a>
            <a href="/reports" className="text-slate-400 hover:text-slate-300 text-sm">Insights</a>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400 text-sm">👋 {userProfile?.display_name}</span>
            <button onClick={handleLogout} className="text-red-400 hover:text-red-300 text-sm">Sign out</button>
          </div>
        </header>

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
                    const isViewing = viewingTag?.id === tag.id;
                    return (
                      <div key={tag.id}>
                        <div className={`p-4 hover:bg-slate-700/30 ${isViewing ? 'bg-slate-700/50' : ''}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                                onClick={() => setViewingTag(isViewing ? null : tag)}
                                className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-bold rounded-lg transition-colors ${
                                  isViewing 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-blue-900/30 text-blue-400 hover:text-blue-300 hover:bg-blue-900/50'
                                }`}
                              >
                                {isViewing ? 'Hide' : 'View'}
                              </button>
                              <button
                                onClick={() => startEditTag(tag)}
                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteTag(tag)}
                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-bold text-red-400 bg-red-900/30 hover:bg-red-900/50 rounded-lg transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Expanded songs list for this tag */}
                        {isViewing && (
                          <div className="bg-slate-900/50 border-t border-slate-700 p-4">
                            <div className="text-sm text-slate-400 mb-3">Songs with "{tag.name}" tag:</div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {getSongsForTag(tag.id).length === 0 ? (
                                <div className="text-slate-500 text-sm italic">No songs have this tag yet</div>
                              ) : (
                                getSongsForTag(tag.id).map(song => (
                                  <div key={song.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 group">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-white text-sm truncate block">{song.title}</span>
                                      <span className="text-slate-500 text-xs">Section {song.section}</span>
                                    </div>
                                    <button
                                      onClick={() => removeSongFromTag(song.id, tag.id)}
                                      className="ml-2 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 px-2 py-1 text-xs font-bold text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 rounded transition-all"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
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
                <label className="text-sm font-bold text-slate-400 block mb-2">Sections</label>
                <div className="flex gap-2 mb-4">
                  <button 
                    onClick={() => setSelectedSections(Object.keys(SECTION_INFO))} 
                    className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 bg-slate-700 border-slate-600 hover:bg-slate-600"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setSelectedSections([])} 
                    className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 bg-slate-700 border-slate-600 hover:bg-slate-600"
                  >
                    Clear All
                  </button>
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
              
              {/* Selection info */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-sm text-slate-400">{selectedSongs.length} selected</span>
                <button onClick={selectAllVisible} className="text-xs text-green-500 hover:text-green-400 bg-green-900/20 px-2 py-1 rounded">
                  Select All ({filteredSongs.length})
                </button>
                <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-slate-300 bg-slate-700 px-2 py-1 rounded">
                  Clear
                </button>
              </div>
              
              {/* Tag selection and action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={applyTagId}
                  onChange={(e) => setApplyTagId(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white cursor-pointer"
                >
                  <option value="">Select tag...</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={applyTagToSelected}
                    disabled={!applyTagId || selectedSongs.length === 0}
                    className="flex-1 sm:flex-none bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-bold"
                  >
                    + Apply
                  </button>
                  <button
                    onClick={removeTagFromSelected}
                    disabled={!applyTagId || selectedSongs.length === 0}
                    className="flex-1 sm:flex-none bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-bold"
                  >
                    − Remove
                  </button>
                </div>
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
                    const lyrics = getSongLyrics(song.id);
                    const isLyricsExpanded = expandedLyrics[song.id];
                    return (
                      <div
                        key={song.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-green-900/30' : ''
                        }`}
                      >
                        <div
                          onClick={() => toggleSongSelection(song.id)}
                          className={`p-4 cursor-pointer ${!isSelected && 'hover:bg-slate-700/30'}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-1 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{song.title}</span>
                                {lyrics && (
                                  <button
                                    onClick={(e) => toggleLyrics(song.id, e)}
                                    className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                      isLyricsExpanded 
                                        ? 'bg-blue-600 text-white' 
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                  >
                                    📄 {isLyricsExpanded ? '▲' : '▼'}
                                  </button>
                                )}
                                {!lyrics && song.has_lyrics && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-500">📄</span>
                                )}
                              </div>
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
                        {/* Expanded Lyrics */}
                        {isLyricsExpanded && lyrics && (
                          <div className="px-4 pb-4 ml-10">
                            <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {lyrics}
                            </div>
                          </div>
                        )}
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
