import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hierarchyAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import StatCard from '../../../components/common/StatCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

export default function TechnicianOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hierarchyAPI.getTechnicianStats();
      setStats(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <LoadingSpinner />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Technician Overview</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {user?.fullName} · {user?.woredaName || 'Woreda'}{user?.department ? ` · ${user.department}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="📥" label="Open" value={stats.open} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="🛠️" label="In Progress" value={stats.inProgress} color="bg-purple-100" iconColor="text-purple-600" />
        <StatCard icon="🏁" label="Completed" value={stats.completed} color="bg-teal-100" iconColor="text-teal-600" />
        <StatCard icon="📊" label="Total" value={stats.total} color="bg-primary-100" iconColor="text-primary-600" />
      </div>

      <button
        onClick={() => navigate('work-orders')}
        className="card p-6 text-left hover:shadow-md transition-shadow w-full md:w-1/2"
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-xl">🔧</span>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">My Work Orders</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Start assigned work orders, log progress, and mark work complete for verification.
        </p>
      </button>
    </div>
  );
}
