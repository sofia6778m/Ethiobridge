import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { publicAPI, complaintAPI } from '../../services/api';

/* ────────────────────────────────────────────────────────────
   Helper data structures
   ──────────────────────────────────────────────────────────── */

// Subcities in Addis Ababa with their associated woredas (offline fallback only).
// The Subcity and Woreda dropdowns are loaded live from the backend; this static
// list is used only if those calls fail.
const SUBCITY_WOREDAS = {
  BOLE: ['Woreda 01', 'Woreda 02'],
  YEKA: ['Woreda 03', 'Woreda 04'],
  LEMMI_KURA: ['Woreda 05', 'Woreda 06'],
};

// Same subcity options, in the order shown in the dropdown (fallback only).
const SUBCITIES = [
  { value: 'BOLE',       label: 'Bole' },
  { value: 'YEKA',       label: 'Yeka' },
  { value: 'LEMMI_KURA', label: 'Lemmi Kura' },
];

// Converts a stored Subcity name into the canonical scope key used by the
// backend role scoping (e.g. "Lemmi Kura" → "LEMMI_KURA").
const canonicalSubcity = (name) => String(name || '').trim().toUpperCase().replace(/\s+/g, '_');

// Fallback departments, used only when GET /public/departments fails. The live
// list is loaded from the backend so the department string stored on the
// complaint matches the Department collection (and department accounts).
const FALLBACK_DEPARTMENTS = ['Electricity', 'Road', 'Water'];

// Ethiopian mobile numbers: must start with 09 and contain exactly 10 digits (09XXXXXXXX).
const PHONE_REGEX = /^09\d{8}$/;

const SUCCESS_MESSAGE = 'Issue submitted successfully. Thank you for your report!';

const EMPTY_FORM = {
  fullName: '',
  phone: '',
  subcity: '',
  woreda: '',
  department: '',
  issueTitle: '',
  description: '',
};

// Per-field validation rules used by both validateField (on blur) and validate (on submit).
const validateField = (name, value) => {
  switch (name) {
    case 'fullName':
      return value.trim() ? '' : 'Full name is required';
    case 'phone':
      if (!value.trim()) return 'Phone number is required';
      return PHONE_REGEX.test(value.trim()) ? '' : 'Phone number must start with 09 (e.g. 0912345678)';
    case 'subcity':
      return value ? '' : 'Subcity is required';
    case 'woreda':
      return value ? '' : 'Woreda is required';
    case 'department':
      return value ? '' : 'Department is required';
    case 'issueTitle':
      return value.trim() ? '' : 'Issue title is required';
    case 'description':
      return value.trim() ? '' : 'Description is required';
    default:
      return '';
  }
};

