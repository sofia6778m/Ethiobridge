import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { alertAPI, publicAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import { ALERT_CATEGORIES, ALERT_SEVERITIES, SEVERITY_STYLES, getCategory } from '../../../utils/alertMeta';

const GLOBAL_ROLES = ['admin', 'ADMIN', 'government'];
const SUB_CITY_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD'];
const WOREDA_ROLES = ['woreda', 'WOREDA_HEAD', 'department', 'DEPARTMENT_ADMIN'];

const SUB_CITY_ROLE_NAMES = {
  subcity_bole: 'Bole',
  subcity_yeka: 'Yeka',
  subcity_lemmi_kura: 'Lemmi Kura',
};

export default function CreateAlertForm({ onSuccess }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [subcities, setSubcities] = useState([]);
  const [woredas, setWoredas] = useState([]);
  const [loadingWoredas, setLoadingWoredas] = useState(false);

  const role = user?.role;
  const isGlobal = GLOBAL_ROLES.includes(role);
  const isSubcity = SUB_CITY_ROLES.includes(role);
  const isWoreda = WOREDA_ROLES.includes(role);
  const lockedSubcity = isSubcity ? (user.subcity || SUB_CITY_ROLE_NAMES[role] || '') : '';
  const lockedWoreda = isWoreda ? (user.woredaName || '') : '';

  const homePath = ['admin', 'ADMIN'].includes(role)
    ? '/dashboard/admin/alerts'
    : isSubcity || isWoreda
      ? '/dashboard/alerts'
      : '/dashboard/government/alerts';

  const [form, setForm] = useState(() => {
    const base = {
      title: '',
      category: '',
      severity: 'warning',
      description: '',
      scheduledAt: '',
      expiresAt: '',
      scope: isGlobal ? 'all' : isWoreda ? 'woreda' : 'subcity',
      subcityName: lockedSubcity,
      woredaName: lockedWoreda,
    };
    return base;
  });

  const set = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  };

  useEffect(() => {
    publicAPI.getSubcities()
      .then((res) => setSubcities(res.data?.subcities || []))
      .catch(() => setSubcities([]));
  }, []);

  useEffect(() => {
    const targetSubcity = form.scope === 'all' ? '' : (form.subcityName || lockedSubcity);
    if (!targetSubcity) {
      setWoredas([]);
      return;
    }
    setLoadingWoredas(true);
    publicAPI.getSubcityWoredas(targetSubcity)
      .then((res) => {
        const list = res.data?.woredas || [];
        setWoredas(list);
        if (isWoreda) {
          const match = list.find((w) => w.name.toLowerCase() === (lockedWoreda || '').toLowerCase());
          if (match) set('woredaId', match._id);
        }
      })
      .catch(() => setWoredas([]))
      .finally(() => setLoadingWoredas(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.scope, form.subcityName]);

  const handleChange = (e) => set(e.target.name, e.target.value);

  const validate = () => {
    const err = {};
    if (!form.title.trim()) err.title = 'Alert title is required';
    else if (form.title.length > 200) err.title = 'Title must be under 200 characters';
    if (!form.category) err.category = 'Category is required';
    if (!form.severity) err.severity = 'Severity is required';
    if (!form.description.trim()) err.description = 'Description is required';
    else if (form.description.length > 5000) err.description = 'Description must be under 5000 characters';
    if (isGlobal && form.scope !== 'all' && !form.subcityName) err.subcityName = 'Select a target subcity';
    if (form.scope === 'woreda' && !form.woredaName && !form.woredaId) err.woredaName = 'Select a target woreda';
    if (form.scheduledAt && new Date(form.scheduledAt) <= new Date()) err.scheduledAt = 'Schedule time must be in the future';
    if (form.expiresAt && form.scheduledAt && new Date(form.expiresAt) <= new Date(form.scheduledAt)) err.expiresAt = 'Expiry must be after the schedule time';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the errors below');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        severity: form.severity,
        description: form.description.trim(),
        scope: isGlobal ? form.scope : isWoreda ? 'woreda' : (form.woredaId ? 'woreda' : 'subcity'),
        subcityName: isGlobal ? form.subcityName : lockedSubcity,
        woredaName: isWoreda ? lockedWoreda : form.woredaName,
        woredaId: isWoreda ? user.woredaId : form.woredaId,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      };
      await alertAPI.create(payload);
      toast.success(form.scheduledAt ? 'Alert scheduled successfully!' : 'Public alert broadcasted successfully!');
      if (onSuccess) onSuccess();
      else navigate(homePath);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to broadcast alert');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCat = getCategory(form.category);
  const selectedSev = ALERT_SEVERITIES.find((s) => s.value === form.severity);

  return (
    <div className="card border-2 border-amber-200 dark:border-amber-800 overflow-hidden animate-fade-in">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 px-4 sm:px-6 py-4 border-b border-amber-200 dark:border-amber-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="text-xl">📢</span> {t('alert.createTitle')}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fields marked with * are required</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="p-4 sm:p-6 space-y-5">

          <FormField label="Alert Title" error={errors.title} required>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              maxLength={200}
              placeholder='e.g. "በዞን 3 ከፍተኛ የዝናብ ማስጠንቀቂያ" or "Heavy Rainfall Warning for Addis Ababa"'
              className={`input-field ${errors.title ? 'border-red-400 focus:ring-red-300' : ''}`}
            />
          </FormField>

          {/* Category */}
          <FormField label="Alert Category" error={errors.category} required>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ALERT_CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => set('category', c.value)}
                  className={`flex items-center gap-2 py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-left
                    ${form.category === c.value
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600 ring-2 ring-offset-1 ring-amber-400'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                    }`}>
                  <span className="text-lg">{c.icon}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </FormField>

          {/* Severity */}
          <FormField label="Severity Level" error={errors.severity} required>
            <div className="grid grid-cols-3 gap-2">
              {ALERT_SEVERITIES.map((s) => (
                <button key={s.value} type="button" onClick={() => set('severity', s.value)}
                  className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-center
                    ${form.severity === s.value
                      ? `${SEVERITY_STYLES[s.value].badge} ring-2 ring-offset-1 ${s.color === 'red' ? 'ring-red-400' : s.color === 'orange' ? 'ring-amber-400' : 'ring-blue-400'}`
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                    }`}>
                  <span className="block text-base mb-0.5">{s.icon}</span>
                  <span className="block">{s.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Emergency alerts are <span className="font-semibold text-red-500">always delivered</span> to citizens and cannot be disabled in subscriptions.
            </p>
          </FormField>

          {/* Targeting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              📍 Target Location <span className="text-red-500 ml-0.5">*</span>
            </label>
            {isGlobal ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select name="scope" value={form.scope} onChange={handleChange} className="input-field">
                    <option value="all">Whole Addis Ababa</option>
                    <option value="subcity">Single Subcity</option>
                    <option value="woreda">Single Woreda</option>
                  </select>
                  {form.scope !== 'all' && (
                    <select name="subcityName" value={form.subcityName} onChange={handleChange}
                      className={`input-field ${errors.subcityName ? 'border-red-400' : ''}`}>
                      <option value="">Select Subcity</option>
                      {subcities.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  )}
                  {form.scope === 'woreda' && (
                    <select name="woredaName" value={form.woredaName} onChange={handleChange}
                      className={`input-field ${errors.woredaName ? 'border-red-400' : ''}`} disabled={loadingWoredas}>
                      <option value="">{loadingWoredas ? 'Loading...' : 'Select Woreda'}</option>
                      {woredas.map((w) => <option key={w._id} value={w.name}>{w.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ) : isSubcity ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="input-field bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center">
                    <span className="text-xs font-semibold">🏙️ {lockedSubcity} Subcity (locked to your scope)</span>
                  </div>
                  <select name="woredaName" value={form.woredaName} onChange={handleChange}
                    className="input-field" disabled={loadingWoredas}>
                    <option value="">Entire {lockedSubcity} subcity</option>
                    {woredas.map((w) => <option key={w._id} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="input-field bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center">
                <span className="text-xs font-semibold">🏙️ {lockedSubcity} — {lockedWoreda || 'Woreda'} (locked to your scope)</span>
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Schedule Publish (optional)" error={errors.scheduledAt}>
              <input type="datetime-local" name="scheduledAt" value={form.scheduledAt} onChange={handleChange}
                className={`input-field ${errors.scheduledAt ? 'border-red-400' : ''}`} />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Leave empty to publish immediately.</p>
            </FormField>
            <FormField label="Expires At (optional)" error={errors.expiresAt}>
              <input type="datetime-local" name="expiresAt" value={form.expiresAt} onChange={handleChange}
                className={`input-field ${errors.expiresAt ? 'border-red-400' : ''}`} />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">The alert will auto-expire after this time.</p>
            </FormField>
          </div>

          {/* Description */}
          <FormField label="Description / Action Needed" error={errors.description} required>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              maxLength={5000}
              placeholder="Provide detailed information about the alert and any actions citizens should take..."
              className={`input-field resize-none ${errors.description ? 'border-red-400 focus:ring-red-300' : ''}`}
            />
          </FormField>

          {/* Preview */}
          {form.title && form.category && form.severity && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Preview</p>
              <div className={`rounded-lg p-3 border-l-4 ${SEVERITY_STYLES[form.severity]?.bg || ''} ${SEVERITY_STYLES[form.severity]?.leftBorder || 'border-l-blue-500'}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span>{selectedCat.icon}</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{form.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_STYLES[form.severity]?.badge || ''}`}>
                    {selectedSev.icon} {selectedSev.label}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{form.description}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 dark:text-gray-500 flex-wrap">
                  <span>📍 {isGlobal && form.scope === 'all' ? 'Addis Ababa (city-wide)' : [form.subcityName || lockedSubcity, form.woredaName || lockedWoreda].filter(Boolean).join(' — ') || 'Addis Ababa'}</span>
                  <span>•</span>
                  <span>{form.scheduledAt ? `Scheduled ${new Date(form.scheduledAt).toLocaleString()}` : 'Publish now'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Form Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="btn-secondary py-2.5 px-5 text-sm order-2 sm:order-1">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm order-1 sm:order-2 inline-flex items-center justify-center gap-2">
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {form.scheduledAt ? 'Scheduling...' : 'Broadcasting...'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
                {form.scheduledAt ? 'Schedule Alert' : 'Publish Broadcast Alert'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, error, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 flex items-center gap-1">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
