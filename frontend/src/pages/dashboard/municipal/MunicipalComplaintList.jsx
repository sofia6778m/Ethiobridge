import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { municipalComplaintAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import { requestCache } from '../../../utils/requestCache';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import useComplaintList from '../../../hooks/useComplaintList';
import ListSkeleton from '../../../components/common/ListSkeleton';
import InlineLoader from '../../../components/common/InlineLoader';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import { STATUS_COLORS, PRIORITY_COLORS, fmtShortDate, isClosed } from './municipalMeta';

const SEARCH_DEBOUNCE_MS = 600;
const LIST_TTL_MS = 30 * 1000;
const STATS_TTL_MS = 60 * 1000;

function Widget({ label, value, icon, tone }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${tone || 'bg-primary-100 dark:bg-primary-900/40'}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      </div>
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

export default function MunicipalComplaintList({ basePath }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isManager = ['admin', 'government', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'department'].includes(user?.role);
  const isAdmin = user?.role === 'admin' || user?.role === 'government';

  // Search is debounced so the API is not hit on every keystroke.
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [filters, setFilters] = useState({ status: '', department: '', level: '', priority: '', woredaId: '', from: '', to: '', overdue: false });
  const [page, setPage] = useState(1);

  // Empty search box → search param omitted entirely (no pointless request).
  const params = useMemo(() => {
    const p = { page, limit: 12 };
    if (filters.status) p.status = filters.status;
    if (filters.department) p.department = filters.department;
    if (filters.level) p.level = filters.level;
    if (filters.priority) p.priority = filters.priority;
    if (filters.woredaId) p.woredaId = filters.woredaId;
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (filters.overdue) p.overdue = true;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [page, filters, debouncedSearch]);

  const fetcher = useCallback(async (p, { signal }) => {
    const res = await getWithRetry('/municipal-complaints', { params: p, signal, timeout: 10000 });
    return res.data.data; // { complaints, total, pages }
  }, []);

  // Only fires after retries are exhausted AND the request was not canceled.
  const handleLoadError = useCallback((err, info) => {
    if (isCanceledError(err)) return;
    if (isToastableErrorKind(info.kind)) toast.error(errorMessageFor(err));
  }, []);

  const {
    data, loading, refreshing, error, reload,
  } = useComplaintList({
    fetcher,
    cacheKey: `municipal:${user?._id || 'anon'}`,
    params,
    ttlMs: LIST_TTL_MS,
    onError: handleLoadError,
  });

  const complaints = data?.complaints || [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  // Stats widgets — cached, retried, and silent on failure.
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(isManager);
  const [statsTick, setStatsTick] = useState(0);

  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    const controller = new AbortController();
    const statsKey = `municipal-stats:${user?._id || 'anon'}`;
    const cached = requestCache.get(statsKey);

    if (cached) {
      setStats(cached);
      setStatsLoading(false);
      if (requestCache.isFresh(statsKey, STATS_TTL_MS)) {
        return () => { cancelled = true; controller.abort(); };
      }
    } else {
      setStatsLoading(true);
    }

    getWithRetry('/municipal-complaints/stats', { signal: controller.signal, timeout: 8000 })
      .then((res) => {
        if (cancelled) return;
        requestCache.set(statsKey, res.data.data, STATS_TTL_MS);
        setStats(res.data.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isManager, user?._id, statsTick]);

  const refreshStats = useCallback(() => {
    requestCache.clear(`municipal-stats:${user?._id || 'anon'}`);
    setStats(null);
    setStatsTick((t) => t + 1);
  }, [user?._id]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const exportPdf = async () => {
    try {
      const res = await municipalComplaintAPI.exportPDF({ status: filters.status, department: filters.department, level: filters.level });
      downloadBlob(res, 'municipal-complaints.pdf');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const exportExcel = async () => {
    try {
      const res = await municipalComplaintAPI.exportExcel({ status: filters.status, department: filters.department, level: filters.level });
      downloadBlob(res, 'municipal-complaints.xls');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const runEscalation = async () => {
    try {
      await municipalComplaintAPI.runEscalation();
      toast.success('Escalation pass completed');
      reload();
      refreshStats();
    } catch (err) {
      toast.error('Could not run escalation');
    }
  };

  const pendingByDept = stats?.pendingByDepartment || [];
  const hasData = complaints.length > 0;
  const showErrorCard = error && !hasData && !loading;
  const refreshFailed = error && hasData;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Municipal Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} complaint(s) in scope · Auto-routed Subcity → Woreda → Department</p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2">
            <button onClick={exportPdf} className="btn-secondary text-sm">PDF</button>
            <button onClick={exportExcel} className="btn-secondary text-sm">Excel</button>
            {isAdmin && <button onClick={runEscalation} className="btn-danger text-sm">Run Escalation</button>}
          </div>
        )}
      </div>

      {/* Dashboard widgets — added on top of existing dashboards */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Widget label="Open Complaints" value={stats.open ?? 0} icon="📥" />
          <Widget label="Under Review" value={stats.underReview ?? 0} icon="🔍" tone="bg-amber-100 dark:bg-amber-900/40" />
          <Widget label="In Progress" value={stats.inProgress ?? 0} icon="🛠️" tone="bg-purple-100 dark:bg-purple-900/40" />
          <Widget label="Escalated" value={stats.escalated ?? 0} icon="🚨" tone="bg-orange-100 dark:bg-orange-900/40" />
          <Widget label="Resolved Today" value={stats.resolvedToday ?? 0} icon="✅" tone="bg-green-100 dark:bg-green-900/40" />
          <Widget label="Overdue (SLA)" value={stats.overdue ?? 0} icon="⏰" tone="bg-red-100 dark:bg-red-900/40" />
        </div>
      ) : statsLoading && isManager ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse"><div className="h-8 w-10 rounded bg-gray-200 dark:bg-gray-700 mb-2" /><div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" /></div>
          ))}
        </div>
      ) : null}

      {pendingByDept.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Pending by Department</h3>
          <div className="flex flex-wrap gap-2">
            {pendingByDept.map(d => (
              <button key={d._id} onClick={() => setFilter('department', d._id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filters.department === d._id ? 'bg-primary-600 text-white border-primary-600' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                {d._id || 'General'} · {d.count}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search title / tracking ID / phone…" className="input-field flex-1 min-w-[180px]" />
        <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className="input-field w-40">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={e => setFilter('priority', e.target.value)} className="input-field w-32">
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.level} onChange={e => setFilter('level', e.target.value)} className="input-field w-32">
          <option value="">All levels</option>
          <option value="Woreda">Woreda</option>
          <option value="Subcity">Subcity</option>
        </select>
        <input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} className="input-field w-40" aria-label="From date" />
        <input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} className="input-field w-40" aria-label="To date" />
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filters.overdue} onChange={e => setFilter('overdue', e.target.checked)} className="accent-primary-600" />
          Overdue only
        </label>
        {refreshing && <InlineLoader />}
      </div>

      {refreshFailed && (
        <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-2">
          <span>⚠️ Could not refresh.</span>
          <button onClick={reload} className="underline">Retry</button>
          <span className="text-gray-400">Showing previously loaded results.</span>
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : showErrorCard ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{errorMessageFor(error)}</p>
          <button onClick={reload} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
        </div>
      ) : complaints.length === 0 ? (
        <EmptyState title="No complaints found" message="Adjust the filters or check back later." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="p-3">Tracking ID</th>
                <th className="p-3">Title</th>
                <th className="p-3">Department</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Technician</th>
                <th className="p-3">Status</th>
                <th className="p-3">SLA</th>
                <th className="p-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map(c => (
                <tr key={c._id} onClick={() => navigate(`${basePath}/${c._id}`)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800">
                  <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-300">{c.trackingId}</td>
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100 max-w-[220px] truncate">{c.title}</td>
                  <td className="p-3">{c.assignedToDepartment || c.department || '—'}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] || 'bg-gray-100 text-gray-600'}`}>{c.priority}</span></td>
                  <td className="p-3 text-xs text-gray-600 dark:text-gray-300">{c.technicianName || '—'}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status}</span></td>
                  <td className="p-3 text-xs">
                    {c.isOverdue && !isClosed(c.status) ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue</span>
                    ) : (
                      <span className="text-gray-500">{fmtShortDate(c.slaDueAt)}</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-500">{fmtShortDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && <Pagination page={page} pages={pages} onPageChange={setPage} />}
    </div>
  );
}
