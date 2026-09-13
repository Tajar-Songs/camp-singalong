import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const ICON_CHOICES = ['⭐', '🌟', '✨', '💫', '❤️', '💔', '👍', '👎', '✅', '❌', '✓', '🔥', '🎯', '🎓', '🎤', '👂', '📚', '📖', '🔖', '✏️', '❓', '🎵', '🎶', '💡', '🏆', '⏳'];
const COLOR_PRESETS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#64748b', '#ec4899', '#14b8a6'];

const LIST_TITLES = {
  status_options: 'Song Status Options (favorite, dislike, etc.)',
  familiarity_levels: 'Familiarity Levels (per version)',
  version_types: 'Song Version Types',
  flag_types: 'Song Flags',
  note_types: 'Song Note Types',
  group_types: 'Song Group Types',
  member_roles: 'Group Member Roles',
  room_code_words: 'Room Name Words'
};

const prettifyKey = (key) => key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const slugify = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export default function OptionLists() {
  const [authChecked, setAuthChecked] = useState(false);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [allOptions, setAllOptions] = useState([]);
  const [message, setMessage] = useState('');

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (token) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
        if (res.ok) {
          const userData = await res.json();
          const roleKeys = await fetchUserRoleKeys(userData.id, getAuthHeaders(false));
          setUserRoleKeys(roleKeys);
        }
      }
    } catch (error) { console.error('Auth check failed:', error); }
    setAuthChecked(true);
    loadOptions();
  };

  const loadOptions = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/option_lists?select=*&order=list_key.asc,display_order.asc`, { headers: getAuthHeaders(false) });
      const data = await res.json();
      setAllOptions(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error loading option lists:', error); }
  };

  const isAdmin = hasAnyRole(userRoleKeys);

  const listKeys = [...new Set(allOptions.map(o => o.list_key))].sort((a, b) => {
    const knownKeys = Object.keys(LIST_TITLES);
    const ai = knownKeys.indexOf(a), bi = knownKeys.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

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

  const OptionListSection = ({ listKey }) => {
    const items = allOptions.filter(o => o.list_key === listKey);
    const sorted = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    const [newLabel, setNewLabel] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newIcon, setNewIcon] = useState('');
    const [newColor, setNewColor] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editIcon, setEditIcon] = useState('');
    const [editColor, setEditColor] = useState('');
    const [pickerOpenFor, setPickerOpenFor] = useState(null);

    const startEdit = (item) => {
      setEditingId(item.id);
      setEditLabel(item.label);
      setEditDescription(item.description || '');
      setEditIcon(item.icon || '');
      setEditColor(item.color || '');
    };

    const saveEdit = async (item) => {
      await updateOption(item, { label: editLabel.trim(), description: editDescription.trim() || null, icon: editIcon || null, color: editColor || null });
      setEditingId(null);
      setPickerOpenFor(null);
    };

    const IconPicker = ({ current, onPick }) => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '0.25rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', marginTop: '0.375rem' }}>
        {ICON_CHOICES.map(ic => (
          <button
            key={ic}
            onClick={() => onPick(ic)}
            style={{ fontSize: '1.1rem', padding: '0.25rem', borderRadius: '0.25rem', border: current === ic ? '2px solid #22c55e' : '1px solid transparent', background: current === ic ? '#22c55e20' : 'transparent', cursor: 'pointer' }}
          >
            {ic}
          </button>
        ))}
      </div>
    );

    return (
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>{LIST_TITLES[listKey] || prettifyKey(listKey)}</h2>

        {sorted.map((item, idx) => (
          <div key={item.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.5rem' }}>
            {editingId === item.id ? (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <button
                    onClick={() => setPickerOpenFor(pickerOpenFor === item.id ? null : item.id)}
                    style={{ fontSize: '1.25rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', cursor: 'pointer', minWidth: '2.5rem' }}
                  >
                    {editIcon || '—'}
                  </button>
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem', color: '#fff' }} />
                  <input type="color" value={editColor || '#334155'} onChange={(e) => setEditColor(e.target.value)} style={{ width: '2.5rem', height: '2.5rem', border: 'none', background: 'none', cursor: 'pointer' }} />
                </div>
                {pickerOpenFor === item.id && <IconPicker current={editIcon} onPick={(ic) => { setEditIcon(ic); setPickerOpenFor(null); }} />}
                <input
                  placeholder="Description (optional)"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem', color: '#fff', fontSize: '0.85rem', marginTop: '0.5rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => saveEdit(item)} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                  <button onClick={() => { setEditingId(null); setPickerOpenFor(null); }} style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {item.icon && <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>}
                    <span style={{ fontWeight: 'bold', color: item.color || '#fff' }}>{item.label}</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({item.value_key})</span>
                  </div>
                  {item.description && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>{item.description}</div>}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                    <button onClick={() => moveOption(listKey, item, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#334155' : '#94a3b8', cursor: idx === 0 ? 'default' : 'pointer' }}>▲</button>
                    <button onClick={() => moveOption(listKey, item, 1)} disabled={idx === sorted.length - 1} style={{ background: 'none', border: 'none', color: idx === sorted.length - 1 ? '#334155' : '#94a3b8', cursor: idx === sorted.length - 1 ? 'default' : 'pointer' }}>▼</button>
                    <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem' }}>Edit</button>
                    <button onClick={() => deleteOption(item)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isAdmin && (
          <div style={{ background: '#0f172a', border: '1px dashed #334155', borderRadius: '0.5rem', padding: '0.75rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setPickerOpenFor(pickerOpenFor === 'new' ? null : 'new')}
                style={{ fontSize: '1.25rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', cursor: 'pointer', minWidth: '2.5rem' }}
              >
                {newIcon || '—'}
              </button>
              <input
                placeholder="New option label..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem', color: '#fff' }}
              />
              <input type="color" value={newColor || '#334155'} onChange={(e) => setNewColor(e.target.value)} style={{ width: '2.5rem', height: '2.5rem', border: 'none', background: 'none', cursor: 'pointer' }} />
              <button
                onClick={async () => { await addOption(listKey, newLabel, newDescription, newIcon, newColor); setNewLabel(''); setNewDescription(''); setNewIcon(''); setNewColor(''); }}
                disabled={!newLabel.trim()}
                style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer', opacity: newLabel.trim() ? 1 : 0.5 }}
              >
                + Add
              </button>
            </div>
            {pickerOpenFor === 'new' && <IconPicker current={newIcon} onPick={(ic) => { setNewIcon(ic); setPickerOpenFor(null); }} />}
            <input
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem', color: '#fff', fontSize: '0.85rem', marginTop: '0.5rem' }}
            />
          </div>
        )}
      </div>
    );
  };

  if (!authChecked) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Access Denied</h1>
          <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>You need admin privileges to access this page.</p>
          <a href="/" style={{ color: '#22c55e' }}>← Back to Singalong</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: '2rem' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <Link href="/settings" style={{ color: '#64748b', fontSize: '0.8rem' }}>← Back to Settings</Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0.5rem 0 0.25rem' }}>📋 Manage Option Lists</h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          Add, rename, reorder, or remove the options used throughout the app. Changes to some lists (like media types) update the list shown, but adding a genuinely new option there may still need matching code to actually work correctly - ask if you're not sure.
        </p>

        {message && (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        {listKeys.length === 0 && (
          <p style={{ color: '#64748b' }}>No option lists configured yet.</p>
        )}

        {listKeys.map(listKey => (
          <OptionListSection key={listKey} listKey={listKey} />
        ))}
      </div>
    </div>
  );
}
