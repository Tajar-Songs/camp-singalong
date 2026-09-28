import { useState, useEffect } from 'react';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';
import { notify } from '../lib/notify';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Palette (style guide): Stone grey for secondary text/icons.
const GREY_TEXT = '#838C95';

export default function UserManagement() {
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  // Data state - all rules come from the database (roles, who can grant
  // which role, eligibility, minimum holders), never hardcoded here.
  const [users, setUsers] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [allGrants, setAllGrants] = useState([]);       // user_roles rows
  const [grantRules, setGrantRules] = useState([]);     // role_grant_permissions rows
  const [prerequisites, setPrerequisites] = useState([]); // role_prerequisites rows
  const [settingValues, setSettingValues] = useState({}); // system_settings key -> value
  const [userRoleKeys, setUserRoleKeys] = useState([]); // current logged-in user's own role keys, for the access gate
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilters, setRoleFilters] = useState([]); // [] = no filter (show all); 'none' = users with zero roles
  const [roleFilterMode, setRoleFilterMode] = useState('any');
  const [busyKey, setBusyKey] = useState(null);       // `${userId}|${roleId}` while a change is in flight
  const [historyOpenFor, setHistoryOpenFor] = useState(null); // user id whose role history is showing
  const [roleHistory, setRoleHistory] = useState(null);       // audit rows for that user; null while loading
  // Personal preference (Profile): hide roles this person can't grant.
  const hideViewOnly = !!userProfile?.hide_view_only;

  // Check auth on load
  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { if (hasAnyRole(userRoleKeys)) loadUsers(); }, [userRoleKeys]);

  const authHeaders = (extra = {}) => ({
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}`,
    ...extra
  });

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('supabase_refresh_token');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('supabase_access_token', data.access_token);
        localStorage.setItem('supabase_refresh_token', data.refresh_token);
        return true;
      }
    } catch (error) { console.log('Token refresh failed'); }
    return false;
  };

  const checkAuthSession = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) { setAuthChecked(true); return; }

      let res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });

      // If token expired, try to refresh
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` }
          });
        }
      }

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        await loadUserProfile(userData.id);
      }
    } catch (error) { console.log('No existing session'); }
    setAuthChecked(true);
  };

  const loadUserProfile = async (userId) => {
    try {
      const headers = authHeaders();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setUserProfile(data[0]);
      const roleKeys = await fetchUserRoleKeys(userId, headers);
      setUserRoleKeys(roleKeys);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const getJson = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  // Role history for one person, from the audit trail. The database only
  // returns records this viewer is allowed to see.
  const loadRoleHistory = async (userId) => {
    setRoleHistory(null);
    try {
      const rows = await getJson(`audit_log_view?select=id,created_at,action,changed_by,old_row,new_row&category=eq.roles_permissions&table_name=eq.user_roles&subject_user_id=eq.${userId}&order=created_at.desc&limit=50`);
      setRoleHistory(rows);
    } catch (error) {
      setRoleHistory([]);
      notify.error(`Couldn't load role history: ${error.message}`);
    }
  };

  const toggleRoleHistory = (userId) => {
    if (historyOpenFor === userId) { setHistoryOpenFor(null); return; }
    setHistoryOpenFor(userId);
    loadRoleHistory(userId);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData, grantsData, rulesData, prereqData, settingsData] = await Promise.all([
        getJson('user_profiles?select=*&order=created_at.desc'),
        getJson('roles?select=*&order=label.asc'),
        getJson('user_roles?select=id,user_id,role_id'),
        getJson('role_grant_permissions?select=*'),
        getJson('role_prerequisites?select=*'),
        getJson('system_settings?select=key,value')
      ]);
      setUsers(usersData);
      setAllRoles(rolesData);
      setAllGrants(grantsData);
      setGrantRules(rulesData);
      setPrerequisites(prereqData);
      setSettingValues(Object.fromEntries(settingsData.map(s => [s.key, s.value])));
    } catch (error) {
      console.error('Error loading users:', error);
      notify.error(`Couldn't load users and roles: ${error.message}`);
    }
    setLoading(false);
  };

  // ---------- Rule lookups (all from the database) ----------
  const roleById = Object.fromEntries(allRoles.map(r => [r.id, r]));
  const roleIdsForUser = (userId) => allGrants.filter(g => g.user_id === userId).map(g => g.role_id);
  const roleKeysForUser = (userId) => roleIdsForUser(userId).map(id => roleById[id]?.key).filter(Boolean);
  const myRoleIds = user ? roleIdsForUser(user.id) : [];
  const joinLabels = (ids) => ids.map(id => roleById[id]?.label || 'an unknown role').join(' and ');

  // Minimum holders for a role: its own setting if it has one, otherwise the
  // general top-level setting. Mirrors role_min_holders() in the database.
  const minHoldersFor = (role) => {
    if (!role?.enforce_minimum_holders) return 0;
    const own = role.min_holders_setting ? settingValues[role.min_holders_setting] : undefined;
    const general = settingValues.min_role_holders_before_lockout_block;
    return Number(own ?? general ?? 1);
  };
  const grantersOf = (roleId) => grantRules.filter(g => g.target_role_id === roleId).map(g => g.granter_role_id);
  const canIGrant = (roleId) => grantersOf(roleId).some(id => myRoleIds.includes(id));
  const requiredFor = (roleId) => prerequisites.filter(p => p.role_id === roleId).map(p => p.required_role_id);
  const dependentsOf = (roleId) => prerequisites.filter(p => p.required_role_id === roleId).map(p => p.role_id);

  // Why a specific grant/removal would be blocked by a rule, in plain
  // words - or null if it's allowed. Checked before sending, so people
  // learn the reason up front rather than from a failed save. The database
  // enforces the same rules regardless.
  const blockedReason = (targetUserId, role, currentlyHeld) => {
    const held = roleIdsForUser(targetUserId);
    if (currentlyHeld) {
      const heldDependents = dependentsOf(role.id).filter(id => held.includes(id));
      if (heldDependents.length > 0) {
        return `This person holds ${joinLabels(heldDependents)}, which requires ${role.label}. Remove ${joinLabels(heldDependents)} from them first.`;
      }
      const min = minHoldersFor(role);
      const othersHolding = allGrants.filter(g => g.role_id === role.id && g.user_id !== targetUserId).length;
      if (min > 0 && othersHolding < min) {
        return `At least ${min} ${min === 1 ? 'person' : 'people'} must hold ${role.label} at all times. Give it to someone else first, or change the minimum in Settings.`;
      }
      return null;
    }
    const missing = requiredFor(role.id).filter(id => !held.includes(id));
    if (missing.length > 0) {
      return `${role.label} can only be given to someone who already holds ${joinLabels(missing)}.`;
    }
    return null;
  };

  // ---------- Writes ----------
  // Every write asks for the changed rows back and checks that one came
  // back. A change blocked by an access rule returns no error - just zero
  // rows - which previously showed a false "✅".
  const writeRows = async (path, method, body) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!res.ok) {
      let detail = `database returned ${res.status}`;
      try { const err = await res.json(); detail = err.message || detail; } catch (e) { /* not JSON */ }
      throw new Error(detail);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("nothing was changed - you don't have permission for this");
    }
    return rows;
  };

  const toggleUserRole = async (targetUserId, role, currentlyHeld) => {
    if (!canIGrant(role.id)) {
      notify.error(`Only ${joinLabels(grantersOf(role.id)) || 'no role currently'} can grant or remove ${role.label}.`);
      return;
    }
    const reason = blockedReason(targetUserId, role, currentlyHeld);
    if (reason) { notify.error(reason); return; }
    const targetName = users.find(u => u.id === targetUserId)?.display_name || 'this person';

    if (currentlyHeld && targetUserId === user.id &&
        !confirm(`Remove your own "${role.label}" access? You may lose the ability to undo this yourself.`)) {
      return;
    }
    if (!currentlyHeld && role.key === 'governance_admin' &&
        !confirm(`Give ${role.label} to ${targetName}?\n\nThis is a rare, high-trust role: it decides who can do what across the platform.`)) {
      return;
    }

    setBusyKey(`${targetUserId}|${role.id}`);
    try {
      if (currentlyHeld) {
        const grant = allGrants.find(g => g.user_id === targetUserId && g.role_id === role.id);
        if (!grant) throw new Error('that role grant no longer exists - try reloading');
        await writeRows(`user_roles?id=eq.${grant.id}`, 'DELETE');
      } else {
        await writeRows('user_roles', 'POST', { user_id: targetUserId, role_id: role.id, scope_type: 'platform', granted_by: user.id });
      }
      // The database records role changes in the audit trail automatically.
      if (historyOpenFor === targetUserId) loadRoleHistory(targetUserId);
      notify.success(`${currentlyHeld ? 'Removed' : 'Gave'} ${role.label} ${currentlyHeld ? 'from' : 'to'} ${targetName}`);
      await loadUsers();
      if (targetUserId === user.id) await loadUserProfile(user.id);
    } catch (error) {
      console.error('Error updating role:', error);
      notify.error(`Couldn't ${currentlyHeld ? 'remove' : 'give'} ${role.label}: ${error.message}`);
    }
    setBusyKey(null);
  };

  const updateDisplayName = async (userId, newName) => {
    try {
      await writeRows(`user_profiles?id=eq.${userId}`, 'PATCH', { display_name: newName, updated_at: new Date().toISOString() });
      notify.success('Name updated');
      if (userId === user.id) await loadUserProfile(user.id);
    } catch (error) {
      // Today the database only lets people change their own display name.
      const reason = userId !== user.id
        ? "people can currently only change their own display name"
        : error.message;
      notify.error(`Couldn't update the name: ${reason}`);
    }
    loadUsers(); // re-sync the field with what's actually saved
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      localStorage.setItem('supabase_access_token', data.access_token);
      localStorage.setItem('supabase_refresh_token', data.refresh_token);
      setUser(data.user);
      await loadUserProfile(data.user.id);
      setAuthEmail('');
      setAuthPassword('');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleMagicLink = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      setAuthMessage('Check your email for the magic link!');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('supabase_access_token');
    localStorage.removeItem('supabase_refresh_token');
    setUser(null);
    setUserProfile(null);
  };

  const filteredUsers = users.filter(u => {
    if (roleFilters.length > 0) {
      const keys = roleKeysForUser(u.id);
      const matchesOne = (roleKey) => roleKey === 'none' ? keys.length === 0 : keys.includes(roleKey);
      const matches = roleFilterMode === 'all'
        ? roleFilters.every(matchesOne)
        : roleFilters.some(matchesOne);
      if (!matches) return false;
    }
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return u.display_name?.toLowerCase().includes(search) || u.id.toLowerCase().includes(search);
  });

  // Loading state
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4"><i className="ti ti-users" aria-hidden="true"></i></div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Auth gate - require login
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2"><i className="ti ti-users" aria-hidden="true"></i></div>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Gloria Hallelujah', cursive" }}>User Management</h1>
            <p className="text-[#838C95] text-sm">Sign in to continue</p>
          </div>

          {authError && <div className="bg-[#C35522]/20 text-[#D45D25] p-3 rounded-lg mb-4 text-sm"><i className="ti ti-alert-triangle" aria-hidden="true"></i> {authError}</div>}
          {authMessage && <div className="bg-[#318160]/20 text-[#3B9B73] p-3 rounded-lg mb-4 text-sm"><i className="ti ti-circle-check" aria-hidden="true"></i> {authMessage}</div>}

          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              aria-label="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="p-3 rounded-lg border border-[#838C95]/20 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-[#3B9B73]"
            />
            {authMode !== 'magic' && (
              <input
                type="password"
                placeholder="Password"
                aria-label="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="p-3 rounded-lg border border-[#838C95]/20 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-[#3B9B73]"
              />
            )}
            <button
              onClick={authMode === 'magic' ? handleMagicLink : handleLogin}
              disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
              className="p-3 rounded-lg bg-[#318160] hover:bg-[#3B9B73] text-white font-bold transition-all disabled:opacity-50"
            >
              {authLoading ? 'Loading...' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-[#838C95]/20 text-center">
            {authMode === 'login' ? (
              <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} className="text-[#6882B6] hover:underline text-sm">
                Use magic link instead
              </button>
            ) : (
              <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-[#6882B6] hover:underline text-sm">
                Use password instead
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Admin check
  if (!hasAnyRole(userRoleKeys)) {
    return (
      <div className="min-h-screen bg-slate-900 text-[#e2e8f0] flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4"><i className="ti ti-lock" aria-hidden="true"></i></div>
          <h1 className="text-2xl font-bold mb-2">Admins only</h1>
          <p className="text-[#838C95] mb-6">Managing users and roles requires an admin role. You're signed in, but your account doesn't have one.</p>
          <div className="flex flex-col gap-3">
            <button onClick={handleLogout} className="text-[#D45D25] hover:text-[#D45D25]/80 text-sm">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const grantableRoles = allRoles.filter(r => canIGrant(r.id));

  return (
    <div className="min-h-screen bg-slate-900 text-[#e2e8f0]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3" style={{ fontFamily: "'Gloria Hallelujah', cursive" }}>
              <i className="ti ti-users" aria-hidden="true"></i> User Management
            </h1>
            <p className="text-[#838C95] mt-1">
              {users.length} users • {allRoles.map(r => `${allGrants.filter(g => g.role_id === r.id).length} ${r.label}`).join(' • ')}
            </p>
          </div>
        </header>

        {/* What you can change here - decided once for the page, from the
            live grant rules, rather than discovered by clicking. */}
        <p className="flex items-start gap-2 bg-slate-800 border border-[#334155] rounded-lg px-3 py-2 mb-6 text-sm">
          <i className={`ti ${grantableRoles.length > 0 ? 'ti-user-check' : 'ti-eye'}`} style={{ color: GREY_TEXT, marginTop: '0.15rem' }} aria-hidden="true"></i>
          <span>
            {grantableRoles.length === 0
              ? 'Roles are view only for you - your roles can\'t grant or remove any role.'
              : `You can grant or remove: ${grantableRoles.map(r => r.label).join(', ')}.${grantableRoles.length < allRoles.length ? (hideViewOnly ? " Roles you can't grant are hidden on each person (your Profile setting)." : ' Other roles are view only for you.') : ''}`}
          </span>
        </p>

        {/* Filters - small enough (just search + one role dimension) that
            collapsing it adds a click with no real benefit, so it stays
            directly visible. */}
        <div className="mb-6 space-y-3">
          <input
            type="text"
            placeholder="Search by name or ID..."
            aria-label="Search users by name or ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 rounded-lg border border-[#838C95]/20 bg-slate-800 text-white outline-none focus:ring-2 focus:ring-[#3B9B73]"
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-[#838C95]">Role</span>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="roleFilterMode" checked={roleFilterMode === 'any'} onChange={() => setRoleFilterMode('any')} /> any
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="roleFilterMode" checked={roleFilterMode === 'all'} onChange={() => setRoleFilterMode('all')} /> all
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ key: 'none', label: 'No roles' }, ...allRoles.map(r => ({ key: r.key, label: r.label }))].map(opt => {
                const selected = roleFilters.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => setRoleFilters(prev => selected ? prev.filter(k => k !== opt.key) : [...prev, opt.key])}
                    aria-pressed={selected}
                    className={`px-3 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${selected ? 'bg-[#318160] text-white' : 'bg-slate-700 text-[#838C95] hover:bg-slate-600'}`}
                  >
                    {selected && <i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i>}{selected ? ' ' : ''}{opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Role Legend - every rule shown here comes from the database:
            protection and its minimum, who can grant it, and eligibility. */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <h2 className="font-bold mb-3 text-sm text-[#838C95]">Roles</h2>
          <div className="space-y-3">
            {allRoles.map(r => {
              const min = minHoldersFor(r);
              const required = requiredFor(r.id);
              const granters = grantersOf(r.id);
              return (
                <div key={r.id} className="text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#318160] text-white">
                      {r.enforce_minimum_holders && <i className="ti ti-lock" style={{ fontSize: '0.85em' }} aria-hidden="true"></i>}{r.enforce_minimum_holders && ' '}{r.label}
                    </span>
                    {r.key === 'governance_admin' && <span className="text-xs text-[#838C95]">a rare, high-trust role</span>}
                  </div>
                  <ul className="text-xs text-[#838C95] mt-1 ml-1 space-y-0.5">
                    {min > 0 && <li><i className="ti ti-lock" aria-hidden="true"></i> Protected: at least {min} {min === 1 ? 'person' : 'people'} must hold it (set in Settings)</li>}
                    <li><i className="ti ti-user-check" aria-hidden="true"></i> Granted or removed by: {granters.length > 0 ? joinLabels(granters) : 'no role currently'}</li>
                    {required.length > 0 && <li><i className="ti ti-key" aria-hidden="true"></i> Only for people who already hold {joinLabels(required)}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* User List */}
        {loading ? (
          <div className="text-center py-12 text-[#838C95]">Loading users...</div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map(u => (
              <div key={u.id} className={`bg-slate-800 rounded-lg p-4 border ${u.id === user.id ? 'border-[#3B9B73]' : 'border-[#838C95]/20'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {u.id === user.id ? (
                        <input
                          type="text"
                          aria-label="Your display name"
                          value={u.display_name || ''}
                          onChange={(e) => {
                            setUsers(users.map(usr => usr.id === u.id ? { ...usr, display_name: e.target.value } : usr));
                          }}
                          onBlur={(e) => {
                            if (e.target.value !== (userProfile?.display_name || '')) updateDisplayName(u.id, e.target.value);
                          }}
                          className="bg-transparent border-b border-transparent hover:border-[#838C95]/35 focus:border-[#3B9B73] outline-none font-bold text-lg"
                        />
                      ) : (
                        // Other people's names are shown as text: the
                        // database only lets people change their own.
                        <span className="font-bold text-lg">{u.display_name || <span className="text-[#838C95] font-normal italic">No display name</span>}</span>
                      )}
                      {u.id === user.id && <span className="text-xs bg-[#318160] text-white px-2 py-0.5 rounded">You</span>}
                    </div>
                    <div className="text-xs text-[#838C95] mt-1 font-mono">{u.id}</div>
                    <div className="text-xs text-[#838C95] mt-1">
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRoleHistory(u.id)}
                      aria-expanded={historyOpenFor === u.id}
                      className="text-xs text-[#838C95] hover:text-white mt-2"
                    >
                      <i className={`ti ${historyOpenFor === u.id ? 'ti-chevron-down' : 'ti-history'}`} aria-hidden="true"></i> Role history
                    </button>
                    {historyOpenFor === u.id && (
                      <ul className="text-xs text-[#838C95] mt-2 space-y-1">
                        {roleHistory === null ? (
                          <li>Loading…</li>
                        ) : roleHistory.length === 0 ? (
                          <li>No role changes you can see.</li>
                        ) : roleHistory.map(h => {
                          const row = h.new_row || h.old_row || {};
                          const label = allRoles.find(r => r.id === row.role_id)?.label || 'a role';
                          return (
                            <li key={h.id}>
                              {h.action === 'DELETE' ? 'Removed' : 'Given'} {label}{h.changed_by ? ` by ${h.changed_by}` : ''} · {new Date(h.created_at).toLocaleString()}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {allRoles.map(r => {
                      const held = roleIdsForUser(u.id).includes(r.id);
                      const lockIcon = r.enforce_minimum_holders && <><i className="ti ti-lock" style={{ fontSize: '0.85em' }} aria-hidden="true"></i>{' '}</>;
                      // Roles this person can't grant at all: a plain label,
                      // not a button (the banner above says why).
                      if (!canIGrant(r.id)) {
                        return held && !hideViewOnly ? (
                          <span key={r.id} className="px-3 py-2 rounded-lg border font-bold text-sm bg-[#3B9B73]/10 border-[#3B9B73]/50 text-[#3B9B73]">
                            <i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {lockIcon}{r.label}
                          </span>
                        ) : null;
                      }
                      const reason = blockedReason(u.id, r, held);
                      const busy = busyKey === `${u.id}|${r.id}`;
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleUserRole(u.id, r, held)}
                          disabled={busy}
                          title={reason || (held ? `Remove ${r.label}` : `Give ${r.label}`)}
                          aria-label={`${held ? 'Remove' : 'Give'} ${r.label}${reason ? ` (not available: ${reason})` : ''}`}
                          aria-pressed={held}
                          className={`px-3 py-2 rounded-lg border outline-none font-bold text-sm transition-all ${
                            held
                              ? 'bg-[#3B9B73]/20 border-[#3B9B73] text-[#3B9B73]'
                              : 'bg-slate-700 border-[#838C95]/35 text-[#838C95] hover:text-white'
                          } ${reason ? 'opacity-60 border-dashed' : ''} ${busy ? 'opacity-50' : ''}`}
                        >
                          <i className={`ti ${held ? 'ti-check' : 'ti-plus'}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {lockIcon}{r.label}
                          {reason && <i className="ti ti-info-circle" style={{ fontSize: '0.85em', marginLeft: '0.3rem' }} aria-hidden="true"></i>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-[#838C95]">No users found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
