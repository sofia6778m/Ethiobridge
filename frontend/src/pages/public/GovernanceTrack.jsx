import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { governanceComplaintAPI } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReportTimeline from '../../components/common/ReportTimeline';
import { STATUS_COLORS, fmtDate, isClosed, displayStatus } from '../../components/governance/governanceMeta';

export default function GovernanceTrack() {
  const { trackingId } = useParams();
  const [phone, setPhone] = useState('');
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setComplaint(null);
    try {
      const r = await governanceComplaintAPI.track(trackingId, { phone: phone.trim() });
      setComplaint(r.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Complaint not found. Check the tracking ID and phone number.');
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { toast.error('Please explain why you want to reopen the complaint'); return; }
    setReopening(true);
    try {
      await governanceComplaintAPI.reopenByTracking({ trackingId, phone: phone.trim(), reason: reason.trim() });
      toast.success('Complaint reopened successfully');
      setReopenOpen(false);
      setReason('');
      const r = await governanceComplaintAPI.track(trackingId, { phone: phone.trim() });
      setComplaint(r.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reopen the complaint');
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Track Governance Complaint</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Enter the phone number you used to submit <span className="font-mono font-medium text-gray-700 dark:text-gray-200">{trackingId}</span> to see its status and timeline.
        </p>
      </div>

      {!complaint && (
        <form onSubmit={handleSearch} className="max-w-lg mx-auto mb-10 space-y-3">
          <div>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Phone number used at submission (09XXXXXXXX)"
              className="input-field w-full text-center"
            />
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              The phone number is used to verify you are the reporter.
            </p>
          </div>
          <button type="submit" disabled={loading || !phone.trim()} className="btn-primary w-full py-2.5">
            {loading ? 'Checking…' : 'Check Status'}
          </button>
          <div className="text-center">
            <Link to="/report/governance-complaint" className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Submit a governance complaint</Link>
          </div>
        </form>
      )}

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card text-center py-10 max-w-lg mx-auto">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      )}

      {complaint && (
        <div className="space-y-6">
          <button onClick={() => { setComplaint(null); setError(''); }} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            ← Track another complaint
          </button>

          {/* Status Banner */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{complaint.trackingId}</p>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-1">{complaint.category}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {complaint.subcity} / {complaint.woredaName} / {complaint.office} · {complaint.assignedToOffice || 'Subcity Governance Office'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[complaint.status] || 'bg-gray-100 text-gray-600'}`}>{displayStatus(complaint.status, complaint)}</span>
                {complaint.isOverdue && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue</span>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Detail label="Category" value={complaint.category} />
              <Detail label="Status" value={displayStatus(complaint.status, complaint)} />
              <Detail label="Subcity" value={complaint.subcity} />
              <Detail label="Woreda" value={complaint.woredaName} />
              <Detail label="Office / Bureau" value={complaint.office} />
              <Detail label="Incident Date" value={complaint.incidentDate ? new Date(complaint.incidentDate).toLocaleDateString() : ''} />
              <Detail label="Incident Time" value={complaint.incidentTime} />
              <Detail label="Date Reported" value={complaint.createdAt ? new Date(complaint.createdAt).toLocaleDateString() : ''} />
              {complaint.resolutionNote && <Detail label="Resolution Note" value={complaint.resolutionNote} />}
              {complaint.rejectionReason && <Detail label="Rejection Reason" value={complaint.rejectionReason} />}
              {complaint.resolvedAt && <Detail label="Resolved On" value={fmtDate(complaint.resolvedAt)} />}
              {complaint.escalatedAt && <Detail label="Escalated On" value={fmtDate(complaint.escalatedAt)} />}
            </div>
            {complaint.description && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">{complaint.description}</p>
              </div>
            )}
          </div>

          {/* Evidence */}
          {complaint.evidenceFiles?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Evidence</h3>
              <div className="flex flex-wrap gap-3">
                {complaint.evidenceFiles.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">
                    <span>📎</span> Evidence {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Woreda requests */}
          {complaint.woredaRequests?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Woreda Coordination</h3>
              <div className="space-y-3">
                {complaint.woredaRequests.map((r, i) => (
                  <div key={i} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                    <p className="text-sm text-gray-700 dark:text-gray-200">{r.request}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Requested: {fmtDate(r.requestedAt)} · Due: {fmtDate(r.dueAt)} · Status: <span className="font-medium">{r.status}</span>
                    </p>
                    {r.response && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">Response: {r.response}</p>}
                  </div>
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

          {/* Reopen */}
          {complaint.canReopen && (
            <div className="card p-5 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Unhappy with the outcome?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                You can reopen this complaint within 15 days of resolution (up to 2 times).
              </p>
              {!reopenOpen ? (
                <button onClick={() => setReopenOpen(true)} className="btn-secondary text-sm">Reopen Complaint</button>
              ) : (
                <form onSubmit={handleReopen} className="space-y-3">
                  <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Explain why you want to reopen this complaint…"
                    className="input-field resize-none" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={reopening} className="btn-primary text-sm px-4 py-2">
                      {reopening ? 'Reopening…' : 'Confirm Reopen'}
                    </button>
                    <button type="button" onClick={() => setReopenOpen(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {isClosed(complaint.status) && !complaint.canReopen && (
            <div className="text-center text-xs text-gray-400">
              Reopen window closed or reopen limit reached.
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
