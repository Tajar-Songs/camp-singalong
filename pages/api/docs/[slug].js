// GET /api/docs/[slug] - Get a specific doc by slug
// content_md is the field docs.js actually writes to on save (confirmed by
// reading the save function directly) - it is the live field. content is a
// legacy/fallback field for docs that predate content_md, or were never
// re-saved since. Prefer content_md; fall back to content only if empty.

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Convert HTML to simple markdown for AI readability (only used for the
// content fallback, since content_md is already markdown)
const htmlToMarkdown = (html) => {
  if (!html) return '';
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Slug is required' });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/docs?slug=eq.${encodeURIComponent(slug)}&select=*`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch doc');
    }

    const docs = await response.json();

    if (!docs || docs.length === 0) {
      return res.status(404).json({ error: 'Doc not found' });
    }

    const doc = docs[0];
    const content = doc.content_md || htmlToMarkdown(doc.content);

    // Explicit no-cache: nothing between this server and the client should
    // ever serve a cached copy of this response.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    res.status(200).json({
      title: doc.title,
      slug: doc.slug,
      folder: doc.folder,
      tags: doc.tags,
      visibility: doc.visibility,
      content: content,
      updated_at: doc.updated_at,
      updated_by: doc.updated_by
    });
  } catch (error) {
    console.error('Error fetching doc:', error);
    res.status(500).json({ error: 'Failed to fetch doc' });
  }
}
