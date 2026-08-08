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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Display labels for the legacy uppercase subcity keys stored in the DB.
const SUBCITY_DISPLAY = {
  BOLE: 'Bole',
  YEKA: 'Yeka',
  LEMMI_KURA: 'Lemmi Kura',
};

function displaySubcity(raw) {
  if (!raw) return '—';
  return SUBCITY_DISPLAY[raw] || raw;
}

function roleLabel(role) {
  if (role === 'woreda_admin') return 'Woreda Admin';
  if (role === 'department_officer') return 'Department Officer';
  if (role === 'SUBCITY_ADMIN' || (typeof role === 'string' && role.startsWith('subcity_'))) return 'Subcity Admin';
  return role || '—';
}

// Which accounts the list currently shows. getUsers expects role='subcity' to
// match every subcity_* role; woreda_admin and department_officer match exactly.
const ROLE_FILTERS = [
  { value: 'subcity', label: 'Subcity Admins' },
  { value: 'woreda_admin', label: 'Woreda Admins' },
  { value: 'department_officer', label: 'Department Officers' },
];

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  accountRole: 'subcity',        // 'subcity' | 'woreda_admin' | 'department_officer'
  subcity: '',                   // subcity admin: subcity NAME
  subcityId: '',                 // woreda_admin / department_officer: subcity ObjectId
  woredaId: '',
  departmentId: '',
};

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subcityFilter, setSubcityFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('subcity');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Subcity records (source of truth for the dropdown + filter).
  const [subcities, setSubcities] = useState([]);
  const [locLoading, setLocLoading] = useState(false);

  // Woredas for the selected subcity (woreda admin accounts only).
  const [woredas, setWoredas] = useState([]);
  const [woredaLoading, setWoredaLoading] = useState(false);

  // Departments for the selected subcity (department officer accounts only).
  const [departments, setDepartments] = useState([]);
  const [departmentLoading, setDepartmentLoading] = useState(false);

  // modal = null | 'create' | { type: 'edit', id }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isCreateModal = modal === 'create';
  const isEditModal = modal?.type === 'edit';
  const isWoredaRole = form.accountRole === 'woreda_admin';
  const isDeptRole = form.accountRole === 'department_officer';
  const isScopedRole = isWoredaRole || isDeptRole;

  // Only Active subcities are offered for account creation.
  const activeSubcities = subcities.filter((s) => s.status === 'Active');

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchSubcities = async () => {
    setLocLoading(true);
    try {
      const r = await adminAPI.getSubcities();
      setSubcities(r.data.subcities || []);
    } catch (e) {
      console.error('[AdminUsers] getSubcities:', e);
    } finally {
      setLocLoading(false);
    }
  };

  const fetchWoredas = async (subcityId) => {
    if (!subcityId) {
      setWoredas([]);
      return;
    }
    setWoredaLoading(true);
    try {
      const r = await adminAPI.getWoredasBySubcity(subcityId);
      setWoredas(r.data.woredas || []);
    } catch (e) {
      console.error('[AdminUsers] getWoredasBySubcity:', e);
      setWoredas([]);
    } finally {
      setWoredaLoading(false);
    }
  };

  const fetchDepartments = async (subcityId) => {
    if (!subcityId) {
      setDepartments([]);
      return;
    }
    setDepartmentLoading(true);
    try {
      const r = await adminAPI.getDepartmentsBySubcity(subcityId);
      setDepartments(r.data.departments || []);
    } catch (e) {
      console.error('[AdminUsers] getDepartmentsBySubcity:', e);
      setDepartments([]);
    } finally {
      setDepartmentLoading(false);
    }
  };

  // Initial load on mount.
  useEffect(() => { fetchSubcities(); }, []); // eslint-disable-line

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {
        subcity: subcityFilter,
        search,
        page,
        limit: 12,
      };
      if (roleFilter) params.role = roleFilter;
      const r = await adminAPI.getUsers(params);
      setUsers(r.data.users);
      setPages(r.data.pages);
      setTotal(r.data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [search, subcityFilter, roleFilter, page]); // eslint-disable-line

  // ── Modal helpers ───────────────────────────────────────────────────────────

  // Normalize any subcity casing (legacy 'BOLE' vs 'Bole') to the exact option
  // value stored in the Subcity collection so the dropdown always preselects.
  const canonicalSubcityValue = (raw) => {
    const match = subcities.find(
      (s) => s.name.toLowerCase() === String(raw || '').trim().toLowerCase()
    );
    return match ? match.name : raw || '';
  };

  const canonicalSubcityId = (raw) => {
    const match = subcities.find(
      (s) => s.name.toLowerCase() === String(raw || '').trim().toLowerCase()
    );
    return match ? match._id : (raw || '');
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, accountRole: 'subcity' });
    setWoredas([]);
    setDepartments([]);
    setErrors({});
    fetchSubcities(); // refresh so newly added subcities appear immediately
    setModal('create');
  };

  const openEdit = (u) => {
    const isWoredaAccount = u.role === 'woreda_admin';
    if (isWoredaAccount) {
      const subId = canonicalSubcityId(u.subcity);
      setForm({
        fullName: u.fullName,
        email: u.email,
        phone: u.phone || '',
        password: '',
        accountRole: 'woreda_admin',
        subcity: '',
        subcityId: subId,
        woredaId: u.woredaId || '',
        departmentId: '',
      });
      if (subId) fetchWoredas(subId);
    } else if (u.role === 'department_officer') {
      const subId = canonicalSubcityId(u.subcity);
      setForm({
        fullName: u.fullName,
        email: u.email,
        phone: u.phone || '',
        password: '',
        accountRole: 'department_officer',
        subcity: '',
        subcityId: subId,
        woredaId: u.woredaId || '',
        departmentId: u.departmentId || '',
      });
      if (subId) {
        fetchWoredas(subId);
        fetchDepartments(subId);
      }
    } else {
      setForm({
        fullName: u.fullName,
        email: u.email,
        phone: u.phone || '',
        password: '',
        accountRole: 'subcity',
        subcity: canonicalSubcityValue(u.subcity),
        subcityId: '',
        woredaId: '',
        departmentId: '',
      });
    }
    setErrors({});
    fetchSubcities();
    setModal({ type: 'edit', id: u._id, role: u.role });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setWoredas([]);
    setDepartments([]);
    setErrors({});
  };

  const handleChange = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const handleSubcityChange = (e) => {
    const value = e.target.value;
    setForm((p) => ({ ...p, subcityId: value, woredaId: '', departmentId: '' }));
    setErrors((p) => ({ ...p, subcityId: undefined, woredaId: undefined, departmentId: undefined }));
    fetchWoredas(value);
    fetchDepartments(value);
  };

  // Switching account type resets the scope cascade (subcity → woreda → department).
  const switchAccountRole = (role) => {
    setForm((p) => ({ ...p, accountRole: role, subcity: '', subcityId: '', woredaId: '', departmentId: '' }));
    setWoredas([]);
    setDepartments([]);
    setErrors((p) => ({ ...p, subcity: undefined, subcityId: undefined, woredaId: undefined, departmentId: undefined }));
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateForm = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = 'Full name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_REGEX.test(form.email)) errs.email = 'Enter a valid email address';
    if (isCreateModal) {
      if (!form.password) errs.password = 'Password is required';
      else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    } else if (form.password && form.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }
    if (!form.phone) errs.phone = 'Phone number is required';
    else if (!PHONE_REGEX.test(form.phone)) errs.phone = 'Phone must start with 09 and be 10 digits (e.g. 0912345678)';

    if (isWoredaRole || isDeptRole) {
      if (!form.subcityId) errs.subcityId = 'Subcity is required';
      if (!form.woredaId) errs.woredaId = 'Woreda is required';
      if (isDeptRole && !form.departmentId) errs.departmentId = 'Department is required';
    } else if (!form.subcity) {
      errs.subcity = 'Subcity is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (isWoredaRole) {
        const payload = {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          subcityId: form.subcityId,
          woredaId: form.woredaId,
        };
        if (isCreateModal) {
          await adminAPI.createWoredaAdmin(payload);
          toast.success('Woreda admin created successfully');
        } else {
          const editPayload = { fullName: payload.fullName, phone: payload.phone };
          if (editPayload.password) editPayload.password = payload.password;
          await adminAPI.updateUser(modal.id, editPayload);
          toast.success('Woreda admin updated successfully');
        }
      } else if (isDeptRole) {
        const payload = {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          subcityId: form.subcityId,
          woredaId: form.woredaId,
          departmentId: form.departmentId,
        };
        if (isCreateModal) {
          await adminAPI.createDepartmentOfficer(payload);
          toast.success('Department officer created successfully');
        } else {
          const editPayload = { fullName: payload.fullName, phone: payload.phone };
          if (editPayload.password) editPayload.password = payload.password;
          await adminAPI.updateUser(modal.id, editPayload);
          toast.success('Department officer updated successfully');
        }
      } else {
        const payload = {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          subcity: form.subcity,
        };
        if (isCreateModal) {
          await adminAPI.createSubcityUser(payload);
          toast.success('Subcity admin created successfully');
        } else {
          const editPayload = { ...payload };
          if (!editPayload.password) delete editPayload.password;
          await adminAPI.updateUser(modal.id, editPayload);
          toast.success('Subcity admin updated successfully');
        }
      }
      closeModal();
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.message || 'Action failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Row actions ─────────────────────────────────────────────────────────────

  const toggleActive = async (id) => {
    try {
      await adminAPI.toggleActive(id);
      toast.success('Account status updated');
      fetchUsers();
    } catch {
      toast.error('Failed to update account status');
    }
  };

  const deleteUser = async (id) => {
    // Guard: never allow the currently logged-in admin to delete their own
    // account from the UI (the backend also rejects this as a safety net).
    if (id === currentUser?._id) {
      toast.error('You cannot delete your own account while logged in.');
      setConfirm(null);
      return;
    }
    setDeleting(true);
    try {
      await adminAPI.deleteUser(id);
      toast.success('Account deleted');
      setConfirm(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
      setConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            User Management{' '}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">({total})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create and manage subcity admin, woreda admin, and department officer accounts
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Create Account
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or email"
          className="input-field flex-1 min-w-[180px]"
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="input-field w-auto"
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select
          value={subcityFilter}
          onChange={(e) => { setSubcityFilter(e.target.value); setPage(1); }}
          className="input-field w-auto"
        >
          <option value="">All Subcities</option>
          {activeSubcities.map((s) => (
            <option key={s._id} value={s.name}>{displaySubcity(s.name)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : users.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No accounts found"
          description='Click "+ Create Account" to create your first account.'
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Role</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Email</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Phone</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity / Woreda</th>                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Joined Date</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{u.fullName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.role === 'woreda_admin'
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                        : u.role === 'department_officer'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    }`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {displaySubcity(u.subcity)}
                      {u.role === 'woreda_admin' && u.woredaName ? ` · ${u.woredaName}` : ''}
                      {u.role === 'department_officer' && u.woredaName ? ` · ${u.woredaName}` : ''}
                      {u.role === 'department_officer' && u.department ? ` · ${u.department}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium ${
                      u.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => openEdit(u)} className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium">
                        Edit
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
                        {u.isActive ? 'Deactivate' : 'Activate'}
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
                        Delete
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
        open={!!confirm}
        title="Delete Account"
        message={`Delete ${confirm?.name}? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => deleteUser(confirm.id)}
        onCancel={() => setConfirm(null)}
      />

      {/* Create / Edit modal */}
      {(isCreateModal || isEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal
                ? (isWoredaRole ? 'Create Woreda Admin' : isDeptRole ? 'Create Department Officer' : 'Create Subcity Admin')
                : (isWoredaRole ? 'Edit Woreda Admin' : isDeptRole ? 'Edit Department Officer' : 'Edit Subcity Admin')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {isCreateModal
                ? (isWoredaRole
                  ? 'Woreda admins manage complaints for a single woreda.'
                  : isDeptRole
                    ? 'Department officers manage complaints for one department within a woreda.'
                    : 'The account role is assigned automatically from the selected subcity.')
                : 'Update the account details below.'}
            </p>

            <form onSubmit={handleSave} noValidate className="space-y-4">

              {/* Account role (create only) */}
              {isCreateModal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Account Type <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => switchAccountRole('subcity')}
                      className={`flex-1 text-xs sm:text-sm py-2 px-2 rounded-xl border font-medium transition-colors ${
                        form.accountRole === 'subcity'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Subcity Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => switchAccountRole('woreda_admin')}
                      className={`flex-1 text-xs sm:text-sm py-2 px-2 rounded-xl border font-medium transition-colors ${
                        isWoredaRole
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Woreda Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => switchAccountRole('department_officer')}
                      className={`flex-1 text-xs sm:text-sm py-2 px-2 rounded-xl border font-medium transition-colors ${
                        isDeptRole
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Department Officer
                    </button>
                  </div>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.fullName}
                  onChange={handleChange('fullName')}
                  className={`input-field w-full ${errors.fullName ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  placeholder="e.g. Abebe Kebede"
                  autoFocus
                />
                {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  className={`input-field w-full ${errors.email ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  placeholder="name@ethiobridge.et"
                  disabled={isEditModal}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.phone}
                  onChange={handleChange('phone')}
                  className={`input-field w-full ${errors.phone ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  placeholder="09XXXXXXXX"
                  maxLength={10}
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {isCreateModal ? 'Password' : 'New Password'}
                  {isCreateModal && <span className="text-red-500"> *</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={handleChange('password')}
                  className={`input-field w-full ${errors.password ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  placeholder={isCreateModal ? 'Minimum 8 characters' : 'Leave blank to keep current password'}
                />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              {/* Subcity + Woreda (+ Department) for scoped roles */}
              {isScopedRole ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Subcity <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.subcityId}
                      onChange={handleSubcityChange}
                      disabled={isEditModal}
                      className={`input-field w-full ${errors.subcityId ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                    >
                      <option value="">Select Subcity</option>
                      {activeSubcities.map((s) => (
                        <option key={s._id} value={s._id}>{displaySubcity(s.name)}</option>
                      ))}
                    </select>
                    {errors.subcityId && <p className="text-xs text-red-500 mt-1">{errors.subcityId}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Woreda <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.woredaId}
                      onChange={handleChange('woredaId')}
                      disabled={isEditModal || !form.subcityId}
                      className={`input-field w-full ${errors.woredaId ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                    >
                      <option value="">{woredaLoading ? 'Loading woredas…' : 'Select Woreda'}</option>
                      {woredas.map((w) => (
                        <option key={w._id} value={w._id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                      ))}
                    </select>
                    {errors.woredaId && <p className="text-xs text-red-500 mt-1">{errors.woredaId}</p>}
                    {!form.subcityId && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Choose a subcity to load its woredas.
                      </p>
                    )}
                  </div>

                  {isDeptRole && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.departmentId}
                        onChange={handleChange('departmentId')}
                        disabled={!form.subcityId}
                        className={`input-field w-full ${errors.departmentId ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                      >
                        <option value="">
                          {departmentLoading ? 'Loading departments…' : 'Select Department'}
                        </option>
                        {departments.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}{d.code ? ` (${d.code})` : ''}
                          </option>
                        ))}
                      </select>
                      {errors.departmentId && <p className="text-xs text-red-500 mt-1">{errors.departmentId}</p>}
                      {!form.subcityId && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Choose a subcity to load its departments.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subcity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.subcity}
                    onChange={handleChange('subcity')}
                    className={`input-field w-full ${errors.subcity ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  >
                    <option value="">Select Subcity</option>
                    {activeSubcities.map((s) => (
                      <option key={s._id} value={s.name}>{displaySubcity(s.name)}</option>
                    ))}
                  </select>
                  {errors.subcity && <p className="text-xs text-red-500 mt-1">{errors.subcity}</p>}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                    {locLoading && <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
                    Role is assigned automatically from the selected subcity.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary flex-1"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 disabled:opacity-60"
                >
                  {saving
                    ? 'Saving…'
                    : isCreateModal
                      ? (isWoredaRole ? 'Create Woreda Admin' : isDeptRole ? 'Create Department Officer' : 'Create Subcity Admin')
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
