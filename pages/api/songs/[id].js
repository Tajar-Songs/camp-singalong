// GET /api/songs/[id] - Get a specific song with all details

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Song ID is required' });
  }

  try {
    // Fetch the song
    const songRes = await fetch(
      `${SUPABASE_URL}/rest/v1/songs?id=eq.${id}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const songs = await songRes.json();

    if (!Array.isArray(songs) || songs.length === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    const song = songs[0];

    // Fetch songbook entries
    const entriesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_songbook_entries?song_id=eq.${id}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const entries = await entriesRes.json();

    // Fetch songbooks for names
    const songbooksRes = await fetch(
      `${SUPABASE_URL}/rest/v1/songbooks?select=id,name`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const songbooks = await songbooksRes.json();
    const songbookMap = {};
    if (Array.isArray(songbooks)) {
      songbooks.forEach(sb => { songbookMap[sb.id] = sb.name; });
    }

    // Fetch tags
    const tagsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_tags?song_id=eq.${id}&select=tag`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const tags = await tagsRes.json();

    // Fetch versions
    const versionsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_versions?song_id=eq.${id}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const versions = await versionsRes.json();

    // Fetch aliases
    const aliasesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_aliases?song_id=eq.${id}&select=alias`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const aliases = await aliasesRes.json();

    // Fetch notes
    const notesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_notes?song_id=eq.${id}&select=*&order=created_at.desc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const notes = await notesRes.json();

    // Fetch group memberships
    const groupMembersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_group_members?song_id=eq.${id}&select=group_id,position`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const groupMembers = await groupMembersRes.json();

    // If in groups, fetch group info
    let groups = [];
    if (Array.isArray(groupMembers) && groupMembers.length > 0) {
      const groupIds = groupMembers.map(gm => gm.group_id);
      const groupsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/song_groups?id=in.(${groupIds.join(',')})&select=id,name,group_type`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const groupsData = await groupsRes.json();
      if (Array.isArray(groupsData)) {
        groups = groupsData.map(g => ({
          id: g.id,
          name: g.name,
          type: g.group_type,
          position: groupMembers.find(gm => gm.group_id === g.id)?.position
        }));
      }
    }

    res.status(200).json({
      id: song.id,
      title: song.title,
      attribution: song.attribution,
      aka: song.aka,
      is_medley: song.is_medley,
      is_round: song.is_round,
      notes_field: song.notes,
      created_at: song.created_at,
      updated_at: song.updated_at,
      tags: Array.isArray(tags) ? tags.map(t => t.tag) : [],
      aliases: Array.isArray(aliases) ? aliases.map(a => a.alias) : [],
      songbooks: Array.isArray(entries) ? entries.map(e => ({
        songbook: songbookMap[e.songbook_id] || e.songbook_id,
        songbook_id: e.songbook_id,
        section: e.section,
        page: e.page
      })) : [],
      versions: Array.isArray(versions) ? versions.map(v => ({
        id: v.id,
        label: v.label,
        lyrics: v.lyrics,
        performance_notes: v.performance_notes,
        source: v.source,
        is_default: v.is_default
      })) : [],
      notes: Array.isArray(notes) ? notes.map(n => ({
        id: n.id,
        note: n.note,
        note_type: n.note_type,
        visibility: n.visibility,
        created_at: n.created_at
      })) : [],
      groups: groups
    });
  } catch (error) {
    console.error('Error fetching song:', error);
    res.status(500).json({ error: 'Failed to fetch song' });
  }
}
