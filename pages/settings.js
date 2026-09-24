import { useState, useEffect } from 'react';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Everything configurable - simple settings and option lists alike - is
// organized by topic (which part of the platform it's about), never by
// mechanism (whether it happens to render as a toggle or a whole list).
// This is why settings.js and the old option-lists.js are now one page:
// splitting them apart was itself a mechanism-based split ("simple things
// here, list things over there"), which is exactly what made the old
// option-lists.js hard to navigate - eight lists of wildly different sizes,
// none of them organized by what they're actually about.
const SCOPE_ORDER = ['personal', 'platform_admin', 'song_admin', 'community'];
const SCOPE_LABELS = { personal: 'Personal', platform_admin: 'Platform Admin', song_admin: 'Song Admin', community: 'Community' };
// Personal and Community have nothing in them yet, but stay visible as real
// sections rather than being hidden until something exists - so it's obvious
// where new personal or community settings belong when they're added, per
// Flexibility Over Rigidity (evolve without needing structural rewrites) and
// so nobody has to guess or invent a new place for them later.
const EMPTY_SCOPES = new Set(['personal', 'community']);

const CATEGORY_LABELS = {
  access_safety: 'Access & Safety',
  song_tracking: 'Song Tracking'
};

// system_settings.scope in the database is only 'personal' | 'group' |
// 'platform' - it doesn't yet distinguish Platform Admin from Song Admin,
// so that split happens here, by category, for display only. 'group' maps
// to the future Community tier. Add a category here when a new one is
// created under 'platform' scope that's actually song-specific - anything
// not listed defaults to Platform Admin.
const SONG_ADMIN_CATEGORIES = ['song_tracking'];
function resolveScope(setting) {
  if (setting.scope === 'personal') return 'personal';
  if (setting.scope === 'group') return 'community';
  if (SONG_ADMIN_CATEGORIES.includes(setting.category)) return 'song_admin';
  return 'platform_admin';
}

// option_lists has no scope/category columns at all, so each list_key is
// mapped by hand below - same reasoning as above, and the same maintenance
// note applies: a new list_key needs adding here to show up in the right
// place, same as option-lists.js already warned that some new option values
// need matching code elsewhere to actually work.
const LIST_KEY_SCOPE = {
  familiarity_levels: 'song_admin', flag_types: 'song_admin', group_types: 'song_admin',
  member_roles: 'song_admin', note_types: 'song_admin', status_options: 'song_admin', version_types: 'song_admin',
  doc_audiences: 'platform_admin', feedback_topics: 'platform_admin', room_code_words: 'platform_admin'
};
const LIST_TITLES = {
  status_options: 'Song Status Options (favorite, dislike, etc.)',
  familiarity_levels: 'Familiarity Levels (per version)',
  version_types: 'Song Version Types',
  flag_types: 'Song Flags',
  note_types: 'Song Note Types',
  group_types: 'Song Group Types',
  member_roles: 'Group Member Roles',
  doc_audiences: 'Doc Audiences',
  feedback_topics: 'Feedback Topics',
  room_code_words: 'Room Name Words'
};

