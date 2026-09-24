import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('Processing...');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      // Get the hash fragment from the URL (Supabase puts tokens there)
      const hash = window.location.hash;
      if (!hash) {
        // Check for error in query params
        const params = new URLSearchParams(window.location.search);
        const errorDesc = params.get('error_description');
        if (errorDesc) {
          setError(errorDesc);
          setStatus('');
          return;
        }
        setStatus('Redirecting...');
        setTimeout(() => router.push('/'), 1000);
        return;
      }

      // Parse the hash fragment
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type'); // 'signup', 'magiclink', 'recovery'

      if (accessToken && refreshToken) {
        // Store tokens
        localStorage.setItem('supabase_access_token', accessToken);
        localStorage.setItem('supabase_refresh_token', refreshToken);
        
        setStatus('Success! Redirecting...');
        
        // Small delay so user sees success message
        setTimeout(() => {
          router.push('/');
        }, 1000);
      } else {
        setError('Invalid authentication response');
        setStatus('');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f172a', 
      color: '#e2e8f0', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{ 
        background: '#1e293b', 
        borderRadius: '1rem', 
        padding: '2rem', 
        maxWidth: '400px', 
        width: '100%',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}><i className="ti ti-music" style={{ fontSize: '1em' }} aria-hidden="true"></i></div>
        
        {status && (
          <>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {status.includes('Success') && <i className="ti ti-check" style={{ fontSize: '0.9em' }} aria-hidden="true"></i>} {status}
            </h1>
            {status.includes('Processing') && (
              <div style={{ color: '#838C95', fontSize: '0.875rem' }}>
                Setting up your session...
              </div>
            )}
          </>
        )}
        
        {error && (
          <>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#D45D25' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#838C95', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              {error}
            </p>
            <a 
              href="/" 
              style={{ 
                display: 'inline-block',
                padding: '0.75rem 1.5rem', 
                borderRadius: '0.5rem', 
                background: '#256B45', 
                color: '#fff', 
                fontWeight: 'bold', 
                textDecoration: 'none' 
              }}
            >
              Go to Home
            </a>
          </>
        )}
      </div>
    </div>
  );
}
