import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { municipalComplaintAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError, classifyError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ImageLightbox from '../../../components/common/ImageLightbox';
import ConfirmModal from '../../../components/common/ConfirmModal';
import StarRating from '../../../components/common/StarRating';
import { STATUS_COLORS, PRIORITY_COLORS, LEVEL_COLORS, fmtDate, fmtShortDate, isClosed } from './municipalMeta';

const OFFICER_ROLES = ['admin', 'government', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'department'];
const FIELD_ROLES = [...OFFICER_ROLES, 'technician'];

const ASSESSMENT_FIELDS = [
  { key: 'requiresSpecialEquipment', label: 'Requires special equipment' },
  { key: 'requiresBudgetAboveLimit', label: 'Requires budget above woreda limit' },
  { key: 'requiresSubcityApproval', label: 'Requires Subcity approval' },
  { key: 'affectsMoreThan50Households', label: 'Affects more than 50 households' },
  { key: 'publicSafetyRisk', label: 'Public safety risk' },
  { key: 'requiresMajorInfrastructureReplacement', label: 'Requires major infrastructure replacement' },
];

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];

function Meta({ label, value }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function Section({ title, children, tone }) {
  return (
    <div className={`card p-5 ${tone || ''}`}>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PhotoStrip({ items, onOpen }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
      {items.map((p, i) => (
        <button key={i} type="button" onClick={() => onOpen(p)} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
          <img src={p} alt={`Progress ${i + 1}`} className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  );
}

export default function MunicipalComplaintDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.role;

  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const evidenceRef = useRef(null);
  const abortRef = useRef(null);

  // Response form
  const [statusDraft, setStatusDraft] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState([]);

  // Assessment
  const [assessment, setAssessment] = useState({});
  const [assessmentNote, setAssessmentNote] = useState('');
  const [showForward, setShowForward] = useState(false);
  const [forwardReason, setForwardReason] = useState('');
  const [forwardDepartment, setForwardDepartment] = useState('');

  // Operational workflow modals
  const [modal, setModal] = useState(null); // 'reject' | 'inspector' | 'technician' | 'complete' | 'verify' | 'feedback'
  const [assignables, setAssignables] = useState([]);
  const [assignablesLoading, setAssignablesLoading] = useState(false);

  const [rejectReason, setRejectReason] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [inspectorVisitAt, setInspectorVisitAt] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');
  const [techId, setTechId] = useState('');
  const [techPriority, setTechPriority] = useState('Medium');
  const [techDueAt, setTechDueAt] = useState('');
  const [workOrderNotes, setWorkOrderNotes] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [completePhotos, setCompletePhotos] = useState([]);
  const completePhotosRef = useRef(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { title, message, fn, danger }

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getWithRetry(`/municipal-complaints/${id}`, { signal, timeout: 10000 });
      if (signal.aborted) return;
      const c = res.data.data;
      setComplaint(c);
      setStatusDraft(c.status);
      setAssessment(c.assessment || {});
      setAssessmentNote(c.assessment?.note || '');
      setForwardDepartment(c.assignedToDepartment || c.department || '');
    } catch (err) {
      if (signal.aborted || isCanceledError(err)) return;
      setLoadError(err);
      const kind = classifyError(err).kind;
      if (isToastableErrorKind(kind)) toast.error(errorMessageFor(err));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const applyResult = (res, msg) => {
    setComplaint(res.data.data);
    toast.success(msg);
  };

  const runAction = async (fn, okMsg) => {
    setUpdating(true);
    try {
      const res = await fn();
      applyResult(res, okMsg);
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const openAssignable = async (which) => {
    setModal(which);
    setAssignables([]);
    setAssignablesLoading(true);
    try {
      const params = { role: which === 'inspector' ? 'inspector' : 'technician' };
      if (which === 'inspector' && user?.subcity) params.subcity = user.subcity;
      if (which === 'inspector' && user?.woredaId) params.woredaId = user.woredaId;
      if (which === 'technician' && user?.woredaId) params.woredaId = user.woredaId;
      if (which === 'technician' && user?.department) params.department = user.department;
      const res = await municipalComplaintAPI.getAssignable(params);
      setAssignables(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load assignable staff');
    } finally {
      setAssignablesLoading(false);
    }
  };

  const closeModal = () => {
    setModal(null);
    setRejectReason(''); setInspectorId(''); setInspectorVisitAt(''); setInspectorNotes('');
    setTechId(''); setTechPriority('Medium'); setTechDueAt(''); setWorkOrderNotes('');
    setCompleteNotes(''); setCompletePhotos([]); setVerifyNote('');
    setFeedbackRating(0); setFeedbackComment('');
  };

  const doReject = async () => {
    if (!rejectReason.trim()) { toast.error('A rejection reason is required'); return; }
    await runAction(() => municipalComplaintAPI.reject(id, { reason: rejectReason }), 'Complaint rejected');
    closeModal();
  };

  const doAssignInspector = async () => {
    if (!inspectorId) { toast.error('Select an inspector'); return; }
    await runAction(() => municipalComplaintAPI.assignInspector(id, {
      inspectorId,
      visitAt: inspectorVisitAt || undefined,
      notes: inspectorNotes,
    }), 'Inspector assigned');
    closeModal();
  };

  const doAssignTechnician = async () => {
    if (!techId) { toast.error('Select a technician'); return; }
    await runAction(() => municipalComplaintAPI.assignTechnician(id, {
      technicianId: techId,
      priority: techPriority,
      dueAt: techDueAt || undefined,
      workOrderNotes,
    }), 'Technician assigned');
    closeModal();
  };

  const doCompleteWork = async () => {
    if (!completeNotes.trim()) { toast.error('Work completion notes are required'); return; }
    const fd = new FormData();
    fd.append('notes', completeNotes);
    completePhotos.forEach(p => fd.append('photos', p));
    const ok = await runAction(() => municipalComplaintAPI.completeWork(id, fd), 'Work completed — pending verification');
    closeModal();
    void ok;
  };

  const doVerify = async (verified) => {
    if (!verifyNote.trim()) { toast.error('A verification note is required'); return; }
    const ok = await runAction(() => municipalComplaintAPI.verifyResolution(id, { note: verifyNote, verified }),
      verified ? 'Resolution verified — complaint resolved' : 'Sent back for rework');
    closeModal();
    void ok;
  };

  const doFeedback = async () => {
    if (!feedbackRating) { toast.error('Select a rating'); return; }
    const ok = await runAction(() => municipalComplaintAPI.feedback(id, { rating: feedbackRating, comment: feedbackComment }),
      'Feedback submitted — thank you');
    closeModal();
    void ok;
  };

  if (loading) return <LoadingSpinner />;
  if (loadError && !complaint) {
    return (
      <div className="card p-12 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="font-medium text-gray-800 dark:text-gray-200">Could not load complaint</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{errorMessageFor(loadError)}</p>
        <button onClick={load} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
      </div>
    );
  }
  if (!complaint) return <div className="card p-12 text-center text-gray-400">Complaint not found.</div>;

  const closed = isClosed(complaint.status);
  const isOfficer = OFFICER_ROLES.includes(role);
  const isManager = isOfficer;
  const isAdmin = role === 'admin' || role === 'government';
  const isWoreda = role === 'woreda';
  const isSubcityRole = role?.startsWith('subcity_');
  const isTechnician = role === 'technician';
  const isCitizen = role === 'citizen';
  const isAssignedTechnician = isTechnician && complaint.technicianId && String(complaint.technicianId) === String(user?._id);
  const isReporter = complaint.reporter && String(complaint.reporter) === String(user?._id);

  const canAssess = (isWoreda || isAdmin || isSubcityRole) && complaint.assignedLevel === 'Woreda' && !closed;
  const canForward = (isWoreda || isAdmin) && complaint.assignedLevel === 'Woreda' && !closed;
  const canEscalateToAdmin = (isSubcityRole || isWoreda || isAdmin || role === 'department') &&
    complaint.assignedLevel === 'Subcity' && complaint.escalatedTo !== 'Subcity Administrator' && !closed;
  const canRespond = isManager && !closed;

  // Operational workflow permissions
  const canAccept = isOfficer && complaint.status === 'Submitted';
  const canReject = isOfficer && !closed;
  const canAssign = isOfficer && !closed;
  const canStartWork = (isAssignedTechnician || isOfficer) && complaint.status === 'Assigned';
  const canCompleteWork = FIELD_ROLES.includes(role) && complaint.status === 'In Progress';
  const canVerify = isOfficer && complaint.status === 'Completed';
  const canClose = isOfficer && complaint.status === 'Resolved';
  const canReopen = isOfficer && closed;
  const canGiveFeedback = isCitizen && isReporter && complaint.status === 'Resolved' && !complaint.citizenFeedback?.rating;

  const hasActions = canAccept || canReject || canAssign || canStartWork || canCompleteWork || canVerify || canClose || canReopen || canGiveFeedback;

  const media = [...(complaint.photos || []), ...(complaint.videos || [])];
  const responses = [...(complaint.responses || [])].reverse();
  const assessmentEntry = complaint.assessment || {};
  const workProgress = [...(complaint.workProgress || [])].reverse();

  // ── Legacy actions ──────────────────────────────────────────────────────────

  const saveAssessment = async (forward = false) => {
    setUpdating(true);
    try {
      const payload = { ...assessment, note: assessmentNote, forward: forward ? 'true' : 'false' };
      const res = await municipalComplaintAPI.assess(id, payload);
      setComplaint(res.data.data);
      toast.success(forward ? 'Assessment saved and complaint forwarded to Subcity' : 'Assessment saved');
      setShowForward(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save assessment');
    } finally {
      setUpdating(false);
    }
  };

  const forwardNow = async () => {
    if (!forwardReason.trim()) { toast.error('A forward reason is required'); return; }
    setUpdating(true);
    try {
      const res = await municipalComplaintAPI.forward(id, { forwardReason, department: forwardDepartment });
      setComplaint(res.data.data);
      toast.success('Complaint forwarded to Subcity');
      setShowForward(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not forward complaint');
    } finally {
      setUpdating(false);
    }
  };

  const submitResponse = async (e) => {
    e.preventDefault();
    if (!responseMessage.trim() && statusDraft === complaint.status && evidenceFiles.length === 0 && !technicianName.trim() && !internalNote.trim()) {
      toast.error('Add a response message, status change, or note');
      return;
    }
    setUpdating(true);
    try {
      const fd = new FormData();
      fd.append('status', statusDraft);
      fd.append('responseMessage', responseMessage);
      fd.append('technicianName', technicianName);
      fd.append('internalNote', internalNote);
      evidenceFiles.forEach(f => fd.append('evidence', f));
      const res = await municipalComplaintAPI.updateStatus(id, fd);
      setComplaint(res.data.data);
      setResponseMessage(''); setTechnicianName(''); setInternalNote(''); setEvidenceFiles([]);
      toast.success('Complaint updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update complaint');
    } finally {
      setUpdating(false);
    }
  };

  const escalate = async () => {
    if (!window.confirm('Escalate this complaint to the Subcity Administrator?')) return;
    setUpdating(true);
    try {
      const res = await municipalComplaintAPI.escalate(id, { reason: 'Manual escalation by officer' });
      setComplaint(res.data.data);
      toast.success('Complaint escalated to Subcity Administrator');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not escalate');
    } finally {
      setUpdating(false);
    }
  };

  const addNoteOnly = async () => {
    if (!internalNote.trim()) { toast.error('Note text is required'); return; }
    setUpdating(true);
    try {
      const res = await municipalComplaintAPI.addNote(id, { note: internalNote });
      setComplaint(res.data.data);
      setInternalNote('');
      toast.success('Internal note added');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add note');
    } finally {
      setUpdating(false);
    }
  };

  const check = (key) => !!assessment[key];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to=".." className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Back to complaints</Link>
        <span className="text-xs text-gray-400">Submitted {fmtDate(complaint.createdAt)}</span>
      </div>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{complaint.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Tracking ID: <span className="font-mono font-semibold">{complaint.trackingId}</span></p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[complaint.status] || 'bg-gray-100 text-gray-600'}`}>{complaint.status}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[complaint.priority] || 'bg-gray-100 text-gray-600'}`}>{complaint.priority} priority</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${LEVEL_COLORS[complaint.assignedLevel] || 'bg-gray-100 text-gray-600'}`}>{complaint.assignedLevel} level</span>
            {complaint.isOverdue && !closed && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue (SLA {fmtShortDate(complaint.slaDueAt)})</span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 whitespace-pre-wrap">{complaint.description}</p>
      </div>

      {/* Operational action bar */}
      {hasActions && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          {canAccept && (
            <button onClick={() => runAction(() => municipalComplaintAPI.accept(id), 'Complaint accepted — under review')} disabled={updating} className="btn-primary text-sm">✓ Accept</button>
          )}
          {canReject && (
            <button onClick={() => setModal('reject')} disabled={updating} className="btn-danger text-sm">✕ Reject</button>
          )}
          {canAssign && (
            <>
              <button onClick={() => openAssignable('inspector')} disabled={updating} className="btn-secondary text-sm">👁 Assign Inspector</button>
              <button onClick={() => openAssignable('technician')} disabled={updating} className="btn-secondary text-sm">🔧 Assign Technician</button>
            </>
          )}
          {canStartWork && (
            <button onClick={() => setConfirmAction({ title: 'Start work', message: `Start work on ${complaint.trackingId}?`, fn: () => municipalComplaintAPI.startWork(id), danger: false })} disabled={updating} className="btn-primary text-sm">▶ Start Work</button>
          )}
          {canCompleteWork && (
            <button onClick={() => setModal('complete')} disabled={updating} className="btn-primary text-sm">✅ Complete Work</button>
          )}
          {canVerify && (
            <button onClick={() => setModal('verify')} disabled={updating} className="btn-primary text-sm">🔎 Verify Resolution</button>
          )}
          {canClose && (
            <button onClick={() => setConfirmAction({ title: 'Close complaint', message: `Close ${complaint.trackingId}?`, fn: () => municipalComplaintAPI.close(id), danger: false })} disabled={updating} className="btn-secondary text-sm">🔒 Close</button>
          )}
          {canReopen && (
            <button onClick={() => setConfirmAction({ title: 'Reopen complaint', message: `Reopen ${complaint.trackingId}?`, fn: () => municipalComplaintAPI.reopen(id), danger: false })} disabled={updating} className="btn-secondary text-sm">↩ Reopen</button>
          )}
          {canGiveFeedback && (
            <button onClick={() => setModal('feedback')} disabled={updating} className="btn-secondary text-sm">⭐ Rate Resolution</button>
          )}
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Meta label="Assigned Office" value={complaint.assignedToDepartment || complaint.department || '—'} />
        <Meta label="Subcity / Woreda" value={`${complaint.subcity || '—'} / ${complaint.woredaName || '—'}`} />
        <Meta label="Issue Type" value={complaint.issueType || '—'} />
        <Meta label="Technician" value={complaint.technicianName || '—'} />
        <Meta label="Reporter" value={complaint.reporterName || '—'} />
        <Meta label="Phone" value={complaint.reporterPhone || '—'} />
        <Meta label="Location" value={complaint.locationText || '—'} />
        <Meta label="GPS" value={complaint.latitude ? `${complaint.latitude}, ${complaint.longitude}` : '—'} />
      </div>

      {/* Evidence */}
      {media.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Evidence ({media.length})</h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {media.map((m, i) =>
              m.match(/\.(mp4|mov|webm|m3u8)/i) ? (
                <video key={i} src={m} controls className="rounded-lg aspect-video object-cover w-full" />
              ) : (
                <button key={i} type="button" onClick={() => setLightbox(m)} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img src={m} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Inspector / technician assignment details */}
      {(complaint.inspectorId || complaint.technicianId) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {complaint.inspectorId && (
            <Section title="Inspector">
              <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <p><span className="text-gray-500">Assigned to:</span> <span className="font-medium">{complaint.inspectorName || '—'}</span></p>
                <p><span className="text-gray-500">Visit:</span> {fmtDate(complaint.inspectorVisitAt)}</p>
                {complaint.inspectorNotes && <p><span className="text-gray-500">Notes:</span> {complaint.inspectorNotes}</p>}
                {complaint.inspectorFindings && <p><span className="text-gray-500">Findings:</span> {complaint.inspectorFindings}</p>}
              </div>
            </Section>
          )}
          {complaint.technicianId && (
            <Section title="Work Order">
              <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <p><span className="text-gray-500">Assigned to:</span> <span className="font-medium">{complaint.technicianName || '—'}</span></p>
                <p><span className="text-gray-500">Priority:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[complaint.technicianPriority] || 'bg-gray-100 text-gray-600'}`}>{complaint.technicianPriority || '—'}</span></p>
                <p><span className="text-gray-500">Due by:</span> {fmtDate(complaint.technicianDueAt)}</p>
                {complaint.workOrderNotes && <p><span className="text-gray-500">Work order notes:</span> {complaint.workOrderNotes}</p>}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Work progress timeline */}
      {workProgress.length > 0 && (
        <Section title="Work Progress">
          <ol className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 space-y-4">
            {workProgress.map((p, i) => (
              <li key={i} className="ml-5">
                <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary-500" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.step} <span className="text-xs font-normal text-gray-500">— {p.byName || '—'} · {fmtDate(p.at)}</span></p>
                {p.notes && <p className="text-xs text-gray-500 mt-0.5">{p.notes}</p>}
                <PhotoStrip items={p.beforePhotos} onOpen={setLightbox} />
                <PhotoStrip items={p.afterPhotos} onOpen={setLightbox} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Resolution verification */}
      {complaint.resolutionVerification?.verifiedAt && (
        <Section title="Resolution Verification">
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <p><span className="text-gray-500">Verified by:</span> <span className="font-medium">{complaint.resolutionVerification.verifiedByName || '—'}</span> · {fmtDate(complaint.resolutionVerification.verifiedAt)}</p>
            <p><span className="text-gray-500">Result:</span> {complaint.resolutionVerification.verified ? '✅ Verified' : '❌ Sent back for rework'}</p>
            {complaint.resolutionVerification.verificationNote && <p><span className="text-gray-500">Note:</span> {complaint.resolutionVerification.verificationNote}</p>}
          </div>
        </Section>
      )}

      {/* Citizen feedback */}
      {complaint.citizenFeedback?.rating && (
        <Section title="Citizen Feedback">
          <StarRating rating={complaint.citizenFeedback.rating} readonly />
          {complaint.citizenFeedback.comment && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">“{complaint.citizenFeedback.comment}”</p>}
          <p className="text-xs text-gray-400 mt-1">{fmtDate(complaint.citizenFeedback.at)}</p>
        </Section>
      )}

      {/* Woreda assessment */}
      {canAssess && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Woreda Assessment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ASSESSMENT_FIELDS.map(f => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={check(f.key)} onChange={e => setAssessment(prev => ({ ...prev, [f.key]: e.target.checked }))} className="accent-primary-600" />
                {f.label}
              </label>
            ))}
          </div>
          <textarea rows={2} value={assessmentNote} onChange={e => setAssessmentNote(e.target.value)} placeholder="Assessment note (optional)" className="input-field mt-3" />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button onClick={() => saveAssessment(false)} disabled={updating} className="btn-secondary">{updating ? 'Saving…' : 'Save Assessment'}</button>
            <button onClick={() => saveAssessment(true)} disabled={updating} className="btn-primary">Forward to Subcity</button>
          </div>
          <p className="text-xs text-gray-400 mt-2">If any critical condition is checked, use “Forward to Subcity” to route this to the Subcity department.</p>
        </div>
      )}

      {/* Forward form */}
      {canForward && showForward && (
        <div className="card p-5 border-2 border-primary-200 dark:border-primary-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Forward to Subcity</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subcity department</label>
              <input value={forwardDepartment} onChange={e => setForwardDepartment(e.target.value)} placeholder="e.g. Electricity" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Forward reason *</label>
              <textarea rows={3} value={forwardReason} onChange={e => setForwardReason(e.target.value)} placeholder="Explain why this requires Subcity authority…" className="input-field" />
            </div>
            <div className="flex gap-3">
              <button onClick={forwardNow} disabled={updating} className="btn-primary">{updating ? 'Forwarding…' : 'Confirm Forward'}</button>
              <button onClick={() => setShowForward(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Response / status form */}
      {canRespond && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Update Complaint</h3>
          <form onSubmit={submitResponse} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select value={statusDraft} onChange={e => setStatusDraft(e.target.value)} className="input-field">
                  {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assign technician</label>
                <input value={technicianName} onChange={e => setTechnicianName(e.target.value)} placeholder="Technician name" className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Response message</label>
              <textarea rows={3} value={responseMessage} onChange={e => setResponseMessage(e.target.value)} placeholder="Message to the citizen / resolution note…" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Internal note (not shown to citizen)</label>
              <input value={internalNote} onChange={e => setInternalNote(e.target.value)} placeholder="Internal note…" className="input-field" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={evidenceRef} type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={e => setEvidenceFiles(Array.from(e.target.files || []))} />
              <button type="button" onClick={() => evidenceRef.current?.click()} className="btn-secondary text-sm">
                {evidenceFiles.length ? `📎 ${evidenceFiles.length} evidence file(s) selected` : '📎 Attach evidence'}
              </button>
              <button type="submit" disabled={updating} className="btn-primary">{updating ? 'Saving…' : 'Save'}</button>
              {canEscalateToAdmin && (
                <button type="button" onClick={escalate} disabled={updating} className="btn-danger">Escalate to Subcity Administrator</button>
              )}
              {canForward && !showForward && (
                <button type="button" onClick={() => setShowForward(true)} className="btn-secondary">Forward to Subcity</button>
              )}
            </div>
          </form>
          {canRespond && <button onClick={addNoteOnly} disabled={updating} className="text-sm text-primary-600 mt-2">Add note without updating status</button>}
        </div>
      )}

      {/* Responses */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Response History</h3>
        {responses.length === 0 ? (
          <p className="text-sm text-gray-400">No responses yet.</p>
        ) : (
          <div className="space-y-3">
            {responses.map((r, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.officerName || 'Officer'} <span className="text-xs font-normal text-gray-500">({r.fromLevel})</span></p>
                  <p className="text-xs text-gray-400">{fmtDate(r.at)}</p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{r.message}</p>
                {r.evidenceFiles && r.evidenceFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.evidenceFiles.map((f, j) => (
                      <a key={j} href={f} target="_blank" rel="noreferrer" className="text-xs text-primary-600 underline">evidence {j + 1}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Escalation / forwarding history */}
      {(complaint.escalationHistory?.length > 0 || complaint.forwardReason) && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Escalation History</h3>
          <div className="space-y-3">
            {complaint.forwardReason && (
              <div className="p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border-l-4 border-orange-400">
                <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">Forwarded to Subcity — {fmtDate(complaint.forwardedAt)}</p>
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">{complaint.forwardReason} · by {complaint.forwardedByName}</p>
              </div>
            )}
            {[...(complaint.escalationHistory || [])].reverse().map((e, i) => (
              <div key={i} className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border-l-4 border-red-400">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">{e.fromLevel} → {e.toLevel} {e.triggeredBy === 'sla' && '(automatic — SLA)'}</p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">{e.reason} · {e.triggeredByName} · {fmtDate(e.at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Internal notes (managers only) */}
      {isManager && complaint.internalNotes?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Internal Notes</h3>
          <div className="space-y-2">
            {[...(complaint.internalNotes || [])].reverse().map((n, i) => (
              <div key={i} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-500">{n.userName} ({n.role}) · {fmtDate(n.at)}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{n.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit trail */}
      {complaint.auditTrail?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Audit Trail</h3>
          <ol className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 space-y-3">
            {[...(complaint.auditTrail || [])].reverse().map((a, i) => (
              <li key={i} className="ml-5">
                <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary-500" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{a.action}</p>
                <p className="text-xs text-gray-500">{a.userName} ({a.role}) · {fmtDate(a.at)}</p>
                {a.details && <p className="text-xs text-gray-400 mt-0.5">{a.details}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {modal === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reject Complaint</h3>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection *" className="input-field" />
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={doReject} disabled={updating} className="btn-danger text-sm px-4 py-2">{updating ? 'Rejecting…' : 'Confirm Reject'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'inspector' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assign Inspector</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Inspector *</label>
              <select value={inspectorId} onChange={e => setInspectorId(e.target.value)} className="input-field">
                <option value="">{assignablesLoading ? 'Loading…' : 'Select inspector'}</option>
                {assignables.map(u => <option key={u._id} value={u._id}>{u.fullName}{u.subcity ? ` (${u.subcity})` : ''}</option>)}
              </select>
              {!assignablesLoading && assignables.length === 0 && <p className="text-xs text-amber-600 mt-1">No active inspectors available.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scheduled visit</label>
              <input type="datetime-local" value={inspectorVisitAt} onChange={e => setInspectorVisitAt(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Inspection notes</label>
              <textarea rows={2} value={inspectorNotes} onChange={e => setInspectorNotes(e.target.value)} className="input-field" placeholder="What should the inspector verify?" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={doAssignInspector} disabled={updating || assignablesLoading} className="btn-primary text-sm px-4 py-2">{updating ? 'Assigning…' : 'Assign Inspector'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'technician' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assign Technician</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Technician *</label>
              <select value={techId} onChange={e => setTechId(e.target.value)} className="input-field">
                <option value="">{assignablesLoading ? 'Loading…' : 'Select technician'}</option>
                {assignables.map(u => <option key={u._id} value={u._id}>{u.fullName}{u.department ? ` (${u.department})` : ''}</option>)}
              </select>
              {!assignablesLoading && assignables.length === 0 && <p className="text-xs text-amber-600 mt-1">No active technicians available.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <select value={techPriority} onChange={e => setTechPriority(e.target.value)} className="input-field">
                  {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due by</label>
                <input type="datetime-local" value={techDueAt} onChange={e => setTechDueAt(e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work order notes</label>
              <textarea rows={2} value={workOrderNotes} onChange={e => setWorkOrderNotes(e.target.value)} className="input-field" placeholder="e.g. Replace bulb and test circuit" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={doAssignTechnician} disabled={updating || assignablesLoading} className="btn-primary text-sm px-4 py-2">{updating ? 'Assigning…' : 'Assign Technician'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'complete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Complete Work</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Completion notes *</label>
              <textarea rows={3} value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} className="input-field" placeholder="What work was done?" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">After-work photos</label>
              <input ref={completePhotosRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => setCompletePhotos(Array.from(e.target.files || []))} />
              <button type="button" onClick={() => completePhotosRef.current?.click()} className="btn-secondary text-sm">
                {completePhotos.length ? `📷 ${completePhotos.length} photo(s) selected` : '📷 Attach photos'}
              </button>
              {completePhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {completePhotos.map((p, i) => <span key={i} className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{p.name}</span>)}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={doCompleteWork} disabled={updating} className="btn-primary text-sm px-4 py-2">{updating ? 'Submitting…' : 'Submit for Verification'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'verify' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Verify Resolution</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verification note *</label>
              <textarea rows={3} value={verifyNote} onChange={e => setVerifyNote(e.target.value)} className="input-field" placeholder="Confirm the work is satisfactory…" />
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <button onClick={closeModal} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={() => doVerify(false)} disabled={updating} className="btn-danger text-sm px-4 py-2">Send Back for Rework</button>
              <button onClick={() => doVerify(true)} disabled={updating} className="btn-primary text-sm px-4 py-2">{updating ? 'Verifying…' : 'Approve & Resolve'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'feedback' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rate the Resolution</h3>
            <div>
              <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your rating</p>
              <StarRating rating={feedbackRating} onRate={setFeedbackRating} size="lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comment (optional)</label>
              <textarea rows={2} value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="input-field" placeholder="How was the service?" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={doFeedback} disabled={updating} className="btn-primary text-sm px-4 py-2">{updating ? 'Submitting…' : 'Submit Feedback'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        loading={updating}
        confirmLabel="Confirm"
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          await runAction(confirmAction.fn, 'Done');
          setConfirmAction(null);
        }}
      />

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
