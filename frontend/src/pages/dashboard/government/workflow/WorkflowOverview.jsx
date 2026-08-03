import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { workflowAPI } from '../../../../services/api';
import StatCard from '../../../../components/common/StatCard';
import StatusBadge from '../../../../components/common/StatusBadge';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { useAuth } from '../../../../context/AuthContext';

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

const CATEGORY_ICONS = {
  'road_issue': '🛣️',
  'electricity_issue': '⚡',
  'water_supply_issue': '💧',
};

export default function WorkflowOverview({ levelConfig }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workflowAPI.getStats()
      .then(res => setStats(res.data.stats))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const { incoming = 0, assigned = 0, resolved = 0, forwarded = 0, total = 0, critical = 0, categories = [], recentReports = [] } = stats || {};

  return (
    <div className="space-y-6">
      <div className={`bg-gradient-to-r ${levelConfig.gradient} rounded-2xl p-6 text-white`}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{levelConfig.icon}</span>
          <div>
            <h2 className="text-xl font-bold">{levelConfig.title}</h2>
            <p className={`${levelConfig.subtitleColor} text-sm`}>
              {user?.fullName} — {LEVEL_LABELS[user?.administrativeLevel]} Level
            </p>
          </div>
        </div>
        <p className={`${levelConfig.subtitleColor} text-sm mt-2`}>
          Manage and track infrastructure reports at the {levelConfig.title.toLowerCase()} level.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📥" label="Incoming Reports" value={incoming} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="👤" label="Assigned to Me" value={assigned} color="bg-purple-100" iconColor="text-purple-600" />
        <StatCard icon="✅" label="Resolved" value={resolved} color="bg-green-100" iconColor="text-green-600" />
        <StatCard icon="➡️" label="Forwarded" value={forwarded} color="bg-orange-100" iconColor="text-orange-600" />
      </div>

      {critical > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">{critical} Critical Report{critical !== 1 ? 's' : ''} Pending</p>
            <p className="text-xs text-red-600 dark:text-red-400">These reports require immediate attention</p>
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Top Categories</h3>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c._id} className="flex items-center gap-3">
                <span className="text-lg">{CATEGORY_ICONS[c._id] || '📋'}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{c._id}</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{c.count}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
                    <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${(c.count / total * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Recent Reports</h3>
          <Link to={`incoming`} className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400">View All →</Link>
        </div>
        {recentReports.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-6">No recent reports</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">ID</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Title</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Category</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Severity</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Status</th>
                  <th className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {recentReports.map(r => (
                  <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-medium text-primary-600 dark:text-primary-400">{r.reportId}</td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200 max-w-[180px] truncate">{r.title}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{r.category}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[r.severityLevel]}`}>{r.severityLevel}</span>
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { to: 'incoming', icon: '📥', label: 'Incoming Reports', color: 'bg-blue-50 dark:bg-blue-900/20' },
          { to: 'assigned', icon: '👤', label: 'Assigned Reports', color: 'bg-purple-50 dark:bg-purple-900/20' },
          { to: 'resolved', icon: '✅', label: 'Resolved Reports', color: 'bg-green-50 dark:bg-green-900/20' },
          { to: 'forwarded', icon: '➡️', label: 'Forwarded Reports', color: 'bg-orange-50 dark:bg-orange-900/20' },
          { to: 'history', icon: '📜', label: 'Report History', color: 'bg-gray-50 dark:bg-gray-700/50' },
          { to: 'notifications', icon: '🔔', label: 'Notifications', color: 'bg-yellow-50 dark:bg-yellow-900/20' },
        ].map(a => (
          <Link key={a.to} to={a.to} className={`${a.color} rounded-xl p-4 text-center hover:shadow-md transition-shadow`}>
            <div className="text-2xl mb-1">{a.icon}</div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
