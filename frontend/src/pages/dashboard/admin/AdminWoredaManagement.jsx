import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', code: '', subcityId: '', description: '', status: 'Active' };

function displaySubcity(name) {
  return name || '—';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminWoredaManagement() {
  const [woredas, setWoredas] = useState([]);
  const [subcities, setSubcities] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [saving, setSaving]       = useState(false);

  // modal = null | 'create' | { type: 'edit', id, currentName }
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});

  // deleteConfirm = null | { id, name }
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // forceConfirm = null | { id, name, deps }
  const [forceConfirm, setForceConfirm] = useState(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchWoredas = useCallback(async () => {
    setLoading(true);
    try {
      // Admin master-data list — pull a generous page so client-side duplicate
      // checks and grouping work across the whole collection.
      const res = await adminAPI.getWoredas({ limit: 1000 });
      setWoredas(res.data.woredas || []);
    } catch {
      toast.error('Failed to load woredas');
    } finally {
      setLoading(false);
    }
  }, []);

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
    fetchWoredas();
    fetchSubcities();
  }, [fetchWoredas, fetchSubcities]);

  const activeSubcities = subcities.filter((s) => s.status === 'Active');
  const subcityName = (id) => subcities.find((s) => s._id === id)?.name || '';

  // ── Modal helpers ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    fetchSubcities(); // refresh so newly added subcities appear immediately
    setModal('create');
  };

  const openEdit = (w) => {
    setForm({
      name: w.name,
      code: w.code || '',
      subcityId: w.subcityId || '',
      description: w.description || '',
      status: w.status,
    });
    setFieldErrors({});
    fetchSubcities();
    setModal({ type: 'edit', id: w._id, currentName: w.name });
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
    if (!form.name.trim()) errs.name = 'Woreda name is required.';
    if (form.name.trim() && form.subcityId) {
      const isEdit = modal?.type === 'edit';
      const editId = isEdit ? modal.id : null;
      const dup = woredas.find(
        (w) =>
          w._id !== editId &&
          String(w.subcityId || '') === String(form.subcityId) &&
          w.name.toLowerCase() === form.name.trim().toLowerCase()
      );
      if (dup) {
        errs.name = `"${dup.name}" already exists in this subcity.`;
      }
    }
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
        name:        form.name.trim(),
        code:        form.code.trim(),
        subcityId:   form.subcityId,
        description: form.description.trim(),
        status:      form.status,
      };

      if (modal === 'create') {
        await adminAPI.createWoreda(payload);
        toast.success('Woreda created successfully');
      } else {
        await adminAPI.updateWoreda(modal.id, payload);
        toast.success('Woreda updated successfully');
      }

      closeModal();
      fetchWoredas();
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

  const handleToggleStatus = async (w) => {
    const next = w.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await adminAPI.updateWoreda(w._id, { status: next });
      toast.success(`Woreda ${next === 'Active' ? 'activated' : 'deactivated'} successfully`);
      fetchWoredas();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  // ── Delete (safe first, force second) ────────────────────────────────────────

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteWoreda(id);
      toast.success('Woreda deleted successfully');
      setDeleteConfirm(null);
      fetchWoredas();
    } catch (err) {
      setDeleteConfirm(null);
      const msg = err.response?.data?.message || 'Delete failed';
      const deps = err.response?.data?.deps;
      if (deps) {
        setForceConfirm({ id, name: deleteConfirm?.name, deps, message: msg });
      } else {
        toast.error(msg);
      }
    }
  };

  const handleForceDelete = async (id) => {
    setForceConfirm(null);
    try {
      const r = await adminAPI.deleteWoreda(id, { force: 'true' });
      toast.success(r.data?.message || 'Woreda deleted');
      fetchWoredas();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isCreateModal = modal === 'create';
  const isEditModal   = modal?.type === 'edit';
  const modalOpen     = isCreateModal || isEditModal;

  // Group woredas by subcity for display.
  const grouped = woredas.reduce((acc, w) => {
    const key = w.subcity || 'Unknown Subcity';
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {});
  const groupOrder = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            Woreda Management{' '}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">
              ({woredas.length})
            </span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create and manage woreda records under each subcity
          </p>
        </div>

        <button
          onClick={openCreate}
          className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
        >
          + Add Woreda
        </button>
      </div>

      {/* ── Table / states ──────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner />
      ) : woredas.length === 0 ? (
        <EmptyState
          icon="🏘️"
          title="No woredas found"
          description='Click "+ Add Woreda" to create your first woreda.'
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Woreda Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Code</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Created Date</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {groupOrder.map((subcity) => (
                <GroupRows
                  key={subcity}
                  subcity={subcity}
                  woredas={grouped[subcity]}
                  subcityName={subcityName}
                  onEdit={openEdit}
                  onToggleStatus={handleToggleStatus}
                  onDelete={(w) => setDeleteConfirm({ id: w._id, name: w.name })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete confirmation (safe) ───────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Woreda"
        message={`Delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Delete confirmation (force — dependencies exist) ─────────────────── */}
      {forceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              Cannot Delete "{forceConfirm.name}"
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{forceConfirm.message}</p>

            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 mb-5 bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
              <li>👥 Users linked: <b>{forceConfirm.deps.users}</b></li>
              <li>📋 Infrastructure reports: <b>{forceConfirm.deps.infraReports}</b></li>
              <li>🚨 Emergency reports: <b>{forceConfirm.deps.emergencyReports}</b></li>
              <li>⚙️ Workflow complaints: <b>{forceConfirm.deps.workflowComplaints}</b></li>
            </ul>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              Force-deleting removes the woreda record and clears its references on all
              linked data (accounts and complaints are preserved).
            </p>

            <div className="flex gap-3">
              <button type="button" onClick={() => setForceConfirm(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleForceDelete(forceConfirm.id)}
                className="btn-primary flex-1 !bg-red-600 hover:!bg-red-700"
              >
                Force Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">

            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Woreda' : `Edit Woreda — ${modal.currentName}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {isCreateModal
                ? 'Fill in the details to create a new woreda record.'
                : 'Update the woreda details below.'}
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
                      {displaySubcity(s.name)}{s.status === 'Inactive' ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
                {fieldErrors.subcityId && <p className="text-xs text-red-500 mt-1">{fieldErrors.subcityId}</p>}
                {locLoading && <p className="text-xs text-gray-400 mt-1">Loading subcities…</p>}
              </div>

              {/* Woreda Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Woreda Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Woreda 01"
                  className={`input-field w-full ${fieldErrors.name ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  autoFocus
                />
                {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
              </div>

              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Code
                </label>
                <input
                  name="code"
                  value={form.code}
                  onChange={handleChange}
                  placeholder="e.g. W01"
                  className="input-field w-full"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Optional description for this woreda…"
                  className="input-field w-full resize-none"
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
                    ? 'Add Woreda'
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

// ── Group row renderer (subcity separator + its woredas) ─────────────────────

function GroupRows({ subcity, woredas, subcityName, onEdit, onToggleStatus, onDelete }) {
  return (
    <>
      <tr className="bg-primary-50/40 dark:bg-gray-800">
        <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
          {subcity}
        </td>
      </tr>
      {woredas.map((w) => (
        <tr key={w._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs flex-shrink-0">
                {w.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-gray-800 dark:text-gray-200">{w.name}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{w.code || '—'}</td>
          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{subcityName(w.subcityId) || w.subcity || '—'}</td>
          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[220px]">
            <span className="line-clamp-2">{w.description || '—'}</span>
          </td>
          <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
            {new Date(w.createdAt).toLocaleDateString()}
          </td>
          <td className="px-4 py-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              w.status === 'Active'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            }`}>
              {w.status}
            </span>
          </td>
          <td className="px-4 py-3">
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => onEdit(w)}
                className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onToggleStatus(w)}
                className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                  w.status === 'Active'
                    ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                    : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                }`}
              >
                {w.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => onDelete(w)}
                className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
