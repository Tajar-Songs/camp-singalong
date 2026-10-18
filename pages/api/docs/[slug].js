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
// docs.js saves both content (HTML) and content_md (markdown). content_md is
// preferred; content is used when content_md is empty, or when content_md
// has lost tables that content still has (older converters flattened them).

import { SUPABASE_URL, secretHeaders, hasInternalAccess, noStore } from '../../../lib/docsApi';
import { htmlToMarkdown, docSource } from '../../../lib/docMarkdown';

// Plain characters instead of HTML entities, for readability.
const decodeEntities = (text) => (text || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

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
    // Same choice the editor makes (lib/docMarkdown.js): the markdown copy,
    // unless it has lost tables the HTML copy still has.
    const source = docSource(doc);
    const content = decodeEntities(source.kind === 'md' ? source.md : htmlToMarkdown(source.html));

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
