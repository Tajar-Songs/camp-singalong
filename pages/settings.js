import { useState, useEffect, useMemo } from 'react';
import { fetchMyPermissions, hasPermission } from '../lib/permissions';
import { notify } from '../lib/notify';

const SUPABASE_URL = 'https://xjkboyiszwrclireyecd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8eTKRrsLnSHEYMD2V2MhQ_S9XUSV5l';

// Everything configurable - simple settings, option lists, and (as of the
// Platform Governance Admin work, Sept 26, 2026) who can do what - is
// organized by which part of the platform it belongs to, never by mechanism.
//
// Sections:
//   Personal / Community       - placeholders, kept visible so it's obvious
//                                where future settings belong (Flexibility
//                                Over Rigidity).
//   One section per admin role - built from the roles table, not hardcoded,
//                                so a renamed or new role shows up on its own.
//
// Which section a setting or option list lives in, and who can change it,
// both come from the permission it requires (system_settings.required_permission,
// option_list_keys.required_permission) - one source of truth, stored as data.
// The database enforces the same permissions; this page only decides what
// to show as editable vs. view-only.

// Which role's section a permission's settings belong in. Anything not
// listed (including permissions.manage and unknown ones) goes under
// Governance - the strictest place, so nothing new lands somewhere looser
// by accident.
const PERMISSION_SECTION = {
  'settings.song': 'song_admin',
  'settings.health': 'platform_admin'
};
const ADMIN_ROLE_ORDER = ['platform_admin', 'song_admin', 'governance_admin'];

const CATEGORY_LABELS = {
  access_safety: 'Access & Safety',
  song_tracking: 'Song Tracking'
};

// Groups for the permission checklists, by the part of the key before the dot.
const PERMISSION_GROUP_LABELS = {
  docs: 'Docs', songs: 'Songs', tags: 'Tags', settings: 'Settings', permissions: 'Permissions'
};