const prettifyKey = (key) => key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const slugify = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export default function Settings() {
  const [user, setUser] = useState(null);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [allOptions, setAllOptions] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  // Each top-level scope collapses independently, and each individual list
  // within a scope collapses independently too, one level in - so a list
  // with 90 entries (room_code_words) can sit right alongside a list with
  // four entries without dominating the page, and someone can open just the
  // one thing they came to change.
  const [expandedScopes, setExpandedScopes] = useState({});
  const [expandedLists, setExpandedLists] = useState({});

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  useEffect(() => { checkAuth(); loadSettings(); loadOptions(); }, []);

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

  const loadOptions = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/option_lists?select=*&order=list_key.asc,display_order.asc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setAllOptions(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading option lists:', error); }
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

  const addOption = async (listKey, label, description, icon, color) => {
    if (!label.trim()) return;
    const valueKey = slugify(label);
    const existing = allOptions.filter(o => o.list_key === listKey);
    if (existing.some(o => o.value_key === valueKey)) {
      showMessage('❌ An option with that name already exists in this list');
      return;
    }
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(o => o.display_order || 0)) : 0;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/option_lists`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ list_key: listKey, value_key: valueKey, label: label.trim(), description: description.trim() || null, icon: icon || null, color: color || null, display_order: maxOrder + 1 })
      });
      if (!res.ok) { showMessage('❌ Could not add option'); return; }
      const [newItem] = await res.json();
      setAllOptions(prev => [...prev, newItem]);
      showMessage(`✅ Added ${label}`);
    } catch (error) { console.error(error); showMessage('❌ Error adding option'); }
  };

  const updateOption = async (item, updates) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/option_lists?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) { showMessage('❌ Could not save change'); return; }
      setAllOptions(prev => prev.map(o => o.id === item.id ? { ...o, ...updates } : o));
    } catch (error) { console.error(error); showMessage('❌ Error saving change'); }
  };

  const deleteOption = async (item) => {
    if (!confirm(`Remove "${item.label}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/option_lists?id=eq.${item.id}`, { method: 'DELETE', headers: getAuthHeaders(false) });
      if (!res.ok) { showMessage('❌ Could not remove option'); return; }
      setAllOptions(prev => prev.filter(o => o.id !== item.id));
      showMessage(`✅ Removed ${item.label}`);
    } catch (error) { console.error(error); showMessage('❌ Error removing option'); }
  };

  const moveOption = async (listKey, item, direction) => {
    const sorted = allOptions.filter(o => o.list_key === listKey).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(o => o.id === item.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/option_lists?id=eq.${item.id}`, { method: 'PATCH', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify({ display_order: other.display_order }) }),
        fetch(`${SUPABASE_URL}/rest/v1/option_lists?id=eq.${other.id}`, { method: 'PATCH', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify({ display_order: item.display_order }) })
      ]);
      setAllOptions(prev => prev.map(o => {
        if (o.id === item.id) return { ...o, display_order: other.display_order };
        if (o.id === other.id) return { ...o, display_order: item.display_order };
        return o;
      }));
    } catch (error) { console.error(error); showMessage('❌ Error reordering'); }
  };

  const groupedByScope = settings.reduce((acc, s) => {
    const scope = resolveScope(s);
    const cat = s.category || 'general';
    if (!acc[scope]) acc[scope] = {};
    if (!acc[scope][cat]) acc[scope][cat] = [];
    acc[scope][cat].push(s);
    return acc;
  }, {});

  const listKeysByScope = SCOPE_ORDER.reduce((acc, scope) => {
    acc[scope] = [...new Set(allOptions.map(o => o.list_key))]
      .filter(k => (LIST_KEY_SCOPE[k] || 'platform_admin') === scope)
      .sort((a, b) => (LIST_TITLES[a] || prettifyKey(a)).localeCompare(LIST_TITLES[b] || prettifyKey(b)));
    return acc;
  }, {});

  const inputStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '0.875rem', width: '100%', maxWidth: '300px' };
  const cardStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1rem', marginBottom: '0.75rem' };

  // Scope-tier accent: Platform Admin and Song Admin are both Admin/Platform
  // tier (green) - the split between them is purely organizational, not a
  // new color. Personal leads blue, Community leads purple, matching the
  // ownership-tier system everywhere else on the platform.
  const scopeAccent = (scope) => {
    if (scope === 'personal') return '#6882B6';
    if (scope === 'community') return '#8F74B4';
    return '#3B9B73';
  };

  const OptionListSection = ({ listKey, accent }) => {
    const items = allOptions.filter(o => o.list_key === listKey);
    const sorted = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const isOpen = !!expandedLists[listKey];

    const [newLabel, setNewLabel] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const startEdit = (item) => {
      setEditingId(item.id);
      setEditLabel(item.label);
      setEditDescription(item.description || '');
    };
    const saveEdit = async (item) => {
      await updateOption(item, { label: editLabel.trim(), description: editDescription.trim() || null });
      setEditingId(null);
    };

    return (
      <div style={{ marginBottom: '0.5rem', border: '1px solid #1e293b', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <div
          onClick={() => setExpandedLists(prev => ({ ...prev, [listKey]: !isOpen }))}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '0.6rem 0.85rem', background: '#0f172a' }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
            {LIST_TITLES[listKey] || prettifyKey(listKey)} <span style={{ color: '#838C95', fontWeight: 'normal' }}>({items.length})</span>
          </span>
          <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.85em', color: '#838C95' }} aria-hidden="true"></i>
        </div>
        {isOpen && (
          <div style={{ padding: '0.75rem', borderTop: '1px solid #1e293b' }}>
            {/* Existing values always shown before the add-new form, so
                someone can see what's already there before typing a
                near-duplicate (style guide: Preventing near-duplicate
                values). */}
            {sorted.map((item, idx) => (
              <div key={item.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.65rem', marginBottom: '0.5rem' }}>
                {editingId === item.id ? (
                  <div>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ ...inputStyle, maxWidth: 'none', marginBottom: '0.4rem' }} />
                    <input
                      placeholder="Description (optional)"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      style={{ ...inputStyle, maxWidth: 'none', fontSize: '0.8rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button onClick={() => saveEdit(item)} style={{ background: '#256B45', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 'bold' }}>{item.label}</span>
                        <span style={{ fontSize: '0.7rem', color: '#838C95' }}>({item.value_key})</span>
                      </div>
                      {item.description && <div style={{ fontSize: '0.8rem', color: '#838C95', marginTop: '0.2rem' }}>{item.description}</div>}
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                        <button onClick={() => moveOption(listKey, item, -1)} disabled={idx === 0} title="Move up" style={{ background: 'none', border: 'none', color: idx === 0 ? '#334155' : '#838C95', cursor: idx === 0 ? 'default' : 'pointer' }}><i className="ti ti-chevron-up" aria-hidden="true"></i></button>
                        <button onClick={() => moveOption(listKey, item, 1)} disabled={idx === sorted.length - 1} title="Move down" style={{ background: 'none', border: 'none', color: idx === sorted.length - 1 ? '#334155' : '#838C95', cursor: idx === sorted.length - 1 ? 'default' : 'pointer' }}><i className="ti ti-chevron-down" aria-hidden="true"></i></button>
                        <button onClick={() => startEdit(item)} title="Edit" style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer' }}><i className="ti ti-edit" aria-hidden="true"></i></button>
                        <button onClick={() => deleteOption(item)} title="Remove" style={{ background: 'none', border: 'none', color: '#D45D25', cursor: 'pointer' }}><i className="ti ti-trash" aria-hidden="true"></i></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isAdmin && (
              <div style={{ background: '#1e293b', border: '1px dashed #334155', borderRadius: '0.5rem', padding: '0.65rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    placeholder="New option label..."
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    style={{ ...inputStyle, maxWidth: 'none', flex: 1 }}
                  />
                  <button
                    onClick={async () => { await addOption(listKey, newLabel, newDescription, null, null); setNewLabel(''); setNewDescription(''); }}
                    disabled={!newLabel.trim()}
                    style={{ background: accent, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 0.9rem', cursor: 'pointer', opacity: newLabel.trim() ? 1 : 0.5, whiteSpace: 'nowrap' }}
                  >
                    <i className="ti ti-plus" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Add
                  </button>
                </div>
                <input
                  placeholder="Description (optional)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 'none', fontSize: '0.8rem', marginTop: '0.5rem' }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: '2rem' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.25rem', fontFamily: "'Gloria Hallelujah', cursive" }}>
          <i className="ti ti-settings" aria-hidden="true"></i> Settings
        </h1>
        <p style={{ color: '#838C95', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          {isAdmin ? 'Anyone can view these. You can edit them.' : 'Anyone can view these, but editing requires an admin role.'}
        </p>

        {message && (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        {SCOPE_ORDER.map(scope => {
          const categories = groupedByScope[scope] || {};
          const listKeys = listKeysByScope[scope] || [];
          const hasContent = Object.values(categories).some(items => items.length > 0) || listKeys.length > 0;
          const accent = scopeAccent(scope);
          const isOpen = !!expandedScopes[scope];
          return (
            <div key={scope} style={{ marginBottom: '1rem', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedScopes(prev => ({ ...prev, [scope]: !isOpen }))}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '0.85rem 1rem', background: '#0f172a' }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: accent }}>{SCOPE_LABELS[scope]}</span>
                <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} style={{ color: '#838C95' }} aria-hidden="true"></i>
              </div>
              {isOpen && (
                <div style={{ padding: '1rem', borderTop: '1px solid #1e293b' }}>
                  {!hasContent && (
                    <p style={{ color: '#838C95', fontSize: '0.875rem' }}>Nothing configured here yet.</p>
                  )}

                  {Object.entries(categories).filter(([, items]) => items.length > 0).map(([category, items]) => (
                    <div key={category} style={{ marginBottom: '1.25rem' }}>
                      <h2 style={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#838C95', marginBottom: '0.5rem' }}>
                        {CATEGORY_LABELS[category] || category}
                      </h2>
                      {items.map(setting => {
                        const isExpanded = expandedDescriptions[setting.key];
                        const isSaving = savingKey === setting.key;
                        const hasChanged = drafts[setting.key] !== setting.value;
                        return (
                          <div key={setting.key} style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 'bold' }}>{setting.label || setting.key}</span>
                              <button
                                onClick={() => setExpandedDescriptions(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                                style={{ background: 'none', border: 'none', color: '#838C95', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              >
                                <i className={`ti ti-${isExpanded ? 'chevron-up' : 'info-circle'}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {isExpanded ? 'Hide details' : 'What does this do?'}
                              </button>
                            </div>
                            {isExpanded && (
                              <p style={{ color: '#838C95', fontSize: '0.8rem', marginTop: '0.375rem', maxWidth: '500px' }}>{setting.description}</p>
                            )}
                            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {setting.value_type === 'boolean' ? (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isAdmin ? 'pointer' : 'default' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!drafts[setting.key]}
                                    disabled={!isAdmin}
                                    onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.checked }))}
                                  />
                                  <span style={{ fontSize: '0.875rem', color: '#838C95' }}>{drafts[setting.key] ? 'On' : 'Off'}</span>
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
                                  style={{ background: accent, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', cursor: 'pointer', opacity: isSaving ? 0.6 : 1 }}
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

                  {listKeys.length > 0 && (
                    <div>
                      {categories && Object.keys(categories).length > 0 && (
                        <h2 style={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#838C95', marginBottom: '0.5rem' }}>Option Lists</h2>
                      )}
                      {listKeys.map(listKey => (
                        <OptionListSection key={listKey} listKey={listKey} accent={accent} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
