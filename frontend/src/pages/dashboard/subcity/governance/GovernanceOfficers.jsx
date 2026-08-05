import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { governanceManagementAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import ConfirmModal from '../../../../components/common/ConfirmModal';

const EMPTY_FORM = { fullName: '', email: '', phone: '', password: '', officeId: '', role: 'GOVERNANCE_OFFICER' };

const STAFF_ROLES = [
  { value: 'GOVERNANCE_OFFICER', label: 'Governance Officer', desc: 'Receives and processes complaints for a single office.' },
  { value: 'OFFICE_SUPERVISOR', label: 'Office Supervisor', desc: 'Oversees the same office, with the same complaint scope.' },
];

const roleBadge = (role) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
    role === 'OFFICE_SUPERVISOR'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
  }`}>
    {role === 'OFFICE_SUPERVISOR' ? 'Office Supervisor' : 'Governance Officer'}
  </span>
);

export default function GovernanceOfficers() {
  const [officers, setOfficers] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [resetPw, setResetPw] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await governanceManagementAPI.getOfficers();
      setOfficers(res.data.data?.officers || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load governance officers');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOffices = useCallback(async () => {
    try {
      const res = await governanceManagementAPI.getManagedOffices();
      setOffices(res.data.data?.offices || []);
    } catch {
      setOffices([]);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchOffices(); }, [fetchOffices]);

  const officeName = (id) => offices.find((o) => o._id === id)?.name || id;

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, officeId: offices[0]?._id || '' });
    setFieldErrors({});
    setModal('create');
  };

  const openEdit = (o) => {
    setForm({
      fullName: o.fullName || '',
      email: o.email || '',
      phone: o.phone || '',
      password: '',
      officeId: o.governmentOfficeId?._id || o.governmentOfficeId || '',
      role: o.role === 'OFFICE_SUPERVISOR' ? 'OFFICE_SUPERVISOR' : 'GOVERNANCE_OFFICER',
    });
    setFieldErrors({});
    setModal({ type: 'edit', id: o._id, currentName: o.fullName });
  };

  const closeModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const err = {};
    if (!form.fullName.trim()) err.fullName = 'Full name is required.';
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim())) err.email = 'A valid email is required.';
    if (form.phone.trim() && !/^(\+?251|0)?9\d{8}$/.test(form.phone.replace(/\s+/g, ''))) err.phone = 'Enter a valid 09XXXXXXXX phone number.';
    if (modal === 'create') {
      if (form.password.length < 8) err.password = 'Password must be at least 8 characters.';
    }
    if (!form.officeId) err.officeId = 'Assign the officer to a government office.';
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await governanceManagementAPI.createOfficer({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.replace(/\s+/g, ''),
          password: form.password,
          officeId: form.officeId,
          role: form.role,
        });
        toast.success('Governance officer created');
      } else {
        await governanceManagementAPI.updateOfficer(modal.id, {
          fullName: form.fullName.trim(),
          phone: form.phone.replace(/\s+/g, ''),
          officeId: form.officeId,
          role: form.role,
        });
        toast.success('Governance officer updated');
      }
      closeModal();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed';
      if (/already exists|email/i.test(msg)) setFieldErrors((p) => ({ ...p, email: msg }));
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (o) => {
    try {
      await governanceManagementAPI.toggleOfficer(o._id);
      toast.success(`Officer ${o.isActive === false ? 'activated' : 'deactivated'}`);
      setToggleConfirm(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setResetSaving(true);
    try {
      await governanceManagementAPI.resetOfficerPassword(resetPw.id, { password: newPassword });
      toast.success('Password reset successfully');
      setResetPw(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password reset failed');
    } finally {
      setResetSaving(false);
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
            Governance Officers <span className="text-sm font-normal text-gray-400 ml-1">({officers.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Staff who receive and process service governance complaints for their office
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 whitespace-nowrap">
          + Add Officer
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : officers.length === 0 ? (
        <EmptyState icon="🧑‍💼" title="No governance officers yet" description='Click "+ Add Officer" to create an account for an office staff member.' />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Officer</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Role</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Office</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Contact</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {officers.map((o) => (
                <tr key={o._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
                        {(o.fullName || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{o.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{roleBadge(o.role)}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                    {officeName(o.governmentOfficeId?._id || o.governmentOfficeId) || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    <p>{o.email}</p>
                    <p>{o.phone || '—'}</p>
                  </td>
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
                        onClick={() => setResetPw({ id: o._id, name: o.fullName })}
                        className="text-xs py-1 px-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 font-medium transition-colors"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => setToggleConfirm({ id: o._id, name: o.fullName, next: o.isActive === false ? 'activate' : 'deactivate' })}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          o.isActive === false
                            ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                        }`}
                      >
                        {o.isActive === false ? 'Activate' : 'Deactivate'}
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
              {isCreateModal ? 'Add Governance Officer' : `Edit Officer — ${modal.currentName}`}
            </h3>
            <form onSubmit={handleSave} noValidate className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="e.g. Ato Mengistu Worku"
                  className={`input-field w-full ${fieldErrors.fullName ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {fieldErrors.fullName && <p className="text-xs text-red-500 mt-1">{fieldErrors.fullName}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="officer@example.gov.et"
                    readOnly={isEditModal}
                    className={`input-field w-full ${isEditModal ? 'bg-gray-100 dark:bg-gray-700' : ''} ${fieldErrors.email ? 'border-red-400 dark:border-red-500' : ''}`}
                  />
                  {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="09XXXXXXXX"
                    className={`input-field w-full ${fieldErrors.phone ? 'border-red-400 dark:border-red-500' : ''}`}
                  />
                  {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Government Office <span className="text-red-500">*</span>
                </label>
                <select name="officeId" value={form.officeId} onChange={handleChange} className={`input-field w-full ${fieldErrors.officeId ? 'border-red-400 dark:border-red-500' : ''}`}>
                  <option value="">Select office…</option>
                  {offices.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
                </select>
                {fieldErrors.officeId && <p className="text-xs text-red-500 mt-1">{fieldErrors.officeId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Staff Role <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {STAFF_ROLES.map((r) => (
                    <label key={r.value} className={`flex items-start gap-3 border-2 rounded-xl p-3 cursor-pointer transition-colors ${
                      form.role === r.value
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600'
                    }`}>
                      <input
                        type="radio"
                        name="role"
                        value={r.value}
                        checked={form.role === r.value}
                        onChange={handleChange}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">{r.label}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{r.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {isCreateModal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Temporary Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 8 characters"
                    className={`input-field w-full ${fieldErrors.password ? 'border-red-400 dark:border-red-500' : ''}`}
                  />
                  {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Add Officer' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!toggleConfirm}
        title={`${toggleConfirm?.next === 'activate' ? 'Activate' : 'Deactivate'} Officer`}
        message={`${toggleConfirm?.next === 'activate' ? 'Activate' : 'Deactivate'} "${toggleConfirm?.name}"? Deactivated officers can no longer log in.`}
        confirmLabel={toggleConfirm?.next === 'activate' ? 'Activate' : 'Deactivate'}
        danger={toggleConfirm?.next !== 'activate'}
        onConfirm={() => handleToggle({ _id: toggleConfirm.id, isActive: toggleConfirm.next !== 'activate' })}
        onCancel={() => setToggleConfirm(null)}
      />

      {resetPw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">Reset Password</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">New password for {resetPw.name}</p>
            <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input-field w-full"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setResetPw(null); setNewPassword(''); }} className="btn-secondary flex-1" disabled={resetSaving}>Cancel</button>
                <button type="submit" disabled={resetSaving} className="btn-primary flex-1">
                  {resetSaving ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
