import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertAPI } from '../../../services/api';
import { toast } from 'react-toastify';

const REGIONS = [
  'Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama',
  'Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella',
  'Benishangul-Gumuz','Harari','Dire Dawa',
];

const CATEGORIES = [
  { value: 'flood',        icon: '🌊', label: 'Flood Warning',          color: 'blue' },
  { value: 'rainfall',     icon: '🌧️', label: 'Heavy Rainfall Advisory', color: 'indigo' },
  { value: 'road_closure', icon: '🚧', label: 'Road Closure / Blockage', color: 'orange' },
  { value: 'health',       icon: '🏥', label: 'Health & Outbreak Alert', color: 'red' },
  { value: 'power_outage', icon: '⚡', label: 'Power Outage Notice',     color: 'yellow' },
];

const SEVERITIES = [
  { v: 'Info',     color: 'blue',   desc: 'General advisory',     icon: 'ℹ️' },
  { v: 'Warning',  color: 'amber',  desc: 'Potential danger',     icon: '⚠️' },
  { v: 'Critical', color: 'red',    desc: 'Immediate action needed', icon: '🔴' },
];

const SEVERITY_RING = { blue: 'ring-blue-400', amber: 'ring-amber-400', red: 'ring-red-400' };
const SEVERITY_BG = {
  blue:  'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300',
  amber: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300',
  red:   'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300',
};

export default function CreateAlertForm({ onSuccess }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    title: '',
    category: '',
    severity: 'Warning',
    region: '',
    zone: '',
    woreda: '',
    description: '',
  });

  const set = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const handleChange = (e) => set(e.target.name, e.target.value);

  const validate = () => {
    const err = {};
    if (!form.title.trim()) err.title = 'Alert title is required';
    else if (form.title.length > 200) err.title = 'Title must be under 200 characters';
    if (!form.category) err.category = 'Category is required';
    if (!form.severity) err.severity = 'Severity is required';
    if (!form.region) err.region = 'Region is required';
    if (!form.description.trim()) err.description = 'Description is required';
    else if (form.description.length > 2000) err.description = 'Description must be under 2000 characters';
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
      await alertAPI.create({
        title: form.title.trim(),
        category: form.category,
        severity: form.severity,
        region: form.region,
        zone: form.zone.trim(),
        woreda: form.woreda.trim(),
        description: form.description.trim(),
      });
      toast.success('Public alert broadcasted successfully!');
      if (onSuccess) onSuccess();
      else navigate('/dashboard/government/alerts');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to broadcast alert');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCat = CATEGORIES.find(c => c.value === form.category);
  const selectedSev = SEVERITIES.find(s => s.v === form.severity);

  return (
    <div className="card border-2 border-amber-200 dark:border-amber-800 overflow-hidden animate-fade-in">
      {/* Form Header */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 px-4 sm:px-6 py-4 border-b border-amber-200 dark:border-amber-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="text-xl">📢</span>
            Create Broadcast Alert
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fields marked with * are required</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="p-4 sm:p-6 space-y-5">

          {/* Title */}
          <FormField label="Alert Title" error={errors.title} required>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              maxLength={200}
              placeholder='e.g. "በዞን 3 ከፍተኛ የዝናብ ማስጠንቀቂያ" or "Heavy Rainfall Warning for Addis Ababa"'
              className={`input-field ${errors.title ? 'border-red-400 focus:ring-red-300' : ''}`}
            />
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${form.title.length > 180 ? 'bg-red-400' : form.title.length > 140 ? 'bg-yellow-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min((form.title.length / 200) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${form.title.length > 180 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                {form.title.length}/200
              </span>
            </div>
          </FormField>

          {/* Category */}
          <FormField label="Alert Category" error={errors.category} required>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {CATEGORIES.map(c => (
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
              {SEVERITIES.map(s => (
                <button key={s.v} type="button" onClick={() => set('severity', s.v)}
                  className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-center
                    ${form.severity === s.v
                      ? `${SEVERITY_BG[s.color]} ring-2 ring-offset-1 ${SEVERITY_RING[s.color]}`
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                    }`}>
                  <span className="block text-base mb-0.5">{s.icon}</span>
                  <span className="block">{s.v}</span>
                  <span className="block text-[10px] font-normal opacity-70 mt-0.5">{s.desc}</span>
                </button>
              ))}
            </div>
          </FormField>

          {/* Target Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              📍 Target Location <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <select name="region" value={form.region} onChange={handleChange}
                  className={`input-field ${errors.region ? 'border-red-400 focus:ring-red-300' : ''}`}>
                  <option value="">Select Region</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {errors.region && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.region}</p>}
              </div>
              <input name="zone" value={form.zone} onChange={handleChange} placeholder="Zone (optional)" className="input-field" />
              <input name="woreda" value={form.woreda} onChange={handleChange} placeholder="Woreda (optional)" className="input-field" />
            </div>
          </div>

          {/* Description */}
          <FormField label="Description / Action Needed" error={errors.description} required>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              maxLength={2000}
              placeholder="Provide detailed information about the alert and any actions citizens should take..."
              className={`input-field resize-none ${errors.description ? 'border-red-400 focus:ring-red-300' : ''}`}
            />
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${form.description.length > 1800 ? 'bg-red-400' : form.description.length > 1400 ? 'bg-yellow-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min((form.description.length / 2000) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${form.description.length > 1800 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                {form.description.length}/2000
              </span>
            </div>
          </FormField>

          {/* Preview */}
          {form.title && form.category && form.severity && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Preview</p>
              <div className={`rounded-lg p-3 border-l-4 ${
                form.severity === 'Critical' ? 'bg-red-50 dark:bg-red-900/10 border-red-500' :
                form.severity === 'Warning' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-500' :
                'bg-blue-50 dark:bg-blue-900/10 border-blue-500'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{selectedCat?.icon}</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{form.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    form.severity === 'Critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                    form.severity === 'Warning' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    {form.severity}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{form.description}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                  <span>📍 {form.region || 'Region'}{form.zone ? `, ${form.zone}` : ''}{form.woreda ? `, ${form.woreda}` : ''}</span>
                  <span>•</span>
                  <span>Just now</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Form Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => navigate('/dashboard/government/alerts')}
            className="btn-secondary py-2.5 px-5 text-sm order-2 sm:order-1">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm order-1 sm:order-2 inline-flex items-center justify-center gap-2">
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Broadcasting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
                Publish Broadcast Alert
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
