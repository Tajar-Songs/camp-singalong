import { useState, useEffect, useRef } from 'react';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';
import { getFilterableSongbooks, getAvailableSections, sectionLabel, toggleInArray } from '../lib/songFilters';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Reusable typeahead + chips input for large, growable option sets. Per the
// style guide: typeahead means a browsable list, not a search box - the
// suggestion list shows on focus even with empty input, narrowing as text
// is typed, so someone can discover an option they didn't already know
// existed. Options are {value, label} pairs (not flat strings) since tag
// filtering here works against tag ids, not names.
function TypeaheadChips({ options, selected, onChange, otherSelected, placeholder }) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  const hiddenValues = new Set([...selected, ...(otherSelected || [])]);
  const suggestions = options
    .filter(o => !hiddenValues.has(o.value) && (!inputValue || o.label.toLowerCase().includes(inputValue.toLowerCase())))
    .slice(0, 50);
  const labelFor = (value) => options.find(o => o.value === value)?.label || value;
  return (
    <div>
      <div style={{ marginBottom: selected.length > 0 ? '0.375rem' : 0 }}>
        {selected.map(v => (
          <span key={v} className="inline-flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs mr-1 mb-1">
            {labelFor(v)}
            <button onClick={() => toggle(v)} className="text-[#838C95] hover:text-white">×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        className="w-full bg-slate-900 border border-[#838C95]/20 rounded-lg px-3 py-2 text-sm mb-1"
      />
      {isFocused && suggestions.length > 0 && (
        <div className="max-h-40 overflow-y-auto border border-[#838C95]/20 rounded-lg">
          {suggestions.map(o => (
            <button
              key={o.value}
              onClick={() => { toggle(o.value); setInputValue(''); }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-700"
            >{o.label}</button>
          ))}
        </div>
      )}
      {isFocused && suggestions.length === 0 && (
        <div className="text-xs text-[#838C95] p-1.5">No matches</div>
      )}
    </div>
  );
}

export default function TagManagement() {
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
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
  const [songbooks, setSongbooks] = useState([]);
  const [songbookEntries, setSongbookEntries] = useState([]);
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
  const [songbookIds, setSongbookIds] = useState([]); // multi-select; [] = no songbook restriction shown
  const [songbookFilterMode, setSongbookFilterMode] = useState('any'); // a song can be in several songbooks
  const [sectionDefs, setSectionDefs] = useState([]); // raw songbook_sections rows
  const [selectedSections, setSelectedSections] = useState([]); // now stores real section ids, not text codes
  const [sectionFilterMode, setSectionFilterMode] = useState('any'); // a song can be in several sections
  const [sectionsInitialized, setSectionsInitialized] = useState(false);
  // Tag include/exclude, replacing the old single has/missing dropdown -
  // large, growable set, so it gets typeahead+chips with a real Include
  // and Exclude, matching the documented Filtering pattern.
  const [tagIncludeFilters, setTagIncludeFilters] = useState([]);
  const [tagIncludeMode, setTagIncludeMode] = useState('any');
  const [tagExcludeFilters, setTagExcludeFilters] = useState([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSongs, setSelectedSongs] = useState([]); // Array of song IDs
  const [applyTagId, setApplyTagId] = useState(''); // Tag to apply to selected songs

  // Helper function to get auth headers with user's token
  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token');
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  // Check auth on load
  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { if (hasAnyRole(userRoleKeys)) loadData(); }, [userRoleKeys]);

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
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers });
      const data = await res.json();
      if (data.length > 0) setUserProfile(data[0]);
      const roleKeys = await fetchUserRoleKeys(userId, headers);
      setUserRoleKeys(roleKeys);
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
      const [tagsRes, songsRes, songTagsRes, versionsRes, songbooksRes, entriesRes, sectionDefsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/tags?select=*&order=name.asc`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/songbooks?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, {
          headers: getAuthHeaders(false)
        }),
        fetch(`${SUPABASE_URL}/rest/v1/songbook_sections?select=*&order=display_order.asc`, {
          headers: getAuthHeaders(false)
        })
      ]);
      
      // Parse responses
      const tagsData = await tagsRes.json();
      const songsData = await songsRes.json();
      const songTagsData = await songTagsRes.json();
      const versionsData = await versionsRes.json();
      const songbooksData = await songbooksRes.json();
      const entriesData = await entriesRes.json();
      const sectionDefsData = await sectionDefsRes.json();
      if (Array.isArray(sectionDefsData)) setSectionDefs(sectionDefsData);
      
      // Only set state if we got arrays (not error objects)
      if (Array.isArray(tagsData)) setTags(tagsData);
      if (Array.isArray(songsData)) setSongs(songsData);
      if (Array.isArray(songTagsData)) setSongTags(songTagsData);
      if (Array.isArray(versionsData)) setSongVersions(versionsData);
      if (Array.isArray(songbooksData)) setSongbooks(songbooksData);
      if (Array.isArray(entriesData)) setSongbookEntries(entriesData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // Get page/section info for a song from songbook entries (primary songbook)
  const getSongPage = (songId) => {
    const primarySongbook = songbooks.find(sb => sb.is_primary);
    const entry = songbookEntries.find(e => e.song_id === songId && e.songbook_id === primarySongbook?.id);
    return { page: entry?.page || null, section: entry?.section || null };
  };

  // Filterable songbooks and their real sections (replaces the old hardcoded,
  // single-songbook SECTION_INFO map, which broke for any book beyond the
  // original one - especially books with no letter/number codes at all).
  const filterableSongbooks = getFilterableSongbooks(songbooks, songbookEntries);
  const availableSections = getAvailableSections(sectionDefs, songbookIds);

  useEffect(() => {
    if (sectionsInitialized) return;
    if (songbookIds.length === 0 && filterableSongbooks.length > 0) {
      const primary = filterableSongbooks.find(sb => sb.is_primary) || filterableSongbooks[0];
      setSongbookIds([primary.id]);
    }
  }, [filterableSongbooks, sectionsInitialized]);

  // Whenever the songbook selection changes, keep selectedSections in sync:
  // auto-check all sections belonging to a newly-added songbook, and drop
  // sections that belonged only to a songbook that was just deselected.
  // This used to be a one-time init that ran only for the very first
  // songbook and then permanently stopped (via sectionsInitialized) - which
  // is why only the initial/primary songbook ever got its sections
  // auto-checked, and every songbook picked afterward was left empty.
  const prevSongbookIdsRef = useRef([]);
  useEffect(() => {
    const prev = prevSongbookIdsRef.current;
    const added = songbookIds.filter(id => !prev.includes(id));
    const removed = prev.filter(id => !songbookIds.includes(id));
    if (added.length > 0) {
      const newSections = getAvailableSections(sectionDefs, added);
      setSelectedSections(cur => {
        const toAdd = newSections.map(s => s.id).filter(id => !cur.includes(id));
        return toAdd.length > 0 ? [...cur, ...toAdd] : cur;
      });
    }
    if (removed.length > 0) {
      const droppedSections = new Set(getAvailableSections(sectionDefs, removed).map(s => s.id));
      // Only drop a section if none of the still-selected songbooks also
      // use it - two songbooks can share a section id.
      const stillRelevant = new Set(getAvailableSections(sectionDefs, songbookIds).map(s => s.id));
      setSelectedSections(cur => cur.filter(id => !droppedSections.has(id) || stillRelevant.has(id)));
    }
    if (songbookIds.length > 0) setSectionsInitialized(true);
    prevSongbookIdsRef.current = songbookIds;
  }, [songbookIds, sectionDefs]);

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
        headers: getAuthHeaders(false)
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
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
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
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
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
        headers: getAuthHeaders(false)
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
    const pageInfo = getSongPage(song.id);
    // Section filter - checks the song's entries in whichever songbook(s) are
    // selected, using real section ids (works correctly for any songbook,
    // including ones with no letter/number codes). Both dimensions are
    // genuinely multi-valued per song (a song can be in several songbooks,
    // several sections), so both get a real any/all toggle.
    if (songbookIds.length > 0) {
      const entries = songbookEntries.filter(e => e.song_id === song.id);
      const matches = songbookFilterMode === 'all'
        ? songbookIds.every(id => entries.some(e => e.songbook_id === id))
        : songbookIds.some(id => entries.some(e => e.songbook_id === id));
      if (!matches) return false;
    }
    if (selectedSections.length > 0) {
      const entries = songbookEntries.filter(e => e.song_id === song.id);
      const relevant = songbookIds.length > 0 ? entries.filter(e => songbookIds.includes(e.songbook_id)) : entries;
      const matches = sectionFilterMode === 'all'
        ? selectedSections.every(id => relevant.some(e => e.section_id === id))
        : selectedSections.some(id => relevant.some(e => e.section_id === id));
      if (!matches) return false;
    }

    // Tag filter - separate Include (any/all) and Exclude, matching the
    // documented pattern for large-option-set dimensions.
    if (tagIncludeFilters.length > 0) {
      const matches = tagIncludeMode === 'all'
        ? tagIncludeFilters.every(tagId => songHasTag(song.id, tagId))
        : tagIncludeFilters.some(tagId => songHasTag(song.id, tagId));
      if (!matches) return false;
    }
    if (tagExcludeFilters.length > 0 && tagExcludeFilters.some(tagId => songHasTag(song.id, tagId))) return false;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesTitle = song.title.toLowerCase().includes(searchLower);
      const matchesPage = pageInfo.page?.toLowerCase().includes(searchLower);
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
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
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
          headers: getAuthHeaders(false)
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
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4"><i className="ti ti-tag" aria-hidden="true"></i></div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Auth gate - require login
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2"><i className="ti ti-tag" aria-hidden="true"></i></div>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Gloria Hallelujah', cursive" }}>Tag Management</h1>
            <p className="text-[#838C95] text-sm">Sign in to manage tags</p>
          </div>
          
          {authError && <div className="bg-[#C35522]/20/50 text-[#D45D25] p-3 rounded-lg mb-4 text-sm">{authError}</div>}
          {authMessage && <div className="bg-[#256B45]/20/50 text-[#3B9B73] p-3 rounded-lg mb-4 text-sm">{authMessage}</div>}
          
          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="p-3 rounded-lg border border-[#838C95]/20 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-[#3B9B73]"
            />
            {authMode !== 'magic' && (
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="p-3 rounded-lg border border-[#838C95]/20 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-[#3B9B73]"
              />
            )}
            <button
              onClick={authMode === 'magic' ? handleMagicLink : handleLogin}
              disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
              className="p-3 rounded-lg bg-[#256B45] hover:bg-[#2f8058] text-white font-bold transition-all disabled:opacity-50"
            >
              {authLoading ? 'Loading...' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
            </button>
          </div>
          
          <div className="mt-4 pt-4 border-t border-[#838C95]/20 text-center">
            {authMode === 'login' ? (
              <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} className="text-[#6882B6] hover:underline text-sm">
                Use magic link instead
              </button>
            ) : (
              <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-[#6882B6] hover:underline text-sm">
                Use password instead
              </button>
            )}
          </div>
          
          <div className="mt-6 text-center">
            <a href="/" className="text-[#838C95] text-sm hover:text-[#838C95]">← Back to Singalong</a>
          </div>
        </div>
      </div>
    );
  }

  // Admin role check - with waiting room for profile to load
  if (user && !userProfile) {
    // User is logged in but profile hasn't loaded yet - wait
    return (
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4"><i className="ti ti-tag" aria-hidden="true"></i></div>
          <div>Loading profile...</div>
        </div>
      </div>
    );
  }

  if (!hasAnyRole(userRoleKeys)) {
    return (
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4"><i className="ti ti-lock" aria-hidden="true"></i></div>
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-[#838C95] mb-6">You need admin privileges to access this page.</p>
          <div className="flex flex-col gap-3">
            <a href="/" className="bg-[#256B45] hover:bg-[#2f8058] text-white p-3 rounded-lg font-bold transition-all">
              ← Back to Singalong
            </a>
            <button onClick={handleLogout} className="text-[#D45D25] hover:text-[#D45D25] text-sm">
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
    <div className="min-h-screen bg-slate-900 text-[#e2e8f0]">
      <div className="max-w-6xl mx-auto px-4 py-8 pb-32">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black flex items-center gap-3 text-white" style={{ fontFamily: "'Gloria Hallelujah', cursive" }}>
              <span className="text-[#3B9B73]"><i className="ti ti-tag" aria-hidden="true"></i></span> Tag Management
            </h1>
            <p className="text-[#838C95] mt-1 font-medium">
              {tags.length} tags • {songs.length} songs
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <a href="/" className="text-[#838C95] hover:text-[#838C95] text-sm">← Singalong</a>
            <a href="/admin" className="text-[#838C95] hover:text-[#838C95] text-sm">Songs</a>
            <a href="/admin/users" className="text-[#838C95] hover:text-[#838C95] text-sm">Users</a>
            <a href="/reports" className="text-[#838C95] hover:text-[#838C95] text-sm">Insights</a>
            <span className="text-[#838C95]">|</span>
            <span className="text-[#838C95] text-sm"><i className="ti ti-user" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {userProfile?.display_name}</span>
            <button onClick={handleLogout} className="text-[#D45D25] hover:text-[#D45D25] text-sm">Sign out</button>
          </div>
        </header>

        {/* Status Message */}
        {message && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold shadow-2xl border border-[#838C95]/35">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'manage'
                ? 'bg-[#256B45] text-white'
                : 'bg-slate-800 text-[#838C95] hover:bg-slate-700'
            }`}
          >
            <i className="ti ti-tag" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Manage Tags
          </button>
          <button
            onClick={() => setActiveTab('apply')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'apply'
                ? 'bg-[#256B45] text-white'
                : 'bg-slate-800 text-[#838C95] hover:bg-slate-700'
            }`}
          >
            <i className="ti ti-list-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Apply Tags to Songs
          </button>
        </div>

        {/* ============ MANAGE TAGS TAB ============ */}
        {activeTab === 'manage' && (
          <div>
            {/* Add/Edit Tag Form */}
            {(isAddingTag || editingTag) && (
              <div className="bg-slate-800 border-2 border-[#3B9B73]/30 rounded-2xl p-6 mb-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black">
                    {isAddingTag ? <><i className="ti ti-file-plus" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Create New Tag</> : <><i className="ti ti-edit" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Edit: {editingTag.name}</>}
                  </h2>
                  <button onClick={cancelTagEdit} className="text-[#838C95] hover:text-white p-2"><i className="ti ti-x" aria-hidden="true"></i></button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-[#838C95] mb-2">Tag Name *</label>
                    <input
                      type="text"
                      value={tagName}
                      onChange={(e) => setTagName(e.target.value)}
                      placeholder="e.g., Round, High Energy, Pre-1950s"
                      className="w-full bg-slate-900 border border-[#838C95]/20 rounded-lg px-4 py-3 text-white focus:border-[#3B9B73] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#838C95] mb-2">Description (optional)</label>
                    <input
                      type="text"
                      value={tagDescription}
                      onChange={(e) => setTagDescription(e.target.value)}
                      placeholder="Brief explanation of what this tag means"
                      className="w-full bg-slate-900 border border-[#838C95]/20 rounded-lg px-4 py-3 text-white focus:border-[#3B9B73] outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-6 pt-6 border-t border-[#838C95]/20">
                  <button onClick={saveTag} className="bg-[#256B45] hover:bg-[#2f8058] text-white px-8 py-3 rounded-xl font-black">
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
                className="mb-6 bg-[#256B45] hover:bg-[#2f8058] text-white px-6 py-3 rounded-xl font-bold"
              >
                + Create New Tag
              </button>
            )}

            {/* Tags List */}
            <div className="bg-slate-800/50 border border-[#838C95]/20 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#838C95]/20 bg-slate-800">
                <h3 className="font-bold">All Tags ({tags.length})</h3>
              </div>
              <div className="divide-y divide-slate-700/50">
                {tags.length === 0 ? (
                  <div className="p-8 text-center text-[#838C95]">
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
                                <span className="text-xs text-[#838C95]">
                                  {songCount} song{songCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {tag.description && (
                                <div className="text-sm text-[#838C95] mt-1">{tag.description}</div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setViewingTag(isViewing ? null : tag)}
                                className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-bold rounded-lg transition-colors ${
                                  isViewing 
                                    ? 'bg-[#5371AC] text-white' 
                                    : 'bg-[#5371AC]/20/30 text-[#6882B6] hover:text-[#6882B6] hover:bg-[#5371AC]/20/50'
                                }`}
                              >
                                {isViewing ? 'Hide' : 'View'}
                              </button>
                              <button
                                onClick={() => startEditTag(tag)}
                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-bold text-[#838C95] bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteTag(tag)}
                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-bold text-[#D45D25] bg-[#C35522]/20/30 hover:bg-[#C35522]/20/50 rounded-lg transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Expanded songs list for this tag */}
                        {isViewing && (
                          <div className="bg-slate-900/50 border-t border-[#838C95]/20 p-4">
                            <div className="text-sm text-[#838C95] mb-3">Songs with "{tag.name}" tag:</div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {getSongsForTag(tag.id).length === 0 ? (
                                <div className="text-[#838C95] text-sm italic">No songs have this tag yet</div>
                              ) : (
                                getSongsForTag(tag.id).map(song => (
                                  <div key={song.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 group">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-white text-sm truncate block">{song.title}</span>
                                      <span className="text-[#838C95] text-xs">Section {getSongPage(song.id).section}</span>
                                    </div>
                                    <button
                                      onClick={() => removeSongFromTag(song.id, tag.id)}
                                      className="ml-2 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 px-2 py-1 text-xs font-bold text-[#D45D25] hover:text-[#D45D25] bg-[#C35522]/20/30 hover:bg-[#C35522]/20/50 rounded transition-all"
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
            {/* Filters - collapsible by default, matching the pattern.
                Songbook and Section are genuinely multi-valued per song (a
                song can be in several), so both get a real any/all toggle.
                Tags uses typeahead+chips with separate Include/Exclude
                (large, growable set). Search isn't a filter in the
                include/exclude sense, so it stays outside, always visible. */}
            <div className="mb-6">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <button
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center gap-2 font-bold text-sm"
                >
                  <span>Filter{(songbookIds.length + selectedSections.length + tagIncludeFilters.length + tagExcludeFilters.length) > 0 ? ` (${songbookIds.length + selectedSections.length + tagIncludeFilters.length + tagExcludeFilters.length})` : ''}</span>
                  <i className={`ti ti-chevron-${filtersExpanded ? 'up' : 'down'}`} aria-hidden="true"></i>
                </button>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title or page..."
                  className="flex-1 min-w-[200px] bg-slate-900 border border-[#838C95]/20 rounded-lg px-4 py-2 text-white"
                />
              </div>
              {filtersExpanded && (
              <div className="bg-slate-800 rounded-2xl p-6 space-y-4">
                {/* Songbook Filter - only shown if there's more than one populated songbook */}
                {filterableSongbooks.length > 1 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-[#838C95]">Songbook</label>
                      <div className="flex gap-3 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="songbookFilterMode" checked={songbookFilterMode === 'any'} onChange={() => setSongbookFilterMode('any')} /> any
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="songbookFilterMode" checked={songbookFilterMode === 'all'} onChange={() => setSongbookFilterMode('all')} /> all
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filterableSongbooks.map(sb => {
                        const isSelected = songbookIds.includes(sb.id);
                        return (
                          <button
                            key={sb.id}
                            onClick={() => { setSongbookIds(prev => toggleInArray(prev, sb.id)); }}
                            className={`px-3 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${isSelected ? 'bg-[#5371AC] text-white' : 'bg-slate-700 text-[#838C95] hover:bg-slate-600'}`}
                          >
                            {isSelected ? '✓ ' : ''}{sb.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section Filter */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-[#838C95]">Sections</label>
                    <div className="flex gap-3 text-xs">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="sectionFilterMode" checked={sectionFilterMode === 'any'} onChange={() => setSectionFilterMode('any')} /> any
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="sectionFilterMode" checked={sectionFilterMode === 'all'} onChange={() => setSectionFilterMode('all')} /> all
                      </label>
                    </div>
                  </div>
                  {songbookIds.length === 0 && (
                    <p className="text-xs text-[#838C95] mb-2">Select a songbook above to see its sections.</p>
                  )}
                  <div className="flex gap-2 mb-4">
                    <button 
                      onClick={() => setSelectedSections(availableSections.map(s => s.id))} 
                      className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 bg-slate-700 border-[#838C95]/35 hover:bg-slate-600"
                    >
                      Select All
                    </button>
                    <button 
                      onClick={() => setSelectedSections([])} 
                      className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 bg-slate-700 border-[#838C95]/35 hover:bg-slate-600"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {availableSections.map(sec => (
                      <label key={sec.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-700/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedSections.includes(sec.id)}
                          onChange={() => toggleSection(sec.id)}
                          className="rounded"
                        />
                        <span className="truncate">{sectionLabel(sec)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tag Filter - typeahead + chips, separate Include/Exclude */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-[#838C95]">Tags — include</label>
                      <div className="flex gap-3 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="tagIncludeMode" checked={tagIncludeMode === 'any'} onChange={() => setTagIncludeMode('any')} /> any
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="tagIncludeMode" checked={tagIncludeMode === 'all'} onChange={() => setTagIncludeMode('all')} /> all
                        </label>
                      </div>
                    </div>
                    <TypeaheadChips
                      options={tags.map(t => ({ value: t.id, label: t.name }))}
                      selected={tagIncludeFilters}
                      onChange={setTagIncludeFilters}
                      otherSelected={tagExcludeFilters}
                      placeholder="Search tags..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#838C95] mb-2">Tags — exclude</label>
                    <TypeaheadChips
                      options={tags.map(t => ({ value: t.id, label: t.name }))}
                      selected={tagExcludeFilters}
                      onChange={setTagExcludeFilters}
                      otherSelected={tagIncludeFilters}
                      placeholder="Search tags..."
                    />
                  </div>
                </div>
                {(songbookIds.length + selectedSections.length + tagIncludeFilters.length + tagExcludeFilters.length) > 0 && (
                  <button
                    onClick={() => { setSongbookIds([]); setSelectedSections([]); setTagIncludeFilters([]); setTagExcludeFilters([]); }}
                    className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-bold"
                  >Clear all filters</button>
                )}
              </div>
              )}
            </div>

            {/* Bulk Actions */}
            <div className="bg-slate-800 rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-4">Bulk Actions</h3>
              
              {/* Selection info */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-sm text-[#838C95]">{selectedSongs.length} selected</span>
                <button onClick={selectAllVisible} className="text-xs text-[#3B9B73] hover:text-[#3B9B73] bg-[#256B45]/20/20 px-2 py-1 rounded">
                  Select All ({filteredSongs.length})
                </button>
                <button onClick={clearSelection} className="text-xs text-[#838C95] hover:text-[#838C95] bg-slate-700 px-2 py-1 rounded">
                  Clear
                </button>
              </div>
              
              {/* Tag selection and action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={applyTagId}
                  onChange={(e) => setApplyTagId(e.target.value)}
                  className="flex-1 bg-slate-900 border border-[#838C95]/20 rounded-lg px-4 py-3 text-white cursor-pointer"
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
                    className="flex-1 sm:flex-none bg-[#256B45] hover:bg-[#2f8058] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-bold"
                  >
                    + Apply
                  </button>
                  <button
                    onClick={removeTagFromSelected}
                    disabled={!applyTagId || selectedSongs.length === 0}
                    className="flex-1 sm:flex-none bg-[#C35522] hover:bg-[#C35522] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-bold"
                  >
                    − Remove
                  </button>
                </div>
              </div>
            </div>

            {/* Songs List */}
            <div className="bg-slate-800/50 border border-[#838C95]/20 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#838C95]/20 bg-slate-800">
                <h3 className="font-bold">Songs ({filteredSongs.length} of {songs.length})</h3>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-700/50">
                {filteredSongs.length === 0 ? (
                  <div className="p-8 text-center text-[#838C95]">No songs match your filters</div>
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
                          isSelected ? 'bg-[#256B45]/20/30' : ''
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
                                        ? 'bg-[#5371AC] text-white' 
                                        : 'bg-slate-700 text-[#838C95] hover:bg-slate-600'
                                    }`}
                                  >
                                    <i className="ti ti-file-text" aria-hidden="true"></i> {isLyricsExpanded ? '▲' : '▼'}
                                  </button>
                                )}
                                {!lyrics && song.has_lyrics && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-[#838C95]"><i className="ti ti-file-text" aria-hidden="true"></i></span>
                                )}
                              </div>
                              <div className="text-sm text-[#838C95]">
                                Section {getSongPage(song.id).section} • Page {getSongPage(song.id).page || '—'}
                              </div>
                              {songTagList.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {songTagList.map(tag => (
                                    <span key={tag.id} className="text-xs px-2 py-0.5 rounded-full bg-[#256B45]/20/50 text-[#3B9B73]">
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
                            <div className="bg-slate-900/80 border border-[#838C95]/20 rounded-lg p-4 text-sm text-[#838C95] whitespace-pre-wrap max-h-64 overflow-y-auto">
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
