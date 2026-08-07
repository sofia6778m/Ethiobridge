import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getWithRetry } from '../../../utils/requestUtils';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import InlineLoader from '../../../components/common/InlineLoader';
import EmptyState from '../../../components/common/EmptyState';
import { fmtShortDate } from '../../../components/governance/governanceMeta';

const PAGE_SIZE = 12;

const TYPE_BADGE = {
  infrastructure: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  governance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const STATUS_STYLE = (status) => {
  if (['Resolved', 'Closed', 'Completed', 'Active', 'Action Taken'].includes(status)) {
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

const normalizeInfra = (r) => ({
  key: `infrastructure-${r._id}`,
  typeKey: 'infrastructure',
  type: 'Infrastructure',
  id: r._id,
  refId: r.reportId || r._id,
  title: r.title || 'Untitled report',
  description: r.description || '',
  status: r.status,
  category: r.category || '—',
  office: r.department || '—',
  subcity: r.subcity || r.region || '—',
  location: [r.region, r.subcity, r.woreda].filter(Boolean).join(' / ') || '—',
  createdAt: r.createdAt,
});

const normalizeGov = (c) => {
  const assigned = (typeof c.assignedTo === 'object' && c.assignedTo ? c.assignedTo.fullName : '')
    || c.assignedToOffice || '';
  return {
    key: `governance-${c._id}`,
    typeKey: 'governance',
    type: 'Public Complaint',
    id: c._id,
    refId: c.trackingId || c._id,
    title: [c.category, c.title].filter(Boolean).join(' — ') || 'Untitled complaint',
    description: c.description || '',
    status: c.displayStatus || c.status,
    category: c.category || '—',
    office: c.office || '—',
    subcity: c.subcity || '—',
    location: [c.subcity, c.woredaName, c.office].filter(Boolean).join(' / ') || '—',
    assignedTo: assigned || '',
    createdAt: c.createdAt,
  };
};

const detailTo = (item) => `/dashboard/citizen/complaints/${item.typeKey}/${item.id}`;

export default function PublicComplaints() {
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [infra, setInfra] = useState({ items: [], total: 0 });
  const [gov, setGov] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const params = { page, limit: PAGE_SIZE };
    if (debouncedSearch) params.search = debouncedSearch;

    const wantInfra = tab === 'All' || tab === 'Infrastructure';
    const wantGov = tab === 'All' || tab === 'Public Complaints';

    try {
      const [infraRes, govRes] = await Promise.all([
        wantInfra
          ? getWithRetry('/infrastructure/public', { params, signal: controller.signal }).catch(() => null)
          : Promise.resolve(null),
        wantGov
          ? getWithRetry('/public/governance-complaints', { params, signal: controller.signal }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const infraItems = (infraRes?.data?.reports || []).map(normalizeInfra);
      const govItems = (govRes?.data?.data?.complaints || []).map(normalizeGov);
      const infraTotal = Number(infraRes?.data?.total || infraItems.length);
      const govTotal = Number(govRes?.data?.data?.total || govItems.length);

      if (controller.signal.aborted) return;
      setInfra({ items: infraItems, total: infraTotal });
      setGov({ items: govItems, total: govTotal });
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [tab, debouncedSearch, page]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const visible = useMemo(() => {
    const all = [...infra.items, ...gov.items].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    if (tab === 'Infrastructure') return infra.items;
    if (tab === 'Public Complaints') return gov.items;
    return all;
  }, [tab, infra.items, gov.items]);

  const total = tab === 'Infrastructure' ? infra.total : tab === 'Public Complaints' ? gov.total : infra.total + gov.total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabBtn = (label) => (
    <button
      key={label}
      onClick={() => { setTab(label); setPage(1); }}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        tab === label
          ? 'bg-emerald-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Public Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Complaints and reports shared by citizens across Addis Ababa — see what your community is facing and how offices are responding.
          </p>
        </div>
        <Link to="/dashboard/citizen/create-report" className="btn-primary">+ New Complaint</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {['All', 'Infrastructure', 'Public Complaints'].map(tabBtn)}
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, category or tracking number…"
          className="input-field flex-1 min-w-[200px]"
          aria-label="Search public complaints"
        />
        {loading && <InlineLoader />}
      </div>

      {loading && visible.length === 0 ? (
        <LoadingSpinner />
      ) : error && visible.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">Could not load public complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please try again.</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          message={debouncedSearch ? 'No complaints match your search.' : 'No public complaints have been shared yet.'}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Tracking / Ref</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.key} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_BADGE[i.typeKey]}`}>
                      {i.typeKey === 'infrastructure' ? '🏗️' : '⚖️'} {i.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.refId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[240px]">{i.title}</p>
                    {i.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[240px]">{i.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap max-w-[180px] truncate">{i.location}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLE(i.status)}`}>{i.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtShortDate(i.createdAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={detailTo(i)}
                      className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                    >
                      View details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-sm px-4 py-2 disabled:opacity-40">
            ← Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {pages}
          </span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn-secondary text-sm px-4 py-2 disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
