// GET /api/docs/[slug] - Get a specific doc by slug
// Optional query params:
//   ?key=<DOCS_API_KEY>  required for admin-visibility docs (see lib/docsApi.js)
//   ?v=... / ?t=...      ignored; only there to make the URL unique so
//                        nothing serves a saved copy
//
// An admin doc requested without a valid key, or a doc in the trash,
// returns 404 - the same as a doc that doesn't exist, so the API doesn't
// reveal which internal slugs exist.
//
// content_md is the field docs.js actually writes to on save (confirmed by
// reading the save function directly) - it is the live field. content is a
// legacy/fallback field for docs that predate content_md, or were never
// re-saved since. Prefer content_md; fall back to content only if empty.

import { SUPABASE_URL, secretHeaders, hasInternalAccess, noStore } from '../../../lib/docsApi';

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

  noStore(res);

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Slug is required' });
  }

  try {
    const internal = hasInternalAccess(req);

    let url = `${SUPABASE_URL}/rest/v1/docs?slug=eq.${encodeURIComponent(slug)}&deleted_at=is.null&select=*`;
    if (!internal) url += `&visibility=eq.user`;

    const response = await fetch(url, { headers: secretHeaders(), cache: 'no-store' });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase returned ${response.status}: ${detail}`);
    }

    const docs = await response.json();

    if (!docs || docs.length === 0) {
      return res.status(404).json({ error: 'Doc not found' });
    }

    const doc = docs[0];
    const content = doc.content_md || htmlToMarkdown(doc.content);

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
