import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { workflowComplaintAPI } from '../../../services/api';
import { toast } from 'react-toastify';

const WORKFLOW_STATUS_META = {
  pending:              { label: 'Pending',              color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: '⏳' },
  resolved_by_woreda:   { label: 'Resolved by Woreda',   color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',    icon: '✅' },
  pending_escalation:   { label: 'Pending Escalation',   color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: '🔺' },
  escalated_to_subcity: { label: 'Escalated to Subcity', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',            icon: '🚨' },
  resolved_by_subcity:  { label: 'Resolved by Subcity',  color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',        icon: '🏛️' },
};

const TIMELINE_ICONS = {
  created:              '📝',
  resolved_by_woreda:   '✅',
  pending_escalation:   '🔺',
  escalated_to_subcity: '🚨',
  resolved_by_subcity:  '🏛️',
  default:              '🔄',
};

const SUBCITY_LABELS = { BOLE: 'Bole', YEKA: 'Yeka', LEMMI_KURA: 'Lemmi Kura' };

export default function WorkflowComplaintDetail({ basePath = '/dashboard' }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);

  // Action modal state
  const [modal, setModal]       = useState(null);  // 'woreda-resolve' | 'woreda-escalate' | 'subcity-resolve'
  const [actionText, setActionText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const role      = user?.role;
  const isWoreda  = role === 'woreda';
  const isSubcity = role?.startsWith('subcity_');
  const isDept    = role === 'department';
  const isAdmin   = role === 'admin';

  useEffect(() => {
    (async () => {
      try {
        const res = await workflowComplaintAPI.getOne(id);
        setComplaint(res.data.data.complaint);
      } catch {
        toast.error('Complaint not found or not in your scope.');
        navigate(`${basePath}/workflow-complaints`);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, basePath, navigate]);

  const reload = async () => {
    const res = await workflowComplaintAPI.getOne(id);
    setComplaint(res.data.data.complaint);
  };

  const submitAction = async () => {
    if (!actionText.trim()) { toast.error('Please provide a resolution / reason.'); return; }
    setSubmitting(true);
    try {
      if (modal === 'woreda-resolve') {
        await workflowComplaintAPI.woredaResolve(id, { resolution: actionText });
        toast.success('Complaint resolved by woreda.');
      } else if (modal === 'woreda-escalate') {
        await workflowComplaintAPI.woredaEscalate(id, { reason: actionText });
        toast.success('Complaint escalated to subcity.');
      } else if (modal === 'subcity-resolve') {
        await workflowComplaintAPI.subcityResolve(id, { resolution: actionText });
        toast.success('Complaint resolved by subcity.');
      }
      setModal(null);
      setActionText('');
      await reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!complaint) return null;

  const sm = WORKFLOW_STATUS_META[complaint.workflowStatus] || WORKFLOW_STATUS_META.pending;
  const subcityLabel = SUBCITY_LABELS[complaint.subcity] || complaint.subcity;

  const canWoredaResolve  = (isWoreda || isAdmin) && complaint.workflowStatus === 'pending';
  const canWoredaEscalate = (isWoreda || isAdmin) && complaint.workflowStatus === 'pending';
  const canSubcityResolve = (isSubcity || isDept || isAdmin) && complaint.workflowStatus === 'escalated_to_subcity';

  const dl = (() => {
    if (!complaint.escalationDeadline || !['pending', 'pending_escalation'].includes(complaint.workflowStatus)) return null;
    const ms  = new Date(complaint.escalationDeadline) - Date.now();
    const hrs = Math.round(ms / 3600000);
    if (hrs <= 0)  return { text: 'Overdue — will auto-escalate shortly', cls: 'text-red-600 dark:text-red-400 font-semibold' };
    return { text: `Auto-escalates in ${hrs}h (${new Date(complaint.escalationDeadline).toLocaleString()})`, cls: 'text-yellow-600 dark:text-yellow-400' };
  })();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button onClick={() => navigate(`${basePath}/workflow-complaints`)}
        className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
        ← Back to list
      </button>

      {/* Header card */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sm.color}`}>
                {sm.icon} {sm.label}
              </span>
              <span className="text-xs text-gray-400">#{complaint.trackingNumber}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{complaint.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{complaint.description}</p>
          </div>
          <div className="flex-shrink-0 text-center text-sm">
            <div className="font-semibold text-gray-700 dark:text-gray-300">{complaint.priority}</div>
            <div className="text-xs text-gray-400">Priority</div>
          </div>
        </div>

        {dl && <p className={`mt-3 text-xs ${dl.cls}`}>{dl.text}</p>}

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Detail label="Department"  value={complaint.department} />
          <Detail label="Issue Type"  value={complaint.issueTypeName || '—'} />
          <Detail label="Subcity"     value={subcityLabel} />
          <Detail label="Woreda"      value={complaint.woredaName || '—'} />
          <Detail label="Submitted"   value={new Date(complaint.createdAt).toLocaleDateString()} />
          {complaint.resolvedAt && <Detail label="Resolved" value={new Date(complaint.resolvedAt).toLocaleDateString()} />}
        </div>

        {/* Reporter */}
        {!complaint.anonymous && (complaint.reporterName || complaint.reporter?.fullName) && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide font-medium">Reporter</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {complaint.reporter?.fullName || complaint.reporterName}
              {complaint.reporterPhone && <span className="ml-2 text-gray-400">{complaint.reporterPhone}</span>}
            </p>
          </div>
        )}

        {/* Resolutions */}
        {complaint.woredaResolution && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide font-medium">Woreda Resolution</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{complaint.woredaResolution}</p>
          </div>
        )}
        {complaint.subcityResolution && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide font-medium">Subcity Resolution</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{complaint.subcityResolution}</p>
          </div>
        )}

        {/* Action buttons */}
        {(canWoredaResolve || canWoredaEscalate || canSubcityResolve) && (
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-3">
            {canWoredaResolve && (
              <button onClick={() => setModal('woreda-resolve')}
                className="btn-primary text-sm px-4 py-2">
                ✅ Mark Resolved
              </button>
            )}
            {canWoredaEscalate && (
              <button onClick={() => setModal('woreda-escalate')}
                className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
                🔺 Escalate to Subcity
              </button>
            )}
            {canSubcityResolve && (
              <button onClick={() => setModal('subcity-resolve')}
                className="btn-primary text-sm px-4 py-2">
                🏛️ Resolve (Subcity)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Attachments */}
      {complaint.attachments?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Attachments</h3>
          <div className="flex flex-wrap gap-3">
            {complaint.attachments.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-primary-600 dark:text-primary-400 underline">
                Attachment {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Activity Timeline</h3>
        {(!complaint.timeline || complaint.timeline.length === 0) ? (
          <p className="text-sm text-gray-400">No timeline entries.</p>
        ) : (
          <ol className="relative border-l border-gray-200 dark:border-gray-700 space-y-5 ml-3">
            {[...complaint.timeline].reverse().map((entry, i) => (
              <li key={i} className="ml-5">
                <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-white dark:bg-gray-800 rounded-full ring-2 ring-gray-200 dark:ring-gray-700 text-base">
                  {TIMELINE_ICONS[entry.action] || TIMELINE_ICONS.default}
                </span>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                    {entry.action.replace(/_/g, ' ')}
                  </p>
                  {entry.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{entry.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 mt-1.5 text-xs text-gray-400">
                    {entry.performedByName && <span>By: {entry.performedByName}</span>}
                    {entry.performedByRole && <span className="capitalize">{entry.performedByRole.replace(/_/g, ' ')}</span>}
                    {entry.createdAt && <span>{new Date(entry.createdAt).toLocaleString()}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Action Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {modal === 'woreda-resolve'  && '✅ Resolve Complaint (Woreda)'}
              {modal === 'woreda-escalate' && '🔺 Escalate to Subcity'}
              {modal === 'subcity-resolve' && '🏛️ Resolve Complaint (Subcity)'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {modal === 'woreda-resolve'  && 'Describe how the issue was resolved at woreda level.'}
              {modal === 'woreda-escalate' && 'Explain why this complaint cannot be handled at woreda level.'}
              {modal === 'subcity-resolve' && 'Describe how the issue was resolved at subcity level.'}
            </p>
            <textarea
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              rows={4}
              placeholder={modal === 'woreda-escalate' ? 'Reason for escalation…' : 'Resolution details…'}
              className="input-field w-full text-sm resize-none"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setModal(null); setActionText(''); }}
                className="btn-secondary text-sm px-4 py-2" disabled={submitting}>
                Cancel
              </button>
              <button onClick={submitAction} disabled={submitting}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
                {submitting ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">{value}</p>
    </div>
  );
}
