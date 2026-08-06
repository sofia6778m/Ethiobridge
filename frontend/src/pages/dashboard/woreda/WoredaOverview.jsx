import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hierarchyAPI, governanceComplaintAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import StatCard from '../../../components/common/StatCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function WoredaOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [governance, setGovernance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hierarchyAPI.getWoredaStats();
      setStats(res.data.data);
      // Woreda officers also handle governance-complaint information requests.
      governanceComplaintAPI
        .getStats()
        .then((g) => setGovernance(g.data.data))
        .catch(() => setGovernance(null));
    } catch (err) {
      console.error('[WOREDA] Failed to load stats:', err.response?.data || err.message);
      setError(err.response?.data?.message || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <LoadingSpinner />;

  if (error || !stats) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Couldn&apos;t load the dashboard</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error || 'No data available yet.'}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={fetchStats} className="btn-primary text-sm px-4 py-2">Try Again</button>
            <button onClick={() => { window.location.href = '/login'; }} className="btn-secondary text-sm px-4 py-2">Go to Login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          {stats.woreda} Woreda — Overview
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {user?.fullName} · Woreda Admin · {stats.subcity}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard icon="🏛️" label="Departments" value={stats.departments} color="bg-purple-100" iconColor="text-purple-600" />
        <StatCard icon="👮" label="Officers" value={stats.officers} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="🔧" label="Technicians" value={stats.technicians} color="bg-teal-100" iconColor="text-teal-600" />
        <StatCard icon="📥" label="Complaints" value={stats.complaints} color="bg-primary-100" iconColor="text-primary-600" />
        <StatCard icon="🕒" label="Pending" value={stats.pendingComplaints} color="bg-amber-100" iconColor="text-amber-600" />
        <StatCard icon="✅" label="Resolved" value={stats.resolvedComplaints} color="bg-green-100" iconColor="text-green-600" />
        <StatCard icon="🏢" label="Gov. Requests" value={governance?.awaitingWoreda ?? '—'} color="bg-orange-100" iconColor="text-orange-600" />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <button
          onClick={() => navigate('departments')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-xl">🏛️</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Manage Departments</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage the departments of this woreda.</p>
        </button>

        <button
          onClick={() => navigate('staff')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xl">👥</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Manage Staff</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Provision officers and technicians for this woreda.</p>
        </button>

        <button
          onClick={() => navigate('municipal-complaints')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xl">📝</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Municipal Complaints</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Assign officers and technicians, escalate, or close complaints.</p>
        </button>
      </div>
    </div>
  );
}
