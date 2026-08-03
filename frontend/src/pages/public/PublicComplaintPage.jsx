import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { complaintAPI, publicAPI } from '../../services/api';
import { LocationPicker } from '../../components/map/EthioMap';
import { toast } from 'react-toastify';

const REGIONS = [
  'Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama',
  'Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella',
  'Benishangul-Gumuz','Harari','Dire Dawa',
];

const CATEGORIES = [
  'Government Service Complaint',
  'Project Delay',
  'Poor Work Quality',
  'Public Property Damage',
  'Other',
];

const PRIORITIES = [
  { v: 'Low',    color: 'green',  desc: 'Minor inconvenience', icon: '🟢' },
  { v: 'Medium', color: 'yellow', desc: 'Moderate impact',      icon: '🟡' },
  { v: 'High',   color: 'orange', desc: 'Significant disruption', icon: '🟠' },
  { v: 'Urgent', color: 'red',    desc: 'Immediate attention needed', icon: '🔴' },
];

const PRIORITY_RING = { green: 'ring-green-400', yellow: 'ring-yellow-400', orange: 'ring-orange-400', red: 'ring-red-400' };
const PRIORITY_BG = {
  green:  'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300',
  yellow: 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300',
  orange: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300',
  red:    'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300',
};

// Fallback subcity options used only when the live /public/subcities call fails.
const FALLBACK_SUBCITIES = [
  { value: 'BOLE',       label: 'Bole' },
  { value: 'YEKA',       label: 'Yeka' },
  { value: 'LEMMI_KURA', label: 'Lemmi Kura' },
];

// Converts a stored Subcity name into the canonical scope key used by the
// backend role scoping (e.g. "Lemmi Kura" → "LEMMI_KURA").
const canonicalSubcity = (name) => String(name || '').trim().toUpperCase().replace(/\s+/g, '_');

