import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const PAGE_SIZE = 10;

const EMPTY_FORM = { name: '', code: '', subcityId: '', status: 'Active' };

export default function AdminDepartmentManagement() {
  const [departments, setDepartments] = useState([]);
  const [subcities, setSubcities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [subcityFilter, setSubcityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  // modal = null | 'create' | { type: 'edit', id, currentName }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});

  // deleteConfirm = null | { id, name }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (subcityFilter) params.subcity = subcityFilter;
      const res = await adminAPI.getManagedDepartments(params);
      setDepartments(res.data.departments || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } catch {
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, [page, search, subcityFilter]);

  const fetchSubcities = useCallback(async () => {
    setLocLoading(true);
    try {
      const r = await adminAPI.getSubcities();
      setSubcities(r.data.subcities || []);
    } catch {
      toast.error('Failed to load subcities');
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubcities();
  }, [fetchSubcities]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const subcityName = (id) => subcities.find((s) => s._id === id)?.name || '';

  // ── Filter helpers ───────────────────────────────────────────────────────────

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleSubcityFilter = (e) => {
    setSubcityFilter(e.target.value);
    setPage(1);
  };

  // ── Modal helpers ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    fetchSubcities(); // refresh so newly added subcities appear immediately
    setModal('create');
  };

  const openEdit = (d) => {
    setForm({
      name: d.name,
      code: d.code || '',
      subcityId: d.subcityId || '',
      status: d.status,
    });
    setFieldErrors({});
    fetchSubcities();
    setModal({ type: 'edit', id: d._id, currentName: d.name });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  };

  // ── Form field change ────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  // ── Client-side validation ───────────────────────────────────────────────────

  const validate = () => {
    const errs = {};
    if (!form.subcityId) errs.subcityId = 'A subcity is required.';
    if (!form.name.trim()) errs.name = 'Department name is required.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save (create or update) ──────────────────────────────────────────────────

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        subcityId: form.subcityId,
        status: form.status,
      };

      if (modal === 'create') {
        await adminAPI.createDepartment(payload);
        toast.success('Department created successfully');
      } else {
        await adminAPI.updateDepartment(modal.id, payload);
        toast.success('Department updated successfully');
      }

      closeModal();
      fetchDepartments();
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      if (/already exists/i.test(msg)) {
        setFieldErrors((p) => ({ ...p, name: msg }));
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle status ────────────────────────────────────────────────────────────

  const handleToggleStatus = async (d) => {
    const next = d.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await adminAPI.updateDepartment(d._id, { status: next });
      toast.success(`Department ${next === 'Active' ? 'activated' : 'deactivated'} successfully`);
      fetchDepartments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteDepartment(id);
      toast.success('Department deleted successfully');
      setDeleteConfirm(null);
      fetchDepartments();
    } catch (err) {
      setDeleteConfirm(null);
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isCreateModal = modal === 'create';
  const isEditModal   = modal?.type === 'edit';
  const modalOpen     = isCreateModal || isEditModal;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            Department Management{' '}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">
              ({total})
            </span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create and manage department records under each subcity
          </p>
        </div>

        <button
          onClick={openCreate}
          className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
        >
          + Add Department
        </button>
      </div>

      {/* ── Search / filter bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={handleSearch}
          placeholder="Search by department name…"
          className="input-field w-full sm:w-64"
        />
        <select
          value={subcityFilter}
          onChange={handleSubcityFilter}
          className="input-field w-full sm:w-56"
        >
          <option value="">All Subcities</option>
          {subcities.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}{s.status === 'Inactive' ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
        {locLoading && <span className="text-xs text-gray-400">Loading subcities…</span>}
      </div>

      {/* ── Table / states ──────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner />
      ) : departments.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="No departments found"
          description='Click "+ Add Department" to create your first department.'
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department Code</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {departments.map((d) => (
                <tr key={d._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs flex-shrink-0">
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{d.code || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {subcityName(d.subcityId) || d.subcityName || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      d.status === 'Active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(d)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(d)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          d.status === 'Active'
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {d.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: d._id, name: d.name })}
                        className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 font-medium transition-colors"
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

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Showing {departments.length} of {total} departments
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              Page {page} of {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Department"
        message={`Delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Create / Edit modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">

            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Department' : `Edit Department — ${modal.currentName}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {isCreateModal
                ? 'Fill in the details to create a new department record.'
                : 'Update the department details below.'}
            </p>

            <form onSubmit={handleSave} noValidate className="space-y-4">

              {/* Subcity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity <span className="text-red-500">*</span>
                </label>
                <select
                  name="subcityId"
                  value={form.subcityId}
                  onChange={handleChange}
                  className={`input-field w-full ${fieldErrors.subcityId ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                >
                  <option value="">Select Subcity</option>
                  {subcities.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}{s.status === 'Inactive' ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
                {fieldErrors.subcityId && <p className="text-xs text-red-500 mt-1">{fieldErrors.subcityId}</p>}
                {locLoading && <p className="text-xs text-gray-400 mt-1">Loading subcities…</p>}
              </div>

              {/* Department Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Electricity"
                  className={`input-field w-full ${fieldErrors.name ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  autoFocus
                />
                {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
              </div>

              {/* Department Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Department Code
                </label>
                <input
                  name="code"
                  value={form.code}
                  onChange={handleChange}
                  placeholder="e.g. ELEC-01"
                  className="input-field w-full"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="input-field w-full"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Buttons */}
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
                  className="btn-primary flex-1"
                >
                  {saving
                    ? 'Saving…'
                    : isCreateModal
                    ? 'Add Department'
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
