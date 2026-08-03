import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getWithRetry, isCanceledError, classifyError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ImageLightbox from '../../../components/common/ImageLightbox';
import {
  STATUS_COLORS, PRIORITY_COLORS, LEVEL_COLORS, fmtDate, fmtShortDate,
} from '../municipal/municipalMeta';

function Meta({ label, value, color }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      {color ? (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{value}</span>
      ) : (
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      )}
    </div>
  );
}

export default function CitizenMunicipalComplaintDetail() {
  const { id } = useParams();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const abortRef = useRef(null);

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

  const media = [...(complaint.photos || []), ...(complaint.videos || [])];
  const responses = [...(complaint.responses || [])].reverse();

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/dashboard/citizen/municipal-complaints" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          ← Back to my complaints
        </Link>
        <span className="text-xs text-gray-400">Submitted {fmtDate(complaint.createdAt)}</span>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{complaint.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Tracking ID: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{complaint.trackingId}</span></p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[complaint.status] || 'bg-gray-100 text-gray-600'}`}>{complaint.status}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[complaint.priority] || 'bg-gray-100 text-gray-600'}`}>{complaint.priority} priority</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 whitespace-pre-wrap">{complaint.description}</p>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Meta label="Assigned Level" value={complaint.assignedLevel} color={LEVEL_COLORS[complaint.assignedLevel]} />
        <Meta label="Assigned Office" value={complaint.assignedToDepartment || complaint.department || '—'} />
        <Meta label="Subcity" value={complaint.subcity || '—'} />
        <Meta label="Woreda" value={complaint.woredaName || '—'} />
        <Meta label="Issue Type" value={complaint.issueType || '—'} />
        <Meta label="Location" value={complaint.locationText || '—'} />
        <Meta label="Technician" value={complaint.technicianName || '—'} />
        <Meta label="Resolution Date" value={complaint.resolvedAt ? fmtShortDate(complaint.resolvedAt) : '—'} />
      </div>

      {/* Responses */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Response Messages</h3>
        {responses.length === 0 ? (
          <p className="text-sm text-gray-400">No responses yet. The responsible office will respond here.</p>
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
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">{complaint.forwardReason}</p>
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

      {/* Evidence */}
      {media.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Attached Evidence</h3>
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

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
