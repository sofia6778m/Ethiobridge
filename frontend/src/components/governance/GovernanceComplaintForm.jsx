import { useState, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { governanceComplaintAPI } from '../../services/api';
import { getWithRetry, isCanceledError, extractList } from '../../utils/requestUtils';
import { useProfileForm } from '../../hooks/useProfileForm';
import useSubcityOptions from '../../hooks/useSubcityOptions';
import FormSection from '../../components/common/FormSection';
import { URGENCY_LEVELS } from './governanceMeta';

const MAX_TOTAL_FILES = 8;
const MAX_FILE_MB = 50;
const TOTAL_MB = 50;

const PHONE_RE = /^(\+?251|0)?9\d{8}$/;

const FILE_ICONS = {
  image: '🖼️',
  video: '🎬',
  audio: '🎧',
  document: '📄',
};

// Module-scope wrapper (stable identity). Defining it inside the component body
// would make React remount it on every keystroke and drop input focus.
const UploadZone = ({ icon, label, hint, fileList, onPick, onRemove, zoneCls = '' }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
    <div
      onClick={onPick}
      className={`border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors ${zoneCls}`}
    >
      <span className="text-2xl">{icon}</span>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
    </div>
    {fileList.length > 0 && (
      <div className="space-y-2 mt-3">
        {fileList.map((f, i) => (
          <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-xs group">
            <span className="text-gray-400">{FILE_ICONS[f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'document']}</span>
            <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.name}</span>
            <span className="text-gray-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
            <button type="button" onClick={() => onRemove(i)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default function GovernanceComplaintForm({ user, onSuccess, submitLabel = 'Submit Complaint', backLink }) {
  // Initialized ONCE from the profile — never re-initialized on re-renders, so
  // the auto-filled contact fields stay editable without losing focus.
  const { form, set, errors, setErrors } = useProfileForm(() => ({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    email: user?.email || '',
    subcity: '',
    woredaId: '',
    officeId: '',
    office: '',
    serviceReceived: '',
    categoryId: '',
    category: '',
    title: '',
    description: '',
    incidentDate: '',
    incidentLocation: '',
    employeesInvolved: '',
    urgencyLevel: 'Medium',
    isAnonymous: false,
    consent: false,
  }));
  // Stable onError identity so useSubcityOptions never aborts/restarts the
  // in-flight subcity request on every keystroke (that left the dropdown stuck
  // on "Loading subcities…").
  const onSubcitiesError = useCallback(
    () => toast.error('Unable to load subcities. Please try again.'),
    []
  );
  const { subcities, subcitiesLoading, subcitiesError, reloadSubcities } = useSubcityOptions({
    onError: onSubcitiesError,
  });
  const [woredas, setWoredas] = useState([]);
  const [offices, setOffices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [images, setImages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [woredasLoading, setWoredasLoading] = useState(false);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  // Inline (non-toast) errors so the dropdowns stay visible and offer retry.
  const [woredasError, setWoredasError] = useState('');
  const [officesError, setOfficesError] = useState('');
  const [categoriesError, setCategoriesError] = useState('');
  const imageRef = useRef(null);
  const documentRef = useRef(null);
  const videoRef = useRef(null);
  const routingReqRef = useRef(null);
  const officeReqRef = useRef(null);
  const loadedSubcityRef = useRef(null);
  const loadedOfficeRef = useRef(null);

  // Resolves a subcity option by its rendered value. Options use `s.value`
  // (which is `_id`, falling back to `id`, then to the name) so the dropdown
  // still works even if a backend omits the id.
  const findSubcityByValue = (value) =>
    (subcities || []).find(
      (s) => s.value === value || s._id === value || s.id === value || s.name === value
    );

  // Loads the woredas + government offices for a selected subcity. Extracted so
  // both the change handler and the inline "Try again" retry can reuse it.
  const fetchRouting = async (subcityRecord) => {
    const subcityId = subcityRecord?._id || subcityRecord?.id || '';
    const subcityName = subcityRecord?.name || '';
    routingReqRef.current?.abort();
    officeReqRef.current?.abort();
    const controller = new AbortController();
    routingReqRef.current = controller;

    setWoredasLoading(true);
    setOfficesLoading(true);
    setWoredasError('');
    setOfficesError('');

    const woredaTask = getWithRetry('/woredas', {
      params: subcityId ? { subcityId } : { subcity: subcityName },
      signal: controller.signal,
      timeout: 10000,
    })
      .then((res) => (controller.signal.aborted ? [] : extractList(res, 'woredas')))
      .catch((err) => {
        if (isCanceledError(err)) return null;
        setWoredasError('Unable to load woredas. Please try again.');
        return null;
      })
      .finally(() => { if (!controller.signal.aborted) setWoredasLoading(false); });

    const officeTask = getWithRetry(subcityId ? `/government-offices/by-subcity/${subcityId}` : '/government-offices', {
      params: subcityId ? undefined : { subcity: subcityName },
      signal: controller.signal,
      timeout: 10000,
    })
      .then((res) => (controller.signal.aborted ? [] : res.data?.data?.offices || []))
      .catch((err) => {
        if (isCanceledError(err)) return null;
        setOfficesError('Unable to load government offices. Please try again.');
        return null;
      })
      .finally(() => { if (!controller.signal.aborted) setOfficesLoading(false); });

    const [woredaList, officeList] = await Promise.all([woredaTask, officeTask]);
    if (controller.signal.aborted) return;
    setWoredas(Array.isArray(woredaList) ? woredaList : []);
    setOffices(Array.isArray(officeList) ? officeList : []);
  };

  // ── Subcity → Woreda + Government Office ─────────────────────────────────────
  const handleSubcityChange = async (subcityValue) => {
    const subcityRecord = findSubcityByValue(subcityValue);

    // Reset every dependent value immediately so no stale data survives a change.
    set('subcity', subcityRecord?.name || '');
    set('woredaId', '');
    set('officeId', '');
    set('office', '');
    set('categoryId', '');
    set('category', '');
    setWoredas([]);
    setOffices([]);
    setCategories([]);
    setWoredasError('');
    setOfficesError('');
    setCategoriesError('');

    // Cleared selection — stop; nothing to load.
    if (!subcityValue) {
      loadedSubcityRef.current = null;
      return;
    }
    // Validate the selected subcity exists before making any request.
    if (!subcityRecord || !subcityRecord.name) {
      toast.error('Please choose a valid subcity.');
      return;
    }
    // Prevent duplicate requests when the same subcity is re-selected.
    const loadKey = subcityRecord._id || subcityRecord.id || subcityRecord.name.toLowerCase();
    if (loadedSubcityRef.current === loadKey) return;
    loadedSubcityRef.current = loadKey;

    await fetchRouting(subcityRecord);
  };

  // Loads the complaint categories for a selected office. Extracted so both the
  // change handler and the inline "Try again" retry can reuse it.
  const fetchCategories = async (officeId) => {
    officeReqRef.current?.abort();
    const controller = new AbortController();
    officeReqRef.current = controller;
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const res = await getWithRetry('/complaint-categories', {
        params: { officeId },
        signal: controller.signal,
        timeout: 10000,
      });
      if (controller.signal.aborted) return;
      const list = res.data?.data?.categories || res.data?.categories || [];
      setCategories(Array.isArray(list) ? list : []);
    } catch (err) {
      if (!isCanceledError(err)) setCategoriesError('Unable to load complaint categories. Please try again.');
    } finally {
      if (!controller.signal.aborted) setCategoriesLoading(false);
    }
  };

  // ── Government Office → Complaint Categories ─────────────────────────────────
  const handleOfficeChange = async (officeId) => {
    const office = offices.find((o) => o._id === officeId);
    set('officeId', officeId);
    set('office', office?.name || '');
    set('categoryId', '');
    set('category', '');
    setCategories([]);
    setCategoriesError('');
    if (!officeId) {
      loadedOfficeRef.current = null;
      return;
    }
    if (!office || !office._id) {
      toast.error('Please choose a valid government office.');
      return;
    }
    // Prevent duplicate requests when the same office is re-selected.
    if (loadedOfficeRef.current === office._id) return;
    loadedOfficeRef.current = office._id;

    await fetchCategories(office._id);
  };

  const handleWoredaChange = (woredaId) => {
    set('woredaId', woredaId);
  };

  const allFiles = [...images, ...documents, ...videos];

  const addFiles = (existing, newFiles) => {
    const remaining = MAX_TOTAL_FILES - allFiles.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_TOTAL_FILES} files in total`);
      return null;
    }
    const oversized = newFiles.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized) { toast.error(`${oversized.name} exceeds ${MAX_FILE_MB}MB limit`); return null; }
    const totalSize = [...allFiles, ...newFiles].reduce((acc, f) => acc + f.size, 0);
    if (totalSize > TOTAL_MB * 1024 * 1024) { toast.error(`Total upload size cannot exceed ${TOTAL_MB}MB`); return null; }
    return [...existing, ...newFiles].slice(0, remaining + existing.length);
  };

  const handleImages = (e) => {
    const list = Array.from(e.target.files || []);
    const bad = list.find((f) => !f.type.startsWith('image/'));
    if (bad) { toast.error(`${bad.name} is not an image`); return; }
    const next = addFiles(images, list);
    if (next) setImages(next);
    e.target.value = '';
  };

  const handleDocuments = (e) => {
    const list = Array.from(e.target.files || []);
    const bad = list.find((f) => !/application\/pdf|text\/|word|document/.test(f.type));
    if (bad) { toast.error(`${bad.name} is not a document (PDF, DOC, DOCX)`); return; }
    const next = addFiles(documents, list);
    if (next) setDocuments(next);
    e.target.value = '';
  };

  const handleVideos = (e) => {
    const list = Array.from(e.target.files || []);
    const bad = list.find((f) => !f.type.startsWith('video/'));
    if (bad) { toast.error(`${bad.name} is not a video`); return; }
    const next = addFiles(videos, list);
    if (next) setVideos(next);
    e.target.value = '';
  };

  const removeFile = (kind, idx) => {
    if (kind === 'image') setImages((p) => p.filter((_, i) => i !== idx));
    if (kind === 'document') setDocuments((p) => p.filter((_, i) => i !== idx));
    if (kind === 'video') setVideos((p) => p.filter((_, i) => i !== idx));
  };

  const validate = () => {
    const err = {};
    if (!form.isAnonymous && !form.fullName.trim()) err.fullName = 'Full name is required';
    else if (!form.isAnonymous && form.fullName.trim().length < 3) err.fullName = 'Full name must be at least 3 characters';
    if (!form.phone.trim()) err.phone = 'Phone number is required';
    else if (!PHONE_RE.test(form.phone.replace(/\s+/g, ''))) err.phone = 'Enter a valid Ethiopian phone number (e.g. 0911 234 567)';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) err.email = 'Enter a valid email';
    if (!form.subcity) err.subcity = 'Subcity is required';
    if (!form.woredaId) err.woreda = 'Woreda is required';
    if (!form.officeId) err.office = 'Government office is required';
    if (!form.serviceReceived.trim()) err.serviceReceived = 'Service received is required';
    if (!form.categoryId) err.category = 'Governance issue category is required';
    if (!form.title.trim()) err.title = 'Complaint title is required';
    else if (form.title.trim().length < 3) err.title = 'Title must be at least 3 characters';
    if (!form.description.trim()) err.description = 'Description is required';
    else if (form.description.trim().length < 10) err.description = 'Description must be at least 10 characters';
    if (!form.incidentDate) err.incidentDate = 'Incident date is required';
    if (!form.incidentLocation.trim()) err.incidentLocation = 'Incident location is required';
    if (!form.consent) err.consent = 'You must agree to the reporting terms to continue';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the errors below');
      return;
    }
    const fd = new FormData();
    fd.append('categoryId', form.categoryId);
    fd.append('category', form.category);
    fd.append('title', form.title.trim());
    fd.append('description', form.description.trim());
    fd.append('incidentDate', form.incidentDate);
    fd.append('incidentLocation', form.incidentLocation.trim());
    if (form.employeesInvolved.trim()) fd.append('employeesInvolved', form.employeesInvolved.trim());
    fd.append('serviceReceived', form.serviceReceived.trim());
    fd.append('urgencyLevel', form.urgencyLevel);
    fd.append('subcity', form.subcity);
    fd.append('woredaId', form.woredaId);
    fd.append('officeId', form.officeId);
    fd.append('office', form.office);
    fd.append('isAnonymous', String(form.isAnonymous));
    fd.append('consent', String(form.consent));
    fd.append('phone', form.phone.replace(/\s+/g, ''));
    if (!form.isAnonymous) {
      if (form.fullName.trim()) fd.append('fullName', form.fullName.trim());
      if (form.email.trim()) fd.append('email', form.email.trim());
    }
    allFiles.forEach((f) => fd.append('evidence', f));

    setLoading(true);
    try {
      const res = await governanceComplaintAPI.create(fd);
      const complaint = res.data.data;
      toast.success(`Complaint submitted! Tracking ID: ${complaint.trackingId}`);
      onSuccess?.(complaint);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (key) => `input-field ${errors[key] ? 'border-red-400 focus:ring-red-300' : ''}`;
  const fieldError = (key) => errors[key] && (
    <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 flex items-center gap-1">⚠ {errors[key]}</p>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="card overflow-hidden space-y-6 animate-fade-in">
      {/* Form header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 text-white px-5 sm:px-6 py-5">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-6 -right-6 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white rounded-full" />
        </div>
        <div className="relative z-10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>⚖️</span> Submit Governance Complaint
          </h2>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1">
            For issues with government offices and public services. Routed to the Subcity Governance Office — fields marked with * are required.
          </p>
        </div>
      </div>

      <div className="px-5 sm:px-6 pb-6 space-y-6">
        {/* ── Citizen Information ── */}
        <FormSection icon="👤" title="Citizen Information" subtitle="Your contact details — auto-filled from your account, edit if needed">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name {!form.isAnonymous && <span className="text-red-500">*</span>}</label>
              <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
                placeholder="Your full name"
                className={inputCls('fullName')} />
              {fieldError('fullName')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone Number <span className="text-red-500">*</span></label>
              <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="+251 9XX XXX XXX" className={inputCls('phone')} />
              {fieldError('phone')}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="you@email.com" className={inputCls('email')} />
              {fieldError('email')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Subcity <span className="text-red-500">*</span></label>
              <select
                value={form.subcity ? (subcities.find((s) => s.name === form.subcity)?.value || '') : ''}
                onChange={(e) => handleSubcityChange(e.target.value)}
                className={inputCls('subcity')}>
                <option value="">{subcitiesLoading ? 'Loading subcities…' : 'Select Subcity'}</option>
                {(subcities || []).map((s) => <option key={s.value} value={s.value}>{s.name}</option>)}
              </select>
              {subcitiesError && (
                <div className="flex items-center gap-2 mt-1.5">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">⚠ {subcitiesError}</p>
                  <button type="button" onClick={reloadSubcities}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Try again
                  </button>
                </div>
              )}
              {fieldError('subcity')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Woreda <span className="text-red-500">*</span></label>
              <select value={form.woredaId} onChange={(e) => handleWoredaChange(e.target.value)}
                disabled={!form.subcity || woredasLoading} className={`${inputCls('woreda')} disabled:opacity-60`}>
                <option value="">
                  {woredasLoading ? 'Loading woredas…' : form.subcity ? 'Select Woreda' : 'Select a subcity first'}
                </option>
                {(woredas || []).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              {woredasError && (
                <div className="flex items-center gap-2 mt-1.5">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">⚠ {woredasError}</p>
                  <button type="button" onClick={() => fetchRouting(findSubcityByValue(form.subcity))}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Try again
                  </button>
                </div>
              )}
              {fieldError('woreda')}
            </div>
          </div>
        </FormSection>

        {/* ── Government Office ── */}
        <FormSection icon="🏛️" title="Government Office" subtitle="Which office / bureau and which service is involved">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Office / Bureau <span className="text-red-500">*</span></label>
              <select value={form.officeId} onChange={(e) => handleOfficeChange(e.target.value)}
                disabled={!form.subcity || officesLoading} className={`${inputCls('office')} disabled:opacity-60`}>
                <option value="">
                  {officesLoading ? 'Loading offices…' : form.subcity ? (offices.length ? 'Select Office / Bureau' : 'No offices available') : 'Select a subcity first'}
                </option>
                {(offices || []).map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
              </select>
              {officesError && (
                <div className="flex items-center gap-2 mt-1.5">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">⚠ {officesError}</p>
                  <button type="button" onClick={() => fetchRouting(findSubcityByValue(form.subcity))}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Try again
                  </button>
                </div>
              )}
              {fieldError('office')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Service Received <span className="text-red-500">*</span></label>
              <input value={form.serviceReceived} onChange={(e) => set('serviceReceived', e.target.value)}
                placeholder="e.g. Business license, Land certificate, ID renewal…"
                className={inputCls('serviceReceived')} />
              {fieldError('serviceReceived')}
            </div>
          </div>
        </FormSection>

        {/* ── Governance Issue Category ── */}
        <FormSection icon="⚖️" title="Governance Issue Category" subtitle="Choose the category that best describes the issue">
          {!form.officeId ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a government office first to see its complaint categories.</p>
          ) : (
            <>
              {categoriesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> Loading categories…
                </div>
              ) : categories.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">This office has no active complaint categories yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(categories || []).map((c) => (
                    <button key={c._id} type="button" onClick={() => set('categoryId', c._id)}
                      className={`text-left px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-150
                        ${form.categoryId === c._id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 ring-2 ring-emerald-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-emerald-300 dark:hover:border-emerald-600 bg-white dark:bg-gray-800'
                        }`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {categoriesError && (
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">⚠ {categoriesError}</p>
                  <button type="button" onClick={() => fetchCategories(form.officeId)}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Try again
                  </button>
                </div>
              )}
            </>
          )}
          {fieldError('category')}
        </FormSection>

        {/* ── Complaint Details ── */}
        <FormSection icon="📝" title="Complaint Details" subtitle="Describe what happened in as much detail as possible">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Complaint Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200}
              placeholder="e.g. Business license application delayed for 6 months" className={inputCls('title')} />
            <div className="flex items-center justify-between mt-1">
              {fieldError('title')}
              <span className={`text-[10px] ml-auto ${form.title.length > 180 ? 'text-red-500' : 'text-gray-400'}`}>{form.title.length}/200</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description <span className="text-red-500">*</span></label>
            <textarea rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={5000}
              placeholder="Describe what happened, the people involved, and any steps already taken…"
              className={`${inputCls('description')} resize-none`} />
            <div className="flex items-center justify-between mt-1">
              {fieldError('description')}
              <span className={`text-[10px] ml-auto ${form.description.length > 4500 ? 'text-red-500' : 'text-gray-400'}`}>{form.description.length}/5000</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Incident Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.incidentDate} onChange={(e) => set('incidentDate', e.target.value)}
                max={new Date().toISOString().split('T')[0]} className={inputCls('incidentDate')} />
              {fieldError('incidentDate')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Incident Location <span className="text-red-500">*</span></label>
              <input value={form.incidentLocation} onChange={(e) => set('incidentLocation', e.target.value)}
                placeholder="e.g. Bole Woreda 02 Office, 2nd floor" className={inputCls('incidentLocation')} />
              {fieldError('incidentLocation')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Employees Involved <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={form.employeesInvolved} onChange={(e) => set('employeesInvolved', e.target.value)}
                placeholder="Names or positions, if known" className="input-field" />
            </div>
          </div>
        </FormSection>

        {/* ── Evidence ── */}
        <FormSection icon="📎" title="Evidence" subtitle={`Photos, documents and videos (up to ${MAX_TOTAL_FILES} files, ${MAX_FILE_MB}MB each)`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UploadZone icon="🖼️" label="Upload Images" hint="Click to upload photos (JPG, PNG)" fileList={images}
              onPick={() => imageRef.current?.click()} onRemove={(i) => removeFile('image', i)} />
            <UploadZone icon="📄" label="Upload Documents" hint="Click to upload PDF, DOC, DOCX" fileList={documents}
              onPick={() => documentRef.current?.click()} onRemove={(i) => removeFile('document', i)} />
            <UploadZone icon="🎬" label="Upload Videos" hint="Click to upload video files" fileList={videos}
              onPick={() => videoRef.current?.click()} onRemove={(i) => removeFile('video', i)} />
          </div>
          <input ref={imageRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
          <input ref={documentRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple className="hidden" onChange={handleDocuments} />
          <input ref={videoRef} type="file" accept="video/mp4,video/mov,video/webm" multiple className="hidden" onChange={handleVideos} />
          {allFiles.length > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{allFiles.length}/{MAX_TOTAL_FILES} file(s) selected</p>
          )}
        </FormSection>

        {/* ── Additional Options ── */}
        <FormSection icon="🔒" title="Additional Options" subtitle="How you want to submit and how urgent this is">
          {/* Anonymous */}
          <div className="flex items-center justify-between gap-3 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Submit anonymously</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Your name and email are not shared with the investigating office. Your phone is still kept so you can track the complaint.</p>
            </div>
            <input type="checkbox" checked={form.isAnonymous} onChange={(e) => set('isAnonymous', e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Urgency Level <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {URGENCY_LEVELS.map((l) => (
                <button key={l.value} type="button" onClick={() => set('urgencyLevel', l.value)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-center
                    ${form.urgencyLevel === l.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 ring-2 ring-emerald-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-emerald-300 dark:hover:border-emerald-600 bg-white dark:bg-gray-800'
                    }`}>
                  <span className="block text-base mb-0.5">{l.emoji}</span>
                  <span className="block">{l.value}</span>
                  <span className="block text-[10px] font-normal opacity-70 mt-0.5">{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Consent */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Consent to reporting terms <span className="text-red-500">*</span></p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">I confirm this information is accurate and consent to the Subcity Governance Office investigating it. I may receive SMS/email updates about my complaint.</p>
              </div>
            </label>
            {fieldError('consent')}
          </div>
        </FormSection>

        {/* Submit bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
          {backLink}
          <button type="submit" disabled={loading} className="btn-primary px-8 py-3 text-sm">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…
              </span>
            ) : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
