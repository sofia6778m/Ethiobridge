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

const isSubcityManager = (role) =>
  ['SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_admin'].includes(role) ||
  (typeof role === 'string' && role.startsWith('subcity_'));

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Module-scope components (stable identity). Inline definitions inside the
// component body make React remount them on every re-render.
const StatusBadge = ({ isActive }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
    isActive !== false
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }`}>
    {isActive === false ? 'Inactive' : 'Active'}
  </span>
);

const ActionButtons = ({ o, canManage, onView, onEdit, onToggle, onDelete }) => (
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
          onClick={onToggle}
          className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
            o.isActive === false
              ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
              : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
          }`}
        >
          {o.isActive === false ? 'Activate' : 'Deactivate'}
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

export default function GovernanceOffices() {
  const { user } = useAuth();
  const canManage = isSubcityManager(user?.role);

  const [subcities, setSubcities] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create form
  const [subcityId, setSubcityId] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [errors, setErrors] = useState({});
  const [formOpen, setFormOpen] = useState(false);

  // List controls — search, sort, pagination
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  // Modals
  const [viewOffice, setViewOffice] = useState(null);
  const [editOffice, setEditOffice] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, offRes] = await Promise.all([
        governanceManagementAPI.getSubcities(),
        governanceManagementAPI.getManagedOffices(),
      ]);
      const subs = subRes.data.data || [];
      setSubcities(subs);
      setOffices(offRes.data.data?.offices || []);
      // Default the create dropdown to this admin's own subcity when possible.
      const own = String(user?.subcity || '').trim().toLowerCase();
      const match = subs.find((s) => String(s.name || '').trim().toLowerCase() === own) || subs[0];
      setSubcityId((cur) => cur || match?._id || '');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load government offices');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Subcity admins may only create/edit offices in their own subcity.
  const scopedSubcities = useMemo(() => {
    if (!canManage) return subcities;
    const own = String(user?.subcity || '').trim().toLowerCase();
    const match = subcities.find((s) => String(s.name || '').trim().toLowerCase() === own);
    return match ? [match] : subcities;
  }, [subcities, canManage, user]);

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!subcityId) errs.subcityId = 'Subcity is required.';
    if (!officeName.trim()) errs.officeName = 'Office name is required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await governanceManagementAPI.createOffice({
        subcityId,
        officeName: officeName.trim(),
        status: 'active',
      });
      toast.success('Government office created');
      setOfficeName('');
      setErrors({});
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create government office');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (o) => {
    setEditOffice({
      id: o._id,
      name: o.name,
      subcityId: o.subcityId ? String(o.subcityId) : '',
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditOffice((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!editOffice.name.trim()) errs.name = 'Office name is required.';
    if (!editOffice.subcityId) errs.subcityId = 'Subcity is required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await governanceManagementAPI.updateOffice(editOffice.id, {
        name: editOffice.name.trim(),
        subcityId: editOffice.subcityId,
      });
      toast.success('Government office updated');
      setEditOffice(null);
      setErrors({});
      await fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update government office';
      if (/already exists/i.test(msg)) setErrors((prev) => ({ ...prev, name: msg }));
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle status ─────────────────────────────────────────────────────────
  const handleToggle = async (o) => {
    try {
      await governanceManagementAPI.toggleOffice(o._id);
      toast.success(o.isActive === false ? 'Office activated' : 'Office deactivated');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await governanceManagementAPI.deleteOffice(deleteConfirm._id);
      toast.success('Government office deleted');
      setDeleteConfirm(null);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete government office');
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
    const list = offices.filter((o) => {
      if (!q) return true;
      return (
        String(o.name || '').toLowerCase().includes(q) ||
        String(o.subcity || '').toLowerCase().includes(q)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'createdAt') {
        return (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) * dir;
      }
      return String(a.name || '').localeCompare(String(b.name || '')) * dir;
    });
  }, [offices, search, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const sortIcon = (key) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  return (
    <div className="space-y-5">
      {!canManage && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <span className="font-semibold">Read-only view.</span> Government offices are managed
          exclusively by the Subcity Admin.
        </div>
      )}

      <CrudPageHeader
        title={<>Government Offices <span className="text-sm font-normal text-gray-400 ml-1">({offices.length})</span></>}
        subtitle="Add, view, edit or delete the offices citizens can complain about"
      >
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or subcity…"
          className="input-field w-full sm:w-64"
          aria-label="Search government offices"
        />
        {canManage && (
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 whitespace-nowrap"
            aria-expanded={formOpen}
          >
            <span>{formOpen ? '−' : '+'}</span>
            {formOpen ? 'Close' : 'Create Office'}
          </button>
        )}
      </CrudPageHeader>

      {/* Create office form */}
      {canManage && (
        <CollapsibleForm open={formOpen} title="Create Government Office">
          <form onSubmit={handleCreate} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity <span className="text-red-500">*</span>
                </label>
                <select
                  value={subcityId}
                  onChange={(e) => { setSubcityId(e.target.value); setErrors((p) => ({ ...p, subcityId: '' })); }}
                  className={`input-field w-full ${errors.subcityId ? 'border-red-400 dark:border-red-500' : ''}`}
                >
                  <option value="">Select subcity…</option>
                  {scopedSubcities.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                {errors.subcityId && <p className="text-xs text-red-500 mt-1">{errors.subcityId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Office Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={officeName}
                  onChange={(e) => { setOfficeName(e.target.value); setErrors((p) => ({ ...p, officeName: '' })); }}
                  placeholder="e.g. Trade & Revenue Office"
                  className={`input-field w-full ${errors.officeName ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {errors.officeName && <p className="text-xs text-red-500 mt-1">{errors.officeName}</p>}
              </div>
            </div>
            <div>
              <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4">
                {saving ? 'Creating…' : 'Create Government Office'}
              </button>
            </div>
          </form>
        </CollapsibleForm>
      )}

      {/* Offices list */}
      {loading ? (
        <LoadingSpinner />
      ) : offices.length === 0 ? (
        <EmptyState
          icon="🏛️"
          title="No government offices found"
          description={canManage ? 'Click “+ Create Office” to add your first office.' : 'No offices are available yet.'}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No matching offices" description="Try a different search term." />
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
                    Office{sortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity</th>
                  <th
                    className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200"
                    onClick={() => toggleSort('createdAt')}
                  >
                    Created Date{sortIcon('createdAt')}
                  </th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {paged.map((o) => (
                  <tr key={o._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs flex-shrink-0">
                          {(o.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{o.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{o.subcity || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge isActive={o.isActive} /></td>
                    <td className="px-4 py-3"><ActionButtons o={o} canManage={canManage} onView={() => setViewOffice(o)} onEdit={() => openEdit(o)} onToggle={() => handleToggle(o)} onDelete={() => setDeleteConfirm(o)} /></td>
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
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs flex-shrink-0">
                      {(o.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{o.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{o.subcity || '—'}</p>
                    </div>
                  </div>
                  <StatusBadge isActive={o.isActive} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Created {formatDate(o.createdAt)}
                </p>
                <div className="mt-3"><ActionButtons o={o} canManage={canManage} onView={() => setViewOffice(o)} onEdit={() => openEdit(o)} onToggle={() => handleToggle(o)} onDelete={() => setDeleteConfirm(o)} /></div>
              </div>
            ))}
          </div>

          <Pagination page={safePage} pages={pages} onPageChange={setPage} />
        </>
      )}

      {/* View modal */}
      {viewOffice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setViewOffice(null)}>
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                {(viewOffice.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">{viewOffice.name}</h3>
                <StatusBadge isActive={viewOffice.isActive} />
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Subcity</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200 text-right">{viewOffice.subcity || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Created Date</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDate(viewOffice.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">Last Updated</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDate(viewOffice.updatedAt)}</dd>
              </div>
              {viewOffice.description && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400 mb-1">Description</dt>
                  <dd className="font-medium text-gray-800 dark:text-gray-200">{viewOffice.description}</dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end mt-6">
              <button onClick={() => setViewOffice(null)} className="btn-secondary text-sm px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOffice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-4 text-gray-800 dark:text-gray-200">Edit Government Office</h3>
            <form onSubmit={handleEditSave} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Office Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={editOffice.name}
                  onChange={handleEditChange}
                  className={`input-field w-full ${errors.name ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity <span className="text-red-500">*</span>
                </label>
                <select
                  name="subcityId"
                  value={editOffice.subcityId}
                  onChange={handleEditChange}
                  className={`input-field w-full ${errors.subcityId ? 'border-red-400 dark:border-red-500' : ''}`}
                >
                  <option value="">Select subcity…</option>
                  {scopedSubcities.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                {errors.subcityId && <p className="text-xs text-red-500 mt-1">{errors.subcityId}</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setEditOffice(null); setErrors({}); }} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
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
        title="Delete Government Office"
        message={`Delete "${deleteConfirm?.name}"? Offices with linked complaints or active officer accounts cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
