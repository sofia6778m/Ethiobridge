import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const PHONE_REGEX = /^09\d{8}$/;

// Roles shown in the Create/Edit User dropdown.
// 'subcity' is a UI-only sentinel; the real role (subcity_bole / subcity_yeka /
// subcity_lemmi_kura) is resolved automatically when the admin picks a subcity
// in the Subcity dropdown below.
const ROLES = [
  { value: 'subcity',    label: 'Subcity' },
  { value: 'woreda',     label: 'Woreda' },
  { value: 'department', label: 'Department' },
  { value: 'inspector',  label: 'Inspector' },
  { value: 'technician', label: 'Technician' },
  { value: 'ngo',        label: 'NGO' },
];

// All roles used in the filter dropdown — covers every role that exists in DB.
const FILTER_ROLES = [
  { value: 'citizen',           label: 'Citizen' },
  { value: 'government',        label: 'Government' },
  { value: 'ngo',               label: 'NGO' },
  { value: 'volunteer',         label: 'Volunteer' },
  { value: 'admin',             label: 'System Admin' },
  { value: 'subcity_bole',      label: 'Subcity – Bole' },
  { value: 'subcity_yeka',      label: 'Subcity – Yeka' },
  { value: 'subcity_lemmi_kura',label: 'Subcity – Lemmi Kura' },
  { value: 'woreda',            label: 'Woreda' },
  { value: 'department',        label: 'Department' },
  { value: 'inspector',         label: 'Inspector' },
  { value: 'technician',        label: 'Technician' },
];

// Maps the subcity name stored in DB → the role value used in the User model.
const SUBCITY_NAME_TO_ROLE = {
  BOLE:       'subcity_bole',
  YEKA:       'subcity_yeka',
  LEMMI_KURA: 'subcity_lemmi_kura',
};

// Roles whose subcity is fixed by the role value itself.
const SUBCITY_ROLE_MAP = {
  subcity_bole:       'BOLE',
  subcity_yeka:       'YEKA',
  subcity_lemmi_kura: 'LEMMI_KURA',
};

// Display labels for the legacy uppercase subcity keys stored in the DB.
const SUBCITY_DISPLAY = {
  BOLE:       'Bole',
  YEKA:       'Yeka',
  LEMMI_KURA: 'Lemmi Kura',
};

const EMPTY_FORM = {
  fullName: '', email: '', password: '', phone: '',
  role: 'citizen',
  organizationName: '', organizationType: '',
  subcity: '', woredaId: '', woredaName: '', department: '',
};

// Human-readable role label shown in the users table.
function getDisplayRole(user) {
  if (!user) return '—';
  switch (user.role) {
    case 'subcity_bole':
    case 'subcity_yeka':
    case 'subcity_lemmi_kura': {
      const sc = SUBCITY_DISPLAY[user.subcity] || SUBCITY_DISPLAY[SUBCITY_ROLE_MAP[user.role]] || user.subcity || user.role;
      return `Subcity – ${sc}`;
    }
    case 'woreda':      return `Woreda – ${user.woredaName || ''}`.trim().replace(/–\s*$/, '');
    case 'department':  return `${user.department || 'Dept'} (${user.woredaName || 'Woreda'})`;
    case 'inspector':   return `Inspector${user.subcity ? ` – ${SUBCITY_DISPLAY[user.subcity] || user.subcity}` : ''}`;
    case 'technician':  return `Technician${user.department ? ` – ${user.department}` : ''}${user.woredaName ? ` (${user.woredaName})` : ''}`;
    case 'admin':       return 'System Admin';
    case 'government':  return 'Government';
    case 'ngo':         return 'NGO';
    case 'volunteer':   return 'Volunteer';
    case 'citizen':     return 'Citizen';
    default:            return user.role;
  }
}

