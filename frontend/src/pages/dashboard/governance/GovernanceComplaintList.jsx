import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { governanceComplaintAPI, governanceManagementAPI } from '../../../services/api';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import useComplaintList from '../../../hooks/useComplaintList';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import { requestCache } from '../../../utils/requestCache';
import ListSkeleton from '../../../components/common/ListSkeleton';
import InlineLoader from '../../../components/common/InlineLoader';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import { STATUS_COLORS, fmtShortDate, isClosed } from '../../../components/governance/governanceMeta';

const SEARCH_DEBOUNCE_MS = 400;
const LIST_TTL_MS = 30000;
const STATS_TTL_MS = 20000;

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

export default function GovernanceComplaintList({ basePath }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { on } = useSocket() || {};

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [filters, setFilters] = useState({ status: '', category: '', subcity: '', woredaId: '', urgency: '', overdue: false, from: '', to: '' });
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const p = { page, limit: 12 };
    if (filters.status) p.status = filters.status;
    if (filters.category) p.category = filters.category;
    if (filters.subcity) p.subcity = filters.subcity;
    if (filters.woredaId) p.woredaId = filters.woredaId;
    if (filters.urgency) p.urgency = filters.urgency;
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (filters.overdue) p.overdue = true;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [page, filters, debouncedSearch]);

  const fetcher = useCallback(async (p, { signal }) => {
    const res = await getWithRetry('/governance-complaints', { params: p, signal, timeout: 10000 });
    return res.data.data; // { complaints, total, pages }
  }, []);

  const handleLoadError = useCallback((err, info) => {
    if (isCanceledError(err)) return;
    if (isToastableErrorKind(info.kind)) toast.error(errorMessageFor(err));
  }, []);

  const {
    data, loading, refreshing, error, reload,
  } = useComplaintList({
    fetcher,
    cacheKey: `governance:${user?._id || 'anon'}`,
    params,
    ttlMs: LIST_TTL_MS,
    onError: handleLoadError,
  });

  const complaints = data?.complaints || [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsTick, setStatsTick] = useState(0);
  const [categoryOptions, setCategoryOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    governanceManagementAPI.getOffices({ subcity: user?.subcity || '' })
      .then((res) => {
        if (cancelled) return [];
        const offices = res.data?.data?.offices || [];
        return Promise.all(
          offices.map((o) => governanceManagementAPI.getCategories({ officeId: o._id }).catch(() => ({ data: { data: { categories: [] } } })))
        );
      })
      .then((categoryLists) => {
        if (cancelled) return;
        const seen = new Set();
        const flat = (categoryLists || []).flatMap((r) => r.data?.data?.categories || []);
        setCategoryOptions(flat.filter((c) => {
          if (seen.has(c.name)) return false;
          seen.add(c.name);
          return true;
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.subcity]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const statsKey = `governance-stats:${user?._id || 'anon'}`;
    const cached = requestCache.get(statsKey);
    if (cached) {
      setStats(cached);
      setStatsLoading(false);
      if (requestCache.isFresh(statsKey, STATS_TTL_MS)) return () => { cancelled = true; controller.abort(); };
    } else {
      setStatsLoading(true);
    }
    getWithRetry('/governance-complaints/stats', { signal: controller.signal, timeout: 8000 })
      .then((res) => {
        if (cancelled) return;
        requestCache.set(statsKey, res.data.data, STATS_TTL_MS);
        setStats(res.data.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [user?._id, statsTick]);

  // Real-time refresh: the backend broadcasts `governance:updated` on every
  // complaint change, so the list + widgets stay in sync without polling.
  useEffect(() => {
    if (typeof on !== 'function') return;
    return on('governance:updated', () => {
      reload();
      setStatsTick((t) => t + 1);
    });
  }, [on, reload]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const exportPdf = async () => {
    try {
      const res = await governanceComplaintAPI.exportPDF({ status: filters.status, category: filters.category });
      downloadBlob(res, 'governance-complaints.pdf');
    } catch { toast.error('Export failed'); }
  };

  const exportExcel = async () => {
    try {
      const res = await governanceComplaintAPI.exportExcel({ status: filters.status, category: filters.category });
      downloadBlob(res, 'governance-complaints.xls');
    } catch { toast.error('Export failed'); }
  };

  const hasData = complaints.length > 0;
  const showErrorCard = error && !hasData && !loading;
  const refreshFailed = error && hasData;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Governance Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} complaint(s) in scope · Subcity Governance Office</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPdf} className="btn-secondary text-sm">PDF</button>
          <button onClick={exportExcel} className="btn-secondary text-sm">Excel</button>
        </div>
      </div>

      {/* Dashboard widgets */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3">
          <Widget label="New" value={stats.submitted ?? 0} icon="📥" />
          <Widget label="Under Review" value={stats.underReview ?? 0} icon="🔍" tone="bg-amber-100 dark:bg-amber-900/40" />
          <Widget label="Investigation" value={stats.inProgress ?? 0} icon="🛠️" tone="bg-purple-100 dark:bg-purple-900/40" />
          <Widget label="Need Info" value={stats.needMoreInfo ?? 0} icon="📋" tone="bg-cyan-100 dark:bg-cyan-900/40" />
          <Widget label="Awaiting Woreda" value={stats.awaitingWoreda ?? 0} icon="🏢" tone="bg-orange-100 dark:bg-orange-900/40" />
          <Widget label="Resolved Today" value={stats.resolvedToday ?? 0} icon="✅" tone="bg-green-100 dark:bg-green-900/40" />
          <Widget label="Escalated" value={stats.escalated ?? 0} icon="🚨" tone="bg-red-100 dark:bg-red-900/40" />
          <Widget label="Overdue" value={stats.overdue ?? 0} icon="⏰" tone="bg-red-100 dark:bg-red-900/40" />
        </div>
      ) : statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse"><div className="h-8 w-10 rounded bg-gray-200 dark:bg-gray-700 mb-2" /><div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" /></div>
          ))}
        </div>
      ) : null}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search tracking ID / category / office…" className="input-field flex-1 min-w-[180px]" />
        <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className="input-field w-48">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.category} onChange={e => setFilter('category', e.target.value)} className="input-field w-52">
          <option value="">All categories</option>
          {categoryOptions.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={filters.urgency} onChange={e => setFilter('urgency', e.target.value)} className="input-field w-40">
          <option value="">All urgency</option>
          <option value="High">🔴 High</option>
          <option value="Medium">🟡 Medium</option>
          <option value="Low">🟢 Low</option>
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
                <th className="p-3">Category</th>
                <th className="p-3">Office</th>
                <th className="p-3">Urgency</th>
                <th className="p-3">Subcity / Woreda</th>
                <th className="p-3">Reporter</th>
                <th className="p-3">Status</th>
                <th className="p-3">SLA</th>
                <th className="p-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map(c => (
                <tr key={c._id} onClick={() => navigate(`${basePath}/${c._id}`)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800">
                  <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-300">{c.trackingId}</td>
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100 max-w-[200px] truncate">{c.category}</td>
                  <td className="p-3 text-xs text-gray-600 dark:text-gray-300 max-w-[160px] truncate">{c.office}</td>
                  <td className="p-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.urgencyLevel === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      : c.urgencyLevel === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : c.urgencyLevel === 'Low' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                    }`}>{c.urgencyLevel || '—'}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-600 dark:text-gray-300">{c.subcity} / {c.woredaName}</td>
                  <td className="p-3 text-xs text-gray-600 dark:text-gray-300">{c.isAnonymous ? 'Anonymous' : (c.reporterName || '—')}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status}</span></td>
                  <td className="p-3 text-xs">
                    {c.isOverdue && !isClosed(c.status) ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Overdue</span>
                    ) : (
                      <span className="text-gray-500">{c.slaDueAt ? fmtShortDate(c.slaDueAt) : '—'}</span>
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
