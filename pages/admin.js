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

const NOTE_TYPES = [
  { value: 'round_instruction', label: 'Round Instructions' },
  { value: 'performance_instruction', label: 'Performance Tips' },
  { value: 'history', label: 'History' },
  { value: 'pronunciation', label: 'Pronunciation' },
  { value: 'call_response_structure', label: 'Call & Response' },
  { value: 'accompaniment', label: 'Accompaniment' },
  { value: 'fill_in_blank', label: 'Fill in the Blank' },
  { value: 'alternate_verse_info', label: 'Alternate Verses' },
  { value: 'other', label: 'Other Notes' }
];

const GROUP_TYPES = [
  { value: 'round_group', label: 'Round Group' },
  { value: 'medley', label: 'Medley' },
  { value: 'mashup', label: 'Mashup' },
  { value: 'other', label: 'Other' }
];

const MEMBER_ROLES = [
  { value: 'default', label: 'Default' },
  { value: 'optional', label: 'Optional' },
  { value: 'alternate', label: 'Alternate' }
];

export default function Admin() {
  // Auth state
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  const [sessionName, setSessionName] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('camp_admin_name') || '';
    return '';
  });
  const [mainTab, setMainTab] = useState('songs');
  const [allSongs, setAllSongs] = useState([]);
  const [songVersions, setSongVersions] = useState([]);
  const [songNotes, setSongNotes] = useState([]);
  const [songSections, setSongSections] = useState([]);
  const [songAliases, setSongAliases] = useState([]);
  const [songGroups, setSongGroups] = useState([]);
  const [songGroupMembers, setSongGroupMembers] = useState([]);
  const [songbookEntries, setSongbookEntries] = useState([]);
  const [songbooks, setSongbooks] = useState([]);
  const [songbookSections, setSongbookSections] = useState([]);
  const [changeLog, setChangeLog] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [selectedSong, setSelectedSong] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [songEditTab, setSongEditTab] = useState('basic');
  const [groupEditTab, setGroupEditTab] = useState('info');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isAddingNewGroup, setIsAddingNewGroup] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formPage, setFormPage] = useState('');
  const [formOldPage, setFormOldPage] = useState('');
  const [formSection, setFormSection] = useState('A');
  const [formYearWritten, setFormYearWritten] = useState('');
  const [formLyrics, setFormLyrics] = useState('');

  const [editingNote, setEditingNote] = useState(null);
  const [noteType, setNoteType] = useState('round_instruction');
  const [noteContent, setNoteContent] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newSecondarySection, setNewSecondarySection] = useState('');
  const [newSecondaryPage, setNewSecondaryPage] = useState('');

  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupType, setFormGroupType] = useState('round_group');
  const [formGroupInstructions, setFormGroupInstructions] = useState('');
  const [formGroupRequestable, setFormGroupRequestable] = useState(true);
  const [formGroupPage, setFormGroupPage] = useState('');
  const [formGroupSection, setFormGroupSection] = useState('S');
  const [formGroupOldPage, setFormGroupOldPage] = useState('');

  const [editingMember, setEditingMember] = useState(null);
  const [memberSongId, setMemberSongId] = useState('');
  const [memberPosition, setMemberPosition] = useState(1);
  const [memberRole, setMemberRole] = useState('default');
  const [memberFragmentLyrics, setMemberFragmentLyrics] = useState('');
  const [memberInstructions, setMemberInstructions] = useState('');

  const [logTableFilter, setLogTableFilter] = useState('all');
  const [logUserFilter, setLogUserFilter] = useState('');
  const [logLimit, setLogLimit] = useState(100);

  // Songbook entry editing (for songs)
  const [editingSongbookEntry, setEditingSongbookEntry] = useState(null);
  const [entrySongbookId, setEntrySongbookId] = useState('');
  const [entrySection, setEntrySection] = useState('');
  const [entryPage, setEntryPage] = useState('');
  
  // Songbook management
  const [selectedSongbook, setSelectedSongbook] = useState(null);
  const [isAddingNewSongbook, setIsAddingNewSongbook] = useState(false);
  const [formSongbookName, setFormSongbookName] = useState('');
  const [formSongbookShortName, setFormSongbookShortName] = useState('');
  const [formSongbookDescription, setFormSongbookDescription] = useState('');
  const [formSongbookHasSections, setFormSongbookHasSections] = useState(false);
  const [formSongbookIsPrimary, setFormSongbookIsPrimary] = useState(false);
  const [formSongbookDisplayOrder, setFormSongbookDisplayOrder] = useState(10);

  // Additional song metadata
  const [formAuthor, setFormAuthor] = useState('');
  const [formComposer, setFormComposer] = useState('');
  const [formOrigin, setFormOrigin] = useState('');
  const [formOriginalLanguage, setFormOriginalLanguage] = useState('');
  const [formTuneOf, setFormTuneOf] = useState('');

  // Song media
  const [songMedia, setSongMedia] = useState([]);
  const [editingMedia, setEditingMedia] = useState(null);
  const [mediaType, setMediaType] = useState('youtube');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDescription, setMediaDescription] = useState('');
  const [mediaDisplayExplore, setMediaDisplayExplore] = useState(true);
  const [mediaDisplaySingalong, setMediaDisplaySingalong] = useState(false);

  // Song versions
  const [versionAttributes, setVersionAttributes] = useState([]);
  const [editingVersion, setEditingVersion] = useState(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionType, setVersionType] = useState('canonical');
  const [versionLyrics, setVersionLyrics] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [versionIsDefaultSingalong, setVersionIsDefaultSingalong] = useState(false);
  const [versionIsDefaultExplore, setVersionIsDefaultExplore] = useState(false);
  const [versionSelectedAttributes, setVersionSelectedAttributes] = useState([]);

  // Song flags
  const [songFlags, setSongFlags] = useState([]);
  const [editingFlag, setEditingFlag] = useState(null);
  const [flagType, setFlagType] = useState('problematic_content');
  const [flagExplanation, setFlagExplanation] = useState('');

  // Potential duplicates
  const [potentialDuplicates, setPotentialDuplicates] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateSearchTerm, setDuplicateSearchTerm] = useState('');
  const [selectedDuplicateOf, setSelectedDuplicateOf] = useState(null);
  const [duplicateNotes, setDuplicateNotes] = useState('');
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [duplicateStatusFilter, setDuplicateStatusFilter] = useState('pending');
  const [mergePrimarySongId, setMergePrimarySongId] = useState(null);

  const [userProfile, setUserProfile] = useState(null);

  // Check auth on load
  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { if (userProfile?.role === 'admin') loadAllData(); }, [userProfile]);
  useEffect(() => { if (sessionName) localStorage.setItem('camp_admin_name', sessionName); }, [sessionName]);

  const checkAuthSession = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { setAuthChecked(true); return; }
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
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
      setShowAuthModal(false);
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

  const loadAllData = async () => {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
      const [songsRes, versionsRes, versionAttrsRes, notesRes, sectionsRes, aliasesRes, groupsRes, membersRes, entriesRes, songbooksRes, songbookSectionsRes, mediaRes, flagsRes, duplicatesRes, logRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_version_attributes?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_notes?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_sections?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_aliases?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_groups?select=*&order=group_name.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_group_members?select=*&order=position_in_group.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/songbooks?select=*&order=display_order.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/songbook_sections?select=*&order=display_order.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_media?select=*&order=display_order.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_flags?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/potential_duplicates?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/change_log?select=*&order=created_at.desc&limit=${logLimit}`, { headers })
      ]);
      setAllSongs(await songsRes.json());
      setSongVersions(await versionsRes.json());
      setVersionAttributes(await versionAttrsRes.json());
      setSongNotes(await notesRes.json());
      setSongSections(await sectionsRes.json());
      setSongAliases(await aliasesRes.json());
      setSongGroups(await groupsRes.json());
      setSongGroupMembers(await membersRes.json());
      setSongbookEntries(await entriesRes.json());
      setSongbooks(await songbooksRes.json());
      setSongbookSections(await songbookSectionsRes.json());
      setSongMedia(await mediaRes.json());
      setSongFlags(await flagsRes.json());
      setPotentialDuplicates(await duplicatesRes.json());
      setChangeLog(await logRes.json());
    } catch (error) { console.error('Error loading data:', error); }
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const logChange = async (action, tableName, recordId, recordTitle, fieldChanged = null, oldValue = null, newValue = null) => {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      await fetch(`${SUPABASE_URL}/rest/v1/change_log`, {
        method: 'POST', headers,
        body: JSON.stringify({ action, table_name: tableName, song_id: tableName === 'songs' ? recordId : null, song_title: recordTitle, field_changed: fieldChanged, old_value: oldValue ? String(oldValue).substring(0, 500) : null, new_value: newValue ? String(newValue).substring(0, 500) : null, changed_by: sessionName || 'unknown' })
      });
    } catch (error) { console.error('Logging Error:', error); }
  };

  const getDefaultVersion = (songId) => songVersions.find(v => v.song_id === songId && v.is_default_singalong) || songVersions.find(v => v.song_id === songId);
  
  // Get page info for a song from songbook entries
  const getSongPage = (songId) => {
    const primarySongbook = songbooks.find(sb => sb.is_primary);
    const primaryEntry = songbookEntries.find(e => e.song_id === songId && e.songbook_id === primarySongbook?.id);
    const oldSongbook = songbooks.find(sb => sb.display_order === 2);
    const oldEntry = songbookEntries.find(e => e.song_id === songId && e.songbook_id === oldSongbook?.id);
    return { page: primaryEntry?.page || null, section: primaryEntry?.section || null, old_page: oldEntry?.page || null };
  };
  
  // Get all songbook entries for a song
  const getSongSongbookEntries = (songId) => songbookEntries.filter(e => e.song_id === songId);
  
  // Get sections for a specific songbook
  const getSongbookSections = (songbookId) => songbookSections.filter(s => s.songbook_id === songbookId).sort((a, b) => a.display_order - b.display_order);
  
  const getSongNotes = (songId) => songNotes.filter(n => n.song_id === songId);
  const getSongSections = (songId) => songSections.filter(s => s.song_id === songId);
  const getSongAliases = (songId) => songAliases.filter(a => a.song_id === songId);
  const getSongGroups = (songId) => songGroupMembers.filter(m => m.song_id === songId).map(m => songGroups.find(g => g.id === m.group_id)).filter(Boolean);
  const getGroupMembers = (groupId) => songGroupMembers.filter(m => m.group_id === groupId).sort((a, b) => a.position_in_group - b.position_in_group);
  const getGroupPage = (groupId) => songbookEntries.find(e => e.song_group_id === groupId);
  const getSongMedia = (songId) => songMedia.filter(m => m.song_id === songId);

  const selectSong = (song) => {
    setSelectedSong(song); setSelectedGroup(null); setIsAddingNew(false);
    const pageInfo = getSongPage(song.id);
    setFormTitle(song.title); 
    setFormPage(pageInfo.page || song.page || ''); 
    setFormOldPage(pageInfo.old_page || song.old_page || '');
    setFormSection(pageInfo.section || song.section || 'A'); 
    setFormYearWritten(song.year_written || '');
    setFormAuthor(song.author || '');
    setFormComposer(song.composer || '');
    setFormOrigin(song.origin || '');
    setFormOriginalLanguage(song.original_language || '');
    setFormTuneOf(song.tune_of || '');
    setFormLyrics(getDefaultVersion(song.id)?.lyrics_content || ''); 
    setSongEditTab('basic');
    setEditingMedia(null);
  };

  const startAddNewSong = () => {
    setSelectedSong(null); setSelectedGroup(null); setIsAddingNew(true);
    setFormTitle(''); setFormPage(''); setFormOldPage(''); setFormSection('A'); setFormYearWritten(''); 
    setFormAuthor(''); setFormComposer(''); setFormOrigin(''); setFormOriginalLanguage(''); setFormTuneOf('');
    setFormLyrics(''); setSongEditTab('basic');
  };

  const cancelSongEdit = () => { setSelectedSong(null); setIsAddingNew(false); };

  const saveSongBasic = async () => {
    if (!sessionName.trim()) { showMessage('❌ Please enter your name first'); return; }
    if (!formTitle.trim()) { showMessage('❌ Title is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      // Song data (title, year, and metadata - page/section goes to songbook_entries)
      const songData = { 
        title: formTitle.trim(), 
        year_written: formYearWritten ? parseInt(formYearWritten) : null,
        author: formAuthor.trim() || null,
        composer: formComposer.trim() || null,
        origin: formOrigin.trim() || null,
        original_language: formOriginalLanguage.trim() || null,
        tune_of: formTuneOf.trim() || null
      };
      
      if (isAddingNew) {
        // Create the song first
        const response = await fetch(`${SUPABASE_URL}/rest/v1/songs`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify({ ...songData, section: formSection, page: formPage.trim() || null, old_page: formOldPage.trim() || null }) });
        if (response.ok) { 
          const created = await response.json(); 
          const newSongId = created[0].id;
          
          // Create songbook entry for primary songbook (2025)
          const primarySongbook = songbooks.find(sb => sb.is_primary);
          if (primarySongbook && (formPage.trim() || formSection)) {
            await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_id: newSongId, songbook_id: primarySongbook.id, section: formSection, page: formPage.trim() || null }) });
          }
          
          // Create songbook entry for old songbook if old_page provided
          const oldSongbook = songbooks.find(sb => sb.display_order === 2);
          if (oldSongbook && formOldPage.trim()) {
            await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_id: newSongId, songbook_id: oldSongbook.id, section: formSection, page: formOldPage.trim() }) });
          }
          
          await logChange('add', 'songs', newSongId, created[0].title); 
          showMessage('✅ Song added!'); 
          setIsAddingNew(false); 
          await loadAllData(); 
          selectSong(created[0]); 
        }
      } else {
        // Log changes
        if (selectedSong.title !== songData.title) await logChange('edit', 'songs', selectedSong.id, songData.title, 'title', selectedSong.title, songData.title);
        if (selectedSong.year_written !== songData.year_written) await logChange('edit', 'songs', selectedSong.id, songData.title, 'year_written', selectedSong.year_written, songData.year_written);
        if (selectedSong.author !== songData.author) await logChange('edit', 'songs', selectedSong.id, songData.title, 'author', selectedSong.author, songData.author);
        if (selectedSong.origin !== songData.origin) await logChange('edit', 'songs', selectedSong.id, songData.title, 'origin', selectedSong.origin, songData.origin);
        
        // Update songs table (also keep section/page for backward compatibility during transition)
        await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${selectedSong.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ ...songData, section: formSection, page: formPage.trim() || null, old_page: formOldPage.trim() || null }) });
        
        // Update/create primary songbook entry
        const primarySongbook = songbooks.find(sb => sb.is_primary);
        if (primarySongbook) {
          const existingPrimaryEntry = songbookEntries.find(e => e.song_id === selectedSong.id && e.songbook_id === primarySongbook.id);
          if (existingPrimaryEntry) {
            await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?id=eq.${existingPrimaryEntry.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ section: formSection, page: formPage.trim() || null }) });
          } else if (formPage.trim() || formSection) {
            await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_id: selectedSong.id, songbook_id: primarySongbook.id, section: formSection, page: formPage.trim() || null }) });
          }
        }
        
        // Update/create old songbook entry
        const oldSongbook = songbooks.find(sb => sb.display_order === 2);
        if (oldSongbook) {
          const existingOldEntry = songbookEntries.find(e => e.song_id === selectedSong.id && e.songbook_id === oldSongbook.id);
          if (existingOldEntry) {
            if (formOldPage.trim()) {
              await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?id=eq.${existingOldEntry.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ page: formOldPage.trim() }) });
            } else {
              // Remove entry if old_page is cleared
              await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?id=eq.${existingOldEntry.id}`, { method: 'DELETE', headers });
            }
          } else if (formOldPage.trim()) {
            await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_id: selectedSong.id, songbook_id: oldSongbook.id, section: formSection, page: formOldPage.trim() }) });
          }
        }
        
        showMessage('✅ Song updated!'); 
        await loadAllData(); 
        setSelectedSong({ ...selectedSong, ...songData, section: formSection, page: formPage.trim() || null, old_page: formOldPage.trim() || null });
      }
    } catch (error) { console.error(error); showMessage('❌ Error saving'); }
    setSaving(false);
  };

  const saveSongLyrics = async () => {
    if (!sessionName.trim()) { showMessage('❌ Please enter your name first'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const existingVersion = getDefaultVersion(selectedSong.id);
      if (existingVersion) {
        await fetch(`${SUPABASE_URL}/rest/v1/song_versions?id=eq.${existingVersion.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ lyrics_content: formLyrics.trim() || null }) });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/song_versions`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_id: selectedSong.id, version_type: 'canonical', label: 'Original', lyrics_content: formLyrics.trim() || null, is_default_singalong: true, is_default_explore: true, created_by: sessionName }) });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${selectedSong.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ has_lyrics: formLyrics.trim().length > 0 }) });
      await logChange('edit', 'song_versions', selectedSong.id, selectedSong.title, 'lyrics', existingVersion?.lyrics_content ? '[had lyrics]' : '[no lyrics]', formLyrics.trim() ? '[has lyrics]' : '[no lyrics]');
      showMessage('✅ Lyrics saved!'); await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving lyrics'); }
    setSaving(false);
  };

  const startAddNote = () => { setEditingNote({ isNew: true }); setNoteType('round_instruction'); setNoteContent(''); };
  const startEditNote = (note) => { setEditingNote(note); setNoteType(note.note_type); setNoteContent(note.note_content); };
  const cancelNoteEdit = () => { setEditingNote(null); };

  const saveNote = async () => {
    if (!noteContent.trim()) { showMessage('❌ Note content is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    try {
      if (editingNote.isNew) {
        await fetch(`${SUPABASE_URL}/rest/v1/song_notes`, { method: 'POST', headers, body: JSON.stringify({ song_id: selectedSong.id, note_type: noteType, note_content: noteContent.trim(), created_by: sessionName }) });
        await logChange('add', 'song_notes', selectedSong.id, selectedSong.title, noteType, null, noteContent.trim());
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/song_notes?id=eq.${editingNote.id}`, { method: 'PATCH', headers, body: JSON.stringify({ note_type: noteType, note_content: noteContent.trim() }) });
        await logChange('edit', 'song_notes', selectedSong.id, selectedSong.title, noteType, editingNote.note_content, noteContent.trim());
      }
      showMessage('✅ Note saved!'); cancelNoteEdit(); await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving note'); }
    setSaving(false);
  };

  const deleteNote = async (note) => {
    if (!confirm('Delete this note?')) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_notes?id=eq.${note.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'song_notes', selectedSong.id, selectedSong.title, note.note_type, note.note_content, null);
      showMessage('✅ Note deleted'); await loadAllData();
    } catch (error) { showMessage('❌ Error deleting'); }
  };

  const addAlias = async () => {
    if (!newAlias.trim()) return;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_aliases`, { method: 'POST', headers, body: JSON.stringify({ song_id: selectedSong.id, alias_title: newAlias.trim() }) });
      await logChange('add', 'song_aliases', selectedSong.id, selectedSong.title, 'alias', null, newAlias.trim());
      setNewAlias(''); showMessage('✅ Alias added!'); await loadAllData();
    } catch (error) { showMessage('❌ Error adding alias'); }
  };

  const deleteAlias = async (alias) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_aliases?id=eq.${alias.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'song_aliases', selectedSong.id, selectedSong.title, 'alias', alias.alias_title, null);
      showMessage('✅ Alias removed'); await loadAllData();
    } catch (error) { showMessage('❌ Error removing alias'); }
  };

  const addSecondarySection = async () => {
    if (!newSecondarySection) return;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_sections`, { method: 'POST', headers, body: JSON.stringify({ song_id: selectedSong.id, section: newSecondarySection, is_primary: false, page: newSecondaryPage.trim() || null }) });
      await logChange('add', 'song_sections', selectedSong.id, selectedSong.title, 'secondary_section', null, newSecondarySection);
      setNewSecondarySection(''); setNewSecondaryPage(''); showMessage('✅ Section added!'); await loadAllData();
    } catch (error) { showMessage('❌ Error adding section'); }
  };

  const deleteSecondarySection = async (section) => {
    if (section.is_primary) { showMessage('❌ Cannot delete primary section'); return; }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_sections?id=eq.${section.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'song_sections', selectedSong.id, selectedSong.title, 'secondary_section', section.section, null);
      showMessage('✅ Section removed'); await loadAllData();
    } catch (error) { showMessage('❌ Error removing section'); }
  };

  // Songbook entry management for songs
  const startAddSongbookEntry = () => {
    setEditingSongbookEntry({ isNew: true });
    setEntrySongbookId('');
    setEntrySection('');
    setEntryPage('');
  };

  const startEditSongbookEntry = (entry) => {
    setEditingSongbookEntry(entry);
    setEntrySongbookId(entry.songbook_id);
    setEntrySection(entry.section || '');
    setEntryPage(entry.page || '');
  };

  const cancelSongbookEntryEdit = () => setEditingSongbookEntry(null);

  const saveSongbookEntry = async () => {
    if (!entrySongbookId) { showMessage('❌ Please select a songbook'); return; }
    if (!entryPage.trim()) { showMessage('❌ Page is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const entryData = { song_id: selectedSong.id, songbook_id: entrySongbookId, section: entrySection || null, page: entryPage.trim() };
      if (editingSongbookEntry.isNew) {
        // Check for duplicate
        if (songbookEntries.some(e => e.song_id === selectedSong.id && e.songbook_id === entrySongbookId)) {
          showMessage('❌ Entry already exists for this songbook'); setSaving(false); return;
        }
        await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(entryData) });
        const sb = songbooks.find(s => s.id === entrySongbookId);
        await logChange('add', 'song_songbook_entries', selectedSong.id, selectedSong.title, 'songbook_entry', null, `${sb?.short_name}: ${entryPage.trim()}`);
        showMessage('✅ Songbook entry added!');
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?id=eq.${editingSongbookEntry.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(entryData) });
        await logChange('edit', 'song_songbook_entries', selectedSong.id, selectedSong.title, 'songbook_entry', editingSongbookEntry.page, entryPage.trim());
        showMessage('✅ Songbook entry updated!');
      }
      setEditingSongbookEntry(null); await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving entry'); }
    setSaving(false);
  };

  const deleteSongbookEntry = async (entry) => {
    if (!confirm('Delete this songbook entry?')) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?id=eq.${entry.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      const sb = songbooks.find(s => s.id === entry.songbook_id);
      await logChange('delete', 'song_songbook_entries', selectedSong.id, selectedSong.title, 'songbook_entry', `${sb?.short_name}: ${entry.page}`, null);
      showMessage('✅ Entry deleted'); await loadAllData();
    } catch (error) { showMessage('❌ Error deleting entry'); }
  };

  // Songbook management
  const selectSongbook = (songbook) => {
    setSelectedSongbook(songbook); setIsAddingNewSongbook(false);
    setFormSongbookName(songbook.name || '');
    setFormSongbookShortName(songbook.short_name || '');
    setFormSongbookDescription(songbook.description || '');
    setFormSongbookHasSections(songbook.has_sections || false);
    setFormSongbookIsPrimary(songbook.is_primary || false);
    setFormSongbookDisplayOrder(songbook.display_order || 10);
  };

  const startAddNewSongbook = () => {
    setSelectedSongbook(null); setIsAddingNewSongbook(true);
    setFormSongbookName(''); setFormSongbookShortName(''); setFormSongbookDescription('');
    setFormSongbookHasSections(false); setFormSongbookIsPrimary(false);
    setFormSongbookDisplayOrder(songbooks.length + 1);
  };

  const cancelSongbookEdit = () => { setSelectedSongbook(null); setIsAddingNewSongbook(false); };

  const saveSongbook = async () => {
    if (!sessionName.trim()) { showMessage('❌ Please enter your name first'); return; }
    if (!formSongbookName.trim()) { showMessage('❌ Name is required'); return; }
    if (!formSongbookShortName.trim()) { showMessage('❌ Short name is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const data = { 
        name: formSongbookName.trim(), 
        short_name: formSongbookShortName.trim(), 
        description: formSongbookDescription.trim() || null,
        has_sections: formSongbookHasSections,
        is_primary: formSongbookIsPrimary,
        display_order: parseInt(formSongbookDisplayOrder) || 10
      };
      if (isAddingNewSongbook) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/songbooks`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify(data) });
        if (response.ok) { 
          const created = await response.json(); 
          await logChange('add', 'songbooks', null, created[0].name);
          showMessage('✅ Songbook created!'); 
          setIsAddingNewSongbook(false); 
          await loadAllData(); 
          selectSongbook(created[0]); 
        }
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/songbooks?id=eq.${selectedSongbook.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(data) });
        await logChange('edit', 'songbooks', null, data.name, 'songbook', selectedSongbook.name, data.name);
        showMessage('✅ Songbook updated!'); 
        await loadAllData();
        setSelectedSongbook({ ...selectedSongbook, ...data });
      }
    } catch (error) { console.error(error); showMessage('❌ Error saving songbook'); }
    setSaving(false);
  };

  const deleteSongbook = async () => {
    if (!confirm(`Delete "${selectedSongbook.name}"? This will also delete all song entries for this songbook.`)) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/songbooks?id=eq.${selectedSongbook.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'songbooks', null, selectedSongbook.name);
      showMessage('✅ Songbook deleted'); 
      setSelectedSongbook(null);
      await loadAllData();
    } catch (error) { showMessage('❌ Error deleting songbook'); }
  };

  // Media management
  const MEDIA_TYPES = [
    { value: 'youtube', label: 'YouTube' },
    { value: 'vimeo', label: 'Vimeo' },
    { value: 'apple_music', label: 'Apple Music' },
    { value: 'spotify', label: 'Spotify' },
    { value: 'soundcloud', label: 'SoundCloud' },
    { value: 'audio_file', label: 'Audio File' },
    { value: 'pdf', label: 'PDF (Sheet Music)' },
    { value: 'musicxml', label: 'MusicXML' },
    { value: 'musescore', label: 'MuseScore' },
    { value: 'imslp', label: 'IMSLP' },
    { value: 'flat_io', label: 'Flat.io' },
    { value: 'noteflight', label: 'Noteflight' },
    { value: 'external_link', label: 'Other Link' }
  ];

  const startAddMedia = () => {
    setEditingMedia({ isNew: true });
    setMediaType('youtube');
    setMediaUrl('');
    setMediaTitle('');
    setMediaDescription('');
    setMediaDisplayExplore(true);
    setMediaDisplaySingalong(false);
  };

  const startEditMedia = (media) => {
    setEditingMedia(media);
    setMediaType(media.media_type);
    setMediaUrl(media.url);
    setMediaTitle(media.title || '');
    setMediaDescription(media.description || '');
    setMediaDisplayExplore(media.display_explore !== false);
    setMediaDisplaySingalong(media.display_singalong === true);
  };

  const cancelMediaEdit = () => setEditingMedia(null);

  const saveMedia = async () => {
    if (!mediaUrl.trim()) { showMessage('❌ URL is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const mediaData = { 
        song_id: selectedSong.id, 
        media_type: mediaType, 
        url: mediaUrl.trim(),
        title: mediaTitle.trim() || null,
        description: mediaDescription.trim() || null,
        display_explore: mediaDisplayExplore,
        display_singalong: mediaDisplaySingalong,
        display_order: editingMedia.isNew ? getSongMedia(selectedSong.id).length : editingMedia.display_order
      };
      if (editingMedia.isNew) {
        await fetch(`${SUPABASE_URL}/rest/v1/song_media`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(mediaData) });
        await logChange('add', 'song_media', selectedSong.id, selectedSong.title, 'media', null, `${mediaType}: ${mediaUrl.trim()}`);
        showMessage('✅ Media added!');
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/song_media?id=eq.${editingMedia.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(mediaData) });
        await logChange('edit', 'song_media', selectedSong.id, selectedSong.title, 'media', editingMedia.url, mediaUrl.trim());
        showMessage('✅ Media updated!');
      }
      setEditingMedia(null); await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving media'); }
    setSaving(false);
  };

  const deleteMedia = async (media) => {
    if (!confirm('Delete this media link?')) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_media?id=eq.${media.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'song_media', selectedSong.id, selectedSong.title, 'media', `${media.media_type}: ${media.url}`, null);
      showMessage('✅ Media deleted'); await loadAllData();
    } catch (error) { showMessage('❌ Error deleting media'); }
  };

  // Version management
  const VERSION_TYPES = [
    { value: 'canonical', label: 'Original/Canonical' },
    { value: 'alternate', label: 'Alternate Version' }
  ];

  const VERSION_ATTRIBUTE_TYPES = [
    { value: 'gender_neutral', label: 'Gender Neutral' },
    { value: 'secular', label: 'Secular (religious references removed)' },
    { value: 'kid_friendly', label: 'Kid Friendly' },
    { value: 'addresses_sensitivity', label: 'Addresses Sensitivity Issues' },
    { value: 'camp_specific', label: 'Camp-Specific Names/References' },
    { value: 'other', label: 'Other' }
  ];

  const getSongVersions = (songId) => songVersions.filter(v => v.song_id === songId);
  const getVersionAttributes = (versionId) => versionAttributes.filter(a => a.song_version_id === versionId);

  const startAddVersion = () => {
    setEditingVersion({ isNew: true });
    setVersionLabel('');
    setVersionType('canonical');
    setVersionLyrics('');
    setVersionNotes('');
    setVersionIsDefaultSingalong(getSongVersions(selectedSong.id).length === 0); // First version is default
    setVersionIsDefaultExplore(getSongVersions(selectedSong.id).length === 0);
    setVersionSelectedAttributes([]);
  };

  const startEditVersion = (version) => {
    setEditingVersion(version);
    setVersionLabel(version.label || '');
    setVersionType(version.version_type || 'canonical');
    setVersionLyrics(version.lyrics_content || '');
    setVersionNotes(version.version_notes || '');
    setVersionIsDefaultSingalong(version.is_default_singalong || false);
    setVersionIsDefaultExplore(version.is_default_explore || false);
    setVersionSelectedAttributes(getVersionAttributes(version.id).map(a => a.attribute_type));
  };

  const cancelVersionEdit = () => setEditingVersion(null);

  const toggleVersionAttribute = (attrType) => {
    setVersionSelectedAttributes(prev => 
      prev.includes(attrType) ? prev.filter(a => a !== attrType) : [...prev, attrType]
    );
  };

  const saveVersion = async () => {
    if (!versionLyrics.trim()) { showMessage('❌ Lyrics are required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const versionData = {
        song_id: selectedSong.id,
        label: versionLabel.trim() || null,
        version_type: versionType,
        lyrics_content: versionLyrics.trim(),
        version_notes: versionNotes.trim() || null,
        is_default_singalong: versionIsDefaultSingalong,
        is_default_explore: versionIsDefaultExplore
      };

      let versionId;
      if (editingVersion.isNew) {
        // If this will be default, unset other defaults first
        if (versionIsDefaultSingalong) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${selectedSong.id}&is_default_singalong=eq.true`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ is_default_singalong: false }) 
          });
        }
        if (versionIsDefaultExplore) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${selectedSong.id}&is_default_explore=eq.true`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ is_default_explore: false }) 
          });
        }
        const response = await fetch(`${SUPABASE_URL}/rest/v1/song_versions`, { 
          method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' }, 
          body: JSON.stringify(versionData) 
        });
        const created = await response.json();
        versionId = created[0].id;
        await logChange('add', 'song_versions', selectedSong.id, selectedSong.title, 'version', null, versionLabel || 'New version');
        showMessage('✅ Version added!');
      } else {
        versionId = editingVersion.id;
        // If setting as default, unset others first
        if (versionIsDefaultSingalong && !editingVersion.is_default_singalong) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${selectedSong.id}&is_default_singalong=eq.true&id=neq.${versionId}`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ is_default_singalong: false }) 
          });
        }
        if (versionIsDefaultExplore && !editingVersion.is_default_explore) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${selectedSong.id}&is_default_explore=eq.true&id=neq.${versionId}`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ is_default_explore: false }) 
          });
        }
        await fetch(`${SUPABASE_URL}/rest/v1/song_versions?id=eq.${versionId}`, { 
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
          body: JSON.stringify(versionData) 
        });
        await logChange('edit', 'song_versions', selectedSong.id, selectedSong.title, 'version', editingVersion.label, versionLabel);
        showMessage('✅ Version updated!');
      }

      // Update attributes - delete existing and re-add
      await fetch(`${SUPABASE_URL}/rest/v1/song_version_attributes?song_version_id=eq.${versionId}`, { 
        method: 'DELETE', headers 
      });
      for (const attrType of versionSelectedAttributes) {
        await fetch(`${SUPABASE_URL}/rest/v1/song_version_attributes`, { 
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, 
          body: JSON.stringify({ song_version_id: versionId, attribute_type: attrType }) 
        });
      }

      // Update song's has_lyrics flag
      await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${selectedSong.id}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ has_lyrics: true }) 
      });

      setEditingVersion(null); 
      await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving version'); }
    setSaving(false);
  };

  const deleteVersion = async (version) => {
    if (!confirm('Delete this version?')) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_versions?id=eq.${version.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'song_versions', selectedSong.id, selectedSong.title, 'version', version.label || 'version', null);
      // Update has_lyrics if no versions left
      const remainingVersions = songVersions.filter(v => v.song_id === selectedSong.id && v.id !== version.id);
      if (remainingVersions.length === 0) {
        const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
        await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${selectedSong.id}`, { 
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
          body: JSON.stringify({ has_lyrics: false }) 
        });
      }
      showMessage('✅ Version deleted'); await loadAllData();
    } catch (error) { showMessage('❌ Error deleting version'); }
  };

  const setAsDefault = async (version, type) => {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    const field = type === 'singalong' ? 'is_default_singalong' : 'is_default_explore';
    try {
      // Unset others
      await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${selectedSong.id}&${field}=eq.true`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ [field]: false }) 
      });
      // Set this one
      await fetch(`${SUPABASE_URL}/rest/v1/song_versions?id=eq.${version.id}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ [field]: true }) 
      });
      showMessage(`✅ Set as default for ${type}`); 
      await loadAllData();
    } catch (error) { showMessage('❌ Error setting default'); }
  };

  // Song flags management
  const FLAG_TYPES = [
    { value: 'problematic_content', label: 'Problematic Content', description: 'Racism, offensive language, slurs' },
    { value: 'cultural_sensitivity', label: 'Cultural Sensitivity', description: 'Appropriation concerns' },
    { value: 'religious_content', label: 'Religious Content', description: 'References God/religion' },
    { value: 'adult_content', label: 'Adult Content', description: 'Themes or words not camp-appropriate' },
    { value: 'other', label: 'Other', description: 'Other concerns' }
  ];

  const getSongFlags = (songId) => songFlags.filter(f => f.song_id === songId);

  const startAddFlag = () => {
    setEditingFlag({ isNew: true });
    setFlagType('problematic_content');
    setFlagExplanation('');
  };

  const startEditFlag = (flag) => {
    setEditingFlag(flag);
    setFlagType(flag.flag_type);
    setFlagExplanation(flag.explanation || '');
  };

  const cancelFlagEdit = () => setEditingFlag(null);

  const saveFlag = async () => {
    if (!flagExplanation.trim()) { showMessage('❌ Please provide an explanation'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const flagData = {
        song_id: selectedSong.id,
        flag_type: flagType,
        explanation: flagExplanation.trim(),
        created_by: sessionName
      };
      if (editingFlag.isNew) {
        // Check if flag type already exists for this song
        if (songFlags.some(f => f.song_id === selectedSong.id && f.flag_type === flagType)) {
          showMessage('❌ This flag type already exists for this song'); 
          setSaving(false); 
          return;
        }
        await fetch(`${SUPABASE_URL}/rest/v1/song_flags`, { 
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, 
          body: JSON.stringify(flagData) 
        });
        await logChange('add', 'song_flags', selectedSong.id, selectedSong.title, 'flag', null, flagType);
        showMessage('✅ Flag added!');
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/song_flags?id=eq.${editingFlag.id}`, { 
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
          body: JSON.stringify({ flag_type: flagType, explanation: flagExplanation.trim() }) 
        });
        await logChange('edit', 'song_flags', selectedSong.id, selectedSong.title, 'flag', editingFlag.flag_type, flagType);
        showMessage('✅ Flag updated!');
      }
      setEditingFlag(null);
      await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving flag'); }
    setSaving(false);
  };

  const deleteFlag = async (flag) => {
    if (!confirm('Delete this flag?')) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_flags?id=eq.${flag.id}`, { 
        method: 'DELETE', 
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } 
      });
      await logChange('delete', 'song_flags', selectedSong.id, selectedSong.title, 'flag', flag.flag_type, null);
      showMessage('✅ Flag deleted'); 
      await loadAllData();
    } catch (error) { showMessage('❌ Error deleting flag'); }
  };

  // Potential duplicates
  const getSongDuplicates = (songId) => potentialDuplicates.filter(d => d.song_id_a === songId || d.song_id_b === songId);
  
  const openDuplicateModal = () => {
    setShowDuplicateModal(true);
    setDuplicateSearchTerm('');
    setSelectedDuplicateOf(null);
    setDuplicateNotes('');
  };

  const closeDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateSearchTerm('');
    setSelectedDuplicateOf(null);
    setDuplicateNotes('');
  };

  const saveDuplicateFlag = async () => {
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const data = {
        song_id_a: selectedSong.id,
        song_id_b: selectedDuplicateOf?.id || null,
        status: 'pending',
        suggested_by: 'user',
        notes: duplicateNotes.trim() || null,
        created_by: sessionName
      };
      await fetch(`${SUPABASE_URL}/rest/v1/potential_duplicates`, { 
        method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify(data) 
      });
      await logChange('add', 'potential_duplicates', selectedSong.id, selectedSong.title, 'duplicate_flag', null, selectedDuplicateOf?.title || 'unknown');
      showMessage('✅ Flagged as potential duplicate');
      closeDuplicateModal();
      await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error flagging duplicate'); }
    setSaving(false);
  };

  const dismissDuplicate = async (dup) => {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/potential_duplicates?id=eq.${dup.id}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ status: 'not_duplicate', resolved_at: new Date().toISOString(), resolved_by: sessionName }) 
      });
      showMessage('✅ Marked as not duplicate');
      setSelectedDuplicate(null);
      await loadAllData();
    } catch (error) { showMessage('❌ Error updating'); }
  };

  const selectDuplicateForReview = (dup) => {
    setSelectedDuplicate(dup);
    // Default to keeping song_id_a as primary if both exist
    setMergePrimarySongId(dup.song_id_a);
  };

  const mergeDuplicates = async () => {
    if (!selectedDuplicate || !mergePrimarySongId) return;
    const secondarySongId = mergePrimarySongId === selectedDuplicate.song_id_a ? selectedDuplicate.song_id_b : selectedDuplicate.song_id_a;
    if (!secondarySongId) {
      showMessage('❌ Cannot merge - other song not specified');
      return;
    }
    
    const primarySong = allSongs.find(s => s.id === mergePrimarySongId);
    const secondarySong = allSongs.find(s => s.id === secondarySongId);
    
    if (!confirm(`Merge "${secondarySong?.title}" into "${primarySong?.title}"?\n\nThis will:\n• Create "${secondarySong?.title}" as an alias of "${primarySong?.title}"\n• Move all versions, notes, media, flags, and group memberships to the primary song\n• Delete the secondary song\n\nThis cannot be undone.`)) return;
    
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    
    try {
      // 1. Create alias from secondary song title
      await fetch(`${SUPABASE_URL}/rest/v1/song_aliases`, { 
        method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ song_id: mergePrimarySongId, alias_title: secondarySong.title }) 
      });
      
      // 2. Move versions from secondary to primary
      await fetch(`${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${secondarySongId}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ song_id: mergePrimarySongId }) 
      });
      
      // 3. Move notes from secondary to primary
      await fetch(`${SUPABASE_URL}/rest/v1/song_notes?song_id=eq.${secondarySongId}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ song_id: mergePrimarySongId }) 
      });
      
      // 4. Move media from secondary to primary
      await fetch(`${SUPABASE_URL}/rest/v1/song_media?song_id=eq.${secondarySongId}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ song_id: mergePrimarySongId }) 
      });
      
      // 5. Move flags from secondary to primary (skip if flag type already exists)
      const secondaryFlags = songFlags.filter(f => f.song_id === secondarySongId);
      const primaryFlagTypes = songFlags.filter(f => f.song_id === mergePrimarySongId).map(f => f.flag_type);
      for (const flag of secondaryFlags) {
        if (!primaryFlagTypes.includes(flag.flag_type)) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_flags?id=eq.${flag.id}`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ song_id: mergePrimarySongId }) 
          });
        }
      }
      
      // 6. Move aliases from secondary to primary
      await fetch(`${SUPABASE_URL}/rest/v1/song_aliases?song_id=eq.${secondarySongId}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ song_id: mergePrimarySongId }) 
      });
      
      // 7. Move secondary sections from secondary to primary (skip duplicates)
      const secondarySections = songSections.filter(s => s.song_id === secondarySongId);
      const primarySectionCodes = songSections.filter(s => s.song_id === mergePrimarySongId).map(s => s.section);
      for (const section of secondarySections) {
        if (!primarySectionCodes.includes(section.section)) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_sections?id=eq.${section.id}`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ song_id: mergePrimarySongId }) 
          });
        } else {
          await fetch(`${SUPABASE_URL}/rest/v1/song_sections?id=eq.${section.id}`, { 
            method: 'DELETE', headers 
          });
        }
      }
      
      // 8. Move songbook entries from secondary to primary
      await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?song_id=eq.${secondarySongId}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ song_id: mergePrimarySongId }) 
      });
      
      // 9. Move group memberships from secondary to primary (skip if already in same group)
      const secondaryMemberships = songGroupMembers.filter(m => m.song_id === secondarySongId);
      const primaryGroupIds = songGroupMembers.filter(m => m.song_id === mergePrimarySongId).map(m => m.group_id);
      for (const membership of secondaryMemberships) {
        if (!primaryGroupIds.includes(membership.group_id)) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_group_members?id=eq.${membership.id}`, { 
            method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
            body: JSON.stringify({ song_id: mergePrimarySongId }) 
          });
        } else {
          // Delete duplicate membership
          await fetch(`${SUPABASE_URL}/rest/v1/song_group_members?id=eq.${membership.id}`, { 
            method: 'DELETE', headers 
          });
        }
      }
      
      // 10. Update duplicate record to merged
      await fetch(`${SUPABASE_URL}/rest/v1/potential_duplicates?id=eq.${selectedDuplicate.id}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ status: 'merged', resolved_at: new Date().toISOString(), resolved_by: sessionName }) 
      });
      
      // 11. Delete the secondary song
      await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${secondarySongId}`, { 
        method: 'DELETE', headers 
      });
      
      await logChange('edit', 'songs', mergePrimarySongId, primarySong.title, 'merge', secondarySong.title, `Merged into ${primarySong.title}`);
      
      showMessage('✅ Songs merged successfully');
      setSelectedDuplicate(null);
      await loadAllData();
    } catch (error) { 
      console.error(error); 
      showMessage('❌ Error merging songs'); 
    }
    setSaving(false);
  };

  const filteredDuplicates = potentialDuplicates.filter(d => 
    duplicateStatusFilter === 'all' || d.status === duplicateStatusFilter
  );

  // Auto-duplicate detection using fuzzy matching
  const normalizeTitle = (title) => {
    return title?.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // remove punctuation
      .replace(/\s+/g, ' ')        // normalize spaces
      .replace(/^(the|a|an)\s+/i, '') // remove leading articles
      .trim();
  };

  const findPotentialDuplicates = () => {
    const suggestions = [];
    const checked = new Set();
    
    // Get existing duplicate pairs to avoid re-suggesting
    const existingPairs = new Set(potentialDuplicates.map(d => 
      [d.song_id_a, d.song_id_b].sort().join('-')
    ));
    
    for (let i = 0; i < allSongs.length; i++) {
      const songA = allSongs[i];
      const normA = normalizeTitle(songA.title);
      
      for (let j = i + 1; j < allSongs.length; j++) {
        const songB = allSongs[j];
        const pairKey = [songA.id, songB.id].sort().join('-');
        
        // Skip if already flagged
        if (existingPairs.has(pairKey)) continue;
        
        const normB = normalizeTitle(songB.title);
        
        // Check for matches
        let reason = null;
        
        // Exact normalized match
        if (normA === normB) {
          reason = 'Exact title match (after normalization)';
        }
        // One contains the other (for titles like "Song" vs "Song (Alternate)")
        else if (normA.length > 3 && normB.length > 3) {
          if (normA.includes(normB) || normB.includes(normA)) {
            reason = 'One title contains the other';
          }
        }
        // Check if title matches an alias
        const aliasesA = getSongAliases(songA.id).map(a => normalizeTitle(a.alias_title));
        const aliasesB = getSongAliases(songB.id).map(a => normalizeTitle(a.alias_title));
        if (aliasesA.includes(normB) || aliasesB.includes(normA)) {
          reason = 'Title matches an alias';
        }
        
        if (reason) {
          suggestions.push({ songA, songB, reason });
        }
      }
    }
    return suggestions;
  };

  const autoDetectedDuplicates = findPotentialDuplicates();

  const saveAutoDetectedDuplicate = async (songA, songB, reason) => {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/potential_duplicates`, { 
        method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({
          song_id_a: songA.id,
          song_id_b: songB.id,
          status: 'pending',
          suggested_by: 'auto',
          notes: reason,
          created_by: 'auto-detect'
        }) 
      });
      showMessage('✅ Added to duplicate review queue');
      await loadAllData();
    } catch (error) { showMessage('❌ Error saving'); }
  };

  const dismissAutoDetected = (songA, songB) => {
    // For now just add to the DB as not_duplicate so it won't show again
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    fetch(`${SUPABASE_URL}/rest/v1/potential_duplicates`, { 
      method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, 
      body: JSON.stringify({
        song_id_a: songA.id,
        song_id_b: songB.id,
        status: 'not_duplicate',
        suggested_by: 'auto',
        notes: 'Dismissed from auto-detection',
        created_by: sessionName,
        resolved_at: new Date().toISOString(),
        resolved_by: sessionName
      }) 
    }).then(() => loadAllData());
  };

  // Alias swap (promote alias to title)
  const swapAliasWithTitle = async (alias) => {
    if (!confirm(`Swap "${alias.alias_title}" with the current title "${selectedSong.title}"? The current title will become an alias.`)) return;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const oldTitle = selectedSong.title;
      const newTitle = alias.alias_title;
      
      // Update song title
      await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${selectedSong.id}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ title: newTitle }) 
      });
      
      // Update alias to old title
      await fetch(`${SUPABASE_URL}/rest/v1/song_aliases?id=eq.${alias.id}`, { 
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, 
        body: JSON.stringify({ alias_title: oldTitle }) 
      });
      
      await logChange('edit', 'songs', selectedSong.id, newTitle, 'title_swap', oldTitle, newTitle);
      showMessage('✅ Title and alias swapped');
      await loadAllData();
      // Update selected song with new title
      setSelectedSong({ ...selectedSong, title: newTitle });
      setFormTitle(newTitle);
    } catch (error) { console.error(error); showMessage('❌ Error swapping'); }
  };

  const selectGroup = (group) => {
    setSelectedGroup(group); setSelectedSong(null); setIsAddingNewGroup(false);
    setFormGroupName(group.group_name); setFormGroupType(group.group_type || 'round_group');
    setFormGroupInstructions(group.instructions || ''); setFormGroupRequestable(group.is_requestable !== false);
    const pageInfo = getGroupPage(group.id);
    setFormGroupPage(pageInfo?.page || ''); setFormGroupSection(pageInfo?.section || 'S'); setFormGroupOldPage(pageInfo?.old_page || '');
    setGroupEditTab('info');
  };

  const startAddNewGroup = () => {
    setSelectedGroup(null); setSelectedSong(null); setIsAddingNewGroup(true);
    setFormGroupName(''); setFormGroupType('round_group'); setFormGroupInstructions(''); setFormGroupRequestable(true);
    setFormGroupPage(''); setFormGroupSection('S'); setFormGroupOldPage(''); setGroupEditTab('info');
  };

  const cancelGroupEdit = () => { setSelectedGroup(null); setIsAddingNewGroup(false); };

  const saveGroupInfo = async () => {
    if (!sessionName.trim()) { showMessage('❌ Please enter your name first'); return; }
    if (!formGroupName.trim()) { showMessage('❌ Group name is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const groupData = { group_name: formGroupName.trim(), group_type: formGroupType, instructions: formGroupInstructions.trim() || null, is_requestable: formGroupRequestable };
      if (isAddingNewGroup) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/song_groups`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify(groupData) });
        if (response.ok) {
          const created = await response.json();
          await logChange('add', 'song_groups', null, created[0].group_name);
          if (formGroupPage.trim()) {
            await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_group_id: created[0].id, songbook_id: 1, section: formGroupSection, page: formGroupPage.trim(), old_page: formGroupOldPage.trim() || null }) });
          }
          showMessage('✅ Group created!'); setIsAddingNewGroup(false); await loadAllData(); selectGroup(created[0]);
        }
      } else {
        if (selectedGroup.group_name !== groupData.group_name) await logChange('edit', 'song_groups', null, groupData.group_name, 'group_name', selectedGroup.group_name, groupData.group_name);
        if (selectedGroup.instructions !== groupData.instructions) await logChange('edit', 'song_groups', null, groupData.group_name, 'instructions', '[old]', '[new]');
        await fetch(`${SUPABASE_URL}/rest/v1/song_groups?id=eq.${selectedGroup.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(groupData) });
        const existingEntry = getGroupPage(selectedGroup.id);
        if (existingEntry) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?id=eq.${existingEntry.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ section: formGroupSection, page: formGroupPage.trim() || null, old_page: formGroupOldPage.trim() || null }) });
        } else if (formGroupPage.trim()) {
          await fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ song_group_id: selectedGroup.id, songbook_id: 1, section: formGroupSection, page: formGroupPage.trim(), old_page: formGroupOldPage.trim() || null }) });
        }
        showMessage('✅ Group updated!'); await loadAllData(); setSelectedGroup({ ...selectedGroup, ...groupData });
      }
    } catch (error) { console.error(error); showMessage('❌ Error saving group'); }
    setSaving(false);
  };

  const startAddMember = () => { setEditingMember({ isNew: true }); setMemberSongId(''); setMemberPosition(getGroupMembers(selectedGroup.id).length + 1); setMemberRole('default'); setMemberFragmentLyrics(''); setMemberInstructions(''); };
  const startEditMember = (member) => { setEditingMember(member); setMemberSongId(member.song_id); setMemberPosition(member.position_in_group); setMemberRole(member.member_role || 'default'); setMemberFragmentLyrics(member.fragment_lyrics || ''); setMemberInstructions(member.specific_instructions || ''); };
  const cancelMemberEdit = () => { setEditingMember(null); };

  const saveMember = async () => {
    if (!memberSongId) { showMessage('❌ Please select a song'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    try {
      const memberData = { group_id: selectedGroup.id, song_id: parseInt(memberSongId), position_in_group: memberPosition, member_role: memberRole, fragment_lyrics: memberFragmentLyrics.trim() || null, specific_instructions: memberInstructions.trim() || null };
      const song = allSongs.find(s => s.id === parseInt(memberSongId));
      if (editingMember.isNew) {
        await fetch(`${SUPABASE_URL}/rest/v1/song_group_members`, { method: 'POST', headers, body: JSON.stringify(memberData) });
        await logChange('add', 'song_group_members', null, `${selectedGroup.group_name} + ${song?.title}`, 'member', null, song?.title);
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/song_group_members?id=eq.${editingMember.id}`, { method: 'PATCH', headers, body: JSON.stringify(memberData) });
        await logChange('edit', 'song_group_members', null, `${selectedGroup.group_name} + ${song?.title}`, 'member', null, null);
      }
      showMessage('✅ Member saved!'); cancelMemberEdit(); await loadAllData();
    } catch (error) { console.error(error); showMessage('❌ Error saving member'); }
    setSaving(false);
  };

  const deleteMember = async (member) => {
    const song = allSongs.find(s => s.id === member.song_id);
    if (!confirm(`Remove "${song?.title}" from this group?`)) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/song_group_members?id=eq.${member.id}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      await logChange('delete', 'song_group_members', null, `${selectedGroup.group_name} - ${song?.title}`, 'member', song?.title, null);
      showMessage('✅ Member removed'); await loadAllData();
    } catch (error) { showMessage('❌ Error removing member'); }
  };

  const filteredSongs = allSongs.filter(song => { 
    // Check section filter - include if primary OR any songbook entry has matching section
    if (sectionFilter !== 'all') {
      const entrySections = getSongSongbookEntries(song.id).map(e => e.section).filter(Boolean);
      if (song.section !== sectionFilter && !entrySections.includes(sectionFilter)) return false;
    }
    const search = searchTerm.toLowerCase(); 
    if (!search) return true;
    const pageInfo = getSongPage(song.id);
    const page = pageInfo.page || song.page;
    const aliases = getSongAliases(song.id).map(a => a.alias_title?.toLowerCase()).join(' ');
    const lyrics = getSongVersions(song.id).map(v => v.lyrics_content?.toLowerCase() || '').join(' ');
    return song.title?.toLowerCase().includes(search) || page?.toLowerCase().includes(search) || song.section?.toLowerCase().includes(search) || aliases.includes(search) || lyrics.includes(search); 
  });
  const filteredGroups = songGroups.filter(group => { const search = searchTerm.toLowerCase(); if (!search) return true; return group.group_name?.toLowerCase().includes(search); });
  const filteredChangeLog = changeLog.filter(log => { if (logTableFilter !== 'all' && log.table_name !== logTableFilter) return false; if (logUserFilter && !log.changed_by?.toLowerCase().includes(logUserFilter.toLowerCase())) return false; return true; });

  const s = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '1rem' },
    header: { maxWidth: '1400px', margin: '0 auto 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' },
    nameInput: { padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#1e293b', color: '#f1f5f9', fontSize: '0.875rem' },
    mainTabs: { display: 'flex', gap: '0.5rem', maxWidth: '1400px', margin: '0 auto 1rem' },
    mainTab: (a) => ({ padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: a ? '#22c55e' : '#334155', color: a ? '#fff' : '#94a3b8', fontWeight: 'bold', cursor: 'pointer' }),
    content: { maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1rem', minHeight: '70vh' },
    panel: { background: '#1e293b', borderRadius: '0.75rem', padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    searchInput: { width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', marginBottom: '0.75rem' },
    songList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    songItem: (sel) => ({ padding: '0.75rem', borderRadius: '0.5rem', background: sel ? '#334155' : 'transparent', cursor: 'pointer', borderLeft: sel ? '3px solid #22c55e' : '3px solid transparent' }),
    editTabs: { display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' },
    editTab: (a) => ({ padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', background: a ? '#22c55e' : '#334155', color: a ? '#fff' : '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }),
    formGroup: { marginBottom: '1rem' },
    label: { display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase' },
    input: { width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '0.875rem' },
    textarea: { width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '0.875rem', minHeight: '150px', fontFamily: 'inherit', resize: 'vertical' },
    select: { width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '0.875rem' },
    btn: { padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
    btnSec: { padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' },
    btnDanger: { padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', background: '#dc2626', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' },
    btnSmall: { padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: 'none', background: '#334155', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' },
    msg: { position: 'fixed', top: '1rem', right: '1rem', padding: '1rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid #334155', zIndex: 1000 },
    card: { background: '#0f172a', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '0.5rem' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#334155', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.875rem', marginRight: '0.5rem', marginBottom: '0.5rem' },
  };

  // Loading state
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎵</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Auth gate - require login
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: '#1e293b', borderRadius: '1rem', padding: '2rem', maxWidth: '400px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎵</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Song Admin</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sign in to manage songs</p>
          </div>
          
          {authError && <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>{authError}</div>}
          {authMessage && <div style={{ background: '#14532d', color: '#bbf7d0', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>{authMessage}</div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            />
            {authMode !== 'magic' && (
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
              />
            )}
            <button
              onClick={authMode === 'magic' ? handleMagicLink : handleLogin}
              disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
              style={{ padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 'bold', cursor: 'pointer', opacity: authLoading ? 0.5 : 1 }}
            >
              {authLoading ? 'Loading...' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
            </button>
          </div>
          
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155', textAlign: 'center' }}>
            {authMode === 'login' ? (
              <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.875rem' }}>
                Use magic link instead
              </button>
            ) : (
              <button onClick={() => { setAuthMode('login'); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.875rem' }}>
                Use password instead
              </button>
            )}
          </div>
          
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <a href="/" style={{ color: '#94a3b8', fontSize: '0.875rem', textDecoration: 'none' }}>← Back to Singalong</a>
          </div>
        </div>
      </div>
    );
  }

  // Admin role check
  if (userProfile?.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: '#1e293b', borderRadius: '1rem', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Access Denied</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>You need admin privileges to access this page.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a href="/" style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#22c55e', color: '#fff', fontWeight: 'bold', textDecoration: 'none' }}>← Back to Singalong</a>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem' }}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🎵 Song Admin</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Your name:</span>
            <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="Enter your name" style={s.nameInput} />
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}>Sign out</button>
        </div>
      </div>

      {message && <div style={s.msg}>{message}</div>}

      <div style={s.mainTabs}>
        <button style={s.mainTab(mainTab === 'songs')} onClick={() => setMainTab('songs')}>Songs</button>
        <button style={s.mainTab(mainTab === 'groups')} onClick={() => setMainTab('groups')}>Groups</button>
        <button style={s.mainTab(mainTab === 'songbooks')} onClick={() => setMainTab('songbooks')}>Songbooks</button>
        <button style={s.mainTab(mainTab === 'duplicates')} onClick={() => setMainTab('duplicates')}>Duplicates {(potentialDuplicates.filter(d => d.status === 'pending').length + autoDetectedDuplicates.length) > 0 && <span style={{ background: '#f59e0b', color: '#000', borderRadius: '9999px', padding: '0 0.4rem', fontSize: '0.7rem', marginLeft: '0.25rem' }}>{potentialDuplicates.filter(d => d.status === 'pending').length + autoDetectedDuplicates.length}</span>}</button>
        <button style={s.mainTab(mainTab === 'changelog')} onClick={() => setMainTab('changelog')}>Change Log</button>
      </div>

      {mainTab === 'songs' && (
        <div style={s.content}>
          <div style={s.panel}>
            <input type="text" placeholder="Search title, lyrics, aliases..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={s.searchInput} />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={{ ...s.select, flex: 1 }}>
                <option value="all">All Sections</option>
                {Object.entries(SECTION_INFO).map(([k, n]) => <option key={k} value={k}>{k} - {n}</option>)}
              </select>
              <button style={s.btn} onClick={startAddNewSong}>+ Add Song</button>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.5rem' }}>📄 lyrics 📝 notes 🎵 media ⚠️ flags 🏷️ aliases 👥 groups 📑 versions 📍 multi-section</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{filteredSongs.length} songs</div>
            <div style={s.songList}>
              {filteredSongs.map(song => {
                const pageInfo = getSongPage(song.id);
                const displayPage = pageInfo.page || song.page || 'N/A';
                const hasLyrics = getDefaultVersion(song.id)?.lyrics_content;
                const hasNotes = getSongNotes(song.id).length > 0;
                const hasMedia = getSongMedia(song.id).length > 0;
                const hasFlags = getSongFlags(song.id).length > 0;
                const hasAliases = getSongAliases(song.id).length > 0;
                const inGroups = getSongGroups(song.id).length > 0;
                const multipleVersions = getSongVersions(song.id).length > 1;
                // Check for multiple sections via songbook entries
                const songbookEntrySections = getSongSongbookEntries(song.id).map(e => e.section).filter(Boolean);
                const uniqueSections = [...new Set([song.section, ...songbookEntrySections])];
                const hasMultipleSections = uniqueSections.length > 1;
                // If filtering by a different section, find the matching entry
                const matchedEntry = sectionFilter !== 'all' && song.section !== sectionFilter 
                  ? getSongSongbookEntries(song.id).find(e => e.section === sectionFilter) 
                  : null;
                return (
                  <div key={song.id} style={s.songItem(selectedSong?.id === song.id)} onClick={() => selectSong(song)}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{song.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {matchedEntry ? (
                        <>Section {matchedEntry.section} • Page {matchedEntry.page || 'N/A'} <span style={{ color: '#64748b' }}>(also {song.section})</span></>
                      ) : (
                        <>Section {song.section} • Page {displayPage}</>
                      )}
                      {hasLyrics && ' 📄'}{hasNotes && ' 📝'}{hasMedia && ' 🎵'}{hasFlags && ' ⚠️'}{hasAliases && ' 🏷️'}{inGroups && ' 👥'}{multipleVersions && ' 📑'}{hasMultipleSections && ' 📍'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={s.panel}>
            {!selectedSong && !isAddingNew ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Select a song to edit or click "Add Song"</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{isAddingNew ? 'Add New Song' : formTitle}</h2>
                  <button style={s.btnSec} onClick={cancelSongEdit}>✕ Close</button>
                </div>
                {!isAddingNew && (
                  <div style={s.editTabs}>
                    <button style={s.editTab(songEditTab === 'basic')} onClick={() => setSongEditTab('basic')}>Basic Info</button>
                    <button style={s.editTab(songEditTab === 'versions')} onClick={() => setSongEditTab('versions')}>Versions ({getSongVersions(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'notes')} onClick={() => setSongEditTab('notes')}>Notes ({getSongNotes(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'flags')} onClick={() => setSongEditTab('flags')}>Flags ({getSongFlags(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'media')} onClick={() => setSongEditTab('media')}>Media ({getSongMedia(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'songbooks')} onClick={() => setSongEditTab('songbooks')}>Songbooks ({getSongSongbookEntries(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'aliases')} onClick={() => setSongEditTab('aliases')}>Aliases ({getSongAliases(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'groups')} onClick={() => setSongEditTab('groups')}>Groups ({getSongGroups(selectedSong.id).length})</button>
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(songEditTab === 'basic' || isAddingNew) && (
                    <>
                      <div style={s.formGroup}><label style={s.label}>Title *</label><input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} style={s.input} /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={s.formGroup}><label style={s.label}>Author</label><input type="text" value={formAuthor} onChange={(e) => setFormAuthor(e.target.value)} style={s.input} placeholder="Who wrote the song" /></div>
                        <div style={s.formGroup}><label style={s.label}>Composer</label><input type="text" value={formComposer} onChange={(e) => setFormComposer(e.target.value)} style={s.input} placeholder="If different from author" /></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div style={s.formGroup}><label style={s.label}>Year Written</label><input type="number" value={formYearWritten} onChange={(e) => setFormYearWritten(e.target.value)} style={s.input} placeholder="e.g. 1965" /></div>
                        <div style={s.formGroup}><label style={s.label}>Origin</label><input type="text" value={formOrigin} onChange={(e) => setFormOrigin(e.target.value)} style={s.input} placeholder="e.g. French Sea Chanty" /></div>
                        <div style={s.formGroup}><label style={s.label}>Original Language</label><input type="text" value={formOriginalLanguage} onChange={(e) => setFormOriginalLanguage(e.target.value)} style={s.input} placeholder="If not English" /></div>
                      </div>
                      <div style={s.formGroup}><label style={s.label}>Tune Of</label><input type="text" value={formTuneOf} onChange={(e) => setFormTuneOf(e.target.value)} style={s.input} placeholder="If sung to the tune of another song" /></div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button style={s.btn} onClick={saveSongBasic} disabled={saving}>{saving ? 'Saving...' : (isAddingNew ? 'Create Song' : 'Save Changes')}</button>
                        {!isAddingNew && <button style={{ ...s.btnSec, background: '#78350f', borderColor: '#a16207' }} onClick={openDuplicateModal}>🔀 Flag as Duplicate</button>}
                      </div>
                      {!isAddingNew && getSongDuplicates(selectedSong.id).filter(d => d.status === 'pending').length > 0 && (
                        <div style={{ background: '#78350f33', border: '1px solid #a16207', borderRadius: '0.5rem', padding: '0.75rem', marginTop: '0.5rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fbbf24', marginBottom: '0.5rem' }}>⚠️ Potential Duplicate</div>
                          {getSongDuplicates(selectedSong.id).filter(d => d.status === 'pending').map(dup => {
                            const otherSongId = dup.song_id_a === selectedSong.id ? dup.song_id_b : dup.song_id_a;
                            const otherSong = allSongs.find(s => s.id === otherSongId);
                            return (
                              <div key={dup.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '0.25rem 0' }}>
                                <span>May be duplicate of: <strong>{otherSong?.title || 'Unknown'}</strong>{dup.notes && ` - ${dup.notes}`}</span>
                                <button style={s.btnSmall} onClick={() => dismissDuplicate(dup)}>Not a Duplicate</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {songEditTab === 'versions' && !isAddingNew && (
                    <>
                      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={startAddVersion}>+ Add Version</button>
                      {editingVersion && (
                        <div style={{ ...s.card, border: '1px solid #22c55e', marginBottom: '1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={s.formGroup}>
                              <label style={s.label}>Label</label>
                              <input type="text" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} style={s.input} placeholder="e.g. Camp Version, Gender Neutral" />
                            </div>
                            <div style={s.formGroup}>
                              <label style={s.label}>Type</label>
                              <select value={versionType} onChange={(e) => setVersionType(e.target.value)} style={s.select}>
                                {VERSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={s.formGroup}>
                            <label style={s.label}>Lyrics *</label>
                            <textarea value={versionLyrics} onChange={(e) => setVersionLyrics(e.target.value)} style={{ ...s.textarea, minHeight: '250px' }} placeholder="Enter lyrics here..." />
                          </div>
                          <div style={s.formGroup}>
                            <label style={s.label}>Version Notes</label>
                            <input type="text" value={versionNotes} onChange={(e) => setVersionNotes(e.target.value)} style={s.input} placeholder="What's different about this version?" />
                          </div>
                          <div style={{ marginBottom: '1rem' }}>
                            <label style={s.label}>Attributes</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                              {VERSION_ATTRIBUTE_TYPES.map(attr => (
                                <label key={attr.value} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', background: versionSelectedAttributes.includes(attr.value) ? '#22c55e33' : '#1e293b', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}>
                                  <input type="checkbox" checked={versionSelectedAttributes.includes(attr.value)} onChange={() => toggleVersionAttribute(attr.value)} />
                                  {attr.label}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={versionIsDefaultSingalong} onChange={(e) => setVersionIsDefaultSingalong(e.target.checked)} />
                              <span>Default for Singalong</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={versionIsDefaultExplore} onChange={(e) => setVersionIsDefaultExplore(e.target.checked)} />
                              <span>Default for Explore</span>
                            </label>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button style={s.btn} onClick={saveVersion} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            <button style={s.btnSec} onClick={cancelVersionEdit}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {getSongVersions(selectedSong.id).map(version => {
                        const attrs = getVersionAttributes(version.id);
                        return (
                          <div key={version.id} style={s.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 'bold' }}>{version.label || 'Untitled Version'}</span>
                                  <span style={{ fontSize: '0.7rem', padding: '0.125rem 0.375rem', background: '#3b82f633', color: '#3b82f6', borderRadius: '0.25rem' }}>{VERSION_TYPES.find(t => t.value === version.version_type)?.label || version.version_type}</span>
                                  {version.is_default_singalong && <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', background: '#22c55e33', color: '#22c55e', borderRadius: '0.25rem' }}>★ Singalong</span>}
                                  {version.is_default_explore && <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', background: '#a855f733', color: '#a855f7', borderRadius: '0.25rem' }}>★ Explore</span>}
                                </div>
                                {version.version_notes && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>{version.version_notes}</div>}
                                {attrs.length > 0 && (
                                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                    {attrs.map(a => (
                                      <span key={a.id} style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', background: '#64748b33', color: '#94a3b8', borderRadius: '0.25rem' }}>
                                        {VERSION_ATTRIBUTE_TYPES.find(t => t.value === a.attribute_type)?.label || a.attribute_type}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                {!version.is_default_singalong && <button style={s.btnSmall} onClick={() => setAsDefault(version, 'singalong')}>Set Singalong</button>}
                                {!version.is_default_explore && <button style={s.btnSmall} onClick={() => setAsDefault(version, 'explore')}>Set Explore</button>}
                                <button style={s.btnSmall} onClick={() => startEditVersion(version)}>Edit</button>
                                <button style={s.btnDanger} onClick={() => deleteVersion(version)}>Delete</button>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: '100px', overflow: 'hidden', background: '#0f172a', padding: '0.5rem', borderRadius: '0.25rem' }}>
                              {version.lyrics_content?.substring(0, 300)}{version.lyrics_content?.length > 300 && '...'}
                            </div>
                          </div>
                        );
                      })}
                      {getSongVersions(selectedSong.id).length === 0 && !editingVersion && <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No versions yet. Add one to include lyrics.</div>}
                    </>
                  )}
                  {songEditTab === 'notes' && !isAddingNew && (
                    <>
                      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={startAddNote}>+ Add Note</button>
                      {editingNote && (
                        <div style={{ ...s.card, border: '1px solid #22c55e', marginBottom: '1rem' }}>
                          <div style={s.formGroup}><label style={s.label}>Note Type</label><select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={s.select}>{NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                          <div style={s.formGroup}><label style={s.label}>Content</label><textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} style={s.textarea} /></div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}><button style={s.btn} onClick={saveNote} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button><button style={s.btnSec} onClick={cancelNoteEdit}>Cancel</button></div>
                        </div>
                      )}
                      {getSongNotes(selectedSong.id).map(note => (
                        <div key={note.id} style={s.card}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#22c55e' }}>{NOTE_TYPES.find(t => t.value === note.note_type)?.label || note.note_type}</span>
                            <div style={{ display: 'flex', gap: '0.25rem' }}><button style={s.btnSmall} onClick={() => startEditNote(note)}>Edit</button><button style={s.btnDanger} onClick={() => deleteNote(note)}>Delete</button></div>
                          </div>
                          <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{note.note_content}</div>
                        </div>
                      ))}
                      {getSongNotes(selectedSong.id).length === 0 && !editingNote && <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No notes yet</div>}
                    </>
                  )}
                  {songEditTab === 'flags' && !isAddingNew && (
                    <>
                      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#1e293b', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                        ⚠️ Flags are song-level warnings about content concerns. Use version attributes to mark when a specific version addresses these issues.
                      </div>
                      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={startAddFlag}>+ Add Flag</button>
                      {editingFlag && (
                        <div style={{ ...s.card, border: '1px solid #f59e0b', marginBottom: '1rem' }}>
                          <div style={s.formGroup}>
                            <label style={s.label}>Flag Type *</label>
                            <select value={flagType} onChange={(e) => setFlagType(e.target.value)} style={s.select}>
                              {FLAG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                              {FLAG_TYPES.find(t => t.value === flagType)?.description}
                            </div>
                          </div>
                          <div style={s.formGroup}>
                            <label style={s.label}>Explanation *</label>
                            <textarea 
                              value={flagExplanation} 
                              onChange={(e) => setFlagExplanation(e.target.value)} 
                              style={s.textarea} 
                              placeholder="Describe the specific concern (e.g., 'Original lyrics contain the word darkies')" 
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button style={s.btn} onClick={saveFlag} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            <button style={s.btnSec} onClick={cancelFlagEdit}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {getSongFlags(selectedSong.id).map(flag => (
                        <div key={flag.id} style={{ ...s.card, borderLeft: '3px solid #f59e0b' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                  {FLAG_TYPES.find(t => t.value === flag.flag_type)?.label || flag.flag_type}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{flag.explanation}</div>
                              {flag.created_by && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>Added by {flag.created_by}</div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                              <button style={s.btnSmall} onClick={() => startEditFlag(flag)}>Edit</button>
                              <button style={s.btnDanger} onClick={() => deleteFlag(flag)}>Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {getSongFlags(selectedSong.id).length === 0 && !editingFlag && (
                        <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No flags. This song has no content concerns noted.</div>
                      )}
                    </>
                  )}
                  {songEditTab === 'media' && !isAddingNew && (
                    <>
                      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={startAddMedia}>+ Add Media Link</button>
                      {editingMedia && (
                        <div style={{ ...s.card, border: '1px solid #22c55e', marginBottom: '1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                            <div style={s.formGroup}>
                              <label style={s.label}>Type *</label>
                              <select value={mediaType} onChange={(e) => setMediaType(e.target.value)} style={s.select}>
                                {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            <div style={s.formGroup}>
                              <label style={s.label}>URL *</label>
                              <input type="text" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} style={s.input} placeholder="https://..." />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={s.formGroup}>
                              <label style={s.label}>Title</label>
                              <input type="text" value={mediaTitle} onChange={(e) => setMediaTitle(e.target.value)} style={s.input} placeholder="Optional display title" />
                            </div>
                            <div style={s.formGroup}>
                              <label style={s.label}>Description</label>
                              <input type="text" value={mediaDescription} onChange={(e) => setMediaDescription(e.target.value)} style={s.input} placeholder="Optional description" />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={mediaDisplayExplore} onChange={(e) => setMediaDisplayExplore(e.target.checked)} />
                              <span>Show in Explore mode</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={mediaDisplaySingalong} onChange={(e) => setMediaDisplaySingalong(e.target.checked)} />
                              <span>Show in Singalong mode</span>
                            </label>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button style={s.btn} onClick={saveMedia} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            <button style={s.btnSec} onClick={cancelMediaEdit}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {getSongMedia(selectedSong.id).map(media => (
                        <div key={media.id} style={s.card}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#22c55e' }}>{MEDIA_TYPES.find(t => t.value === media.media_type)?.label || media.media_type}</span>
                                {media.display_explore && <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', background: '#3b82f633', color: '#3b82f6', borderRadius: '0.25rem' }}>Explore</span>}
                                {media.display_singalong && <span style={{ fontSize: '0.6rem', padding: '0.125rem 0.375rem', background: '#22c55e33', color: '#22c55e', borderRadius: '0.25rem' }}>Singalong</span>}
                              </div>
                              {media.title && <div style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>{media.title}</div>}
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <a href={media.url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{media.url}</a>
                              </div>
                              {media.description && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>{media.description}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                              <button style={s.btnSmall} onClick={() => startEditMedia(media)}>Edit</button>
                              <button style={s.btnDanger} onClick={() => deleteMedia(media)}>Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {getSongMedia(selectedSong.id).length === 0 && !editingMedia && <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No media links yet</div>}
                    </>
                  )}
                  {songEditTab === 'songbooks' && !isAddingNew && (
                    <>
                      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={startAddSongbookEntry}>+ Add to Songbook</button>
                      {editingSongbookEntry && (
                        <div style={{ ...s.card, border: '1px solid #22c55e', marginBottom: '1rem' }}>
                          <div style={s.formGroup}>
                            <label style={s.label}>Songbook *</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <select value={entrySongbookId} onChange={(e) => setEntrySongbookId(e.target.value)} style={{ ...s.select, flex: 1 }}>
                                <option value="">Select songbook...</option>
                                {songbooks.map(sb => <option key={sb.id} value={sb.id}>{sb.name}</option>)}
                              </select>
                              <button style={s.btnSec} onClick={() => { startAddNewSongbook(); setMainTab('songbooks'); }}>+ New</button>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={s.formGroup}>
                              <label style={s.label}>Section</label>
                              <select value={entrySection} onChange={(e) => setEntrySection(e.target.value)} style={s.select} disabled={!entrySongbookId}>
                                <option value="">No section</option>
                                {entrySongbookId && getSongbookSections(entrySongbookId).map(sec => (
                                  <option key={sec.id} value={sec.section_code}>{sec.section_code} - {sec.section_name}</option>
                                ))}
                                {/* Fallback to SECTION_INFO if no sections defined for this songbook */}
                                {entrySongbookId && getSongbookSections(entrySongbookId).length === 0 && 
                                  Object.entries(SECTION_INFO).map(([k, n]) => <option key={k} value={k}>{k} - {n}</option>)
                                }
                              </select>
                            </div>
                            <div style={s.formGroup}>
                              <label style={s.label}>Page *</label>
                              <input type="text" value={entryPage} onChange={(e) => setEntryPage(e.target.value)} style={s.input} placeholder="e.g. A-1, 42" />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button style={s.btn} onClick={saveSongbookEntry} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            <button style={s.btnSec} onClick={cancelSongbookEntryEdit}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {/* Group entries by songbook */}
                      {songbooks.map(sb => {
                        const entries = getSongSongbookEntries(selectedSong.id).filter(e => e.songbook_id === sb.id);
                        if (entries.length === 0) return null;
                        const sbSections = getSongbookSections(sb.id);
                        return (
                          <div key={sb.id} style={{ marginBottom: '1rem' }}>
                            <div style={{ fontWeight: 'bold', color: '#22c55e', marginBottom: '0.5rem' }}>{sb.name}</div>
                            {entries.map(entry => {
                              const sectionInfo = sbSections.find(s => s.section_code === entry.section);
                              const sectionDisplay = sectionInfo 
                                ? `Section ${sectionInfo.section_code} (${sectionInfo.section_name})`
                                : entry.section ? `Section ${entry.section}` : null;
                              return (
                                <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: '#0f172a', borderRadius: '0.25rem', marginBottom: '0.25rem' }}>
                                  <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                                    {sectionDisplay && `${sectionDisplay} • `}Page {entry.page || 'N/A'}
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button style={s.btnSmall} onClick={() => startEditSongbookEntry(entry)}>Edit</button>
                                    <button style={s.btnDanger} onClick={() => deleteSongbookEntry(entry)}>Delete</button>
                                  </div>
                                </div>
                              );
                            })}
                            <button style={{ ...s.btnSmall, marginTop: '0.25rem' }} onClick={() => { setEntrySongbookId(sb.id); setEntrySection(''); setEntryPage(''); setEditingSongbookEntry({}); }}>+ Add another section</button>
                          </div>
                        );
                      })}
                      {getSongSongbookEntries(selectedSong.id).length === 0 && !editingSongbookEntry && (
                        <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Not in any songbooks yet</div>
                      )}
                    </>
                  )}
                  {songEditTab === 'aliases' && !isAddingNew && (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        {getSongAliases(selectedSong.id).map(alias => (
                          <div key={alias.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', background: '#1e293b', borderRadius: '0.25rem' }}>
                            <span style={{ flex: 1 }}>{alias.alias_title}</span>
                            <button style={s.btnSmall} onClick={() => swapAliasWithTitle(alias)} title="Promote to main title">🔀 Swap</button>
                            <button onClick={() => deleteAlias(alias)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                          </div>
                        ))}
                        {getSongAliases(selectedSong.id).length === 0 && <div style={{ color: '#64748b' }}>No aliases</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}><input type="text" value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="Add alternate title..." style={s.input} /><button style={s.btn} onClick={addAlias} disabled={!newAlias.trim()}>Add</button></div>
                    </>
                  )}
                  {songEditTab === 'groups' && !isAddingNew && (
                    <>
                      {getSongGroups(selectedSong.id).length === 0 ? <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>This song is not part of any groups</div> : getSongGroups(selectedSong.id).map(group => (
                        <div key={group.id} style={s.card}>
                          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{group.group_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{group.group_type}</div>
                          <button style={s.btnSmall} onClick={() => { setMainTab('groups'); selectGroup(group); }}>Edit Group →</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'groups' && (
        <div style={s.content}>
          <div style={s.panel}>
            <input type="text" placeholder="Search groups..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={s.searchInput} />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}><button style={s.btn} onClick={startAddNewGroup}>+ Add Group</button></div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{filteredGroups.length} groups</div>
            <div style={s.songList}>
              {filteredGroups.map(group => (
                <div key={group.id} style={s.songItem(selectedGroup?.id === group.id)} onClick={() => selectGroup(group)}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{group.group_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{group.group_type} • {getGroupMembers(group.id).length} songs</div>
                </div>
              ))}
            </div>
          </div>
          <div style={s.panel}>
            {!selectedGroup && !isAddingNewGroup ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Select a group to edit or click "Add Group"</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{isAddingNewGroup ? 'Add New Group' : formGroupName}</h2>
                  <button style={s.btnSec} onClick={cancelGroupEdit}>✕ Close</button>
                </div>
                {!isAddingNewGroup && (
                  <div style={s.editTabs}>
                    <button style={s.editTab(groupEditTab === 'info')} onClick={() => setGroupEditTab('info')}>Group Info</button>
                    <button style={s.editTab(groupEditTab === 'members')} onClick={() => setGroupEditTab('members')}>Members ({getGroupMembers(selectedGroup.id).length})</button>
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(groupEditTab === 'info' || isAddingNewGroup) && (
                    <>
                      <div style={s.formGroup}><label style={s.label}>Group Name *</label><input type="text" value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} style={s.input} /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={s.formGroup}><label style={s.label}>Group Type</label><select value={formGroupType} onChange={(e) => setFormGroupType(e.target.value)} style={s.select}>{GROUP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                        <div style={s.formGroup}><label style={s.label}>Requestable</label><select value={formGroupRequestable} onChange={(e) => setFormGroupRequestable(e.target.value === 'true')} style={s.select}><option value="true">Yes</option><option value="false">No</option></select></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div style={s.formGroup}><label style={s.label}>Section</label><select value={formGroupSection} onChange={(e) => setFormGroupSection(e.target.value)} style={s.select}>{Object.entries(SECTION_INFO).map(([k, n]) => <option key={k} value={k}>{k} - {n}</option>)}</select></div>
                        <div style={s.formGroup}><label style={s.label}>Page</label><input type="text" value={formGroupPage} onChange={(e) => setFormGroupPage(e.target.value)} style={s.input} placeholder="e.g. S-1" /></div>
                        <div style={s.formGroup}><label style={s.label}>Old Page</label><input type="text" value={formGroupOldPage} onChange={(e) => setFormGroupOldPage(e.target.value)} style={s.input} /></div>
                      </div>
                      <div style={s.formGroup}><label style={s.label}>Instructions</label><textarea value={formGroupInstructions} onChange={(e) => setFormGroupInstructions(e.target.value)} style={s.textarea} placeholder="How to sing this group..." /></div>
                      <button style={s.btn} onClick={saveGroupInfo} disabled={saving}>{saving ? 'Saving...' : (isAddingNewGroup ? 'Create Group' : 'Save Changes')}</button>
                    </>
                  )}
                  {groupEditTab === 'members' && !isAddingNewGroup && (
                    <>
                      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={startAddMember}>+ Add Member Song</button>
                      {editingMember && (
                        <div style={{ ...s.card, border: '1px solid #22c55e', marginBottom: '1rem' }}>
                          <div style={s.formGroup}><label style={s.label}>Song *</label><select value={memberSongId} onChange={(e) => setMemberSongId(e.target.value)} style={s.select}><option value="">Select a song...</option>{allSongs.map(so => <option key={so.id} value={so.id}>{so.title}</option>)}</select></div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={s.formGroup}><label style={s.label}>Position</label><input type="number" value={memberPosition} onChange={(e) => setMemberPosition(parseInt(e.target.value) || 1)} style={s.input} min="1" /></div>
                            <div style={s.formGroup}><label style={s.label}>Role</label><select value={memberRole} onChange={(e) => setMemberRole(e.target.value)} style={s.select}>{MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                          </div>
                          <div style={s.formGroup}><label style={s.label}>Fragment Lyrics</label><textarea value={memberFragmentLyrics} onChange={(e) => setMemberFragmentLyrics(e.target.value)} style={s.textarea} placeholder="Shortened lyrics..." /></div>
                          <div style={s.formGroup}><label style={s.label}>Specific Instructions</label><textarea value={memberInstructions} onChange={(e) => setMemberInstructions(e.target.value)} style={{ ...s.textarea, minHeight: '80px' }} /></div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}><button style={s.btn} onClick={saveMember} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button><button style={s.btnSec} onClick={cancelMemberEdit}>Cancel</button></div>
                        </div>
                      )}
                      {getGroupMembers(selectedGroup.id).map(member => {
                        const so = allSongs.find(x => x.id === member.song_id);
                        return (
                          <div key={member.id} style={s.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div><div style={{ fontWeight: 'bold' }}>{member.position_in_group}. {so?.title || 'Unknown'}</div><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Role: {member.member_role || 'default'}{member.fragment_lyrics && ' • Has fragment lyrics'}</div></div>
                              <div style={{ display: 'flex', gap: '0.25rem' }}><button style={s.btnSmall} onClick={() => startEditMember(member)}>Edit</button><button style={s.btnDanger} onClick={() => deleteMember(member)}>Remove</button></div>
                            </div>
                            {member.fragment_lyrics && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', whiteSpace: 'pre-wrap', maxHeight: '80px', overflow: 'hidden' }}>{member.fragment_lyrics.substring(0, 150)}...</div>}
                          </div>
                        );
                      })}
                      {getGroupMembers(selectedGroup.id).length === 0 && !editingMember && <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No members yet</div>}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'songbooks' && (
        <div style={s.content}>
          <div style={s.panel}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button style={s.btn} onClick={startAddNewSongbook}>+ Add Songbook</button>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{songbooks.length} songbooks</div>
            <div style={s.songList}>
              {songbooks.map(sb => (
                <div key={sb.id} style={s.songItem(selectedSongbook?.id === sb.id)} onClick={() => selectSongbook(sb)}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{sb.name} {sb.is_primary && <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>★ Primary</span>}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {sb.short_name} • {songbookEntries.filter(e => e.songbook_id === sb.id).length} songs
                    {sb.has_sections && ' • Has sections'}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={s.panel}>
            {!selectedSongbook && !isAddingNewSongbook ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Select a songbook to edit or click "Add Songbook"</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{isAddingNewSongbook ? 'Add New Songbook' : formSongbookName}</h2>
                  <button style={s.btnSec} onClick={cancelSongbookEdit}>✕ Close</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={s.formGroup}>
                    <label style={s.label}>Name *</label>
                    <input type="text" value={formSongbookName} onChange={(e) => setFormSongbookName(e.target.value)} style={s.input} placeholder="e.g. Dodger's Songbook 2025" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={s.formGroup}>
                      <label style={s.label}>Short Name *</label>
                      <input type="text" value={formSongbookShortName} onChange={(e) => setFormSongbookShortName(e.target.value)} style={s.input} placeholder="e.g. 2025" />
                    </div>
                    <div style={s.formGroup}>
                      <label style={s.label}>Display Order</label>
                      <input type="number" value={formSongbookDisplayOrder} onChange={(e) => setFormSongbookDisplayOrder(e.target.value)} style={s.input} />
                    </div>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Description</label>
                    <textarea value={formSongbookDescription} onChange={(e) => setFormSongbookDescription(e.target.value)} style={s.textarea} placeholder="Optional description..." />
                  </div>
                  <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={formSongbookHasSections} onChange={(e) => setFormSongbookHasSections(e.target.checked)} />
                      <span>Has section letters (A-Z)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={formSongbookIsPrimary} onChange={(e) => setFormSongbookIsPrimary(e.target.checked)} />
                      <span>Primary songbook</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button style={s.btn} onClick={saveSongbook} disabled={saving}>{saving ? 'Saving...' : (isAddingNewSongbook ? 'Create Songbook' : 'Save Changes')}</button>
                    {!isAddingNewSongbook && <button style={s.btnDanger} onClick={deleteSongbook}>Delete Songbook</button>}
                  </div>
                  
                  {!isAddingNewSongbook && (
                    <>
                      <hr style={{ margin: '2rem 0', borderColor: '#334155' }} />
                      <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>Songs in this Songbook ({songbookEntries.filter(e => e.songbook_id === selectedSongbook.id).length})</h3>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {songbookEntries.filter(e => e.songbook_id === selectedSongbook.id).map(entry => {
                          const song = allSongs.find(s => s.id === entry.song_id);
                          const group = songGroups.find(g => g.id === entry.song_group_id);
                          return (
                            <div key={entry.id} style={{ padding: '0.5rem', background: '#0f172a', borderRadius: '0.25rem', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{song?.title || group?.group_name || 'Unknown'}</span>
                              <span style={{ color: '#94a3b8' }}>{entry.section && `${entry.section}-`}{entry.page}</span>
                            </div>
                          );
                        })}
                        {songbookEntries.filter(e => e.songbook_id === selectedSongbook.id).length === 0 && (
                          <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>No songs in this songbook yet</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'duplicates' && (
        <div style={s.content}>
          <div style={s.panel}>
            {autoDetectedDuplicates.length > 0 && (
              <div style={{ background: '#3b82f622', border: '1px solid #3b82f6', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '0.5rem' }}>
                  🔍 Auto-Detected ({autoDetectedDuplicates.length})
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {autoDetectedDuplicates.slice(0, 10).map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: '#1e293b', borderRadius: '0.25rem', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <div><strong>{d.songA.title}</strong> ↔ <strong>{d.songB.title}</strong></div>
                        <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{d.reason}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        <button style={s.btnSmall} onClick={() => saveAutoDetectedDuplicate(d.songA, d.songB, d.reason)}>Review</button>
                        <button style={{ ...s.btnSmall, background: '#334155' }} onClick={() => dismissAutoDetected(d.songA, d.songB)}>Dismiss</button>
                      </div>
                    </div>
                  ))}
                  {autoDetectedDuplicates.length > 10 && (
                    <div style={{ color: '#64748b', fontSize: '0.7rem', textAlign: 'center', padding: '0.5rem' }}>
                      + {autoDetectedDuplicates.length - 10} more suggestions
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <select value={duplicateStatusFilter} onChange={(e) => setDuplicateStatusFilter(e.target.value)} style={s.select}>
                <option value="pending">Pending Review</option>
                <option value="confirmed">Confirmed</option>
                <option value="not_duplicate">Not Duplicates</option>
                <option value="merged">Merged</option>
                <option value="all">All</option>
              </select>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{filteredDuplicates.length} items</div>
            <div style={s.songList}>
              {filteredDuplicates.map(dup => {
                const songA = allSongs.find(s => s.id === dup.song_id_a);
                const songB = allSongs.find(s => s.id === dup.song_id_b);
                return (
                  <div key={dup.id} style={s.songItem(selectedDuplicate?.id === dup.id)} onClick={() => selectDuplicateForReview(dup)}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{songA?.title || 'Unknown'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      → {songB?.title || '(not specified)'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: dup.status === 'pending' ? '#f59e0b' : dup.status === 'merged' ? '#22c55e' : '#64748b', marginTop: '0.25rem' }}>
                      {dup.status} {dup.suggested_by === 'auto' && '• auto-detected'}
                    </div>
                  </div>
                );
              })}
              {filteredDuplicates.length === 0 && <div style={{ color: '#64748b', padding: '1rem', textAlign: 'center' }}>No duplicates found</div>}
            </div>
          </div>
          <div style={s.panel}>
            {!selectedDuplicate ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Select a duplicate to review</div>
            ) : (() => {
              const songA = allSongs.find(s => s.id === selectedDuplicate.song_id_a);
              const songB = allSongs.find(s => s.id === selectedDuplicate.song_id_b);
              const songAVersions = getSongVersions(selectedDuplicate.song_id_a);
              const songBVersions = songB ? getSongVersions(selectedDuplicate.song_id_b) : [];
              const songANotes = getSongNotes(selectedDuplicate.song_id_a);
              const songBNotes = songB ? getSongNotes(selectedDuplicate.song_id_b) : [];
              const songAMedia = getSongMedia(selectedDuplicate.song_id_a);
              const songBMedia = songB ? getSongMedia(selectedDuplicate.song_id_b) : [];
              const songAGroups = getSongGroups(selectedDuplicate.song_id_a);
              const songBGroups = songB ? getSongGroups(selectedDuplicate.song_id_b) : [];
              
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Compare Songs</h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button style={s.btnSec} onClick={() => setSelectedDuplicate(null)}>✕ Close</button>
                    </div>
                  </div>
                  
                  {selectedDuplicate.notes && (
                    <div style={{ background: '#1e293b', padding: '0.5rem', borderRadius: '0.25rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
                      <strong>Notes:</strong> {selectedDuplicate.notes}
                    </div>
                  )}
                  
                  {selectedDuplicate.status === 'pending' && songB && (
                    <div style={{ background: '#22c55e22', border: '1px solid #22c55e', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Choose primary song (the one to keep):</div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          style={{ ...s.btn, flex: 1, background: mergePrimarySongId === songA?.id ? '#22c55e' : '#334155' }} 
                          onClick={() => setMergePrimarySongId(songA?.id)}
                        >
                          Keep "{songA?.title}"
                        </button>
                        <button 
                          style={{ ...s.btn, flex: 1, background: mergePrimarySongId === songB?.id ? '#22c55e' : '#334155' }} 
                          onClick={() => setMergePrimarySongId(songB?.id)}
                        >
                          Keep "{songB?.title}"
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ display: 'grid', gridTemplateColumns: songB ? '1fr 1fr' : '1fr', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Song A */}
                    <div style={{ background: '#0f172a', borderRadius: '0.5rem', padding: '1rem', border: mergePrimarySongId === songA?.id ? '2px solid #22c55e' : '1px solid #334155' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.5rem' }}>{songA?.title || 'Unknown'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                        Section {songA?.section} • Page {songA?.page || 'N/A'}
                      </div>
                      {songA?.author && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Author: {songA.author}</div>}
                      {songA?.year_written && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Year: {songA.year_written}</div>}
                      <div style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
                        <div style={{ color: '#64748b' }}>📄 {songAVersions.length} version(s) • 📝 {songANotes.length} note(s) • 🎵 {songAMedia.length} media • 👥 {songAGroups.length} group(s)</div>
                        {songAGroups.length > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                            Groups: {songAGroups.map(g => g.group_name).join(', ')}
                          </div>
                        )}
                      </div>
                      {songAVersions.length > 0 && (
                        <div style={{ marginTop: '0.5rem', background: '#1e293b', padding: '0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', maxHeight: '100px', overflow: 'auto' }}>
                          {songAVersions[0]?.lyrics_content?.substring(0, 200)}...
                        </div>
                      )}
                      <button style={{ ...s.btnSmall, marginTop: '0.5rem' }} onClick={() => { setMainTab('songs'); selectSong(songA); }}>View Full Song →</button>
                    </div>
                    
                    {/* Song B */}
                    {songB ? (
                      <div style={{ background: '#0f172a', borderRadius: '0.5rem', padding: '1rem', border: mergePrimarySongId === songB?.id ? '2px solid #22c55e' : '1px solid #334155' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.5rem' }}>{songB?.title || 'Unknown'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                          Section {songB?.section} • Page {songB?.page || 'N/A'}
                        </div>
                        {songB?.author && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Author: {songB.author}</div>}
                        {songB?.year_written && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Year: {songB.year_written}</div>}
                        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
                          <div style={{ color: '#64748b' }}>📄 {songBVersions.length} version(s) • 📝 {songBNotes.length} note(s) • 🎵 {songBMedia.length} media • 👥 {songBGroups.length} group(s)</div>
                          {songBGroups.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                              Groups: {songBGroups.map(g => g.group_name).join(', ')}
                            </div>
                          )}
                        </div>
                        {songBVersions.length > 0 && (
                          <div style={{ marginTop: '0.5rem', background: '#1e293b', padding: '0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', maxHeight: '100px', overflow: 'auto' }}>
                            {songBVersions[0]?.lyrics_content?.substring(0, 200)}...
                          </div>
                        )}
                        <button style={{ ...s.btnSmall, marginTop: '0.5rem' }} onClick={() => { setMainTab('songs'); selectSong(songB); }}>View Full Song →</button>
                      </div>
                    ) : (
                      <div style={{ background: '#0f172a', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                        Other song not specified
                      </div>
                    )}
                  </div>
                  
                  {selectedDuplicate.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button style={s.btnSec} onClick={() => dismissDuplicate(selectedDuplicate)}>Not a Duplicate</button>
                      {songB && <button style={s.btn} onClick={mergeDuplicates} disabled={saving || !mergePrimarySongId}>{saving ? 'Merging...' : 'Merge Songs'}</button>}
                    </div>
                  )}
                  
                  {selectedDuplicate.status !== 'pending' && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>
                      This duplicate was marked as "{selectedDuplicate.status}" 
                      {selectedDuplicate.resolved_by && ` by ${selectedDuplicate.resolved_by}`}
                      {selectedDuplicate.resolved_at && ` on ${new Date(selectedDuplicate.resolved_at).toLocaleDateString()}`}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {mainTab === 'changelog' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={s.panel}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div><label style={s.label}>Table</label><select value={logTableFilter} onChange={(e) => setLogTableFilter(e.target.value)} style={s.select}><option value="all">All</option><option value="songs">Songs</option><option value="song_versions">Versions</option><option value="song_version_attributes">Version Attributes</option><option value="song_notes">Notes</option><option value="song_flags">Flags</option><option value="song_media">Media</option><option value="song_groups">Groups</option><option value="song_group_members">Members</option><option value="song_sections">Sections</option><option value="song_aliases">Aliases</option><option value="songbooks">Songbooks</option><option value="song_songbook_entries">Songbook Entries</option><option value="potential_duplicates">Duplicates</option></select></div>
              <div><label style={s.label}>User</label><input type="text" value={logUserFilter} onChange={(e) => setLogUserFilter(e.target.value)} placeholder="Filter..." style={s.input} /></div>
              <div><label style={s.label}>Limit</label><select value={logLimit} onChange={(e) => { setLogLimit(parseInt(e.target.value)); loadAllData(); }} style={s.select}><option value="50">50</option><option value="100">100</option><option value="250">250</option></select></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead><tr>{['Time', 'Action', 'Table', 'Song/Item', 'Field', 'Old', 'New', 'By'].map(h => <th key={h} style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '1px solid #334155', color: '#94a3b8' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredChangeLog.map(log => (
                    <tr key={log.id}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155' }}>{new Date(log.created_at).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155' }}><span style={{ padding: '0.125rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', background: log.action === 'add' ? '#22c55e33' : log.action === 'delete' ? '#dc262633' : '#3b82f633', color: log.action === 'add' ? '#22c55e' : log.action === 'delete' ? '#dc2626' : '#3b82f6' }}>{log.action}</span></td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155' }}>{log.table_name || 'songs'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155' }}>{log.song_title}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155' }}>{log.field_changed || '-'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.old_value || '-'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.new_value || '-'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #334155' }}>{log.changed_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredChangeLog.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No changes found</div>}
          </div>
        </div>
      )}

      {/* Duplicate Flag Modal */}
      {showDuplicateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: '0.5rem', padding: '1.5rem', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Flag "{selectedSong?.title}" as Potential Duplicate</h3>
            <div style={s.formGroup}>
              <label style={s.label}>Duplicate of (optional)</label>
              <input 
                type="text" 
                value={duplicateSearchTerm} 
                onChange={(e) => { setDuplicateSearchTerm(e.target.value); setSelectedDuplicateOf(null); }} 
                placeholder="Search for the other song..." 
                style={s.input} 
              />
              {duplicateSearchTerm && !selectedDuplicateOf && (
                <div style={{ maxHeight: '150px', overflow: 'auto', background: '#0f172a', borderRadius: '0.25rem', marginTop: '0.25rem' }}>
                  {allSongs.filter(s => s.id !== selectedSong?.id && s.title.toLowerCase().includes(duplicateSearchTerm.toLowerCase())).slice(0, 10).map(song => (
                    <div 
                      key={song.id} 
                      onClick={() => { setSelectedDuplicateOf(song); setDuplicateSearchTerm(song.title); }}
                      style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #334155' }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#334155'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {song.title} <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({song.section}-{song.page})</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedDuplicateOf && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#22c55e22', borderRadius: '0.25rem', fontSize: '0.8rem' }}>
                  Selected: <strong>{selectedDuplicateOf.title}</strong>
                </div>
              )}
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Notes (optional)</label>
              <textarea 
                value={duplicateNotes} 
                onChange={(e) => setDuplicateNotes(e.target.value)} 
                style={s.textarea} 
                placeholder="Any additional context..." 
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button style={s.btnSec} onClick={closeDuplicateModal}>Cancel</button>
              <button style={s.btn} onClick={saveDuplicateFlag} disabled={saving}>{saving ? 'Saving...' : 'Flag as Duplicate'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
