import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { LocationPicker } from '../../components/map/EthioMap';
import ReportCard from '../../components/common/ReportCard';
import SearchFilter from '../../components/common/SearchFilter';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import EthioMap from '../../components/map/EthioMap';
import { toast } from 'react-toastify';

const REGIONS = [
  'Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama',
  'Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella',
  'Benishangul-Gumuz','Harari','Dire Dawa',
];

const CATEGORIES = [
  { value: 'road_issue',         label: 'Road Issue',         icon: '🛣️', color: 'orange' },
  { value: 'electricity_issue',  label: 'Electricity Issue',  icon: '⚡', color: 'yellow' },
  { value: 'water_supply_issue', label: 'Water Supply Issue', icon: '💧', color: 'blue' },
];

const SEVERITY = [
  { v: 'Low',      color: 'green',  desc: 'Minor issue, not urgent' },
  { v: 'Medium',   color: 'yellow', desc: 'Moderate impact on daily life' },
  { v: 'High',     color: 'orange', desc: 'Significant disruption' },
  { v: 'Critical', color: 'red',    desc: 'Immediate danger to safety' },
];

const SEVERITY_RING = { green: 'ring-green-400', yellow: 'ring-yellow-400', orange: 'ring-orange-400', red: 'ring-red-400' };
const SEVERITY_BG = {
  green:  'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300',
  yellow: 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300',
  orange: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300',
  red:    'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300',
};
const CATEGORY_RING = {
  orange: 'ring-orange-400', amber: 'ring-amber-400', blue: 'ring-blue-400', yellow: 'ring-yellow-400',
  indigo: 'ring-indigo-400', red: 'ring-red-400', cyan: 'ring-cyan-400', purple: 'ring-purple-400', gray: 'ring-gray-400',
};
const CATEGORY_BG = {
  orange: 'border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800',
  amber: 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800',
  blue: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800',
  yellow: 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800',
  indigo: 'border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800',
  red: 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800',
  cyan: 'border-cyan-200 bg-cyan-50 dark:bg-cyan-900/20 dark:border-cyan-800',
  purple: 'border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-800',
  gray: 'border-gray-200 bg-gray-50 dark:bg-gray-800/40 dark:border-gray-600',
};

