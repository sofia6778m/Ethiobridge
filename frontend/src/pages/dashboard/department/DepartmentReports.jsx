import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deptAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import useComplaintList from '../../../hooks/useComplaintList';
import ListSkeleton from '../../../components/common/ListSkeleton';
import InlineLoader from '../../../components/common/InlineLoader';

// ── Status style maps ────────────────────────────────────────────────────────

const REPORT_STATUS_STYLES = {
  Pending:      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Submitted:    'bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300',
  Assigned:     'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'In Progress':'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Completed:    'bg-teal-100   text-teal-800   dark:bg-teal-900/30   dark:text-teal-300',
  Resolved:     'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
  Rejected:     'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300',
};

const PRIORITY_BADGE = {
  Low:    'bg-gray-100   text-gray-600   dark:bg-gray-700   dark:text-gray-300',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  High:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Urgent: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-300',
};

// ── Empty state ──────────────────────────────────────────────────────────────

function Empty({ label }) {
  return (
    <div className="card p-12 text-center text-gray-400">
      <p className="text-4xl mb-3">📋</p>
      <p>{label}</p>
    </div>
  );
}

// ── Pagination bar ───────────────────────────────────────────────────────────

function Pager({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-2 mt-6">
      <button disabled={page <= 1} onClick={() => onPage(p => p - 1)}
        className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
      <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPage(p => p + 1)}
        className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
    </div>
  );
}

// ── Infrastructure Reports tab ───────────────────────────────────────────────

function ReportsTab() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [filter,      setFilter]      = useState(searchParams.get('status') || '');
  const [searchInput, setSearchInput] = useState('');
  const [query,       setQuery]       = useState('');
  const [page,        setPage]        = useState(1);

  const params = useMemo(() => {
    const p = { page, limit: 20 };
    if (filter) p.status = filter;
    if (query) p.search = query;
    return p;
  }, [page, filter, query]);

  const fetcher = useCallback(async (p, { signal }) => {
    const res = await getWithRetry('/department/reports', { params: p, signal, timeout: 10000 });
    return res.data; // { reports, pages }
  }, []);

  const handleLoadError = useCallback((err, info) => {
    if (isCanceledError(err)) return;
    if (isToastableErrorKind(info.kind)) toast.error(errorMessageFor(err));
  }, []);

  const {
    data, loading, refreshing, error, reload,
  } = useComplaintList({
    fetcher,
    cacheKey: `dept-reports:${user?._id || 'anon'}`,
    params,
    onError: handleLoadError,
  });

  const reports = data?.reports || [];
  const totalPages = data?.pages || 1;
  const hasData = reports.length > 0;
  const showErrorCard = error && !hasData && !loading;

  const handleSearch = (e) => { e.preventDefault(); setQuery(searchInput.trim()); setPage(1); };

  const handleAction = async (action, id) => {
    try {
      if (action === 'accept') {
        await deptAPI.acceptReport(id);
      } else if (action === 'reject') {
        const note = prompt('Rejection reason:');
        if (!note) return;
        await deptAPI.rejectReport(id, { note });
      } else if (action === 'start') {
        await deptAPI.startWorking(id);
      } else if (action === 'complete') {
        const note = prompt('Completion note (optional):') || '';
        const fd = new FormData();
        if (note) fd.append('note', note);
        await deptAPI.markComplete(id, fd);
      }
      toast.success('Action completed');
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            className="input-field max-w-[240px]" placeholder="Search reports…" />
          <button type="submit" className="btn-secondary px-3 py-2 text-sm">Search</button>
        </form>
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}
          className="input-field max-w-[180px]">
          <option value="">All Statuses</option>
          {Object.keys(REPORT_STATUS_STYLES).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {refreshing && <InlineLoader />}
      </div>

      {showErrorCard ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load reports</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{errorMessageFor(error)}</p>
          <button onClick={reload} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={5} />
      ) : reports.length === 0 ? <Empty label="No infrastructure reports found" /> : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r._id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REPORT_STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                    {r.severityLevel && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[r.severityLevel] || ''}`}>
                        {r.severityLevel}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 font-mono">{r.reportId}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{r.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{r.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    {r.category && <span>📁 {r.category.replace(/_/g, ' ')}</span>}
                    {r.region   && <span>📍 {r.region}</span>}
                    {r.woredaName && <span>🏘 {r.woredaName}</span>}
                    <span>🕐 {new Date(r.createdAt).toLocaleDateString()}</span>
                    {r.submittedBy?.fullName && <span>👤 {r.submittedBy.fullName}</span>}
                  </div>
                </div>

                <div className="flex-shrink-0 flex flex-col gap-2 min-w-[110px]">
                  {['Pending', 'Submitted'].includes(r.status) && <>
                    <button onClick={() => handleAction('accept', r._id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium">Accept</button>
                    <button onClick={() => handleAction('reject', r._id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium">Reject</button>
                  </>}
                  {r.status === 'Assigned' &&
                    <button onClick={() => handleAction('start', r._id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium">Start Working</button>}
                  {r.status === 'In Progress' &&
                    <button onClick={() => handleAction('complete', r._id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-medium">Mark Complete</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DepartmentReports() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Department Reports</h2>
      </div>

      <ReportsTab />
    </div>
  );
}
