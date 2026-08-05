import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { governanceManagementAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import ConfirmModal from '../../../../components/common/ConfirmModal';

const EMPTY_FORM = { name: '', description: '', displayOrder: 0, isActive: true };

export default function GovernanceCategories() {
  const [offices, setOffices] = useState([]);
  const [officeId, setOfficeId] = useState('');
  const [categories, setCategories] = useState([]);
  const [loadingOffices, setLoadingOffices] = useState(true);
  const [loadingCats, setLoadingCats] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchOffices = useCallback(async () => {
    setLoadingOffices(true);
    try {
      const res = await governanceManagementAPI.getManagedOffices();
      const list = res.data.data?.offices || [];
      setOffices(list);
      if (list.length) setOfficeId((cur) => cur || list[0]._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load offices');
    } finally {
      setLoadingOffices(false);
    }
  }, []);

  useEffect(() => { fetchOffices(); }, [fetchOffices]);

  const fetchCategories = useCallback(async (id) => {
    if (!id) {
      setCategories([]);
      return;
    }
    setLoadingCats(true);
    try {
      const res = await governanceManagementAPI.getManagedCategories(id);
      setCategories(res.data.data?.categories || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load categories');
    } finally {
      setLoadingCats(false);
    }
  }, []);

  useEffect(() => {
    if (officeId) fetchCategories(officeId);
    else setCategories([]);
  }, [officeId, fetchCategories]);

  const activeOffice = offices.find((o) => o._id === officeId);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, officeId });
    setNameError('');
    setModal('create');
  };

  const openEdit = (c) => {
    setForm({
      name: c.name,
      description: c.description || '',
      displayOrder: c.displayOrder ?? 0,
      isActive: c.isActive !== false,
    });
    setNameError('');
    setModal({ type: 'edit', id: c._id, currentName: c.name });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setNameError('');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'name') setNameError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = form.name.trim();
    if (!trimmed) {
      setNameError('Category name is required.');
      return;
    }
    setSaving(true);
    try {
      if (modal === 'create') {
        await governanceManagementAPI.createCategory({
          name: trimmed,
          officeId,
          description: form.description.trim(),
          displayOrder: Number(form.displayOrder) || 0,
          isActive: form.isActive,
        });
        toast.success('Complaint category created');
      } else {
        await governanceManagementAPI.updateCategory(modal.id, {
          name: trimmed,
          description: form.description.trim(),
          displayOrder: Number(form.displayOrder) || 0,
          isActive: form.isActive,
        });
        toast.success('Complaint category updated');
      }
      closeModal();
      fetchCategories(officeId);
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      if (/already exists/i.test(msg)) setNameError(msg);
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c) => {
    try {
      await governanceManagementAPI.toggleCategory(c._id);
      toast.success(`Category ${c.isActive === false ? 'activated' : 'deactivated'}`);
      fetchCategories(officeId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await governanceManagementAPI.deleteCategory(id);
      toast.success('Category deleted');
      setDeleteConfirm(null);
      fetchCategories(officeId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const isCreateModal = modal === 'create';
  const isEditModal = modal?.type === 'edit';
  const modalOpen = isCreateModal || isEditModal;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            Complaint Categories <span className="text-sm font-normal text-gray-400 ml-1">({categories.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Categories shown on the public form for the selected office
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
            className="input-field w-56"
            disabled={loadingOffices}
          >
            <option value="">Select office…</option>
            {offices.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
          <button onClick={openCreate} disabled={!officeId} className="btn-primary text-sm py-2 px-4 whitespace-nowrap disabled:opacity-50">
            + Add Category
          </button>
        </div>
      </div>

      {loadingOffices ? (
        <LoadingSpinner />
      ) : !officeId ? (
        <EmptyState icon="🏷️" title="No office selected" description="Select a government office to manage its complaint categories." />
      ) : loadingCats ? (
        <LoadingSpinner />
      ) : categories.length === 0 ? (
        <EmptyState icon="🏷️" title="No categories for this office" description={`Add complaint categories for "${activeOffice?.name}". Citizens pick one on the public form.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Order</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Category</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {categories.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400">{c.displayOrder ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-xs flex-shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[280px]">
                    <span className="line-clamp-2">{c.description || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.isActive !== false
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {c.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(c)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          c.isActive === false
                            ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                        }`}
                      >
                        {c.isActive === false ? 'Activate' : 'Deactivate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: c._id, name: c.name })}
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Complaint Category' : `Edit Category — ${modal.currentName}`}
            </h3>
            {isCreateModal && activeOffice && (
              <p className="text-xs text-gray-500 dark:text-gray-400">For office: {activeOffice.name}</p>
            )}
            <form onSubmit={handleSave} noValidate className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Unreasonable Delay"
                  className={`input-field w-full ${nameError ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="What kind of issues fall under this category…" className="input-field w-full resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Order</label>
                <input name="displayOrder" type="number" value={form.displayOrder} onChange={handleChange} className="input-field w-full" placeholder="Lower numbers appear first" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} className="accent-emerald-600" />
                Active (shown on the public complaint form)
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Add Category' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Complaint Category"
        message={`Delete "${deleteConfirm?.name}"? Categories used by complaints cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
