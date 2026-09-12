import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchUserRoleKeys, hasAnyRole } from '../lib/roles';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

const ICON_CHOICES = ['⭐', '🌟', '✨', '💫', '❤️', '💔', '👍', '👎', '✅', '❌', '✓', '🔥', '🎯', '🎓', '🎤', '👂', '📚', '📖', '🔖', '✏️', '❓', '🎵', '🎶', '💡', '🏆', '⏳'];
const COLOR_PRESETS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#64748b', '#ec4899', '#14b8a6'];

const slugify = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export default function OptionLists() {
  const [authChecked, setAuthChecked] = useState(false);
  const [userRoleKeys, setUserRoleKeys] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [familiarityLevels, setFamiliarityLevels] = useState([]);
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
    loadLists();
  };

  const loadLists = async () => {
    try {
      const headers = getAuthHeaders(false);
      const [statusRes, familiarityRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/status_options?select=*&order=display_order.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/familiarity_levels?select=*&order=display_order.asc`, { headers })
      ]);
      setStatusOptions(await statusRes.json());
      setFamiliarityLevels(await familiarityRes.json());
    } catch (error) { console.error('Error loading lists:', error); }
  };

  const isAdmin = hasAnyRole(userRoleKeys);

  // ---------- Generic list operations, shared by both tables ----------

  const addOption = async (table, label, icon, color, items, setItems) => {
    if (!label.trim()) return;
    const valueKey = slugify(label);
    if (items.some(i => i.value_key === valueKey)) {
      showMessage('❌ An option with that name already exists');
      return;
    }
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.display_order || 0)) : 0;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ value_key: valueKey, label: label.trim(), icon, color, display_order: maxOrder + 1 })
      });
      if (!res.ok) { showMessage('❌ Could not add option'); return; }
      const [newItem] = await res.json();
      setItems([...items, newItem]);
      showMessage(`✅ Added ${label}`);
    } catch (error) { console.error(error); showMessage('❌ Error adding option'); }
  };

  const updateOption = async (table, item, updates, items, setItems) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) { showMessage('❌ Could not save change'); return; }
      setItems(items.map(i => i.id === item.id ? { ...i, ...updates } : i));
    } catch (error) { console.error(error); showMessage('❌ Error saving change'); }
  };

  const deleteOption = async (table, item, items, setItems) => {
    if (!confirm(`Remove "${item.label}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${item.id}`, { method: 'DELETE', headers: getAuthHeaders(false) });
      if (!res.ok) { showMessage('❌ Could not remove option'); return; }
      setItems(items.filter(i => i.id !== item.id));
      showMessage(`✅ Removed ${item.label}`);
    } catch (error) { console.error(error); showMessage('❌ Error removing option'); }
  };

  const moveOption = async (table, item, direction, items, setItems) => {
    const sorted = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(i => i.id === item.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${item.id}`, { method: 'PATCH', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify({ display_order: other.display_order }) }),
        fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${other.id}`, { method: 'PATCH', headers: { ...getAuthHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify({ display_order: item.display_order }) })
      ]);
      setItems(items.map(i => {
        if (i.id === item.id) return { ...i, display_order: other.display_order };
        if (i.id === other.id) return { ...i, display_order: item.display_order };
        return i;
      }));
    } catch (error) { console.error(error); showMessage('❌ Error reordering'); }
  };

  // ---------- Reusable section renderer for one list ----------

  const OptionListSection = ({ title, table, items, setItems }) => {
    const [newLabel, setNewLabel] = useState('');
    const [newIcon, setNewIcon] = useState(ICON_CHOICES[0]);
    const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [editIcon, setEditIcon] = useState('');
    const [editColor, setEditColor] = useState('');
    const [pickerOpenFor, setPickerOpenFor] = useState(null); // 'new' | item.id | null

    const sorted = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    const startEdit = (item) => {
      setEditingId(item.id);
      setEditLabel(item.label);
      setEditIcon(item.icon || '');
      setEditColor(item.color || COLOR_PRESETS[0]);
    };

    const saveEdit = async (item) => {
      await updateOption(table, item, { label: editLabel.trim(), icon: editIcon, color: editColor }, items, setItems);
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
        <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>{title}</h2>

        {sorted.map((item, idx) => (
          <div key={item.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.5rem' }}>
            {editingId === item.id ? (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <button
                    onClick={() => setPickerOpenFor(pickerOpenFor === item.id ? null : item.id)}
                    style={{ fontSize: '1.25rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', cursor: 'pointer' }}
                  >
                    {editIcon || '?'}
                  </button>
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem', color: '#fff' }} />
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{ width: '2.5rem', height: '2.5rem', border: 'none', background: 'none', cursor: 'pointer' }} />
                </div>
                {pickerOpenFor === item.id && <IconPicker current={editIcon} onPick={(ic) => { setEditIcon(ic); setPickerOpenFor(null); }} />}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => saveEdit(item)} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                  <button onClick={() => { setEditingId(null); setPickerOpenFor(null); }} style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                  <span style={{ fontWeight: 'bold', color: item.color || '#fff' }}>{item.label}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({item.value_key})</span>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button onClick={() => moveOption(table, item, -1, items, setItems)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#334155' : '#94a3b8', cursor: idx === 0 ? 'default' : 'pointer' }}>▲</button>
                    <button onClick={() => moveOption(table, item, 1, items, setItems)} disabled={idx === sorted.length - 1} style={{ background: 'none', border: 'none', color: idx === sorted.length - 1 ? '#334155' : '#94a3b8', cursor: idx === sorted.length - 1 ? 'default' : 'pointer' }}>▼</button>
                    <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem' }}>Edit</button>
                    <button onClick={() => deleteOption(table, item, items, setItems)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
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
                style={{ fontSize: '1.25rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', cursor: 'pointer' }}
              >
                {newIcon}
              </button>
              <input
                placeholder="New option label..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem', color: '#fff' }}
              />
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: '2.5rem', height: '2.5rem', border: 'none', background: 'none', cursor: 'pointer' }} />
              <button
                onClick={async () => { await addOption(table, newLabel, newIcon, newColor, items, setItems); setNewLabel(''); }}
                disabled={!newLabel.trim()}
                style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer', opacity: newLabel.trim() ? 1 : 0.5 }}
              >
                + Add
              </button>
            </div>
            {pickerOpenFor === 'new' && <IconPicker current={newIcon} onPick={(ic) => { setNewIcon(ic); setPickerOpenFor(null); }} />}
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
          Add, rename, reorder, or remove the options people can tag songs with. Changes here don't affect anything live yet - this is a preview area until the rest of the app is wired up to use it.
        </p>

        {message && (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        <OptionListSection title="Song Status Options (favorite, dislike, etc.)" table="status_options" items={statusOptions} setItems={setStatusOptions} />
        <OptionListSection title="Familiarity Levels (per version)" table="familiarity_levels" items={familiarityLevels} setItems={setFamiliarityLevels} />
      </div>
    </div>
  );
}
