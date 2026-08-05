import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hierarchyAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import StatCard from '../../../components/common/StatCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

export default function SubcityOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hierarchyAPI.getSubcityStats();
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          {stats.subcity} Subcity — Overview
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {user?.fullName} · Subcity Admin
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon="🏘️" label="Woredas" value={stats.woredas} color="bg-primary-100" iconColor="text-primary-600" />
        <StatCard icon="🏛️" label="Departments" value={stats.departments} color="bg-purple-100" iconColor="text-purple-600" />
        <StatCard icon="📥" label="Complaints" value={stats.complaints} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="🕒" label="Pending" value={stats.pendingComplaints} color="bg-amber-100" iconColor="text-amber-600" />
        <StatCard icon="✅" label="Resolved" value={stats.resolvedComplaints} color="bg-green-100" iconColor="text-green-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <button
          onClick={() => navigate('woredas')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xl">🏘️</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Manage Woredas</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create woredas, edit their details, and provision woreda admin accounts.
          </p>
        </button>

        <button
          onClick={() => navigate('municipal-complaints')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xl">🏛️</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Municipal Complaints</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review all complaints across the subcity's woredas.
          </p>
        </button>
      </div>
    </div>
  );
}
