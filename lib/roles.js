// lib/roles.js
//
// Shared role-checking helpers. Replaces the old single
// `user_profiles.role === 'admin'` check with a query against the new
// user_roles / roles tables, which support someone holding zero, one, or
// multiple roles across independent streams (song stewardship, platform
// stewardship, and whatever comes later).

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';

/**
 * Fetch the role keys a user currently holds, e.g. ['song_admin', 'platform_admin'].
 * Returns [] if they hold none - the direct equivalent of the old "not an admin".
 */
export async function fetchUserRoleKeys(userId, headers) {
  if (!userId) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=roles(key)`,
      { headers }
    );
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(r => r.roles?.key).filter(Boolean);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
}

/** Holds ANY role at all - equivalent to the old `role === 'admin'` check. */
export function hasAnyRole(roleKeys) {
  return Array.isArray(roleKeys) && roleKeys.length > 0;
}

/** Holds a specific role, e.g. hasRole(roleKeys, 'song_admin'). */
export function hasRole(roleKeys, key) {
  return Array.isArray(roleKeys) && roleKeys.includes(key);
}
