import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { subcityAPI, woredaAPI, complaintAPI } from '../../../services/api';

const SUB_CITY_LABELS = {
  subcity_bole: 'Bole',
  subcity_yeka: 'Yeka',
  subcity_lemmi_kura: 'Lemmi Kura',
};

export default function SharedOverview() {
  const { user } = useAuth();
  const role = user?.role;
  const isSubcity = role?.startsWith('subcity_');
  const isWoreda = role === 'woreda';

  const [stats, setStats] = useState(null);
  const [complaintStats, setComplaintStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [r1, r2] = await Promise.all([
          isSubcity ? subcityAPI.getStats() : isWoreda ? woredaAPI.getStats() : Promise.resolve(null),
          complaintAPI.getStats(),
        ]);
        if (r1) setStats(r1.data.stats);
        if (r2) setComplaintStats(r2.data.data);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isSubcity, isWoreda]);

  const scopeLabel = isSubcity
    ? (SUB_CITY_LABELS[role] || '') + ' Subcity'
    : isWoreda
      ? user?.woredaName || 'My Woreda'
      : '';

  const complaintTotal = complaintStats?.total || 0;
  const complaintResolved = complaintStats?.byStatus?.Resolved || 0;
  const complaintPending = (complaintStats?.byStatus?.Submitted || 0) + (complaintStats?.byStatus?.['Under Review'] || 0);

  const statCards = isSubcity
    ? [
        { icon: '📋', label: 'Total Reports', value: stats?.totalReports || 0, color: 'text-gray-800 dark:text-gray-200' },
        { icon: '⏳', label: 'Pending', value: stats?.pendingReports || 0, color: 'text-yellow-600 dark:text-yellow-400' },
        { icon: '🔄', label: 'In Progress', value: stats?.activeReports || 0, color: 'text-blue-600 dark:text-blue-400' },
        { icon: '✅', label: 'Resolved', value: stats?.resolvedReports || 0, color: 'text-green-600 dark:text-green-400' },
      ]
    : isWoreda
      ? [
          { icon: '📋', label: 'Total Reports', value: stats?.totalReports || 0, color: 'text-gray-800 dark:text-gray-200' },
          { icon: '⏳', label: 'Pending', value: stats?.pendingReports || 0, color: 'text-yellow-600 dark:text-yellow-400' },
          { icon: '🔄', label: 'In Progress', value: stats?.inProgressReports || 0, color: 'text-blue-600 dark:text-blue-400' },
          { icon: '✅', label: 'Resolved', value: stats?.resolvedReports || 0, color: 'text-green-600 dark:text-green-400' },
        ]
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome, {user?.fullName}!
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {scopeLabel ? `Scope: ${scopeLabel}` : 'Dashboard'} — you only see data assigned to your role.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(card => (
              <div key={card.label} className="card p-5 text-center">
                <div className="text-3xl mb-2">{card.icon}</div>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {isSubcity && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Infrastructure Reports</h3>
                <StatRows stats={stats?.infrastructure} />
              </div>
              <div className="card p-6">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Emergency Reports</h3>
                <StatRows stats={stats?.emergency} />
              </div>
            </div>
          )}

          <div className="card p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Complaints Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MiniStat label="Total Complaints" value={complaintTotal} color="text-gray-800 dark:text-gray-200" />
              <MiniStat label="Pending / Under Review" value={complaintPending} color="text-yellow-600 dark:text-yellow-400" />
              <MiniStat label="Resolved" value={complaintResolved} color="text-green-600 dark:text-green-400" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatRows({ stats }) {
  return (
    <div className="space-y-2">
      <Row label="Total" value={stats?.total || 0} color="text-gray-800 dark:text-gray-200" />
      <Row label="Pending" value={stats?.pending || 0} color="text-yellow-600" />
      <Row label="Active" value={stats?.active || 0} color="text-blue-600" />
      <Row label="Resolved" value={stats?.resolved || 0} color="text-green-600" />
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
