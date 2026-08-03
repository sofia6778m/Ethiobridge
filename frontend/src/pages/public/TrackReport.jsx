import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EthioMap from '../../components/map/EthioMap';
import ReportTimeline from '../../components/common/ReportTimeline';
import BeforeAfterGallery from '../../components/common/BeforeAfterGallery';

export default function TrackReport() {
  const { t } = useTranslation();
  const [reportId, setReportId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!reportId.trim()) return;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const r = await infraAPI.track(reportId.trim().toUpperCase());
      setReport(r.data.report);
    } catch (err) {
      setError(err.response?.data?.message || t('tracking.notFound') || 'Report not found. Please check the Report ID and try again.');
    } finally {
      setLoading(false);
    }
  };

  const markers = report?.latitude && report?.longitude
    ? [{ latitude: report.latitude, longitude: report.longitude, title: report.title, type: 'infrastructure', status: report.status }]
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('tracking.title') || 'Track Your Report'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {t('tracking.desc') || 'Enter your Report ID to check the current status and timeline of your infrastructure report.'}
        </p>
      </div>

      <form onSubmit={handleSearch} className="max-w-lg mx-auto mb-10">
        <div className="flex gap-3">
          <input
            type="text"
            value={reportId}
            onChange={e => setReportId(e.target.value)}
            placeholder={t('tracking.placeholder') || 'Enter Report ID (e.g., IR-2026-0001)'}
            className="input-field flex-1 text-center font-mono text-lg tracking-wider"
          />
          <button type="submit" disabled={loading || !reportId.trim()} className="btn-primary px-6">
            {loading ? t('common.searching') || 'Searching...' : t('common.search') || 'Track'}
          </button>
        </div>
      </form>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Status Banner */}
          <div className={`card border-l-4 ${
            report.status === 'Resolved' ? 'border-l-green-500 bg-green-50 dark:bg-green-900/10' :
            report.status === 'In Progress' ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/10' :
            report.status === 'Rejected' ? 'border-l-red-500 bg-red-50 dark:bg-red-900/10' :
            'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{report.reportId}</p>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-1">{report.title}</h2>
              </div>
              <StatusBadge status={report.status} />
            </div>
          </div>

          {/* Progress Bar */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('tracking.progress') || 'Report Progress'}
            </h3>
            <ProgressTracker status={report.status} />
          </div>

          {/* Details */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('common.details') || 'Details'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Detail label={t('common.category') || 'Category'} value={report.category} />
              <Detail label={t('common.severity') || 'Severity'} value={report.severityLevel} />
              <Detail label={t('common.region') || 'Region'} value={report.region} />
              {report.zone && <Detail label={t('dashboard.zone') || 'Zone'} value={report.zone} />}
              {report.woreda && <Detail label={t('dashboard.woreda') || 'Woreda'} value={report.woreda} />}
              {report.kebele && <Detail label={t('dashboard.kebele') || 'Kebele'} value={report.kebele} />}
              {report.city && <Detail label={t('common.city') || 'City'} value={report.city} />}
              {report.specificLocation && <Detail label={t('common.location') || 'Location'} value={report.specificLocation} />}
              {report.address && <Detail label={t('dashboard.address') || 'Address'} value={report.address} />}
              {report.incidentDate && <Detail label={t('dashboard.incidentDate') || 'Incident Date'} value={new Date(report.incidentDate).toLocaleDateString()} />}
              <Detail label={t('common.dateReported') || 'Date Reported'} value={new Date(report.createdAt).toLocaleDateString()} />
              {report.autoAssignedOrganization && <Detail label={t('common.responsibleOrg') || 'Responsible Organization'} value={report.autoAssignedOrganization} />}
              {report.resolvedAt && <Detail label={t('dashboard.resolvedAt') || 'Resolved At'} value={new Date(report.resolvedAt).toLocaleDateString()} />}
            </div>
            {report.description && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('common.description') || 'Description'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{report.description}</p>
              </div>
            )}
          </div>

          {/* Before/After Media */}
          <BeforeAfterGallery report={report} />

          {/* Photos & Videos */}
          {report.photos?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('report.photosLabel') || 'Evidence Photos'}
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {report.photos.map((p, i) => (
                  <img key={i} src={p} alt="" className="h-36 w-auto rounded-xl object-cover shrink-0" />
                ))}
              </div>
            </div>
          )}

          {report.videos?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('report.videoLabel') || 'Evidence Videos'}
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {report.videos.map((v, i) => (
                  <video key={i} src={v} controls className="h-36 rounded-xl shrink-0" />
                ))}
              </div>
            </div>
          )}

          {/* Map */}
          {markers.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('common.location') || 'Location'}
              </h3>
              <EthioMap markers={markers} center={[report.latitude, report.longitude]} zoom={12} height="280px" />
            </div>
          )}

          {/* Timeline */}
          {report.timeline?.length > 0 && (
            <div className="card">
              <ReportTimeline timeline={report.timeline} />
            </div>
          )}

          {/* Rating */}
          {report.rating && (
            <div className="card text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('tracking.citizenRating') || 'Citizen Rating'}
              </p>
              <div className="flex justify-center gap-1 text-2xl">
                {[1, 2, 3, 4, 5].map(s => (
                  <span key={s} className={s <= report.rating ? 'text-yellow-400' : 'text-gray-300'}>★</span>
                ))}
              </div>
              {report.feedback && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">"{report.feedback}"</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const WORKFLOW_STEPS = [
  { key: 'Pending', label: 'Submitted' },
  { key: 'Under Review', label: 'Review' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Assigned', label: 'Assigned' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Citizen Verification', label: 'Verification' },
  { key: 'Resolved', label: 'Resolved' },
];

function ProgressTracker({ status }) {
  const statusOrder = ['Pending', 'Under Review', 'Approved', 'Assigned', 'In Progress', 'Completed', 'Citizen Verification', 'Resolved'];
  const currentIndex = statusOrder.indexOf(status);
  const isRejected = status === 'Rejected';
  const isReopened = status === 'Reopened';

  if (isRejected || isReopened) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg ${isRejected ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
        <span className="text-2xl">{isRejected ? '❌' : '🔁'}</span>
        <div>
          <p className={`font-semibold text-sm ${isRejected ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {isRejected ? 'Report Rejected' : 'Report Reopened'}
          </p>
          <p className="text-xs text-gray-500">{isRejected ? 'This report was not approved' : 'This report was reopened for further work'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {WORKFLOW_STEPS.map((step, i) => {
        const stepIndex = statusOrder.indexOf(step.key);
        const isCompleted = stepIndex <= currentIndex && currentIndex >= 0;
        const isCurrent = step.key === status;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center min-w-[60px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                isCompleted
                  ? 'bg-green-500 border-green-500 text-white'
                  : isCurrent
                  ? 'bg-blue-500 border-blue-500 text-white animate-pulse'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
                {isCompleted && !isCurrent ? '✓' : i + 1}
              </div>
              <p className={`text-[10px] mt-1 text-center ${isCurrent ? 'font-bold text-blue-600 dark:text-blue-400' : isCompleted ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                {step.label}
              </p>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className={`w-6 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
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
