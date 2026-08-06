import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../../context/AuthContext';
import { governanceManagementAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import ConfirmModal from '../../../../components/common/ConfirmModal';
import CrudPageHeader from '../../../../components/common/CrudPageHeader';
import CollapsibleForm from '../../../../components/common/CollapsibleForm';

const EMPTY_FORM = { name: '', description: '', displayOrder: 0, isActive: true };

const isSubcityManager = (role) =>
  ['SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_admin'].includes(role) ||
  (typeof role === 'string' && role.startsWith('subcity_'));

export default function GovernanceCategories() {
  const { user } = useAuth();
  // Platform admins can view categories but cannot create / edit / delete them.
  const canManage = isSubcityManager(user?.role);
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
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

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

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.description || '').toLowerCase().includes(q)
    );
  }, [categories, search]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, officeId });
    setNameError('');
    setFormOpen((v) => !v);
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
      if (modal?.type === 'edit') {
        await governanceManagementAPI.updateCategory(modal.id, {
          name: trimmed,
          description: form.description.trim(),
          displayOrder: Number(form.displayOrder) || 0,
          isActive: form.isActive,
        });
        toast.success('Complaint category updated');
        closeModal();
      } else {
        await governanceManagementAPI.createCategory({
          name: trimmed,
          officeId,
          description: form.description.trim(),
          displayOrder: Number(form.displayOrder) || 0,
          isActive: form.isActive,
        });
        toast.success('Complaint category created');
        setFormOpen(false);
        setForm(EMPTY_FORM);
        setNameError('');
      }
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

  const isEditModal = modal?.type === 'edit';

  return (
    <div className="space-y-5">
      {!canManage && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <span className="font-semibold">Read-only view.</span> Complaint categories are managed
          exclusively by the Subcity Admin. System Admins can view but cannot create, edit or delete categories.
        </div>
      )}
      <CrudPageHeader
        title={<>Complaint Categories <span className="text-sm font-normal text-gray-400 ml-1">({categories.length})</span></>}
        subtitle="Categories shown on the public form for the selected office"
      >
        <select
          value={officeId}
          onChange={(e) => setOfficeId(e.target.value)}
          className="input-field w-44 sm:w-56"
          disabled={loadingOffices}
          aria-label="Select office"
        >
          <option value="">Select office…</option>
          {offices.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories…"
          className="input-field w-full sm:w-56"
          aria-label="Search complaint categories"
        />
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            disabled={!officeId}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            aria-expanded={formOpen}
          >
            <span>{formOpen ? '−' : '+'}</span>
            {formOpen ? 'Close' : 'Add Category'}
          </button>
        )}
      </CrudPageHeader>

      {/* Add category form */}
      {canManage && (
        <CollapsibleForm
          open={formOpen}
          title="Add Complaint Category"
          subtitle={activeOffice ? `For office: ${activeOffice.name}` : undefined}
        >
          <form onSubmit={handleSave} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Order</label>
                <input name="displayOrder" type="number" value={form.displayOrder} onChange={handleChange} className="input-field w-full" placeholder="Lower numbers appear first" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="What kind of issues fall under this category…" className="input-field w-full resize-none" />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} className="accent-emerald-600" />
                Active (shown on the public complaint form)
              </label>
              <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4">
                {saving ? 'Creating…' : 'Add Category'}
              </button>
            </div>
          </form>
        </CollapsibleForm>
      )}

      {loadingOffices ? (
        <LoadingSpinner />
      ) : !officeId ? (
        <EmptyState icon="🏷️" title="No office selected" description="Select a government office to manage its complaint categories." />
      ) : loadingCats ? (
        <LoadingSpinner />
      ) : categories.length === 0 ? (
        <EmptyState icon="🏷️" title="No categories for this office" description={`Click “+ Add Category” to create complaint categories for "${activeOffice?.name}". Citizens pick one on the public form.`} />
      ) : filteredCategories.length === 0 ? (
        <EmptyState icon="🔍" title="No matching categories" description="Try a different search term." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Order</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Category</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                {canManage && <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredCategories.map((c) => (
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
                  {canManage && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && isEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              Edit Category — {modal.currentName}
            </h3>
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
                  {saving ? 'Saving…' : 'Save Changes'}
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
