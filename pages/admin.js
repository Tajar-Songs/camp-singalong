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

  useEffect(() => { loadAllData(); }, []);
  useEffect(() => { if (sessionName) localStorage.setItem('camp_admin_name', sessionName); }, [sessionName]);

  const loadAllData = async () => {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
      const [songsRes, versionsRes, notesRes, sectionsRes, aliasesRes, groupsRes, membersRes, entriesRes, logRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_versions?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_notes?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_sections?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_aliases?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_groups?select=*&order=group_name.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_group_members?select=*&order=position_in_group.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/song_songbook_entries?select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/change_log?select=*&order=created_at.desc&limit=${logLimit}`, { headers })
      ]);
      setAllSongs(await songsRes.json());
      setSongVersions(await versionsRes.json());
      setSongNotes(await notesRes.json());
      setSongSections(await sectionsRes.json());
      setSongAliases(await aliasesRes.json());
      setSongGroups(await groupsRes.json());
      setSongGroupMembers(await membersRes.json());
      setSongbookEntries(await entriesRes.json());
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
  const getSongNotes = (songId) => songNotes.filter(n => n.song_id === songId);
  const getSongSections = (songId) => songSections.filter(s => s.song_id === songId);
  const getSongAliases = (songId) => songAliases.filter(a => a.song_id === songId);
  const getSongGroups = (songId) => songGroupMembers.filter(m => m.song_id === songId).map(m => songGroups.find(g => g.id === m.group_id)).filter(Boolean);
  const getGroupMembers = (groupId) => songGroupMembers.filter(m => m.group_id === groupId).sort((a, b) => a.position_in_group - b.position_in_group);
  const getGroupPage = (groupId) => songbookEntries.find(e => e.song_group_id === groupId);

  const selectSong = (song) => {
    setSelectedSong(song); setSelectedGroup(null); setIsAddingNew(false);
    setFormTitle(song.title); setFormPage(song.page || ''); setFormOldPage(song.old_page || '');
    setFormSection(song.section || 'A'); setFormYearWritten(song.year_written || '');
    setFormLyrics(getDefaultVersion(song.id)?.lyrics_content || ''); setSongEditTab('basic');
  };

  const startAddNewSong = () => {
    setSelectedSong(null); setSelectedGroup(null); setIsAddingNew(true);
    setFormTitle(''); setFormPage(''); setFormOldPage(''); setFormSection('A'); setFormYearWritten(''); setFormLyrics(''); setSongEditTab('basic');
  };

  const cancelSongEdit = () => { setSelectedSong(null); setIsAddingNew(false); };

  const saveSongBasic = async () => {
    if (!sessionName.trim()) { showMessage('❌ Please enter your name first'); return; }
    if (!formTitle.trim()) { showMessage('❌ Title is required'); return; }
    setSaving(true);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const songData = { title: formTitle.trim(), page: formPage.trim() || null, old_page: formOldPage.trim() || null, section: formSection, year_written: formYearWritten ? parseInt(formYearWritten) : null };
      if (isAddingNew) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/songs`, { method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify(songData) });
        if (response.ok) { const created = await response.json(); await logChange('add', 'songs', created[0].id, created[0].title); showMessage('✅ Song added!'); setIsAddingNew(false); await loadAllData(); selectSong(created[0]); }
      } else {
        if (selectedSong.title !== songData.title) await logChange('edit', 'songs', selectedSong.id, songData.title, 'title', selectedSong.title, songData.title);
        if (selectedSong.page !== songData.page) await logChange('edit', 'songs', selectedSong.id, songData.title, 'page', selectedSong.page, songData.page);
        if (selectedSong.section !== songData.section) await logChange('edit', 'songs', selectedSong.id, songData.title, 'section', selectedSong.section, songData.section);
        if (selectedSong.year_written !== songData.year_written) await logChange('edit', 'songs', selectedSong.id, songData.title, 'year_written', selectedSong.year_written, songData.year_written);
        await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${selectedSong.id}`, { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(songData) });
        showMessage('✅ Song updated!'); await loadAllData(); setSelectedSong({ ...selectedSong, ...songData });
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
    if (sectionFilter !== 'all' && song.section !== sectionFilter) return false;
    const search = searchTerm.toLowerCase(); 
    if (!search) return true; 
    return song.title?.toLowerCase().includes(search) || song.page?.toLowerCase().includes(search) || song.section?.toLowerCase().includes(search); 
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

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🎵 Song Admin</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Your name:</span>
          <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="Enter your name" style={s.nameInput} />
        </div>
      </div>

      {message && <div style={s.msg}>{message}</div>}

      <div style={s.mainTabs}>
        <button style={s.mainTab(mainTab === 'songs')} onClick={() => setMainTab('songs')}>Songs</button>
        <button style={s.mainTab(mainTab === 'groups')} onClick={() => setMainTab('groups')}>Groups</button>
        <button style={s.mainTab(mainTab === 'changelog')} onClick={() => setMainTab('changelog')}>Change Log</button>
      </div>

      {mainTab === 'songs' && (
        <div style={s.content}>
          <div style={s.panel}>
            <input type="text" placeholder="Search songs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={s.searchInput} />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={{ ...s.select, flex: 1 }}>
                <option value="all">All Sections</option>
                {Object.entries(SECTION_INFO).map(([k, n]) => <option key={k} value={k}>{k} - {n}</option>)}
              </select>
              <button style={s.btn} onClick={startAddNewSong}>+ Add Song</button>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>{filteredSongs.length} songs</div>
            <div style={s.songList}>
              {filteredSongs.map(song => (
                <div key={song.id} style={s.songItem(selectedSong?.id === song.id)} onClick={() => selectSong(song)}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{song.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Section {song.section} • Page {song.page || 'N/A'}{getDefaultVersion(song.id)?.lyrics_content && ' 📄'}</div>
                </div>
              ))}
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
                    <button style={s.editTab(songEditTab === 'lyrics')} onClick={() => setSongEditTab('lyrics')}>Lyrics</button>
                    <button style={s.editTab(songEditTab === 'notes')} onClick={() => setSongEditTab('notes')}>Notes ({getSongNotes(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'sections')} onClick={() => setSongEditTab('sections')}>Sections</button>
                    <button style={s.editTab(songEditTab === 'aliases')} onClick={() => setSongEditTab('aliases')}>Aliases ({getSongAliases(selectedSong.id).length})</button>
                    <button style={s.editTab(songEditTab === 'groups')} onClick={() => setSongEditTab('groups')}>Groups ({getSongGroups(selectedSong.id).length})</button>
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(songEditTab === 'basic' || isAddingNew) && (
                    <>
                      <div style={s.formGroup}><label style={s.label}>Title *</label><input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} style={s.input} /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div style={s.formGroup}><label style={s.label}>Section</label><select value={formSection} onChange={(e) => setFormSection(e.target.value)} style={s.select}>{Object.entries(SECTION_INFO).map(([k, n]) => <option key={k} value={k}>{k} - {n}</option>)}</select></div>
                        <div style={s.formGroup}><label style={s.label}>Page</label><input type="text" value={formPage} onChange={(e) => setFormPage(e.target.value)} style={s.input} placeholder="e.g. A-1" /></div>
                        <div style={s.formGroup}><label style={s.label}>Old Page</label><input type="text" value={formOldPage} onChange={(e) => setFormOldPage(e.target.value)} style={s.input} /></div>
                      </div>
                      <div style={s.formGroup}><label style={s.label}>Year Written</label><input type="number" value={formYearWritten} onChange={(e) => setFormYearWritten(e.target.value)} style={{ ...s.input, width: '150px' }} placeholder="e.g. 1965" /></div>
                      <button style={s.btn} onClick={saveSongBasic} disabled={saving}>{saving ? 'Saving...' : (isAddingNew ? 'Create Song' : 'Save Changes')}</button>
                    </>
                  )}
                  {songEditTab === 'lyrics' && !isAddingNew && (
                    <>
                      <div style={s.formGroup}><label style={s.label}>Lyrics</label><textarea value={formLyrics} onChange={(e) => setFormLyrics(e.target.value)} style={{ ...s.textarea, minHeight: '400px' }} placeholder="Enter lyrics here..." /></div>
                      <button style={s.btn} onClick={saveSongLyrics} disabled={saving}>{saving ? 'Saving...' : 'Save Lyrics'}</button>
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
                  {songEditTab === 'sections' && !isAddingNew && (
                    <>
                      <div style={{ marginBottom: '1rem' }}><div style={{ fontSize: '0.875rem' }}><strong>Primary:</strong> Section {selectedSong.section} ({SECTION_INFO[selectedSong.section]}) - Page {selectedSong.page || 'N/A'}</div></div>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Secondary Sections</h4>
                      {getSongSections(selectedSong.id).filter(sec => !sec.is_primary).map(sec => (
                        <div key={sec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: '#0f172a', borderRadius: '0.25rem', marginBottom: '0.25rem' }}>
                          <span>Section {sec.section} ({SECTION_INFO[sec.section]}) - Page {sec.page || 'N/A'}</span>
                          <button style={s.btnDanger} onClick={() => deleteSecondarySection(sec)}>Remove</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <select value={newSecondarySection} onChange={(e) => setNewSecondarySection(e.target.value)} style={{ ...s.select, width: 'auto' }}>
                          <option value="">Add section...</option>
                          {Object.entries(SECTION_INFO).map(([k, n]) => <option key={k} value={k}>{k} - {n}</option>)}
                        </select>
                        <input type="text" value={newSecondaryPage} onChange={(e) => setNewSecondaryPage(e.target.value)} placeholder="Page" style={{ ...s.input, width: '100px' }} />
                        <button style={s.btn} onClick={addSecondarySection} disabled={!newSecondarySection}>Add</button>
                      </div>
                    </>
                  )}
                  {songEditTab === 'aliases' && !isAddingNew && (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        {getSongAliases(selectedSong.id).map(alias => (<span key={alias.id} style={s.tag}>{alias.alias_title}<button onClick={() => deleteAlias(alias)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button></span>))}
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

      {mainTab === 'changelog' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={s.panel}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div><label style={s.label}>Table</label><select value={logTableFilter} onChange={(e) => setLogTableFilter(e.target.value)} style={s.select}><option value="all">All</option><option value="songs">Songs</option><option value="song_versions">Lyrics</option><option value="song_notes">Notes</option><option value="song_groups">Groups</option><option value="song_group_members">Members</option><option value="song_sections">Sections</option><option value="song_aliases">Aliases</option></select></div>
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
    </div>
  );
}
