// lib/guardedFetch.js
//
// One shared choke point for pages that change data (admin, tags, ...).
// Every database call a page makes goes through guardedFetch. Reads pass
// straight through. Changes are:
//   1. checked against the permission their table needs - if the person
//      doesn't have it, nothing is sent and they're told why, once;
//   2. checked after sending - a database error is shown with its real
//      reason, and a change aimed at one specific item (?id=eq.) that
//      changed nothing is reported, since that's how an access rule
//      silently blocks a change (success with zero rows).
// Putting this in one place means no individual save or delete on any
// page can be missed, and every page explains blocked changes the same way.
//
// The table -> permission map mirrors the database's access rules (Sept 26
// lockdown). It only makes messages clearer and earlier; the database
// enforces the rules regardless. Tables not listed are left to the database.

import { hasPermission } from './permissions';
import { notify } from './notify';

export const TABLE_PERMISSION = {
  songs: 'songs.edit', song_versions: 'songs.edit', song_version_attributes: 'songs.edit',
  song_media: 'songs.edit', song_notes: 'songs.edit', song_flags: 'songs.edit',
  song_aliases: 'songs.edit', song_groups: 'songs.edit', song_group_members: 'songs.edit',
  songbooks: 'songs.edit', songbook_sections: 'songs.edit', song_songbook_entries: 'songs.edit',
  song_sections: 'songs.edit', potential_duplicates: 'songs.edit',
  tags: 'tags.manage', song_tags: 'tags.manage',
  song_suggestions: 'songs.review_suggestions'
};

export const PERMISSION_LABELS = {
  'songs.edit': 'Edit songs and songbooks',
  'tags.manage': 'Manage tags',
  'songs.review_suggestions': 'Review song suggestions'
};

// getPermissions: a function returning the person's current permission keys
// (pass one that reads a ref, so it's always current).
export function createGuardedFetch(getPermissions) {
  let lastAt = 0;
  let lastText = '';

  const report = (text) => {
    const now = Date.now();
    if (text === lastText && now - lastAt < 2000) return; // same error from a batch of changes
    lastAt = now;
    lastText = text;
    notify.error(text);
  };

  // True just after guardedFetch explained a failure - pages use this to
  // skip their own generic "❌ Error..." message that follows, so people
  // see the real reason once rather than two messages.
  const recentlyReported = () => Date.now() - lastAt < 2000;

  const guardedFetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET') return fetch(url, options);

    const table = (url.split('/rest/v1/')[1] || '').split('?')[0];
    const needed = TABLE_PERMISSION[table];
    if (needed && !hasPermission(getPermissions(), needed)) {
      const text = `This is view only for you - changing it requires "${PERMISSION_LABELS[needed] || needed}".`;
      report(text);
      throw new Error(text);
    }

    const targetsOneRow = /[?&]id=eq\./.test(url);
    const headers = { ...(options.headers || {}) };
    if ((method === 'PATCH' || method === 'DELETE') && targetsOneRow) headers['Prefer'] = 'return=representation';
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      let detail = `the database returned ${res.status}`;
      try { const err = await res.clone().json(); detail = err.message || detail; } catch (e) { /* not JSON */ }
      const text = `Couldn't save that change: ${detail}`;
      report(text);
      throw new Error(text);
    }
    if ((method === 'PATCH' || method === 'DELETE') && targetsOneRow) {
      let rows = null;
      try { rows = await res.clone().json(); } catch (e) { /* no body */ }
      if (Array.isArray(rows) && rows.length === 0) {
        const text = "Couldn't save that change: nothing was changed - you may not have permission, or the item no longer exists.";
        report(text);
        throw new Error(text);
      }
    }
    return res;
  };

  return { guardedFetch, recentlyReported };
}
