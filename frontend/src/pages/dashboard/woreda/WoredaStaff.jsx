import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const EMPTY_FORM = {
  fullName: '', email: '', password: '', phone: '',
  role: 'OFFICER', departmentId: '', employeeId: '', status: 'Active',
};

export default function WoredaStaff() {
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState({ role: '', departmentId: '', search: '' });

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filter.role) params.role = filter.role;
    if (filter.departmentId) params.departmentId = filter.departmentId;
    if (filter.search.trim()) params.search = filter.search.trim();
    try {
      const res = await hierarchyAPI.getWoredaStaff(params);
      setStaff(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await hierarchyAPI.getWoredaDepartments({ status: 'Active' });
      setDepartments(res.data.data || []);
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  };

  const openEdit = (s) => {
    setForm({
      fullName: s.fullName, email: s.email, password: '', phone: s.phone || '',
      role: s.role, departmentId: s.departmentId || '', employeeId: s.employeeId || '',
      status: s.isActive ? 'Active' : 'Inactive',
    });
    setFormError('');
    setModal({ type: 'edit', id: s._id });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFormError('');
  };

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
        await hierarchyAPI.createWoredaStaff({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
          role: form.role,
          departmentId: form.departmentId || undefined,
          employeeId: form.employeeId.trim(),
          status: form.status,
        });
        toast.success('Staff account created successfully');
      } else {
        await hierarchyAPI.updateWoredaStaff(modal.id, {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          role: form.role,
          departmentId: form.departmentId || undefined,
          employeeId: form.employeeId.trim(),
          status: form.status,
        });
        toast.success('Staff member updated successfully');
      }
      closeModal();
      fetchStaff();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s) => {
    try {
      await hierarchyAPI.toggleWoredaStaffActive(s._id);
      toast.success(`Staff member ${s.isActive ? 'deactivated' : 'activated'}`);
      fetchStaff();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await hierarchyAPI.deleteWoredaStaff(id);
      toast.success('Staff member deleted');
      setDeleteConfirm(null);
      fetchStaff();
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
            Staff <span className="text-sm font-normal text-gray-400 ml-1">({staff.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Officers and technicians assigned to this woreda
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Add Staff
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
        <select value={filter.role} onChange={(e) => setFilter((p) => ({ ...p, role: e.target.value }))} className="input-field w-40">
          <option value="">All roles</option>
          <option value="OFFICER">Officer</option>
          <option value="TECHNICIAN">Technician</option>
        </select>
        <select value={filter.departmentId} onChange={(e) => setFilter((p) => ({ ...p, departmentId: e.target.value }))} className="input-field w-40">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="No staff found" description='Click "+ Add Staff" to provision officers and technicians.' />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Role</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Phone</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {staff.map((s) => (
                <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">
                        {s.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{s.fullName}</p>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.role === 'OFFICER'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                    }`}>
                      {s.role === 'OFFICER' ? 'Officer' : 'Technician'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{s.department || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(s)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          s.isActive
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: s._id, name: s.fullName })}
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

      {/* Staff create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6 my-8">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Staff Member' : `Edit Staff Member — ${form.fullName || ''}`}
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select name="role" value={form.role} onChange={handleChange} className="input-field w-full">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                  <select name="departmentId" value={form.departmentId} onChange={handleChange} className="input-field w-full">
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee ID</label>
                  <input name="employeeId" value={form.employeeId} onChange={handleChange} className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="input-field w-full">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Add Staff' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Staff Member"
        message={`Delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