export default function InfrastructureReports() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const FILTER_CATEGORIES = CATEGORIES.map(c => ({ value: c.value, label: c.label }));
  const FILTER_STATUSES = [
    { value: 'Under Review', label: t('dashboard.statusUnderReview', 'Under Review') },
    { value: 'In Progress',  label: t('dashboard.statusInProgress', 'In Progress') },
    { value: 'Resolved',     label: t('dashboard.statusResolved', 'Resolved') },
  ];

  const [showForm, setShowForm] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', region: '', status: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [mapMarkers, setMapMarkers] = useState([]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await infraAPI.getPublic({ search, ...filters, page, limit: 9 });
      const fetched = res.data?.reports || [];
      setReports(fetched);
      setPages(res.data?.pages || 1);
      setTotal(res.data?.total || 0);
      setMapMarkers(
        fetched
          .filter(r => r?.latitude && r?.longitude)
          .map(r => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude), type: 'infrastructure' }))
      );
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [search, filters, page]);

  const handleFilterChange = (name, value) => { setFilters(p => ({ ...p, [name]: value })); setPage(1); };

  const toggleForm = () => {
    if (!isAuthenticated) {
      toast.info(t('infra.loginRequired', 'Please log in to submit a report'));
      navigate('/login');
      return;
    }
    if (user?.role !== 'citizen') {
      toast.warning(t('infra.citizenOnly', 'Only citizens can submit infrastructure reports'));
      return;
    }
    setShowForm(p => !p);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white p-6 sm:p-8 lg:p-10 mb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t('infra.title', 'Infrastructure Reports')}</h1>
              <p className="text-primary-100 text-sm sm:text-base max-w-xl">
                {t('infra.desc', 'Browse community-reported infrastructure issues or submit a new report to help improve your area.')}
              </p>
            </div>
            <button
              onClick={toggleForm}
              className="inline-flex items-center gap-2 bg-white text-primary-700 hover:bg-primary-50 font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {showForm ? t('infra.hideForm', 'Hide Form') : t('infra.submitReport', 'Submit Report')}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              {t('infra.heroTotal', '{{count}} Reports', { count: total })}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              {t('infra.heroCategories', '3 Categories')}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              {t('infra.heroRegions', '14 Regions')}
            </span>
          </div>
        </div>
      </div>

      {/* Submission Form */}
      {showForm && (
        <SubmissionForm
          t={t}
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchReports(); }}
        />
      )}

      {/* Search & Filters */}
      <SearchFilter
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        filters={[
          { name: 'category', label: t('infra.allCategories', 'All Categories'), options: FILTER_CATEGORIES },
          { name: 'region',   label: t('infra.allRegions', 'All Regions'),       options: REGIONS.map(r => ({ value: r, label: r })) },
          { name: 'status',   label: t('infra.allStatuses', 'All Statuses'),     options: FILTER_STATUSES },
        ]}
        onFilterChange={handleFilterChange}
        filterValues={filters}
        autocompleteAPI={infraAPI.getPublicAutocomplete}
      />

      {/* Map */}
      {mapMarkers.length > 0 && (
        <div className="mb-6">
          <EthioMap markers={mapMarkers} height="300px" />
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('infra.verifiedReports', { count: total, defaultValue: '{{count}} verified reports' })}
        </p>
      </div>

      {/* Reports Grid */}
      {loading ? (
        <LoadingSpinner />
      ) : reports.length === 0 ? (
        <EmptyState icon="🏗️" title={t('infra.noReports', 'No reports found')} description={t('infra.adjustFilters', 'Try adjusting your search or filters')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reports.map(r => <ReportCard key={r._id} report={r} type="infrastructure" />)}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Notice */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        {t('infra.notice', 'All reports are reviewed by administrators before being made public. Your information helps improve infrastructure across Ethiopia.')}
      </div>
    </div>
  );
}

/* ─────────────────── Submission Form ─────────────────── */

function SubmissionForm({ t, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [position, setPosition] = useState(null);
  const [errors, setErrors] = useState({});
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [step, setStep] = useState(1);
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  const [form, setForm] = useState({
    title: '', description: '', region: '', zone: '', woreda: '', kebele: '',
    city: '', specificLocation: '', address: '', incidentDate: '',
    category: '', severityLevel: 'Medium',
  });

  const set = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const handleChange = (e) => set(e.target.name, e.target.value);

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 5);
    const oversized = files.find(f => f.size > 10 * 1024 * 1024);
    if (oversized) { toast.error(`${oversized.name} exceeds 10MB limit`); return; }
    setPhotos(files);
  };

  const handleVideoChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 2);
    const oversized = files.find(f => f.size > 50 * 1024 * 1024);
    if (oversized) { toast.error(`${oversized.name} exceeds 50MB limit`); return; }
    setVideos(files);
  };

  const validate = () => {
    const err = {};
    if (!form.title.trim()) err.title = 'Title is required';
    else if (form.title.length > 200) err.title = 'Title must be under 200 characters';
    if (!form.category) err.category = 'Category is required';
    if (!form.description.trim()) err.description = 'Description is required';
    else if (form.description.length > 5000) err.description = 'Description must be under 5000 characters';
    if (!form.severityLevel) err.severityLevel = 'Severity is required';
    if (!form.region) err.region = 'Region is required';
    if (form.incidentDate) {
      const d = new Date(form.incidentDate);
      if (isNaN(d.getTime())) err.incidentDate = 'Invalid date';
      else if (d > new Date()) err.incidentDate = 'Incident date cannot be in the future';
    }
    if (form.latitude && (form.latitude < -90 || form.latitude > 90)) err.latitude = 'Invalid latitude';
    if (form.longitude && (form.longitude < -180 || form.longitude > 180)) err.longitude = 'Invalid longitude';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the errors below');
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('description', form.description.trim());
      fd.append('category', form.category);
      fd.append('severityLevel', form.severityLevel);
      fd.append('region', form.region);
      if (form.zone) fd.append('zone', form.zone.trim());
      if (form.woreda) fd.append('woreda', form.woreda.trim());
      if (form.kebele) fd.append('kebele', form.kebele.trim());
      if (form.city) fd.append('city', form.city.trim());
      if (form.specificLocation) fd.append('specificLocation', form.specificLocation.trim());
      if (form.address) fd.append('address', form.address.trim());
      if (form.incidentDate) fd.append('incidentDate', form.incidentDate);
      if (position) { fd.append('latitude', position.lat); fd.append('longitude', position.lng); }
      photos.forEach(f => fd.append('media', f));
      videos.forEach(f => fd.append('media', f));

      await infraAPI.create(fd);
      toast.success(t('report.submitted', 'Report submitted successfully! It will be reviewed shortly.'));
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || t('report.submitFailed', 'Submission failed. Please try again.'));
    } finally { setSubmitting(false); }
  };

  const selectedCat = CATEGORIES.find(c => c.value === form.category);
  const selectedSev = SEVERITY.find(s => s.v === form.severityLevel);

  return (
    <div className="mb-8 card border-2 border-primary-200 dark:border-primary-800 overflow-hidden animate-fade-in">
      {/* Form Header */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/20 px-4 sm:px-6 py-4 border-b border-primary-200 dark:border-primary-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('infra.formTitle', 'Submit Infrastructure Report')}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('infra.formSubtitle', 'Fields marked with * are required')}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Step Indicator */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="flex items-center gap-2 sm:gap-3">
          {[
            { n: 1, label: t('report.stepDetails', 'Details') },
            { n: 2, label: t('report.stepLocation', 'Location') },
            { n: 3, label: t('report.stepEvidence', 'Evidence') },
          ].map((s, i) => (
            <button key={s.n} type="button" onClick={() => setStep(s.n)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200
                ${step === s.n
                  ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 shadow-sm'
                  : step > s.n
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${step === s.n ? 'bg-primary-600 text-white' : step > s.n ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>
                {step > s.n ? '✓' : s.n}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="p-4 sm:p-6 space-y-5">

          {/* ── Step 1: Issue Details ── */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              {/* Category Dropdown */}
              <FormField label={t('report.categoryLabel', 'Infrastructure Category')} error={errors.category} required>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className={`input-field ${errors.category ? 'border-red-400 focus:ring-red-300' : ''}`}
                >
                  <option value="">{t('infra.selectCategory', 'Select a category...')}</option>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                  ))}
                </select>
                {form.category && selectedCat && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex gap-1">
                      {CATEGORIES.map(c => (
                        <button key={c.value} type="button" onClick={() => set('category', c.value)}
                          title={c.label}
                          className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm transition-all duration-150
                            ${form.category === c.value
                              ? `${CATEGORY_BG[c.color]} ring-2 ring-offset-1 ${CATEGORY_RING[c.color]}`
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 bg-white dark:bg-gray-800'
                            }`}>
                          {c.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </FormField>

              {/* Title */}
              <FormField label={t('report.titleLabel', 'Report Title')} error={errors.title} required>
                <input name="title" value={form.title} onChange={handleChange} maxLength={200}
                  placeholder={t('report.titlePlaceholder', 'e.g. Large pothole on Bole Road near Edna Mall')}
                  className={`input-field ${errors.title ? 'border-red-400 focus:ring-red-300' : ''}`} />
                <CharCount current={form.title.length} max={200} />
              </FormField>

              {/* Severity */}
              <FormField label={t('report.severityLabel', 'Severity Level')} error={errors.severityLevel} required>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SEVERITY.map(s => (
                    <button key={s.v} type="button" onClick={() => set('severityLevel', s.v)}
                      className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-center
                        ${form.severityLevel === s.v
                          ? `${SEVERITY_BG[s.color]} ring-2 ring-offset-1 ${SEVERITY_RING[s.color]}`
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                        }`}>
                      <span className="block text-base mb-0.5">
                        {s.v === 'Low' ? '🟢' : s.v === 'Medium' ? '🟡' : s.v === 'High' ? '🟠' : '🔴'}
                      </span>
                      <span className="block">{s.v}</span>
                      <span className="block text-[10px] font-normal opacity-70 mt-0.5">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </FormField>

              {/* Description */}
              <FormField label={t('report.descLabel', 'Description')} error={errors.description} required>
                <textarea name="description" value={form.description} onChange={handleChange} rows={4} maxLength={5000}
                  placeholder={t('report.descPlaceholder', 'Describe the issue in detail: what happened, when you noticed it, who is affected, how severe it is...')}
                  className={`input-field resize-none ${errors.description ? 'border-red-400 focus:ring-red-300' : ''}`} />
                <CharCount current={form.description.length} max={5000} />
              </FormField>

              {/* Incident Date */}
              <FormField label={t('report.incidentDate', 'Incident Date')} error={errors.incidentDate}>
                <input type="date" name="incidentDate" value={form.incidentDate} onChange={handleChange}
                  max={new Date().toISOString().split('T')[0]}
                  className={`input-field ${errors.incidentDate ? 'border-red-400 focus:ring-red-300' : ''}`} />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('report.incidentDateHint', 'When did you first notice this issue?')}</p>
              </FormField>
            </div>
          )}

          {/* ── Step 2: Location ── */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              {/* Region */}
              <FormField label={t('report.regionLabel', 'Region')} error={errors.region} required>
                <select name="region" value={form.region} onChange={handleChange}
                  className={`input-field ${errors.region ? 'border-red-400 focus:ring-red-300' : ''}`}>
                  <option value="">{t('report.selectRegion', 'Select Region')}</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </FormField>

              {/* Zone & Woreda */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label={t('report.zoneLabel', 'Zone / Sub-city')} name="zone" value={form.zone} onChange={handleChange}
                  placeholder={t('report.zonePlaceholder', 'Zone or Sub-city')} />
                <FormInput label={t('report.woredaLabel', 'Woreda')} name="woreda" value={form.woreda} onChange={handleChange}
                  placeholder={t('report.woredaPlaceholder', 'Woreda')} />
              </div>

              {/* Kebele & City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label={t('report.kebeleLabel', 'Kebele')} name="kebele" value={form.kebele} onChange={handleChange}
                  placeholder={t('report.kebelePlaceholder', 'Kebele')} />
                <FormInput label={t('report.cityLabel', 'City / Town')} name="city" value={form.city} onChange={handleChange}
                  placeholder={t('report.cityPlaceholder', 'City or town')} />
              </div>

              {/* Address */}
              <FormInput label={t('report.addressLabel', 'Street Address')} name="address" value={form.address} onChange={handleChange}
                placeholder={t('report.addressPlaceholder', 'e.g. Bole Road, near Edna Mall')} />

              {/* Specific Location */}
              <FormInput label={t('report.specificLocLabel', 'Specific Location / Landmark')} name="specificLocation" value={form.specificLocation} onChange={handleChange}
                placeholder={t('report.specificLocPlaceholder', 'Nearest landmark, intersection, or building')} />

              {/* GPS Map */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  📍 {t('report.pinMap', 'Pin Location on Map')}
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(optional)</span>
                </label>
                <LocationPicker onLocationSelect={setPosition} position={position} />
                {position && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-green-700 dark:text-green-300 flex-1">
                      {t('dashboard.locationSelected', { lat: position.lat.toFixed(4), lng: position.lng.toFixed(4), defaultValue: `Location: ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` })}
                    </span>
                    <button type="button" onClick={() => setPosition(null)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Evidence ── */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              {/* Photos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  📷 {t('report.photosLabel', 'Photos')}
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(max 5, 10MB each)</span>
                </label>
                <div
                  onClick={() => photoRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
                >
                  <input ref={photoRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                  <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('report.clickToUpload', 'Click to upload photos')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, GIF, WEBP</p>
                </div>
                {photos.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {photos.map((f, i) => (
                      <div key={i} className="relative group">
                        <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-600" />
                        <button type="button" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center shadow">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Videos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  🎬 {t('report.videoLabel', 'Videos')}
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(max 2, 50MB each)</span>
                </label>
                <div
                  onClick={() => videoRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
                >
                  <input ref={videoRef} type="file" accept="video/mp4,video/mov,video/webm" multiple onChange={handleVideoChange} className="hidden" />
                  <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125m1.5 3.75c-.621 0-1.125-.504-1.125-1.125" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('report.clickToUploadVideo', 'Click to upload videos')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">MP4, MOV, WEBM</p>
                </div>
                {videos.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {videos.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2.5 text-xs group">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                        </svg>
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.name}</span>
                        <span className="text-gray-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                        <button type="button" onClick={() => setVideos(p => p.filter((_, j) => j !== i))}
                          className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                {t('infra.evidenceNote', 'Photos and videos help administrators verify and prioritize your report. Evidence is optional but recommended.')}
              </div>
            </div>
          )}
        </div>

        {/* Form Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onClose}
            className="btn-secondary py-2.5 px-5 text-sm order-2 sm:order-1">
            {t('common.cancel', 'Cancel')}
          </button>

          <div className="flex gap-3 flex-1 order-1 sm:order-2 justify-end">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="py-2.5 px-5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                ← {t('common.back', 'Back')}
              </button>
            )}
            {step < 3 ? (
              <button type="button" onClick={() => {
                if (step === 1) {
                  const err = {};
                  if (!form.title.trim()) err.title = 'Title is required';
                  if (!form.category) err.category = 'Category is required';
                  if (!form.description.trim()) err.description = 'Description is required';
                  if (!form.severityLevel) err.severityLevel = 'Severity is required';
                  setErrors(err);
                  if (Object.keys(err).length === 0) setStep(2);
                } else if (step === 2) {
                  const err = {};
                  if (!form.region) err.region = 'Region is required';
                  setErrors(err);
                  if (Object.keys(err).length === 0) setStep(3);
                }
              }}
                className="btn-primary py-2.5 px-6 text-sm">
                {t('common.next', 'Next')} →
              </button>
            ) : (
              <button type="submit" disabled={submitting}
                className="btn-primary py-2.5 px-6 text-sm">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.submitting', 'Submitting...')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    {t('common.submit', 'Submit Report')}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
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

function FormInput({ label, name, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="input-field" />
    </div>
  );
}

function CharCount({ current, max }) {
  const pct = (current / max) * 100;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-yellow-400' : 'bg-primary-400'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${pct > 90 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
        {current}/{max}
      </span>
    </div>
  );
}
