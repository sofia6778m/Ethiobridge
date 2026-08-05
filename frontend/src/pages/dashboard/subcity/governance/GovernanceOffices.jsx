import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../../context/AuthContext';
import { governanceManagementAPI, publicAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import ConfirmModal from '../../../../components/common/ConfirmModal';

const EMPTY_FORM = { name: '', description: '', address: '', phone: '', email: '', headName: '', displayOrder: 0, isActive: true };

export default function GovernanceOffices() {
  const { user } = useAuth();
  const isAdminUser = ['admin', 'government', 'ADMIN'].includes(user?.role);
  const ownSubcity = user?.subcity || '';

  const [offices, setOffices] = useState([]);
  const [subcities, setSubcities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await governanceManagementAPI.getManagedOffices();
      setOffices(res.data.data?.offices || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load government offices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchSubcities = useCallback(async () => {
    try {
      const res = await publicAPI.getSubcities();
      setSubcities(res.data.subcities || []);
    } catch {
      setSubcities([]);
    }
  }, []);

  useEffect(() => { if (isAdminUser) fetchSubcities(); }, [isAdminUser, fetchSubcities]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, subcity: isAdminUser ? '' : ownSubcity });
    setNameError('');
    setModal('create');
  };

  const openEdit = (o) => {
    setForm({
      name: o.name,
      subcity: o.subcity,
      description: o.description || '',
      address: o.address || '',
      phone: o.phone || '',
      email: o.email || '',
      headName: o.headName || '',
      displayOrder: o.displayOrder ?? 0,
      isActive: o.isActive !== false,
    });
    setNameError('');
    setModal({ type: 'edit', id: o._id, currentName: o.name });
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
      setNameError('Office name is required.');
      return;
    }
    if (!form.subcity) {
      setNameError('A subcity is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        subcity: form.subcity,
        description: form.description.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        headName: form.headName.trim(),
        displayOrder: Number(form.displayOrder) || 0,
        isActive: form.isActive,
      };
      if (modal === 'create') {
        await governanceManagementAPI.createOffice(payload);
        toast.success('Government office created');
      } else {
        await governanceManagementAPI.updateOffice(modal.id, payload);
        toast.success('Government office updated');
      }
      closeModal();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      if (/already exists|required/i.test(msg)) setNameError(msg);
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (o) => {
    try {
      await governanceManagementAPI.toggleOffice(o._id);
      toast.success(`Office ${o.isActive === false ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await governanceManagementAPI.deleteOffice(id);
      toast.success('Government office deleted');
      setDeleteConfirm(null);
      fetchData();
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
            Government Offices <span className="text-sm font-normal text-gray-400 ml-1">({offices.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Offices / bureaus citizens can direct service governance complaints to
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Add Office
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : offices.length === 0 ? (
        <EmptyState icon="🏛️" title="No government offices found" description='Click "+ Add Office" to create your first office. These feed the public complaint form.' />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Order</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Office</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Contact</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Head</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {offices.map((o) => (
                <tr key={o._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400">{o.displayOrder ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs flex-shrink-0">
                        {o.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{o.name}</p>
                        <p className="text-xs text-gray-400">{o.subcity}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    <p>{o.phone || '—'}</p>
                    <p className="max-w-[180px] truncate">{o.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">{o.headName || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      o.isActive !== false
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {o.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(o)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(o)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          o.isActive === false
                            ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                        }`}
                      >
                        {o.isActive === false ? 'Activate' : 'Deactivate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: o._id, name: o.name })}
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
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-lg p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Government Office' : `Edit Office — ${modal.currentName}`}
            </h3>
            <form onSubmit={handleSave} noValidate className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Office Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Trade & Investment Bureau"
                  className={`input-field w-full ${nameError ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcity <span className="text-red-500">*</span>
                </label>
                {isAdminUser ? (
                  <select name="subcity" value={form.subcity} onChange={handleChange} className="input-field w-full">
                    <option value="">Select subcity…</option>
                    {subcities.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                ) : (
                  <input name="subcity" value={form.subcity} readOnly className="input-field w-full bg-gray-100 dark:bg-gray-700" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Head of Office</label>
                <input name="headName" value={form.headName} onChange={handleChange} placeholder="e.g. Ato Bekele Tadesse" className="input-field w-full" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input name="phone" value={form.phone} onChange={handleChange} placeholder="09XXXXXXXX" className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input name="email" value={form.email} onChange={handleChange} placeholder="office@example.gov.et" className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <input name="address" value={form.address} onChange={handleChange} placeholder="Building / area / land-mark…" className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="What this office does…" className="input-field w-full resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Order</label>
                <input name="displayOrder" type="number" value={form.displayOrder} onChange={handleChange} className="input-field w-full" placeholder="Lower numbers appear first on the public form" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} className="accent-emerald-600" />
                Active (visible on the public complaint form)
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Add Office' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Government Office"
        message={`Delete "${deleteConfirm?.name}"? Offices with linked complaints or categories cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