export default function PublicComplaintPage() {
  const [submitted, setSubmitted] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [position, setPosition] = useState(null);
  const [errors, setErrors] = useState({});
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);

  // ── Routing state (Subcity → Woreda → Department) ───────────────────────
  // These values are sent to the backend so the complaint is routed to the
  // correct office account automatically on submission.
  const [subcities, setSubcities]         = useState([]);  // [{name}] from DB
  const [woredas, setWoredas]             = useState([]);  // [{_id, name}] from DB
  const [departments, setDepartments]     = useState([]);  // string[] from DB
  const [routingLoading, setRoutingLoading] = useState(false);

  const [routing, setRouting] = useState({
    subcity:    '',   // e.g. 'BOLE'
    woredaId:   '',   // MongoDB ObjectId string
    woredaName: '',
    department: '',
  });

  // Load subcities and departments once on mount (static lists are fallbacks).
  useEffect(() => {
    publicAPI.getDepartments()
      .then(r => setDepartments(r.data.departments || []))
      .catch(() => setDepartments([]));

    publicAPI.getSubcities()
      .then(r => setSubcities((r.data?.subcities || []).map(s => ({
        value: canonicalSubcity(s.name),
        label: s.name,
      }))))
      .catch(() => setSubcities(FALLBACK_SUBCITIES));
  }, []);

  // When subcity changes, reload woreda list and clear downstream selections.
  const handleSubcityChange = async (subcityValue) => {
    setRouting({ subcity: subcityValue, woredaId: '', woredaName: '', department: '' });
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
    setRouting(p => ({ ...p, woredaId, woredaName: w?.name || '', department: '' }));
  };

  const handleDepartmentChange = (dept) => {
    setRouting(p => ({ ...p, department: dept }));
    if (errors.department) setErrors(p => { const n = { ...p }; delete n.department; return n; });
  };

  // Department options come from the selected woreda record when it carries its
  // own departments array; otherwise fall back to the global Department list.
  const selectedWoreda = woredas.find(w => w._id === routing.woredaId);
  const departmentOptions = (selectedWoreda?.departments?.length)
    ? selectedWoreda.departments
    : departments;

  const [form, setForm] = useState({
    category: '',
    title: '',
    description: '',
    region: '',
    city: '',
    district: '',
    priority: 'Medium',
    anonymous: false,
    reporterName: '',
    reporterPhone: '',
    reporterEmail: '',
  });

  const set = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    set(name, type === 'checkbox' ? checked : value);
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    const combined = [...files, ...newFiles].slice(0, 5);
    const oversized = newFiles.find(f => f.size > 10 * 1024 * 1024);
    if (oversized) { toast.error(`${oversized.name} exceeds 10MB limit`); return; }
    setFiles(combined);
  };

  const removeFile = (idx) => setFiles(p => p.filter((_, i) => i !== idx));

  const getFilePreview = (file) => {
    if (file.type.startsWith('image/')) return URL.createObjectURL(file);
    if (file.type.startsWith('video/')) return null;
    return null;
  };

  const validateStep = (s) => {
    const err = {};
    if (s === 1) {
      if (!form.category) err.category = 'Category is required';
      if (!form.title.trim()) err.title = 'Title is required';
      else if (form.title.length > 200) err.title = 'Title must be under 200 characters';
      if (!form.description.trim()) err.description = 'Description is required';
      else if (form.description.length > 5000) err.description = 'Description must be under 5000 characters';
      if (!form.priority) err.priority = 'Priority is required';
    }
    if (s === 2) {
      if (!form.region) err.region = 'Region is required';
      if (!routing.subcity)   err.subcity    = 'Subcity is required';
      if (!routing.woredaId)  err.woreda     = 'Woreda is required';
      if (!routing.department) err.department = 'Department is required';
    }
    if (s === 3 && !form.anonymous) {
      if (!form.reporterName.trim()) err.reporterName = 'Full name is required';
      if (!form.reporterPhone.trim()) err.reporterPhone = 'Phone number is required';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep(s => s + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(3)) {
      toast.error('Please fix the errors below');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('category', form.category);
      fd.append('title', form.title.trim());
      fd.append('description', form.description.trim());
      fd.append('region', form.region);
      fd.append('priority', form.priority);
      fd.append('anonymous', String(form.anonymous));
      if (form.city) fd.append('city', form.city.trim());
      if (form.district) fd.append('district', form.district.trim());
      // Routing fields — tell the backend exactly which office to notify.
      if (routing.subcity)    fd.append('subcity',    routing.subcity);
      if (routing.woredaId)   fd.append('woredaId',   routing.woredaId);
      if (routing.woredaName) fd.append('woredaName', routing.woredaName);
      if (routing.department) fd.append('department', routing.department);
      if (position) {
        fd.append('latitude', position.lat);
        fd.append('longitude', position.lng);
      }
      if (!form.anonymous) {
        fd.append('reporterName', form.reporterName.trim());
        fd.append('reporterPhone', form.reporterPhone.trim());
        if (form.reporterEmail) fd.append('reporterEmail', form.reporterEmail.trim());
      }
      files.forEach(f => fd.append('attachments', f));

      const res = await complaintAPI.create(fd);
      setTrackingNumber(res.data.data.trackingNumber);
      setSubmitted(true);
      toast.success('Complaint submitted successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="card text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Complaint Submitted Successfully</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your complaint has been successfully submitted. Tracking Number:
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-6 py-4 mb-8">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your Tracking Number</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 font-mono">{trackingNumber}</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Save this tracking number to check the status of your complaint. You will also receive updates if you provided contact information.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/track-report"
              className="btn-primary py-2.5 px-6 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              Track Complaint
            </Link>
            <Link
              to="/"
              className="btn-secondary py-2.5 px-6"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 via-amber-700 to-orange-700 text-white p-6 sm:p-8 lg:p-10 mb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Public Complaint Management</h1>
              <p className="text-amber-100 text-sm sm:text-base max-w-xl">
                Report public service complaints, delayed government projects, poor construction quality, and damage to public property.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              5 Categories
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              14 Regions
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Anonymous Option
            </span>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          {[
            { n: 1, label: 'Details', icon: '📝' },
            { n: 2, label: 'Location', icon: '📍' },
            { n: 3, label: 'Contact & Submit', icon: '✅' },
          ].map((s) => (
            <button key={s.n} type="button" onClick={() => { if (s.n < step) setStep(s.n); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200
                ${step === s.n
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shadow-sm'
                  : step > s.n
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${step === s.n ? 'bg-amber-600 text-white' : step > s.n ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>
                {step > s.n ? '✓' : s.n}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="card space-y-5">

          {/* ── Step 1: Complaint Details ── */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span className="text-amber-600 dark:text-amber-400">📝</span>
                Complaint Details
              </h2>

              {/* Category */}
              <FormField label="Complaint Category" error={errors.category} required>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className={`input-field ${errors.category ? 'border-red-400 focus:ring-red-300' : ''}`}
                >
                  <option value="">Select a category...</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </FormField>

              {/* Title */}
              <FormField label="Complaint Title" error={errors.title} required>
                <input
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  maxLength={200}
                  placeholder="e.g. Broken street lights on Main Street for 3 weeks"
                  className={`input-field ${errors.title ? 'border-red-400 focus:ring-red-300' : ''}`}
                />
                <CharCount current={form.title.length} max={200} />
              </FormField>

              {/* Description */}
              <FormField label="Description" error={errors.description} required>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={5}
                  maxLength={5000}
                  placeholder="Describe the complaint in detail: what happened, when you noticed it, who is affected, and any steps already taken..."
                  className={`input-field resize-none ${errors.description ? 'border-red-400 focus:ring-red-300' : ''}`}
                />
                <CharCount current={form.description.length} max={5000} />
              </FormField>

              {/* Priority */}
              <FormField label="Priority" error={errors.priority} required>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRIORITIES.map(p => (
                    <button key={p.v} type="button" onClick={() => set('priority', p.v)}
                      className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-center
                        ${form.priority === p.v
                          ? `${PRIORITY_BG[p.color]} ring-2 ring-offset-1 ${PRIORITY_RING[p.color]}`
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                        }`}>
                      <span className="block text-base mb-0.5">{p.icon}</span>
                      <span className="block">{p.v}</span>
                      <span className="block text-[10px] font-normal opacity-70 mt-0.5">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </FormField>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                Complaints are reviewed by administrators and forwarded to the responsible government office for action.
              </div>
            </div>
          )}

          {/* ── Step 2: Location ── */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span className="text-amber-600 dark:text-amber-400">📍</span>
                Location
              </h2>

              {/* Region */}
              <FormField label="Region" error={errors.region} required>
                <select name="region" value={form.region} onChange={handleChange}
                  className={`input-field ${errors.region ? 'border-red-400 focus:ring-red-300' : ''}`}>
                  <option value="">Select Region</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </FormField>

              {/* Routing — Subcity / Woreda / Department */}
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10 p-4 space-y-4">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🏛️</span> Route to Office
                  <span className="font-normal normal-case text-amber-600 dark:text-amber-400 ml-1">— select the office responsible for your complaint</span>
                </p>

                {/* Subcity */}
                <FormField label="Subcity" error={errors.subcity} required>
                  <select
                    value={routing.subcity}
                    onChange={e => handleSubcityChange(e.target.value)}
                    className={`input-field ${errors.subcity ? 'border-red-400 focus:ring-red-300' : ''}`}
                  >
                    <option value="">Select Subcity</option>
                    {subcities.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </FormField>

                {/* Woreda */}
                <FormField label="Woreda" error={errors.woreda} required>
                  <select
                    value={routing.woredaId}
                    onChange={e => handleWoredaChange(e.target.value)}
                    disabled={!routing.subcity || routingLoading}
                    className={`input-field disabled:opacity-60 ${errors.woreda ? 'border-red-400 focus:ring-red-300' : ''}`}
                  >
                    <option value="">
                      {routingLoading ? 'Loading woredas…' : routing.subcity ? 'Select Woreda' : 'Select a subcity first'}
                    </option>
                    {woredas.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </FormField>

                {/* Department */}
                <FormField label="Department" error={errors.department} required>
                  <select
                    value={routing.department}
                    onChange={e => handleDepartmentChange(e.target.value)}
                    disabled={!routing.woredaId}
                    className={`input-field disabled:opacity-60 ${errors.department ? 'border-red-400 focus:ring-red-300' : ''}`}
                  >
                    <option value="">
                      {routing.woredaId ? 'Select Department' : 'Select a woreda first'}
                    </option>
                    {departmentOptions.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              {/* City & District */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">City</label>
                  <input name="city" value={form.city} onChange={handleChange} placeholder="City or town" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">District / Sub City</label>
                  <input name="district" value={form.district} onChange={handleChange} placeholder="District or sub city" className="input-field" />
                </div>
              </div>

              {/* GPS Map */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  📍 Pin Location on Map
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(optional)</span>
                </label>
                <LocationPicker onLocationSelect={setPosition} position={position} />
                {position && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-green-700 dark:text-green-300 flex-1">
                      Location: {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
                    </span>
                    <button type="button" onClick={() => setPosition(null)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Evidence & Contact ── */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              {/* Evidence Upload */}
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                  <span className="text-amber-600 dark:text-amber-400">📎</span>
                  Upload Evidence
                  <span className="text-gray-400 dark:text-gray-500 font-normal text-sm">(optional, max 5 files)</span>
                </h2>

                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors"
                >
                  <input ref={fileRef} type="file" accept="image/*,video/*,.pdf" multiple onChange={handleFileChange} className="hidden" />
                  <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.939A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Click to upload images, videos, or PDFs</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Images, Videos, PDF — Max 10MB each</p>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2.5 text-xs group">
                        {f.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(f)} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-600 shrink-0" />
                        ) : f.type.startsWith('video/') ? (
                          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                        )}
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.name}</span>
                        <span className="text-gray-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                        <button type="button" onClick={() => removeFile(i)}
                          className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Anonymous Toggle */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="anonymous"
                    checked={form.anonymous}
                    onChange={handleChange}
                    className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Submit anonymously</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Your identity will not be shared with the reviewing office</p>
                  </div>
                </label>
              </div>

              {/* Contact Information (only when not anonymous) */}
              {!form.anonymous && (
                <div className="space-y-4 animate-fade-in">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <span className="text-amber-600 dark:text-amber-400">👤</span>
                    Contact Information
                  </h2>

                  <FormField label="Full Name" error={errors.reporterName} required>
                    <input
                      name="reporterName"
                      value={form.reporterName}
                      onChange={handleChange}
                      placeholder="Your full name"
                      className={`input-field ${errors.reporterName ? 'border-red-400 focus:ring-red-300' : ''}`}
                    />
                  </FormField>

                  <FormField label="Phone Number" error={errors.reporterPhone} required>
                    <input
                      name="reporterPhone"
                      value={form.reporterPhone}
                      onChange={handleChange}
                      type="tel"
                      placeholder="+251 9XX XXX XXX"
                      className={`input-field ${errors.reporterPhone ? 'border-red-400 focus:ring-red-300' : ''}`}
                    />
                  </FormField>

                  <FormField label="Email" error={errors.reporterEmail}>
                    <input
                      name="reporterEmail"
                      value={form.reporterEmail}
                      onChange={handleChange}
                      type="email"
                      placeholder="your@email.com (optional)"
                      className="input-field"
                    />
                  </FormField>
                </div>
              )}

              {form.anonymous && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Your complaint will be submitted anonymously. No personal information will be recorded or shared.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Form Footer */}
        <div className="mt-4 card flex flex-col sm:flex-row gap-3">
          {step > 1 && (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="btn-secondary py-2.5 px-5 text-sm order-2 sm:order-1">
              ← Back
            </button>
          )}

          <div className="flex gap-3 flex-1 order-1 sm:order-2 justify-end">
            {step < 3 ? (
              <button type="button" onClick={handleNext}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors text-sm">
                Next →
              </button>
            ) : (
              <button type="submit" disabled={submitting}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    Submit Complaint
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Info */}
      <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
        <strong>Note:</strong> All complaints are reviewed by administrators before being forwarded to the appropriate government office. You will receive updates on the status of your complaint through your provided contact information or via the tracking page.
      </div>
    </div>
  );
}

/* ─────────────────── Shared Components ─────────────────── */

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

function CharCount({ current, max }) {
  const pct = (current / max) * 100;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-yellow-400' : 'bg-amber-400'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${pct > 90 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
        {current}/{max}
      </span>
    </div>
  );
}
