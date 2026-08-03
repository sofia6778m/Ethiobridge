import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', description: '', status: 'Active' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSubcityManagement() {
  const navigate = useNavigate();
  const [subcities, setSubcities] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // modal = null | 'create' | { type: 'edit', id: string, currentName: string }
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState('');

  // deleteConfirm = null | { id: string, name: string }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getSubcities();
      setSubcities(res.data.subcities || []);
    } catch {
      toast.error('Failed to load subcities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Modal helpers ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setNameError('');
    setModal('create');
  };

  const openEdit = (sc) => {
    setForm({ name: sc.name, description: sc.description || '', status: sc.status });
    setNameError('');
    setModal({ type: 'edit', id: sc._id, currentName: sc.name });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setNameError('');
  };

  // ── Form field change ────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'name') setNameError('');
  };

  // ── Client-side validation ───────────────────────────────────────────────────

  const validate = () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setNameError('Subcity name is required.');
      return false;
    }
    // Case-insensitive duplicate check on the client (server also validates)
    const isEdit  = modal?.type === 'edit';
    const editId  = isEdit ? modal.id : null;
    const dup = subcities.find(
      (sc) =>
        sc._id !== editId &&
        sc.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (dup) {
      setNameError(`"${dup.name}" already exists.`);
      return false;
    }
    return true;
  };

  // ── Save (create or update) ──────────────────────────────────────────────────

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name:        form.name.trim(),
        description: form.description.trim(),
        status:      form.status,
      };

      if (modal === 'create') {
        await adminAPI.createSubcity(payload);
        toast.success('Subcity created successfully');
      } else {
        await adminAPI.updateSubcity(modal.id, payload);
        toast.success('Subcity updated successfully');
      }

      closeModal();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      // Surface server duplicate errors in the name field
      if (/already exists/i.test(msg)) {
        setNameError(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle status ────────────────────────────────────────────────────────────

  const handleToggleStatus = async (sc) => {
    const next = sc.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await adminAPI.updateSubcity(sc._id, { status: next });
      toast.success(`Subcity ${next === 'Active' ? 'activated' : 'deactivated'} successfully`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteSubcity(id);
      toast.success('Subcity deleted successfully');
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
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
            Subcity Management{' '}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">
              ({subcities.length})
            </span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create and manage subcity records
          </p>
        </div>

        <button
          onClick={openCreate}
          className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
        >
          + Add Subcity
        </button>
      </div>

      {/* ── Table / states ──────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner />
      ) : subcities.length === 0 ? (
        <EmptyState
          icon="🏙️"
          title="No subcities found"
          description='Click "+ Add Subcity" to create your first subcity.'
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Created Date</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {subcities.map((sc) => (
                <tr
                  key={sc._id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs flex-shrink-0">
                        {sc.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {sc.name}
                      </span>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[260px]">
                    <span className="line-clamp-2">{sc.description || '—'}</span>
                  </td>

                  {/* Created date */}
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                    {new Date(sc.createdAt).toLocaleDateString()}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      sc.status === 'Active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {sc.status}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {/* Departments */}
                      <button
                        onClick={() => navigate(`/dashboard/admin/departments?subcity=${sc._id}`)}
                        className="text-xs py-1 px-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40 font-medium transition-colors"
                      >
                        Departments
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => openEdit(sc)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>

                      {/* Deactivate / Activate */}
                      <button
                        onClick={() => handleToggleStatus(sc)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          sc.status === 'Active'
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {sc.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteConfirm({ id: sc._id, name: sc.name })}
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

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Subcity"
        message={`Delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Create / Edit modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">

            {/* Modal header */}
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Subcity' : `Edit Subcity — ${modal.currentName}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {isCreateModal
                ? 'Fill in the details to create a new subcity record.'
                : 'Update the subcity details below.'}
            </p>

            <form onSubmit={handleSave} noValidate className="space-y-4">

              {/* Subcity Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Bole"
                  className={`input-field w-full ${nameError ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
                  autoFocus
                />
                {nameError && (
                  <p className="text-xs text-red-500 mt-1">{nameError}</p>
                )}
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
                  placeholder="Optional description for this subcity…"
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
                    ? 'Add Subcity'
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
