import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { municipalComplaintAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError, extractList } from '../../../utils/requestUtils';

const PRIORITIES = ['Low', 'Medium', 'High'];
const MAX_VIDEOS = 3;
const MAX_VIDEO_MB = 50;

export default function MunicipalComplaintForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    password: '',
    phone: user?.phone || '',
    subcity: '',
    woredaId: '',
    woredaName: '',
    department: '',
    issueType: '',
    title: '',
    description: '',
    priority: 'Medium',
    locationText: '',
    latitude: '',
    longitude: '',
  });
  const [errors, setErrors] = useState({});
  const [subcities, setSubcities] = useState([]);
  const [subcitiesLoading, setSubcitiesLoading] = useState(true);
  const [subcitiesError, setSubcitiesError] = useState('');
  const [woredas, setWoredas] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoCoding, setGeoCoding] = useState(false);
  const [woredasLoading, setWoredasLoading] = useState(false);
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const woredaReqRef = useRef(null);
  const loadedSubcityRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setSubcitiesLoading(true);
    setSubcitiesError('');
    getWithRetry('/public/subcities', { signal: controller.signal, timeout: 10000 })
      .then((res) => {
        if (cancelled) return;
        setSubcities(extractList(res, 'subcities'));
      })
      .catch((err) => {
        if (cancelled || isCanceledError(err)) return;
        setSubcitiesError('Unable to load subcities. Please try again.');
        toast.error('Unable to load subcities. Please try again.');
      })
      .finally(() => { if (!cancelled) setSubcitiesLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubcityChange = async (subcity) => {
    woredaReqRef.current?.abort();
    const controller = new AbortController();
    woredaReqRef.current = controller;
    set('subcity', subcity);
    set('woredaId', '');
    set('woredaName', '');
    set('department', '');
    set('issueType', '');
    setWoredas([]);
    setTemplates([]);
    if (!subcity) return;
    // Prevent duplicate requests when the same subcity is re-selected.
    if (loadedSubcityRef.current === subcity) return;
    loadedSubcityRef.current = subcity;
    setWoredasLoading(true);
    try {
      const res = await getWithRetry('/public-complaints/subcity-woredas', {
        params: { subcity },
        signal: controller.signal,
        timeout: 10000,
      });
      if (controller.signal.aborted) return;
      const list = Array.isArray(res.data?.woredas) ? res.data.woredas : [];
      setWoredas(list);

      // Department options come from the subcity's own department master data,
      // so submissions always route to a department that exists in the subcity.
      // Falls back to the woreda's static list when the subcity has none yet.
      let subcityDepts = [];
      try {
        const deptRes = await getWithRetry('/public/departments', {
          params: { subcity },
          signal: controller.signal,
          timeout: 10000,
        });
        if (!controller.signal.aborted) {
          subcityDepts = (Array.isArray(deptRes.data?.departments) ? deptRes.data.departments : []).map((d) => d.name || d);
        }
      } catch {
        /* keep woreda fallback below */
      }
      if (controller.signal.aborted) return;
      const deptList = subcityDepts.length ? subcityDepts : (list[0]?.departments || []);
      setDepartments(deptList);
      if (deptList.length) {
        const d = deptList[0];
        set('department', d);
        loadTemplates('Woreda', d);
      }
    } catch (err) {
      if (!isCanceledError(err)) toast.error('Unable to load woredas. Please try again.');
    } finally {
      if (!controller.signal.aborted) setWoredasLoading(false);
    }
  };

  const loadTemplates = async (level, department) => {
    try {
      const res = await municipalComplaintAPI.getIssueTemplates({ level, department });
      setTemplates(res.data.templates || []);
    } catch (err) {
      setTemplates([]);
    }
  };

  const handleDepartmentChange = (department) => {
    set('department', department);
    set('issueType', '');
    loadTemplates('Woreda', department);
  };

  const handleWoredaChange = (woredaId) => {
    const w = woredas.find(x => x._id === woredaId);
    set('woredaId', woredaId);
    set('woredaName', w ? w.name : '');
    set('department', '');
    set('issueType', '');
    setTemplates([]);
    if (!departments.length && w && w.departments && w.departments.length) {
      setDepartments(w.departments);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser');
      return;
    }
    setGeoCoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set('latitude', pos.coords.latitude.toFixed(6));
        set('longitude', pos.coords.longitude.toFixed(6));
        setGeoCoding(false);
        toast.success('GPS location captured');
      },
      () => { setGeoCoding(false); toast.error('Could not capture GPS location'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onPhotosChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 6);
    setPhotos(files);
  };

  const onVideosChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_VIDEOS);
    const tooBig = files.some(f => f.size > MAX_VIDEO_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`Each video must be under ${MAX_VIDEO_MB}MB`);
      return;
    }
    setVideos(files);
  };

  const validate = () => {
    const err = {};
    if (!form.fullName.trim()) err.fullName = 'Full name is required';
    if (!form.email.trim()) err.email = 'Email is required';
    if (!form.password) err.password = 'Password is required';
    if (!form.phone.trim()) err.phone = 'Phone number is required';
    if (!form.subcity) err.subcity = 'Subcity is required';
    if (!form.woredaId) err.woredaId = 'Woreda is required';
    if (!form.department) err.department = 'Department is required';
    if (!form.issueType) err.issueType = 'Issue type is required';
    if (!form.title.trim()) err.title = 'Issue title is required';
    if (form.description.trim().length < 10) err.description = 'Description must be at least 10 characters';
    if (!form.priority) err.priority = 'Issue priority is required';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('description', form.description.trim());
    fd.append('issueType', form.issueType);
    fd.append('issueLevel', 'Woreda');
    fd.append('priority', form.priority);
    fd.append('subcity', form.subcity);
    fd.append('woredaId', form.woredaId);
    fd.append('department', form.department);
    fd.append('locationText', form.locationText.trim());
    if (form.latitude) fd.append('latitude', form.latitude);
    if (form.longitude) fd.append('longitude', form.longitude);
    fd.append('reporterName', form.fullName.trim());
    fd.append('reporterEmail', form.email.trim());
    fd.append('reporterPhone', form.phone.replace(/\s+/g, ''));
    fd.append('password', form.password);
    photos.forEach(p => fd.append('media', p));
    videos.forEach(v => fd.append('media', v));

    setLoading(true);
    try {
      const res = await municipalComplaintAPI.create(fd);
      const complaint = res.data.data;
      toast.success(`Complaint submitted! Tracking ID: ${complaint.trackingId}`);
      navigate(`/dashboard/citizen/municipal-complaints/${complaint._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (key) => `input-field ${errors[key] ? 'border-red-400' : ''}`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/dashboard/citizen/municipal-complaints"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 transition-colors">
          ← Back to my complaints
        </Link>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Submit a Municipal Complaint</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your complaint is routed automatically to the Woreda / Subcity / Department. Fields marked * are required.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="card p-5 sm:p-6 space-y-5">
        {/* Contact */}
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Your details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
              <input value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Your full name" className={inputCls('fullName')} />
              {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" className={inputCls('email')} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Your account password" className={inputCls('password')} />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number *</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="e.g. 0911 234 567" className={inputCls('phone')} />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>
          </div>
        </div>

        {/* Location & routing */}
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Location & routing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subcity *</label>
              <select value={form.subcity} onChange={e => handleSubcityChange(e.target.value)} className={inputCls('subcity')}>
                <option value="">{subcitiesLoading ? 'Loading subcities…' : 'Select subcity…'}</option>
                {(subcities || []).map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
              </select>
              {subcitiesError && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠ {subcitiesError}</p>}
              {errors.subcity && <p className="text-xs text-red-500 mt-1">{errors.subcity}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Woreda *</label>
              <select value={form.woredaId} onChange={e => handleWoredaChange(e.target.value)} disabled={!form.subcity || woredasLoading} className={inputCls('woredaId')}>
                <option value="">{woredasLoading ? 'Loading woredas…' : form.subcity ? 'Select woreda…' : 'Select a subcity first'}</option>
                {(woredas || []).map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              {errors.woredaId && <p className="text-xs text-red-500 mt-1">{errors.woredaId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department *</label>
              <select value={form.department} onChange={e => handleDepartmentChange(e.target.value)} disabled={!form.woredaId} className={inputCls('department')}>
                <option value="">{form.woredaId ? 'Select department…' : 'Select a woreda first'}</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issue Type *</label>
              <select value={form.issueType} onChange={e => set('issueType', e.target.value)} disabled={!form.department} className={inputCls('issueType')}>
                <option value="">{form.department ? 'Select issue type…' : 'Select a department first'}</option>
                {templates.map(t => <option key={t._id} value={t.name}>{t.name}</option>)}
              </select>
              {errors.issueType && <p className="text-xs text-red-500 mt-1">{errors.issueType}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location (text)</label>
              <input value={form.locationText} onChange={e => set('locationText', e.target.value)} placeholder="e.g. In front of Bole Mini Market, near street light #12" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude (optional)</label>
              <input value={form.latitude} onChange={e => set('latitude', e.target.value)} placeholder="e.g. 8.9806034" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude (optional)</label>
              <input value={form.longitude} onChange={e => set('longitude', e.target.value)} placeholder="e.g. 38.7577605" className="input-field" />
            </div>
          </div>
          <button type="button" onClick={useMyLocation} disabled={geoCoding}
            className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50">
            {geoCoding ? 'Capturing location…' : '📍 Use my GPS location'}
          </button>
        </div>

        {/* Issue details */}
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Issue details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issue Title *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Brief title of the issue" className={inputCls('title')} />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issue Priority *</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls('priority')}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.priority && <p className="text-xs text-red-500 mt-1">{errors.priority}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
              <textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the issue in detail…" className={`input-field ${errors.description ? 'border-red-400' : ''}`} />
              {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
            </div>
          </div>
        </div>

        {/* Media */}
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Evidence</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card bg-gray-50 dark:bg-gray-800/40 border border-dashed p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photos (up to 6)</p>
              <p className="text-xs text-gray-500 mb-2">{photos.length ? `${photos.length} selected` : 'No photos selected'}</p>
              <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={onPhotosChange} />
              <button type="button" onClick={() => photoRef.current?.click()} className="btn-secondary text-sm">Choose photos</button>
            </div>
            <div className="card bg-gray-50 dark:bg-gray-800/40 border border-dashed p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Videos (up to {MAX_VIDEOS}, max {MAX_VIDEO_MB}MB each)</p>
              <p className="text-xs text-gray-500 mb-2">{videos.length ? `${videos.length} selected` : 'No videos selected'}</p>
              <input ref={videoRef} type="file" accept="video/mp4,video/mov,video/webm" multiple className="hidden" onChange={onVideosChange} />
              <button type="button" onClick={() => videoRef.current?.click()} className="btn-secondary text-sm">Choose videos</button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to="/dashboard/citizen/municipal-complaints" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Submitting…' : 'Submit Complaint'}
          </button>
        </div>
      </form>
    </div>
  );
}
