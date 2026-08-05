import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { complaintAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ComplaintDetailPanel from './ComplaintDetailPanel';
import { toast } from 'react-toastify';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';

const STATUSES = [
  'Submitted', 'Pending', 'Under Review', 'Assigned', 'Inspector Assigned',
  'Technician Assigned', 'Technician Requested', 'In Progress',
  'Awaiting Verification', 'Rework Required', 'Escalated to Subcity',
  'Resolved', 'Rejected', 'Closed', 'Reopened',
];

const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];

const STATUS_STYLES = {
  'Submitted':            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Pending':              'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'Under Review':         'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Assigned':             'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Inspector Assigned':   'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Technician Assigned':  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Technician Requested': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'In Progress':          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Awaiting Verification': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Rework Required':      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'Escalated to Subcity': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Resolved':             'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Rejected':             'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Closed':               'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'Reopened':             'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
};

const CHART_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

const priorityStyle = (p) => p === 'Urgent' || p === 'High'
  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  : p === 'Medium'
    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

function StatCard({ label, value, icon, accent }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${accent}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', subcity: '', woreda: '', department: '', priority: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [detail, setDetail] = useState(null);          // complaint opened in the detail panel

  const fetchList = useCallback(async (override = {}) => {
    setLoading(true);
    try {
      const params = { page: override.page || page, limit: 10 };
      if (override.search !== undefined ? override.search : search) params.search = override.search !== undefined ? override.search : search;
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await complaintAPI.getAll(params);
      setComplaints(r.data?.data?.complaints || []);
      setPages(r.data?.data?.pages || 1);
      setTotal(r.data?.data?.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await complaintAPI.getStats();
      setStats(r.data?.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const { on } = useSocket() || {};
  const fetchRef = useRef(fetchList);
  fetchRef.current = fetchList;
  const statsRef = useRef(fetchStats);
  statsRef.current = fetchStats;
  useEffect(() => {
    if (!on) return;
    const events = ['complaint:created', 'complaint:updated', 'complaint:assigned', 'complaint:escalated', 'complaint:note-added'];
    const cleanups = events.map(e => on(e, () => { fetchRef.current(); statsRef.current(); }));
    return () => cleanups.forEach(off => off && off());
  }, [on]);

  const openDetail = (complaint) => setDetail(complaint);

  const refreshBoth = () => { fetchList(); fetchStats(); };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await complaintAPI.updateStatus(id, { status: newStatus });
      toast.success(`Status updated to "${newStatus}"`);
      refreshBoth();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update status'); }
  };

  const optionLists = useMemo(() => {
    const subcities = stats?.bySubcity ? Object.keys(stats.bySubcity).sort() : [];
    const departments = stats?.byDepartment ? Object.keys(stats.byDepartment).sort() : [];
    return { subcities, departments };
  }, [stats]);

  const pieData = useMemo(() => (stats?.byStatus ? Object.entries(stats.byStatus).map(([name, value]) => ({ name, value })) : []), [stats]);
  const barData = useMemo(() => (stats?.bySubcity ? Object.entries(stats.bySubcity).map(([name, count]) => ({ name, count })) : []), [stats]);
  const deptData = useMemo(() => (stats?.byDepartment ? Object.entries(stats.byDepartment).map(([name, count]) => ({ name, count })) : []), [stats]);
  const trendData = useMemo(() => (stats?.resolutionTrend || []), [stats]);
  const summary = stats?.summary || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Complaint Management</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{total} citizen complaint{total === 1 ? '' : 's'}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard label="Total" value={summary.total ?? '—'} icon="📥" accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300" />
        <StatCard label="Pending" value={summary.pending ?? '—'} icon="⏳" accent="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" />
        <StatCard label="Under Review" value={summary.underReview ?? '—'} icon="🔍" accent="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300" />
        <StatCard label="In Progress" value={summary.inProgress ?? '—'} icon="🛠️" accent="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300" />
        <StatCard label="Escalated" value={summary.escalated ?? '—'} icon="↗️" accent="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300" />
        <StatCard label="Resolved Today" value={summary.resolvedToday ?? '—'} icon="✅" accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300" />
        <StatCard label="Closed" value={summary.closed ?? '—'} icon="🗂️" accent="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300" />
        <StatCard label="Overdue" value={summary.overdue ?? '—'} icon="⛔" accent="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300" />
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Status distribution</h4>
          {pieData.length === 0
            ? <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>}
        </div>
        <div className="card p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">By subcity</h4>
          {barData.length === 0
            ? <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
        <div className="card p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">By department</h4>
          {deptData.length === 0
            ? <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptData} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
        <div className="card p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Resolution trend (30 days)</h4>
          {trendData.length === 0
            ? <p className="text-sm text-gray-400 py-8 text-center">No resolutions yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#10b981" fill="url(#trendFill)" />
                </AreaChart>
              </ResponsiveContainer>}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search title, tracking #, citizen name, phone, description…"
            className="input-field flex-1 min-w-[220px]"
          />
          <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }} className="input-field w-auto">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.priority} onChange={e => { setFilters(f => ({ ...f, priority: e.target.value })); setPage(1); }} className="input-field w-auto">
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={filters.subcity} onChange={e => { setFilters(f => ({ ...f, subcity: e.target.value })); setPage(1); }} className="input-field w-auto">
            <option value="">All Subcities</option>
            {optionLists.subcities.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={filters.woreda} onChange={e => { setFilters(f => ({ ...f, woreda: e.target.value })); setPage(1); }} placeholder="Woreda (e.g. 01)"
            className="input-field w-[120px]" />
          <select value={filters.department} onChange={e => { setFilters(f => ({ ...f, department: e.target.value })); setPage(1); }} className="input-field w-auto">
            <option value="">All Departments</option>
            {optionLists.departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1); }} className="input-field w-auto" title="From date" />
          <input type="date" value={filters.to} onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1); }} className="input-field w-auto" title="To date" />
          {(search || Object.values(filters).some(Boolean)) && (
            <button
              onClick={() => { setSearch(''); setFilters({ status: '', subcity: '', woreda: '', department: '', priority: '', from: '', to: '' }); setPage(1); }}
              className="text-xs text-red-600 hover:underline dark:text-red-400">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : complaints.length === 0 ? (
        <EmptyState icon="📋" title="No complaints found" description="Try adjusting the search or filters." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Complaint</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Citizen</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Location</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Priority</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Assigned To</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Date</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {complaints.map(c => (
                  <tr key={c._id} onClick={() => openDetail(c)} className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(c)} className="text-left">
                        <p className="font-medium text-gray-800 dark:text-gray-200 max-w-[220px] truncate hover:text-primary-600 dark:hover:text-primary-400">{c.title}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{c.trackingNumber}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 dark:text-gray-300">{c.reporterName || '—'}</p>
                      <p className="text-xs text-gray-400">{c.reporterPhone || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {[c.woredaName, c.subcity].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.department
                        ? <span className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 px-2 py-0.5 rounded-full">{c.department}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.priority && <span className={`px-2 py-0.5 rounded-full font-medium ${priorityStyle(c.priority)}`}>{c.priority}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {[c.assignedOfficerName, c.assignedTechnicianName].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openDetail(c)} className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 px-2 py-1 rounded-lg">View</button>
                        {c.status !== 'Resolved' && c.status !== 'Closed' && (
                          <button onClick={() => handleStatusChange(c._id, 'Resolved')} className="text-xs bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 px-2 py-1 rounded-lg">Resolve</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Detail panel */}
      {detail && (
        <ComplaintDetailPanel
          complaintId={detail._id}
          onClose={() => setDetail(null)}
          onChanged={refreshBoth}
        />
      )}
    </div>
  );
}
