import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const EMPTY_WOREDA_FORM = { name: '', description: '', status: 'Active' };
const EMPTY_ADMIN_FORM = { woredaId: '', fullName: '', email: '', password: '', phone: '' };

export default function SubcityWoredas() {
  const [woredas, setWoredas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // modal = null | 'create' | { type: 'edit', id, currentName }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_WOREDA_FORM);
  const [nameError, setNameError] = useState('');

  // adminModal = null | { type: 'create' } | { type: 'reset', id, email }
  const [adminModal, setAdminModal] = useState(null);
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN_FORM);
  const [adminError, setAdminError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hierarchyAPI.getSubcityWoredas();
      setWoredas(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load woredas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Woreda CRUD modal helpers ─────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_WOREDA_FORM);
    setNameError('');
    setModal('create');
  };

  const openEdit = (w) => {
    setForm({ name: w.name, description: w.description || '', status: w.status });
    setNameError('');
    setModal({ type: 'edit', id: w._id, currentName: w.name });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_WOREDA_FORM);
    setNameError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'name') setNameError('');
  };

  const validateWoreda = () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setNameError('Woreda name is required.');
      return false;
    }
    const isEdit = modal?.type === 'edit';
    const editId = isEdit ? modal.id : null;
    const dup = woredas.find((w) => w._id !== editId && w.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) {
      setNameError(`"${dup.name}" already exists in this subcity.`);
      return false;
    }
    return true;
  };

  const handleSaveWoreda = async (e) => {
    e.preventDefault();
    if (!validateWoreda()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
      };
      if (modal === 'create') {
        await hierarchyAPI.createSubcityWoreda(payload);
        toast.success('Woreda created successfully');
      } else {
        await hierarchyAPI.updateSubcityWoreda(modal.id, payload);
        toast.success('Woreda updated successfully');
      }
      closeModal();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      if (/already exists/i.test(msg)) setNameError(msg);
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Woreda admin provisioning helpers ─────────────────────────────────────

  const openAdminCreate = (w) => {
    setAdminForm({ ...EMPTY_ADMIN_FORM, woredaId: w._id });
    setAdminError('');
    setAdminModal({ type: 'create', woredaName: w.name });
  };

  const openAdminReset = (w) => {
    setAdminForm({ ...EMPTY_ADMIN_FORM, woredaId: w._id });
    setAdminError('');
    setAdminModal({ type: 'reset', woredaName: w.name, adminId: w.admin?._id, adminEmail: w.admin?.email });
  };

  const closeAdminModal = () => {
    setAdminModal(null);
    setAdminForm(EMPTY_ADMIN_FORM);
    setAdminError('');
  };

  const handleAdminChange = (e) => {
    const { name, value } = e.target;
    setAdminForm((prev) => ({ ...prev, [name]: value }));
    setAdminError('');
  };

  const handleSaveAdmin = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (adminModal.type === 'create') {
        const { woredaId, fullName, email, password, phone } = adminForm;
        if (!fullName.trim() || !email.trim() || !password) {
          setAdminError('Full name, email, and password are required.');
          return;
        }
        if (password.length < 6) {
          setAdminError('Password must be at least 6 characters.');
          return;
        }
        await hierarchyAPI.createWoredaAdmin({ woredaId, fullName: fullName.trim(), email: email.trim(), password, phone: phone.trim() });
        toast.success('Woreda admin account created');
      } else {
        if (!adminForm.newPassword || adminForm.newPassword.length < 6) {
          setAdminError('Password must be at least 6 characters.');
          return;
        }
        await hierarchyAPI.resetWoredaAdminPassword(adminModal.adminId, { newPassword: adminForm.newPassword });
        toast.success('Woreda admin password reset');
      }
      closeAdminModal();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      setAdminError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle / delete ───────────────────────────────────────────────────────

  const handleToggleStatus = async (w) => {
    const next = w.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await hierarchyAPI.updateSubcityWoreda(w._id, { status: next });
      toast.success(`Woreda ${next === 'Active' ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await hierarchyAPI.deleteSubcityWoreda(id);
      toast.success('Woreda deleted successfully');
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
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
            Woredas <span className="text-sm font-normal text-gray-400 ml-1">({woredas.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage the woredas of your subcity and their admin accounts
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Add Woreda
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : woredas.length === 0 ? (
        <EmptyState icon="🏘️" title="No woredas found" description='Click "+ Add Woreda" to create your first woreda.' />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Woreda Admin</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
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
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[220px]">
                    <span className="line-clamp-2">{w.description || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {w.admin ? (
                      <div>
                        <p className="text-gray-800 dark:text-gray-200 font-medium">{w.admin.fullName}</p>
                        <p className="text-gray-400">{w.admin.email}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">No admin yet</span>
                    )}
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
                        onClick={() => openAdminCreate(w)}
                        className="text-xs py-1 px-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40 font-medium transition-colors"
                      >
                        Create Admin
                      </button>
                      {w.admin && (
                        <button
                          onClick={() => openAdminReset(w)}
                          className="text-xs py-1 px-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 font-medium transition-colors"
                        >
                          Reset Password
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(w)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(w)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          w.status === 'Active'
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {w.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: w._id, name: w.name })}
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

      {/* Woreda create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Woreda' : `Edit Woreda — ${modal.currentName}`}
            </h3>
            <form onSubmit={handleSaveWoreda} noValidate className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Woreda Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Woreda 01"
                  className={`input-field w-full ${nameError ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Optional description…"
                  className="input-field w-full resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="input-field w-full">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Add Woreda' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Woreda admin modal */}
      {adminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {adminModal.type === 'create' ? 'Create Woreda Admin' : 'Reset Woreda Admin Password'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {adminModal.woredaName}{adminModal.type === 'reset' && adminModal.adminEmail ? ` · ${adminModal.adminEmail}` : ''}
            </p>
            <form onSubmit={handleSaveAdmin} noValidate className="space-y-4">
              {adminModal.type === 'create' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name <span className="text-red-500">*</span></label>
                    <input name="fullName" value={adminForm.fullName} onChange={handleAdminChange} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
                    <input name="email" type="email" value={adminForm.email} onChange={handleAdminChange} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password <span className="text-red-500">*</span></label>
                    <input name="password" type="password" value={adminForm.password} onChange={handleAdminChange} placeholder="Min 6 characters" className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                    <input name="phone" value={adminForm.phone} onChange={handleAdminChange} placeholder="09XXXXXXXX" className="input-field w-full" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password <span className="text-red-500">*</span></label>
                  <input name="newPassword" type="password" value={adminForm.newPassword || ''} onChange={handleAdminChange} placeholder="Min 6 characters" className="input-field w-full" />
                </div>
              )}
              {adminError && <p className="text-xs text-red-500">{adminError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeAdminModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : adminModal.type === 'create' ? 'Create Admin' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Woreda"
        message={`Delete "${deleteConfirm?.name}"? Woredas with staff, departments, or complaints cannot be deleted.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
