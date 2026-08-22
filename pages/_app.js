import '../styles/globals.css'
import Head from 'next/head'
import { useState, useEffect } from 'react'

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
    
    // Refresh token every 30 minutes to prevent session expiry
    const refreshInterval = setInterval(() => {
      refreshAccessToken();
    }, 30 * 60 * 1000); // 30 minutes
    
    return () => clearInterval(refreshInterval);
  }, []);

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
        if (data.user) setUser(data.user);
        return true;
      }
    } catch (error) { console.log('Token refresh failed'); }
    return false;
  };

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) {
        setChecking(false);
        return;
      }
      
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
      }
    } catch (error) {
      console.log('Auth check failed');
    }
    setChecking(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('supabase_access_token');
    localStorage.removeItem('supabase_refresh_token');
    setUser(null);
    window.location.href = '/';
  };

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      
      {/* Global logout button - shows when logged in */}
      {user && !checking && (
        <div style={{
          position: 'fixed',
          top: '0.5rem',
          right: '0.5rem',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(15, 23, 42, 0.9)',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem',
          backdropFilter: 'blur(4px)',
          border: '1px solid #334155'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {user.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.25rem 0.75rem',
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      )}
      
      <Component {...pageProps} />
    </>
  )
}
