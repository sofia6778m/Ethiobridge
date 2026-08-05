import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getWithRetry, isCanceledError } from '../../../utils/requestUtils';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import InlineLoader from '../../../components/common/InlineLoader';
import EmptyState from '../../../components/common/EmptyState';
import { fmtShortDate } from '../../../components/governance/governanceMeta';

const TYPE_META = {
  Infrastructure: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: '🏗️' },
  'Public Complaint': { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: '📢' },
  Governance: { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: '⚖️' },
};

const STATUS_STYLE = (status) => {
  if (['Resolved', 'Closed', 'Completed', 'Active'].includes(status)) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
  }
  if (['Rejected', 'Cancelled', 'Escalated', 'Overdue'].includes(status)) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  }
  if (['Submitted', 'Pending', 'New', 'Reopened'].includes(status)) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  }
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
};

const normalize = {
  infrastructure: (r) => ({
    key: `infra-${r._id}`,
    id: r._id,
    type: 'Infrastructure',
    title: r.title,
    refId: r.reportId || r._id,
    location: [r.region, r.subcity, r.woredaName].filter(Boolean).join(' / ') || '—',
    status: r.status,
    createdAt: r.createdAt,
    description: r.description,
    to: `/infrastructure-reports/${r._id}`,
  }),
  publicComplaint: (c) => ({
    key: `public-${c._id}`,
    id: c._id,
    type: 'Public Complaint',
    title: c.title,
    refId: c.trackingNumber || c._id,
    location: [c.subcity, c.woredaName, c.department].filter(Boolean).join(' / ') || '—',
    status: c.status,
    createdAt: c.createdAt,
    description: c.description,
    to: null,
  }),
  governance: (c) => ({
    key: `gov-${c._id}`,
    id: c._id,
    type: 'Governance',
    title: `${c.category}${c.title ? ` — ${c.title}` : ''}`,
    refId: c.trackingId || c._id,
    location: [c.subcity, c.woredaName, c.office].filter(Boolean).join(' / ') || '—',
    status: c.status,
    createdAt: c.createdAt,
    description: c.description,
    to: `/dashboard/citizen/governance-complaints/${c._id}`,
  }),
};

export default function MyComplaints() {
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('');
  const [trackingSearch, setTrackingSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [items, setItems] = useState([]);
  const [perType, setPerType] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [infraRes, publicRes, govRes] = await Promise.all([
        getWithRetry('/infrastructure/my/reports', { params: { page: 1, limit: 100 }, timeout: 10000 }).catch(() => null),
        getWithRetry('/public-complaints', { params: { page: 1, limit: 100 }, timeout: 10000 }).catch(() => null),
        getWithRetry('/governance-complaints', { params: { page: 1, limit: 100 }, timeout: 10000 }).catch(() => null),
      ]);

      const infra = (infraRes?.data?.reports || []).map(normalize.infrastructure);
      const pub = (publicRes?.data?.data?.complaints || []).map(normalize.publicComplaint);
      const gov = (govRes?.data?.data?.complaints || []).map(normalize.governance);

      const combined = [...infra, ...pub, ...gov].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setItems(combined);
      setPerType({
        All: combined.length,
        Infrastructure: infra.length,
        'Public Complaint': pub.length,
        Governance: gov.length,
      });
      setError(null);
    } catch (err) {
      if (!isCanceledError(err)) setError('Could not load your complaints. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const visible = useMemo(() => {
    let list = items;
    if (typeFilter !== 'All') list = list.filter((i) => i.type === typeFilter);
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    const q = trackingSearch.trim().toLowerCase();
    if (q) list = list.filter((i) => String(i.refId || '').toLowerCase().includes(q));
    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`);
      list = list.filter((i) => new Date(i.createdAt) >= from);
    }
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59`);
      list = list.filter((i) => new Date(i.createdAt) <= to);
    }
    return list;
  }, [items, typeFilter, statusFilter, trackingSearch, fromDate, toDate]);

  const statusOptions = useMemo(() => [...new Set(items.map((i) => i.status))].sort(), [items]);

  const tabBtn = (label) => (
    <button
      key={label}
      onClick={() => { setTypeFilter(label); setStatusFilter(''); }}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        typeFilter === label
          ? 'bg-emerald-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {label} <span className="opacity-70">({perType[label] ?? 0})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">My Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            All your infrastructure reports, public complaints and governance complaints in one place.
          </p>
        </div>
        {refreshing && <InlineLoader />}
      </div>

      {/* Type tabs */}
      <div className="flex flex-wrap gap-2">
        {tabBtn('All')}
        {tabBtn('Infrastructure')}
        {tabBtn('Public Complaint')}
        {tabBtn('Governance')}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          value={trackingSearch}
          onChange={(e) => setTrackingSearch(e.target.value)}
          placeholder="Search tracking number…"
          className="input-field flex-1 min-w-[160px]"
          aria-label="Search by tracking number"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-44">
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-field w-40" aria-label="From date" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field w-40" aria-label="To date" />
        <button onClick={fetchAll} className="btn-secondary">Refresh</button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error && items.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load your complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
          <button onClick={fetchAll} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'No complaints yet' : 'No complaints match the filter'}
          message={items.length === 0 ? 'Submit an infrastructure report or a complaint to start tracking it here.' : 'Try clearing the filters above.'}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((i) => {
            const meta = TYPE_META[i.type];
            return (
              <div key={i.key} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>
                        {meta.icon} {i.type}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{i.refId}</span>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1 truncate">{i.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{i.location}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Submitted {fmtShortDate(i.createdAt)}
                      {i.to && (
                        <Link to={i.to} className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium hover:underline">View details →</Link>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE(i.status)}`}>{i.status}</span>
                    {i.description && (
                      <button
                        onClick={() => setExpanded(expanded === i.key ? null : i.key)}
                        className="text-gray-400 text-xs"
                        aria-label="Toggle details"
                      >
                        {expanded === i.key ? '▲' : '▼'}
                      </button>
                    )}
                  </div>
                </div>
                {expanded === i.key && i.description && (
                  <p className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {i.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
