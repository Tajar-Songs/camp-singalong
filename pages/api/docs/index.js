// GET /api/docs - List docs
// Optional query params:
//   ?visibility=user|admin  filter by visibility
//   ?key=<DOCS_API_KEY>     include admin-visibility docs (see lib/docsApi.js)
//
// Docs in the trash are never listed.
//
// Each doc's url includes ?v=<updated_at>, so the link itself changes
// whenever the doc changes. That way anything that saves copies by exact
// URL (like the AI fetch tool, confirmed Sept 26) never serves an old
// copy from a link taken from this list. If the list was requested with
// a key, the key is carried into each link so following it still works.

import { SUPABASE_URL, SITE_URL, secretHeaders, hasInternalAccess, noStore } from '../../../lib/docsApi';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  noStore(res);

  try {
    const internal = hasInternalAccess(req);
    const { visibility } = req.query;

    let url = `${SUPABASE_URL}/rest/v1/docs?select=id,title,slug,folder,tags,visibility,updated_at&deleted_at=is.null&order=title.asc`;

    if (!internal) {
      // Without a valid key, only public docs - regardless of any
      // ?visibility= filter the caller asked for.
      url += `&visibility=eq.user`;
    } else if (typeof visibility === 'string' && visibility) {
      url += `&visibility=eq.${encodeURIComponent(visibility)}`;
    }

    const response = await fetch(url, { headers: secretHeaders(), cache: 'no-store' });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase returned ${response.status}: ${detail}`);
    }

    const docs = await response.json();

    res.status(200).json({
      count: docs.length,
      docs: docs.map(doc => {
        const params = new URLSearchParams();
        if (internal) params.set('key', req.query.key);
        params.set('v', doc.updated_at);
        return {
          title: doc.title,
          slug: doc.slug,
          url: `${SITE_URL}/api/docs/${doc.slug}?${params.toString()}`,
          folder: doc.folder,
          tags: doc.tags,
          visibility: doc.visibility,
          updated_at: doc.updated_at
        };
      })
    });
  } catch (error) {
    console.error('Error fetching docs:', error);
    res.status(500).json({ error: 'Failed to fetch docs' });
  }
}