const roleColor = {
  citizen:              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  government:           'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  ngo:                  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  volunteer:            'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  admin:                'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  subcity_bole:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  subcity_yeka:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  subcity_lemmi_kura:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  woreda:               'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  department:           'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  inspector:            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  technician:           'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
};

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page,     setPage]     = useState(1);
  const [pages,    setPages]    = useState(1);
  const [total,    setTotal]    = useState(0);
  const [confirm,  setConfirm]  = useState(null);
  const [modal,    setModal]    = useState(null);   // 'create' | { type:'edit', id }
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [errors,   setErrors]   = useState({});
  const [locations,  setLocations]  = useState({ subcities: [], departments: [] });
  const [locLoading, setLocLoading] = useState(false);

  // Re-fetch locations every time the modal opens so newly created
  // subcities, woredas, and departments always appear immediately.
  const fetchLocations = async () => {
    setLocLoading(true);
    try {
      const r = await adminAPI.getLocations();
      setLocations(r.data);
    } catch (e) {
      console.error('[AdminUsers] getLocations:', e);
    } finally {
      setLocLoading(false);
    }
  };

  // Initial load on mount.
  useEffect(() => { fetchLocations(); }, []); // eslint-disable-line

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const r = await adminAPI.getUsers({ search, role: roleFilter, page, limit: 12 });
      setUsers(r.data.users);
      setPages(r.data.pages);
      setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [search, roleFilter, page]); // eslint-disable-line

  // ── Computed flags based on current form role ────────────────────────────
  const isSubcityRole   = Boolean(SUBCITY_ROLE_MAP[form.role]);
  const isWoredaRole    = form.role === 'woreda';
  const isDeptRole      = form.role === 'department';
  const isInspectorRole = form.role === 'inspector';
  const isTechRole      = form.role === 'technician';
  const showSubcity     = isSubcityRole || isWoredaRole || isDeptRole || isInspectorRole || isTechRole;
  const showWoreda      = isWoredaRole || isDeptRole || isTechRole;
  const showDepartment  = isDeptRole || isTechRole;
  const showOrgFields   = form.role === 'government' || form.role === 'ngo';
  const isCreateModal   = modal === 'create';
  const isEditModal     = modal?.type === 'edit';

  // Woreda options filtered by selected subcity.
  const woredaOptions = form.subcity
    ? (locations.subcities.find(s => s.name === form.subcity)?.woredas || [])
    : [];

  // Department options: use the selected woreda's own departments array when
  // available (returns exact canonical strings stored in the woreda record).
  // Fall back to the global Department collection list if the woreda record
  // has no departments array.
  const selectedWoreda    = woredaOptions.find(w => w._id === form.woredaId);
  const departmentOptions = (selectedWoreda?.departments?.length)
    ? selectedWoreda.departments          // string[] from the woreda doc
    : (locations.departments || []);      // fallback: global Department names

  // ── Event handlers ───────────────────────────────────────────────────────
  const toggleActive = async (id) => {
    try {
      await adminAPI.toggleActive(id);
      toast.success(t('dashboard.accountStatusUpdated'));
      fetchUsers();
    } catch { toast.error(t('dashboard.failedToUpdate')); }
  };

  const deleteUser = async (id) => {
    // Guard: never allow the currently logged-in admin to delete their own
    // account from the UI (the backend also rejects this as a safety net).
    if (id === currentUser?._id) {
      toast.error(t('dashboard.cannotDeleteSelf', 'You cannot delete your own account while logged in.'));
      setConfirm(null);
      return;
    }

    try {
      // adminAPI.deleteUser → DELETE /api/admin/users/:id
      // The JWT token is attached automatically by the axios interceptor
      // (Bearer token from localStorage), so the request is authorized.
      await adminAPI.deleteUser(id);
      toast.success(t('dashboard.userDeleted'));
      fetchUsers(); // refresh the list after a successful delete
    } catch (err) {
      // Surface the real server error (self-delete, last admin, default
      // admin, user not found, 401, 500, …) instead of a generic message.
      const msg = err.response?.data?.message || t('dashboard.failedToDelete');
      toast.error(msg);
    }
    setConfirm(null);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    fetchLocations();   // refresh subcities, woredas, departments from DB
    setModal('create');
  };

  const openEdit = (u) => {
    setForm({
      fullName: u.fullName, email: u.email, password: '',
      phone: u.phone || '', role: u.role,
      organizationName: u.organizationName || '',
      organizationType: u.organizationType || '',
      subcity: u.subcity || '', woredaId: u.woredaId || '',
      woredaName: u.woredaName || '', department: u.department || '',
    });
    setErrors({});
    fetchLocations();   // refresh subcities, woredas, departments from DB
    setModal({ type: 'edit', id: u._id });
  };

  const handleRoleChange = (nextRole) => {
    // 'subcity' is the UI sentinel value — map it to subcity_bole as a
    // temporary placeholder so the subcity location fields appear.
    // The actual subcity_* role is pinned when the admin picks a subcity below.
    const resolvedRole = nextRole === 'subcity' ? 'subcity_bole' : nextRole;
    const autoSubcity  = SUBCITY_ROLE_MAP[resolvedRole] || '';
    setForm(p => ({
      ...p,
      role: resolvedRole,
      subcity: autoSubcity,
      woredaId: '', woredaName: '', department: '',
    }));
    setErrors({});
  };

  const handleSubcityChange = (subcity) => {
    // When a subcity-admin account is being created, pin the role to the
    // correct subcity_* value as soon as the subcity is chosen.
    const resolvedRole = SUBCITY_NAME_TO_ROLE[subcity] || form.role;
    setForm(p => ({
      ...p,
      subcity,
      role: SUBCITY_ROLE_MAP[p.role] !== undefined ? resolvedRole : p.role,
      woredaId: '', woredaName: '',
    }));
    setErrors(p => ({ ...p, subcity: undefined, woreda: undefined }));
  };

  const handleWoredaChange = (woredaId) => {
    const opt = woredaOptions.find(w => w._id === woredaId);
    setForm(p => ({ ...p, woredaId: opt?._id || '', woredaName: opt?.name || '', department: '' }));
    setErrors(p => ({ ...p, woreda: undefined, department: undefined }));
  };

  const validateForm = () => {
    const errs = {};
    if (!form.fullName.trim())  errs.fullName = 'Full name is required';
    if (!form.email.trim())     errs.email    = 'Email is required';
    if (isCreateModal) {
      if (form.password.length < 6)
        errs.password = 'Password must be at least 6 characters';
      if (!PHONE_REGEX.test(form.phone))
        errs.phone = 'Phone must start with 09 and be 10 digits (e.g. 0912345678)';
    } else if (form.phone && !PHONE_REGEX.test(form.phone)) {
      errs.phone = 'Phone must start with 09 and be 10 digits (e.g. 0912345678)';
    }
    if (showSubcity   && !form.subcity)    errs.subcity    = 'Subcity is required';
    if (showWoreda    && !form.woredaId)   errs.woreda     = 'Woreda is required';
    if (showDepartment && !form.department) errs.department = 'Department is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (isCreateModal) {
        await adminAPI.createUser(form);
        toast.success(t('admin.userCreated', 'User created successfully'));
      } else {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await adminAPI.updateUser(modal.id, payload);
        toast.success(t('admin.userUpdated', 'User updated successfully'));
      }
      setModal(null);
      fetchUsers();
    } catch (err) {
      // 409 = duplicate location rule violation — surface the server message directly.
      const msg = err.response?.data?.message || t('dashboard.actionFailed', 'Action failed');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
          {t('dashboard.userManagement', 'User Management')}{' '}
          <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">({total})</span>
        </h2>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4">
          + {t('admin.createUser', 'Create User')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={t('dashboard.searchNameEmail', 'Search by name or email')}
          className="input-field flex-1 min-w-[180px]"
        />
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="input-field w-auto"
        >
          <option value="">{t('dashboard.allRoles', 'All roles')}</option>
          {FILTER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : users.length === 0 ? (
        <EmptyState icon="👥" title={t('dashboard.noUsersCreatedYet', 'No users found')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.userCol', 'User')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.roleCol', 'Role')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.statusCol', 'Status')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.joinedCol', 'Joined')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {users.map(u => (
                <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{u.fullName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
                    {u.organizationName && <p className="text-xs text-gray-400 dark:text-gray-500">{u.organizationName}</p>}
                    {/* Location context for woreda/department/inspector/technician accounts */}
                    {(u.woredaName || u.department || u.subcity) && (
                      <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                        {[u.subcity, u.woredaName, u.department].filter(Boolean).join(' › ')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[u.role] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {getDisplayRole(u)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                        {u.isActive ? t('dashboard.active', 'Active') : t('dashboard.deactivated', 'Deactivated')}
                      </span>
                      {!u.isApproved && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 w-fit">
                          {t('dashboard.pendingApproval', 'Pending approval')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => openEdit(u)} className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium">
                        {t('common.edit', 'Edit')}
                      </button>
                      <button
                        onClick={() => toggleActive(u._id)}
                        disabled={u.isActive && u._id === currentUser?._id}
                        title={u.isActive && u._id === currentUser?._id ? 'You cannot deactivate your own account' : undefined}
                        className={`text-xs py-1 px-2 rounded-lg font-medium ${
                          u.isActive && u._id === currentUser?._id
                            ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                            : u.isActive
                              ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40'
                              : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {u.isActive ? t('dashboard.deactivate', 'Deactivate') : t('dashboard.activate', 'Activate')}
                      </button>
                      <button
                        onClick={() => setConfirm({ id: u._id, name: u.fullName })}
                        disabled={u._id === currentUser?._id}
                        title={u._id === currentUser?._id ? 'You cannot delete your own account' : undefined}
                        className={`text-xs py-1 px-2 rounded-lg font-medium ${
                          u._id === currentUser?._id
                            ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                        }`}
                      >
                        {t('dashboard.delete', 'Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!confirm}
        title={t('dashboard.deleteUser', 'Delete User')}
        message={t('dashboard.deleteUserConfirm', { name: confirm?.name, defaultValue: `Delete ${confirm?.name}?` })}
        confirmLabel={t('dashboard.delete', 'Delete')}
        danger
        onConfirm={() => deleteUser(confirm.id)}
        onCancel={() => setConfirm(null)}
      />

      {/* Create / Edit modal */}
      {(isCreateModal || isEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4 text-gray-800 dark:text-gray-200">
              {isCreateModal ? t('admin.createUser', 'Create User') : t('admin.editUser', 'Edit User')}
            </h3>

            <form onSubmit={handleSave} noValidate className="space-y-3">

              {/* Name + Email */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('dashboard.fullName', 'Full Name')} *
                  </label>
                  <input
                    value={form.fullName}
                    onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. Abebe Kebede"
                  />
                  {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('dashboard.emailLabel', 'Email')} *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="input-field"
                    placeholder="name@example.com"
                    disabled={isEditModal}
                  />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </div>
              </div>

              {/* Password (create only) */}
              {isCreateModal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('dashboard.password', 'Password')} *
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="input-field"
                    placeholder="Minimum 6 characters"
                  />
                  {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
                </div>
              )}

              {/* Role + Phone */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('dashboard.roleCol', 'Role')} *
                  </label>
                  <select
                    value={SUBCITY_ROLE_MAP[form.role] ? 'subcity' : form.role}
                    onChange={e => handleRoleChange(e.target.value)}
                    className="input-field"
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('dashboard.phoneNumber', 'Phone')} {isCreateModal ? '*' : ''}
                  </label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="input-field"
                    placeholder="09XXXXXXXX"
                    maxLength={10}
                  />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
              </div>

              {/* Org fields (gov/ngo only) */}
              {showOrgFields && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('dashboard.orgName', 'Organization Name')}
                    </label>
                    <input
                      value={form.organizationName}
                      onChange={e => setForm(p => ({ ...p, organizationName: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('dashboard.orgType', 'Organization Type')}
                    </label>
                    <input
                      value={form.organizationType}
                      onChange={e => setForm(p => ({ ...p, organizationType: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              {/* Subcity + Woreda + Department (location-scoped roles) */}
              {showSubcity && (
                <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-700/30">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                    Location Assignment
                    {locLoading && (
                      <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    )}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {/* Subcity */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Subcity *
                      </label>
                      {isSubcityRole ? (
                        // Fixed for subcity-admin roles — show read-only label.
                        <div className="input-field bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed">
                          {SUBCITY_DISPLAY[form.subcity] || form.subcity || '—'}
                        </div>
                      ) : (
                        <select
                          value={form.subcity}
                          onChange={e => handleSubcityChange(e.target.value)}
                          className="input-field"
                        >
                          <option value="">Select Subcity</option>
                          {locations.subcities.map(s => (
                            <option key={s.name} value={s.name}>
                              {SUBCITY_DISPLAY[s.name] || s.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.subcity && <p className="text-xs text-red-500 mt-1">{errors.subcity}</p>}
                      {isSubcityRole && (
                        <p className="text-xs text-gray-400 mt-1">Assigned automatically from the role.</p>
                      )}
                    </div>

                    {/* Woreda */}
                    {showWoreda && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Woreda *
                        </label>
                        <select
                          value={form.woredaId}
                          onChange={e => handleWoredaChange(e.target.value)}
                          disabled={!form.subcity}
                          className="input-field disabled:opacity-60"
                        >
                          <option value="">
                            {form.subcity ? 'Select Woreda' : 'Select a subcity first'}
                          </option>
                          {woredaOptions.filter(w => w._id).map(w => (
                            <option key={w._id} value={w._id}>{w.name}</option>
                          ))}
                        </select>
                        {errors.woreda && <p className="text-xs text-red-500 mt-1">{errors.woreda}</p>}
                      </div>
                    )}
                  </div>

                  {/* Department */}
                  {showDepartment && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Department *
                      </label>
                      <select
                        value={form.department}
                        onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                        disabled={!form.woredaId}
                        className="input-field disabled:opacity-60"
                      >
                        <option value="">
                          {form.woredaId ? 'Select Department' : 'Select a woreda first'}
                        </option>
                        {departmentOptions.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      {errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
                    </div>
                  )}

                  {/* Uniqueness hint */}
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {isInspectorRole
                      ? 'Multiple inspectors can be assigned per subcity.'
                      : isTechRole
                        ? 'Multiple technicians can be assigned per woreda department.'
                        : isSubcityRole
                          ? 'Only one account is allowed per subcity.'
                          : showDepartment
                            ? `One account per department per woreda. ${selectedWoreda ? `${selectedWoreda.name} has ${departmentOptions.length} department(s).` : ''}`
                            : 'Only one woreda manager account is allowed per woreda.'}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="btn-secondary flex-1"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 disabled:opacity-60"
                >
                  {saving
                    ? t('dashboard.processing', 'Processing…')
                    : isCreateModal
                      ? t('admin.createUser', 'Create User')
                      : t('admin.saveChanges', 'Save Changes')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
