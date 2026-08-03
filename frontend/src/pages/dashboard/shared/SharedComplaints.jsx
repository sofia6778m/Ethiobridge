import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { complaintAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import useComplaintList from '../../../hooks/useComplaintList';
import ListSkeleton from '../../../components/common/ListSkeleton';
import InlineLoader from '../../../components/common/InlineLoader';

const STATUS_STYLES = {
  'Submitted': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  'Under Review': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Assigned': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'In Progress': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Resolved': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_OPTIONS = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];

export default function SharedComplaints() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  // Only these roles may change complaint status — the backend enforces the
  // same rule and their scope, returning 403 otherwise.
  const canUpdateStatus = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda'].includes(user?.role);

  const params = useMemo(() => {
    const p = { page, limit: 20 };
    if (filter) p.status = filter;
    return p;
  }, [page, filter]);

  const fetcher = useCallback(async (p, { signal }) => {
    const res = await getWithRetry('/public-complaints', { params: p, signal, timeout: 10000 });
    return res.data.data; // { complaints, pages }
  }, []);

  const handleLoadError = useCallback((err, info) => {
    if (isCanceledError(err)) return;
    if (isToastableErrorKind(info.kind)) toast.error(errorMessageFor(err));
  }, []);

  const {
    data, loading, refreshing, error, reload,
  } = useComplaintList({
    fetcher,
    cacheKey: `shared-complaints:${user?._id || 'anon'}`,
    params,
    onError: handleLoadError,
  });

  const complaints = data?.complaints || [];
  const totalPages = data?.pages || 1;
  const hasData = complaints.length > 0;
  const showErrorCard = error && !hasData && !loading;

  const handleStatusUpdate = async (id, status) => {
    try {
      await complaintAPI.updateStatus(id, { status });
      toast.success('Complaint status updated');
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Complaints</h2>
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="input-field max-w-[180px]">
          <option value="">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {refreshing && <InlineLoader />}
      </div>

      {showErrorCard ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{errorMessageFor(error)}</p>
          <button onClick={reload} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={5} />
      ) : complaints.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-3">📝</p>
          <p>No complaints found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map(c => (
            <div key={c._id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-800'}`}>{c.status}</span>
                    <span className="text-xs text-gray-400">{c.trackingNumber}</span>
                    {c.department && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{c.department}</span>}
                    {c.priority && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.priority === 'Urgent' || c.priority === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>{c.priority}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{c.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                    <span>{c.category}</span>
                    {c.subcity && <span>{c.subcity.replace('_', ' ')}</span>}
                    {c.woredaName && <span>{c.woredaName}</span>}
                    <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {canUpdateStatus && (
                  <div className="flex-shrink-0">
                    <select
                      value={c.status}
                      onChange={e => handleStatusUpdate(c._id, e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
          <span className="flex items-center text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
