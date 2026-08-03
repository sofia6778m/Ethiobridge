import { useState, useEffect } from 'react';
import { workflowComplaintAPI, publicAPI } from '../../services/api';
import { toast } from 'react-toastify';

const SUBCITIES = [
  { value: 'BOLE',       label: 'Bole' },
  { value: 'YEKA',       label: 'Yeka' },
  { value: 'LEMMI_KURA', label: 'Lemmi Kura' },
];
const DEPARTMENTS = ['Electricity', 'Road', 'Water'];
const PRIORITIES  = ['Low', 'Medium', 'High', 'Urgent'];

// Converts a stored Subcity name into the canonical scope key used by the
// backend issue-type routing (e.g. "Lemmi Kura" → "LEMMI_KURA").
const canonicalSubcity = (name) => String(name || '').trim().toUpperCase().replace(/\s+/g, '_');

export default function WorkflowComplaintSubmit() {
  const [step, setStep] = useState(1); // 1=select issue, 2=details, 3=success

  // Step 1 state
  const [subcity, setSubcity]       = useState('');
  const [department, setDepartment] = useState('');
  const [issueTypes, setIssueTypes] = useState([]);
  const [issueType, setIssueType]   = useState(null);
  const [subcities, setSubcities]   = useState(SUBCITIES);
  const [departments, setDepartments] = useState(DEPARTMENTS);
  const [woredas, setWoredas]       = useState([]);
  const [woredaId, setWoredaId]     = useState('');
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [loadingWoredas, setLoadingWoredas] = useState(false);

  // Step 2 state
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [priority, setPriority]         = useState('Medium');
  const [anonymous, setAnonymous]       = useState(false);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState(null); // { trackingNumber }

  // Load issue types when subcity + department are selected
  useEffect(() => {
    if (!subcity || !department) { setIssueTypes([]); setIssueType(null); return; }
    setLoadingIssues(true);
    workflowComplaintAPI.getIssueTypes({ subcity, department })
      .then((res) => setIssueTypes(res.data.data.issueTypes))
      .catch(() => toast.error('Failed to load issue types'))
      .finally(() => setLoadingIssues(false));
  }, [subcity, department]);

  // Load woredas when subcity is selected
  useEffect(() => {
    if (!subcity) { setWoredas([]); setWoredaId(''); return; }
    setLoadingWoredas(true);
    publicAPI.getSubcityWoredas(subcity)
      .then((res) => setWoredas(res.data.woredas || []))
      .catch(() => toast.error('Failed to load woredas'))
      .finally(() => setLoadingWoredas(false));
  }, [subcity]);

  // Load subcities and departments from the database (static lists are fallbacks).
  useEffect(() => {
    publicAPI.getSubcities()
      .then((res) => {
        const list = res.data?.subcities || [];
        if (list.length) setSubcities(list.map(s => ({ value: canonicalSubcity(s.name), label: s.name })));
      })
      .catch(() => { /* keep static fallback */ });

    publicAPI.getDepartments()
      .then((res) => {
        const list = res.data?.departments || [];
        if (list.length) setDepartments(list);
      })
      .catch(() => { /* keep static fallback */ });
  }, []);

  // Department options come from the selected woreda record when it carries its
  // own departments array; otherwise fall back to the global Department list.
  const selectedWoreda = woredas.find(w => w._id === woredaId);
  const departmentOptions = (selectedWoreda?.departments?.length)
    ? selectedWoreda.departments
    : departments;

  const handleIssueSelect = (it) => {
    setIssueType(it);
    // Pre-fill title from issue name
    setTitle(it.name);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!issueType) { toast.error('Please select an issue type.'); return; }
    if (!woredaId)  { toast.error('Please select a woreda.'); return; }
    if (!title || !description) { toast.error('Title and description are required.'); return; }

    setSubmitting(true);
    try {
      const body = {
        title, description, priority,
        issueTypeId: issueType._id,
        woredaId,
        anonymous: anonymous ? 'true' : 'false',
      };
      if (!anonymous) {
        body.reporterName  = reporterName;
        body.reporterPhone = reporterPhone;
        body.reporterEmail = reporterEmail;
      }

      const res = await workflowComplaintAPI.create(body);
      setResult({ trackingNumber: res.data.data.trackingNumber });
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1); setSubcity(''); setDepartment(''); setIssueTypes([]);
    setIssueType(null); setWoredaId(''); setTitle(''); setDescription('');
    setPriority('Medium'); setAnonymous(false); setReporterName('');
    setReporterPhone(''); setReporterEmail(''); setResult(null);
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              step > s ? 'bg-green-500 text-white' :
              step === s ? 'bg-primary-500 text-white' :
              'bg-gray-200 dark:bg-gray-700 text-gray-400'
            }`}>{step > s ? '✓' : s}</div>
            {s < 3 && <div className={`flex-1 h-0.5 w-12 ${step > s ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />}
          </div>
        ))}
        <div className="ml-2 text-sm text-gray-500 dark:text-gray-400">
          {step === 1 && 'Select Issue'}
          {step === 2 && 'Complaint Details'}
          {step === 3 && 'Submitted'}
        </div>
      </div>

      {/* Step 1 — Select location + issue type */}
      {step === 1 && (
        <div className="card p-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Select Issue Type</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose your subcity, department, and the specific issue you want to report.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subcity *</label>
            <select value={subcity}
              onChange={(e) => { setSubcity(e.target.value); setWoredaId(''); setDepartment(''); setIssueType(null); }}
              className="input-field w-full">
              <option value="">Select subcity…</option>
              {subcities.map((sc) => <option key={sc.value} value={sc.value}>{sc.label}</option>)}
            </select>
          </div>

          {subcity && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Woreda *</label>
              <select value={woredaId}
                onChange={(e) => { setWoredaId(e.target.value); setDepartment(''); setIssueType(null); }}
                className="input-field w-full" disabled={loadingWoredas}>
                <option value="">{loadingWoredas ? 'Loading…' : 'Select woreda…'}</option>
                {woredas.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
          )}

          {subcity && woredaId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department *</label>
              <select value={department}
                onChange={(e) => { setDepartment(e.target.value); setIssueType(null); }}
                className="input-field w-full">
                <option value="">Select department…</option>
                {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {subcity && department && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Issue Type *</label>
              {loadingIssues ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : issueTypes.length === 0 ? (
                <p className="text-sm text-gray-400">No issue types found for this combination.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {issueTypes.map((it) => (
                    <button key={it._id} type="button"
                      onClick={() => handleIssueSelect(it)}
                      className={`p-3 rounded-lg border text-left text-sm transition-all ${
                        issueType?._id === it._id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                          : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 text-gray-700 dark:text-gray-300'
                      }`}>
                      {issueType?._id === it._id && <span className="mr-1">✓</span>}
                      {it.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!issueType || !woredaId}
            className="btn-primary w-full py-2.5 disabled:opacity-40">
            Continue →
          </button>
        </div>
      )}

      {/* Step 2 — Complaint details */}
      {step === 2 && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStep(1)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">← Back</button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Complaint Details</h2>
          </div>

          {/* Selected summary */}
          <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 text-sm">
            <span className="font-medium text-primary-700 dark:text-primary-300">{issueType?.name}</span>
            <span className="text-gray-400 mx-1.5">·</span>
            <span className="text-gray-600 dark:text-gray-400">{issueType?.department}</span>
            <span className="text-gray-400 mx-1.5">·</span>
            <span className="text-gray-600 dark:text-gray-400">
              {subcities.find((s) => s.value === subcity)?.label || subcity}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="input-field w-full" placeholder="Brief title for your complaint" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={4} className="input-field w-full resize-none"
              placeholder="Describe the issue in detail — location, impact, duration…" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field w-full">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)}
              className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Submit anonymously</span>
          </label>

          {!anonymous && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Name</label>
                <input value={reporterName} onChange={(e) => setReporterName(e.target.value)}
                  className="input-field w-full" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input value={reporterPhone} onChange={(e) => setReporterPhone(e.target.value)}
                  className="input-field w-full" placeholder="+251…" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)}
                  className="input-field w-full" placeholder="your@email.com" />
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="btn-primary w-full py-2.5 disabled:opacity-60">
            {submitting ? 'Submitting…' : 'Submit Complaint'}
          </button>
        </form>
      )}

      {/* Step 3 — Success */}
      {step === 3 && result && (
        <div className="card p-8 text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Complaint Submitted!</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Your tracking number is:
          </p>
          <div className="inline-block bg-primary-50 dark:bg-primary-900/20 px-5 py-2 rounded-lg">
            <span className="text-lg font-mono font-bold text-primary-700 dark:text-primary-300">
              {result.trackingNumber}
            </span>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Save this number to track your complaint. A woreda officer will review it within 72 hours.
            If unresolved, it will be automatically escalated to the subcity.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button onClick={resetForm} className="btn-secondary px-5 py-2">
              Submit Another
            </button>
            <a href={`/track-report`} className="btn-primary px-5 py-2 inline-block">
              Track Complaint
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
