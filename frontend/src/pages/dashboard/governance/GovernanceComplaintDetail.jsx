import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { governanceComplaintAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError, classifyError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ReportTimeline from '../../../components/common/ReportTimeline';
import {
  STATUS_COLORS, REQUEST_STATUS_COLORS, ADMIN_ACTIONS,
  fmtDate, fmtShortDate, isClosed, ACTIVE_STATUSES,
} from '../../../components/governance/governanceMeta';

function Meta({ label, value }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function GovernanceComplaintDetail({ basePath }) {
  const { id } = useParams();
  const { user } = useAuth();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Action panels
  const [statusDraft, setStatusDraft] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [woredaMessage, setWoredaMessage] = useState('');
  const [respondRequestId, setRespondRequestId] = useState('');
  const [respondText, setRespondText] = useState('');
  const [respondFiles, setRespondFiles] = useState([]);
  const [docFiles, setDocFiles] = useState([]);
  const [actionDraft, setActionDraft] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionFiles, setActionFiles] = useState([]);
  const [resolutionNote, setResolutionNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [escalatedTo, setEscalatedTo] = useState('Subcity Administrator');
  const [citizenResponse, setCitizenResponse] = useState('');
  const [citizenResponseFiles, setCitizenResponseFiles] = useState([]);
  const [infoRequest, setInfoRequest] = useState('');
  const [busy, setBusy] = useState(false);

  const respondFileRef = useRef(null);
  const docFileRef = useRef(null);
  const actionFileRef = useRef(null);
  const citizenResponseFileRef = useRef(null);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getWithRetry(`/governance-complaints/${id}`, { signal, timeout: 10000 });
      if (signal.aborted) return;
      setComplaint(res.data.data);
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

  const role = user?.role;
  const isAdmin = ['admin', 'government', 'ADMIN'].includes(role);
  const isSubcityOfficer = isAdmin || ['subcity_admin', 'SUBCITY_ADMIN', 'SUBCITY_HEAD'].includes(role) || role === 'GOVERNANCE_OFFICER' || role === 'OFFICE_SUPERVISOR' || (role && role.startsWith('subcity_'));
  const isWoredaOfficer = ['woreda', 'woreda_admin', 'WOREDA_ADMIN', 'WOREDA_HEAD', 'OFFICER'].includes(role);
  const canManage = isSubcityOfficer; // managers = admin/subcity roles
  const canRespond = isWoredaOfficer;

  const run = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = () => {
    if (!statusDraft) { toast.error('Select a status'); return; }
    const payload = { status: statusDraft };
    if (statusNote.trim()) payload.note = statusNote.trim();
    if (statusDraft === 'Resolved') payload.resolutionNote = statusNote.trim() || 'Resolved by the Subcity Governance Office';
    if (statusDraft === 'Rejected') payload.rejectionReason = statusNote.trim();
    run(() => governanceComplaintAPI.updateStatus(id, payload), `Status changed to ${statusDraft}`);
  };

  const handleRequestWoreda = () => {
    if (!woredaMessage.trim()) { toast.error('Enter a request message'); return; }
    run(() => governanceComplaintAPI.requestWoredaInfo(id, { message: woredaMessage.trim() }), 'Request sent to the woreda');
  };

  const handleRespondWoreda = () => {
    if (!respondRequestId) { toast.error('Select the request to respond to'); return; }
    if (!respondText.trim()) { toast.error('Enter a response'); return; }
    const fd = new FormData();
    fd.append('requestId', respondRequestId);
    fd.append('response', respondText.trim());
    respondFiles.forEach((f) => fd.append('evidence', f));
    run(() => governanceComplaintAPI.respondWoreda(id, fd), 'Response submitted');
  };

  const handleAddNote = () => {
    if (!noteDraft.trim()) { toast.error('Enter a note'); return; }
    run(() => governanceComplaintAPI.addNote(id, { note: noteDraft.trim() }), 'Note added');
  };

  const handleUploadDocs = () => {
    if (!docFiles.length) { toast.error('Select files'); return; }
    const fd = new FormData();
    docFiles.forEach((f) => fd.append('documents', f));
    run(() => governanceComplaintAPI.uploadOfficialDocument(id, fd), 'Documents uploaded');
  };

  const handleRecordAction = () => {
    if (!actionDraft) { toast.error('Select an administrative action'); return; }
    const fd = new FormData();
    fd.append('action', actionDraft);
    if (actionNote.trim()) fd.append('note', actionNote.trim());
    actionFiles.forEach((f) => fd.append('evidence', f));
    run(() => governanceComplaintAPI.recordAdministrativeAction(id, fd), `Action recorded: ${actionDraft}`);
  };

  const handleResolve = () => {
    if (!resolutionNote.trim()) { toast.error('Enter a resolution note'); return; }
    run(() => governanceComplaintAPI.resolve(id, { resolutionNote: resolutionNote.trim() }), 'Complaint resolved');
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) { toast.error('Enter a rejection reason'); return; }
    run(() => governanceComplaintAPI.reject(id, { rejectionReason: rejectionReason.trim() }), 'Complaint rejected');
  };

  const handleEscalate = () => {
    if (!escalationReason.trim()) { toast.error('Enter an escalation reason'); return; }
    run(() => governanceComplaintAPI.escalate(id, { reason: escalationReason.trim(), escalatedTo }), `Escalated to ${escalatedTo}`);
  };

  const handleRespondToCitizen = () => {
    if (!citizenResponse.trim()) { toast.error('Enter a response message'); return; }
    const fd = new FormData();
    fd.append('message', citizenResponse.trim());
    citizenResponseFiles.forEach((f) => fd.append('evidence', f));
    run(() => governanceComplaintAPI.respondToCitizen(id, fd), 'Response sent to the citizen');
  };

  const handleRequestInfo = () => {
    if (!infoRequest.trim()) { toast.error('Enter what information is needed'); return; }
    run(() => governanceComplaintAPI.requestMoreInfo(id, { message: infoRequest.trim() }), 'Additional information requested');
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

  const pendingWoredaRequests = (complaint.woredaRequests || []).filter((r) => r.status === 'Pending');
  const closed = isClosed(complaint.status);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={basePath ? `${basePath}` : '/dashboard'} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          ← Back to governance complaints
        </Link>
        <span className="text-xs text-gray-400">Submitted {fmtDate(complaint.createdAt)}</span>
      </div>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{complaint.category}</h2>
            <p className="text-sm text-gray-500 mt-1">Tracking ID: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{complaint.trackingId}</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Assigned to {complaint.assignedToOffice || 'Subcity Governance Office'} · Level: {complaint.assignedLevel || 'Subcity'}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[complaint.status] || 'bg-gray-100 text-gray-600'}`}>{complaint.status}</span>
            {complaint.isOverdue && !closed && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue</span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 whitespace-pre-wrap">{complaint.description}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Meta label="Subcity" value={complaint.subcity || '—'} />
        <Meta label="Woreda" value={complaint.woredaName || '—'} />
        <Meta label="Office / Bureau" value={complaint.office || '—'} />
        <Meta label="Reporter" value={complaint.isAnonymous ? 'Anonymous' : (complaint.reporterName || '—')} />
        <Meta label="Phone (tracking)" value={complaint.reporterPhone || '—'} />
        <Meta label="Incident Date" value={complaint.incidentDate ? fmtShortDate(complaint.incidentDate) : '—'} />
        <Meta label="Incident Time" value={complaint.incidentTime || '—'} />
        <Meta label="SLA Due" value={complaint.slaDueAt ? fmtShortDate(complaint.slaDueAt) : '—'} />
        {complaint.resolvedAt && <Meta label="Resolved On" value={fmtDate(complaint.resolvedAt)} />}
        {complaint.escalatedAt && <Meta label="Escalated To" value={`${complaint.escalatedTo || ''} · ${fmtDate(complaint.escalatedAt)}`} />}
        {complaint.reopenedAt && <Meta label="Reopened On" value={fmtDate(complaint.reopenedAt)} />}
      </div>

      {/* Manager actions */}
      {canManage && !closed && (
        <Section title="Case Actions">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status update */}
            <div className="space-y-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Update Status</p>
              <select value={statusDraft} onChange={e => setStatusDraft(e.target.value)} className="input-field">
                <option value="">Select a status…</option>
                {['Under Review', 'Need More Information', 'In Progress', 'Investigation in Progress', 'Action Taken', 'Closed'].filter(s => s !== complaint.status).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <textarea rows={2} value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="Note (required for Rejected / optional otherwise)" className="input-field resize-none" />
              <button onClick={handleStatusChange} disabled={busy} className="btn-primary text-sm w-full">Apply Status</button>
            </div>

            {/* Respond to citizen */}
            <div className="space-y-2 border border-emerald-100 dark:border-emerald-800/40 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Respond to Citizen</p>
              <textarea rows={2} value={citizenResponse} onChange={e => setCitizenResponse(e.target.value)} placeholder="Official response to the reporter…" className="input-field resize-none" />
              <input ref={citizenResponseFileRef} type="file" multiple className="hidden" onChange={e => setCitizenResponseFiles(Array.from(e.target.files || []))} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => citizenResponseFileRef.current?.click()} className="btn-secondary text-sm">Attach files</button>
                {citizenResponseFiles.length > 0 && <span className="text-xs text-gray-500">{citizenResponseFiles.length} file(s)</span>}
                <button onClick={handleRespondToCitizen} disabled={busy} className="btn-primary text-sm ml-auto">Send Response</button>
              </div>
            </div>

            {/* Request more info from citizen */}
            <div className="space-y-2 border border-cyan-100 dark:border-cyan-800/40 rounded-lg p-3">
              <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wider">Request More Info from Citizen</p>
              <textarea rows={2} value={infoRequest} onChange={e => setInfoRequest(e.target.value)} placeholder="What additional information is needed?…" className="input-field resize-none" />
              <button onClick={handleRequestInfo} disabled={busy} className="btn-secondary text-sm w-full">Request Information</button>
            </div>

            {/* Request woreda info */}
            <div className="space-y-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Request Info from Woreda</p>
              <textarea rows={2} value={woredaMessage} onChange={e => setWoredaMessage(e.target.value)} placeholder="Official request to the woreda (5-day deadline)…" className="input-field resize-none" />
              <button onClick={handleRequestWoreda} disabled={busy} className="btn-secondary text-sm w-full">Send Request</button>
            </div>

            {/* Investigation note */}
            <div className="space-y-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Investigation Note</p>
              <textarea rows={2} value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Internal investigation note…" className="input-field resize-none" />
              <button onClick={handleAddNote} disabled={busy} className="btn-secondary text-sm w-full">Add Note</button>
            </div>

            {/* Official documents */}
            <div className="space-y-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Upload Official Documents</p>
              <input ref={docFileRef} type="file" multiple className="hidden" onChange={e => setDocFiles(Array.from(e.target.files || []))} />
              <button type="button" onClick={() => docFileRef.current?.click()} className="btn-secondary text-sm w-full">Choose documents</button>
              {docFiles.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">{docFiles.length} file(s)</span>
                  <button onClick={handleUploadDocs} disabled={busy} className="btn-primary text-sm px-3 py-1">Upload</button>
                </div>
              )}
            </div>

            {/* Administrative action */}
            <div className="space-y-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3 lg:col-span-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Record Administrative Action</p>
              <select value={actionDraft} onChange={e => setActionDraft(e.target.value)} className="input-field">
                <option value="">Select an action…</option>
                {ADMIN_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <textarea rows={2} value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="Details of the action taken…" className="input-field resize-none" />
              <input ref={actionFileRef} type="file" multiple className="hidden" onChange={e => setActionFiles(Array.from(e.target.files || []))} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => actionFileRef.current?.click()} className="btn-secondary text-sm">Attach files</button>
                {actionFiles.length > 0 && <span className="text-xs text-gray-500">{actionFiles.length} file(s)</span>}
                <button onClick={handleRecordAction} disabled={busy} className="btn-primary text-sm ml-auto">Record Action</button>
              </div>
            </div>
          </div>

          {/* Resolution / rejection / escalation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
            <div className="space-y-2 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Resolve</p>
              <textarea rows={2} value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="Resolution note…" className="input-field resize-none" />
              <button onClick={handleResolve} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-lg w-full transition-colors">Resolve Complaint</button>
            </div>
            <div className="space-y-2 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Reject</p>
              <textarea rows={2} value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Rejection reason (required)…" className="input-field resize-none" />
              <button onClick={handleReject} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg w-full transition-colors">Reject Complaint</button>
            </div>
            <div className="space-y-2 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Escalate</p>
              <select value={escalatedTo} onChange={e => setEscalatedTo(e.target.value)} className="input-field">
                <option value="Subcity Administrator">Subcity Administrator</option>
                <option value="Regional Bureau">Regional Bureau</option>
              </select>
              <textarea rows={2} value={escalationReason} onChange={e => setEscalationReason(e.target.value)} placeholder="Escalation reason…" className="input-field resize-none" />
              <button onClick={handleEscalate} disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 rounded-lg w-full transition-colors">Escalate Complaint</button>
            </div>
          </div>
        </Section>
      )}

      {/* Woreda response panel */}
      {canRespond && pendingWoredaRequests.length > 0 && (
        <Section title="Respond to Woreda Request">
          <div className="space-y-3">
            <select value={respondRequestId} onChange={e => setRespondRequestId(e.target.value)} className="input-field">
              <option value="">Select a pending request…</option>
              {pendingWoredaRequests.map(r => <option key={r._id} value={r._id}>{r.message}</option>)}
            </select>
            <textarea rows={3} value={respondText} onChange={e => setRespondText(e.target.value)} placeholder="Your official response…" className="input-field resize-none" />
            <input ref={respondFileRef} type="file" multiple className="hidden" onChange={e => setRespondFiles(Array.from(e.target.files || []))} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => respondFileRef.current?.click()} className="btn-secondary text-sm">Attach evidence</button>
              {respondFiles.length > 0 && <span className="text-xs text-gray-500">{respondFiles.length} file(s)</span>}
              <button onClick={handleRespondWoreda} disabled={busy} className="btn-primary text-sm ml-auto">Submit Response</button>
            </div>
          </div>
        </Section>
      )}

      {/* Evidence & documents */}
      {(complaint.evidenceFiles?.length > 0 || complaint.officialDocuments?.length > 0) && (
        <Section title="Evidence & Official Documents">
          {complaint.evidenceFiles?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Citizen evidence</p>
              <div className="flex flex-wrap gap-2">
                {complaint.evidenceFiles.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">📎 Evidence {i + 1}</a>
                ))}
              </div>
            </div>
          )}
          {complaint.officialDocuments?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Official documents</p>
              <div className="flex flex-wrap gap-2">
                {complaint.officialDocuments.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">📄 Official doc {i + 1}</a>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Officer responses */}
      {complaint.officerResponses?.length > 0 && (
        <Section title="Officer Responses">
          <div className="space-y-3">
            {complaint.officerResponses.map((r, i) => (
              <div key={i} className="border border-emerald-100 dark:border-emerald-800/40 rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{r.role === 'OFFICE_SUPERVISOR' ? 'Office Supervisor' : 'Governance Officer'}</p>
                  <span className="text-xs text-gray-500">{r.userName || '—'} · {fmtDate(r.at || r.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 whitespace-pre-wrap">{r.message}</p>
                {r.files?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {r.files.map((url, j) => (
                      <a key={j} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-600 underline">attachment {j + 1}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Woreda coordination */}
      {complaint.woredaRequests?.length > 0 && (
        <Section title="Woreda Coordination">
          <div className="space-y-3">
            {complaint.woredaRequests.map((r, i) => (
              <div key={i} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.message}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REQUEST_STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Requested by {r.requestedByName || '—'} · {fmtDate(r.requestedAt)} · Due {fmtDate(r.dueAt)}</p>
                {r.response && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-300">Response: {r.response}</p>
                    <p className="text-xs text-gray-500 mt-1">By {r.respondedByName || '—'} · {fmtDate(r.respondedAt)}</p>
                    {r.responseFiles?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {r.responseFiles.map((url, j) => (
                          <a key={j} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 underline">evidence {j + 1}</a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Admin actions */}
      {complaint.adminActions?.length > 0 && (
        <Section title="Administrative Actions">
          <div className="space-y-3">
            {complaint.adminActions.map((a, i) => (
              <div key={i} className="border-l-4 border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-r-lg p-3">
                <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">{a.action}</p>
                {a.note && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{a.note}</p>}
                <p className="text-xs text-gray-500 mt-1">Recorded by {a.recordedByName || '—'} · {fmtDate(a.recordedAt)}</p>
                {a.files?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {a.files.map((url, j) => (
                      <a key={j} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 underline">attachment {j + 1}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Investigation notes */}
      {complaint.investigationNotes?.length > 0 && (
        <Section title="Investigation Notes">
          <div className="space-y-3">
            {[...(complaint.investigationNotes || [])].reverse().map((n, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-200">{n.note}</p>
                <p className="text-xs text-gray-500 mt-1">{n.userName} ({n.role}) · {fmtDate(n.at)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Timeline */}
      {complaint.timeline?.length > 0 && (
        <Section title="Timeline">
          <ReportTimeline timeline={complaint.timeline} />
        </Section>
      )}

      {/* Audit trail */}
      {complaint.auditTrail?.length > 0 && (
        <Section title="Activity Log">
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
        </Section>
      )}

      <div className="text-center text-xs text-gray-400 pb-4">
        Active statuses: {ACTIVE_STATUSES.join(' · ')}
      </div>
    </div>
  );
}
