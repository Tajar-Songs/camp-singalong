import { useState, useEffect } from 'react';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const SECTION_INFO = {
  A: "Graces", B: "Girl Scout Standards", C: "Camp Arrowhead Songs", D: "Patriotic Songs",
  E: "Traditional & Folk Songs", F: "Morning Songs", G: "Animal Songs", H: "Action Songs",
  I: "Silly Songs", J: "Food Songs", K: "Echo/Repeat Songs", L: "Campfire Songs",
  M: "Lullabies", N: "Friendship Songs", O: "Happiness, Fun & Laughter", P: "Love Songs",
  Q: "Peace Songs", R: "Outdoor Songs", S: "Songs to be Sung Together",
  T: "Rounds that need Translation", U: "Rounds & Canons", V: "Contemporary Folk Songs",
  W: "Kids' Movies & Musicals"
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState('songs');
  const [allSongs, setAllSongs] = useState([]);
  const [changeLog, setChangeLog] = useState([]);
  const [reportViews, setReportViews] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSections, setSelectedSections] = useState(Object.keys(SECTION_INFO));
  const [showSectionFilter, setShowSectionFilter] = useState(false);
  
  // New Filter States
  const [viewerName, setViewerName] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rowLimit, setRowLimit] = useState(100);
  
  const [lastViewDate, setLastViewDate] = useState(null);
  const [showSinceLastView, setShowSinceLastView] = useState(false);
  const [loading, setLoading] = useState(true);

  const theme = {
    bg: '#111827',
    bgSecondary: '#1f2937',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    primary: '#22c55e',
    primaryHover: '#16a34a',
    border: '#374151',
    danger: '#dc2626'
  };

  const inputStyle = {
    padding: '0.5rem',
    borderRadius: '0.25rem',
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    color: theme.text,
    fontSize: '0.875rem'
  };

  // Re-run loadData whenever filters change
  useEffect(() => {
    loadData();
  }, [activeTab, startDate, endDate, userFilter, rowLimit, showSinceLastView, lastViewDate]);

  useEffect(() => {
    if (viewerName) {
      const lastView = reportViews
        .filter(v => v.viewer_name.toLowerCase() === viewerName.toLowerCase())
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      setLastViewDate(lastView ? new Date(lastView.created_at) : null);
    } else {
      setLastViewDate(null);
    }
  }, [viewerName, reportViews]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Build Dynamic Change Log URL
      let logParams = `select=*&order=created_at.desc&limit=${rowLimit}`;
      
      if (showSinceLastView && lastViewDate) {
        logParams += `&created_at=gt.${lastViewDate.toISOString()}`;
      } else {
        if (startDate) logParams += `&created_at=gte.${startDate}`;
        if (endDate) logParams += `&created_at=lte.${endDate}T23:59:59`;
      }
      
      if (userFilter) logParams += `&changed_by=ilike.*${userFilter}*`;

      const [songsRes, logRes, viewsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=title.asc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/change_log?${logParams}`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/report_views?select=*&order=created_at.desc`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        })
      ]);
      
      setAllSongs(await songsRes.json());
      setChangeLog(await logRes.json());
      setReportViews(await viewsRes.json());
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const recordView = async () => {
    if (!viewerName.trim()) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/report_views`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ viewer_name: viewerName.trim() })
      });
      await loadData();
    } catch (error) {
      console.error('Error recording view:', error);
    }
  };

  const toggleSection = (section) => {
    setSelectedSections(selectedSections.includes(section)
      ? selectedSections.filter(s => s !== section)
      : [...selectedSections, section]);
  };

  const filteredSongs = allSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
    selectedSections.includes(song.section)
  );

  // Note: filteredLog is now handled mostly by the server, 
  // but we keep the search filter for song titles here for "instant" feel.
  const displayLog = changeLog.filter(entry => 
    entry.song_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportSongsCSV = () => {
    const headers = ['Title', 'Section', 'Page', 'Old Page'];
    const rows = filteredSongs.map(song => [
      `"${song.title.replace(/"/g, '""')}"`,
      song.section,
      song.page || '',
      song.old_page || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csv, 'songs-report.csv');
  };

  const exportLogCSV = () => {
    const headers = ['Date', 'Action', 'Song Title', 'Field Changed', 'Old Value', 'New Value', 'Changed By'];
    const rows = displayLog.map(entry => [
      new Date(entry.created_at).toLocaleString(),
      entry.action,
      `"${(entry.song_title || '').replace(/"/g, '""')}"`,
      entry.field_changed || '',
      `"${(entry.old_value || '').replace(/"/g, '""')}"`,
      `"${(entry.new_value || '').replace(/"/g, '""')}"`,
      entry.changed_by || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csv, 'change-log.csv');
  };

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text, padding: '2rem' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>📊 Reports</h1>
            <p style={{ color: theme.textSecondary }}>{allSongs.length} songs • {changeLog.length} changes showing</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a href="/admin" style={{ background: theme.bgSecondary, color: theme.text, padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${theme.border}`, textDecoration: 'none' }}>← Admin</a>
            <a href="/" style={{ background: theme.bgSecondary, color: theme.text, padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${theme.border}`, textDecoration: 'none' }}>← Back to App</a>
          </div>
        </div>

        {/* Global Search & Limit Filter Bar */}
        <div style={{ background: theme.bgSecondary, borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', border: `1px solid ${theme.border}`, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: theme.textSecondary, marginBottom: '0.25rem' }}>Search Songs</label>
            <input type="text" placeholder="Title search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: theme.textSecondary, marginBottom: '0.25rem' }}>Rows to Load</label>
            <select value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} style={inputStyle}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="2000">All</option>
            </select>
          </div>
          <button onClick={activeTab === 'songs' ? exportSongsCSV : exportLogCSV} style={{ background: theme.primary, color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', height: '38px' }}>
            Export CSV
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button onClick={() => setActiveTab('songs')} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: '600', background: activeTab === 'songs' ? theme.primary : theme.bgSecondary, color: activeTab === 'songs' ? 'white' : theme.text }}>Song Report</button>
          <button onClick={() => setActiveTab('changelog')} style={{ padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: '600', background: activeTab === 'changelog' ? theme.primary : theme.bgSecondary, color: activeTab === 'changelog' ? 'white' : theme.text }}>Change Log</button>
        </div>

        {/* Change Log Advanced Filters (Only visible on Change Log tab) */}
        {activeTab === 'changelog' && (
          <div style={{ background: theme.bgSecondary, borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem', border: `1px solid ${theme.border}`, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: theme.textSecondary, marginBottom: '0.25rem' }}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: theme.textSecondary, marginBottom: '0.25rem' }}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: theme.textSecondary, marginBottom: '0.25rem' }}>Changed By</label>
              <input type="text" placeholder="Admin name..." value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
               <button onClick={() => { setStartDate(''); setEndDate(''); setUserFilter(''); setShowSinceLastView(false); }} style={{ ...inputStyle, cursor: 'pointer' }}>Reset Filters</button>
            </div>
          </div>
        )}

        {/* Viewer Tracking Section */}
        <div style={{ background: theme.bgSecondary, borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem', border: `1px solid ${theme.border}`, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
           <input type="text" value={viewerName} onChange={(e) => setViewerName(e.target.value)} placeholder="Your name..." style={inputStyle} />
           {viewerName && <button onClick={recordView} style={{ background: theme.primary, color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>Mark as Viewed</button>}
           {lastViewDate && <span style={{ color: theme.textSecondary, fontSize: '0.875rem' }}>Last viewed: {formatDate(lastViewDate)}</span>}
           {lastViewDate && activeTab === 'changelog' && (
              <label style={{ color: theme.text, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={showSinceLastView} onChange={(e) => setShowSinceLastView(e.target.checked)} />
                Only show changes since my last view
              </label>
           )}
        </div>

        {/* Tab Content Rendering */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: theme.textSecondary }}>Loading data...</div>
        ) : (
          activeTab === 'songs' ? (
            /* Songs Table Code - Using filteredSongs */
            <div style={{ background: theme.bgSecondary, borderRadius: '0.5rem', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: theme.bg }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Title</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Section</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Page</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Old Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSongs.slice(0, rowLimit).map(song => (
                      <tr key={song.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '0.75rem' }}>{song.title}</td>
                        <td style={{ padding: '0.75rem' }}>{song.section}</td>
                        <td style={{ padding: '0.75rem' }}>{song.page}</td>
                        <td style={{ padding: '0.75rem' }}>{song.old_page || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          ) : (
            /* Change Log Table Code - Using displayLog */
            <div style={{ background: theme.bgSecondary, borderRadius: '0.5rem', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
               <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: theme.bg }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Date</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Action</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Song</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Field</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>Old Value</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>New Value</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: `1px solid ${theme.border}` }}>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayLog.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: theme.textSecondary }}>No changes found matching these filters</td></tr>
                    ) : (
                      displayLog.map(entry => (
                        <tr key={entry.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>{formatDate(entry.created_at)}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: '600', background: entry.action === 'add' ? '#166534' : entry.action === 'edit' ? '#1e40af' : '#991b1b', color: 'white' }}>{entry.action.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '0.75rem' }}>{entry.song_title}</td>
                          <td style={{ padding: '0.75rem' }}>{entry.field_changed || '-'}</td>
                          <td style={{ padding: '0.75rem' }}>{entry.old_value || '-'}</td>
                          <td style={{ padding: '0.75rem' }}>{entry.new_value || '-'}</td>
                          <td style={{ padding: '0.75rem' }}>{entry.changed_by}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
            </div>
          )
        )}

        <div style={{ position: 'fixed', bottom: '1rem', left: '0', right: '0', textAlign: 'center', background: theme.bg, paddingTop: '0.5rem' }}>
          <a href="https://docs.google.com/forms/d/e/1FAIpQLScwkZP7oISooLkhx-gksF5jjmjgMi85Z4WsKEC5eWU_Cdm9sg/viewform?usp=header" target="_blank" rel="noopener noreferrer" style={{ color: '#9ca3af', fontSize: '0.875rem', textDecoration: 'none' }}>📝 Share Feedback</a>
        </div>
      </div>
    </div>
  );
}