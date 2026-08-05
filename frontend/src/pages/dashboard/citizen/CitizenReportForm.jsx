import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { infraAPI, publicAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-toastify';

const IssueLocationPicker = lazy(() => import('../../../components/map/IssueLocationPicker'));

// Fallback subcity options used only when the live /public/subcities call fails.
const FALLBACK_SUBCITIES = [
  { value: 'BOLE',       label: 'Bole' },
  { value: 'YEKA',       label: 'Yeka' },
  { value: 'LEMMI_KURA', label: 'Lemmi Kura' },
];

// Converts a stored Subcity name into the canonical scope key used by the
// backend role scoping (e.g. "Lemmi Kura" → "LEMMI_KURA").
const canonicalSubcity = (name) => String(name || '').trim().toUpperCase().replace(/\s+/g, '_');

const ISSUE_LEVELS = [
  { v: 'Low',    color: 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300', ring: 'ring-green-400' },
  { v: 'Medium', color: 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300', ring: 'ring-yellow-400' },
  { v: 'High',   color: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300', ring: 'ring-orange-400' },
];

// Maps the selected department to the classic infrastructure category when
// possible; the backend falls back to 'other' for everything else.
const DEPT_CATEGORY_MAP = {
  Electricity: 'electricity_issue',
  Road:        'road_issue',
  Water:       'water_supply_issue',
};

export default function CitizenReportForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    password: '',
    phone: user?.phone || '',
    subcity: '',
    woredaId: '',
    woredaName: '',
    department: '',
    issueTitle: '',
    description: '',
    issueLevel: 'Medium',
  });
  const [videos, setVideos] = useState([]);
  const [subcities, setSubcities] = useState(FALLBACK_SUBCITIES);
  const [woredas, setWoredas] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [location, setLocation] = useState({
    latitude: null, longitude: null, accuracy: null, timestamp: null,
    address: '', street: '', landmark: '', subcity: '', detectedWoreda: '', woredaIndex: null,
  });
  const videoRef = useRef(null);
  const pendingWoredaIndex = useRef(null);

  // Load subcities and departments once on mount (static lists are fallbacks).
  useEffect(() => {
    publicAPI.getSubcities()
      .then(r => {
        const list = r.data?.subcities || [];
        if (list.length) setSubcities(list.map(s => ({ value: canonicalSubcity(s.name), label: s.name })));
      })
      .catch(() => { /* keep static fallback */ });

    publicAPI.getDepartments()
      .then(r => setDepartments(r.data.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  // Once the woreda list for the detected subcity is ready, auto-select the
  // woreda grid cell the map picked.
  useEffect(() => {
    if (pendingWoredaIndex.current != null && !form.woredaId) {
      const w = woredas[pendingWoredaIndex.current];
      if (w) {
        pendingWoredaIndex.current = null;
        setForm(p => ({ ...p, woredaId: w._id, woredaName: w.name, department: '' }));
      }
    }
  }, [woredas, form.woredaId]);

  const set = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const handleSubcityChange = async (subcityValue) => {
    setForm(p => ({ ...p, subcity: subcityValue, woredaId: '', woredaName: '', department: '' }));
    pendingWoredaIndex.current = null;
    setWoredas([]);
    if (!subcityValue) return;
    setRoutingLoading(true);
    try {
      const r = await publicAPI.getSubcityWoredas(subcityValue);
      setWoredas(r.data.woredas || []);
    } catch {
      toast.error('Failed to load woredas. Please try again.');
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleWoredaChange = (woredaId) => {
    const w = woredas.find(x => x._id === woredaId);
    setForm(p => ({ ...p, woredaId, woredaName: w?.name || '', department: '' }));
  };

  const selectedWoreda = woredas.find(w => w._id === form.woredaId);
  const departmentOptions = (selectedWoreda?.departments?.length)
    ? selectedWoreda.departments
    : departments;

  const handleLocationChange = (loc) => {
    setLocation(loc);
    if (loc.subcity && !form.subcity) {
      const opt = subcities.find(s => s.label.toLowerCase() === loc.subcity.toLowerCase());
      if (opt) handleSubcityChange(opt.value);
    }
    if (loc.woredaIndex != null && loc.subcity) {
      const matchesSelected = form.subcity
        ? canonicalSubcity(loc.subcity) === canonicalSubcity(form.subcity)
        : true;
      if (matchesSelected && !form.woredaId) pendingWoredaIndex.current = loc.woredaIndex;
    }
  };

  const handleVideoChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 3 - videos.length);
    const oversized = files.find(f => f.size > 50 * 1024 * 1024);
    if (oversized) { toast.error(`${oversized.name} exceeds 50MB limit`); return; }
    setVideos(p => [...p, ...files].slice(0, 3));
  };

  const validate = () => {
    const err = {};
    if (!form.fullName.trim()) err.fullName = 'Full name is required';
    if (!form.email.trim()) err.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) err.email = 'Enter a valid email';
    if (!form.phone.trim()) err.phone = 'Phone number is required';
    if (!form.password) err.password = 'Password is required';
    if (!form.subcity) err.subcity = 'Subcity is required';
    if (!form.woredaId) err.woreda = 'Woreda is required';
    if (!form.department) err.department = 'Department is required';
    if (!form.issueTitle.trim()) err.issueTitle = 'Issue title is required';
    if (!form.description.trim()) err.description = 'Description is required';
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
      const fd = new FormData();
      const cleanPhone = form.phone.trim().replace(/\s+/g, '');
      fd.append('title', form.issueTitle.trim());
      fd.append('description', form.description.trim());
      fd.append('region', 'Addis Ababa');
      fd.append('subcity', form.subcity);
      fd.append('woredaId', form.woredaId);
      fd.append('woredaName', form.woredaName);
      fd.append('department', form.department);
      fd.append('reporterName', form.fullName.trim());
      fd.append('reporterEmail', form.email.trim());
      fd.append('reporterPhone', cleanPhone);
      fd.append('password', form.password);

      const category = DEPT_CATEGORY_MAP[form.department];
      if (category) fd.append('category', category);
      fd.append('severityLevel', form.issueLevel);

      // GIS location (latitude/longitude/address are stored; accuracy + timestamp
      // are captured for reference).
      if (Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
        fd.append('latitude', location.latitude);
        fd.append('longitude', location.longitude);
        fd.append('locationAccuracy', location.accuracy || '');
        fd.append('gpsTimestamp', location.timestamp ? new Date(location.timestamp).toISOString() : '');
        if (location.address) fd.append('address', location.address);
      }

      videos.forEach(v => fd.append('media', v));
      await infraAPI.create(fd);
      toast.success(t('report.submitted') || 'Report submitted successfully');
      navigate('/dashboard/citizen/my-reports');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/dashboard/citizen/create-report"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 transition-colors">
          ← Back to report types
        </Link>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-2">
          🏗️ Submit Infrastructure Report
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Fields marked with * are required</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="card p-5 sm:p-6 space-y-5">
        {/* Contact details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Full Name" error={errors.fullName} required>
            <input value={form.fullName} onChange={e => set('fullName', e.target.value)}
              placeholder="Your full name" className={`input-field ${errors.fullName ? 'border-red-400' : ''}`} />
          </FieldWrap>
          <FieldWrap label="Email" error={errors.email} required>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="you@example.com" className={`input-field ${errors.email ? 'border-red-400' : ''}`} />
          </FieldWrap>
          <FieldWrap label="Password" error={errors.password} required>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="Your account password" className={`input-field ${errors.password ? 'border-red-400' : ''}`} />
          </FieldWrap>
          <FieldWrap label="Phone Number" error={errors.phone} required>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="e.g. 0911 234 567" className={`input-field ${errors.phone ? 'border-red-400' : ''}`} />
          </FieldWrap>
        </div>

        {/* Location & routing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Subcity" error={errors.subcity} required>
            <select value={form.subcity} onChange={e => handleSubcityChange(e.target.value)}
              className={`input-field ${errors.subcity ? 'border-red-400' : ''}`}>
              <option value="">Select subcity…</option>
              {subcities.map(sc => <option key={sc.value} value={sc.value}>{sc.label}</option>)}
            </select>
          </FieldWrap>
          <FieldWrap label="Woreda" error={errors.woreda} required>
            <select value={form.woredaId} onChange={e => handleWoredaChange(e.target.value)}
              disabled={!form.subcity || routingLoading}
              className={`input-field ${errors.woreda ? 'border-red-400' : ''}`}>
              <option value="">{routingLoading ? 'Loading…' : form.subcity ? 'Select woreda…' : 'Select a subcity first'}</option>
              {woredas.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>
          </FieldWrap>
          <FieldWrap label="Department" error={errors.department} required>
            <select value={form.department} onChange={e => set('department', e.target.value)}
              disabled={!form.woredaId}
              className={`input-field sm:col-span-2 ${errors.department ? 'border-red-400' : ''}`}>
              <option value="">{form.woredaId ? 'Select department…' : 'Select a woreda first'}</option>
              {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </FieldWrap>
        </div>

        {/* Issue details */}
        <div>
          <FieldWrap label="Issue Title" error={errors.issueTitle} required>
            <input value={form.issueTitle} onChange={e => set('issueTitle', e.target.value)} maxLength={200}
              placeholder="e.g. Pothole on Bole Road" className={`input-field ${errors.issueTitle ? 'border-red-400' : ''}`} />
          </FieldWrap>
        </div>
        <div>
          <FieldWrap label="Description" error={errors.description} required>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} maxLength={5000}
              placeholder="Describe the issue: what, where, when, and how severe…"
              className={`input-field resize-none ${errors.description ? 'border-red-400' : ''}`} />
          </FieldWrap>
        </div>

        {/* GIS Issue Location */}
        <section className="border-t border-gray-200 dark:border-gray-700 pt-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
            📍 Issue Location
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Use your current GPS location or click the map to mark where the issue is. Subcity and woreda are detected automatically.
          </p>
          <Suspense fallback={<MapFallback />}>
            <IssueLocationPicker value={location} onChange={handleLocationChange} />
          </Suspense>
        </section>

        {/* Issue level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Issue Level *</label>
          <div className="grid grid-cols-3 gap-2">
            {ISSUE_LEVELS.map(l => (
              <button key={l.v} type="button" onClick={() => set('issueLevel', l.v)}
                className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150
                  ${form.issueLevel === l.v
                    ? `${l.color} ring-2 ring-offset-1 ${l.ring}`
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                  }`}>
                {l.v}
              </button>
            ))}
          </div>
        </div>

        {/* Videos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Upload Videos <span className="text-gray-400 dark:text-gray-500 font-normal">(up to 3, 50MB each)</span>
          </label>
          <div
            onClick={() => videoRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
          >
            <input ref={videoRef} type="file" accept="video/mp4,video/mov,video/webm" multiple onChange={handleVideoChange} className="hidden" />
            <span className="text-2xl">🎬</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click to upload videos</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{videos.length}/3 selected</p>
          </div>
          {videos.length > 0 && (
            <div className="space-y-2 mt-3">
              {videos.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-xs group">
                  <span className="text-gray-400">🎬</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.name}</span>
                  <span className="text-gray-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button type="button" onClick={() => setVideos(p => p.filter((_, j) => j !== i))}
                    className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Link to="/dashboard/citizen" className="btn-secondary flex-1 py-3 text-sm text-center">{t('common.cancel') || 'Cancel'}</Link>
          <button type="submit" disabled={submitting} className="btn-primary flex-1 py-3 text-sm">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('common.submitting') || 'Submitting…'}
              </span>
            ) : (t('common.submit') || 'Submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

function MapFallback() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 h-64 flex items-center justify-center text-sm text-gray-400">
      Loading map…
    </div>
  );
}

function FieldWrap({ label, error, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">⚠ {error}</p>}
    </div>
  );
}
