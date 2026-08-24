import '../styles/globals.css'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  useEffect(() => {
    checkAuth();
    
    // Refresh token every 30 minutes
    const refreshInterval = setInterval(() => {
      refreshAccessToken();
    }, 30 * 60 * 1000);
    
    // Listen for login events from other components
    const handleAuthChange = () => {
      checkAuth();
    };
    window.addEventListener('auth-changed', handleAuthChange);
    
    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('auth-changed', handleAuthChange);
    };
  }, []);

  // Close nav when route changes
  useEffect(() => {
    setNavOpen(false);
    setAdminMenuOpen(false);
  }, [router.pathname]);

  // Close admin menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (adminMenuOpen && !e.target.closest('.admin-dropdown')) {
        setAdminMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [adminMenuOpen]);

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
    } catch (error) { 
      console.log('Token refresh failed:', error); 
    }
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
        if (userData && userData.id) {
          setUser(userData);
          await loadUserProfile(userData.id);
        }
      }
    } catch (error) {
      console.log('Auth check failed:', error);
    }
    setChecking(false);
  };

  const loadUserProfile = async (userId) => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) return;
      
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        // Make sure data is an array before accessing
        if (Array.isArray(data) && data.length > 0) {
          setUserProfile(data[0]);
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('supabase_access_token');
    localStorage.removeItem('supabase_refresh_token');
    setUser(null);
    setUserProfile(null);
    window.location.href = '/';
  };

  const isAdmin = userProfile?.role === 'admin';
  const currentPath = router.pathname;

  // Navigation items - split into user and admin
  const userNavItems = [
    { href: '/', label: 'Sing Together', show: true },
    { href: '/songs', label: 'Songs', show: true },
    { href: '/docs', label: 'Docs', show: true },
    { href: '/ideas', label: 'Feature Requests', show: true },
    { href: '/suggest', label: 'Suggest', show: !!user },
    { href: '/profile', label: 'Profile', show: !!user },
  ];

  const adminNavItems = [
    { href: '/admin', label: 'Songs' },
    { href: '/suggestions', label: 'Suggestions' },
    { href: '/tags', label: 'Tags' },
    { href: '/reports', label: 'Reports' },
    { href: '/users', label: 'Users' },
  ];

  const visibleUserItems = userNavItems.filter(item => item.show);
  const isOnAdminPage = adminNavItems.some(item => currentPath === item.href);

  // Styles
  const navStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: 'rgba(15, 23, 42, 0.95)',
    borderBottom: '1px solid #334155',
    backdropFilter: 'blur(8px)',
  };

  const navContainerStyle = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0.5rem 1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const linkStyle = (isActive) => ({
    padding: '0.5rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    color: isActive ? '#22c55e' : '#94a3b8',
    background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
    textDecoration: 'none',
  });

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      
      {/* Navigation bar - show when done checking */}
      {!checking && (
        <nav style={navStyle}>
          <div style={navContainerStyle}>
            {/* Left: Logo/Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <Link href="/" style={{ fontWeight: 'bold', color: '#22c55e', fontSize: '1.1rem', textDecoration: 'none' }}>
                🎵 Tajar's Songbook
              </Link>
              
              {/* Desktop nav links */}
              <div className="nav-desktop" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {visibleUserItems.map(item => (
                  <Link key={item.href} href={item.href} style={linkStyle(currentPath === item.href)}>
                    {item.label}
                  </Link>
                ))}
                
                {/* Admin dropdown */}
                {isAdmin && (
                  <div className="admin-dropdown" style={{ position: 'relative', marginLeft: '0.5rem' }}>
                    <button
                      onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                      style={{
                        ...linkStyle(isOnAdminPage),
                        background: isOnAdminPage ? '#7c3aed' : 'transparent',
                        border: '1px solid #7c3aed',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      ⚙️ Admin {adminMenuOpen ? '▲' : '▼'}
                    </button>
                    
                    {adminMenuOpen && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '0.25rem',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        padding: '0.5rem',
                        minWidth: '150px',
                        zIndex: 10000,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      }}>
                        {adminNavItems.map(item => (
                          <Link 
                            key={item.href} 
                            href={item.href}
                            onClick={() => setAdminMenuOpen(false)}
                            style={{
                              display: 'block',
                              padding: '0.5rem 0.75rem',
                              color: currentPath === item.href ? '#7c3aed' : '#e2e8f0',
                              textDecoration: 'none',
                              borderRadius: '0.25rem',
                              fontSize: '0.875rem',
                              background: currentPath === item.href ? '#7c3aed20' : 'transparent',
                            }}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Right: User info + Logout OR Login link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {user ? (
                <>
                  <span className="nav-email" style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {userProfile?.display_name || user?.email || ''}
                  </span>
                  <button
                    onClick={handleLogout}
                    style={{
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '0.375rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: '500',
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link 
                  href="/?login=true" 
                  style={{
                    background: '#22c55e',
                    color: 'white',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    textDecoration: 'none',
                  }}
                >
                  Log in
                </Link>
              )}
              
              {/* Mobile menu button */}
              <button
                className="nav-mobile-btn"
                onClick={() => setNavOpen(!navOpen)}
                style={{
                  display: 'none',
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '0.375rem 0.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                ☰
              </button>
            </div>
          </div>
          
          {/* Mobile dropdown */}
          {navOpen && (
            <div className="nav-mobile-menu" style={{
              display: 'none',
              borderTop: '1px solid #334155',
              padding: '0.5rem',
              flexDirection: 'column',
              gap: '0.25rem',
            }}>
              {visibleUserItems.map(item => (
                <Link key={item.href} href={item.href} style={{
                  ...linkStyle(currentPath === item.href),
                  padding: '0.75rem 1rem',
                }}>
                  {item.label}
                </Link>
              ))}
              
              {/* Admin section in mobile */}
              {isAdmin && (
                <>
                  <div style={{ 
                    borderTop: '1px solid #334155', 
                    marginTop: '0.5rem', 
                    paddingTop: '0.5rem',
                    marginBottom: '0.25rem',
                  }}>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      color: '#7c3aed', 
                      textTransform: 'uppercase', 
                      fontWeight: 'bold',
                      padding: '0 1rem',
                    }}>
                      ⚙️ Admin
                    </span>
                  </div>
                  {adminNavItems.map(item => (
                    <Link key={item.href} href={item.href} style={{
                      ...linkStyle(currentPath === item.href),
                      padding: '0.75rem 1rem',
                      background: currentPath === item.href ? '#7c3aed20' : 'transparent',
                    }}>
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </nav>
      )}
      
      {/* Add padding to body when nav is visible */}
      <div style={{ paddingTop: !checking ? '3rem' : 0 }}>
        <Component {...pageProps} />
      </div>
      
      <style jsx global>{`
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-mobile-btn { display: block !important; }
          .nav-mobile-menu { display: flex !important; }
          .nav-email { display: none !important; }
        }
      `}</style>
    </>
  );
}
