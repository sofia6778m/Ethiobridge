import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { workflowAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import Pagination from '../../../components/common/Pagination';
import WorkflowReportDetail from '../../../components/workflow/WorkflowReportDetail';
import DashboardLayout from '../../../components/layout/DashboardLayout';

const LEVEL_CONFIG = {
  kebele:          { label: 'Kebele',          icon: '🏘️', color: 'from-green-700 to-green-600', badge: 'bg-green-100 text-green-700' },
  woreda:          { label: 'Woreda/Sub-City',  icon: '🏙️', color: 'from-blue-700 to-blue-600',   badge: 'bg-blue-100 text-blue-700' },
  zone:            { label: 'Zone',             icon: '🗺️', color: 'from-purple-700 to-purple-600', badge: 'bg-purple-100 text-purple-700' },
  regional_bureau: { label: 'Regional Bureau',  icon: '🏛️', color: 'from-orange-700 to-orange-600', badge: 'bg-orange-100 text-orange-700' },
  federal_ministry:{ label: 'Federal Ministry', icon: '🏛️', color: 'from-red-700 to-red-600',      badge: 'bg-red-100 text-red-700' },
};

const LEVEL_LABELS = {
  kebele: 'Kebele', woreda: 'Woreda/Sub-City', zone: 'Zone',
  regional_bureau: 'Regional Bureau', federal_ministry: 'Federal Ministry',
};

const SEVERITY_COLORS = {
  Low: 'bg-gray-100 text-gray-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
};

function LevelReportList({ level, view, onSelectReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const cfg = LEVEL_CONFIG[level];

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { level, page, limit: 12 };
      if (view === 'resolved') params.view = 'resolved';
      else if (view === 'forwarded') params.view = 'forwarded';
      else if (view === 'history') params.view = 'history';
      else if (view === 'incoming') params.view = 'incoming';
      if (search) params.search = search;
      const res = await workflowAPI.getReports(params);
      setReports(res.data.reports);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [level, view, page, search]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchReports(); };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search reports..." className="input-field flex-1" />
        <button type="submit" className="btn-primary text-sm px-4">Search</button>
      </form>

      {reports.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 dark:text-gray-400">No reports found</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Report ID</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Title</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Category</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Severity</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Status</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Date</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {reports.map(r => (
                    <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-primary-600 dark:text-primary-400">{r.reportId}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{r.title}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{r.category}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[r.severityLevel]}`}>{r.severityLevel}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => onSelectReport(r._id)}
                          className="text-primary-600 hover:text-primary-800 dark:text-primary-400 text-xs font-medium">
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pages={pages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function LevelOverview({ level }) {
  const cfg = LEVEL_CONFIG[level];
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await workflowAPI.getStats();
        setStats(res.data.stats);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  const levelCount = typeof stats?.[level] === 'object' ? (stats[level]?.total ?? 0) : (stats?.[level] ?? 0);
  const resolved = stats?.resolved ?? 0;
  const critical = stats?.critical ?? 0;

  return (
    <div className="space-y-6">
      <div className={`bg-gradient-to-r ${cfg.color} rounded-2xl p-6 text-white`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{cfg.icon}</span>
          <div>
            <h2 className="text-xl font-bold">{cfg.label} Dashboard</h2>
            <p className="text-white/80 text-sm">Reports currently at {cfg.label} level — awaiting action</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-white/20`}>{cfg.icon}</div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{levelCount}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Reports at {cfg.label}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-green-100 dark:bg-green-900/30">✅</div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{resolved}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Resolved (all levels)</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-red-100 dark:bg-red-900/30">🚨</div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{critical}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Critical (active)</p>
          </div>
        </div>
      </div>

      {stats?.recentReports?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Recent Reports</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 text-gray-600 font-medium">Report ID</th>
                <th className="px-4 py-2 text-gray-600 font-medium">Title</th>
                <th className="px-4 py-2 text-gray-600 font-medium">Level</th>
                <th className="px-4 py-2 text-gray-600 font-medium">Status</th>
                <th className="px-4 py-2 text-gray-600 font-medium">Date</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {stats.recentReports.map(r => (
                  <tr key={r._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/dashboard/government/${level.replace('_', '-')}/reports`)}>
                    <td className="px-4 py-2 font-medium text-primary-600">{r.reportId}</td>
                    <td className="px-4 py-2 text-gray-800 max-w-[180px] truncate">{r.title}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{LEVEL_LABELS[r.currentLevel]}</span></td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { view: 'incoming',   icon: '📥', label: 'Incoming Reports',  color: 'bg-blue-50 dark:bg-blue-900/20' },
          { view: 'resolved',   icon: '✅', label: 'Resolved Reports',  color: 'bg-green-50 dark:bg-green-900/20' },
          { view: 'forwarded',  icon: '➡️', label: 'Forwarded Reports', color: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map(a => (
          <div key={a.view} onClick={() => navigate(`/dashboard/government/${level.replace('_', '-')}/reports?view=${a.view}`)}
            className={`${a.color} rounded-xl p-4 text-center hover:shadow-md transition-shadow cursor-pointer`}>
            <div className="text-2xl mb-1">{a.icon}</div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LevelDashboard({ level }) {
  const { t } = useTranslation();
  const [selectedReport, setSelectedReport] = useState(null);
  const cfg = LEVEL_CONFIG[level];
  const basePath = `/dashboard/government/${level.replace('_', '-')}`;

  const navItems = [
    { path: basePath,                          icon: '📊', label: 'Dashboard' },
    { path: `${basePath}/reports`,             icon: '📋', label: 'All Reports' },
    { path: `${basePath}/reports?view=incoming`,  icon: '📥', label: 'Incoming Reports' },
    { path: `${basePath}/reports?view=forwarded`, icon: '➡️', label: 'Forwarded Reports' },
    { path: `${basePath}/reports?view=resolved`,  icon: '✅', label: 'Resolved Reports' },
    { path: `${basePath}/reports?view=history`,   icon: '📜', label: 'Report History' },
    { path: '/dashboard/government/notifications', icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/government/profile',    icon: '👤', label: 'Profile' },
  ];

  return (
    <DashboardLayout navItems={navItems} title={`${cfg.icon} ${cfg.label} Dashboard`}>
      <Routes>
        <Route index element={<LevelOverview level={level} />} />
        <Route path="reports" element={
          selectedReport
            ? <WorkflowReportDetail reportId={selectedReport} onBack={() => setSelectedReport(null)} />
            : <LevelReportList level={level} view="all" onSelectReport={setSelectedReport} />
        } />
        <Route path="*" element={<Navigate to={basePath} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
