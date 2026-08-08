import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'react-toastify';
import { useAuth } from '../../../context/AuthContext';
import { alertAPI, publicAPI } from '../../../services/api';
import {
  ALERT_SEVERITIES,
  SEVERITY_STYLES,
  STATUS_STYLES,
  getCategoryBadge,
} from '../../../utils/alertMeta';
import { getActiveCity, SUBCITIES } from '../../../utils/addisAbabaGeo';
import { SubcityBoundaries, WoredaBoundaries, CityMaskLayer, AddisAbabaBoundary } from '../../../components/map/BoundaryLayers';
import {
  validatePublishWindow,
  parseLocalAsAddis,
  toAddisInputValue,
  formatAddis,
} from '../../../utils/alertDateTime';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

const GLOBAL_ROLES = ['admin', 'ADMIN', 'government'];
const SUB_CITY_ROLES = ['subcity_admin', 'SUBCITY_HEAD', 'SUBCITY_ADMIN'];
const WOREDA_ROLES = ['woreda', 'woreda_admin', 'WOREDA_HEAD', 'WOREDA_ADMIN', 'department', 'DEPARTMENT_ADMIN'];

const SUB_CITY_ROLE_NAMES = {
  subcity_bole: 'Bole',
  subcity_yeka: 'Yeka',
  subcity_lemmi_kura: 'Lemmi Kura',
};

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Map multer error codes to human-readable messages.
const uploadErrorMessage = (code) =>
  ({
    LIMIT_FILE_SIZE: `Each file must be under ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    LIMIT_FILE_COUNT: `Maximum ${MAX_FILES} attachments allowed`,
    LIMIT_UNEXPECTED_FILE: 'Unexpected file upload — only JPG, PNG or PDF attachments are allowed',
  })[code] || null;

const normalizeKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const subcityKeyFor = (name) =>
  SUBCITIES.find((sc) => normalizeKey(sc.name) === normalizeKey(name))?.key || null;
const woredaIndexFor = (name) => {
  const m = String(name || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) - 1 : null;
};

function TargetMap({ scope, subcityNames, woredas }) {
  const activeCity = getActiveCity();
  const cityWide = scope === 'all';
  const keys = cityWide ? [] : subcityNames.map(subcityKeyFor).filter(Boolean);
  const woredaHighlights = (woredas || [])
    .map((w) => ({ subcity: subcityKeyFor(w.subcity), index: woredaIndexFor(w.name) }))
    .filter((h) => h.subcity && h.index != null);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 h-72">
      <MapContainer
        center={activeCity.center}
        zoom={activeCity.defaultZoom}
        minZoom={activeCity.defaultZoom}
        maxZoom={17}
        maxBounds={L.latLngBounds(
          [activeCity.bounds.south, activeCity.bounds.west],
          [activeCity.bounds.north, activeCity.bounds.east],
        )}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CityMaskLayer />
        <AddisAbabaBoundary />
        {keys.length === 0
          ? <SubcityBoundaries selectedKey={null} />
          : keys.map((k) => <SubcityBoundaries key={k} selectedKey={k} />)}
        {woredaHighlights.map((h, i) => (
          <WoredaBoundaries key={i} selectedKey={h.subcity} selectedIndex={h.index} />
        ))}
      </MapContainer>
      <div className="absolute bottom-2 right-2 bg-white/90 dark:bg-gray-900/80 text-[10px] font-medium px-2 py-1 rounded-lg shadow text-gray-700 dark:text-gray-300">
        {cityWide ? 'Addis Ababa — city-wide' : 'Illustrative highlight only'}
      </div>
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
        <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>
      )}
    </div>
  );
}

export default function PublicAlertForm({ onSuccess, homePath: homePathProp }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { user } = useAuth();

  // `?edit=<id>` mounts the form in edit mode: the alert is loaded and prefilled,
  // and submit calls alertAPI.update instead of alertAPI.create. Editing never
  // changes the alert's status — publishing is handled by the list actions.
  const editId = searchParams.get('edit') || null;

  const role = user?.role;
  const isGlobal = GLOBAL_ROLES.includes(role);
  const isSubcityAdmin = !isGlobal && (role?.startsWith('subcity_') || SUB_CITY_ROLES.includes(role));
  const isWoredaAdmin = !isGlobal && !isSubcityAdmin && WOREDA_ROLES.includes(role);
  const lockedSubcity = user?.subcity || SUB_CITY_ROLE_NAMES[role] || '';
  const lockedWoreda = user?.woredaName || '';

  const defaultHomePath = ['admin', 'ADMIN'].includes(role)
    ? '/dashboard/admin/alerts'
    : role === 'government'
      ? '/dashboard/government/alerts'
      : '/dashboard/alerts';
  const homePath = homePathProp || defaultHomePath;

  const initialScope = isGlobal ? 'all' : 'woreda';

  const [form, setForm] = useState({
    title: '',
    category: '',
    severity: '',
    description: '',
    scope: initialScope,
    subcityIds: [],
    subcityNames: [],
    woredas: [], // [{ id, name, subcity }]
    startAt: '', // empty → publish immediately
    endAt: '', // empty → alert stays active (optional expiry)
    emergencyContact: '',
    sourceAuthority: '',
    files: [],
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editStatus, setEditStatus] = useState(null);
  const [serverNow, setServerNow] = useState(null);
  const [subcities, setSubcities] = useState([]);
  const [woredasBySubcity, setWoredasBySubcity] = useState({});
  const [loadingWoredas, setLoadingWoredas] = useState(false);

  const set = useCallback((key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  }, []);

  // Fetch the real server clock so validation never depends on a stale or
  // skewed browser clock. It is re-fetched right before every submit/preview.
  const fetchServerTime = useCallback(async () => {
    try {
      const res = await publicAPI.getServerTime();
      const now = new Date(res.data?.now);
      if (!Number.isNaN(now.getTime())) {
        setServerNow(now);
        return now;
      }
    } catch {
      // Fall back to the browser clock — the backend re-validates anyway.
    }
    return new Date();
  }, []);

  useEffect(() => {
    fetchServerTime();
  }, [fetchServerTime]);

  // `datetime-local` values ("YYYY-MM-DDTHH:mm") are interpreted as wall time
  // in Africa/Addis_Ababa and converted to UTC instants for validation/sending.
  const startDate = parseLocalAsAddis(form.startAt);
  const endDate = parseLocalAsAddis(form.endAt);
  const effectiveNow = serverNow instanceof Date && !Number.isNaN(serverNow.getTime())
    ? serverNow
    : new Date();
  const minStart = toAddisInputValue(effectiveNow);
  const minEnd = startDate ? toAddisInputValue(startDate) : minStart;

  useEffect(() => {
    publicAPI.getSubcities()
      .then((res) => setSubcities(res.data?.subcities || []))
      .catch(() => setSubcities([]));
  }, []);

  // Subcity admin — load the woredas of their locked subcity up front.
  useEffect(() => {
    if (!isSubcityAdmin || !lockedSubcity) return;
    publicAPI.getSubcityWoredas(lockedSubcity)
      .then((res) => {
        const list = res.data?.woredas || [];
        setWoredasBySubcity((p) => ({ ...p, [normalizeKey(lockedSubcity)]: list }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubcityAdmin, lockedSubcity]);

  const loadWoredas = useCallback((subcityName) => {
    const key = normalizeKey(subcityName);
    if (!key || woredasBySubcity[key]) return;
    setLoadingWoredas(true);
    publicAPI.getSubcityWoredas(subcityName)
      .then((res) => {
        const list = res.data?.woredas || [];
        setWoredasBySubcity((p) => ({ ...p, [key]: list }));
      })
      .catch(() => setWoredasBySubcity((p) => ({ ...p, [key]: [] })))
      .finally(() => setLoadingWoredas(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woredasBySubcity]);

  // Edit mode — load the alert once and prefill every field from it.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    setLoadingEdit(true);
    alertAPI.getManaged(editId)
      .then((res) => {
        const a = res.data?.data?.alert;
        if (!a || cancelled) return;
        const scNames = (a.subcityNames?.length ? a.subcityNames : a.subcityName ? [a.subcityName] : []);
        const wNames = (a.woredaNames?.length ? a.woredaNames : a.woredaName ? [a.woredaName] : []);
        const wIds = (a.woredaIds?.length ? a.woredaIds : a.woredaId ? [a.woredaId] : []);
        const subcityForWoreda = scNames[0] || lockedSubcity || '';
        const start = a.schedule?.startAt || a.scheduledAt || null;
        const end = a.schedule?.endAt || a.expiresAt || null;

        setEditStatus(a.status || null);
        setForm((p) => ({
          ...p,
          title: a.title || '',
          category: a.category || '',
          severity: a.severity || '',
          description: a.description || '',
          scope: isGlobal ? (a.scope || 'all') : p.scope,
          subcityIds: a.subcityIds || [],
          subcityNames: scNames,
          woredas: wNames.map((name, i) => ({ id: wIds[i], name, subcity: subcityForWoreda })),
          startAt: start ? toAddisInputValue(new Date(start)) : '',
          endAt: end ? toAddisInputValue(new Date(end)) : '',
          emergencyContact: a.emergencyContact || '',
          sourceAuthority: a.sourceAuthority || '',
        }));
        // Load the woreda lists for the targeted subcities so their checkboxes render.
        if (isGlobal) scNames.forEach((sn) => loadWoredas(sn));
      })
      .catch(() => toast.error('Failed to load alert for editing'))
      .finally(() => { if (!cancelled) setLoadingEdit(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const toggleSubcity = (sc) => {
    const has = form.subcityIds.includes(sc._id);
    const subcityIds = has ? form.subcityIds.filter((x) => x !== sc._id) : [...form.subcityIds, sc._id];
    const subcityNames = has ? form.subcityNames.filter((x) => x !== sc.name) : [...form.subcityNames, sc.name];
    let woredas = form.woredas;
    if (has) woredas = form.woredas.filter((w) => normalizeKey(w.subcity) !== normalizeKey(sc.name));
    if (!has && form.scope === 'woreda') loadWoredas(sc.name);
    setForm((p) => ({ ...p, subcityIds, subcityNames, woredas }));
  };

  const toggleWoreda = (w, subcityName) => {
    setForm((p) => {
      const has = p.woredas.some((x) => x.id === w._id);
      return {
        ...p,
        woredas: has
          ? p.woredas.filter((x) => x.id !== w._id)
          : [...p.woredas, { id: w._id, name: w.name, subcity: subcityName }],
      };
    });
    setErrors((p) => { const n = { ...p }; delete n.target; return n; });
  };

  const selectedSubcityNames = isGlobal
    ? form.subcityNames
    : (lockedSubcity ? [lockedSubcity] : form.subcityNames);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).slice(0, MAX_FILES - form.files.length);
    set('files', [...form.files, ...incoming]);
  };

  const removeFile = (i) => {
    set('files', form.files.filter((_, idx) => idx !== i));
  };

  const validate = (status = 'published', now = effectiveNow) => {
    const err = {};
    if (!form.title.trim()) err.title = 'Alert title is required';
    else if (form.title.length > 200) err.title = 'Title must be under 200 characters';
    // Category is OPTIONAL — empty is always valid, no error is ever shown.
    if (!form.severity) err.severity = 'Severity is required';
    if (!form.description.trim()) err.description = 'Description is required';
    else if (form.description.length > 5000) err.description = 'Description must be under 5000 characters';

    if (isGlobal && form.scope !== 'all' && form.subcityNames.length === 0) err.target = 'Select at least one target subcity';
    if (isSubcityAdmin && form.woredas.length === 0) err.target = 'Select at least one woreda within your subcity';

    // Drafts are saved without publish/expiry validation — they may be
    // completed later (matches the backend, which skips drafts too).
    if (status !== 'draft') {
      const refTime = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
      // The publishing mode is DERIVED from the schedule field: empty →
      // immediate broadcast (no future-date validation runs at all); filled →
      // scheduled broadcast (must be in the future). Expiry stays optional but
      // must be later than the actual publish time when supplied.
      const result = validatePublishWindow({
        publishMode: startDate ? 'schedule' : 'immediate',
        startAt: startDate,
        endAt: endDate,
        now: refTime,
      });
      for (const e of result.errors) {
        if (!err[e.field]) err[e.field] = e.message;
      }
    }

    if (form.files.length > MAX_FILES) err.files = `Maximum ${MAX_FILES} attachments`;
    for (const f of form.files) {
      const okType = f.type === 'application/pdf' || f.type === 'image/jpeg' || f.type === 'image/png';
      if (!okType) err.files = 'Only JPG, PNG or PDF files are allowed';
      if (f.size > MAX_FILE_SIZE) err.files = 'Each file must be under 5 MB';
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const buildPayload = (status) => {
    const fd = new FormData();
    fd.append('title', form.title.trim());
    if (form.category.trim()) fd.append('category', form.category.trim());
    fd.append('severity', form.severity);
    fd.append('description', form.description.trim());
    // Editing never changes the alert's status — it is preserved as-is.
    if (!editId) fd.append('status', status);
    fd.append('publishMode', startDate ? 'schedule' : 'immediate');

    if (isGlobal) fd.append('scope', form.scope);
    if (isGlobal && form.scope !== 'all') {
      form.subcityIds.forEach((id) => fd.append('subcityIds', id));
      form.subcityNames.forEach((n) => fd.append('subcityNames', n));
    }
    // Send the picked woreda ids/names whenever any are selected — subcity
    // admins target specific woreda(s) and global admins send them in woreda
    // scope. Woreda admins never pick woredas here (they are locked to theirs).
    form.woredas.forEach((w) => fd.append('woredaIds', w.id));
    form.woredas.forEach((w) => fd.append('woredaNames', w.name));

    // Only a scheduled broadcast carries a publish time — immediate broadcasts
    // use the server clock, so no (possibly stale) startAt is ever sent.
    if (startDate) fd.append('startAt', startDate.toISOString());
    if (endDate) fd.append('endAt', endDate.toISOString());
    if (form.emergencyContact) fd.append('emergencyContact', form.emergencyContact.trim());
    if (form.sourceAuthority) fd.append('sourceAuthority', form.sourceAuthority.trim());
    form.files.forEach((f) => fd.append('attachments', f));
    return fd;
  };

  const handleSubmit = async (status) => {
    // Always validate against the freshest server time. In edit mode the alert
    // keeps its current status, so validation must match that status (drafts
    // skip the publish-window checks; live/scheduled alerts must keep a valid
    // window).
    const now = await fetchServerTime();
    const effectiveStatus = editId ? (editStatus || 'published') : status;
    if (!validate(effectiveStatus, now)) {
      toast.error('Please fix the errors below');
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload(status);
      if (editId) {
        await alertAPI.update(editId, payload);
        toast.success('Alert updated successfully!');
      } else {
        await alertAPI.create(payload);
        const scheduled = status === 'draft' ? false : Boolean(startDate);
        const msg = status === 'draft'
          ? 'Alert saved as draft'
          : scheduled
            ? 'Alert scheduled successfully!'
            : 'Public alert broadcasted successfully!';
        toast.success(msg);
      }
      setPreviewOpen(false);
      if (onSuccess) onSuccess();
      else navigate(homePath);
    } catch (err) {
      const data = err.response?.data;
      if (data?.field) {
        const field = data.field === 'targeting' ? 'target' : data.field;
        setErrors((p) => ({ ...p, [field]: data.message || 'Invalid value' }));
      }
      const uploadMsg = uploadErrorMessage(err.code);
      const msg = data?.message || uploadMsg || (editId ? 'Failed to update alert. Please check your connection and try again.' : 'Failed to create alert. Please check your connection and try again.');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const targetLabel = isGlobal
    ? form.scope === 'all'
      ? 'Addis Ababa (city-wide)'
      : [form.subcityNames.join(', '), form.woredas.map((w) => w.name).join(', ')].filter(Boolean).join(' — ')
    : isSubcityAdmin
      ? [lockedSubcity, form.woredas.map((w) => w.name).join(', ')].filter(Boolean).join(' — ') || (lockedSubcity || 'Your subcity')
      : [lockedSubcity, lockedWoreda].filter(Boolean).join(' — ') || 'Addis Ababa';

  const selectedSev = ALERT_SEVERITIES.find((s) => s.value === form.severity);

  const scopeOptions = isGlobal ? (
    <div className="flex flex-wrap gap-2">
      {[
        { value: 'all', label: '🌍 Whole Addis Ababa' },
        { value: 'subcity', label: '🏙️ Specific subcity(s)' },
        { value: 'woreda', label: '🏘️ Subcity + woreda(s)' },
      ].map((o) => (
        <button key={o.value} type="button" onClick={() => { set('scope', o.value); setErrors((p) => { const n = { ...p }; delete n.target; return n; }); }}
          className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all duration-150
            ${form.scope === o.value
              ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600'
              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="card border-2 border-amber-200 dark:border-amber-800 overflow-hidden animate-fade-in">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 px-4 sm:px-6 py-4 border-b border-amber-200 dark:border-amber-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="text-xl">{editId ? '✏️' : '📢'}</span> {editId ? 'Edit Alert' : t('alert.createTitle')}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fields marked with * are required</p>
        </div>
      </div>

      {loadingEdit ? (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      ) : (
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit('published'); }} noValidate>
        <div className="p-4 sm:p-6 space-y-5">

          <FormField label="Alert Title" error={errors.title} required>
            <input
              name="title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={200}
              placeholder='e.g. "Heavy Rainfall Warning for Woreda 03"'
              className={`input-field ${errors.title ? 'border-red-400 focus:ring-red-300' : ''}`}
            />
          </FormField>

          {/* Category — OPTIONAL, free-text */}
          <FormField label="Alert Category (optional)">
            <input
              name="category"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              maxLength={120}
              placeholder="e.g. Flood Warning, Road Closure, Security Notice"
              className="input-field"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Optional. Leave empty if this alert has no specific category.
            </p>
          </FormField>

          {/* Severity */}
          <FormField label="Severity Level" error={errors.severity} required>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ALERT_SEVERITIES.slice(0, 5).map((s) => (
                <button key={s.value} type="button" onClick={() => set('severity', s.value)}
                  className={`py-3 px-2 rounded-xl border-2 text-sm font-semibold transition-all duration-150 text-center
                    ${form.severity === s.value
                      ? `${SEVERITY_STYLES[s.value].badge} ring-2 ring-offset-1 ring-amber-400`
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'}`}>
                  <span className="block text-base mb-0.5">{s.icon}</span>
                  <span className="block text-xs">{s.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              {form.severity === 'critical'
                ? 'Critical alerts are always delivered to citizens and cannot be opted out of subscriptions.'
                : 'Critical alerts are always delivered to citizens; lower severities respect each citizen\u2019s subscription preferences.'}
            </p>
          </FormField>

          {/* Targeting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              📍 Target Location <span className="text-red-500 ml-0.5">*</span>
            </label>

            {isGlobal && (
              <>
                {scopeOptions}
                {(form.scope === 'subcity' || form.scope === 'woreda') && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2">
                      {subcities.map((sc) => {
                        const checked = form.subcityIds.includes(sc._id);
                        return (
                          <button key={sc._id} type="button" onClick={() => toggleSubcity(sc)}
                            className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all duration-150
                              ${checked
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600'
                                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'}`}>
                            {checked ? '☑️' : '⬜'} {sc.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.scope === 'woreda' && form.subcityNames.map((sn) => {
                  const woredas = woredasBySubcity[normalizeKey(sn)] || [];
                  return (
                    <div key={sn} className="mt-3 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                      <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">{sn}</p>
                      <div className="flex flex-wrap gap-2">
                        {woredas.length === 0 && <span className="text-xs text-gray-400">{loadingWoredas ? 'Loading woredas…' : 'No woredas found'}</span>}
                        {woredas.map((w) => {
                          const checked = form.woredas.some((x) => x.id === w._id);
                          return (
                            <button key={w._id} type="button" onClick={() => toggleWoreda(w, sn)}
                              className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all duration-150
                                ${checked
                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600'
                                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'}`}>
                              {checked ? '☑️' : '⬜'} {w.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {isSubcityAdmin && (
              <div className="space-y-3">
                <div className="input-field bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center">
                  <span className="text-xs font-semibold">🏙️ {lockedSubcity || 'Your'} Subcity (locked to your scope)</span>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">Target woreda(s)</p>
                  <div className="flex flex-wrap gap-2">
                    {(woredasBySubcity[normalizeKey(lockedSubcity)] || []).map((w) => {
                      const checked = form.woredas.some((x) => x.id === w._id);
                      return (
                        <button key={w._id} type="button" onClick={() => toggleWoreda(w, lockedSubcity)}
                          className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all duration-150
                            ${checked
                              ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600'
                              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'}`}>
                          {checked ? '☑️' : '⬜'} {w.name}
                        </button>
                      );
                    })}
                    {(woredasBySubcity[normalizeKey(lockedSubcity)] || []).length === 0 && (
                      <span className="text-xs text-gray-400">{loadingWoredas ? 'Loading woredas…' : 'No woredas found for your subcity'}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isWoredaAdmin && (
              <div className="input-field bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center">
                <span className="text-xs font-semibold">
                  🏙️ {lockedSubcity || 'Your'} Subcity — {lockedWoreda || 'Your'} Woreda (locked to your scope)
                </span>
              </div>
            )}

            {/* Selected targets — chips/tags summary of the exact broadcast scope */}
            {(() => {
              const showChips = isGlobal
                ? form.scope !== 'all' && (form.subcityNames.length > 0 || form.woredas.length > 0)
                : isSubcityAdmin
                  ? form.woredas.length > 0
                  : isWoredaAdmin;
              if (!showChips) return null;
              return (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    📍 Selected targets
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSubcityNames.map((sn) => (
                      <span key={sn}
                        className="inline-flex items-center bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 rounded-full px-2.5 py-1 text-xs font-medium">
                        🏙️ {sn}{isSubcityAdmin ? ' Subcity' : ''}
                      </span>
                    ))}
                    {form.woredas.map((w, i) => (
                      <span key={`${w.id}-${i}`}
                        className="inline-flex items-center bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-full px-2.5 py-1 text-xs font-medium">
                        🏘️ {w.name}
                      </span>
                    ))}
                    {isWoredaAdmin && lockedWoreda && (
                      <span
                        className="inline-flex items-center bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-full px-2.5 py-1 text-xs font-medium">
                        🏘️ {lockedWoreda}{lockedSubcity ? ` (${lockedSubcity})` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {errors.target && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{errors.target}</p>}

            {/* Readonly map */}
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Map preview</p>
              <TargetMap scope={form.scope} subcityNames={selectedSubcityNames} woredas={form.woredas} />
            </div>
          </div>

          {/* Scheduling — empty Schedule Publish means publish immediately */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Schedule Publish (optional)" error={errors.startAt}>
                <input type="datetime-local" value={form.startAt} min={minStart}
                  onChange={(e) => set('startAt', e.target.value)}
                  className={`input-field ${errors.startAt ? 'border-red-400 focus:ring-red-300' : ''}`} />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Leave empty to publish immediately. A future time schedules the broadcast.
                </p>
              </FormField>
              <FormField label="Expires At (optional)" error={errors.endAt}>
                <input type="datetime-local" value={form.endAt} min={minEnd}
                  onChange={(e) => set('endAt', e.target.value)}
                  className={`input-field ${errors.endAt ? 'border-red-400 focus:ring-red-300' : ''}`} />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Leave empty to keep the alert active. If set, it must be after the publish/scheduled time.
                </p>
              </FormField>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Times are in Africa/Addis_Ababa (EAT, UTC+3).
            </p>
          </div>

          {/* Source details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Emergency Contact (optional)">
              <input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} placeholder="e.g. +251 11 123 4567" className="input-field" />
            </FormField>
            <FormField label="Source Authority (optional)">
              <input value={form.sourceAuthority} onChange={(e) => set('sourceAuthority', e.target.value)} placeholder="e.g. Bole Subcity Disaster Risk Office" className="input-field" />
            </FormField>
          </div>

          {/* Attachments */}
          <FormField label={`Attachments (optional — up to ${MAX_FILES} files, JPG/PNG/PDF, 5 MB each)`} error={errors.files}>
            <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-6 cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors">
              <span className="text-2xl mb-1">📎</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">Click to choose files</span>
              <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {form.files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {form.files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-700 dark:text-gray-300 truncate">📄 {f.name} <span className="text-gray-400">({(f.size / 1024 / 1024).toFixed(2)} MB)</span></span>
                    <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:text-red-700 font-bold px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </FormField>

          {/* Description */}
          <FormField label="Description / Action Needed" error={errors.description} required>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Provide detailed information about the alert and any actions citizens should take…"
              className={`input-field resize-none ${errors.description ? 'border-red-400 focus:ring-red-300' : ''}`}
            />
          </FormField>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3 items-center">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary py-2.5 px-5 text-sm">
            Cancel
          </button>
          <div className="flex-1" />
          {!editId && (
            <button type="button" onClick={() => handleSubmit('draft')} disabled={submitting}
              className="px-5 py-2.5 rounded-lg border-2 border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Saving…' : '💾 Save as Draft'}
            </button>
          )}
          <button type="button" onClick={async () => {
            const now = await fetchServerTime();
            const eff = editId ? (editStatus || 'published') : 'published';
            if (validate(eff, now)) setPreviewOpen(true); else toast.error('Please fix the errors below');
          }}
            className="px-5 py-2.5 rounded-lg border-2 border-amber-400 dark:border-amber-600 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
            👁️ Preview
          </button>
          <button type="submit" disabled={submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm inline-flex items-center justify-center gap-2">
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {editId ? 'Saving…' : 'Publishing…'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
                {editId ? 'Save Changes' : 'Publish Broadcast'}
              </>
            )}
          </button>
        </div>
      </form>
      )}

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Alert Preview</h3>
              <button onClick={() => setPreviewOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold text-lg">✕</button>
            </div>
            <div className="p-5">
              <div className={`rounded-xl p-4 border-l-4 ${SEVERITY_STYLES[form.severity]?.bg || ''} ${SEVERITY_STYLES[form.severity]?.leftBorder || 'border-l-blue-500'}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-2xl">📢</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">{form.title}</span>
                  {selectedSev && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_STYLES[form.severity]?.badge || ''}`}>
                      {selectedSev.icon} {selectedSev.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
                  {form.category.trim() && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getCategoryBadge(form.category)}`}>
                      {form.category.trim()}
                    </span>
                  )}
                  <span>📍 {targetLabel}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap line-clamp-4">{form.description}</p>
                <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400 dark:text-gray-500 flex-wrap">
                  <span>{startDate ? `Scheduled: ${formatAddis(startDate)}` : 'Publish now (server time)'}</span>
                  {endDate && <span>· Expires: {formatAddis(endDate)}</span>}
                  {form.sourceAuthority && <span>· {form.sourceAuthority}</span>}
                </div>
                {form.files.length > 0 && (
                  <div className="mt-2 text-[10px] text-gray-400">📎 {form.files.length} attachment(s)</div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button onClick={() => setPreviewOpen(false)} className="btn-secondary py-2 px-4 text-sm">Close</button>
              <button onClick={() => handleSubmit('published')} disabled={submitting}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg text-sm disabled:opacity-50">
                {submitting ? 'Publishing…' : startDate ? 'Schedule Alert' : 'Publish Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
