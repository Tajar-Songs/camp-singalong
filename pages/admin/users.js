import { useState, useEffect } from 'react';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const ROLES = [
  { value: 'user', label: 'User', description: 'Can use main app and track personal history' },
  { value: 'admin', label: 'Admin', description: 'Full access to admin, tags, and user management' }
];

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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Check auth on load
  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { if (userProfile?.role === 'admin') loadUsers(); }, [userProfile]);

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
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` }
      });
      const data = await res.json();
      if (data.length > 0) setUserProfile(data[0]);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=*&order=created_at.desc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}` }
      });
      setUsers(await res.json());
    } catch (error) { console.error('Error loading users:', error); }
    setLoading(false);
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

  const updateUserRole = async (userId, newRole) => {
    if (userId === user.id && newRole !== 'admin') {
      if (!confirm('Are you sure you want to remove your own admin access? You will lose access to this page.')) return;
    }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPABASE_KEY, 
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token')}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ role: newRole, updated_at: new Date().toISOString() })
      });
      showMessage(`✅ Role updated to ${newRole}`);
      loadUsers();
      if (userId === user.id) loadUserProfile(user.id);
    } catch (error) { showMessage('❌ Error updating role'); }
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
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
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
  if (userProfile?.role !== 'admin') {
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
              {users.length} users • {users.filter(u => u.role === 'admin').length} admins
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <a href="/" className="text-slate-400 hover:text-slate-300 text-sm">← Singalong</a>
            <a href="/admin" className="text-slate-400 hover:text-slate-300 text-sm">Songs</a>
            <a href="/admin/tags" className="text-slate-400 hover:text-slate-300 text-sm">Tags</a>
            <a href="/admin/reports" className="text-slate-400 hover:text-slate-300 text-sm">Insights</a>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400 text-sm">👋 {userProfile?.display_name}</span>
            <button onClick={handleLogout} className="text-red-400 hover:text-red-300 text-sm">Sign out</button>
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
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Role Legend */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <h3 className="font-bold mb-2 text-sm text-slate-400">Role Permissions</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {ROLES.map(r => (
              <div key={r.value} className="flex items-start gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.value === 'admin' ? 'bg-purple-600' : 'bg-slate-600'}`}>
                  {r.label}
                </span>
                <span className="text-sm text-slate-400">{r.description}</span>
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
                  <div className="flex items-center gap-2">
                    <select
                      value={u.role || 'user'}
                      onChange={(e) => updateUserRole(u.id, e.target.value)}
                      className={`p-2 rounded-lg border outline-none font-bold text-sm ${
                        u.role === 'admin' 
                          ? 'bg-purple-900 border-purple-700 text-purple-200' 
                          : 'bg-slate-700 border-slate-600 text-slate-200'
                      }`}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
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
