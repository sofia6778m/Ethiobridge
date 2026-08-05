import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { complaintAPI } from '../../services/api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReportTimeline from '../../components/common/ReportTimeline';

export default function ComplaintTrack() {
  const { t } = useTranslation();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;
    setLoading(true);
    setError('');
    setComplaint(null);
    try {
      const r = await complaintAPI.track(trackingNumber.trim().toUpperCase(), { phone: phone.trim() });
      setComplaint(r.data.complaint);
    } catch (err) {
      setError(err.response?.data?.message || t('tracking.notFound') || 'Complaint not found. Please check the tracking number and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('tracking.title') || 'Track Your Report'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Enter your tracking number and the phone number used to submit your complaint to check its current status and timeline.
        </p>
      </div>

      <form onSubmit={handleSearch} className="max-w-lg mx-auto mb-10 space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={trackingNumber}
            onChange={e => setTrackingNumber(e.target.value)}
            placeholder={t('tracking.placeholder') || 'Enter tracking number (e.g., CMP-2026-0001)'}
            className="input-field flex-1 text-center font-mono text-lg tracking-wider"
          />
          <button type="submit" disabled={loading || !trackingNumber.trim()} className="btn-primary px-6">
            {loading ? t('common.searching') || 'Searching...' : t('common.search') || 'Track'}
          </button>
        </div>
        <div>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder={t('complaint.phonePlaceholder') || 'Phone number used at submission (09XXXXXXXX)'}
            className="input-field w-full text-center"
          />
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            Enter the phone number you submitted the complaint with to see full details.
          </p>
        </div>
      </form>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
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

function Detail({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">{value}</p>
    </div>
  );
}
