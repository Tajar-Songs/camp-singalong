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

    // Read through the feedback views: names appear only when the person
    // shares them, votes only as a total, and nothing in the trash.
    const [itemRes, commentsRes, optionsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/feedback_items?id=eq.${id}&deleted_at=is.null&select=id,title,description,request_type,status,vote_count,author_name,created_at,edited_at`, { headers, cache: 'no-store' }),
      fetch(`${SUPABASE_URL}/rest/v1/feedback_comments?request_id=eq.${id}&deleted_at=is.null&select=comment,as_admin,author_name,created_at,edited_at&order=created_at.asc`, { headers, cache: 'no-store' }),
      fetch(`${SUPABASE_URL}/rest/v1/feature_request_options?request_id=eq.${id}&select=id,option_text,display_order&order=display_order.asc`, { headers, cache: 'no-store' })
    ]);

    const itemData = await itemRes.json();
    if (!Array.isArray(itemData) || itemData.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const item = itemData[0];

    const commentsData = await commentsRes.json();
    const comments = Array.isArray(commentsData) ? commentsData.map(c => ({
      author: c.as_admin ? 'Admin' : (c.author_name || 'Anonymous'),
      comment: c.comment,
      created_at: c.created_at,
      edited_at: c.edited_at
    })) : [];

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
      author: item.author_name || 'Anonymous',
      vote_count: item.vote_count || 0,
      created_at: item.created_at,
      edited_at: item.edited_at,
      comments,
      options
    });
  } catch (error) {
    console.error('Error fetching idea:', error);
    res.status(500).json({ error: 'Failed to fetch idea' });
  }
}
