import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { authAPI } from '../../../services/api';
import { toast } from 'react-toastify';

export default function CitizenProfile() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    phone:    user?.phone    || '',
  });

  // avatar state
  const [preview, setPreview]       = useState(user?.profileImage || null);
  const [uploading, setUploading]   = useState(false);
  const fileInputRef                = useRef(null);

  // profile form state
  const [saving, setSaving]         = useState(false);

  // password state
  const [pwForm, setPwForm]         = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw]         = useState({ current: false, new: false, confirm: false });
  const [savingPw, setSavingPw]     = useState(false);

  // ── immediately upload photo when file is selected ─────────────────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // validate type & size (max 5 MB)
    if (!file.type.startsWith('image/')) {
      toast.error(t('dashboard.selectImageError'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('dashboard.imageTooLarge'));
      return;
    }

    // show local preview immediately
    const localURL = URL.createObjectURL(file);
    setPreview(localURL);

    // upload right away
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('profileImage', file);
      fd.append('fullName', form.fullName);
      const res = await authAPI.updateProfile(fd);
      updateUser(res.data.user);
      setPreview(res.data.user.profileImage || localURL);
      toast.success(t('dashboard.photoUpdated'));
    } catch (err) {
      setPreview(user?.profileImage || null);
      toast.error(err.response?.data?.message || t('dashboard.photoUploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── save text fields ────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      const res = await authAPI.updateProfile(fd);
      updateUser(res.data.user);
      toast.success(t('dashboard.profileUpdated'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.profileUpdateFailed'));
    } finally {
      setSaving(false);
    }
  };

  // ── change password ─────────────────────────────────────────────────────────
  const handlePwChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error(t('dashboard.passwordsDoNotMatch'));
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toast.error(t('dashboard.passwordTooShort'));
      return;
    }
    setSavingPw(true);
    try {
      await authAPI.changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword:     pwForm.newPassword,
      });
      toast.success(t('dashboard.passwordChanged'));
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.passwordChangeFailed'));
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.myProfile')}</h2>

      {/* ── Avatar Card ─────────────────────────────────────────────────── */}
      <div className="card flex items-center gap-5">
        {/* Avatar circle */}
        <div className="relative shrink-0">
          <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 text-4xl font-bold overflow-hidden ring-4 ring-primary-50">
            {preview
              ? <img src={preview} alt="Profile" className="w-full h-full object-cover" />
              : <span>{user?.fullName?.[0]?.toUpperCase()}</span>}
          </div>

          {/* Upload spinner overlay */}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <span className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Camera button */}
          <label
            className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 hover:bg-primary-700 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md transition-colors"
            title={t('dashboard.changePhoto')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handlePhotoSelect}
              disabled={uploading}
            />
          </label>
        </div>

        {/* User info */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 dark:text-gray-200 text-lg truncate">{user?.fullName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{user?.email}</p>
          <p
            onClick={() => !uploading && fileInputRef.current?.click()}
              className={`mt-2 text-xs font-medium cursor-pointer inline-flex items-center gap-1 ${uploading ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-primary-600 hover:text-primary-700 hover:underline'}`}
          >
            {uploading ? (
              <><span className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin inline-block" /> {t('dashboard.uploading')}</>
            ) : (
              <><span>📷</span> {t('dashboard.clickToChange')}</>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('dashboard.photoInfo')}</p>
        </div>
      </div>

      {/* ── Personal Information Form ───────────────────────────────────── */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('dashboard.personalInfo')}</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.fullName')}</label>
              <input
                value={form.fullName}
                onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                className="input-field"
                placeholder={t('dashboard.fullNamePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.phoneNumber')}</label>
              <input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="input-field"
                placeholder={t('dashboard.phonePlaceholder')}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.emailReadOnly')}</label>
            <input
              value={user?.email}
              readOnly
              className="input-field bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary py-2.5 px-6">
              {saving
                ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('dashboard.saving')}</span>
                : t('dashboard.saveChanges')}
            </button>
            <button
              type="button"
              onClick={() => setForm({ fullName: user?.fullName||'', phone: user?.phone||'' })}
              className="btn-secondary py-2.5 px-5 text-sm"
            >
              {t('dashboard.reset')}
            </button>
          </div>
        </form>
      </div>

      {/* ── Change Password ─────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('dashboard.changePassword')}</h3>
        <form onSubmit={handlePwChange} className="space-y-4">
          {/* current */}
          <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.currentPassword')}</label>
            <div className="relative">
              <input
                type={showPw.current ? 'text' : 'password'}
                value={pwForm.currentPassword}
                onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                required
                className="input-field pr-10"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPw(p => ({ ...p, current: !p.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                {showPw.current ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* new */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.newPassword')}</label>
              <div className="relative">
                <input
                  type={showPw.new ? 'text' : 'password'}
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  required
                  className="input-field pr-10"
                  placeholder={t('dashboard.passwordPlaceholder')}
                />
                <button type="button" onClick={() => setShowPw(p => ({ ...p, new: !p.new }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                  {showPw.new ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* confirm */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.confirmNewPassword')}</label>
              <div className="relative">
                <input
                  type={showPw.confirm ? 'text' : 'password'}
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  required
                  className="input-field pr-10"
                  placeholder={t('dashboard.confirmPlaceholder')}
                />
                <button type="button" onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                  {showPw.confirm ? '🙈' : '👁️'}
                </button>
              </div>
              {/* live match indicator */}
              {pwForm.confirmPassword && (
                <p className={`text-xs mt-1 ${pwForm.newPassword === pwForm.confirmPassword ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {pwForm.newPassword === pwForm.confirmPassword ? t('dashboard.passwordsMatch') : t('dashboard.passwordsNoMatch')}
                </p>
              )}
            </div>
          </div>

          <button type="submit" disabled={savingPw} className="btn-primary py-2.5 px-6">
            {savingPw
              ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('dashboard.updating')}</span>
              : t('dashboard.updatePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
