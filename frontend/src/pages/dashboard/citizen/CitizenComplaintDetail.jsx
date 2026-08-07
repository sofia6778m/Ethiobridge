import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { governanceComplaintAPI } from '../../../services/api';
import { fetchComplaintDetail, TYPE_KEYS } from '../../../services/complaintService';
import { isCanceledError, classifyError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ComplaintTimeline from '../../../components/common/ComplaintTimeline';
import ImageLightbox from '../../../components/common/ImageLightbox';
import {
  STATUS_COLORS as GOV_STATUS_COLORS,
  fmtDate,
  isClosed,
  displayStatus,
} from '../../../components/governance/governanceMeta';

function Meta({ label, value }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{value || '—'}</p>
    </div>
  );
}

function statusColor(status) {
  return GOV_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
}

function priorityColor(priority) {
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
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

const CLOSED = ['Resolved', 'Rejected', 'Closed'];

export default function CitizenComplaintDetail() {
  const { type, id } = useParams();
  const typeKey = TYPE_KEYS[type] || null;
  const isGovernance = typeKey === 'governance';
  const isInfrastructure = typeKey === 'infrastructure';

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
  const [replying, setReplying] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const evidenceRef = useRef(null);
  const replyFilesRef = useRef(null);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchComplaintDetail({ typeKey, id, signal });
      if (signal.aborted) return;
      setItem(result);
    } catch (err) {
      if (signal.aborted || isCanceledError(err)) return;
      setLoadError(err);
      const kind = classifyError(err).kind;
      if (isToastableErrorKind(kind)) toast.error(errorMessageFor(err));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [typeKey, id]);

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

  const handleReply = async () => {
    if (!replyMessage.trim()) { toast.error('Write a message first'); return; }
    const fd = new FormData();
    fd.append('message', replyMessage.trim());
    replyFiles.forEach((f) => fd.append('evidence', f));
    setReplying(true);
    try {
      await governanceComplaintAPI.citizenReply(id, fd);
      toast.success('Reply sent to the office');
      setReplyMessage('');
      setReplyFiles([]);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send your reply');
    } finally {
      setReplying(false);
    }
  };

  const handleAckDownload = async () => {
    setDownloading(true);
    try {
      const res = await governanceComplaintAPI.acknowledgment(id);
      downloadBlob(res, `governance-acknowledgment-${item?.refId || id}.pdf`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not download the letter');
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

  const handleRatingSubmit = async () => {
    if (!ratingValue) { toast.error('Select a rating'); return; }
    setRatingSubmitting(true);
    try {
      const payload = { rating: ratingValue, comment: ratingComment.trim() };
      await governanceComplaintAPI.feedback(id, payload);
      toast.success('Thank you for your feedback');
      setRatingOpen(false);
      setRatingValue(0);
      setRatingComment('');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit feedback');
    } finally {
      setRatingSubmitting(false);
    }
  };

  if (!typeKey) {
    return (
      <div className="card p-12 text-center text-gray-500 dark:text-gray-400">
        Unknown complaint type.
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;
  if (loadError && !item) {
    return (
      <div className="card p-12 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="font-medium text-gray-800 dark:text-gray-200">Could not load complaint</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{errorMessageFor(loadError)}</p>
        <button onClick={load} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
      </div>
    );
  }
  if (!item) return <div className="card p-12 text-center text-gray-400">Complaint not found.</div>;

  const raw = item.raw || {};
  const isOwner = item.isOwner !== false;
  const canReopen = isGovernance && isClosed(item.status) && raw.reopenedCount < 2;
  const isActive = !CLOSED.includes(item.status);
  const alreadyRated = !!(raw.citizenFeedback && raw.citizenFeedback.rating);

  const media = isInfrastructure
    ? [...(raw.photos || []), ...(raw.videos || [])]
    : [];

  // Conversation feed (governance): interleave officer responses + citizen replies.
  const conversation = isGovernance
    ? [
        ...(raw.officerResponses || []).map((r) => ({ ...r, from: 'office', sender: r.userName || 'Office', at: r.at })),
        ...(raw.citizenReplies || []).map((r) => ({ ...r, from: 'citizen', sender: r.userName || 'You', at: r.at })),
      ].sort((a, b) => new Date(a.at) - new Date(b.at))
    : [];

  const showInvestigation = isGovernance
    ? (raw.investigationNotes || []).length > 0
    : false;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={isOwner ? '/dashboard/citizen/my-complaints' : '/dashboard/citizen/public-complaints'} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          ← Back to {isOwner ? 'My Complaints' : 'Public Complaints'}
        </Link>
        <span className="text-xs text-gray-400">Submitted {fmtDate(item.createdAt)}</span>
      </div>

      {!isOwner && (
        <div className="card p-4 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This is a public complaint shared by another citizen. You can follow its progress here, but only the reporter can take action.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {item.type}
              </span>
              {item.category && item.category !== '—' && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{item.category}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{item.title}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Tracking ID: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{item.refId}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor(item.status)}`}>
              {isGovernance ? displayStatus(item.status, raw) : item.status}
            </span>
            {item.priority && item.priority !== '—' && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${priorityColor(item.priority)}`}>{item.priority} priority</span>
            )}
            {isGovernance && raw.isOverdue && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue</span>
            )}
          </div>
        </div>
        {item.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 whitespace-pre-wrap">{item.description}</p>
        )}
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Meta label="Government Office" value={item.office} />
        <Meta label="Subcity" value={item.subcity} />
        <Meta label="Woreda" value={item.woredaName} />
        <Meta label="Priority" value={item.priority} />
        <Meta label="Current Status" value={isGovernance ? displayStatus(item.status, raw) : item.status} />
        <Meta label="Assigned To" value={item.assignedTo} />
        <Meta label="Submitted" value={fmtDate(item.createdAt)} />
        <Meta label="Last Updated" value={fmtDate(item.updatedAt)} />
        {isGovernance && (
          <>
            <Meta label="Incident Date" value={raw.incidentDate ? new Date(raw.incidentDate).toLocaleDateString() : '—'} />
            <Meta label="Incident Time" value={raw.incidentTime || '—'} />
            <Meta label="Reported Anonymously" value={raw.isAnonymous ? 'Yes' : 'No'} />
            <Meta label="Resolution Confirmed" value={raw.confirmedByCitizen ? fmtDate(raw.confirmedAt) : '—'} />
          </>
        )}
      </div>

      {/* Citizen actions */}
      {isOwner && isGovernance && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <button onClick={handleAckDownload} disabled={downloading} className="btn-secondary text-sm px-4 py-2">
            {downloading ? 'Downloading…' : '⬇️ Download Acknowledgment (PDF)'}
          </button>
          {canReopen && (
            <button onClick={() => setReopenOpen(true)} className="btn-secondary text-sm px-4 py-2">↩️ Reopen Complaint</button>
          )}
          {item.status === 'Resolved' && !raw.confirmedByCitizen && (
            <button onClick={handleConfirmResolution} disabled={confirming} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors">
              {confirming ? 'Confirming…' : '✅ Confirm Resolution'}
            </button>
          )}
          {!alreadyRated && (item.status === 'Resolved' || item.status === 'Closed') && (
            <button onClick={() => setRatingOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors">
              ⭐ Rate Service
            </button>
          )}
        </div>
      )}

      {isOwner && isGovernance && item.status === 'Resolved' && !raw.confirmedByCitizen && (
        <div className="card p-5 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Has your complaint been resolved?</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The Subcity Governance Office marked this complaint as resolved. If you are satisfied with the outcome,
            confirm below so the case can be closed in the registry.
          </p>
        </div>
      )}

      {isOwner && reopenOpen && (
        <div className="card p-5 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Reopen this complaint?</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            You can reopen a resolved/rejected complaint within 15 days (up to 2 times). The responsible office will review it again.
          </p>
          <div className="flex gap-2">
            <button onClick={handleReopen} disabled={reopening} className="btn-primary text-sm px-4 py-2">
              {reopening ? 'Reopening…' : 'Confirm Reopen'}
            </button>
            <button onClick={() => setReopenOpen(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Officer responses + conversation */}
      {isGovernance && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Responses &amp; Messages</h3>
          {conversation.length === 0 ? (
            <p className="text-sm text-gray-400">No responses yet. The assigned office will respond here.</p>
          ) : (
            <div className="space-y-3">
              {conversation.map((r, i) => (
                <div key={i} className={`p-3 rounded-lg ${r.from === 'citizen' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-l-4 border-emerald-400' : 'bg-gray-50 dark:bg-gray-800/40 border-l-4 border-primary-400'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.sender} <span className="text-xs font-normal text-gray-500">{r.from === 'citizen' ? '(You)' : '(Office)'}</span></p>
                    <p className="text-xs text-gray-400">{fmtDate(r.at)}</p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{r.message}</p>
                  {r.files && r.files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.files.map((f, j) => (
                        <a key={j} href={f} target="_blank" rel="noreferrer" className="text-xs text-primary-600 underline">attachment {j + 1}</a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reply / communicate with the office */}
      {isOwner && isGovernance && isActive && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Communicate with the office</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {item.status === 'Need More Information'
              ? 'The office requested more information. Reply here so they can continue investigating.'
              : 'Send a message or upload files to keep the office updated.'}
          </p>
          <textarea
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            rows={3}
            placeholder="Write your message to the responsible office…"
            className="input-field w-full"
            aria-label="Reply message"
          />
          <input ref={replyFilesRef} type="file" multiple className="hidden"
            accept="image/*,video/mp4,video/mov,video/webm,audio/*,application/pdf"
            onChange={(e) => setReplyFiles(Array.from(e.target.files || []))} />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" onClick={() => replyFilesRef.current?.click()} className="btn-secondary text-sm px-4 py-2">📎 Attach files</button>
            {replyFiles.length > 0 && <span className="text-xs text-gray-500">{replyFiles.length} file(s) selected</span>}
            <button onClick={handleReply} disabled={replying || !replyMessage.trim()} className="btn-primary text-sm px-4 py-2">
              {replying ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      )}

      {/* Add evidence */}
      {isOwner && isGovernance && isActive && (
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
      )}

      {/* Evidence & documents */}
      {((isGovernance && (raw.evidenceFiles?.length > 0 || raw.officialDocuments?.length > 0)) || (isInfrastructure && media.length > 0)) && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Evidence &amp; Documents</h3>
          {isGovernance && raw.evidenceFiles?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your evidence</p>
              <div className="flex flex-wrap gap-2">
                {raw.evidenceFiles.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">📎 Evidence {i + 1}</a>
                ))}
              </div>
            </div>
          )}
          {isGovernance && raw.officialDocuments?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Official documents</p>
              <div className="flex flex-wrap gap-2">
                {raw.officialDocuments.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">📄 Official doc {i + 1}</a>
                ))}
              </div>
            </div>
          )}
          {isInfrastructure && media.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
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
          )}
        </div>
      )}

      {/* Investigation progress */}
      {showInvestigation && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Investigation Progress</h3>
          <div className="space-y-3">
            {[...(raw.investigationNotes || [])].reverse().map((n, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{n.note}</p>
                <p className="text-xs text-gray-500 mt-1">{n.userName} ({n.role}) · {fmtDate(n.at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Woreda coordination (governance) */}
      {isGovernance && raw.woredaRequests?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Woreda Coordination</h3>
          <div className="space-y-3">
            {raw.woredaRequests.map((r, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.message}</p>
                <p className="text-xs text-gray-500 mt-1">Requested {fmtDate(r.requestedAt)} · Due {fmtDate(r.dueAt)} · Status: <span className="font-medium">{r.status}</span></p>
                {r.response && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Response: {r.response}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isGovernance && raw.escalated && (
        <div className="card p-5 bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Escalated to {raw.escalatedTo}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{raw.escalationReason || 'This complaint was escalated to a higher authority.'} · {fmtDate(raw.escalatedAt)}</p>
        </div>
      )}

      {/* Resolution details */}
      {(item.status === 'Resolved' || item.status === 'Closed') && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Resolution</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Meta label="Status" value={isGovernance ? displayStatus(item.status, raw) : item.status} />
            <Meta label="Resolved On" value={raw.resolvedAt ? fmtDate(raw.resolvedAt) : '—'} />
            <Meta label="Resolved By" value={raw.resolvedByName || '—'} />
          </div>
          {raw.resolutionNote && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 whitespace-pre-wrap">{raw.resolutionNote}</p>
          )}
          {alreadyRated && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {'⭐'.repeat(raw.citizenFeedback.rating)}<span className="text-xs text-gray-500"> ({raw.citizenFeedback.rating}/5)</span>
              </p>
              {raw.citizenFeedback.comment && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{raw.citizenFeedback.comment}</p>}
            </div>
          )}
        </div>
      )}

      {/* Complete timeline */}
      {item.timeline?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Timeline</h3>
          <ComplaintTimeline timeline={item.timeline} />
        </div>
      )}

      {/* Audit trail (governance) */}
      {isGovernance && raw.auditTrail?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Activity Log</h3>
          <ol className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 space-y-3">
            {[...(raw.auditTrail || [])].reverse().map((a, i) => (
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

      {/* Rating modal */}
      {ratingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Rate the service you received</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">How satisfied are you with how your complaint was handled?</p>
            <div className="flex items-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRatingValue(n)} aria-label={`${n} star`}
                  className={`text-3xl transition-transform ${n <= ratingValue ? '' : 'grayscale opacity-40'} hover:scale-110`}>
                  ⭐
                </button>
              ))}
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              rows={3}
              placeholder="Any additional feedback? (optional)"
              className="input-field w-full mb-4"
              aria-label="Feedback comment"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRatingOpen(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button onClick={handleRatingSubmit} disabled={ratingSubmitting || !ratingValue} className="btn-primary text-sm px-4 py-2">
                {ratingSubmitting ? 'Submitting…' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
