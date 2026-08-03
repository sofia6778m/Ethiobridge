import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { infraAPI, emergencyAPI } from '../../services/api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EthioMap from '../../components/map/EthioMap';
import ReportTimeline from '../../components/common/ReportTimeline';
import BeforeAfterGallery from '../../components/common/BeforeAfterGallery';
import ReportComments from '../../components/common/ReportComments';
import ReportExport from '../../components/common/ReportExport';
import { useAuth } from '../../context/AuthContext';

export default function ReportDetail({ type }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const api = type === 'infrastructure' ? infraAPI : emergencyAPI;
  const backPath = type === 'infrastructure' ? '/infrastructure-reports' : '/emergency-requests';

  const fetchReport = () => {
    api.getOne(id)
      .then(r => { setReport(r.data.report); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchReport(); }, [id]);

  if (loading) return <LoadingSpinner fullPage />;
  if (!report) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">{t('common.reportNotFound')}</div>;

  const photos = report.photos || [];
  const markers = (report.latitude && report.longitude)
    ? [{ ...report, type }]
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to={backPath} className="text-primary-600 hover:underline text-sm mb-6 inline-block">← {t('common.back')}</Link>

      <div className="card">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{report.title}</h1>
            {report.reportId && <p className="text-xs text-gray-400 dark:text-gray-500">{t('common.reportId')}: {report.reportId}</p>}
          </div>
          <div className="flex items-center gap-3">
            {type === 'infrastructure' && (
              <ReportExport reportId={report.reportId} />
            )}
            <StatusBadge status={report.status} />
          </div>
        </div>

        {/* Photos */}
        {photos.length > 0 && (
          <div className="flex gap-3 mb-6 overflow-x-auto">
            {photos.map((p, i) => <img key={i} src={p} alt="" className="h-44 w-auto rounded-xl object-cover" />)}
          </div>
        )}

        {/* Videos */}
        {report.videos?.length > 0 && (
          <div className="flex gap-3 mb-6 overflow-x-auto">
            {report.videos.map((v, i) => <video key={i} src={v} controls className="h-44 rounded-xl" />)}
          </div>
        )}

        {/* Details Grid */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {type === 'infrastructure' ? (
            <>
              <Detail label={t('common.category')}             value={report.category} />
              <Detail label={t('common.severity')}             value={report.severityLevel} />
              <Detail label={t('common.region')}               value={report.region} />
              {report.zone && <Detail label={t('dashboard.zone') || 'Zone'} value={report.zone} />}
              {report.woreda && <Detail label={t('dashboard.woreda') || 'Woreda'} value={report.woreda} />}
              {report.kebele && <Detail label={t('dashboard.kebele') || 'Kebele'} value={report.kebele} />}
              <Detail label={t('common.city')}                 value={report.city} />
              <Detail label={t('common.location')}             value={report.specificLocation} />
              {report.address && <Detail label={t('dashboard.address') || 'Address'} value={report.address} />}
              {report.incidentDate && <Detail label={t('dashboard.incidentDate') || 'Incident Date'} value={new Date(report.incidentDate).toLocaleDateString()} />}
              <Detail label={t('common.dateReported')}        value={new Date(report.createdAt).toLocaleDateString()} />
              {report.autoAssignedOrganization && <Detail label={t('common.responsibleOrg')} value={report.autoAssignedOrganization} />}
              {report.assignedDepartment && <Detail label={t('common.assignedDept')} value={report.assignedDepartment} />}
              {report.assignedTo && <Detail label={t('dashboard.assignedTo') || 'Assigned To'} value={report.assignedTo.fullName} />}
            </>
          ) : (
            <>
              <Detail label={t('common.emergencyType')}       value={report.emergencyType} />
              <Detail label={t('common.priority')}             value={report.priorityLevel} />
              <Detail label={t('common.region')}               value={report.region} />
              <Detail label={t('common.city')}                 value={report.city} />
              <Detail label={t('common.peopleAffected')}      value={report.numberOfPeopleAffected} />
              <Detail label={t('common.dateReported')}        value={new Date(report.createdAt).toLocaleDateString()} />
              {report.assistanceProvided && <Detail label={t('common.assistanceProvided')} value={report.assistanceProvided} />}
            </>
          )}
        </div>

        {/* Description */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('common.description')}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{report.description}</p>
        </div>

        {/* Map */}
        {markers.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('common.location')}</p>
            <EthioMap markers={markers} center={[report.latitude, report.longitude]} zoom={12} height="280px" />
          </div>
        )}

        {/* Before & After Gallery (infrastructure only) */}
        {type === 'infrastructure' && (
          <div className="mb-6">
            <BeforeAfterGallery report={report} />
          </div>
        )}

        {/* Timeline (infrastructure only) */}
        {type === 'infrastructure' && report.timeline?.length > 0 && (
          <div className="mb-6">
            <ReportTimeline timeline={report.timeline} />
          </div>
        )}

        {/* Progress History (fallback for legacy data) */}
        {type !== 'infrastructure' && report.progressHistory?.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('common.progressHistory')}</p>
            <div className="space-y-2">
              {report.progressHistory.map((h, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{h.status}</span>
                    {h.note && <span className="text-gray-500 dark:text-gray-400"> — {h.note}</span>}
                    <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(h.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        {type === 'infrastructure' && (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
            <ReportComments report={report} userRole={null} onComplete={fetchReport} />
          </div>
        )}
      </div>
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
