import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { complaintAPI } from '../../services/api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReportTimeline from '../../components/common/ReportTimeline';

const STEPS = [
  { key: 'submitted',     label: 'Complaint Submitted',              icon: '📝' },
  { key: 'received',      label: 'Received by Government Office',    icon: '📥' },
  { key: 'assigned',      label: 'Assigned to Officer',              icon: '👤' },
  { key: 'investigation', label: 'Investigation Started',            icon: '🔎' },
  { key: 'response',      label: 'Response Provided',                icon: '💬' },
  { key: 'resolved',      label: 'Resolved',                         icon: '✅' },
];

// Highest step index (0-based) reached by a given complaint status. A fixed
// 6-step public journey: Submitted → Received → Assigned → Investigation →
// Response → Resolved. Unknown / 'Pending' / 'Submitted' fall back to step 0.
const STATUS_STEP = {
  'Resolved': 5, 'Resolved by Subcity': 5, 'Closed': 5,
  'Rejected': 4, 'More Info Requested': 4, 'Awaiting Verification': 4, 'Rework Required': 4,
  'In Progress': 3, 'Waiting for Parts': 3, 'Inspector Assigned': 3, 'Technician Assigned': 3,
  'Technician Requested': 3, 'Escalated to Subcity': 3, 'Forwarded to Subcity': 3, 'Reopened': 3,
  'Assigned': 2,
  'Accepted': 1, 'Under Review': 1,
};

export function currentStep(complaint) {
  return STATUS_STEP[complaint?.status] ?? 0;
}

function latestUpdate(complaint) {
  const notifications = complaint.publicNotifications || [];
  if (notifications.length) {
    const n = notifications[notifications.length - 1];
    return { text: n.message || n.title || n.event, at: n.at };
  }
  const timeline = complaint.timeline || [];
  if (timeline.length) {
    const entry = timeline[timeline.length - 1];
    return { text: entry.description || entry.action, at: entry.at };
  }
  return null;
}

