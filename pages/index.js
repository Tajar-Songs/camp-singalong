import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const ROOM_CODE_WORDS = [
  'SUNSHINE', 'MOONLIGHT', 'STARLIGHT', 'RAINBOW', 'BARGES', 'CAMPFIRE',
  'MOUNTAIN', 'MEADOW', 'RIVER', 'FOREST', 'WILDFLOWER', 'BLACKBERRY',
  'SPARROW', 'TURTLE', 'CRICKET', 'HARMONY', 'MELODY', 'LULLABY',
  'CANOE', 'LANTERN', 'DEWDROP', 'SUNRISE', 'SUNSET', 'MAGIC',
  'DREAM', 'WIND', 'PEACE', 'FRIENDS', 'LINGER', 'WANDER',
  'ROVER', 'HAPPY', 'BUGS', 'LAKE', 'WANEEYA', 'ELAHAN',
  'TAHOMA', 'MOWICH', 'KLICKITAT', 'LOOWIT', 'TYHEE', 'ILLAHEE',
  'WYEAST', 'CELILO', 'ROMANY', 'CHEESIAH', 'DOGMTN', 'WINDMTN',
  'TAJAR', 'PHIF', 'TILLIE', 'CEDAR', 'MAPLE', 'HEMLOCK',
  'ALDER', 'CASCADE', 'GORGE', 'RAPIDS', 'SALMON', 'TRILLIUM',
  'FERN', 'MOSS', 'HUCKLEBERRY', 'CHINOOK', 'RAVEN', 'EAGLE',
  'VOLCANO', 'LANDSLIDE', 'BANDANA', 'TRAILHEAD', 'SUMMIT', 'RIDGE',
  'CREEK', 'PINE', 'SPRUCE', 'EVERGREEN', 'PIXIE'
];

const generateRoomCode = () => {
  const word = ROOM_CODE_WORDS[Math.floor(Math.random() * ROOM_CODE_WORDS.length)];
  const number = Math.floor(Math.random() * 90) + 10;
  return word + number;
};

