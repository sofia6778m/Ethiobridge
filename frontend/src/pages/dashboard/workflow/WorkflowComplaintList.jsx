import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import useComplaintList from '../../../hooks/useComplaintList';
import ListSkeleton from '../../../components/common/ListSkeleton';
import InlineLoader from '../../../components/common/InlineLoader';

const WORKFLOW_STATUS_META = {
  pending:               { label: 'Pending',               color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  resolved_by_woreda:    { label: 'Resolved by Woreda',    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  pending_escalation:    { label: 'Pending Escalation',    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  escalated_to_subcity:  { label: 'Escalated to Subcity',  color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  resolved_by_subcity:   { label: 'Resolved by Subcity',   color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
};

const DEPT_COLORS = {
  Electricity: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Road:        'bg-stone-100 text-stone-800 dark:bg-stone-700 dark:text-stone-300',
  Water:       'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const PRIORITY_COLORS = {
  Low:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  Medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  High:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const SUBCITY_LABELS = { BOLE: 'Bole', YEKA: 'Yeka', LEMMI_KURA: 'Lemmi Kura' };

const ALL_STATUSES = Object.keys(WORKFLOW_STATUS_META);
const ALL_DEPTS    = ['Electricity', 'Road', 'Water'];

export default function WorkflowComplaintList({ basePath = '/dashboard' }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [page, setPage]             = useState(1);

  // Filters
  const [statusFilter, setStatusFilter]   = useState('');
  const [deptFilter, setDeptFilter]       = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchInput, setSearchInput]     = useState('');

  const role      = user?.role;
  const isWoreda  = role === 'woreda';
  const isSubcity = role?.startsWith('subcity_');
  const isDept    = role === 'department';
  const isAdmin   = role === 'admin';

  const params = useMemo(() => {
    const p = { page, limit: 20 };
    if (statusFilter) p.workflowStatus = statusFilter;
    if (deptFilter)   p.department = deptFilter;
    if (searchQuery)  p.search = searchQuery;
    return p;
  }, [page, statusFilter, deptFilter, searchQuery]);

  const fetcher = useCallback(async (p, { signal }) => {
    const res = await getWithRetry('/workflow-complaints', { params: p, signal, timeout: 10000 });
    return res.data.data; // { complaints, total, pages }
  }, []);

  // Only reached after retries are exhausted and the request was not canceled.
  const handleLoadError = useCallback((err, info) => {
    if (isCanceledError(err)) return;
    if (isToastableErrorKind(info.kind)) toast.error(errorMessageFor(err));
  }, []);

  const {
    data, loading, refreshing, error, reload,
  } = useComplaintList({
    fetcher,
    cacheKey: `workflow:${user?._id || 'anon'}`,
    params,
    onError: handleLoadError,
  });

  const complaints = data?.complaints || [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;
  const hasData = complaints.length > 0;
  const showErrorCard = error && !hasData && !loading;

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  const resetFilters = () => {
    setStatusFilter(''); setDeptFilter('');
    setSearchQuery(''); setSearchInput('');
    setPage(1);
  };

  const deadlineLabel = (c) => {
    if (!c.escalationDeadline || !['pending', 'pending_escalation'].includes(c.workflowStatus)) return null;
    const ms   = new Date(c.escalationDeadline) - Date.now();
    const hrs  = Math.round(ms / 3600000);
    if (hrs <= 0)  return { text: 'Overdue',        cls: 'text-red-600 dark:text-red-400' };
    if (hrs <= 12) return { text: `${hrs}h left`,   cls: 'text-orange-500 dark:text-orange-400' };
    if (hrs <= 24) return { text: `${hrs}h left`,   cls: 'text-yellow-500 dark:text-yellow-400' };
    return { text: `${hrs}h left`, cls: 'text-gray-400' };
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Workflow Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {total} complaint{total !== 1 ? 's' : ''} in your scope
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[220px]">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, tracking #, issue…"
            className="input-field flex-1 text-sm"
          />
          <button type="submit" className="btn-primary px-3 py-2 text-sm">Search</button>
        </form>

        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-field text-sm max-w-[200px]">
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{WORKFLOW_STATUS_META[s].label}</option>
          ))}
        </select>

        {!isDept && (
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
            className="input-field text-sm max-w-[160px]">
            <option value="">All Departments</option>
            {ALL_DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

        {(statusFilter || deptFilter || searchQuery) && (
          <button onClick={resetFilters} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
            Clear filters
          </button>
        )}
        {refreshing && <InlineLoader />}
      </div>

      {/* List */}
      {showErrorCard ? (
        <div className="card p-14 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{errorMessageFor(error)}</p>
          <button onClick={reload} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={5} />
      ) : complaints.length === 0 ? (
        <div className="card p-14 text-center text-gray-400 dark:text-gray-500">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-medium">No complaints found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => {
            const sm     = WORKFLOW_STATUS_META[c.workflowStatus] || WORKFLOW_STATUS_META.pending;
            const dl     = deadlineLabel(c);
            const subcity = SUBCITY_LABELS[c.subcity] || c.subcity;
            return (
              <div
                key={c._id}
                onClick={() => navigate(`${basePath}/workflow-complaints/${c._id}`)}
                className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Badge row */}
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sm.color}`}>
                        {sm.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DEPT_COLORS[c.department] || ''}`}>
                        {c.department}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] || ''}`}>
                        {c.priority}
                      </span>
                      {dl && <span className={`text-xs font-medium ${dl.cls}`}>⏰ {dl.text}</span>}
                    </div>

                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.title}</h3>
                    {c.issueTypeName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Issue: {c.issueTypeName}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                      <span>#{c.trackingNumber}</span>
                      {subcity && <span>{subcity}</span>}
                      {c.woredaName && <span>{c.woredaName}</span>}
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-gray-400 dark:text-gray-600 text-lg">›</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
