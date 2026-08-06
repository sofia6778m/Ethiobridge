import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { governanceComplaintAPI } from '../../../services/api';
import { getWithRetry, isCanceledError, classifyError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ReportTimeline from '../../../components/common/ReportTimeline';
import { STATUS_COLORS, fmtDate, isClosed } from '../../../components/governance/governanceMeta';

function Meta({ label, value }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

const downloadBlob = (res, fallbackName) => {
  const disposition = res.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export default function CitizenGovernanceComplaintDetail() {
  const { id } = useParams();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const evidenceRef = useRef(null);
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

  const handleReopen = async () => {
    setReopening(true);
    try {
      await governanceComplaintAPI.reopen(id, { reason: 'Citizen requested reopen' });
      toast.success('Complaint reopened');
      setReopenOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reopen the complaint');
    } finally {
      setReopening(false);
    }
  };

  const handleEvidenceUpload = async () => {
    if (!evidenceFiles.length) { toast.error('Select files first'); return; }
    const fd = new FormData();
    evidenceFiles.forEach((f) => fd.append('evidence', f));
    setUploading(true);
    try {
      await governanceComplaintAPI.addEvidence(id, fd);
      toast.success('Evidence uploaded');
      setEvidenceFiles([]);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not upload evidence');
    } finally {
      setUploading(false);
    }
  };

  const handleAckDownload = async () => {
    setDownloading(true);
    try {
      const res = await governanceComplaintAPI.acknowledgment(id);
      downloadBlob(res, `governance-acknowledgment-${complaint?.trackingId || id}.pdf`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not download acknowledgment');
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmResolution = async () => {
    if (!window.confirm('Confirm that your complaint has been resolved to your satisfaction?')) return;
    setConfirming(true);
    try {
      await governanceComplaintAPI.confirmResolution(id);
      toast.success('Resolution confirmed');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not confirm resolution');
    } finally {
      setConfirming(false);
    }
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

  const canReopen = isClosed(complaint.status) && complaint.reopenedCount < 2;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/dashboard/citizen/governance-complaints" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          ← Back to my complaints
        </Link>
        <span className="text-xs text-gray-400">Submitted {fmtDate(complaint.createdAt)}</span>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{complaint.category}</h2>
            <p className="text-sm text-gray-500 mt-1">Tracking ID: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{complaint.trackingId}</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Assigned to {complaint.assignedToOffice || 'Subcity Governance Office'}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[complaint.status] || 'bg-gray-100 text-gray-600'}`}>{complaint.status}</span>
            {complaint.isOverdue && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue</span>}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 whitespace-pre-wrap">{complaint.description}</p>
      </div>

      {/* Actions */}
      <div className="card p-4 flex flex-wrap items-center gap-2">
        <button onClick={handleAckDownload} disabled={downloading} className="btn-secondary text-sm px-4 py-2">
          {downloading ? 'Downloading…' : '⬇️ Download Acknowledgment (PDF)'}
        </button>
        {canReopen && (
          <button onClick={() => setReopenOpen(true)} className="btn-secondary text-sm px-4 py-2">↩️ Reopen Complaint</button>
        )}
        {complaint.status === 'Resolved' && !complaint.confirmedByCitizen && (
          <button onClick={handleConfirmResolution} disabled={confirming} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors">
            {confirming ? 'Confirming…' : '✅ Confirm Resolution'}
          </button>
        )}
      </div>

      {complaint.status === 'Resolved' && !complaint.confirmedByCitizen && (
        <div className="card p-5 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Has your complaint been resolved?</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The Subcity Governance Office marked this complaint as resolved. If you are satisfied with the outcome,
            confirm below so the case can be closed in the registry.
          </p>
        </div>
      )}

      {reopenOpen && (
        <div className="card p-5 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Reopen this complaint?</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            You can reopen a resolved/rejected complaint within 15 days (up to 2 times). The Subcity Governance Office will review it again.
          </p>
          <div className="flex gap-2">
            <button onClick={handleReopen} disabled={reopening} className="btn-primary text-sm px-4 py-2">
              {reopening ? 'Reopening…' : 'Confirm Reopen'}
            </button>
            <button onClick={() => setReopenOpen(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Meta label="Subcity" value={complaint.subcity || '—'} />
        <Meta label="Woreda" value={complaint.woredaName || '—'} />
        <Meta label="Office / Bureau" value={complaint.office || '—'} />
        <Meta label="Incident Date" value={complaint.incidentDate ? new Date(complaint.incidentDate).toLocaleDateString() : '—'} />
        <Meta label="Incident Time" value={complaint.incidentTime || '—'} />
        <Meta label="Reported Anonymously" value={complaint.isAnonymous ? 'Yes' : 'No'} />
        {complaint.confirmedByCitizen && <Meta label="Resolution Confirmed" value={fmtDate(complaint.confirmedAt)} />}
      </div>

      {/* Evidence */}
      {(complaint.evidenceFiles?.length > 0 || complaint.officialDocuments?.length > 0) && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Evidence & Documents</h3>
          {complaint.evidenceFiles?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your evidence</p>
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
        </div>
      )}

      {/* Add evidence */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Add Additional Evidence</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Upload photos, PDFs, or audio to support your complaint.</p>
        <input ref={evidenceRef} type="file" multiple className="hidden"
          accept="image/*,video/mp4,video/mov,video/webm,audio/*,application/pdf"
          onChange={(e) => setEvidenceFiles(Array.from(e.target.files || []))} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => evidenceRef.current?.click()} className="btn-secondary text-sm px-4 py-2">Choose files</button>
          {evidenceFiles.length > 0 && (
            <>
              <span className="text-xs text-gray-500">{evidenceFiles.length} file(s) selected</span>
              <button onClick={handleEvidenceUpload} disabled={uploading} className="btn-primary text-sm px-4 py-2">
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Woreda coordination */}
      {complaint.woredaRequests?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Woreda Coordination</h3>
          <div className="space-y-3">
            {complaint.woredaRequests.map((r, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.request}</p>
                <p className="text-xs text-gray-500 mt-1">Requested {fmtDate(r.requestedAt)} · Due {fmtDate(r.dueAt)} · Status: <span className="font-medium">{r.status}</span></p>
                {r.response && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Response: {r.response}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {complaint.timeline?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Timeline</h3>
          <ReportTimeline timeline={complaint.timeline} />
        </div>
      )}

      {/* Audit trail */}
      {complaint.auditTrail?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Activity Log</h3>
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
    </div>
  );
}
