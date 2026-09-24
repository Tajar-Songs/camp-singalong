import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getFilterableSongbooks, getAvailableSections, songMatchesFilters, toggleInArray, sectionLabel } from '../lib/songFilters';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Adaptive multi-select: renders as full-button chips (not small checkboxes -
// bigger touch targets, easier on mobile) when there are few enough options
// to browse directly, and switches to a browsable typeahead+chips once the
// option count crosses a threshold, per the style guide's "selection UI
// scales with option count" pattern. Same component either way, so the
// switch is invisible/automatic rather than something each filter group
// has to decide for itself.
function AdaptiveMultiSelect({ options, selected, onChange, otherSelected, placeholder, accentColor, threshold = 10 }) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  const chipStyle = (isSelected) => ({
    padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600',
    cursor: 'pointer', border: 'none', transition: 'all 0.1s',
    background: isSelected ? accentColor : '#334155',
    color: isSelected ? '#fff' : '#838C95',
  });

  if (options.length <= threshold) {
    // Small set: every option shown as a full-button chip, no separate
    // click target to aim for - the whole chip is the target.
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {options.map(opt => (
          <button key={opt.value} onClick={() => toggle(opt.value)} style={chipStyle(selected.includes(opt.value))}>
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // Large set: browsable typeahead + chips. The suggestion list shows on
  // focus even with empty input (not just once something's typed), so a
  // long list stays genuinely browsable, not just searchable. The dropdown
  // is an absolutely-positioned overlay, not in-flow - selecting an option
  // used to push everything below it down and immediately pull it back up
  // once the list re-filtered, which felt like the interaction kept
  // resetting. On top of that, the list itself kept the full option set
  // stable (StoryGraph-style: like holding ctrl and clicking down a list -
  // selected items just highlight in place, nothing disappears or
  // reflows), rather than removing each item the instant it's picked,
  // which made picking several things in a row feel tedious.
  const otherHiddenValues = new Set(otherSelected || []);
  const suggestions = options
    .filter(o => !otherHiddenValues.has(o.value) && (!inputValue || o.label.toLowerCase().includes(inputValue.toLowerCase())))
    .slice(0, 50);
  const labelFor = (value) => options.find(o => o.value === value)?.label || value;
  return (
    <div style={{ position: 'relative' }}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
          {selected.map(v => (
            <button key={v} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(v)} style={chipStyle(true)}>
              {labelFor(v)} ×
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#fff' }}
      />
      {isFocused && (suggestions.length > 0 ? (
        <div
          // preventDefault on mousedown stops the input from ever blurring
          // when clicking in here, so the list never closes and there's no
          // timing race - see TypeaheadChips in docs.js for the full
          // reasoning (a video comparison against StoryGraph showed the old
          // blur-delay approach closing the list between clicks).
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.25rem', maxHeight: '220px', overflowY: 'auto', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', boxShadow: '0 8px 20px rgba(0,0,0,0.4)', zIndex: 50 }}
        >
          {suggestions.map(o => {
            const isSelected = selected.includes(o.value);
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem', width: '100%', textAlign: 'left',
                  padding: '0.5rem 0.75rem', fontSize: '0.85rem', border: 'none', cursor: 'pointer',
                  background: isSelected ? `${accentColor}20` : 'transparent',
                  color: isSelected ? accentColor : '#fff',
                }}
              >
                {isSelected && <i className="ti ti-check" style={{ fontSize: '0.85em' }} aria-hidden="true"></i>}
                {o.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.25rem', fontSize: '0.75rem', color: '#838C95', padding: '0.5rem 0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', zIndex: 50 }}>No matches</div>
      ))}
    </div>
  );
}

// statusOptions' icons are admin-configured emoji living in the database,
// not hardcoded here - a code-only pass can't rewrite the data itself. This
// translates known emoji to real outline icons at render time as a display
// layer, without touching the underlying data. Anything not in the map
// falls back to showing the raw emoji rather than silently disappearing,
// so an admin adding a new status with an unmapped emoji doesn't lose it -
// it just won't be icon-ified until this map (or the data) is updated.
const STATUS_ICON_MAP = {
  '❤️': 'heart', '❤': 'heart',
  '👎': 'thumb-down',
  '✓': 'check', '✔️': 'check', '✔': 'check',
  '📚': 'book',
  '❌': 'x', '✗': 'x',
};
function StatusIcon({ emoji }) {
  const iconName = STATUS_ICON_MAP[emoji];
  return iconName
    ? <i className={`ti ti-${iconName}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i>
    : <span aria-hidden="true">{emoji}</span>;
}

export default function Songs() {
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [songs, setSongs] = useState([]);
  const [songbooks, setSongbooks] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [userPrefs, setUserPrefs] = useState({});
  const [userStatusMap, setUserStatusMap] = useState({}); // songId -> [value_key, ...] from user_song_status
  const [statusOptions, setStatusOptions] = useState([]); // from option_lists, list_key='status_options'
  const [familiarityOptions, setFamiliarityOptions] = useState([]); // from option_lists, list_key='familiarity_levels'
  const [versions, setVersions] = useState([]);
  const [allVersions, setAllVersions] = useState([]);
  const [songNotes, setSongNotes] = useState([]);
  const [songMedia, setSongMedia] = useState([]);
  const [songAliases, setSongAliases] = useState([]);
  const [songFlags, setSongFlags] = useState([]);
  const [songGroups, setSongGroups] = useState([]);
  const [allGroups, setAllGroups] = useState([]);

  // UI state
  const [selectedSong, setSelectedSong] = useState(null);
  const [search, setSearch] = useState('');
  const [searchLyrics, setSearchLyrics] = useState(true); // true = include lyrics, false = names only
  const [songbookIds, setSongbookIds] = useState([]);       // multi-select, [] = any songbook
  const [songbookFilterMode, setSongbookFilterMode] = useState('any'); // a song can be in several songbooks
  const [sectionDefs, setSectionDefs] = useState([]);        // raw songbook_sections rows: {songbook_id, section_code, section_name}
  const [sections, setSections] = useState([]);              // multi-select, values are "songbookId::code" keys
  const [sectionFilterMode, setSectionFilterMode] = useState('any'); // a song can be in several sections
  const [systemTagFilter, setSystemTagFilter] = useState([]); // multi-select include, [] = any tag
  const [systemTagFilterMode, setSystemTagFilterMode] = useState('any'); // a song can have several tags
  const [excludeTagFilter, setExcludeTagFilter] = useState([]); // multi-select exclude, [] = no exclusions
  const [personalTagValues, setPersonalTagValues] = useState([]); // multi-select, [] = any tag
  const [personalTagFilterMode, setPersonalTagFilterMode] = useState('any'); // a song can have several personal tags
  const [excludePersonalTagValues, setExcludePersonalTagValues] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]); // multi-select array now, e.g. ['favorite','want_to_learn']
  const [excludeStatusFilter, setExcludeStatusFilter] = useState([]);
  const [filtersExpanded, setFiltersExpanded] = useState(true); // master collapse - filters stay applied either way
  const [collapsedGroups, setCollapsedGroups] = useState({}); // per-group collapse, e.g. { songbook: true }
  const toggleGroupCollapsed = (key) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('lyrics'); // 'lyrics', 'info', 'media', 'notes'
  const [personalTagInput, setPersonalTagInput] = useState('');

  // Suggestion modal
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestType, setSuggestType] = useState(''); // 'new_version', 'edit_info', 'add_media', 'add_note', 'add_alias', 'add_flag'
  const [suggestExpanded, setSuggestExpanded] = useState(false);
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  
  // Suggestion form fields
  const [suggestVersionLabel, setSuggestVersionLabel] = useState('');
  const [suggestLyrics, setSuggestLyrics] = useState('');
  const [suggestMediaType, setSuggestMediaType] = useState('youtube');
  const [suggestMediaUrl, setSuggestMediaUrl] = useState('');
  const [suggestMediaLabel, setSuggestMediaLabel] = useState('');
  const [suggestNoteType, setSuggestNoteType] = useState('history');
  const [suggestNoteContent, setSuggestNoteContent] = useState('');
  const [suggestAlias, setSuggestAlias] = useState('');
  const [suggestFlagType, setSuggestFlagType] = useState('content_warning');
  const [suggestFlagNotes, setSuggestFlagNotes] = useState('');
  const [suggestEditField, setSuggestEditField] = useState('author');
  const [suggestEditValue, setSuggestEditValue] = useState('');
  const [suggestReason, setSuggestReason] = useState('');
  const [suggestSourceUrl, setSuggestSourceUrl] = useState('');

  const [versionAttrs, setVersionAttrs] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState(null);
  const [listWidth, setListWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [versionPrefs, setVersionPrefs] = useState({});

  const VERSION_ATTRIBUTE_LABELS = {
    'gender_neutral': 'Gender Neutral',
    'secular': 'Secular',
    'kid_friendly': 'Kid Friendly',
    'addresses_sensitivity': 'Addresses Sensitivity',
    'camp_specific': 'Camp-Specific',
    'other': 'Other'
  };


  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => { checkAuth(); loadData(); }, []);
  useEffect(() => { if (user) loadUserPrefs(); }, [user]);
  useEffect(() => { if (selectedSong) loadSongDetails(selectedSong.id); }, [selectedSong?.id]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        await loadUserProfile(userData.id);
      }
    } catch (error) { console.log('Auth check failed'); }
    setLoading(false);
  };

  const loadUserProfile = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setUserProfile(data[0]);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadUserPrefs = async () => {
    if (!user) return;
    try {
      const prefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
      const prefsData = await prefsRes.json();
      const prefsMap = {};
      if (Array.isArray(prefsData)) {
        prefsData.forEach(p => { prefsMap[p.song_id] = p; });
      }
      setUserPrefs(prefsMap);

      // Load status selections (favorite/dislike/known/want-to-learn/etc - multi-select)
      const statusRes = await fetch(`${SUPABASE_URL}/rest/v1/user_song_status?user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
      const statusData = await statusRes.json();
      const statusMap = {};
      if (Array.isArray(statusData)) {
        statusData.forEach(s => {
          if (!statusMap[s.song_id]) statusMap[s.song_id] = [];
          statusMap[s.song_id].push(s.value_key);
        });
      }
      setUserStatusMap(statusMap);
      
      // Load version preferences
      const vPrefsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?user_id=eq.${user.id}`, { headers: getAuthHeaders(false) });
      const vPrefsData = await vPrefsRes.json();
      const vPrefsMap = {};
      if (Array.isArray(vPrefsData)) {
        vPrefsData.forEach(vp => { vPrefsMap[vp.version_id] = vp; });
      }
      setVersionPrefs(vPrefsMap);
    } catch (error) { console.error('Error loading preferences:', error); }
  };

  const loadData = async () => {
    try {
      // Load songs
      const songsRes = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, { headers: getAuthHeaders(false) });
      const songsData = await songsRes.json();

      // Load configurable option lists (status options, familiarity levels)
      const optionListsRes = await fetch(`${SUPABASE_URL}/rest/v1/option_lists?select=*&order=display_order.asc`, { headers: getAuthHeaders(false) });
      const optionListsData = await optionListsRes.json();
      if (Array.isArray(optionListsData)) {
        setStatusOptions(optionListsData.filter(o => o.list_key === 'status_options'));
        setFamiliarityOptions(optionListsData.filter(o => o.list_key === 'familiarity_levels'));
      }
      
      // Load songbooks
      const songbooksRes = await fetch(`${SUPABASE_URL}/rest/v1/songbooks?select=*`, { headers: getAuthHeaders(false) });
      const songbooksData = await songbooksRes.json();

      // Load songbook section definitions (real per-book section names, not hardcoded)
      const sectionDefsRes = await fetch(`${SUPABASE_URL}/rest/v1/songbook_sections?select=*`, { headers: getAuthHeaders(false) });
      const sectionDefsData = await sectionDefsRes.json();
      setSectionDefs(Array.isArray(sectionDefsData) ? sectionDefsData : []);
      
      // Load songbook entries
      const entriesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, { headers: getAuthHeaders(false) });
      const entriesData = await entriesRes.json();
      
      // Load tag definitions
      const tagDefsRes = await fetch(`${SUPABASE_URL}/rest/v1/tags?select=*`, { headers: getAuthHeaders(false) });
      const tagDefsData = await tagDefsRes.json();
      
      // Load song-tag associations
      const songTagsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_tags?select=*`, { headers: getAuthHeaders(false) });
      const songTagsData = await songTagsRes.json();
      
      // Build tag lookup map
      const tagMap = {};
      if (Array.isArray(tagDefsData)) {
        tagDefsData.forEach(t => { tagMap[t.id] = t.name; });
      }
      
      // Load aliases
      const aliasesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_aliases?select=*`, { headers: getAuthHeaders(false) });
      const aliasesData = await aliasesRes.json();
      
      // Load all versions for filtering (include lyrics for search)
      const allVersionsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=id,song_id,lyrics_content`, { headers: getAuthHeaders(false) });
      const allVersionsData = await allVersionsRes.json();
      setAllVersions(Array.isArray(allVersionsData) ? allVersionsData : []);

      // Load song groups
      const groupsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_groups?select=*`, { headers: getAuthHeaders(false) });
      const groupsData = await groupsRes.json();
      setAllGroups(Array.isArray(groupsData) ? groupsData : []);

      // Build songbook map
      const songbookMap = {};
      if (Array.isArray(songbooksData)) {
        songbooksData.forEach(sb => { songbookMap[sb.id] = sb.name; });
      }

      // Enrich songs with songbooks, tags, and aliases
      const enrichedSongs = (Array.isArray(songsData) ? songsData : []).map(song => {
        const songEntries = (Array.isArray(entriesData) ? entriesData : []).filter(e => e.song_id === song.id);
        // Get tag names by looking up tag_ids in tagMap
        const songTagIds = (Array.isArray(songTagsData) ? songTagsData : []).filter(st => st.song_id === song.id).map(st => st.tag_id);
        const songTagNames = songTagIds.map(tid => tagMap[tid]).filter(Boolean);
        const songAliasesList = (Array.isArray(aliasesData) ? aliasesData : []).filter(a => a.song_id === song.id).map(a => a.alias_title);
        return {
          ...song,
          tags: songTagNames,
          aliases: songAliasesList,
          songbooks: songEntries.map(e => ({
            id: e.songbook_id,
            name: songbookMap[e.songbook_id] || 'Unknown',
            section: e.section,        // legacy text code, kept for reference only - not used for filtering anymore
            section_id: e.section_id,  // real FK - this is what filtering actually uses now
            page: e.page
          }))
        };
      });

      setSongs(enrichedSongs);
      setSongbooks(Array.isArray(songbooksData) ? songbooksData : []);
      
      // Collect all unique tags
      const tagSet = new Set();
      enrichedSongs.forEach(s => s.tags?.forEach(t => tagSet.add(t)));
      setAllTags([...tagSet].sort());

    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadSongDetails = async (songId) => {
    try {
      // Load versions
      const versionsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${songId}&select=*`, { headers: getAuthHeaders(false) });
      const versionsData = await versionsRes.json();
      const versionsArray = Array.isArray(versionsData) ? versionsData : [];
      setVersions(versionsArray);
      
      // Set default selected version (prefer singalong default)
      const defaultV = versionsArray.find(v => v.is_default_singalong) || versionsArray[0];
      setSelectedVersionId(defaultV?.id || null);
      setCompareVersionId(null);
      setCompareMode(false);

      // Load version attributes
      if (versionsArray.length > 0) {
        const versionIds = versionsArray.map(v => v.id).join(',');
        const attrsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_version_attributes?song_version_id=in.(${versionIds})&select=*`, { headers: getAuthHeaders(false) });
        const attrsData = await attrsRes.json();
        setVersionAttrs(Array.isArray(attrsData) ? attrsData : []);
      } else {
        setVersionAttrs([]);
      }

      // Load notes
      const notesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_notes?song_id=eq.${songId}&select=*&order=created_at.desc`, { headers: getAuthHeaders(false) });
      const notesData = await notesRes.json();
      setSongNotes(Array.isArray(notesData) ? notesData : []);

      // Load media
      try {
        const mediaRes = await fetch(`${SUPABASE_URL}/rest/v1/song_media?song_id=eq.${songId}&select=*&order=display_order.asc`, { headers: getAuthHeaders(false) });
        const mediaData = await mediaRes.json();
        setSongMedia(Array.isArray(mediaData) ? mediaData : []);
      } catch { setSongMedia([]); }

      // Load aliases
      try {
        const aliasesRes = await fetch(`${SUPABASE_URL}/rest/v1/song_aliases?song_id=eq.${songId}&select=*`, { headers: getAuthHeaders(false) });
        const aliasesData = await aliasesRes.json();
        setSongAliases(Array.isArray(aliasesData) ? aliasesData : []);
      } catch { setSongAliases([]); }

      // Load flags
      try {
        const flagsRes = await fetch(`${SUPABASE_URL}/rest/v1/song_flags?song_id=eq.${songId}&select=*`, { headers: getAuthHeaders(false) });
        const flagsData = await flagsRes.json();
        setSongFlags(Array.isArray(flagsData) ? flagsData : []);
      } catch { setSongFlags([]); }

      // Load group memberships
      try {
        const membersRes = await fetch(`${SUPABASE_URL}/rest/v1/song_group_members?song_id=eq.${songId}&select=*`, { headers: getAuthHeaders(false) });
        const membersData = await membersRes.json();
        setSongGroups(Array.isArray(membersData) ? membersData : []);
      } catch { setSongGroups([]); }

    } catch (error) {
      console.error('Error loading song details:', error);
    }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  // All songbook placements across all songs, in the {songbook_id, section_id} shape
  // the shared filter module expects - derived from the already-loaded, enriched
  // `songs` data rather than a separate fetch.
  const allEntries = useMemo(() => {
    return songs.flatMap(song => (song.songbooks || []).map(sb => ({ songbook_id: sb.id, section_id: sb.section_id })));
  }, [songs]);

  // Only offer songbooks that actually have songs in them
  const filterableSongbooks = useMemo(() => getFilterableSongbooks(songbooks, allEntries), [songbooks, allEntries]);

  // Sections defined for the currently-selected songbook(s) - real section
  // records (id, name, optional code), not derived from which songs happen to
  // occupy them. Empty if no songbook is selected - sections only make sense
  // in the context of a specific book, so nothing shows until you pick one.
  const availableSections = useMemo(() => getAvailableSections(sectionDefs, songbookIds), [sectionDefs, songbookIds]);

  // Get all personal tags
  const allPersonalTags = useMemo(() => {
    const tags = new Set();
    Object.values(userPrefs).forEach(p => {
      if (p.personal_tags) p.personal_tags.forEach(t => tags.add(t));
    });
    return [...tags].sort();
  }, [userPrefs]);

  // Filter songs
  const filteredSongs = useMemo(() => {
    return songs.filter(song => {
      // Search filter
      if (search) {
        const s = search.toLowerCase();
        // Always search title, author, composer, aliases
        const matchesBasic = song.title?.toLowerCase().includes(s) || 
            song.author?.toLowerCase().includes(s) ||
            song.composer?.toLowerCase().includes(s) ||
            song.aliases?.some(a => a.toLowerCase().includes(s));
        
        if (searchLyrics) {
          // Also search lyrics in all versions
          const songVers = allVersions.filter(v => v.song_id === song.id);
          const matchesLyrics = songVers.some(v => v.lyrics_content?.toLowerCase().includes(s));
          if (!matchesBasic && !matchesLyrics) return false;
        } else {
          if (!matchesBasic) return false;
        }
      }
      // Songbook / section / tag filters - shared logic, same as room, admin songs, and admin tags
      const songEntries = (song.songbooks || []).map(sb => ({ songbook_id: sb.id, section_id: sb.section_id }));
      const pref = userPrefs[song.id];
      if (!songMatchesFilters(
        songEntries,
        song.tags || [],           // using tag NAMES here (not ids) - this page already works by name throughout
        pref?.personal_tags || [],
        {
          songbookIds, songbookMode: songbookFilterMode,
          sections, sectionMode: sectionFilterMode,
          includeTagIds: systemTagFilter, includeMode: systemTagFilterMode, excludeTagIds: excludeTagFilter,
          personalTagValues, personalTagMode: personalTagFilterMode
        }
      )) return false;

      // Exclude by personal tag - handled locally rather than in the shared
      // module, since exclude-by-personal-tag is specific to this page.
      if (excludePersonalTagValues.length > 0) {
        const myTags = pref?.personal_tags || [];
        if (excludePersonalTagValues.some(t => myTags.includes(t))) return false;
      }

      const myStatuses = userStatusMap[song.id] || [];

      // Exclude by status (favorite/dislike/known/etc.) - always wins,
      // checked before the include-side status filter below.
      if (excludeStatusFilter.length > 0) {
        if (excludeStatusFilter.some(s => myStatuses.includes(s))) return false;
      }

      // Status filters - multi-select, OR logic: song passes if it matches ANY
      // selected status (so picking Favorite + Want to Learn shows songs that
      // are either one, not only songs that are both).
      if (statusFilter.length > 0) {
        const songVers = allVersions.filter(v => v.song_id === song.id);
        const hasFamiliarity = songVers.some(v => versionPrefs[v.id]?.familiarity);
        const isUntagged = myStatuses.length === 0 && !(pref?.personal_tags && pref.personal_tags.length > 0);
        const matchesAny = statusFilter.some(s => {
          if (s === 'untagged') return isUntagged;
          if (s === 'no_familiarity') return !hasFamiliarity;
          return myStatuses.includes(s);
        });
        if (!matchesAny) return false;
      }
      return true;
    });
  }, [songs, search, searchLyrics, songbookIds, sections, systemTagFilter, excludeTagFilter, personalTagValues, excludePersonalTagValues, statusFilter, excludeStatusFilter, userPrefs, userStatusMap, allVersions, versionPrefs]);

  // Save user preference
  const savePreference = async (songId, updates) => {
    if (!user) return;
    
    const existing = userPrefs[songId];
    const newPref = { ...existing, ...updates, user_id: user.id, song_id: songId, updated_at: new Date().toISOString() };
    
    try {
      if (existing?.id) {
        // Update
        await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?id=eq.${existing.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(updates)
        });
      } else {
        // Insert
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(newPref)
        });
        const created = await res.json();
        if (created[0]) newPref.id = created[0].id;
      }
      setUserPrefs(prev => ({ ...prev, [songId]: newPref }));
    } catch (error) {
      console.error('Error saving preference:', error);
      showMessage('❌ Error saving');
    }
  };

  // Toggle a status option (favorite/dislike/known/want-to-learn/etc.) on or
  // off for a song. Multi-select - toggling one doesn't affect the others,
  // so "favorite" and "want to learn" can both be set at once.
  const toggleStatus = async (songId, valueKey) => {
    if (!user) return;
    const current = userStatusMap[songId] || [];
    const isSet = current.includes(valueKey);
    try {
      if (isSet) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_song_status?user_id=eq.${user.id}&song_id=eq.${songId}&value_key=eq.${valueKey}`, {
          method: 'DELETE', headers: getAuthHeaders(false)
        });
        if (!res.ok) { showMessage('❌ Could not update'); return; }
        setUserStatusMap(prev => ({ ...prev, [songId]: current.filter(v => v !== valueKey) }));
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_song_status`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: user.id, song_id: songId, value_key: valueKey })
        });
        if (!res.ok) { showMessage('❌ Could not update'); return; }
        setUserStatusMap(prev => ({ ...prev, [songId]: [...current, valueKey] }));
      }
    } catch (error) {
      console.error('Error toggling status:', error);
      showMessage('❌ Error saving');
    }
  };

  const addPersonalTag = (songId, tag) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const current = userPrefs[songId]?.personal_tags || [];
    if (!current.includes(t)) {
      savePreference(songId, { personal_tags: [...current, t] });
    }
    setPersonalTagInput('');
  };

  const removePersonalTag = (songId, tag) => {
    const current = userPrefs[songId]?.personal_tags || [];
    savePreference(songId, { personal_tags: current.filter(t => t !== tag) });
  };

  const resetSuggestForm = () => {
    setSuggestVersionLabel('');
    setSuggestLyrics('');
    setSuggestMediaType('youtube');
    setSuggestMediaUrl('');
    setSuggestMediaLabel('');
    setSuggestNoteType('history');
    setSuggestNoteContent('');
    setSuggestAlias('');
    setSuggestFlagType('content_warning');
    setSuggestFlagNotes('');
    setSuggestEditField('author');
    setSuggestEditValue('');
    setSuggestReason('');
    setSuggestSourceUrl('');
  };

  const submitSuggestion = async () => {
    if (!user || !selectedSong) return;
    
    // Validation
    if (suggestType === 'new_version' && !suggestVersionLabel.trim()) {
      showMessage('❌ Please enter a version label');
      return;
    }
    if (suggestType === 'add_media' && !suggestMediaUrl.trim()) {
      showMessage('❌ Please enter a media URL');
      return;
    }
    if (suggestType === 'add_note' && !suggestNoteContent.trim()) {
      showMessage('❌ Please enter note content');
      return;
    }
    if (suggestType === 'add_alias' && !suggestAlias.trim()) {
      showMessage('❌ Please enter the alternate name');
      return;
    }
    if (suggestType === 'add_flag' && !suggestFlagNotes.trim()) {
      showMessage('❌ Please describe the flag');
      return;
    }
    if (suggestType === 'edit_info' && !suggestEditValue.trim()) {
      showMessage('❌ Please enter the suggested value');
      return;
    }

    setSuggestSubmitting(true);

    const payload = {
      suggestion_type: suggestType === 'edit_info' ? 'edit' : suggestType,
      song_id: selectedSong.id,
      version_id: null,
      title: suggestType === 'add_alias' ? suggestAlias.trim() : null,
      version_label: suggestType === 'new_version' ? suggestVersionLabel.trim() : null,
      lyrics_content: suggestType === 'new_version' ? suggestLyrics.trim() || null : null,
      media_type: suggestType === 'add_media' ? suggestMediaType : null,
      media_url: suggestType === 'add_media' ? suggestMediaUrl.trim() : null,
      media_label: suggestType === 'add_media' ? suggestMediaLabel.trim() || null : null,
      note_content: suggestType === 'add_note' ? suggestNoteContent.trim() : (suggestType === 'add_flag' ? suggestFlagNotes.trim() : null),
      note_type: suggestType === 'add_note' ? suggestNoteType : (suggestType === 'add_flag' ? suggestFlagType : null),
      field_name: suggestType === 'edit_info' ? suggestEditField : null,
      current_value: null,
      suggested_value: suggestType === 'edit_info' ? suggestEditValue.trim() : null,
      reason: suggestReason.trim() || null,
      source_url: suggestSourceUrl.trim() || null,
      created_by: user.id,
      status: 'pending'
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/song_suggestions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        showMessage('✅ Suggestion submitted! Thanks for contributing.');
        resetSuggestForm();
        setSuggestType('');
        setShowSuggestModal(false);
      } else {
        showMessage('❌ Failed to submit suggestion');
      }
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      showMessage('❌ Failed to submit suggestion');
    }
    
    setSuggestSubmitting(false);
  };

  const setVersionFamiliarity = async (versionId, familiarity) => {
    if (!user) return;
    const existing = versionPrefs[versionId];
    
    try {
      if (existing) {
        if (familiarity === null || familiarity === '') {
          // Remove
          const res = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?id=eq.${existing.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (!res.ok) {
            const errorText = await res.text();
            console.error('Familiarity delete failed:', res.status, errorText);
            showMessage(`❌ Could not clear: ${errorText.substring(0, 150)}`);
            return;
          }
          setVersionPrefs(prev => { const n = {...prev}; delete n[versionId]; return n; });
        } else {
          // Update
          // NOTE: this fetch's response is now checked before updating local state.
          // Previously a failed write (e.g. rejected by a DB constraint) was silently
          // ignored, and the dropdown would appear to reset to "Not set" with no
          // explanation - it wasn't resetting, it just never actually changed.
          const res = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences?id=eq.${existing.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ familiarity, updated_at: new Date().toISOString() })
          });
          if (!res.ok) {
            const errorText = await res.text();
            console.error('Familiarity update failed:', res.status, errorText);
            showMessage(`❌ Could not save: ${errorText.substring(0, 150)}`);
            return; // leave versionPrefs untouched so the dropdown doesn't lie about what saved
          }
          setVersionPrefs(prev => ({ ...prev, [versionId]: { ...existing, familiarity } }));
        }
      } else if (familiarity) {
        // Create
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_version_preferences`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ user_id: user.id, version_id: versionId, familiarity })
        });
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Familiarity create failed:', res.status, errorText);
          showMessage(`❌ Could not save: ${errorText.substring(0, 150)}`);
          return;
        }
        const data = await res.json();
        if (data[0]) {
          setVersionPrefs(prev => ({ ...prev, [versionId]: data[0] }));
        }
      }
    } catch (error) {
      console.error('Error setting familiarity:', error);
      showMessage('❌ Error saving');
    }
  };

  // Resize handlers
  const startResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(250, Math.min(600, e.clientX - 24)); // 24px for padding
      setListWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Get page for selected songbook - only meaningful when exactly one songbook
  // is selected; otherwise falls back to the song's first known placement.
  const getPageForSongbook = (song) => {
    if (songbookIds.length !== 1) return song.songbooks?.[0]?.page || '';
    const entry = song.songbooks?.find(sb => sb.id === songbookIds[0]);
    return entry?.page || '';
  };

  // Render media embed
  const renderMedia = (media) => {
    const url = media.url || media.media_url;
    if (!url) return null;
    
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (ytMatch) {
      return (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, maxWidth: '400px' }}>
          <iframe
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '0.5rem' }}
            src={`https://www.youtube.com/embed/${ytMatch[1]}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    
    // Spotify
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([^?]+)/);
    if (spotifyMatch) {
      return (
        <iframe
          style={{ borderRadius: '0.5rem', maxWidth: '400px' }}
          src={`https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`}
          width="100%"
          height="152"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      );
    }
    
    // Generic link with preview card
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer" 
        style={{ 
          display: 'block',
          padding: '0.75rem',
          background: '#0f172a',
          borderRadius: '0.5rem',
          color: '#3B9B73',
          textDecoration: 'none',
          fontSize: '0.875rem',
          wordBreak: 'break-all'
        }}
      >
        <i className="ti ti-link" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {url}
      </a>
    );
  };

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', paddingTop: '4rem' },
    wrapper: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: selectedSong ? `${listWidth}px 8px 1fr` : '1fr', gap: '0.5rem' },
    header: { marginBottom: '1rem' },
    title: { fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', fontFamily: "'Gloria Hallelujah', cursive" },
    subtitle: { color: '#838C95', fontSize: '0.875rem' },
    filters: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'start', marginBottom: '1rem' },
    input: { padding: '0.5rem 0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', outline: 'none', fontSize: '0.875rem' },
    select: { padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', color: '#fff', fontSize: '0.875rem' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    filterLabel: { fontSize: '0.7rem', color: '#838C95', textTransform: 'uppercase' },
    card: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', overflow: 'hidden' },
    songList: { maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' },
    songItem: (active) => ({ 
      padding: '0.75rem 1rem', 
      borderBottom: '1px solid #334155', 
      cursor: 'pointer', 
      background: active ? '#3B9B7315' : 'transparent',
      borderLeft: active ? '3px solid #3B9B73' : '3px solid transparent',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '0.5rem'
    }),
    songTitle: { fontWeight: '500', marginBottom: '0.25rem' },
    songMeta: { fontSize: '0.75rem', color: '#838C95' },
    songPage: { fontSize: '0.75rem', color: '#838C95', whiteSpace: 'nowrap' },
    favStar: (active) => ({ 
      color: active ? '#6882B6' : '#838C95', 
      cursor: 'pointer', 
      fontSize: '1.25rem',
      lineHeight: 1
    }),
    main: { background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.5rem', minHeight: '60vh' },
    tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' },
    tab: (active) => ({ 
      padding: '0.5rem 1rem', 
      background: active ? '#334155' : 'transparent', 
      border: 'none', 
      borderRadius: '0.375rem', 
      color: active ? '#fff' : '#838C95', 
      cursor: 'pointer',
      fontSize: '0.875rem'
    }),
    btn: { background: '#256B45', color: '#fff', border: 'none', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    btnSec: { background: '#334155', color: '#fff', border: 'none', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' },
    btnSmall: { background: '#334155', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' },
    statusBtn: (active, color) => ({
      background: active ? color : '#334155',
      color: '#fff',
      border: 'none',
      padding: '0.375rem 0.75rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.75rem',
      opacity: active ? 1 : 0.6
    }),
    tag: { display: 'inline-block', background: '#334155', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    personalTag: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#6882B633', border: '1px solid #6882B6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', marginRight: '0.25rem', marginBottom: '0.25rem' },
    lyrics: { whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: '1.1rem', lineHeight: '1.8', padding: '1rem', background: '#0f172a', borderRadius: '0.5rem' },
    versionCard: { padding: '1rem', background: '#0f172a', borderRadius: '0.5rem', marginBottom: '1rem' },
    versionLabel: { fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#3B9B73' },
    infoRow: { display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' },
    infoLabel: { color: '#838C95', minWidth: '120px' },
    message: { position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid #334155', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', zIndex: 100 },
    emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#838C95' }
  };

  if (loading) {
    return <div style={{ ...s.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  const pref = selectedSong ? userPrefs[selectedSong.id] : null;

  return (
    <div style={s.container}>
      {message && <div style={s.message}>{message}</div>}

      <div style={s.wrapper}>
        {/* Song List Panel */}
        <div>
          <div style={s.header}>
            <h1 style={s.title}><i className="ti ti-music" style={{ fontSize: '1em' }} aria-hidden="true"></i> Songs</h1>
            <p style={s.subtitle}>{filteredSongs.length} of {songs.length} songs</p>
          </div>

          {/* Search */}
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder={searchLyrics ? "Search titles, authors, aliases, lyrics..." : "Search titles, authors, aliases..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...s.input, width: '100%', marginBottom: '0.5rem' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#838C95', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={searchLyrics}
                onChange={(e) => setSearchLyrics(e.target.checked)}
                style={{ accentColor: '#3B9B73' }}
              />
              Include lyrics in search
            </label>
          </div>

          {/* Filters */}
          {(() => {
            const activeFilterCount = songbookIds.length + sections.length + systemTagFilter.length + excludeTagFilter.length + personalTagValues.length + excludePersonalTagValues.length + statusFilter.length + excludeStatusFilter.length;
            return (
              <div
                onClick={() => setFiltersExpanded(prev => !prev)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '0.5rem 0', userSelect: 'none' }}
              >
                <span style={{ fontWeight: 'bold', color: '#838C95', fontSize: '0.875rem' }}>
                  <i className="ti ti-filter" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}
                </span>
                <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{filtersExpanded ? '▲ Collapse' : '▼ Expand'}</span>
              </div>
            );
          })()}
          {filtersExpanded && (
          <div style={s.filters}>
            {filterableSongbooks.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('songbook')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>Songbook{songbookIds.length > 0 ? ` (${songbookIds.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.songbook ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.songbook && (
                <>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="songbookFilterMode" checked={songbookFilterMode === 'any'} onChange={() => setSongbookFilterMode('any')} /> any
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="songbookFilterMode" checked={songbookFilterMode === 'all'} onChange={() => setSongbookFilterMode('all')} /> all
                  </label>
                </div>
                <AdaptiveMultiSelect
                  options={filterableSongbooks.map(sb => ({ value: sb.id, label: sb.name }))}
                  selected={songbookIds}
                  onChange={(vals) => { setSongbookIds(vals); setSections([]); }}
                  placeholder="Search songbooks..."
                  accentColor="#256B45"
                />
                </>
                )}
              </div>
            )}

            {songbookIds.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#838C95', alignSelf: 'center' }}>
                Select a songbook above to filter by section
              </div>
            )}

            {availableSections.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('section')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>Section{sections.length > 0 ? ` (${sections.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.section ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.section && (
                <>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="sectionFilterMode" checked={sectionFilterMode === 'any'} onChange={() => setSectionFilterMode('any')} /> any
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="sectionFilterMode" checked={sectionFilterMode === 'all'} onChange={() => setSectionFilterMode('all')} /> all
                  </label>
                </div>
                {songbookIds.length > 1 ? (
                  // Multiple songbooks selected - group sections under a label for each
                  songbookIds.map(sbId => {
                    const sb = filterableSongbooks.find(b => b.id === sbId);
                    const theseSections = availableSections.filter(s2 => s2.songbook_id === sbId);
                    if (theseSections.length === 0) return null;
                    return (
                      <div key={sbId} style={{ marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#838C95', marginBottom: '0.25rem' }}>{sb?.name}</div>
                        <AdaptiveMultiSelect
                          options={theseSections.map(s2 => ({ value: s2.id, label: sectionLabel(s2) }))}
                          selected={sections}
                          onChange={setSections}
                          placeholder="Search sections..."
                          accentColor="#256B45"
                        />
                      </div>
                    );
                  })
                ) : (
                  <AdaptiveMultiSelect
                    options={availableSections.map(s2 => ({ value: s2.id, label: sectionLabel(s2) }))}
                    selected={sections}
                    onChange={setSections}
                    placeholder="Search sections..."
                    accentColor="#256B45"
                  />
                )}
                </>
                )}
              </div>
            )}

            {allTags.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('tag')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>Platform Tag{systemTagFilter.length > 0 ? ` (${systemTagFilter.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.tag ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.tag && (
                <>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="systemTagFilterMode" checked={systemTagFilterMode === 'any'} onChange={() => setSystemTagFilterMode('any')} /> any
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="systemTagFilterMode" checked={systemTagFilterMode === 'all'} onChange={() => setSystemTagFilterMode('all')} /> all
                  </label>
                </div>
                <AdaptiveMultiSelect
                  options={allTags.map(tag => ({ value: tag, label: tag }))}
                  selected={systemTagFilter}
                  onChange={setSystemTagFilter}
                  otherSelected={excludeTagFilter}
                  placeholder="Search platform tags..."
                  accentColor="#256B45"
                />
                </>
                )}
              </div>
            )}

            {allTags.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('excludeTag')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>Exclude Platform Tag{excludeTagFilter.length > 0 ? ` (${excludeTagFilter.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.excludeTag ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.excludeTag && (
                <AdaptiveMultiSelect
                  options={allTags.map(tag => ({ value: tag, label: tag }))}
                  selected={excludeTagFilter}
                  onChange={setExcludeTagFilter}
                  otherSelected={systemTagFilter}
                  placeholder="Search platform tags..."
                  accentColor="#C35522"
                />
                )}
              </div>
            )}

            {user && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('mySongs')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>My Songs{statusFilter.length > 0 ? ` (${statusFilter.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.mySongs ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.mySongs && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {/* statusOptions' opt.icon is admin-configured data from the
                      database (not hardcoded here), so it's left as-is - a
                      code-only pass can't safely convert emoji that lives in
                      the database itself. The two hardcoded entries below get
                      real icons via iconName instead of baking emoji into
                      the label string. */}
                  {[
                    ...statusOptions.map(opt => ({ value: opt.value_key, iconEmoji: opt.icon, label: opt.label })),
                    { value: 'untagged', iconName: 'search', label: 'Untagged (no prefs)' },
                    { value: 'no_familiarity', iconName: 'search', label: 'No familiarity set' }
                  ].map(opt => {
                    const selected = statusFilter.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setStatusFilter(prev => toggleInArray(prev, opt.value))}
                        style={{
                          ...s.select, cursor: 'pointer', border: selected ? '2px solid #6882B6' : (s.select.border || '1px solid #334155'),
                          background: selected ? '#6882B620' : (s.select.background || '#1e293b'),
                          color: selected ? '#6882B6' : (s.select.color || '#fff')
                        }}
                      >
                        {opt.iconName && <i className={`ti ti-${opt.iconName}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i>}
                        {opt.iconEmoji && <StatusIcon emoji={opt.iconEmoji} />} {opt.label}
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {user && statusOptions.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('excludeMySongs')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>Exclude My Songs{excludeStatusFilter.length > 0 ? ` (${excludeStatusFilter.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.excludeMySongs ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.excludeMySongs && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {statusOptions.map(opt => {
                    const selected = excludeStatusFilter.includes(opt.value_key);
                    return (
                      <button
                        key={opt.value_key}
                        onClick={() => setExcludeStatusFilter(prev => toggleInArray(prev, opt.value_key))}
                        style={{
                          ...s.select, cursor: 'pointer', border: selected ? '2px solid #D45D25' : (s.select.border || '1px solid #334155'),
                          background: selected ? '#D45D2520' : (s.select.background || '#1e293b'),
                          color: selected ? '#D45D25' : (s.select.color || '#fff')
                        }}
                      >
                        {selected ? <><i className="ti ti-x" style={{ fontSize: '0.85em' }} aria-hidden="true"></i> </> : '− '}{opt.icon && <StatusIcon emoji={opt.icon} />} {opt.label}
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {user && allPersonalTags.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('myTags')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>My Tags{personalTagValues.length > 0 ? ` (${personalTagValues.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.myTags ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.myTags && (
                <>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="personalTagFilterMode" checked={personalTagFilterMode === 'any'} onChange={() => setPersonalTagFilterMode('any')} /> any
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input type="radio" name="personalTagFilterMode" checked={personalTagFilterMode === 'all'} onChange={() => setPersonalTagFilterMode('all')} /> all
                  </label>
                </div>
                <AdaptiveMultiSelect
                  options={allPersonalTags.map(tag => ({ value: tag, label: tag }))}
                  selected={personalTagValues}
                  onChange={setPersonalTagValues}
                  otherSelected={excludePersonalTagValues}
                  placeholder="Search your tags..."
                  accentColor="#5371AC"
                />
                </>
                )}
              </div>
            )}

            {user && allPersonalTags.length > 0 && (
              <div style={s.filterGroup}>
                <div onClick={() => toggleGroupCollapsed('excludeMyTags')} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={s.filterLabel}>Exclude My Tags{excludePersonalTagValues.length > 0 ? ` (${excludePersonalTagValues.length})` : ''}</span>
                  <span style={{ color: '#838C95', fontSize: '0.75rem' }}>{collapsedGroups.excludeMyTags ? '▼' : '▲'}</span>
                </div>
                {!collapsedGroups.excludeMyTags && (
                <AdaptiveMultiSelect
                  options={allPersonalTags.map(tag => ({ value: tag, label: tag }))}
                  selected={excludePersonalTagValues}
                  onChange={setExcludePersonalTagValues}
                  otherSelected={personalTagValues}
                  placeholder="Search your tags..."
                  accentColor="#C35522"
                />
                )}
              </div>
            )}

            {(songbookIds.length > 0 || sections.length > 0 || systemTagFilter.length > 0 || excludeTagFilter.length > 0 || personalTagValues.length > 0 || excludePersonalTagValues.length > 0 || statusFilter.length > 0 || excludeStatusFilter.length > 0) && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <button
                  onClick={() => { setSongbookIds([]); setSongbookFilterMode('any'); setSections([]); setSectionFilterMode('any'); setSystemTagFilter([]); setSystemTagFilterMode('any'); setExcludeTagFilter([]); setPersonalTagValues([]); setPersonalTagFilterMode('any'); setExcludePersonalTagValues([]); setStatusFilter([]); setExcludeStatusFilter([]); }}
                  style={{ ...s.select, cursor: 'pointer', color: '#838C95' }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          )}

          {/* Song List */}
          <div style={s.card}>
            <div style={s.songList}>
              {filteredSongs.map(song => {
                return (
                  <div key={song.id} onClick={() => setSelectedSong(song)} style={s.songItem(selectedSong?.id === song.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.songTitle}>
                        {(userStatusMap[song.id] || []).map(valueKey => {
                          const opt = statusOptions.find(o => o.value_key === valueKey);
                          if (!opt?.icon) return null;
                          return <span key={valueKey} style={{ marginRight: '0.25rem', color: opt.color || undefined }}><StatusIcon emoji={opt.icon} /></span>;
                        })}
                        {song.title}
                      </div>
                      <div style={s.songMeta}>
                        {song.author && <span>{song.author}</span>}
                        {song.tags?.length > 0 && (
                          <span style={{ marginLeft: song.author ? '0.5rem' : 0 }}>
                            {song.tags.slice(0, 2).map(t => <span key={t} style={{ ...s.tag, padding: '0.1rem 0.3rem', marginRight: '0.2rem' }}>{t}</span>)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={s.songPage}>{getPageForSongbook(song)}</div>
                  </div>
                );
              })}
              {filteredSongs.length === 0 && (
                <div style={s.emptyState}>No songs match your filters</div>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle */}
        {selectedSong && (
          <div
            onMouseDown={startResize}
            style={{
              width: '8px',
              cursor: 'col-resize',
              background: isResizing ? '#3B9B73' : '#334155',
              borderRadius: '4px',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.target.style.background = '#3B9B73'}
            onMouseLeave={(e) => { if (!isResizing) e.target.style.background = '#334155'; }}
          >
            <div style={{ width: '2px', height: '40px', background: '#838C95', borderRadius: '1px' }} />
          </div>
        )}

        {/* Song Detail Panel */}
        {selectedSong && (
          <div style={s.main}>
            {/* Header with close button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{selectedSong.title}</h2>
              <button style={s.btnSec} onClick={() => setSelectedSong(null)}>×</button>
            </div>

            {/* Quick metadata row - aliases */}
            {selectedSong.aliases && selectedSong.aliases.length > 0 && (
              <div style={{ fontSize: '0.875rem', color: '#838C95', marginBottom: '0.5rem' }}>
                <em>Also known as: {selectedSong.aliases.join(', ')}</em>
              </div>
            )}

            {/* Prominent info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {/* Songbooks card */}
              {selectedSong.songbooks && selectedSong.songbooks.length > 0 && (
                <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#838C95', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}><i className="ti ti-books" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Songbooks</div>
                  {selectedSong.songbooks.map((sb, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: '500' }}>{sb.name}</span>
                      <span style={{ color: '#838C95', marginLeft: '0.5rem' }}>
                        {sb.section && `§${sb.section}`}
                        {sb.page && ` p.${sb.page}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tags card */}
              {selectedSong.tags && selectedSong.tags.length > 0 && (
                <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#838C95', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}><i className="ti ti-tag" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Platform Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {selectedSong.tags.map(tag => (
                      <span key={tag} style={{ 
                        background: '#838C9520', 
                        color: '#838C95',
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '0.25rem', 
                        fontSize: '0.75rem'
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Groups card */}
              {songGroups.length > 0 && (
                <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#838C95', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}><i className="ti ti-category" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Song Groups</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {songGroups.map(membership => {
                      const group = allGroups.find(g => g.id === membership.group_id);
                      return group ? (
                        <span key={membership.id} style={{ 
                          background: '#3B9B7320', 
                          color: '#3B9B73',
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '0.25rem', 
                          fontSize: '0.75rem'
                        }}>
                          {group.group_name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Flags/Warnings */}
            {songFlags.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#C3552215', border: '1px solid #C3552230', borderRadius: '0.5rem' }}>
                <div style={{ fontWeight: 'bold', color: '#C35522', marginBottom: '0.25rem', fontSize: '0.8rem' }}><i className="ti ti-alert-triangle" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Flags</div>
                {songFlags.map(f => (
                  <div key={f.id} style={{ fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: '500' }}>{f.flag_type}:</span> {f.flag_notes || 'No details'}
                  </div>
                ))}
              </div>
            )}

            {/* Personal Actions - only for logged in users */}
            {user ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem' }}>
                {statusOptions.map(opt => {
                  const isSet = (userStatusMap[selectedSong.id] || []).includes(opt.value_key);
                  return (
                    <button
                      key={opt.value_key}
                      onClick={() => toggleStatus(selectedSong.id, opt.value_key)}
                      style={s.statusBtn(isSet, opt.color || '#838C95')}
                    >
                      {opt.icon && <StatusIcon emoji={opt.icon} />} {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#838C95' }}>
                <Link href="/" style={{ color: '#3B9B73' }}>Log in</Link> to save favorites and track songs you know
              </div>
            )}

            {/* Personal Tags - only for logged in users */}
            {user && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#838C95', marginBottom: '0.25rem' }}>My Tags:</div>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {pref?.personal_tags?.map(tag => (
                    <span key={tag} style={s.personalTag}>
                      {tag}
                      <button onClick={() => removePersonalTag(selectedSong.id, tag)} style={s.removeTag}>×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="+ Add tag"
                    value={personalTagInput}
                    onChange={(e) => setPersonalTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && personalTagInput.trim()) {
                        addPersonalTag(selectedSong.id, personalTagInput.trim());
                        setPersonalTagInput('');
                      }
                    }}
                    style={{ ...s.input, width: '100px', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  />
                </div>
              </div>
            )}

            {/* Suggest Changes Button */}
            {user && (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  onClick={() => setShowSuggestModal(true)}
                  style={{ ...s.btnSec, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <i className="ti ti-bulb" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Suggest Changes
                </button>
              </div>
            )}

            {/* Tabs */}
            <div style={s.tabs}>
              <button style={s.tab(activeTab === 'lyrics')} onClick={() => setActiveTab('lyrics')}>Lyrics</button>
              <button style={s.tab(activeTab === 'info')} onClick={() => setActiveTab('info')}>Info</button>
              <button style={s.tab(activeTab === 'media')} onClick={() => setActiveTab('media')}>Media {songMedia.length > 0 && `(${songMedia.length})`}</button>
              <button style={s.tab(activeTab === 'notes')} onClick={() => setActiveTab('notes')}>Notes {songNotes.length > 0 && `(${songNotes.length})`}</button>
            </div>

            {/* Tab Content */}
            {activeTab === 'lyrics' && (
              <div>
                {versions.length > 0 ? (
                  <>
                    {/* Version selector */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.875rem', color: '#838C95' }}>Version:</span>
                      <select 
                        value={selectedVersionId || ''} 
                        onChange={(e) => setSelectedVersionId(e.target.value)}
                        style={{ ...s.select, minWidth: '200px' }}
                      >
                        {versions.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.label || 'Untitled'} 
                            {v.is_default_singalong ? ' ★' : ''}
                            {v.version_type === 'alternate' ? ' (alt)' : ''}
                          </option>
                        ))}
                      </select>
                      
                      {versions.length > 1 && (
                        <button 
                          style={compareMode ? s.btn : s.btnSec}
                          onClick={() => {
                            setCompareMode(!compareMode);
                            if (!compareMode && !compareVersionId) {
                              // Set compare to a different version
                              const other = versions.find(v => v.id !== selectedVersionId);
                              setCompareVersionId(other?.id || null);
                            }
                          }}
                        >
                          {compareMode ? <><i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Comparing</> : <><i className="ti ti-arrows-left-right" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Compare</>}
                        </button>
                      )}
                      
                      {compareMode && (
                        <select 
                          value={compareVersionId || ''} 
                          onChange={(e) => setCompareVersionId(e.target.value)}
                          style={{ ...s.select, minWidth: '200px' }}
                        >
                          {versions.filter(v => v.id !== selectedVersionId).map(v => (
                            <option key={v.id} value={v.id}>
                              {v.label || 'Untitled'}
                              {v.is_default_singalong ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Version display */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: compareMode ? '1fr 1fr' : '1fr', 
                      gap: '1rem' 
                    }}>
                      {/* Primary version */}
                      {(() => {
                        const v = versions.find(ver => ver.id === selectedVersionId) || versions[0];
                        const attrs = versionAttrs.filter(a => a.song_version_id === v?.id);
                        if (!v) return null;
                        return (
                          <div style={s.versionCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <span style={s.versionLabel}>{v.label || 'Version'}</span>
                                {v.version_type === 'alternate' && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#838C95' }}>(Alternate)</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {v.is_default_singalong && <span style={{ fontSize: '0.65rem', background: '#3B9B7333', color: '#3B9B73', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}><i className="ti ti-star" style={{ fontSize: '0.85em' }} aria-hidden="true"></i> Singalong</span>}
                                {v.is_default_explore && <span style={{ fontSize: '0.65rem', background: '#3B9B7333', color: '#3B9B73', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>Explore</span>}
                              </div>
                            </div>
                            
                            {/* Version attributes */}
                            {attrs.length > 0 && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {attrs.map(a => (
                                  <span key={a.id} style={{ fontSize: '0.7rem', background: '#334155', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                                    {VERSION_ATTRIBUTE_LABELS[a.attribute_type] || a.attribute_type}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Version familiarity - logged in users */}
                            {user && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#838C95' }}>How well I know this:</span>
                                <select
                                  value={versionPrefs[v.id]?.familiarity || ''}
                                  onChange={(e) => setVersionFamiliarity(v.id, e.target.value || null)}
                                  style={{ ...s.select, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                >
                                  <option value="">Not set</option>
                                  {familiarityOptions.map(opt => (
                                    <option key={opt.value_key} value={opt.value_key}>{opt.icon ? `${opt.icon} ` : ''}{opt.label}</option>
                                  ))}
                                </select>
                                {versionPrefs[v.id]?.familiarity && (
                                  <span style={{ 
                                    fontSize: '0.7rem', 
                                    padding: '0.2rem 0.5rem', 
                                    borderRadius: '0.25rem',
                                    background: `${familiarityOptions.find(o => o.value_key === versionPrefs[v.id]?.familiarity)?.color}20`,
                                    color: familiarityOptions.find(o => o.value_key === versionPrefs[v.id]?.familiarity)?.color
                                  }}>
                                    {familiarityOptions.find(o => o.value_key === versionPrefs[v.id]?.familiarity)?.icon} {familiarityOptions.find(o => o.value_key === versionPrefs[v.id]?.familiarity)?.label}
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {v.lyrics_content ? (
                              <div style={s.lyrics}>{v.lyrics_content}</div>
                            ) : (
                              <div style={{ color: '#838C95', fontStyle: 'italic', padding: '1rem' }}>No lyrics available for this version</div>
                            )}
                            
                            {v.version_notes && (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#838C95', padding: '0.5rem', background: '#1e293b', borderRadius: '0.25rem' }}>
                                <strong>Notes:</strong> {v.version_notes}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Compare version */}
                      {compareMode && (() => {
                        const v = versions.find(ver => ver.id === compareVersionId);
                        const attrs = versionAttrs.filter(a => a.song_version_id === v?.id);
                        if (!v) return <div style={s.versionCard}><p style={{ color: '#838C95' }}>Select a version to compare</p></div>;
                        return (
                          <div style={s.versionCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <span style={s.versionLabel}>{v.label || 'Version'}</span>
                                {v.version_type === 'alternate' && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#838C95' }}>(Alternate)</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {v.is_default_singalong && <span style={{ fontSize: '0.65rem', background: '#3B9B7333', color: '#3B9B73', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}><i className="ti ti-star" style={{ fontSize: '0.85em' }} aria-hidden="true"></i> Singalong</span>}
                                {v.is_default_explore && <span style={{ fontSize: '0.65rem', background: '#3B9B7333', color: '#3B9B73', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>Explore</span>}
                              </div>
                            </div>
                            
                            {attrs.length > 0 && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {attrs.map(a => (
                                  <span key={a.id} style={{ fontSize: '0.7rem', background: '#334155', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                                    {VERSION_ATTRIBUTE_LABELS[a.attribute_type] || a.attribute_type}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Version familiarity - logged in users */}
                            {user && (
                              <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: '#838C95' }}>How well I know this:</span>
                                <select
                                  value={versionPrefs[v.id]?.familiarity || ''}
                                  onChange={(e) => setVersionFamiliarity(v.id, e.target.value || null)}
                                  style={{ ...s.select, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                >
                                  <option value="">Not set</option>
                                  {familiarityOptions.map(opt => (
                                    <option key={opt.value_key} value={opt.value_key}>{opt.icon ? `${opt.icon} ` : ''}{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            
                            {v.lyrics_content ? (
                              <div style={s.lyrics}>{v.lyrics_content}</div>
                            ) : (
                              <div style={{ color: '#838C95', fontStyle: 'italic', padding: '1rem' }}>No lyrics available</div>
                            )}
                            
                            {v.version_notes && (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#838C95', padding: '0.5rem', background: '#1e293b', borderRadius: '0.25rem' }}>
                                <strong>Notes:</strong> {v.version_notes}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <div style={s.emptyState}>
                    <p>No versions yet</p>
                    {selectedSong.lyrics_text && (
                      <div style={{ ...s.lyrics, marginTop: '1rem', maxWidth: '600px' }}>{selectedSong.lyrics_text}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'info' && (
              <div>
                {/* Basic info */}
                <div style={{ marginBottom: '1rem' }}>
                  {selectedSong.author && <div style={s.infoRow}><span style={s.infoLabel}>Author:</span> {selectedSong.author}</div>}
                  {selectedSong.composer && <div style={s.infoRow}><span style={s.infoLabel}>Composer:</span> {selectedSong.composer}</div>}
                  {selectedSong.origin && <div style={s.infoRow}><span style={s.infoLabel}>Origin:</span> {selectedSong.origin}</div>}
                  {selectedSong.year_written && <div style={s.infoRow}><span style={s.infoLabel}>Year:</span> {selectedSong.year_written}</div>}
                  {selectedSong.tune_of && <div style={s.infoRow}><span style={s.infoLabel}>Tune of:</span> {selectedSong.tune_of}</div>}
                  {selectedSong.original_language && <div style={s.infoRow}><span style={s.infoLabel}>Language:</span> {selectedSong.original_language}</div>}
                </div>

                {/* Personal Tags (for logged-in users) */}
                {user && pref?.personal_tags && pref.personal_tags.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#838C95', marginBottom: '0.5rem' }}><i className="ti ti-tag" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Your Personal Tags</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {pref.personal_tags.map(tag => (
                        <span key={tag} style={{ 
                          background: '#3B9B7320', 
                          color: '#3B9B73',
                          border: '1px solid #3B9B7340',
                          padding: '0.25rem 0.5rem', 
                          borderRadius: '0.25rem', 
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          {tag}
                          <button
                            onClick={() => removePersonalTag(selectedSong.id, tag)}
                            style={{ background: 'none', border: 'none', color: '#3B9B73', cursor: 'pointer', padding: 0, fontSize: '0.9rem' }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedSong.author && !selectedSong.composer && !selectedSong.origin && 
                 !selectedSong.year_written && !selectedSong.tune_of && !selectedSong.original_language && (
                  <div style={s.emptyState}>No additional info available yet</div>
                )}
              </div>
            )}

            {activeTab === 'media' && (
              <div>
                {songMedia.length > 0 ? (
                  songMedia.map(m => (
                    <div key={m.id} style={{ marginBottom: '1.5rem' }}>
                      {(m.label || m.title) && <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{m.label || m.title}</div>}
                      {m.description && <div style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.5rem' }}>{m.description}</div>}
                      {renderMedia(m)}
                    </div>
                  ))
                ) : (
                  <div style={s.emptyState}>No media available</div>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div>
                {songNotes.length > 0 ? (
                  songNotes.map(n => (
                    <div key={n.id} style={{ padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                      {n.note_type && <span style={{ fontSize: '0.7rem', color: '#838C95', textTransform: 'uppercase' }}>{n.note_type}</span>}
                      <div style={{ marginTop: '0.25rem' }}>{n.note}</div>
                    </div>
                  ))
                ) : (
                  <div style={s.emptyState}>No notes available</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state when no song selected */}
        {!selectedSong && (
          <div style={{ ...s.main, ...s.emptyState }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}><i className="ti ti-music" style={{ fontSize: '1em' }} aria-hidden="true"></i></div>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Select a song</div>
            <div>Click a song from the list to view details</div>
          </div>
        )}
      </div>

      {/* Suggestion Modal */}
      {showSuggestModal && selectedSong && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
            width: '100%',
            maxWidth: suggestExpanded ? '900px' : '500px',
            maxHeight: suggestExpanded ? '90vh' : '80vh',
            overflow: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontWeight: 'bold', fontSize: '1.25rem' }}><i className="ti ti-bulb" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Suggest Changes</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setSuggestExpanded(!suggestExpanded)} style={s.btnSec}>
                  {suggestExpanded ? '⊟ Compact' : '⊞ Expand'}
                </button>
                <button onClick={() => { setShowSuggestModal(false); setSuggestType(''); }} style={s.btnSec}>×</button>
              </div>
            </div>

            <p style={{ color: '#838C95', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Suggesting changes for: <strong style={{ color: '#fff' }}>{selectedSong.title}</strong>
            </p>

            {!suggestType ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button onClick={() => setSuggestType('new_version')} style={{ ...s.btnSec, textAlign: 'left', padding: '1rem' }}>
                  <i className="ti ti-file-text" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> <strong>Add New Version</strong>
                  <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.25rem' }}>Different lyrics, alternate version, camp-specific adaptation</div>
                </button>
                <button onClick={() => setSuggestType('edit_info')} style={{ ...s.btnSec, textAlign: 'left', padding: '1rem' }}>
                  <i className="ti ti-edit" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> <strong>Edit Song Info</strong>
                  <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.25rem' }}>Fix author, composer, origin, year, or other details</div>
                </button>
                <button onClick={() => setSuggestType('add_media')} style={{ ...s.btnSec, textAlign: 'left', padding: '1rem' }}>
                  <i className="ti ti-movie" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> <strong>Add Media Link</strong>
                  <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.25rem' }}>YouTube video, Spotify track, or other recording</div>
                </button>
                <button onClick={() => setSuggestType('add_note')} style={{ ...s.btnSec, textAlign: 'left', padding: '1rem' }}>
                  <i className="ti ti-notes" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> <strong>Add Note</strong>
                  <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.25rem' }}>History, teaching tips, motions, or other context</div>
                </button>
                <button onClick={() => setSuggestType('add_alias')} style={{ ...s.btnSec, textAlign: 'left', padding: '1rem' }}>
                  <i className="ti ti-tag" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> <strong>Add Alternate Name</strong>
                  <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.25rem' }}>Other names this song is known by</div>
                </button>
                <button onClick={() => setSuggestType('add_flag')} style={{ ...s.btnSec, textAlign: 'left', padding: '1rem' }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> <strong>Flag an Issue</strong>
                  <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.25rem' }}>Content warning, sensitivity note, or other flag</div>
                </button>
                
                {/* Suggest multiple link */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                  <Link 
                    href={`/suggest?song_id=${selectedSong.id}`}
                    style={{ 
                      color: '#838C95', 
                      fontSize: '0.875rem',
                      textDecoration: 'underline',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <i className="ti ti-notes" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Need to suggest multiple things? Use the full form →
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <button onClick={() => { setSuggestType(''); resetSuggestForm(); }} style={{ ...s.btnSec, marginBottom: '1rem', fontSize: '0.8rem' }}>
                  ← Back to options
                </button>

                {/* NEW VERSION FORM */}
                {suggestType === 'new_version' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Version Label *</label>
                      <input type="text" value={suggestVersionLabel} onChange={(e) => setSuggestVersionLabel(e.target.value)} placeholder="e.g., Camp Tawonga version, Gender-neutral version" style={s.input} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Lyrics</label>
                      <textarea value={suggestLyrics} onChange={(e) => setSuggestLyrics(e.target.value)} placeholder="Paste the lyrics here..." style={{ ...s.input, minHeight: '200px', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                )}

                {/* EDIT INFO FORM */}
                {suggestType === 'edit_info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>What needs editing?</label>
                      <select value={suggestEditField} onChange={(e) => setSuggestEditField(e.target.value)} style={s.select}>
                        <option value="author">Author</option>
                        <option value="composer">Composer</option>
                        <option value="origin">Origin</option>
                        <option value="year_written">Year Written</option>
                        <option value="tune_of">Tune Of</option>
                        <option value="lyrics">Lyrics (correction)</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Suggested Value *</label>
                      <textarea value={suggestEditValue} onChange={(e) => setSuggestEditValue(e.target.value)} placeholder="What it should say..." style={{ ...s.input, minHeight: '80px' }} />
                    </div>
                  </div>
                )}

                {/* ADD MEDIA FORM */}
                {suggestType === 'add_media' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Media Type</label>
                      <select value={suggestMediaType} onChange={(e) => setSuggestMediaType(e.target.value)} style={s.select}>
                        <option value="youtube">YouTube</option>
                        <option value="spotify">Spotify</option>
                        <option value="soundcloud">SoundCloud</option>
                        <option value="audio">Other Audio</option>
                        <option value="video">Other Video</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>URL *</label>
                      <input type="text" value={suggestMediaUrl} onChange={(e) => setSuggestMediaUrl(e.target.value)} placeholder="https://..." style={s.input} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Label (optional)</label>
                      <input type="text" value={suggestMediaLabel} onChange={(e) => setSuggestMediaLabel(e.target.value)} placeholder="e.g., Official recording, Live at camp 2023" style={s.input} />
                    </div>
                  </div>
                )}

                {/* ADD NOTE FORM */}
                {suggestType === 'add_note' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Note Type</label>
                      <select value={suggestNoteType} onChange={(e) => setSuggestNoteType(e.target.value)} style={s.select}>
                        <option value="history">History/Background</option>
                        <option value="teaching">Teaching Tips</option>
                        <option value="motions">Motions/Actions</option>
                        <option value="performance">Performance Notes</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Note Content *</label>
                      <textarea value={suggestNoteContent} onChange={(e) => setSuggestNoteContent(e.target.value)} placeholder="Share your knowledge..." style={{ ...s.input, minHeight: '120px' }} />
                    </div>
                  </div>
                )}

                {/* ADD ALIAS FORM */}
                {suggestType === 'add_alias' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Alternate Name *</label>
                      <input type="text" value={suggestAlias} onChange={(e) => setSuggestAlias(e.target.value)} placeholder="What else is this song called?" style={s.input} />
                    </div>
                  </div>
                )}

                {/* ADD FLAG FORM */}
                {suggestType === 'add_flag' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Flag Type</label>
                      <select value={suggestFlagType} onChange={(e) => setSuggestFlagType(e.target.value)} style={s.select}>
                        <option value="content_warning">Content Warning</option>
                        <option value="cultural_sensitivity">Cultural Sensitivity</option>
                        <option value="outdated_language">Outdated Language</option>
                        <option value="historical_context">Needs Historical Context</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Description *</label>
                      <textarea value={suggestFlagNotes} onChange={(e) => setSuggestFlagNotes(e.target.value)} placeholder="Describe the issue or concern..." style={{ ...s.input, minHeight: '100px' }} />
                    </div>
                  </div>
                )}

                {/* SOURCE URL (common to all) */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Where did you find this info? (optional)</label>
                  <input type="text" value={suggestSourceUrl} onChange={(e) => setSuggestSourceUrl(e.target.value)} placeholder="Link to Wikipedia, camp website, etc." style={s.input} />
                </div>

                {/* REASON (common to all) */}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#838C95', marginBottom: '0.25rem', display: 'block' }}>Additional context (optional)</label>
                  <textarea value={suggestReason} onChange={(e) => setSuggestReason(e.target.value)} placeholder="Anything else you want to share..." style={{ ...s.input, minHeight: '60px' }} />
                </div>

                {/* SUBMIT BUTTON */}
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={submitSuggestion} 
                    disabled={suggestSubmitting}
                    style={{ 
                      background: suggestSubmitting ? '#334155' : '#3B9B73', 
                      color: '#fff', 
                      padding: '0.75rem 1.5rem', 
                      borderRadius: '0.5rem', 
                      border: 'none',
                      cursor: suggestSubmitting ? 'not-allowed' : 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {suggestSubmitting ? 'Submitting...' : 'Submit Suggestion'}
                  </button>
                  <Link 
                    href={`/suggest?song_id=${selectedSong.id}&type=${suggestType}`}
                    style={{ 
                      color: '#838C95', 
                      padding: '0.75rem', 
                      fontSize: '0.8rem',
                      textDecoration: 'underline'
                    }}
                  >
                    Open full form instead
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