export default function Home() {
  const router = useRouter();

  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'signup', 'magic'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  // Room create/join
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);

  // Dashboard data
  const [totalSongCount, setTotalSongCount] = useState(null);
  const [myStats, setMyStats] = useState(null); // { favorites, known, wantToLearn } once loaded

  const [isDark, setIsDark] = useState(false);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(darkModeQuery.matches);
    const handler = (e) => setIsDark(e.matches);
    darkModeQuery.addEventListener('change', handler);
    return () => darkModeQuery.removeEventListener('change', handler);
  }, []);

  // Check for login query param to open auth modal (nav's "Log in" link uses this)
  useEffect(() => {
    if (router.query.login === 'true') {
      setShowAuthModal(true);
      router.replace('/', undefined, { shallow: true });
    }
  }, [router.query.login]);

  useEffect(() => { checkAuthSession(); }, []);
  useEffect(() => { loadTotalSongCount(); }, []);
  useEffect(() => {
    if (user) loadMyStats();
    else setMyStats(null);
  }, [user]);

  // ---------- Auth ----------
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
      if (!token) return;
      let res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
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
        loadUserProfile(userData.id);
      }
    } catch (error) { console.log('No existing session'); }
  };

  const loadUserProfile = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setUserProfile(data[0]);
    } catch (error) { console.error('Error loading profile:', error); }
  };

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://tajar.fun/auth/callback';
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          data: { display_name: authDisplayName || authEmail },
          options: { emailRedirectTo: redirectUrl }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      setAuthMessage('Check your email to confirm your account!');
      setAuthMode('login');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
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
      loadUserProfile(data.user.id);
      setShowAuthModal(false);
      resetAuthForm();
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const handleMagicLink = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://tajar.fun/auth/callback';
      const res = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, options: { emailRedirectTo: redirectUrl } })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error_description);
      setAuthMessage('Check your email for the magic link!');
    } catch (error) { setAuthError(error.message); }
    setAuthLoading(false);
  };

  const resetAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthDisplayName('');
    setAuthError('');
    setAuthMessage('');
  };

  // ---------- Room create/join ----------
  const createRoom = async () => {
    const code = generateRoomCode();
    setRoomLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rooms`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: code, current_song: null, sung_songs: [] })
      });
      if (response.ok) router.push(`/room/${code}`);
    } catch (error) { console.error('Error creating room:', error); }
    setRoomLoading(false);
  };

  const joinRoom = async () => {
    const code = roomCodeInput.toUpperCase().trim();
    if (!code) return;
    setRoomLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${code}&select=*`, { headers: getAuthHeaders(false) });
      const data = await response.json();
      if (data && data.length > 0) router.push(`/room/${code}`);
      else alert('Room not found!');
    } catch (error) { console.error('Error joining room:', error); alert('Error joining room'); }
    setRoomLoading(false);
  };

  // ---------- Dashboard data ----------
  const loadTotalSongCount = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=id`, {
        headers: { ...getAuthHeaders(false), 'Prefer': 'count=exact', 'Range': '0-0' }
      });
      const range = res.headers.get('content-range'); // e.g. "0-0/612"
      const total = range ? parseInt(range.split('/')[1], 10) : null;
      setTotalSongCount(Number.isFinite(total) ? total : null);
    } catch (error) { console.error('Error loading song count:', error); }
  };

  const loadMyStats = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_song_preferences?user_id=eq.${user.id}&select=is_favorite,is_dislike,status`, {
        headers: getAuthHeaders(false)
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setMyStats({
          favorites: data.filter(p => p.is_favorite).length,
          known: data.filter(p => p.status === 'known').length,
          wantToLearn: data.filter(p => p.status === 'want_to_learn').length
        });
      }
    } catch (error) { console.error('Error loading my stats:', error); }
  };

  // ---------- Styling helpers ----------
  const card = `rounded-2xl p-6 border transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-green-100'}`;
  const cardTitle = `text-lg font-black mb-2 ${isDark ? 'text-white' : 'text-green-900'}`;
  const cardBody = `text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`;
  const primaryBtn = 'w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50';
  const secondaryBtn = `w-full py-3 rounded-xl font-bold transition-all border ${isDark ? 'border-slate-700 text-white hover:bg-slate-800' : 'border-green-200 text-green-900 hover:bg-green-50'}`;

  return (
    <div className={`min-h-screen p-4 sm:p-8 transition-colors duration-500 ${isDark ? 'bg-slate-950' : 'bg-green-50'}`}>
      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl p-6 w-full max-w-sm ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {authMode === 'signup' ? 'Create Account' : authMode === 'magic' ? 'Magic Link' : 'Sign In'}
              </h2>
              <button onClick={() => { setShowAuthModal(false); resetAuthForm(); }} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>

            {authError && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{authError}</div>}
            {authMessage && <div className="bg-green-100 text-green-700 p-3 rounded-lg mb-4 text-sm">{authMessage}</div>}

            <div className="space-y-3">
              {authMode === 'signup' && (
                <input
                  type="text"
                  placeholder="Display Name"
                  value={authDisplayName}
                  onChange={(e) => setAuthDisplayName(e.target.value)}
                  className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
              />
              {authMode !== 'magic' && (
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
                />
              )}
              <button
                onClick={authMode === 'signup' ? handleSignUp : authMode === 'magic' ? handleMagicLink : handleLogin}
                disabled={authLoading || !authEmail || (authMode !== 'magic' && !authPassword)}
                className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold transition-all disabled:opacity-50"
              >
                {authLoading ? 'Loading...' : authMode === 'signup' ? 'Create Account' : authMode === 'magic' ? 'Send Magic Link' : 'Sign In'}
              </button>
            </div>

            <div className={`mt-4 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              <div className="flex flex-col gap-2 text-sm text-center">
                {authMode === 'login' && (
                  <>
                    <button onClick={() => { setAuthMode('signup'); setAuthError(''); }} className="text-green-600 hover:underline">Need an account? Sign up</button>
                    <button onClick={() => { setAuthMode('magic'); setAuthError(''); }} className="text-blue-600 hover:underline">Use magic link instead</button>
                  </>
                )}
                {authMode === 'signup' && (
                  <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-green-600 hover:underline">Already have an account? Sign in</button>
                )}
                {authMode === 'magic' && (
                  <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-green-600 hover:underline">Use password instead</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-4">
          <div className="text-5xl mb-2">🎵</div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-green-900'}`}>
            Tajar's <span className="text-green-600">Songbook</span>
          </h1>
          {!user && (
            <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              <button onClick={() => setShowAuthModal(true)} className="text-green-600 font-semibold hover:underline">Log in</button>
              {' '}to track favorites and pick up where you left off
            </p>
          )}
        </div>

        {/*
          Dashboard cards. Deliberately kept as independent, self-contained blocks
          (rather than one big layout) so this can become user-configurable later -
          reordering, hiding, or adding cards without restructuring the page.
        */}
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Room card */}
          <div className={`${card} sm:col-span-2`}>
            <h2 className={cardTitle}>Sing Together</h2>
            <p className={cardBody}>Start a new room, or join one that's already going.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <button onClick={createRoom} disabled={roomLoading} className={primaryBtn}>
                {roomLoading ? 'Working...' : 'Start New Room'}
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ROOM CODE"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                  className={`flex-1 border-2 rounded-xl px-3 text-center font-black tracking-widest outline-none focus:ring-4 focus:ring-green-500/10 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-green-500 placeholder:text-slate-700' : 'bg-green-50 border-green-100 text-green-900 focus:border-green-500 placeholder:text-green-200'
                  }`}
                />
                <button onClick={joinRoom} disabled={roomLoading || !roomCodeInput} className="px-4 rounded-xl font-black text-white bg-blue-500 hover:bg-blue-400 transition-all disabled:opacity-30">
                  Join
                </button>
              </div>
            </div>
          </div>

          {/* Explore songs card */}
          <div className={card}>
            <h2 className={cardTitle}>Explore Songs</h2>
            <p className={cardBody}>
              {totalSongCount ? `Browse all ${totalSongCount} songs` : 'Browse the full songbook'} — lyrics, chords, versions, and more.
            </p>
            <Link href="/songs" className={secondaryBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Browse Songs
            </Link>
          </div>

          {/* My songs / insights card */}
          <div className={card}>
            <h2 className={cardTitle}>My Songs</h2>
            {user ? (
              myStats ? (
                <>
                  <p className={cardBody}>
                    {myStats.favorites} favorite{myStats.favorites !== 1 ? 's' : ''} · {myStats.known} known · {myStats.wantToLearn} to learn
                  </p>
                  <Link href="/songs" className={secondaryBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                    View My Songs
                  </Link>
                </>
              ) : (
                <p className={cardBody}>Loading...</p>
              )
            ) : (
              <>
                <p className={cardBody}>Log in to track favorites, mark songs you know, and build your own list.</p>
                <button onClick={() => setShowAuthModal(true)} className={secondaryBtn}>Log In</button>
              </>
            )}
          </div>

          {/* Communities - placeholder for future feature */}
          <div className={`${card} opacity-60`}>
            <h2 className={cardTitle}>Communities</h2>
            <p className={cardBody}>Coming soon — find and sing with your group.</p>
            <button disabled className={secondaryBtn} style={{ cursor: 'not-allowed' }}>Coming Soon</button>
          </div>

        </div>

        {/* Footer */}
        <div className="text-center mt-8 pb-4">
          <Link href="/ideas" className={`text-sm hover:underline ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
            💬 Have feedback or found a bug?
          </Link>
        </div>
      </div>
    </div>
  );
}
