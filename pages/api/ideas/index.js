// GET /api/ideas - List all feedback/ideas board items
// Optional query params: ?type=needs_input (filter by request_type)

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';
const SITE_URL = 'https://www.tajar.fun';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type } = req.query;

    let url = `${SUPABASE_URL}/rest/v1/feature_requests?select=id,title,description,request_type,status,created_at&order=created_at.desc`;

    if (type) {
      url += `&request_type=eq.${type}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      // Explicit no-cache on the outgoing fetch to Supabase - without this,
      // Next.js can cache the fetch() result itself (separate from the
      // Cache-Control header below, which only controls caching between
      // this API route and its callers).
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch ideas');
    }

    const items = await response.json();

    // Explicit no-cache: nothing between this server and the client should
    // ever serve a cached copy of this response. Newly-created items were
    // previously missing from this endpoint until a fresh (uncached) fetch
    // happened to occur - this was the bug, mirroring the same fix already
    // applied to /api/docs/[slug].
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    res.status(200).json({
      count: items.length,
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        type: item.request_type,
        status: item.status,
        url: `${SITE_URL}/api/ideas/${item.id}`,
        created_at: item.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching ideas:', error);
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
}
