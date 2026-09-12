// GET /api/docs - List all docs
// Optional query params: ?visibility=user (filter by visibility)

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';
const SITE_URL = 'https://www.tajar.fun';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { visibility } = req.query;
    
    let url = `${SUPABASE_URL}/rest/v1/docs?select=id,title,slug,folder,tags,visibility,updated_at&order=title.asc`;
    
    // Filter by visibility if specified
    if (visibility) {
      url += `&visibility=eq.${visibility}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch docs');
    }

    const docs = await response.json();
    
    // Return simplified list
    res.status(200).json({
      count: docs.length,
      docs: docs.map(doc => ({
        title: doc.title,
        slug: doc.slug,
        url: `${SITE_URL}/api/docs/${doc.slug}`,
        folder: doc.folder,
        tags: doc.tags,
        visibility: doc.visibility,
        updated_at: doc.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching docs:', error);
    res.status(500).json({ error: 'Failed to fetch docs' });
  }
}
