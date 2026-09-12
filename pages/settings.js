import { useState, useEffect } from 'react';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const CATEGORY_LABELS = {
  platform_stewardship: 'Platform',
  song_stewardship: 'Songs',
  general: 'General'
};

export default function Settings() {
  const [user, setUser] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({}); // key -> draft value being edited
  const [expandedDescriptions, setExpandedDescriptions] = useState({}); // key -> bool
  const [savingKey, setSavingKey] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  useEffect(() => { checkAuth(); loadSettings(); }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) return;
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (!res.ok) return;
      const userData = await res.json();
      setUser(userData);
      const roleKeys = await fetchUserRoleKeys(userData.id, getAuthHeaders(false));
      setUserRoleKeys(roleKeys);
    } catch (error) { console.error('Auth check failed:', error); }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?select=*&order=category.asc,label.asc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      if (Array.isArray(data)) {
        setSettings(data);
        const initialDrafts = {};
        data.forEach(s => { initialDrafts[s.key] = s.value; });
        setDrafts(initialDrafts);
      }
    } catch (error) { console.error('Error loading settings:', error); }
    setLoading(false);
  };

  const isAdmin = hasAnyRole(userRoleKeys);

  const validate = (setting, value) => {
    if (setting.value_type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) return 'Must be a number';
      const min = setting.constraints?.min;
      if (min !== undefined && num < min) return `Must be ${min} or more`;
      const max = setting.constraints?.max;
      if (max !== undefined && num > max) return `Must be ${max} or less`;
    }
    if (setting.value_type === 'select') {
      const options = setting.constraints?.options || [];
      if (!options.includes(value)) return `Must be one of: ${options.join(', ')}`;
    }
    return null;
  };

  const saveSetting = async (setting) => {
    const draftValue = drafts[setting.key];
    const error = validate(setting, draftValue);
    if (error) { showMessage(`❌ ${error}`); return; }

    const valueToSave = setting.value_type === 'number' ? Number(draftValue) : draftValue;

    setSavingKey(setting.key);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?key=eq.${setting.key}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ value: valueToSave, updated_by: user?.id, updated_at: new Date().toISOString() })
      });
      if (!res.ok) {
        showMessage('❌ Could not save - you may not have permission to edit this setting');
      } else {
        showMessage(`✅ Saved ${setting.label || setting.key}`);
        await loadSettings();
      }
    } catch (error) {
      console.error('Error saving setting:', error);
      showMessage('❌ Error saving setting');
    }
    setSavingKey(null);
  };

  const groupedSettings = settings.reduce((acc, s) => {
    const cat = s.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const inputStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '0.875rem', width: '100%', maxWidth: '300px' };
  const cardStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1rem', marginBottom: '0.75rem' };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: '2rem' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>⚙️ Settings</h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          {isAdmin ? 'Anyone can view these. You can edit them.' : 'Anyone can view these, but editing requires an admin role.'}
        </p>

        {message && (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        {settings.length === 0 && (
          <p style={{ color: '#64748b' }}>No settings configured yet.</p>
        )}

        {Object.entries(groupedSettings).map(([category, items]) => (
          <div key={category} style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.5rem' }}>
              {CATEGORY_LABELS[category] || category}
            </h2>
            {items.map(setting => {
              const isExpanded = expandedDescriptions[setting.key];
              const isSaving = savingKey === setting.key;
              const hasChanged = drafts[setting.key] !== setting.value;
              return (
                <div key={setting.key} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 'bold' }}>{setting.label || setting.key}</span>
                        <button
                          onClick={() => setExpandedDescriptions(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          {isExpanded ? '▲ Hide details' : 'ⓘ What does this do?'}
                        </button>
                      </div>
                      {isExpanded && (
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.375rem', maxWidth: '500px' }}>
                          {setting.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {setting.value_type === 'boolean' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isAdmin ? 'pointer' : 'default' }}>
                        <input
                          type="checkbox"
                          checked={!!drafts[setting.key]}
                          disabled={!isAdmin}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.checked }))}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{drafts[setting.key] ? 'On' : 'Off'}</span>
                      </label>
                    ) : setting.value_type === 'select' ? (
                      <select
                        value={drafts[setting.key] || ''}
                        disabled={!isAdmin}
                        onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.value }))}
                        style={inputStyle}
                      >
                        {(setting.constraints?.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={setting.value_type === 'number' ? 'number' : 'text'}
                        value={drafts[setting.key] ?? ''}
                        disabled={!isAdmin}
                        min={setting.constraints?.min}
                        max={setting.constraints?.max}
                        onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.value }))}
                        style={inputStyle}
                      />
                    )}

                    {isAdmin && hasChanged && (
                      <button
                        onClick={() => saveSetting(setting)}
                        disabled={isSaving}
                        style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', cursor: 'pointer', opacity: isSaving ? 0.6 : 1 }}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