export default function ComplaintIssueModal({ open, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [subcities, setSubcities] = useState(SUBCITIES);
  const [woredas, setWoredas] = useState([]);
  const [loadingWoredas, setLoadingWoredas] = useState(false);
  const [departments, setDepartments] = useState(FALLBACK_DEPARTMENTS);

  // Load subcities from the database; keep the static list as an offline fallback.
  useEffect(() => {
    publicAPI.getSubcities()
      .then(r => {
        const list = r.data?.subcities || [];
        if (list.length) {
          setSubcities(list.map(s => ({ value: canonicalSubcity(s.name), label: s.name })));
        }
      })
      .catch(() => { /* keep static fallback */ });
  }, []);

  // Load woredas for the selected subcity from the backend; fall back to the
  // static list when the request fails (e.g. offline or endpoint unavailable).
  // Woreda records keep their Mongo _id so the complaint is routed to the
  // exact Woreda record on submission.
  useEffect(() => {
    if (!form.subcity) { setWoredas([]); return; }
    setWoredas((SUBCITY_WOREDAS[form.subcity] || []).map(name => ({ name })));
    setLoadingWoredas(true);
    publicAPI.getSubcityWoredas(form.subcity)
      .then(r => {
        const list = r.data?.woredas || [];
        if (list.length) setWoredas(list);
      })
      .catch(() => { /* keep static fallback */ })
      .finally(() => setLoadingWoredas(false));
  }, [form.subcity]);

  // Load the department list from the backend so the department string stored
  // on the complaint matches the Department collection (and department
  // accounts) exactly — this is what routes the complaint to the right office.
  useEffect(() => {
    publicAPI.getDepartments()
      .then(r => {
        const list = r.data?.departments || [];
        if (list.length) setDepartments(list);
      })
      .catch(() => { /* keep static fallback */ });
  }, []);

  // Department options come from the selected woreda record when it carries its
  // own departments array; otherwise fall back to the global Department list.
  const selectedWoreda = woredas.find(w => (w._id || w.name) === form.woreda);
  const departmentOptions = (selectedWoreda?.departments?.length)
    ? selectedWoreda.departments
    : departments;

  // Reset the form each time the modal is opened.
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  // Close the modal when the Escape key is pressed.
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Update a field and clear its error. Changing the subcity resets the woreda
  // and department; changing the woreda resets the department.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'subcity' ? { woreda: '', department: '' } : {}),
      ...(name === 'woreda' ? { department: '' } : {}),
    }));
    setErrors(prev => ({
      ...prev,
      [name]: '',
      ...(name === 'subcity' ? { woreda: '', department: '' } : {}),
      ...(name === 'woreda' ? { department: '' } : {}),
    }));
  };

  // Validate a single field on blur so users get immediate inline feedback.
  const handleBlur = (e) => {
    const { name, value } = e.target;
    const message = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: message }));
  };

  // Validate every field; returns true when the whole form is valid.
  const validate = () => {
    const nextErrors = {};
    Object.keys(EMPTY_FORM).forEach(name => {
      const message = validateField(name, form[name]);
      if (message) nextErrors[name] = message;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Submit button stays disabled until every field is filled AND valid.
  const canSubmit =
    Object.keys(EMPTY_FORM).every(name => form[name].trim() !== '') &&
    PHONE_REGEX.test(form.phone.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const woreda = woredas.find(w => (w._id || w.name) === form.woreda);

      const payload = {
        title: form.issueTitle,
        description: form.description,
        region: 'Addis Ababa',
        priority: 'Medium',
        subcity: form.subcity,
        department: form.department,
        reporterName: form.fullName,
        reporterPhone: form.phone,
        anonymous: false,
      };
      if (woreda?._id) payload.woredaId = woreda._id;
      if (woreda?.name) payload.woredaName = woreda.name;

      const res = await complaintAPI.create(payload);
      const trackingNumber = res.data?.data?.trackingNumber;

      toast.success(
        trackingNumber
          ? `Complaint submitted successfully. Your tracking ID: ${trackingNumber}`
          : SUCCESS_MESSAGE
      );
      setForm(EMPTY_FORM);
      setErrors({});
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit complaint. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-issue-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 text-white px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="complaint-issue-title" className="text-xl font-bold flex items-center gap-2">
                📋 Complaint Issue
              </h2>
              <p className="text-blue-200 text-sm mt-1">
                Report a public service issue — it will be forwarded to the responsible department.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-gray-800 px-6 py-5 space-y-4 rounded-b-2xl">
          {/* Row 1: Full Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name" error={errors.fullName} required>
              <input
                name="fullName"
                type="text"
                value={form.fullName}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. Abebe Kebede"
                className={inputClass(errors.fullName)}
              />
            </Field>

            <Field label="Phone Number" error={errors.phone} required>
              <input
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. 0912345678"
                className={inputClass(errors.phone)}
              />
            </Field>
          </div>

          {/* Row 2: Subcity + Woreda */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Subcity" error={errors.subcity} required>
              <select
                name="subcity"
                value={form.subcity}
                onChange={handleChange}
                onBlur={handleBlur}
                className={inputClass(errors.subcity)}
              >
                <option value="">Select subcity</option>
                {subcities.map(sc => (
                  <option key={sc.value} value={sc.value}>{sc.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Woreda" error={errors.woreda} required>
              <select
                name="woreda"
                value={form.woreda}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={!form.subcity}
                className={inputClass(errors.woreda)}
              >
                <option value="">{loadingWoredas ? 'Loading…' : (form.subcity ? 'Select woreda' : 'Select subcity first')}</option>
                {woredas.map(w => (
                  <option key={w._id || w.name} value={w._id || w.name}>{w.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Row 3: Department (depends on the selected woreda) */}
          <Field label="Department" error={errors.department} required>
            <select
              name="department"
              value={form.department}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={!form.woreda}
              className={inputClass(errors.department)}
            >
              <option value="">
                {form.woreda ? 'Select department' : 'Select a woreda first'}
              </option>
              {departmentOptions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>

          {/* Row 4: Issue Title */}
          <Field label="Issue Title" error={errors.issueTitle} required>
            <input
              name="issueTitle"
              type="text"
              value={form.issueTitle}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="e.g. Street light not working on Bole road"
              className={inputClass(errors.issueTitle)}
            />
          </Field>

          {/* Row 5: Description */}
          <Field label="Description" error={errors.description} required>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              onBlur={handleBlur}
              rows={4}
              placeholder="Describe the issue in detail — what happened, where, and how severe it is..."
              className={`${inputClass(errors.description)} resize-none`}
            />
          </Field>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:dark:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </span>
            ) : 'Submit Complaint'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────── Reusable pieces ─────────────────── */

// Shared input styling with an error border highlight.
const inputClass = (error) =>
  `input-field ${error ? 'border-red-400 focus:ring-red-300' : ''}`;

// Label + control + inline error message wrapper.
function Field({ label, error, required, children }) {
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