export default function ComplaintTrack() {
  const { t } = useTranslation();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trackInputRef = useRef(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!trackingNumber.trim() || !phone.trim()) return;
    setLoading(true);
    setError('');
    setComplaint(null);
    try {
      const r = await complaintAPI.track(trackingNumber.trim().toUpperCase(), { phone: phone.trim() });
      setComplaint(r.data.complaint);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403 || status === 404) {
        setError(t('complaintTracking.invalid') || 'Invalid tracking number or phone number.');
      } else {
        setError(err.response?.data?.message || (t('tracking.notFound') || 'Complaint not found. Please check the tracking number and try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError('');
    setComplaint(null);
    trackInputRef.current?.focus();
  };

  const canSubmit = Boolean(trackingNumber.trim() && phone.trim()) && !loading;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('complaintTracking.title') || 'Public Complaint Tracking'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          {t('complaintTracking.desc') || 'Enter your tracking number and the phone number used to submit your complaint to check its current status.'}
        </p>
      </div>

      <form onSubmit={handleSearch} className="max-w-lg mx-auto mb-10 space-y-4">
        <div>
          <label htmlFor="tracking-number" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {t('complaintTracking.trackingLabel') || 'Tracking Number'}
          </label>
          <input
            id="tracking-number"
            type="text"
            value={trackingNumber}
            onChange={e => setTrackingNumber(e.target.value)}
            placeholder={t('complaintTracking.trackingPlaceholder') || 'CMP-2026-000001'}
            className="input-field w-full text-center font-mono text-lg tracking-wider"
            ref={trackInputRef}
          />
        </div>
        <div>
          <label htmlFor="tracking-phone" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {t('complaintTracking.phoneLabel') || 'Phone Number'}
          </label>
          <input
            id="tracking-phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder={t('complaintTracking.phonePlaceholder') || '09XXXXXXXX'}
            className="input-field w-full text-center"
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary w-full py-3 text-base"
        >
          {loading
            ? (t('complaintTracking.checking') || 'Checking...')
            : (t('complaintTracking.checkStatus') || 'Check Status')}
        </button>
        <p className="text-xs text-gray-400 text-center">
          {t('complaintTracking.privacy') || 'No login required. Your phone number is only used to verify you are the reporter.'}
        </p>
      </form>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 dark:text-gray-400 mb-5">{error}</p>
          <button onClick={handleRetry} className="btn-secondary px-6">
            {t('complaintTracking.retry') || 'Try Again'}
          </button>
        </div>
      )}

      {complaint && (
        <div className="space-y-6">
          {/* Status Banner */}
          <div className={`card border-l-4 ${
            complaint.status === 'Resolved' || complaint.status === 'Resolved by Subcity' ? 'border-l-green-500 bg-green-50 dark:bg-green-900/10' :
            complaint.status === 'In Progress' ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/10' :
            complaint.status === 'Rejected' ? 'border-l-red-500 bg-red-50 dark:bg-red-900/10' :
            'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{complaint.trackingNumber}</p>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-1">{complaint.title}</h2>
              </div>
              <StatusBadge status={complaint.status} />
            </div>
          </div>

          {/* Fixed 6-step progress */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-5">
              {t('complaintTracking.progress') || 'Complaint Progress'}
            </h3>
            <ProgressSteps current={currentStep(complaint)} t={t} />
          </div>

          {/* Latest Update */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('complaintTracking.latestUpdate') || 'Latest Update'}
            </h3>
            {(() => {
              const latest = latestUpdate(complaint);
              if (!latest) {
                return <p className="text-sm text-gray-400">{t('complaintTracking.noUpdates') || 'No updates yet.'}</p>;
              }
              return (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center text-lg shrink-0">💬</div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{latest.text}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(latest.at).toLocaleString()}</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Details */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('common.details') || 'Details'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Detail label={t('common.category') || 'Category'} value={complaint.category} />
              <Detail label={t('common.subcategory') || 'Subcategory'} value={complaint.subcategory} />
              <Detail label={t('common.subcity') || 'Subcity'} value={complaint.subcity} />
              <Detail label={t('dashboard.woreda') || 'Woreda'} value={complaint.woredaName || complaint.woreda} />
              <Detail label={t('common.department') || 'Department'} value={complaint.department} />
              <Detail label={t('common.incidentDate') || 'Incident Date'} value={complaint.incidentDate ? new Date(complaint.incidentDate).toLocaleDateString() : ''} />
              <Detail label={t('common.dateReported') || 'Date Reported'} value={new Date(complaint.createdAt).toLocaleDateString()} />
              {complaint.reportChannel && <Detail label={t('complaint.channel') || 'Reported via'} value={complaint.reportChannel} />}
              {complaint.resolutionNote && <Detail label={t('complaint.resolutionNote') || 'Resolution Note'} value={complaint.resolutionNote} />}
            </div>
            {complaint.description && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('common.description') || 'Description'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.description}</p>
              </div>
            )}
          </div>

          {/* Photos & Videos */}
          {complaint.photos?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('report.photosLabel') || 'Evidence Photos'}
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {complaint.photos.map((p, i) => (
                  <img key={i} src={p} alt="" className="h-36 w-auto rounded-xl object-cover shrink-0" />
                ))}
              </div>
            </div>
          )}

          {complaint.videos?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('report.videoLabel') || 'Evidence Videos'}
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {complaint.videos.map((v, i) => (
                  <video key={i} src={v} controls className="h-36 rounded-xl shrink-0" />
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {complaint.timeline?.length > 0 && (
            <div className="card">
              <ReportTimeline timeline={complaint.timeline} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressSteps({ current, t }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {STEPS.map((step, i) => {
        const isDone = i < current;
        const isCurrent = i === current;
        return (
          <div
            key={step.key}
            role="listitem"
            aria-label={t(`complaintTracking.step${cap(step.key)}`) || step.key}
            className={`relative flex flex-col items-center text-center rounded-xl border-2 p-3 transition-colors ${
              isCurrent
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : isDone
                  ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10'
                  : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'
            }`}
          >
            {isCurrent && (
              <span className="absolute -top-2.5 right-2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                {t('complaintTracking.current') || 'Current'}
              </span>
            )}
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base mb-2 ${
              isDone || isCurrent ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 dark:bg-gray-700'
            }`}>
              {isDone && !isCurrent ? '✓' : step.icon}
            </div>
            <span className={`text-xs font-medium ${
              isDone || isCurrent ? 'text-green-700 dark:text-green-400' : 'text-gray-400'
            }`}>
              {t(`complaintTracking.step${cap(step.key)}`) || step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Detail({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">{value}</p>
    </div>
  );
}
