import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authAPI } from '../../../services/api';
import { toast } from 'react-toastify';

const SUB_CITY_LABELS = {
  subcity_bole: 'Bole',
  subcity_yeka: 'Yeka',
  subcity_lemmi_kura: 'Lemmi Kura',
};

export default function SharedSettings() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);

  const scopeLabel = user?.role?.startsWith('subcity_')
    ? SUB_CITY_LABELS[user.role] || user?.subcity || ''
    : user?.role === 'woreda'
      ? user?.woredaName || ''
      : '';

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authAPI.updateProfile({ fullName: form.fullName, phone: form.phone });
      updateUser(res.data.user);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password changed');
      setForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>

      <div className="card p-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Profile Information</h3>
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input value={user?.email || ''} disabled className="input-field bg-gray-50 dark:bg-gray-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scope</label>
              <input value={scopeLabel} disabled className="input-field bg-gray-50 dark:bg-gray-700" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary px-6 py-2 text-sm">{saving ? 'Saving...' : 'Save Changes'}</button>
        </form>
      </div>

      <div className="card p-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Change Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
              <input type="password" value={form.currentPassword} onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
              <input type="password" value={form.newPassword} onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))} className="input-field" required minLength={6} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
              <input type="password" value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} className="input-field" required minLength={6} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary px-6 py-2 text-sm">{saving ? 'Changing...' : 'Change Password'}</button>
        </form>
      </div>
    </div>
  );
}
