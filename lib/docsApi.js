// lib/docsApi.js
//
// Shared server-side helpers for the read-only docs API (/api/docs and
// /api/docs/[slug]). Server-only: this file must never be imported by a
// page component, because it reads secret environment variables.
//
// Why this exists: the docs table's access rules are being tightened so
// that admin-visibility docs are no longer readable with the public
// (publishable) key. The API therefore reads with Supabase's SECRET key,
// which bypasses access rules, and does its own gatekeeping here instead:
//   - visibility 'user' docs:  returned to anyone
//   - visibility 'admin' docs: returned only when the request includes
//                              ?key=<DOCS_API_KEY>
//   - docs in the trash (deleted_at set): never returned
//
// Required Vercel environment variables:
//   SUPABASE_SECRET_KEY - Supabase > Project Settings > API Keys > secret key (sb_secret_...)
//   DOCS_API_KEY        - any long random string; the value used in ?key=

import { timingSafeEqual } from 'crypto';

export const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
export const SITE_URL = 'https://www.tajar.fun';

// Headers for reading with the secret key. Per Supabase's docs, a secret
// key goes in the apikey header only - it is not a JWT, so it must NOT
// also be sent as "Authorization: Bearer".
export function secretHeaders() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    // Fail loudly rather than silently falling back to the public key:
    // after the access rules are tightened, a silent fallback would just
    // quietly return fewer docs, which is exactly the kind of "looks like
    // it worked" failure we're trying to avoid.
    throw new Error('SUPABASE_SECRET_KEY is not set in the environment');
  }
  return { apikey: secret };
}

// True only if the request carries the correct ?key=. Constant-time
// comparison so the key can't be guessed character by character from
// response timing. If DOCS_API_KEY isn't configured, nobody gets
// internal access (fails closed).
export function hasInternalAccess(req) {
  const expected = process.env.DOCS_API_KEY;
  const given = req.query.key;
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
}
