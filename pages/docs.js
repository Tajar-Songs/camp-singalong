import { useState, useEffect } from 'react';
import Link from 'next/link';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

export default function Docs() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('');

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`
    };
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadDocs();
    }
  }, [user, userProfile]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: getAuthHeaders()
      });
      
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        await loadUserProfile(userData.id);
      }
    } catch (error) {
      console.log('Auth check failed');
    }
    setLoading(false);
  };

  const loadUserProfile = async (userId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setUserProfile(data[0]);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadDocs = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/docs?select=*&order=title.asc`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        // Filter by visibility based on role
        const isAdmin = userProfile?.role === 'admin';
        const visibleDocs = isAdmin 
          ? data 
          : data.filter(doc => doc.visibility === 'user');
        setDocs(visibleDocs);
      }
    } catch (error) {
      console.error('Error loading docs:', error);
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  // Get unique folders
  const folders = [...new Set(docs.map(d => d.folder).filter(f => f))].sort();

  // Filter docs
  const filteredDocs = docs.filter(doc => {
    if (folderFilter && doc.folder !== folderFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const matchTitle = doc.title?.toLowerCase().includes(s);
      const matchContent = doc.content?.toLowerCase().includes(s);
      const matchTags = doc.tags?.some(t => t.toLowerCase().includes(s));
      if (!matchTitle && !matchContent && !matchTags) return false;
    }
    return true;
  });

  // Group docs by folder
  const docsByFolder = {};
  filteredDocs.forEach(doc => {
    const folder = doc.folder || 'Uncategorized';
    if (!docsByFolder[folder]) docsByFolder[folder] = [];
    docsByFolder[folder].push(doc);
  });

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: '#0f172a', 
        color: '#fff', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: '#0f172a', 
        color: '#fff', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>📚</div>
        <h1 style={{ fontSize: '1.5rem' }}>Documentation</h1>
        <p style={{ color: '#94a3b8' }}>Please log in to view documentation.</p>
        <Link href="/" style={{ 
          background: '#22c55e', 
          color: '#fff', 
          padding: '0.75rem 1.5rem', 
          borderRadius: '0.5rem', 
          textDecoration: 'none',
          fontWeight: 'bold'
        }}>
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f172a', 
      color: '#fff',
      paddingTop: '4rem' // Space for nav bar
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '2rem',
        display: 'grid',
        gridTemplateColumns: selectedDoc ? '300px 1fr' : '1fr',
        gap: '2rem'
      }}>
        {/* Sidebar / Doc List */}
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>📚 Documentation</h1>
            {isAdmin && (
              <Link href="/admin" style={{ 
                fontSize: '0.75rem', 
                color: '#94a3b8',
                textDecoration: 'none'
              }}>
                Edit Docs →
              </Link>
            )}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search documentation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              color: '#fff',
              marginBottom: '0.75rem'
            }}
          />

          {/* Folder filter */}
          {folders.length > 0 && (
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                color: '#fff',
                marginBottom: '1rem'
              }}
            >
              <option value="">All Folders</option>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}

          {/* Doc List */}
          <div style={{ 
            background: '#1e293b', 
            borderRadius: '0.75rem',
            border: '1px solid #334155',
            overflow: 'hidden'
          }}>
            {Object.entries(docsByFolder).map(([folder, folderDocs]) => (
              <div key={folder}>
                <div style={{ 
                  padding: '0.75rem 1rem', 
                  background: '#0f172a',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  📁 {folder}
                </div>
                {folderDocs.map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid #334155',
                      cursor: 'pointer',
                      background: selectedDoc?.id === doc.id ? '#22c55e22' : 'transparent',
                      borderLeft: selectedDoc?.id === doc.id ? '3px solid #22c55e' : '3px solid transparent'
                    }}
                  >
                    <div style={{ fontWeight: '500' }}>{doc.title}</div>
                    {doc.tags?.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        {doc.tags.map(tag => (
                          <span key={tag} style={{ 
                            background: '#334155', 
                            padding: '0.125rem 0.375rem', 
                            borderRadius: '0.25rem',
                            marginRight: '0.25rem'
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {filteredDocs.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                No documents found
              </div>
            )}
          </div>
        </div>

        {/* Doc Content */}
        {selectedDoc && (
          <div style={{ 
            background: '#1e293b', 
            borderRadius: '0.75rem',
            border: '1px solid #334155',
            padding: '2rem',
            minHeight: '70vh'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid #334155'
            }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {selectedDoc.title}
                </h1>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {selectedDoc.folder && <span>📁 {selectedDoc.folder} • </span>}
                  Updated {new Date(selectedDoc.updated_at || selectedDoc.created_at).toLocaleDateString()}
                  {selectedDoc.visibility === 'admin' && (
                    <span style={{ 
                      marginLeft: '0.5rem',
                      background: '#f59e0b33',
                      color: '#f59e0b',
                      padding: '0.125rem 0.375rem',
                      borderRadius: '0.25rem'
                    }}>
                      Admin Only
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setSelectedDoc(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1.5rem'
                }}
              >
                ×
              </button>
            </div>

            {/* Rendered HTML content */}
            <div 
              className="doc-content"
              dangerouslySetInnerHTML={{ __html: selectedDoc.content || '<p>No content yet.</p>' }}
              style={{ lineHeight: '1.7' }}
            />
          </div>
        )}

        {/* Placeholder when no doc selected */}
        {!selectedDoc && (
          <div style={{ 
            background: '#1e293b', 
            borderRadius: '0.75rem',
            border: '1px solid #334155',
            padding: '4rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            color: '#64748b'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📖</div>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Select a document</div>
            <div>Choose a document from the list to view it here</div>
          </div>
        )}
      </div>

      {/* Styles for rendered doc content */}
      <style jsx global>{`
        .doc-content h2 {
          font-size: 1.5rem;
          font-weight: bold;
          margin: 1.5rem 0 0.75rem 0;
          color: #fff;
        }
        .doc-content h3 {
          font-size: 1.25rem;
          font-weight: bold;
          margin: 1.25rem 0 0.5rem 0;
          color: #fff;
        }
        .doc-content p {
          margin: 0.75rem 0;
          color: #e2e8f0;
        }
        .doc-content ul, .doc-content ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
          color: #e2e8f0;
        }
        .doc-content li {
          margin: 0.25rem 0;
        }
        .doc-content a {
          color: #22c55e;
          text-decoration: underline;
        }
        .doc-content a:hover {
          color: #4ade80;
        }
        .doc-content strong, .doc-content b {
          font-weight: bold;
        }
        .doc-content em, .doc-content i {
          font-style: italic;
        }
        .doc-content code {
          background: #334155;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-family: monospace;
        }
        .doc-content pre {
          background: #0f172a;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
      `}</style>
    </div>
  );
}
