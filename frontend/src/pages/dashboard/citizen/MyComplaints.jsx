import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useMyComplaints from '../../../hooks/useMyComplaints';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import InlineLoader from '../../../components/common/InlineLoader';
import EmptyState from '../../../components/common/EmptyState';
import { fmtShortDate } from '../../../components/governance/governanceMeta';

const TYPE_META = {
  Infrastructure: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: '🏗️' },
  'Public Complaint': { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: '⚖️' },
};

const PRIORITY_STYLE = (priority) => {
  const p = String(priority || '').toLowerCase();
  if (['high', 'critical', 'urgent'].includes(p)) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  if (['medium', 'moderate'].includes(p)) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
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

const detailTo = (item) => `/dashboard/citizen/complaints/${item.typeKey}/${item.id}`;

export default function MyComplaints() {
  const { complaints, counts, loading, refreshing, error, reload } = useMyComplaints();
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('');
  const [trackingSearch, setTrackingSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const visible = useMemo(() => {
    let list = complaints;
    if (typeFilter !== 'All') list = list.filter((i) => i.type === typeFilter);
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    const q = trackingSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          String(i.refId || '').toLowerCase().includes(q) ||
          String(i.title || '').toLowerCase().includes(q)
      );
    }
    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`);
      list = list.filter((i) => new Date(i.createdAt) >= from);
    }
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59`);
      list = list.filter((i) => new Date(i.createdAt) <= to);
    }
    return [...list].sort((a, b) => {
      const da = new Date(a.createdAt);
      const db = new Date(b.createdAt);
      return sortBy === 'oldest' ? da - db : db - da;
    });
  }, [complaints, typeFilter, statusFilter, trackingSearch, fromDate, toDate, sortBy]);

  const statusOptions = useMemo(
    () => [...new Set(complaints.map((i) => i.status))].sort(),
    [complaints]
  );

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
      {label} <span className="opacity-70">({counts[label] ?? 0})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">My Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Every infrastructure report and public complaint you have submitted — in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <InlineLoader />}
          <Link to="/dashboard/citizen/create-report" className="btn-primary">+ New Complaint</Link>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex flex-wrap gap-2">
        {['All', 'Infrastructure', 'Public Complaint'].map(tabBtn)}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          value={trackingSearch}
          onChange={(e) => setTrackingSearch(e.target.value)}
          placeholder="Search tracking number or title…"
          className="input-field flex-1 min-w-[160px]"
          aria-label="Search by tracking number or title"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-44" aria-label="Filter by status">
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-field w-40" aria-label="From date" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field w-40" aria-label="To date" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input-field w-36" aria-label="Sort by date">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button onClick={reload} className="btn-secondary">Refresh</button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error && complaints.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load your complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please try again.</p>
          <button onClick={reload} className="btn-primary px-4 py-2 text-sm mt-4">Try Again</button>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={complaints.length === 0 ? 'No complaints yet' : 'No complaints match the filter'}
          message={complaints.length === 0 ? 'Submit an infrastructure report or a public complaint to start tracking it here.' : 'Try clearing the filters above.'}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Tracking / Ref</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Government Office</th>
                <th className="px-4 py-3 font-medium">Subcity</th>
                <th className="px-4 py-3 font-medium">Woreda</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Last Updated</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const meta = TYPE_META[i.type];
                return (
                  <tr key={i.key} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${meta.badge}`}>
                        {meta.icon} {i.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.refId}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[220px]">{i.title}</p>
                      {i.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{i.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.office}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.subcity}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.woredaName}</td>
                    <td className="px-4 py-3">
                      {i.priority && i.priority !== '—' ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PRIORITY_STYLE(i.priority)}`}>{i.priority}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLE(i.status)}`}>{i.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtShortDate(i.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtShortDate(i.updatedAt)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        to={detailTo(i)}
                        className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                      >
                        View details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
