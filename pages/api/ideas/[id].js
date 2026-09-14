// GET /api/ideas/[id] - Get a specific feedback/idea item, with its comments
// and (if it's a poll) its options and vote counts.

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    const [itemRes, commentsRes, votesRes, optionsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/feature_requests?id=eq.${id}&select=*`, { headers, cache: 'no-store' }),
      fetch(`${SUPABASE_URL}/rest/v1/feature_comments?request_id=eq.${id}&select=comment,created_at,user_profiles(display_name)&order=created_at.asc`, { headers, cache: 'no-store' }),
      fetch(`${SUPABASE_URL}/rest/v1/feature_votes?request_id=eq.${id}&select=user_id`, { headers, cache: 'no-store' }),
      fetch(`${SUPABASE_URL}/rest/v1/feature_request_options?request_id=eq.${id}&select=id,option_text,display_order&order=display_order.asc`, { headers, cache: 'no-store' })
    ]);

    const itemData = await itemRes.json();
    if (!Array.isArray(itemData) || itemData.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const item = itemData[0];

    const commentsData = await commentsRes.json();
    const comments = Array.isArray(commentsData) ? commentsData.map(c => ({
      author: c.user_profiles?.display_name || 'Unknown',
      comment: c.comment,
      created_at: c.created_at
    })) : [];

    const votesData = await votesRes.json();
    const vote_count = Array.isArray(votesData) ? votesData.length : 0;

    const optionsData = await optionsRes.json();
    let options = null;
    if (Array.isArray(optionsData) && optionsData.length > 0) {
      // Aggregate vote counts via the same anonymized RPC the app uses -
      // never exposes who voted for what, only totals.
      const countsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_poll_vote_counts`, { method: 'POST', headers, cache: 'no-store' });
      const countsData = await countsRes.json();
      const countsByOption = {};
      if (Array.isArray(countsData)) {
        countsData.forEach(row => { countsByOption[row.option_id] = Number(row.vote_count); });
      }
      options = optionsData.map(o => ({
        option_text: o.option_text,
        vote_count: countsByOption[o.id] || 0
      }));
    }

    // Explicit no-cache: nothing between this server and the client should
    // ever serve a cached copy of this response. Matches the fix already
    // applied to /api/docs/[slug] and /api/ideas.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    res.status(200).json({
      id: item.id,
      title: item.title,
      description: item.description,
      type: item.request_type,
      status: item.status,
      vote_count,
      created_at: item.created_at,
      comments,
      options
    });
  } catch (error) {
    console.error('Error fetching idea:', error);
    res.status(500).json({ error: 'Failed to fetch idea' });
  }
}
