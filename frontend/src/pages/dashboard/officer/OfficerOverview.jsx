import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hierarchyAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import StatCard from '../../../components/common/StatCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

export default function OfficerOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hierarchyAPI.getOfficerStats();
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Officer Overview</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {user?.fullName} · {user?.woredaName || 'Woreda'}{user?.department ? ` · ${user.department}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon="📥" label="Assigned" value={stats.assigned} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="🛠️" label="In Progress" value={stats.inProgress} color="bg-purple-100" iconColor="text-purple-600" />
        <StatCard icon="✅" label="Resolved" value={stats.resolved} color="bg-green-100" iconColor="text-green-600" />
        <StatCard icon="🏁" label="Completed" value={stats.completed} color="bg-teal-100" iconColor="text-teal-600" />
        <StatCard icon="🔍" label="Pending Verify" value={stats.pendingVerify} color="bg-amber-100" iconColor="text-amber-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <button
          onClick={() => navigate('complaints')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xl">📝</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">My Complaints</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Verify completed work, reject for rework, and assign technicians.
          </p>
        </button>
      </div>
    </div>
  );
}