const prettifyKey = (key) => key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const slugify = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Icon picker is still emoji, matching the existing data (option_lists.icon
// stores an emoji character) - switching this to Tabler icon names is the
// bigger, separate fix flagged in the handoff (it's the actual root of why
// songs.js needs its StatusIcon translation layer).
const ICON_CHOICES = ['⭐', '🌟', '✨', '💫', '❤️', '💔', '👍', '👎', '✅', '❌', '✓', '🔥', '🎯', '🎓', '🎤', '👂', '📚', '📖', '🔖', '✏️', '❓', '🎵', '🎶', '💡', '🏆', '⏳'];
// Presets draw from the documented accent palette (Forest Green, Twilight
// Blue, Dusty Purple, Campfire Orange, Stone Grey).
const COLOR_PRESETS = ['#3B9B73', '#6882B6', '#8F74B4', '#D45D25', '#838C95'];

// Palette (style guide): dark-mode text/accent vs. universal button fill.
const GREEN_TEXT = '#3B9B73';
const GREEN_FILL = '#318160';
const BLUE_TEXT = '#6882B6';
const PURPLE_TEXT = '#8F74B4';
const ORANGE_TEXT = '#D45D25';
const GREY_TEXT = '#838C95';

export default function Settings() {
  const [user, setUser] = useState(null);
  const [myPermissions, setMyPermissions] = useState([]);
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [allOptions, setAllOptions] = useState([]);
  const [listKeys, setListKeys] = useState([]);           // option_list_keys rows
  const [roles, setRoles] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [grantRules, setGrantRules] = useState([]);       // role_grant_permissions
  const [prerequisites, setPrerequisites] = useState([]); // role_prerequisites
  const [changeLog, setChangeLog] = useState([]);
  const [profileNames, setProfileNames] = useState({});   // user id -> display name, for the change log
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedLists, setExpandedLists] = useState({});
  // Pending governance changes (permissions, grant rules, eligibility),
  // batched behind one explicit review-and-save step rather than applied
  // on each click - these are high-impact, and the style guide batches
  // multi-choice changes behind an explicit apply.
  // Shape: { [table]: { [pairKey]: true (add) | false (remove) } }
  const [pending, setPending] = useState({ role_permissions: {}, role_grant_permissions: {}, role_prerequisites: {} });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const getAuthHeaders = (includeContentType = true) => {
    const token = localStorage.getItem('supabase_access_token') || SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const can = (key) => hasPermission(myPermissions, key);
  const canManagePermissions = can('permissions.manage');

  useEffect(() => {
    checkAuth();
    loadSettings();
    loadOptions();
    loadGovernance();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_access_token');
      if (!token) return;
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: getAuthHeaders(false) });
      if (!res.ok) return;
      const userData = await res.json();
      setUser(userData);
      setMyPermissions(await fetchMyPermissions(getAuthHeaders(false)));
      // The change log is only readable by role holders, so it's loaded
      // once we know who's asking.
      loadChangeLog();
    } catch (error) { console.error('Auth check failed:', error); }
  };

  const getJson = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: getAuthHeaders(false), cache: 'no-store' });
    if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getJson('system_settings?select=*&order=category.asc,label.asc');
      setSettings(data);
      const initialDrafts = {};
      data.forEach(s => { initialDrafts[s.key] = s.value; });
      setDrafts(initialDrafts);
    } catch (error) { console.error('Error loading settings:', error); }
    setLoading(false);
  };

  const loadOptions = async () => {
    try {
      const [options, keys] = await Promise.all([
        getJson('option_lists?select=*&order=list_key.asc,display_order.asc'),
        getJson('option_list_keys?select=*')
      ]);
      setAllOptions(options);
      setListKeys(keys);
    } catch (error) { console.error('Error loading option lists:', error); }
  };

  const loadGovernance = async () => {
    try {
      const [r, p, rp, g, pre] = await Promise.all([
        getJson('roles?select=*'),
        getJson('permissions?select=*&order=key.asc'),
        getJson('role_permissions?select=*'),
        getJson('role_grant_permissions?select=*'),
        getJson('role_prerequisites?select=*')
      ]);
      setRoles(r);
      setPermissionCatalog(p);
      setRolePermissions(rp);
      setGrantRules(g);
      setPrerequisites(pre);
    } catch (error) { console.error('Error loading roles and permissions:', error); }
  };

  const loadChangeLog = async () => {
    try {
      const rows = await getJson('governance_change_log?select=*&order=created_at.desc&limit=25');
      setChangeLog(rows);
      const ids = [...new Set(rows.map(r => r.changed_by).filter(Boolean))];
      if (ids.length > 0) {
        const profiles = await getJson(`user_profiles?id=in.(${ids.join(',')})&select=id,display_name`);
        const names = {};
        profiles.forEach(pr => { names[pr.id] = pr.display_name || 'Unnamed user'; });
        setProfileNames(names);
      }
    } catch (error) { console.error('Error loading change log:', error); }
  };

  // ---------- Lookups ----------
  const roleById = useMemo(() => Object.fromEntries(roles.map(r => [r.id, r])), [roles]);
  const roleByKey = useMemo(() => Object.fromEntries(roles.map(r => [r.key, r])), [roles]);
  const permissionByKey = useMemo(() => Object.fromEntries(permissionCatalog.map(p => [p.key, p])), [permissionCatalog]);
  const roleLabel = (id) => roleById[id]?.label || 'Unknown role';
  const permissionLabel = (key) => permissionByKey[key]?.label || key;

  // Plain-language "who can change this", from the live role -> permission
  // mapping - so view-only notes stay accurate when the mapping changes.
  const whoHas = (permissionKey) => {
    const labels = rolePermissions
      .filter(rp => rp.permission_key === permissionKey)
      .map(rp => roleLabel(rp.role_id));
    return labels.length > 0 ? labels.join(' or ') : 'no role currently';
  };
  const viewOnlyNote = (permissionKey) =>
    `View only - changing these requires "${permissionLabel(permissionKey)}" (${whoHas(permissionKey)}).`;

  // ---------- Where things live ----------
  const sectionForPermission = (permissionKey) => PERMISSION_SECTION[permissionKey] || 'governance_admin';
  const sectionForSetting = (s) => {
    if (s.scope === 'personal') return 'personal';
    if (s.scope === 'group') return 'community';
    return sectionForPermission(s.required_permission);
  };
  const listKeyInfo = (listKey) => listKeys.find(k => k.list_key === listKey);
  const sectionForList = (listKey) => {
    const info = listKeyInfo(listKey);
    // A list with no entry in option_list_keys has no managing permission,
    // so nobody can edit it (the database fails closed) - shown under
    // Governance, where assigning it would happen.
    return info ? sectionForPermission(info.required_permission) : 'governance_admin';
  };

  const sectionOrder = ['personal', ...ADMIN_ROLE_ORDER.filter(k => roleByKey[k]),
    ...roles.map(r => r.key).filter(k => !ADMIN_ROLE_ORDER.includes(k)).sort(), 'community'];
  const sectionLabel = (key) => {
    if (key === 'personal') return 'Personal';
    if (key === 'community') return 'Community';
    return roleByKey[key]?.label || prettifyKey(key);
  };
  // Ownership tiers (style guide): every admin section is Admin/Platform
  // tier, so green; Personal leads blue, Community leads purple.
  const sectionAccent = (key) => key === 'personal' ? BLUE_TEXT : key === 'community' ? PURPLE_TEXT : GREEN_TEXT;

  // ---------- Settings ----------
  const validate = (setting, value) => {
    if (setting.value_type === 'number') {
      const num = Number(value);
      if (value === '' || Number.isNaN(num)) return 'Must be a number';
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

  // Every write asks for the changed rows back and checks that at least one
  // came back. A change blocked by an access rule returns no error, just
  // zero rows - without this check it would falsely show "Saved".
  const writeRows = async (path, method, body) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: { ...getAuthHeaders(!!body), 'Prefer': 'return=representation' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!res.ok) {
      let detail = `database returned ${res.status}`;
      try { const err = await res.json(); detail = err.message || detail; } catch (e) { /* not JSON */ }
      throw new Error(detail);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("nothing was changed - you don't have permission for this");
    }
    return rows;
  };

  const saveSetting = async (setting) => {
    const draftValue = drafts[setting.key];
    const error = validate(setting, draftValue);
    if (error) { notify.error(`${setting.label || setting.key}: ${error}`); return; }
    const valueToSave = setting.value_type === 'number' ? Number(draftValue) : draftValue;
    setSavingKey(setting.key);
    try {
      await writeRows(`system_settings?key=eq.${setting.key}`, 'PATCH',
        { value: valueToSave, updated_by: user?.id, updated_at: new Date().toISOString() });
      notify.success(`Saved ${setting.label || setting.key}`);
      await loadSettings();
      if (setting.required_permission === 'permissions.manage') loadChangeLog();
    } catch (err) {
      console.error('Error saving setting:', err);
      notify.error(`Couldn't save ${setting.label || setting.key}: ${err.message}`);
    }
    setSavingKey(null);
  };

  // ---------- Option lists ----------
  const addOption = async (listKey, label, description, icon, color) => {
    if (!label.trim()) return false;
    const valueKey = slugify(label);
    const existing = allOptions.filter(o => o.list_key === listKey);
    if (existing.some(o => o.value_key === valueKey)) {
      notify.error(`"${label.trim()}" already exists in this list`);
      return false;
    }
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(o => o.display_order || 0)) : 0;
    try {
      const [newItem] = await writeRows('option_lists', 'POST', {
        list_key: listKey, value_key: valueKey, label: label.trim(),
        description: description.trim() || null, icon: icon || null, color: color || null,
        display_order: maxOrder + 1
      });
      setAllOptions(prev => [...prev, newItem]);
      notify.success(`Added ${label.trim()}`);
      return true;
    } catch (err) { console.error(err); notify.error(`Couldn't add ${label.trim()}: ${err.message}`); return false; }
  };

  const updateOption = async (item, updates) => {
    try {
      await writeRows(`option_lists?id=eq.${item.id}`, 'PATCH', updates);
      setAllOptions(prev => prev.map(o => o.id === item.id ? { ...o, ...updates } : o));
      return true;
    } catch (err) { console.error(err); notify.error(`Couldn't save ${item.label}: ${err.message}`); return false; }
  };

  const deleteOption = async (item) => {
    if (!confirm(`Remove "${item.label}"? This can't be undone.`)) return;
    try {
      await writeRows(`option_lists?id=eq.${item.id}`, 'DELETE');
      setAllOptions(prev => prev.filter(o => o.id !== item.id));
      notify.success(`Removed ${item.label}`);
    } catch (err) { console.error(err); notify.error(`Couldn't remove ${item.label}: ${err.message}`); }
  };

  const moveOption = async (listKey, item, direction) => {
    const sorted = allOptions.filter(o => o.list_key === listKey).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(o => o.id === item.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await writeRows(`option_lists?id=eq.${item.id}`, 'PATCH', { display_order: other.display_order });
      await writeRows(`option_lists?id=eq.${other.id}`, 'PATCH', { display_order: item.display_order });
      setAllOptions(prev => prev.map(o => {
        if (o.id === item.id) return { ...o, display_order: other.display_order };
        if (o.id === other.id) return { ...o, display_order: item.display_order };
        return o;
      }));
    } catch (err) {
      console.error(err);
      notify.error(`Couldn't reorder: ${err.message}`);
      loadOptions(); // re-sync in case only one of the two moves went through
    }
  };

  // ---------- Governance: pending changes ----------
  // Each governance table is a set of (a, b) pairs:
  //   role_permissions:       (role_id, permission_key)
  //   role_grant_permissions: (granter_role_id, target_role_id)
  //   role_prerequisites:     (role_id, required_role_id)
  const PAIR_FIELDS = {
    role_permissions: ['role_id', 'permission_key'],
    role_grant_permissions: ['granter_role_id', 'target_role_id'],
    role_prerequisites: ['role_id', 'required_role_id']
  };
  const liveRows = { role_permissions: rolePermissions, role_grant_permissions: grantRules, role_prerequisites: prerequisites };
  const pairKey = (a, b) => `${a}|${b}`;
  const liveHas = (table, a, b) => {
    const [fa, fb] = PAIR_FIELDS[table];
    return liveRows[table].some(r => r[fa] === a && r[fb] === b);
  };
  const effectiveHas = (table, a, b) => {
    const p = pending[table][pairKey(a, b)];
    return p === undefined ? liveHas(table, a, b) : p;
  };
  const togglePending = (table, a, b) => {
    const key = pairKey(a, b);
    const next = !effectiveHas(table, a, b);
    setPending(prev => {
      const t = { ...prev[table] };
      if (next === liveHas(table, a, b)) delete t[key]; else t[key] = next;
      return { ...prev, [table]: t };
    });
  };
  const pendingList = Object.entries(pending).flatMap(([table, entries]) =>
    Object.entries(entries).map(([key, add]) => {
      const [a, b] = key.split('|');
      return { table, a, b, add };
    }));
  const describeChange = ({ table, a, b, add }) => {
    if (table === 'role_permissions') return `${add ? 'Give' : 'Remove'} "${permissionLabel(b)}" ${add ? 'to' : 'from'} ${roleLabel(a)}`;
    if (table === 'role_grant_permissions') return `${roleLabel(a)} ${add ? 'can now' : 'can no longer'} grant or remove ${roleLabel(b)}`;
    return `${roleLabel(a)} ${add ? 'now requires' : 'no longer requires'} holding ${roleLabel(b)}`;
  };

  const applyPending = async () => {
    setApplying(true);
    const failures = [];
    let applied = 0;
    // Additions before removals: if someone is swapping which role holds a
    // protected permission (like "Manage permissions"), adding the new
    // holder first keeps the safeguard from blocking the swap.
    const ordered = [...pendingList].sort((x, y) => Number(y.add) - Number(x.add));
    for (const change of ordered) {
      const [fa, fb] = PAIR_FIELDS[change.table];
      try {
        if (change.add) {
          await writeRows(change.table, 'POST', { [fa]: change.a, [fb]: change.b });
        } else {
          await writeRows(`${change.table}?${fa}=eq.${encodeURIComponent(change.a)}&${fb}=eq.${encodeURIComponent(change.b)}`, 'DELETE');
        }
        applied += 1;
      } catch (err) {
        failures.push(`${describeChange(change)}: ${err.message}`);
      }
    }
    await loadGovernance();
    await loadChangeLog();
    setMyPermissions(await fetchMyPermissions(getAuthHeaders(false)));
    setPending({ role_permissions: {}, role_grant_permissions: {}, role_prerequisites: {} });
    setReviewOpen(false);
    setApplying(false);
    if (applied > 0) notify.success(`Saved ${applied} change${applied === 1 ? '' : 's'}`);
    failures.forEach(f => notify.error(`Not saved - ${f}`));
  };

  // ---------- Change log, in words ----------
  const describeLogEntry = (entry) => {
    const row = entry.new_row || entry.old_row || {};
    const added = entry.action === 'INSERT';
    const removed = entry.action === 'DELETE';
    switch (entry.table_name) {
      case 'role_permissions':
        return added ? `Gave "${permissionLabel(row.permission_key)}" to ${roleLabel(row.role_id)}`
          : removed ? `Removed "${permissionLabel(row.permission_key)}" from ${roleLabel(row.role_id)}`
          : `Changed a permission for ${roleLabel(row.role_id)}`;
      case 'role_grant_permissions':
        return `${roleLabel(row.granter_role_id)} ${removed ? 'can no longer' : 'can now'} grant ${roleLabel(row.target_role_id)}`;
      case 'role_prerequisites':
        return `${roleLabel(row.role_id)} ${removed ? 'no longer requires' : 'now requires'} ${roleLabel(row.required_role_id)}`;
      case 'option_list_keys':
        return `${added ? 'Added' : removed ? 'Removed' : 'Changed'} option list setup for "${row.title || row.list_key}"`;
      case 'system_settings': {
        const oldV = entry.old_row?.value; const newV = entry.new_row?.value;
        return `Changed "${row.label || row.key}"${JSON.stringify(oldV) !== JSON.stringify(newV) ? ` from ${JSON.stringify(oldV)} to ${JSON.stringify(newV)}` : ''}`;
      }
      default:
        return `${entry.action} on ${entry.table_name}`;
    }
  };

  // ---------- Grouping ----------
  const settingsBySection = settings.reduce((acc, s) => {
    const section = sectionForSetting(s);
    const cat = s.category || 'general';
    acc[section] = acc[section] || {};
    acc[section][cat] = acc[section][cat] || [];
    acc[section][cat].push(s);
    return acc;
  }, {});

  const allListKeys = [...new Set([...allOptions.map(o => o.list_key), ...listKeys.map(k => k.list_key)])];
  const listTitle = (listKey) => listKeyInfo(listKey)?.title || prettifyKey(listKey);
  const listsBySection = allListKeys.reduce((acc, k) => {
    const section = sectionForList(k);
    acc[section] = acc[section] || [];
    acc[section].push(k);
    return acc;
  }, {});
  Object.values(listsBySection).forEach(arr => arr.sort((a, b) => listTitle(a).localeCompare(listTitle(b))));

  const permissionGroups = permissionCatalog.reduce((acc, p) => {
    const group = p.key.split('.')[0];
    acc[group] = acc[group] || [];
    acc[group].push(p);
    return acc;
  }, {});

  // A one-line summary of what this person can change, shown at the top,
  // so nobody has to discover it by trying.
  const editableSummary = () => {
    if (!user) return 'Anyone can view these settings. Log in with an admin account to change them.';
    const labels = [];
    if (can('settings.health')) labels.push(`${sectionLabel('platform_admin')} settings`);
    if (can('settings.song')) labels.push(`${sectionLabel('song_admin')} settings`);
    if (canManagePermissions) labels.push('permissions and governance settings');
    if (labels.length === 0) return 'Anyone can view these settings. Your account can view them but not change them.';
    return `Anyone can view these settings. You can change: ${labels.join(', ')}.`;
  };

  // ---------- Styles ----------
  const inputStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '0.875rem', width: '100%', maxWidth: '300px' };
  const cardStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.75rem' };
  const subheadStyle = { fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: GREY_TEXT, marginBottom: '0.5rem' };
  const viewOnlyStyle = { display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: GREY_TEXT, fontSize: '0.8rem', margin: '0 0 0.75rem 0' };
  const primaryBtn = (disabled) => ({ background: GREEN_FILL, color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 });
  const secondaryBtn = { background: '#334155', color: '#fff', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer' };

  const ViewOnly = ({ permissionKey }) => (
    <p style={viewOnlyStyle}>
      <i className="ti ti-eye" style={{ marginTop: '0.1rem' }} aria-hidden="true"></i>
      <span>{viewOnlyNote(permissionKey)}</span>
    </p>
  );

  // ---------- Option list section ----------
  const OptionListSection = ({ listKey, accent }) => {
    const items = allOptions.filter(o => o.list_key === listKey);
    const sorted = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const isOpen = !!expandedLists[listKey];
    const info = listKeyInfo(listKey);
    const canEdit = !!info && can(info.required_permission);

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
      const ok = await updateOption(item, { label: editLabel.trim(), description: editDescription.trim() || null, icon: editIcon || null, color: editColor || null });
      if (ok) { setEditingId(null); setPickerOpenFor(null); notify.success(`Saved ${editLabel.trim()}`); }
    };

    const IconPicker = ({ current, onPick }) => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '0.25rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', marginTop: '0.375rem' }}>
        {ICON_CHOICES.map(ic => (
          <button
            key={ic}
            onClick={() => onPick(ic)}
            style={{ fontSize: '1.1rem', padding: '0.25rem', borderRadius: '0.25rem', border: current === ic ? `2px solid ${accent}` : '1px solid transparent', background: current === ic ? `${accent}20` : 'transparent', cursor: 'pointer' }}
          >
            {ic}
          </button>
        ))}
      </div>
    );
    const ColorPresets = ({ current, onPick }) => (
      <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
        {COLOR_PRESETS.map(c => (
          <button
            key={c}
            onClick={() => onPick(c)}
            title={c}
            aria-label={`Color ${c}`}
            style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: c, border: current === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
          />
        ))}
      </div>
    );

    return (
      <div style={{ marginBottom: '0.5rem', border: '1px solid #1e293b', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <button
          onClick={() => setExpandedLists(prev => ({ ...prev, [listKey]: !isOpen }))}
          aria-expanded={isOpen}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '0.6rem 0.85rem', background: '#0f172a', border: 'none', color: '#fff', textAlign: 'left' }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
            {listTitle(listKey)} <span style={{ color: GREY_TEXT, fontWeight: 'normal' }}>({items.length})</span>
            {!canEdit && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.75rem' }}> · view only</span>}
          </span>
          <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.85em', color: GREY_TEXT }} aria-hidden="true"></i>
        </button>
        {isOpen && (
          <div style={{ padding: '0.75rem', borderTop: '1px solid #1e293b' }}>
            {!info && (
              <p style={viewOnlyStyle}>
                <i className="ti ti-alert-triangle" style={{ color: ORANGE_TEXT, marginTop: '0.1rem' }} aria-hidden="true"></i>
                <span>This list isn't assigned a managing permission yet, so nobody can change it. Assigning one needs "Manage permissions".</span>
              </p>
            )}
            {info && !canEdit && <ViewOnly permissionKey={info.required_permission} />}
            {/* Existing values always shown before the add-new form, so
                someone can see what's already there before typing a
                near-duplicate (style guide: Preventing near-duplicate values). */}
            {sorted.map((item, idx) => (
              <div key={item.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.65rem', marginBottom: '0.5rem' }}>
                {editingId === item.id ? (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <button
                        onClick={() => setPickerOpenFor(pickerOpenFor === item.id ? null : item.id)}
                        aria-label="Choose icon"
                        style={{ fontSize: '1.15rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', cursor: 'pointer', minWidth: '2.5rem' }}
                      >
                        {editIcon || '—'}
                      </button>
                      <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} aria-label="Label" style={{ ...inputStyle, maxWidth: 'none', flex: 1 }} />
                    </div>
                    {pickerOpenFor === item.id && <IconPicker current={editIcon} onPick={(ic) => { setEditIcon(ic); setPickerOpenFor(null); }} />}
                    <ColorPresets current={editColor} onPick={setEditColor} />
                    <input
                      placeholder="Description (optional)"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      style={{ ...inputStyle, maxWidth: 'none', fontSize: '0.8rem', marginTop: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button onClick={() => saveEdit(item)} style={{ ...primaryBtn(false), padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}>Save</button>
                      <button onClick={() => { setEditingId(null); setPickerOpenFor(null); }} style={{ ...secondaryBtn, padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {item.icon && <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>}
                        <span style={{ fontWeight: 'bold', color: item.color || '#fff' }}>{item.label}</span>
                        <span style={{ fontSize: '0.7rem', color: GREY_TEXT }}>({item.value_key})</span>
                      </div>
                      {item.description && <div style={{ fontSize: '0.8rem', color: GREY_TEXT, marginTop: '0.2rem' }}>{item.description}</div>}
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                        <button onClick={() => moveOption(listKey, item, -1)} disabled={idx === 0} title="Move up" aria-label={`Move ${item.label} up`} style={{ background: 'none', border: 'none', color: idx === 0 ? '#334155' : GREY_TEXT, cursor: idx === 0 ? 'default' : 'pointer' }}><i className="ti ti-chevron-up" aria-hidden="true"></i></button>
                        <button onClick={() => moveOption(listKey, item, 1)} disabled={idx === sorted.length - 1} title="Move down" aria-label={`Move ${item.label} down`} style={{ background: 'none', border: 'none', color: idx === sorted.length - 1 ? '#334155' : GREY_TEXT, cursor: idx === sorted.length - 1 ? 'default' : 'pointer' }}><i className="ti ti-chevron-down" aria-hidden="true"></i></button>
                        <button onClick={() => startEdit(item)} title="Edit" aria-label={`Edit ${item.label}`} style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer' }}><i className="ti ti-edit" aria-hidden="true"></i></button>
                        <button onClick={() => deleteOption(item)} title="Remove" aria-label={`Remove ${item.label}`} style={{ background: 'none', border: 'none', color: ORANGE_TEXT, cursor: 'pointer' }}><i className="ti ti-trash" aria-hidden="true"></i></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {canEdit && (
              <div style={{ background: '#1e293b', border: '1px dashed #334155', borderRadius: '0.5rem', padding: '0.65rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setPickerOpenFor(pickerOpenFor === 'new' ? null : 'new')}
                    aria-label="Choose icon for new option"
                    style={{ fontSize: '1.15rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', cursor: 'pointer', minWidth: '2.5rem' }}
                  >
                    {newIcon || '—'}
                  </button>
                  <input
                    placeholder="New option label..."
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    style={{ ...inputStyle, maxWidth: 'none', flex: 1 }}
                  />
                  <button
                    onClick={async () => {
                      const ok = await addOption(listKey, newLabel, newDescription, newIcon, newColor);
                      if (ok) { setNewLabel(''); setNewDescription(''); setNewIcon(''); setNewColor(''); }
                    }}
                    disabled={!newLabel.trim()}
                    style={{ ...primaryBtn(!newLabel.trim()), padding: '0.5rem 0.9rem', whiteSpace: 'nowrap' }}
                  >
                    <i className="ti ti-plus" style={{ fontSize: '0.9em' }} aria-hidden="true"></i> Add
                  </button>
                </div>
                {pickerOpenFor === 'new' && <IconPicker current={newIcon} onPick={(ic) => { setNewIcon(ic); setPickerOpenFor(null); }} />}
                <ColorPresets current={newColor} onPick={setNewColor} />
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

  // ---------- A checkbox row for a governance pair ----------
  const PairCheckbox = ({ table, a, b, label, description }) => {
    const checked = effectiveHas(table, a, b);
    const changed = pending[table][pairKey(a, b)] !== undefined;
    return (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.35rem 0', cursor: canManagePermissions ? 'pointer' : 'default' }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!canManagePermissions}
          onChange={() => togglePending(table, a, b)}
          style={{ marginTop: '0.2rem', accentColor: GREEN_FILL }}
        />
        <span style={{ fontSize: '0.875rem' }}>
          {label}
          {changed && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: ORANGE_TEXT }}><i className="ti ti-point-filled" aria-hidden="true"></i> unsaved</span>}
          {description && <span style={{ display: 'block', color: GREY_TEXT, fontSize: '0.75rem' }}>{description}</span>}
        </span>
      </label>
    );
  };

  // ---------- Who can do what, for one role ----------
  const RoleGovernance = ({ role }) => {
    const otherRoles = roles.filter(r => r.id !== role.id);
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={subheadStyle}>Permissions</h2>
        {!canManagePermissions && <ViewOnly permissionKey="permissions.manage" />}
        <div style={cardStyle}>
          {Object.entries(permissionGroups).map(([group, perms]) => (
            <div key={group} style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: GREY_TEXT, marginBottom: '0.15rem' }}>{PERMISSION_GROUP_LABELS[group] || prettifyKey(group)}</div>
              {perms.map(p => (
                <PairCheckbox key={p.key} table="role_permissions" a={role.id} b={p.key} label={p.label} description={p.description} />
              ))}
            </div>
          ))}
        </div>

        <h2 style={subheadStyle}>Who can grant or remove {role.label}</h2>
        <div style={cardStyle}>
          {roles.map(granter => (
            <PairCheckbox key={granter.id} table="role_grant_permissions" a={granter.id} b={role.id} label={granter.label} />
          ))}
        </div>

        <h2 style={subheadStyle}>Who can be given {role.label}</h2>
        <div style={cardStyle}>
          <p style={{ fontSize: '0.8rem', color: GREY_TEXT, margin: '0 0 0.35rem 0' }}>Only people who already hold every role checked here. Nothing checked = anyone.</p>
          {otherRoles.map(req => (
            <PairCheckbox key={req.id} table="role_prerequisites" a={role.id} b={req.id} label={`Must already hold ${req.label}`} />
          ))}
        </div>
      </div>
    );
  };

  // ---------- Page ----------
  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: '2rem 1rem', paddingBottom: pendingList.length > 0 ? '6rem' : '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.25rem', fontFamily: "'Gloria Hallelujah', cursive" }}>
          <i className="ti ti-settings" aria-hidden="true"></i> Settings
        </h1>
        <p style={{ color: GREY_TEXT, marginBottom: '1.5rem', fontSize: '0.875rem' }}>{editableSummary()}</p>

        {sectionOrder.map(section => {
          const categories = settingsBySection[section] || {};
          const lists = listsBySection[section] || [];
          const role = roleByKey[section];
          const hasSettings = Object.values(categories).some(items => items.length > 0);
          const hasContent = hasSettings || lists.length > 0 || !!role;
          const accent = sectionAccent(section);
          const isOpen = !!expandedSections[section];
          return (
            <div key={section} style={{ marginBottom: '1rem', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, [section]: !isOpen }))}
                aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '0.85rem 1rem', background: '#0f172a', border: 'none', textAlign: 'left' }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: accent }}>
                  {sectionLabel(section)}
                  {role?.key === 'governance_admin' && <span style={{ color: GREY_TEXT, fontWeight: 'normal', fontSize: '0.8rem' }}> · a rare, high-trust role</span>}
                </span>
                <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} style={{ color: GREY_TEXT }} aria-hidden="true"></i>
              </button>
              {isOpen && (
                <div style={{ padding: '1rem', borderTop: '1px solid #1e293b' }}>
                  {!hasContent && <p style={{ color: GREY_TEXT, fontSize: '0.875rem' }}>Nothing configured here yet.</p>}

                  {role?.key === 'governance_admin' && (
                    <p style={{ color: GREY_TEXT, fontSize: '0.8rem', marginTop: 0, marginBottom: '1rem' }}>
                      Decides who can do what across the platform. Only given to people who hold both {sectionLabel('platform_admin')} and {sectionLabel('song_admin')}, and meant to stay with a small number of people.
                    </p>
                  )}

                  {Object.entries(categories).filter(([, items]) => items.length > 0).map(([category, items]) => (
                    <div key={category} style={{ marginBottom: '1.25rem' }}>
                      <h2 style={subheadStyle}>{CATEGORY_LABELS[category] || prettifyKey(category)}</h2>
                      {items.map(setting => {
                        const canEdit = can(setting.required_permission);
                        const isExpanded = expandedDescriptions[setting.key];
                        const isSaving = savingKey === setting.key;
                        // Compared as text: a number box hands back "2" while the saved value is 2.
                        const hasChanged = String(drafts[setting.key] ?? '') !== String(setting.value ?? '');
                        const inputId = `setting-${setting.key}`;
                        return (
                          <div key={setting.key} style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <label htmlFor={inputId} style={{ fontWeight: 'bold' }}>{setting.label || setting.key}</label>
                              <button
                                onClick={() => setExpandedDescriptions(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                                aria-expanded={!!isExpanded}
                                style={{ background: 'none', border: 'none', color: GREY_TEXT, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              >
                                <i className={`ti ti-${isExpanded ? 'chevron-up' : 'info-circle'}`} style={{ fontSize: '0.9em' }} aria-hidden="true"></i> {isExpanded ? 'Hide details' : 'What does this do?'}
                              </button>
                            </div>
                            {isExpanded && (
                              <p style={{ color: GREY_TEXT, fontSize: '0.8rem', marginTop: '0.375rem', maxWidth: '560px' }}>{setting.description}</p>
                            )}
                            {!canEdit && (
                              <p style={{ ...viewOnlyStyle, marginTop: '0.5rem', marginBottom: 0 }}>
                                <i className="ti ti-eye" style={{ marginTop: '0.1rem' }} aria-hidden="true"></i>
                                <span>{viewOnlyNote(setting.required_permission).replace('these', 'this')}</span>
                              </p>
                            )}
                            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {setting.value_type === 'boolean' ? (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEdit ? 'pointer' : 'default' }}>
                                  <input
                                    id={inputId}
                                    type="checkbox"
                                    checked={!!drafts[setting.key]}
                                    disabled={!canEdit}
                                    onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.checked }))}
                                    style={{ accentColor: GREEN_FILL }}
                                  />
                                  <span style={{ fontSize: '0.875rem', color: GREY_TEXT }}>{drafts[setting.key] ? 'On' : 'Off'}</span>
                                </label>
                              ) : setting.value_type === 'select' ? (
                                <select
                                  id={inputId}
                                  value={drafts[setting.key] || ''}
                                  disabled={!canEdit}
                                  onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.value }))}
                                  style={inputStyle}
                                >
                                  {(setting.constraints?.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : (
                                <input
                                  id={inputId}
                                  type={setting.value_type === 'number' ? 'number' : 'text'}
                                  value={drafts[setting.key] ?? ''}
                                  disabled={!canEdit}
                                  min={setting.constraints?.min}
                                  max={setting.constraints?.max}
                                  onChange={(e) => setDrafts(prev => ({ ...prev, [setting.key]: e.target.value }))}
                                  style={inputStyle}
                                />
                              )}
                              {canEdit && hasChanged && (
                                <button onClick={() => saveSetting(setting)} disabled={isSaving} style={primaryBtn(isSaving)}>
                                  {isSaving ? 'Saving...' : 'Save'}
                                </button>
                              )}
                            </div>
                            {setting.value_type === 'number' && setting.constraints?.min !== undefined && canEdit && (
                              <p style={{ fontSize: '0.75rem', color: GREY_TEXT, margin: '0.4rem 0 0 0' }}>
                                A whole number, {setting.constraints.min} or more{setting.constraints?.max !== undefined ? ` and ${setting.constraints.max} or less` : ''}.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {lists.length > 0 && (
                    <div style={{ marginBottom: role ? '1.25rem' : 0 }}>
                      <h2 style={subheadStyle}>Option Lists</h2>
                      {lists.map(listKey => (
                        <OptionListSection key={listKey} listKey={listKey} accent={accent} />
                      ))}
                    </div>
                  )}

                  {role && <RoleGovernance role={role} />}

                  {role?.key === 'governance_admin' && user && (
                    <div>
                      <h2 style={subheadStyle}>Recent permission changes</h2>
                      <div style={cardStyle}>
                        {changeLog.length === 0 ? (
                          <p style={{ color: GREY_TEXT, fontSize: '0.8rem', margin: 0 }}>
                            No changes recorded yet. (Visible to anyone holding an admin role.)
                          </p>
                        ) : (
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {changeLog.map(entry => (
                              <li key={entry.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.85rem' }}>
                                {describeLogEntry(entry)}
                                <span style={{ display: 'block', color: GREY_TEXT, fontSize: '0.75rem' }}>
                                  {entry.changed_by ? (profileNames[entry.changed_by] || 'Unknown user') : 'Directly in the database'} · {new Date(entry.created_at).toLocaleString()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unsaved governance changes: one explicit review-and-save step. */}
      {pendingList.length > 0 && canManagePermissions && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: '#1e293b', borderTop: '1px solid #334155', padding: '0.75rem 1rem' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.875rem' }}>
              <i className="ti ti-point-filled" style={{ color: ORANGE_TEXT }} aria-hidden="true"></i> {pendingList.length} unsaved permission change{pendingList.length === 1 ? '' : 's'}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setPending({ role_permissions: {}, role_grant_permissions: {}, role_prerequisites: {} })} style={secondaryBtn}>Discard</button>
              <button onClick={() => setReviewOpen(true)} style={primaryBtn(false)}>Review & save</button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="review-title" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '0.75rem', padding: '1.25rem', width: '100%', maxWidth: '540px' }}>
            <h2 id="review-title" style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: 0 }}>Review permission changes</h2>
            <p style={{ color: GREY_TEXT, fontSize: '0.85rem' }}>
              These take effect immediately for everyone holding these roles, and each one is recorded in the change log with your name.
            </p>
            <ul style={{ margin: '0 0 1rem 0', paddingLeft: '1.1rem', fontSize: '0.875rem' }}>
              {pendingList.map(change => (
                <li key={`${change.table}-${change.a}-${change.b}`} style={{ marginBottom: '0.3rem' }}>
                  <i className={`ti ti-${change.add ? 'plus' : 'minus'}`} style={{ color: change.add ? GREEN_TEXT : ORANGE_TEXT }} aria-hidden="true"></i> {describeChange(change)}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewOpen(false)} disabled={applying} style={secondaryBtn}>Back</button>
              <button onClick={applyPending} disabled={applying} style={primaryBtn(applying)}>{applying ? 'Saving...' : `Save ${pendingList.length} change${pendingList.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
