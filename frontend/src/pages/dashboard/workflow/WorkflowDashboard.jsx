import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { workflowComplaintAPI } from '../../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const STATUS_COLORS = {
  pending:              '#f59e0b',
  resolved_by_woreda:   '#22c55e',
  pending_escalation:   '#f97316',
  escalated_to_subcity: '#ef4444',
  resolved_by_subcity:  '#3b82f6',
};

const STATUS_LABELS = {
  pending:              'Pending',
  resolved_by_woreda:   'Resolved by Woreda',
  pending_escalation:   'Pending Escalation',
  escalated_to_subcity: 'Escalated',
  resolved_by_subcity:  'Resolved by Subcity',
};

const DEPT_COLORS  = { Electricity: '#f59e0b', Road: '#78716c', Water: '#06b6d4' };
const SUBCITY_COLORS = { BOLE: '#6366f1', YEKA: '#14b8a6', LEMMI_KURA: '#f43f5e' };
const SUBCITY_LABELS = { BOLE: 'Bole', YEKA: 'Yeka', LEMMI_KURA: 'Lemmi Kura' };
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981'];

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

export default function WorkflowDashboard() {
  const { user } = useAuth();
  const [stats, setStats]           = useState(null);
  const [analytics, setAnalytics]   = useState(null);
  const [days, setDays]             = useState(30);
  const [loading, setLoading]       = useState(true);
  const [analyticsLoading, setAL]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await workflowComplaintAPI.getStats();
        setStats(res.data.data);
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    setAL(true);
    (async () => {
      try {
        const res = await workflowComplaintAPI.getAnalytics({ days });
        setAnalytics(res.data.data);
      } catch { /* silent */ } finally { setAL(false); }
    })();
  }, [days]);

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const pieData = stats
    ? Object.entries(stats.byStatus)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v, key: k }))
    : [];

  const deptData = stats?.byDepartment?.map((d) => ({ name: d.department, value: d.count })) || [];
  const subcityData = stats?.bySubcity?.map((s) => ({ name: SUBCITY_LABELS[s.subcity] || s.subcity, value: s.count })) || [];
  const issueData = stats?.byIssueType?.slice(0, 10) || [];
  const woredaData = stats?.byWoreda || [];

  // Build trend chart data
  const trendMap = {};
  (analytics?.trend || []).forEach(({ _id, count }) => {
    const { date, workflowStatus } = _id;
    if (!trendMap[date]) trendMap[date] = { date };
    trendMap[date][STATUS_LABELS[workflowStatus] || workflowStatus] = count;
  });
  const trendData = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  // Build subcity × department matrix bar chart
  const matrixMap = {};
  (analytics?.subcityDeptMatrix || []).forEach(({ _id, count }) => {
    const sc = SUBCITY_LABELS[_id.subcity] || _id.subcity;
    if (!matrixMap[sc]) matrixMap[sc] = { subcity: sc };
    matrixMap[sc][_id.department] = (matrixMap[sc][_id.department] || 0) + count;
  });
  const matrixData = Object.values(matrixMap);

  const summaryCards = [
    { label: 'Total', value: stats?.total || 0, color: 'text-gray-800 dark:text-gray-100', bg: 'from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700', icon: '📊' },
    { label: 'Pending', value: stats?.byStatus?.pending || 0, color: 'text-yellow-700 dark:text-yellow-400', bg: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/10', icon: '⏳' },
    { label: 'Escalated', value: stats?.byStatus?.escalated_to_subcity || 0, color: 'text-red-700 dark:text-red-400', bg: 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10', icon: '🚨' },
    { label: 'Resolved (Woreda)', value: stats?.byStatus?.resolved_by_woreda || 0, color: 'text-green-700 dark:text-green-400', bg: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10', icon: '✅' },
    { label: 'Resolved (Subcity)', value: stats?.byStatus?.resolved_by_subcity || 0, color: 'text-blue-700 dark:text-blue-400', bg: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10', icon: '🏛️' },
    { label: 'Pending Escalation', value: stats?.byStatus?.pending_escalation || 0, color: 'text-orange-700 dark:text-orange-400', bg: 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/10', icon: '🔺' },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Complaint Workflow Analytics</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Live statistics scoped to your role. Grand total: {stats?.total || 0} complaints.
        </p>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryCards.map((c) => (
          <div key={c.label} className={`card p-4 text-center bg-gradient-to-br ${c.bg}`}>
            <div className="text-2xl mb-1">{c.icon}</div>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Workflow status pie + subcity bar side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Status Breakdown</h3>
          {pieData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}>
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v, 'Complaints']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">By Subcity</h3>
          {subcityData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={subcityData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Complaints" radius={[4, 4, 0, 0]}>
                  {subcityData.map((entry, i) => (
                    <Cell key={i} fill={Object.values(SUBCITY_COLORS)[i % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Subcity × Department grouped bar */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Complaints by Subcity &amp; Department
        </h3>
        {matrixData.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={matrixData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="subcity" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {['Electricity', 'Road', 'Water'].map((dept) => (
                <Bar key={dept} dataKey={dept} fill={DEPT_COLORS[dept]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Department pie + top issue types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">By Department</h3>
          {deptData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={deptData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}>
                  {deptData.map((entry, i) => (
                    <Cell key={i} fill={DEPT_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v, 'Complaints']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Top Issue Types</h3>
          {issueData.length === 0 ? <Empty /> : (
            <div className="space-y-2.5">
              {issueData.map((item, i) => {
                const pct = stats?.total ? Math.round((item.count / stats.total) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 truncate mr-2">{item.issueType}</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0">{item.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all"
                        style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trend line chart */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Daily Trend</h3>
          <div className="flex gap-2">
            {DAYS_OPTIONS.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${days === d
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        {analyticsLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : trendData.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {Object.entries(STATUS_LABELS).map(([key, label], i) => (
                <Line key={key} type="monotone" dataKey={label}
                  stroke={STATUS_COLORS[key]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Woreda breakdown table */}
      {woredaData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">By Woreda</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-2 px-3 text-xs uppercase text-gray-500 font-medium">Woreda</th>
                  <th className="text-left py-2 px-3 text-xs uppercase text-gray-500 font-medium">Subcity</th>
                  <th className="text-right py-2 px-3 text-xs uppercase text-gray-500 font-medium">Complaints</th>
                </tr>
              </thead>
              <tbody>
                {woredaData.map((w, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3 text-gray-800 dark:text-gray-200">{w.woreda || '—'}</td>
                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{SUBCITY_LABELS[w.subcity] || w.subcity}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-800 dark:text-gray-200">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-300 dark:text-gray-600">
      <span className="text-4xl mb-2">📭</span>
      <span className="text-sm">No data yet</span>
    </div>
  );
}
