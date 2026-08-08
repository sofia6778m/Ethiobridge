import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../../context/AuthContext';
import { governanceManagementAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import ConfirmModal from '../../../../components/common/ConfirmModal';
import Pagination from '../../../../components/common/Pagination';
import CrudPageHeader from '../../../../components/common/CrudPageHeader';
import CollapsibleForm from '../../../../components/common/CollapsibleForm';

const PAGE_SIZE = 8;

const EMPTY_FORM = {
  fullName: '', email: '', password: '', phoneNumber: '',
  subcityId: '', governmentOfficeId: '',
};

const PHONE_RE = /^(\+?251|0)?9\d{8}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const isSubcityManager = (role) =>
  ['SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_admin'].includes(role) ||
  (typeof role === 'string' && role.startsWith('subcity_'));

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const officeName = (o) => {
  if (!o) return '—';
  if (o.governmentOfficeId && typeof o.governmentOfficeId === 'object') return o.governmentOfficeId.name || '—';
  if (o.governmentOfficeName) return o.governmentOfficeName;
  if (o.governmentOfficeId) return o.governmentOfficeId;
  return '—';
};

// Module-scope components (stable identity). Inline definitions inside the
// component body make React remount them on every re-render, which drops input
// focus while typing in the create/edit forms.
const StatusBadge = ({ isActive }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
    isActive !== false
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }`}>
    {isActive === false ? 'Inactive' : 'Active'}
  </span>
);

const ActionButtons = ({ o, canManage, onView, onEdit, onDelete }) => (
  <div className="flex gap-1 flex-wrap">
    <button
      onClick={onView}
      className="text-xs py-1 px-2 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/40 font-medium transition-colors"
    >
      View
    </button>
    {canManage && (
      <>
        <button
          onClick={onEdit}
          className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 font-medium transition-colors"
        >
          Delete
        </button>
      </>
    )}
  </div>
);

const OfficeSelect = ({ value, onChange, disabled, error, hint, offices, officesLoading }) => (
  <div>
    <select
      name="governmentOfficeId"
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`input-field w-full ${error ? 'border-red-400 dark:border-red-500' : ''}`}
    >
      <option value="">
        {officesLoading ? 'Loading offices…' : value ? 'Select office…' : 'Select a subcity first'}
      </option>
      {offices.map((o) => (
        <option key={o._id} value={o._id}>{o.name}</option>
      ))}
    </select>
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    {!error && hint && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{hint}</p>}
  </div>
);

export default function GovernanceOfficers() {
  const { user } = useAuth();
  const canManage = isSubcityManager(user?.role);

  const [subcities, setSubcities] = useState([]);
  const [offices, setOffices] = useState([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [officesHint, setOfficesHint] = useState('');
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formOpen, setFormOpen] = useState(false);

  // List controls — search, sort, pagination
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  // Modals
  const [viewOfficer, setViewOfficer] = useState(null);
  const [editOfficer, setEditOfficer] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // The subcity this admin is scoped to (matched against the live Subcity table).
  const ownSubcityId = useMemo(() => {
    const own = String(user?.subcity || '').trim().toLowerCase();
    const match = subcities.find((s) => String(s.name || '').trim().toLowerCase() === own);
    return match?._id || '';
  }, [subcities, user]);

  const loadOfficesFor = useCallback(async (subcityId) => {
    setOffices([]);
    setOfficesHint('');
    if (!subcityId) return;
    // Subcity admins can only ever assign officers to offices in their own
    // subcity — don't even call the API for foreign subcities.
    if (canManage && ownSubcityId && String(subcityId) !== String(ownSubcityId)) {
      setOfficesHint('You can only assign officers to offices in your own subcity.');
      return;
    }
    setOfficesLoading(true);
    try {
      const res = await governanceManagementAPI.getOfficesBySubcity(subcityId);
      setOffices(res.data.data?.offices || []);
      if (!res.data.data?.offices?.length) setOfficesHint('No active offices found for this subcity.');
    } catch (err) {
      setOffices([]);
      setOfficesHint(err.response?.data?.message || 'Failed to load government offices');
    } finally {
      setOfficesLoading(false);
    }
  }, [canManage, ownSubcityId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, offRes] = await Promise.all([
        governanceManagementAPI.getSubcities(),
        governanceManagementAPI.getOfficers(),
      ]);
      const subs = subRes.data.data || [];
      setSubcities(subs);
      setOfficers(offRes.data.data?.officers || []);

      // Default the create form to this admin's own subcity when possible.
      const own = String(user?.subcity || '').trim().toLowerCase();
      const match = subs.find((s) => String(s.name || '').trim().toLowerCase() === own) || subs[0];
      const defaultId = match?._id || '';
      setForm((p) => ({ ...p, subcityId: defaultId, governmentOfficeId: '' }));
      await loadOfficesFor(defaultId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load governance officers');
    } finally {
      setLoading(false);
    }
  }, [user, loadOfficesFor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubcityChange = (id) => {
    setForm((p) => ({ ...p, subcityId: id, governmentOfficeId: '' }));
    setErrors((p) => ({ ...p, subcityId: '', governmentOfficeId: '' }));
    loadOfficesFor(id);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: '' }));
  };

  const validateCreate = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) errs.email = 'A valid email is required.';
    if (!form.password) errs.password = 'Password is required.';
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (!form.phoneNumber.trim()) errs.phoneNumber = 'Phone number is required.';
    else if (!PHONE_RE.test(form.phoneNumber.replace(/\s+/g, ''))) errs.phoneNumber = 'Enter a valid 09XXXXXXXX phone number.';
    if (!form.subcityId) errs.subcityId = 'Subcity is required.';
    if (!form.governmentOfficeId) errs.governmentOfficeId = 'Government office is required.';
    return errs;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = validateCreate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await governanceManagementAPI.createOfficer({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phoneNumber: form.phoneNumber.trim(),
        subcityId: form.subcityId,
        governmentOfficeId: form.governmentOfficeId,
        status: 'active',
      });
      toast.success('User created');
      setForm((p) => ({ ...EMPTY_FORM, subcityId: p.subcityId }));
      setErrors({});
      await fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create user';
      if (/email/i.test(msg)) setErrors((p) => ({ ...p, email: msg }));
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (o) => {
    setEditOfficer({
      id: o._id,
      fullName: o.fullName || '',
      email: o.email || '',
      phoneNumber: o.phoneNumber || o.phone || '',
      subcityId: o.subcityId ? String(o.subcityId) : ownSubcityId,
      governmentOfficeId: o.governmentOfficeId && typeof o.governmentOfficeId === 'object'
        ? String(o.governmentOfficeId._id)
        : String(o.governmentOfficeId || ''),
      status: o.isActive === false ? 'inactive' : 'active',
      resetPassword: '',
    });
    setEditErrors({});
    loadOfficesFor(o.subcityId ? String(o.subcityId) : ownSubcityId);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditOfficer((p) => ({ ...p, [name]: value }));
    setEditErrors((p) => ({ ...p, [name]: '' }));
  };

  const handleEditSubcity = (id) => {
    setEditOfficer((p) => ({ ...p, subcityId: id, governmentOfficeId: '' }));
    setEditErrors((p) => ({ ...p, subcityId: '', governmentOfficeId: '' }));
    loadOfficesFor(id);
  };

  const validateEdit = () => {
    const errs = {};
    if (!editOfficer.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!editOfficer.email.trim() || !EMAIL_RE.test(editOfficer.email.trim())) errs.email = 'A valid email is required.';
    if (editOfficer.phoneNumber && !PHONE_RE.test(editOfficer.phoneNumber.replace(/\s+/g, ''))) errs.phoneNumber = 'Enter a valid 09XXXXXXXX phone number.';
    if (!editOfficer.subcityId) errs.subcityId = 'Subcity is required.';
    if (!editOfficer.governmentOfficeId) errs.governmentOfficeId = 'Government office is required.';
    if (editOfficer.resetPassword && editOfficer.resetPassword.length < 8) errs.resetPassword = 'Password must be at least 8 characters.';
    return errs;
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    const errs = validateEdit();
    setEditErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await governanceManagementAPI.updateOfficer(editOfficer.id, {
        fullName: editOfficer.fullName.trim(),
        email: editOfficer.email.trim(),
        phoneNumber: editOfficer.phoneNumber.trim(),
        subcityId: editOfficer.subcityId,
        governmentOfficeId: editOfficer.governmentOfficeId,
        status: editOfficer.status,
      });
      if (editOfficer.resetPassword) {
        await governanceManagementAPI.resetOfficerPassword(editOfficer.id, {
          password: editOfficer.resetPassword,
        });
      }
      toast.success(editOfficer.resetPassword ? 'Officer updated and password reset' : 'Governance officer updated');
      setEditOfficer(null);
      setEditErrors({});
      await fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update governance officer';
      if (/email/i.test(msg)) setEditErrors((p) => ({ ...p, email: msg }));
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await governanceManagementAPI.deleteOfficer(deleteConfirm._id);
      toast.success('Governance officer deleted');
      setDeleteConfirm(null);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete governance officer');
      setDeleteConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  // ── Search / sort / pagination ────────────────────────────────────────────
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = officers.filter((o) => {
      if (!q) return true;
      return (
        String(o.fullName || '').toLowerCase().includes(q) ||
        String(o.email || '').toLowerCase().includes(q) ||
        String(o.subcity || '').toLowerCase().includes(q) ||
        String(o.phoneNumber || o.phone || '').toLowerCase().includes(q) ||
        String(officeName(o) || '').toLowerCase().includes(q)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'createdAt') {
        return (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) * dir;
      }
      return String(a.fullName || '').localeCompare(String(b.fullName || '')) * dir;
    });
  }, [officers, search, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const sortIcon = (key) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  return (
    <div className="space-y-5">
      {!canManage && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <span className="font-semibold">Read-only view.</span> Governance officer accounts are
          managed exclusively by the Subcity Admin.
        </div>
      )}

      <CrudPageHeader
        title={<>User Management <span className="text-sm font-normal text-gray-400 ml-1">({officers.length})</span></>}
        subtitle="Create and manage the accounts of staff who process governance complaints"
      >
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, email, phone, office…"
          className="input-field w-full sm:w-72"
          aria-label="Search governance officers"
        />
        {canManage && (
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 whitespace-nowrap"
            aria-expanded={formOpen}
          >
            <span>{formOpen ? '−' : '+'}</span>
            {formOpen ? 'Close' : 'Create User'}
          </button>
        )}
      </CrudPageHeader>

      {/* Create user form */}
      {canManage && (
        <CollapsibleForm open={formOpen} title="Create User" subtitle="New accounts are created as Governance Officers.">
          <form onSubmit={handleCreate} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="e.g. Ato Mengistu Worku"
                  className={`input-field w-full ${errors.fullName ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="officer@example.gov.et"
                  className={`input-field w-full ${errors.email ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="At least 8 characters"
                  className={`input-field w-full ${errors.password ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  name="phoneNumber"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  placeholder="09XXXXXXXX"
                  className={`input-field w-full ${errors.phoneNumber ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {errors.phoneNumber && <p className="text-xs text-red-500 mt-1">{errors.phoneNumber}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity <span className="text-red-500">*</span>
                </label>
                <select
                  name="subcityId"
                  value={form.subcityId}
                  onChange={(e) => handleSubcityChange(e.target.value)}
                  className={`input-field w-full ${errors.subcityId ? 'border-red-400 dark:border-red-500' : ''}`}
                >
                  <option value="">Select subcity…</option>
                  {subcities.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                {errors.subcityId && <p className="text-xs text-red-500 mt-1">{errors.subcityId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Government Office <span className="text-red-500">*</span>
                </label>
                <OfficeSelect
                  value={form.governmentOfficeId}
                  onChange={handleChange}
                  disabled={!form.subcityId || officesLoading}
                  error={errors.governmentOfficeId}
                  hint={officesHint}
                  offices={offices}
                  officesLoading={officesLoading}
                />
              </div>
            </div>
            <div>
              <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4">
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </CollapsibleForm>
      )}

      {/* Officers list */}
      {loading ? (
        <LoadingSpinner />
      ) : officers.length === 0 ? (
        <EmptyState icon="🧑‍💼" title="No users yet" description={canManage ? 'Click “+ Create User” to add the first governance officer account.' : 'No users are available yet.'} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No matching officers" description="Try a different search term." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                  <th
                    className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200"
                    onClick={() => toggleSort('name')}
                  >
                    User{sortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Phone</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Office</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                  <th
                    className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200"
                    onClick={() => toggleSort('createdAt')}
                  >
                    Created Date{sortIcon('createdAt')}
                  </th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {paged.map((o) => (
                  <tr key={o._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
                          {(o.fullName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{o.fullName}</p>
                          <p className="text-xs text-gray-400">{o.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{o.phoneNumber || o.phone || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{o.subcity || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{officeName(o)}</td>
                    <td className="px-4 py-3"><StatusBadge isActive={o.isActive} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3"><ActionButtons o={o} canManage={canManage} onView={() => setViewOfficer(o)} onEdit={() => openEdit(o)} onDelete={() => setDeleteConfirm(o)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {paged.map((o) => (
              <div key={o._id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
                      {(o.fullName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{o.fullName}</p>
                      <p className="text-xs text-gray-400 truncate">{o.email}</p>
                    </div>
                  </div>
                  <StatusBadge isActive={o.isActive} />
                </div>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 mt-3 text-xs">
                  <dt className="text-gray-500 dark:text-gray-400">Phone</dt>
                  <dd className="text-right text-gray-700 dark:text-gray-200">{o.phoneNumber || o.phone || '—'}</dd>
                  <dt className="text-gray-500 dark:text-gray-400">Subcity</dt>
                  <dd className="text-right text-gray-700 dark:text-gray-200">{o.subcity || '—'}</dd>
                  <dt className="text-gray-500 dark:text-gray-400">Office</dt>
                  <dd className="text-right text-gray-700 dark:text-gray-200 truncate">{officeName(o)}</dd>
                  <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                  <dd className="text-right text-gray-700 dark:text-gray-200">{formatDate(o.createdAt)}</dd>
                </dl>
                <div className="mt-3"><ActionButtons o={o} canManage={canManage} onView={() => setViewOfficer(o)} onEdit={() => openEdit(o)} onDelete={() => setDeleteConfirm(o)} /></div>
              </div>
            ))}
          </div>

          <Pagination page={safePage} pages={pages} onPageChange={setPage} />
        </>
      )}

      {/* View modal */}
      {viewOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setViewOfficer(null)}>
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                {(viewOfficer.fullName || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate">{viewOfficer.fullName}</h3>
                <StatusBadge isActive={viewOfficer.isActive} />
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Email</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200 text-right break-all">{viewOfficer.email || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Phone</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{viewOfficer.phoneNumber || viewOfficer.phone || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Subcity</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{viewOfficer.subcity || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Government Office</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200 text-right">{officeName(viewOfficer)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Role</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{viewOfficer.role || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Created Date</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDate(viewOfficer.createdAt)}</dd>
              </div>
            </dl>
            <div className="flex justify-end mt-6">
              <button onClick={() => setViewOfficer(null)} className="btn-secondary text-sm px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">Edit Governance Officer</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Leave the password field blank to keep the current password.</p>
            <form onSubmit={handleEditSave} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="fullName"
                  value={editOfficer.fullName}
                  onChange={handleEditChange}
                  className={`input-field w-full ${editErrors.fullName ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {editErrors.fullName && <p className="text-xs text-red-500 mt-1">{editErrors.fullName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  value={editOfficer.email}
                  onChange={handleEditChange}
                  className={`input-field w-full ${editErrors.email ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {editErrors.email && <p className="text-xs text-red-500 mt-1">{editErrors.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  name="phoneNumber"
                  value={editOfficer.phoneNumber}
                  onChange={handleEditChange}
                  placeholder="09XXXXXXXX"
                  className={`input-field w-full ${editErrors.phoneNumber ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {editErrors.phoneNumber && <p className="text-xs text-red-500 mt-1">{editErrors.phoneNumber}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity <span className="text-red-500">*</span>
                </label>
                <select
                  name="subcityId"
                  value={editOfficer.subcityId}
                  onChange={(e) => handleEditSubcity(e.target.value)}
                  className={`input-field w-full ${editErrors.subcityId ? 'border-red-400 dark:border-red-500' : ''}`}
                >
                  <option value="">Select subcity…</option>
                  {subcities.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                {editErrors.subcityId && <p className="text-xs text-red-500 mt-1">{editErrors.subcityId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Government Office <span className="text-red-500">*</span>
                </label>
                <OfficeSelect
                  value={editOfficer.governmentOfficeId}
                  onChange={handleEditChange}
                  disabled={!editOfficer.subcityId || officesLoading}
                  error={editErrors.governmentOfficeId}
                  hint={officesHint}
                  offices={offices}
                  officesLoading={officesLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  name="status"
                  value={editOfficer.status}
                  onChange={handleEditChange}
                  className="input-field w-full"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reset Password (optional)</label>
                <input
                  name="resetPassword"
                  type="password"
                  value={editOfficer.resetPassword}
                  onChange={handleEditChange}
                  placeholder="Leave blank to keep current password"
                  className={`input-field w-full ${editErrors.resetPassword ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {editErrors.resetPassword && <p className="text-xs text-red-500 mt-1">{editErrors.resetPassword}</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setEditOfficer(null); setEditErrors({}); }} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Governance Officer"
        message={`Delete the account for "${deleteConfirm?.fullName}"? Officers assigned to complaints cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
