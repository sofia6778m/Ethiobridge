import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { complaintAPI, userAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
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
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString() : '—');

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

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 overflow-y-auto">
      <div className={`bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 my-8`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
    {children}
  </div>
);

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', subcity: '', woreda: '', department: '', priority: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [detail, setDetail] = useState(null);          // full complaint (with timeline/notes)
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignOfficer, setAssignOfficer] = useState(null);   // complaint
  const [assignTechnician, setAssignTechnician] = useState(null);
  const [escalating, setEscalating] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [assignable, setAssignable] = useState({ officers: [], technicians: [] });
  const [assignableLoading, setAssignableLoading] = useState(false);

  const [form, setForm] = useState({ officerId: '', technicianId: '', dueDate: '', workInstruction: '', reason: '', targetDepartment: '', note: '' });
  const [saving, setSaving] = useState(false);

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

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const r = await complaintAPI.getOne(id);
      setDetail(r.data?.data?.complaint);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to load complaint'); }
    finally { setDetailLoading(false); }
  };

  const refreshBoth = () => { fetchList(); fetchStats(); };

  const openAssignable = async (complaint, type) => {
    setAssignableLoading(true);
    setAssignable({ officers: [], technicians: [] });
    try {
      const params = { complaintId: complaint._id };
      // Load the two dropdowns in parallel from the role-scoped user endpoints.
      // These must NEVER come from the full user list — only OFFICER and
      // TECHNICIAN / CONTRACTOR accounts are returned by the server.
      const [officersRes, techniciansRes] = await Promise.all([
        userAPI.getOfficers(params),
        userAPI.getTechnicians(params),
      ]);
      const officers = officersRes.data?.data?.officers || [];
      const technicians = techniciansRes.data?.data?.technicians || [];

      console.log('Officer API result', officers);
      console.log('Technician API result', technicians);
      officers.forEach(o => console.log('Officer role check:', o.fullName, o.role));
      technicians.forEach(t => console.log('Technician role check:', t.fullName, t.role));

      // Dropdowns must only ever present the role-filtered lists. Any legacy
      // assignment value is cleared so a valid selection is required.
      setAssignable({ officers, technicians });
      setForm(f => ({ ...f, officerId: '', technicianId: '', dueDate: '', workInstruction: '' }));
      if (type === 'officer') setAssignOfficer(complaint);
      else setAssignTechnician(complaint);
    } catch (err) {
      console.error('Failed to load assignable users:', err);
      toast.error(err.response?.data?.message || 'Failed to load assignable users');
    } finally {
      setAssignableLoading(false);
    }
  };

  const handleCloseComplaint = async (complaint) => {
    setSaving(true);
    try {
      await complaintAPI.closeComplaint(complaint._id, {});
      toast.success('Complaint closed');
      setDetail(null);
      refreshBoth();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to close complaint'); }
    finally { setSaving(false); }
  };

  const handleAssignOfficer = async () => {
    if (!form.officerId) { toast.error('Select an officer'); return; }
    setSaving(true);
    try {
      await complaintAPI.assignOfficer(assignOfficer._id, { officerId: form.officerId });
      toast.success('Officer assigned');
      if (detail && detail._id === assignOfficer._id) openDetail(assignOfficer._id);
      setAssignOfficer(null);
      refreshBoth();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to assign officer'); }
    finally { setSaving(false); }
  };

  const handleAssignTechnician = async () => {
    if (!form.technicianId) { toast.error('Select a technician'); return; }
    setSaving(true);
    try {
      await complaintAPI.assignTechnician(assignTechnician._id, {
        technicianId: form.technicianId,
        dueDate: form.dueDate || undefined,
        workInstruction: form.workInstruction || undefined,
      });
      toast.success('Technician assigned');
      if (detail && detail._id === assignTechnician._id) openDetail(assignTechnician._id);
      setAssignTechnician(null);
      refreshBoth();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to assign technician'); }
    finally { setSaving(false); }
  };

  const handleEscalate = async () => {
    if (!form.reason) { toast.error('An escalation reason is required'); return; }
    setSaving(true);
    try {
      await complaintAPI.escalate(escalating._id, { reason: form.reason, targetDepartment: form.targetDepartment || undefined });
      toast.success('Complaint forwarded to subcity');
      setEscalating(null);
      refreshBoth();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to escalate'); }
    finally { setSaving(false); }
  };

  const handleAddNote = async () => {
    if (!form.note) { toast.error('Note cannot be empty'); return; }
    setSaving(true);
    try {
      await complaintAPI.addInternalNote(noteModal._id, { note: form.note });
      toast.success('Internal note added');
      setNoteModal(null);
      if (detail && detail._id === noteModal._id) openDetail(detail._id);
      refreshBoth();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add note'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await complaintAPI.updateStatus(id, { status: newStatus });
      toast.success(`Status updated to "${newStatus}"`);
      if (detail && detail._id === id) openDetail(id);
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

  const timeline = detail?.timeline || [];
  const notes = detail?.internalNotes || [];

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
                  <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(c._id)} className="text-left">
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
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => openDetail(c._id)} className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 px-2 py-1 rounded-lg">View</button>
                        {c.status !== 'Resolved' && c.status !== 'Closed' && (
                          <button onClick={() => handleStatusChange(c._id, 'Resolved')} className="text-xs bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 px-2 py-1 rounded-lg">Resolve</button>
                        )}
                        {c.status !== 'Closed' && c.status !== 'Escalated to Subcity' && (
                          <button onClick={() => { setEscalating(c); setForm(f => ({ ...f, reason: '', targetDepartment: '' })); }} className="text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-300 px-2 py-1 rounded-lg">Escalate</button>
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

      {/* Detail modal */}
      {detail && (
        <Modal title="Complaint Details" onClose={() => setDetail(null)} wide>
          {detailLoading ? <LoadingSpinner /> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[detail.status] || 'bg-gray-100 text-gray-600'}`}>{detail.status}</span>
                {detail.priority && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityStyle(detail.priority)}`}>{detail.priority}</span>}
                <span className="text-xs font-mono text-gray-400">{detail.trackingNumber}</span>
                {detail.assignedLevel && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Level: {detail.assignedLevel}</span>}
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-gray-100">{detail.title}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{detail.description}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Field label="Citizen"><p className="text-gray-700 dark:text-gray-300">{detail.reporterName || '—'}</p></Field>
                <Field label="Phone"><p className="text-gray-700 dark:text-gray-300">{detail.reporterPhone || '—'}</p></Field>
                <Field label="Email"><p className="text-gray-700 dark:text-gray-300">{detail.reporterEmail || '—'}</p></Field>
                <Field label="Category"><p className="text-gray-700 dark:text-gray-300">{detail.category || '—'}</p></Field>
                <Field label="Subcity / Woreda"><p className="text-gray-700 dark:text-gray-300">{[detail.woredaName, detail.subcity].filter(Boolean).join(' / ') || '—'}</p></Field>
                <Field label="Department"><p className="text-gray-700 dark:text-gray-300">{detail.department || '—'}</p></Field>
                <Field label="Submitted"><p className="text-gray-700 dark:text-gray-300">{fmtDateTime(detail.createdAt)}</p></Field>
                <Field label="Due"><p className="text-gray-700 dark:text-gray-300">{detail.dueDate ? fmtDate(detail.dueDate) : '—'}</p></Field>
                <Field label="Closed At"><p className="text-gray-700 dark:text-gray-300">{detail.closedAt ? fmtDateTime(detail.closedAt) : '—'}</p></Field>
              </div>

              {(detail.assignedOfficerName || detail.assignedTechnicianName || detail.technicianWorkState) && (
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Officer</p>
                    <p className="text-gray-800 dark:text-gray-200">{detail.assignedOfficerName || '—'}</p>
                    {detail.officerAccepted && <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Accepted</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Technician</p>
                    <p className="text-gray-800 dark:text-gray-200">{detail.assignedTechnicianName || '—'}</p>
                    {detail.technicianWorkState && (
                      <p className="text-xs text-gray-500 mt-0.5">Work: {String(detail.technicianWorkState).replace(/_/g, ' ')}</p>
                    )}
                  </div>
                  {detail.workInstruction && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Work instruction</p>
                      <p className="text-gray-800 dark:text-gray-200">{detail.workInstruction}</p>
                    </div>
                  )}
                  {detail.verifiedByOfficerId?.fullName && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Verified by</p>
                      <p className="text-gray-800 dark:text-gray-200">{detail.verifiedByOfficerId.fullName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(detail.verifiedAt)}</p>
                    </div>
                  )}
                  {detail.closedByAdminName && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Closed by</p>
                      <p className="text-gray-800 dark:text-gray-200">{detail.closedByAdminName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(detail.closedAt)}</p>
                    </div>
                  )}
                  {detail.escalationReason && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Escalation reason</p>
                      <p className="text-gray-800 dark:text-gray-200">{detail.escalationReason}</p>
                      <p className="text-xs text-gray-400 mt-1">{fmtDateTime(detail.escalatedToSubcityAt)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Timeline</h4>
                {timeline.length === 0 ? <p className="text-sm text-gray-400">No activity yet.</p> : (
                  <ol className="border-l-2 border-gray-200 dark:border-gray-600 ml-2 space-y-3">
                    {timeline.map((t, i) => (
                      <li key={i} className="ml-4">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                          {String(t.action || '').replace(/_/g, ' ')}
                        </p>
                        {t.description && <p className="text-xs text-gray-500 dark:text-gray-400">{t.description}</p>}
                        <p className="text-xs text-gray-400">
                          {[t.performedByName, t.performedByRole].filter(Boolean).join(' · ') || 'System'}
                          {t.at ? ` · ${fmtDateTime(t.at)}` : ''}
                        </p>
                        {(t.previousStatus || t.newStatus) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t.previousStatus && <span>{t.previousStatus}</span>}
                            {t.previousStatus && t.newStatus && <span> → </span>}
                            {t.newStatus && <span className="font-medium text-gray-700 dark:text-gray-300">{t.newStatus}</span>}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Internal notes */}
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Internal notes</h4>
                {notes.length === 0 ? <p className="text-sm text-gray-400">No internal notes yet.</p> : (
                  <div className="space-y-2">
                    {notes.map((n, i) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{n.body}</p>
                        <p className="text-xs text-gray-400 mt-1">{n.authorName || 'Unknown'} · {fmtDateTime(n.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <select
                  value={detail.status}
                  onChange={e => handleStatusChange(detail._id, e.target.value)}
                  className="input-field w-auto text-sm">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => openAssignable(detail, 'officer')} className="btn-secondary px-3 py-1.5 text-sm">👤 Assign Officer</button>
                <button onClick={() => openAssignable(detail, 'technician')} className="btn-secondary px-3 py-1.5 text-sm">🔧 Assign Technician</button>
                <button onClick={() => { setNoteModal(detail); setForm(f => ({ ...f, note: '' })); }} className="btn-secondary px-3 py-1.5 text-sm">📝 Add Note</button>
                {detail.status === 'Resolved' && (
                  <button onClick={() => handleCloseComplaint(detail)} disabled={saving} className="btn-secondary px-3 py-1.5 text-sm text-green-700 dark:text-green-300">✅ Close Complaint</button>
                )}
                {detail.status !== 'Escalated to Subcity' && (
                  <button onClick={() => { setEscalating(detail); setForm(f => ({ ...f, reason: '', targetDepartment: '' })); }} className="btn-secondary px-3 py-1.5 text-sm text-orange-600 dark:text-orange-300">↗️ Forward to Subcity</button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Assign officer modal */}
      {assignOfficer && (
        <Modal title="Assign Officer" onClose={() => setAssignOfficer(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{assignOfficer.title} ({assignOfficer.trackingNumber})</p>
          <div className="space-y-3">
            <Field label="Officer">
              {assignableLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                  Loading officers…
                </p>
              ) : assignable.officers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                  No officer available for this department.
                </p>
              ) : (
                <select value={form.officerId} onChange={e => setForm(f => ({ ...f, officerId: e.target.value }))} className="input-field">
                  <option value="">Select officer…</option>
                  {assignable.officers.map(o => (
                    <option key={o._id} value={o._id}>{o.fullName} {o.department ? `— ${o.department}` : ''}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setAssignOfficer(null)} className="btn-secondary flex-1">{'Cancel'}</button>
            <button onClick={handleAssignOfficer} disabled={saving || assignableLoading || assignable.officers.length === 0} className="btn-primary flex-1 disabled:opacity-50">{saving ? '…' : 'Assign'}</button>
          </div>
        </Modal>
      )}

      {/* Assign technician modal */}
      {assignTechnician && (
        <Modal title="Assign Technician" onClose={() => setAssignTechnician(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{assignTechnician.title} ({assignTechnician.trackingNumber})</p>
          <div className="space-y-3">
            <Field label="Technician">
              {assignableLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                  Loading technicians…
                </p>
              ) : assignable.technicians.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                  No technician available for this department.
                </p>
              ) : (
                <select value={form.technicianId} onChange={e => setForm(f => ({ ...f, technicianId: e.target.value }))} className="input-field">
                  <option value="">Select technician…</option>
                  {assignable.technicians.map(t => (
                    <option key={t._id} value={t._id}>{t.fullName} {t.department ? `— ${t.department}` : ''}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Due date">
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Work instruction">
              <textarea value={form.workInstruction} onChange={e => setForm(f => ({ ...f, workInstruction: e.target.value }))} rows={3}
                placeholder="What should the technician do?" className="input-field" />
            </Field>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setAssignTechnician(null)} className="btn-secondary flex-1">{'Cancel'}</button>
            <button onClick={handleAssignTechnician} disabled={saving || assignableLoading || assignable.technicians.length === 0} className="btn-primary flex-1 disabled:opacity-50">{saving ? '…' : 'Assign'}</button>
          </div>
        </Modal>
      )}

      {/* Escalate modal */}
      {escalating && (
        <Modal title="Forward to Subcity" onClose={() => setEscalating(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{escalating.title} ({escalating.trackingNumber})</p>
          <div className="space-y-3">
            <Field label="Reason (required)">
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3}
                placeholder="Why is this being escalated to the subcity?" className="input-field" />
            </Field>
            <Field label="Target department (optional)">
              <input value={form.targetDepartment} onChange={e => setForm(f => ({ ...f, targetDepartment: e.target.value }))}
                placeholder="e.g. Electricity" className="input-field" />
            </Field>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setEscalating(null)} className="btn-secondary flex-1">{'Cancel'}</button>
            <button onClick={handleEscalate} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg font-semibold flex-1 disabled:opacity-50">
              {saving ? '…' : 'Escalate'}
            </button>
          </div>
        </Modal>
      )}

      {/* Note modal */}
      {noteModal && (
        <Modal title="Add Internal Note" onClose={() => setNoteModal(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{noteModal.title} ({noteModal.trackingNumber})</p>
          <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3}
            placeholder="Internal note (not visible to the citizen)" className="input-field" />
          <div className="flex gap-3 mt-5">
            <button onClick={() => setNoteModal(null)} className="btn-secondary flex-1">{'Cancel'}</button>
            <button onClick={handleAddNote} disabled={saving} className="btn-primary flex-1">{saving ? '…' : 'Add Note'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
