import { useState, useEffect } from 'react';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

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

  // Data state
  const [users, setUsers] = useState([]);
  const [allRoles, setAllRoles] = useState([]); // rows from the roles table - dynamic, not hardcoded
  const [allGrants, setAllGrants] = useState([]); // rows from user_roles, each { id, user_id, role_id, roles: {key,label,stream} }
  const [userRoleKeys, setUserRoleKeys] = useState([]); // current logged-in user's own role keys, for the access gate
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Check auth on load
  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { if (hasAnyRole(userRoleKeys)) loadUsers(); }, [userRoleKeys]);

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
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers });
      const data = await res.json();
      if (data.length > 0) setUserProfile(data[0]);
      const roleKeys = await fetchUserRoleKeys(userId, headers);
      setUserRoleKeys(roleKeys);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` };
      const [usersRes, rolesRes, grantsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=*&order=created_at.desc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/roles?select=*&order=label.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/user_roles?select=id,user_id,role_id,roles(key,label,stream)`, { headers })
      ]);
      setUsers(await usersRes.json());
      setAllRoles(await rolesRes.json());
      const grantsData = await grantsRes.json();
      setAllGrants(Array.isArray(grantsData) ? grantsData : []);
    } catch (error) { console.error('Error loading users:', error); }
    setLoading(false);
  };

  // Which role keys does a given user currently hold?
  const roleKeysForUser = (userId) => allGrants.filter(g => g.user_id === userId).map(g => g.roles?.key).filter(Boolean);

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

  const toggleUserRole = async (targetUserId, role, currentlyHeld) => {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    try {
      if (currentlyHeld) {
        // Revoking - find the specific grant row to remove
        const grant = allGrants.find(g => g.user_id === targetUserId && g.role_id === role.id);
        if (!grant) return;

        // Self-lockout guard: block if this would leave THIS SPECIFIC ROLE
        // with zero holders anywhere in the system - not just "any role at all".
        const othersWithThisRole = allGrants.filter(g => g.role_id === role.id && g.id !== grant.id);
        if (othersWithThisRole.length === 0) {
          showMessage(`❌ Cannot remove the last "${role.label}" in the system - nobody would be able to grant it back.`);
          return;
        }
        if (targetUserId === user.id && !confirm(`Remove your own "${role.label}" access? You may lose the ability to undo this yourself.`)) {
          return;
        }

        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?id=eq.${grant.id}`, { method: 'DELETE', headers });
        if (!delRes.ok) {
          const errText = await delRes.text();
          console.error('Role removal failed:', errText);
          showMessage(`❌ Could not remove ${role.label} - you may no longer hold the permission needed to do this.`);
          return;
        }
        await fetch(`${SUPABASE_URL}/rest/v1/role_change_log`, {
          method: 'POST', headers,
          body: JSON.stringify({ user_id: targetUserId, role_id: role.id, action: 'revoked', scope_type: 'platform', changed_by: user.id })
        });
        showMessage(`✅ Removed ${role.label}`);
      } else {
        const insRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
          method: 'POST', headers,
          body: JSON.stringify({ user_id: targetUserId, role_id: role.id, scope_type: 'platform', granted_by: user.id })
        });
        if (!insRes.ok) {
          const errText = await insRes.text();
          console.error('Role grant failed:', errText);
          showMessage(`❌ Could not grant ${role.label} - you may not hold the permission needed to do this.`);
          return;
        }
        await fetch(`${SUPABASE_URL}/rest/v1/role_change_log`, {
          method: 'POST', headers,
          body: JSON.stringify({ user_id: targetUserId, role_id: role.id, action: 'granted', scope_type: 'platform', changed_by: user.id })
        });
        showMessage(`✅ Granted ${role.label}`);
      }
      await loadUsers();
      if (targetUserId === user.id) await loadUserProfile(user.id);
    } catch (error) {
      console.error('Error updating role:', error);
      showMessage('❌ Error updating role - this may be blocked by permissions (you may not hold the required role to grant/revoke this)');
    }
  };

  const updateDisplayName = async (userId, newName) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPABASE_KEY, 
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ display_name: newName, updated_at: new Date().toISOString() })
      });
      showMessage('✅ Name updated');
      loadUsers();
    } catch (error) { showMessage('❌ Error updating name'); }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all') {
      const keys = roleKeysForUser(u.id);
      if (roleFilter === 'none') { if (keys.length > 0) return false; }
      else if (!keys.includes(roleFilter)) return false;
    }
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return u.display_name?.toLowerCase().includes(search) || u.id.toLowerCase().includes(search);
  });

  // Loading state
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">👥</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Auth gate - require login
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">👥</div>
            <h1 className="text-2xl font-bold mb-1">User Management</h1>
            <p className="text-slate-400 text-sm">Sign in to continue</p>
          </div>
          
          {authError && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg mb-4 text-sm">{authError}</div>}
          {authMessage && <div className="bg-green-900/50 text-green-200 p-3 rounded-lg mb-4 text-sm">{authMessage}</div>}
          
          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="p-3 rounded-lg border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-green-500"
            />
            {authMode !== 'magic' && (
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="p-3 rounded-lg border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
            <button
              onClick={authMode === 'magic' ? handleMagicLink : handleLogin}
              disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
              className="p-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-all disabled:opacity-50"
            >
              {authLoading ? 'Loading...' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
            </button>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-700 text-center">
            {authMode === 'login' ? (
              <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} className="text-blue-400 hover:underline text-sm">
                Use magic link instead
              </button>
            ) : (
              <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-blue-400 hover:underline text-sm">
                Use password instead
              </button>
            )}
          </div>
          
          <div className="mt-6 text-center">
            <a href="/" className="text-slate-400 text-sm hover:text-slate-300">← Back to Singalong</a>
          </div>
        </div>
      </div>
    );
  }

  // Admin check
  if (!hasAnyRole(userRoleKeys)) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-6">You need admin privileges to access this page.</p>
          <div className="flex flex-col gap-3">
            <a href="/" className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-lg font-bold transition-all">
              ← Back to Singalong
            </a>
            <button onClick={handleLogout} className="text-red-400 hover:text-red-300 text-sm">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <span>👥</span> User Management
            </h1>
            <p className="text-slate-400 mt-1">
              {users.length} users • {allRoles.map(r => `${allGrants.filter(g => g.role_id === r.id).length} ${r.label}`).join(' • ')}
            </p>
          </div>
        </header>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.includes('✅') ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
            {message}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 p-3 rounded-lg border border-slate-700 bg-slate-800 text-white outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="p-3 rounded-lg border border-slate-700 bg-slate-800 text-white outline-none"
          >
            <option value="all">All</option>
            <option value="none">No roles</option>
            {allRoles.map(r => <option key={r.id} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {/* Role Legend */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <h3 className="font-bold mb-2 text-sm text-slate-400">Roles</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {allRoles.map(r => (
              <div key={r.id} className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-600">
                  {r.label}
                </span>
                <span className="text-sm text-slate-400">{r.stream ? `${r.stream.replace('_', ' ')} access` : 'Platform-wide role'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User List */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading users...</div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map(u => (
              <div key={u.id} className={`bg-slate-800 rounded-lg p-4 border ${u.id === user.id ? 'border-green-500' : 'border-slate-700'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={u.display_name || ''}
                        onChange={(e) => {
                          setUsers(users.map(usr => usr.id === u.id ? { ...usr, display_name: e.target.value } : usr));
                        }}
                        onBlur={(e) => {
                          const original = users.find(usr => usr.id === u.id);
                          if (e.target.value !== original?.display_name) {
                            updateDisplayName(u.id, e.target.value);
                          }
                        }}
                        className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-green-500 outline-none font-bold text-lg"
                      />
                      {u.id === user.id && <span className="text-xs bg-green-600 px-2 py-0.5 rounded">You</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{u.id}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {allRoles.map(r => {
                      const held = roleKeysForUser(u.id).includes(r.key);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleUserRole(u.id, r, held)}
                          className={`px-3 py-2 rounded-lg border outline-none font-bold text-sm transition-all ${
                            held
                              ? 'bg-purple-900 border-purple-700 text-purple-200'
                              : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {held ? '✓ ' : '+ '}{r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-slate-400">No users found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
