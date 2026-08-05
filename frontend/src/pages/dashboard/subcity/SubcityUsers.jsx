import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const EMPTY_FORM = {
  fullName: '', email: '', password: '', phone: '',
  role: 'OFFICER', woredaId: '', departmentId: '', employeeId: '', status: 'Active',
};

const ROLE_LABELS = { WOREDA_ADMIN: 'Woreda Admin', OFFICER: 'Officer', TECHNICIAN: 'Technician' };

export default function SubcityUsers() {
  const [users, setUsers] = useState([]);
  const [woredas, setWoredas] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState({ role: '', woredaId: '', search: '' });

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filter.role) params.role = filter.role;
    if (filter.woredaId) params.woredaId = filter.woredaId;
    if (filter.search.trim()) params.search = filter.search.trim();
    try {
      const res = await hierarchyAPI.getSubcityUsers(params);
      setUsers(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const fetchMeta = useCallback(async () => {
    try {
      const [wRes, dRes] = await Promise.all([
        hierarchyAPI.getSubcityWoredas(),
        hierarchyAPI.getSubcityDepartments(),
      ]);
      setWoredas(wRes.data.data || []);
      setDepartments(dRes.data.data || []);
    } catch {
      setWoredas([]);
      setDepartments([]);
    }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  };

  const openEdit = (u) => {
    setForm({
      fullName: u.fullName, email: u.email, password: '', phone: u.phone || '',
      role: u.role, woredaId: u.woredaId || '', departmentId: u.departmentId || '',
      employeeId: u.employeeId || '', status: u.isActive ? 'Active' : 'Inactive',
    });
    setFormError('');
    setModal({ type: 'edit', id: u._id });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      let next = { ...prev, [name]: value };
      if (name === 'woredaId' && !prev.departmentId) {
        // keep department selection when possible; otherwise clear it
        const stillValid = departments.find((d) => d.woredaId && String(d.woredaId) === value);
        if (next.departmentId && !stillValid) next.departmentId = '';
      }
      return next;
    });
    setFormError('');
  };

  // Departments a user can be assigned to: subcity-wide ones plus those linked
  // to the currently selected woreda.
  const availableDepartments = form.woredaId
    ? departments.filter((d) => !d.woredaId || String(d.woredaId) === form.woredaId)
    : departments;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        if (!form.fullName.trim() || !form.email.trim() || !form.password) {
          setFormError('Full name, email, and password are required.');
          return;
        }
        if (form.password.length < 6) {
          setFormError('Password must be at least 6 characters.');
          return;
        }
        if (!form.woredaId) {
          setFormError('Please select a woreda.');
          return;
        }
        await hierarchyAPI.createSubcityUser({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
          role: form.role,
          woredaId: form.woredaId,
          departmentId: form.departmentId || undefined,
          employeeId: form.employeeId.trim(),
          status: form.status,
        });
        toast.success('User account created successfully');
      } else {
        await hierarchyAPI.updateSubcityUser(modal.id, {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          role: form.role,
          woredaId: form.woredaId || undefined,
          departmentId: form.departmentId || undefined,
          status: form.status,
        });
        toast.success('User updated successfully');
      }
      closeModal();
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await hierarchyAPI.toggleSubcityUserActive(u._id);
      toast.success(`User ${u.isActive ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await hierarchyAPI.deleteSubcityUser(id);
      toast.success('User deleted');
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const isCreateModal = modal === 'create';
  const modalOpen = isCreateModal || modal?.type === 'edit';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            User Management <span className="text-sm font-normal text-gray-400 ml-1">({users.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Woreda admins, officers, and technicians belonging to your subcity
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Create User
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          value={filter.search}
          onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))}
          placeholder="Search name / email / employee ID…"
          className="input-field flex-1 min-w-[180px]"
        />
        <select value={filter.role} onChange={(e) => setFilter((p) => ({ ...p, role: e.target.value }))} className="input-field w-44">
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={filter.woredaId} onChange={(e) => setFilter((p) => ({ ...p, woredaId: e.target.value }))} className="input-field w-44">
          <option value="">All woredas</option>
          {woredas.map((w) => (
            <option key={w._id} value={w._id}>{w.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : users.length === 0 ? (
        <EmptyState icon="👥" title="No users found" description='Click "+ Create User" to provision woreda admins, officers, and technicians.' />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Role</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Woreda</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Phone</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">
                        {u.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{u.fullName}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.role === 'WOREDA_ADMIN'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : u.role === 'OFFICER'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                    }`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{u.woredaName || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{u.department || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          u.isActive
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: u._id, name: u.fullName })}
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

      {/* User create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-lg p-6 my-8">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Create User' : `Edit User — ${form.fullName || ''}`}
            </h3>
            <form onSubmit={handleSave} noValidate className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input name="fullName" value={form.fullName} onChange={handleChange} className="input-field w-full" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email {isCreateModal && <span className="text-red-500">*</span>}</label>
                  <input name="email" type="email" value={form.email} onChange={handleChange} disabled={!isCreateModal} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password {isCreateModal && <span className="text-red-500">*</span>}</label>
                  <input name="password" type="password" value={form.password} onChange={handleChange} placeholder={isCreateModal ? 'Min 6 characters' : 'Leave blank to keep'} className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role <span className="text-red-500">*</span></label>
                  <select name="role" value={form.role} onChange={handleChange} className="input-field w-full">
                    <option value="WOREDA_ADMIN">Woreda Admin</option>
                    <option value="OFFICER">Officer</option>
                    <option value="TECHNICIAN">Technician</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input name="phone" value={form.phone} onChange={handleChange} placeholder="09XXXXXXXX" className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Woreda <span className="text-red-500">*</span></label>
                  <select name="woredaId" value={form.woredaId} onChange={handleChange} className="input-field w-full">
                    <option value="">Select woreda…</option>
                    {woredas.map((w) => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                  <select name="departmentId" value={form.departmentId} onChange={handleChange} disabled={form.role === 'WOREDA_ADMIN'} className="input-field w-full">
                    <option value="">{form.role === 'WOREDA_ADMIN' ? 'Woreda-wide' : 'No department'}</option>
                    {availableDepartments.map((d) => (
                      <option key={d._id} value={d._id}>{d.name}{d.woredaName ? ` (${d.woredaName})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee ID</label>
                  <input name="employeeId" value={form.employeeId} onChange={handleChange} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select name="status" value={form.status} onChange={handleChange} className="input-field w-full">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete User"
        message={`Delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
