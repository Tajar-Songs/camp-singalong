// GET /api/songs - List all songs with basic info
// Optional: ?songbook=UUID to filter by songbook

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch songs
    const songsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/songs?select=id,title,attribution,aka,is_medley,is_round,notes,created_at,updated_at&order=title.asc&limit=1000`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    
    if (!songsRes.ok) {
      const errorText = await songsRes.text();
      return res.status(500).json({ error: 'Supabase songs fetch failed', status: songsRes.status, details: errorText });
    }
    
    const songs = await songsRes.json();
    
    if (!Array.isArray(songs)) {
      return res.status(500).json({ error: 'Songs response not an array', received: typeof songs, data: songs });
    }

    // Fetch songbook entries
    const entriesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_songbook_entries?select=song_id,songbook_id,section,page&limit=10000`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const entries = await entriesRes.json();

    // Fetch song tags
    const tagsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/song_tags?select=song_id,tag&limit=10000`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const tags = await tagsRes.json();

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

    // Build enriched song list
    const enrichedSongs = songs.map(song => {
      const songEntries = (Array.isArray(entries) ? entries : []).filter(e => e.song_id === song.id);
      const songTags = (Array.isArray(tags) ? tags : []).filter(t => t.song_id === song.id).map(t => t.tag);
      
      return {
        id: song.id,
        title: song.title,
        attribution: song.attribution,
        aka: song.aka,
        is_medley: song.is_medley,
        is_round: song.is_round,
        tags: songTags,
        songbooks: songEntries.map(e => ({
          songbook: songbookMap[e.songbook_id] || e.songbook_id,
          section: e.section,
          page: e.page
        }))
      };
    });

    // Filter by songbook if specified
    const { songbook } = req.query;
    let result = enrichedSongs;
    if (songbook) {
      result = enrichedSongs.filter(s => 
        s.songbooks.some(sb => sb.songbook === songbook || sb.songbook_id === songbook)
      );
    }

    res.status(200).json({
      count: result.length,
      songs: result
    });
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({ error: 'Failed to fetch songs', message: error.message });
  }
}
