// lib/permissions.js
//
// Client-side helper for the configurable permission layer
// (permissions + role_permissions tables, added Sept 26, 2026).
//
// Which roles get which permission is stored as data in role_permissions,
// not hardcoded here - so changing who can do what is a data change, not a
// code change. This file only asks the database "what can the logged-in
// user do?" via the my_permissions() function.
//
// Important: this only decides which BUTTONS to show. The real enforcement
// is the database access rules, which call the same user_has_permission()
// check. Hiding a button is a convenience, not security.

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';

/**
 * Fetch the logged-in user's permission keys, e.g.
 * ['docs.edit', 'docs.read_internal', 'docs.trash'].
 * Returns [] when logged out or on any error (fails closed: no buttons).
 */
export async function fetchMyPermissions(headers) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_permissions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error('Error fetching permissions:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data.filter(k => typeof k === 'string') : [];
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return [];
  }
}

/** True if the permission list includes the given key. */
export function hasPermission(permissionKeys, key) {
  return Array.isArray(permissionKeys) && permissionKeys.includes(key);
}
