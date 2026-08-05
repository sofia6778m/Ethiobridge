import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const ALLOWED_DEPARTMENTS = ['Electricity', 'Road', 'Water'];
const EMPTY_FORM = { name: '', woredaId: '', description: '', status: 'Active' };

export default function SubcityDepartments() {
  const [departments, setDepartments] = useState([]);
  const [woredas, setWoredas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hierarchyAPI.getSubcityDepartments();
      setDepartments(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchWoredas = useCallback(async () => {
    try {
      const res = await hierarchyAPI.getSubcityWoredas();
      setWoredas(res.data.data || []);
    } catch {
      setWoredas([]);
    }
  }, []);

  useEffect(() => { fetchWoredas(); }, [fetchWoredas]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setNameError('');
    setModal('create');
  };

  const openEdit = (d) => {
    setForm({
      name: d.name,
      woredaId: d.woredaId || '',
      description: d.description || '',
      status: d.status,
    });
    setNameError('');
    setModal({ type: 'edit', id: d._id, currentName: d.name });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setNameError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'name') setNameError('');
  };

  const validate = () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setNameError('Department name is required.');
      return false;
    }
    const isEdit = modal?.type === 'edit';
    const editId = isEdit ? modal.id : null;
    const dup = departments.find(
      (d) => d._id !== editId && d.name.toLowerCase() === trimmed.toLowerCase() && (d.woredaId || '') === form.woredaId
    );
    if (dup) {
      setNameError(`"${dup.name}" already exists${dup.woredaName ? ` in ${dup.woredaName}` : ' for this subcity'}.`);
      return false;
    }
    return true;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        woredaId: form.woredaId || undefined,
        description: form.description.trim(),
        status: form.status,
      };
      if (modal === 'create') {
        await hierarchyAPI.createSubcityDepartment(payload);
        toast.success('Department created successfully');
      } else {
        await hierarchyAPI.updateSubcityDepartment(modal.id, payload);
        toast.success('Department updated successfully');
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

  const handleToggleStatus = async (d) => {
    const next = d.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await hierarchyAPI.updateSubcityDepartment(d._id, { status: next });
      toast.success(`Department ${next === 'Active' ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await hierarchyAPI.deleteSubcityDepartment(id);
      toast.success('Department deleted successfully');
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
            Departments <span className="text-sm font-normal text-gray-400 ml-1">({departments.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Departments in your subcity — subcity-wide or linked to a woreda
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Add Department
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : departments.length === 0 ? (
        <EmptyState icon="🏛️" title="No departments found" description='Click "+ Add Department" to create your first department.' />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Woreda</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {departments.map((d) => (
                <tr key={d._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs flex-shrink-0">
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {d.woredaName ? (
                      <span className="text-gray-700 dark:text-gray-200 font-medium">{d.woredaName}</span>
                    ) : (
                      <span className="text-gray-400">Whole subcity</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[220px]">
                    <span className="line-clamp-2">{d.description || '—'}</span>
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Department' : `Edit Department — ${modal.currentName}`}
            </h3>
            <form onSubmit={handleSave} noValidate className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Electricity"
                  list="subcity-departments-list"
                  className={`input-field w-full ${nameError ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                <datalist id="subcity-departments-list">
                  {ALLOWED_DEPARTMENTS.map((d) => <option key={d} value={d} />)}
                </datalist>
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Woreda</label>
                <select name="woredaId" value={form.woredaId} onChange={handleChange} className="input-field w-full">
                  <option value="">Whole subcity</option>
                  {woredas.map((w) => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
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
                  {saving ? 'Saving…' : isCreateModal ? 'Add Department' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Department"
        message={`Delete "${deleteConfirm?.name}"? Departments with staff members cannot be deleted.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
