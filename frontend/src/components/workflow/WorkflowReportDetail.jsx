import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { workflowAPI } from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import ReportTimeline from '../common/ReportTimeline';
import ReportComments from '../common/ReportComments';
import ForwardModal from './ForwardModal';
import ResolveModal from './ResolveModal';

const SEVERITY_COLORS = {
  Low: 'bg-gray-100 text-gray-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
};

const LEVEL_LABELS = {
  kebele: 'Kebele', woreda: 'Woreda/Sub-City', zone: 'Zone',
  regional_bureau: 'Regional Bureau', federal_ministry: 'Federal Ministry',
};

const ALL_LEVELS = ['kebele', 'woreda', 'zone', 'regional_bureau', 'federal_ministry'];

const FORWARD_TARGETS = {
  kebele: ['woreda'],
  woreda: ['zone', 'regional_bureau'],
  zone: ['regional_bureau'],
  regional_bureau: ['federal_ministry'],
  federal_ministry: [],
};

export default function WorkflowReportDetail({ reportId, onBack }) {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForward, setShowForward] = useState(false);
  const [showResolve, setShowResolve] = useState(false);

  const fetchReport = async () => {
    try {
      const res = await workflowAPI.getReportDetail(reportId);
      setReport(res.data.report);
    } catch (err) {
      toast.error('Failed to load report');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchReport(); }, [reportId]);

  if (loading) return <LoadingSpinner />;
  if (!report) return <div className="card text-center py-8 text-gray-500">Report not found</div>;

  const currentIdx = ALL_LEVELS.indexOf(report.currentLevel);
  const isResolved = ['Resolved', 'Rejected'].includes(report.status);
  const targets = FORWARD_TARGETS[report.currentLevel] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{report.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{report.reportId}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Report Details</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{report.description}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <div className="mt-1"><StatusBadge status={report.status} /></div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Category</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{report.category}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Severity</span>
                <p className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[report.severityLevel]}`}>{report.severityLevel}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Region</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{report.region}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Woreda</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{report.woreda || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Kebele</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{report.kebele || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Submitted By</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{report.submittedBy?.fullName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Date</span>
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{new Date(report.createdAt).toLocaleDateString()}</p>
              </div>
              {report.assignedTo && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Assigned Officer</span>
                  <p className="font-medium text-gray-800 dark:text-gray-200 mt-1">{report.assignedTo.fullName}</p>
                </div>
              )}
            </div>
          </div>

          {report.photos?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Photos</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {report.photos.map((p, i) => (
                  <img key={i} src={p} alt="" className="rounded-lg object-cover h-32 w-full" />
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <ReportComments report={report} userRole="government" onComplete={fetchReport} />
          </div>

          {report.forwardingHistory?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Forwarding History</h3>
              <div className="space-y-3">
                {report.forwardingHistory.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${f.action === 'forward' ? 'bg-blue-500' : f.action === 'close' ? 'bg-red-500' : 'bg-green-500'}`}>
                      {f.action === 'forward' ? '→' : f.action === 'close' ? '✕' : '✓'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.fromOfficerName}</span>
                        <span className="text-xs text-gray-400">{LEVEL_LABELS[f.fromLevel]}</span>
                        <span className="text-xs text-gray-400">→</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.toOfficerName || LEVEL_LABELS[f.toLevel]}</span>
                        <span className="text-xs text-gray-400">{LEVEL_LABELS[f.toLevel]}</span>
                      </div>
                      {f.comment && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.comment}</p>}
                      <p className="text-xs text-gray-400 mt-1">{new Date(f.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <ReportTimeline timeline={report.timeline || []} />
          </div>
        </div>

        <div className="space-y-6">
          {/* Vertical Workflow Path */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Workflow Path</h3>
            <div className="relative">
              <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-600" />

              {/* Citizen Submitted — always first */}
              <div className="relative flex items-start gap-3 pb-4">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold z-10 shrink-0">
                  ✓
                </div>
                <div className="pt-1">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Citizen Submitted</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {report.submittedBy?.fullName} — {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Administrative levels */}
              {ALL_LEVELS.map((level, i) => {
                const isCurrent = report.currentLevel === level;
                const isPast = currentIdx > i;
                const isResolvedHere = isResolved && isPast;

                return (
                  <div key={level} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 shrink-0 ${
                      isCurrent
                        ? 'bg-primary-600 text-white ring-4 ring-primary-200 dark:ring-primary-800'
                        : isPast
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                    }`}>
                      {isPast ? '✓' : i + 1}
                    </div>
                    <div className="pt-1">
                      <p className={`text-sm font-semibold ${
                        isCurrent
                          ? 'text-primary-700 dark:text-primary-300'
                          : isPast
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {LEVEL_LABELS[level]}
                        {isCurrent && !isResolved && (
                          <span className="ml-2 text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </p>
                      {isPast && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {report.forwardingHistory?.find(f => f.toLevel === level)
                            ? `${report.forwardingHistory.find(f => f.toLevel === level).fromOfficerName} → ${LEVEL_LABELS[level]}`
                            : `Reached ${LEVEL_LABELS[level]}`
                          }
                        </p>
                      )}
                      {isCurrent && isResolved && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Resolved</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Case Closed — final step if resolved */}
              {isResolved && (
                <div className="relative flex items-start gap-3 pb-0">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold z-10 shrink-0">
                    ✓
                  </div>
                  <div className="pt-1">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">Case Closed</p>
                    {report.resolvedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(report.resolvedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {!isResolved && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Actions</h3>
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                  Report is currently at <strong>{LEVEL_LABELS[report.currentLevel]}</strong> level.
                </p>
                <button onClick={() => setShowResolve(true)} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm">
                  {report.currentLevel === 'federal_ministry' ? '✕ Close Case' : '✓ Resolve Report'}
                </button>
                {targets.length > 0 && (
                  <button onClick={() => setShowForward(true)} className="w-full btn-primary text-sm py-2.5">
                    Forward → {targets.map(t => LEVEL_LABELS[t]).join(' / ')}
                  </button>
                )}
              </div>
            </div>
          )}

          {isResolved && (
            <div className="card bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="text-center py-2">
                <p className="text-2xl mb-1">✅</p>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">Report Resolved</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Resolved at {LEVEL_LABELS[report.currentLevel]} level
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ForwardModal report={report} isOpen={showForward} onClose={() => setShowForward(false)} onSuccess={fetchReport} />
      <ResolveModal
        report={report}
        isOpen={showResolve}
        onClose={() => setShowResolve(false)}
        onSuccess={fetchReport}
        isFederal={report.currentLevel === 'federal_ministry'}
      />
    </div>
  );
}
