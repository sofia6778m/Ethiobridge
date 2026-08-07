import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicTrackAPI } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_PILL = {
  'New': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Received': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Assigned': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Under Investigation': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Need More Information': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Action Taken': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Resolved': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Reopened': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Escalated': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Rejected': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Closed': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function PublicTrack() {
  const [trackingId, setTrackingId] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await publicTrackAPI.track({
        trackingId: trackingId.trim(),
        phone: phone.trim(),
      });
      setResult(r.data.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'No record found for the provided tracking ID and phone number.'
      );
    } finally {
      setLoading(false);
    }
  };

  const timeline = result ? [...result.timeline].reverse() : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Track your report</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          Enter the tracking ID from your submission and the phone number you used. No login required.
        </p>
      </div>

      {!result && (
        <form onSubmit={handleTrack} className="max-w-lg mx-auto mb-10 space-y-3">
          <div>
            <label htmlFor="tracking-id" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tracking ID</label>
            <input
              id="tracking-id"
              type="text"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              placeholder="e.g. GOV-2026-000123"
              className="input-field w-full"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="track-phone" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone Number</label>
            <input
              id="track-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone used at submission (09XXXXXXXX)"
              className="input-field w-full"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              The phone number verifies you are the reporter.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !trackingId.trim() || !phone.trim()}
            className="btn-primary w-full py-2.5"
          >
            {loading ? 'Checking…' : 'Track Status'}
          </button>
        </form>
      )}

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card text-center py-10 max-w-lg mx-auto">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <button
            onClick={() => { setResult(null); setError(''); }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            ← Track another report
          </button>

          {/* Status banner */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{result.trackingId}</p>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-1">{result.title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {[result.type, result.subcity, result.woreda, result.office, result.department]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_PILL[result.displayStatus] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {result.displayStatus}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Detail label="Type" value={result.type} />
              <Detail label="Status" value={result.displayStatus} />
              <Detail label="Subcity" value={result.subcity} />
              <Detail label="Woreda" value={result.woreda} />
              <Detail label="Office / Bureau" value={result.office} />
              <Detail label="Department" value={result.department} />
              <Detail label="Submitted" value={result.submittedDate ? fmtDate(result.submittedDate) : ''} />
              <Detail label="Last Updated" value={result.lastUpdated ? fmtDate(result.lastUpdated) : ''} />
            </div>
          </div>

          {/* Latest response */}
          {result.latestResponse && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Latest response</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
                {result.latestResponse.message}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {result.latestResponse.byName ? `${result.latestResponse.byName} · ` : ''}
                {result.latestResponse.date ? fmtDate(result.latestResponse.date) : ''}
              </p>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Timeline</h3>
              <div className="relative ml-4">
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
                {timeline.map((event, i) => (
                  <div key={i} className="relative pl-8 pb-5 last:pb-0">
                    <div className="absolute left-[-7px] top-0 w-4 h-4 rounded-full bg-primary-500 border-2 border-white z-10" />
                    <div className="bg-white border border-gray-100 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-800">{event.title || 'Update'}</p>
                      {event.message && (
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{event.message}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {event.date ? fmtDate(event.date) : ''}
                        {event.byName ? ` · ${event.byName}` : ''}
                        {event.role ? ` (${event.role})` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center text-xs text-gray-400">
            Need to submit a new report?{' '}
            <Link to="/report" className="text-primary-600 hover:underline font-medium">Go to report selection</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
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
