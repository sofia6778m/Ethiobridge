import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { municipalComplaintAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import { errorMessageFor, isToastableErrorKind } from '../../../utils/listErrors';
import useComplaintList from '../../../hooks/useComplaintList';
import ListSkeleton from '../../../components/common/ListSkeleton';
import InlineLoader from '../../../components/common/InlineLoader';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';

const STATUS_COLORS = {
  'Submitted': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'In Review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Assigned': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'In Progress': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Forwarded to Subcity': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Escalated': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Resolved': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Rejected': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Closed': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const PRIORITY_COLORS = {
  Low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  High: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export default function CitizenMunicipalComplaints() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [trackQuery, setTrackQuery] = useState('');
  const [tracking, setTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const params = useMemo(() => {
    const p = { page, limit: 10 };
    if (statusFilter) p.status = statusFilter;
    if (query.trim()) p.search = query.trim();
    return p;
  }, [page, statusFilter, query]);

  const fetcher = useCallback(async (p, { signal }) => {
    const res = await getWithRetry('/municipal-complaints', { params: p, signal, timeout: 10000 });
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
    cacheKey: `citizen-municipal:${user?._id || 'anon'}`,
    params,
    onError: handleLoadError,
  });

  const complaints = data?.complaints || [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const runSearch = () => {
    setQuery(searchInput.trim());
    setPage(1);
  };

  const track = async (e) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;
    setTrackingLoading(true);
    setTracking(null);
    try {
      const res = await municipalComplaintAPI.track(trackQuery.trim());
      setTracking(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Tracking ID not found');
    } finally {
      setTrackingLoading(false);
    }
  };

  const hasData = complaints.length > 0;
  const showErrorCard = error && !hasData && !loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Municipal Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} complaint(s) · Track, follow, and manage your complaints end-to-end</p>
        </div>
        <Link to="/dashboard/citizen/municipal-complaints/new" className="btn-primary">+ New Complaint</Link>
      </div>

      {/* Track by ID */}
      <form onSubmit={track} className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Track by Tracking ID</label>
          <input value={trackQuery} onChange={e => setTrackQuery(e.target.value)} placeholder="e.g. CMP-2026-000001" className="input-field" />
        </div>
        <button type="submit" disabled={trackingLoading} className="btn-secondary">{trackingLoading ? 'Searching…' : 'Track'}</button>
        {tracking && (
          <div className="w-full mt-2 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tracking.trackingId} — {tracking.title}</p>
              <p className="text-xs text-gray-500">{tracking.subcity} / {tracking.woredaName} / {tracking.department} · Status: <span className="font-medium">{tracking.status}</span></p>
            </div>
            <Link to={`/dashboard/citizen/municipal-complaints/${tracking._id}`} className="text-sm text-primary-600 font-medium">View →</Link>
          </div>
        )}
      </form>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search title, tracking ID, issue type…"
            className="input-field" onKeyDown={e => e.key === 'Enter' && runSearch()} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-48">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={runSearch} className="btn-secondary">Search</button>
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
        <EmptyState title="No complaints yet" message="Submit your first municipal complaint to get started." />
      ) : (
        <div className="space-y-3">
          {complaints.map(c => (
            <Link key={c._id} to={`/dashboard/citizen/municipal-complaints/${c._id}`}
              className="card p-4 hover:shadow-md transition-shadow block">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.trackingId} · {c.issueType || 'General issue'} · {c.subcity} / {c.woredaName}</p>
                  <p className="text-xs text-gray-500 mt-1">Assigned: {c.assignedLevel} — {c.assignedToDepartment || c.department}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] || 'bg-gray-100 text-gray-600'}`}>{c.priority}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && <Pagination page={page} pages={pages} onPageChange={setPage} />}
    </div>
  );
}
