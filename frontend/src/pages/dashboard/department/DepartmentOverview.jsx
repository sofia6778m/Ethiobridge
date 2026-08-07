import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { deptAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

export default function DepartmentOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await deptAPI.getStats();
        setStats(res.data.stats);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{user?.department || 'Department'} Dashboard</h2>
        <p className="text-sm text-gray-500">Welcome, {user?.fullName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="📋" label="Total Reports" value={stats?.total || 0} color="text-gray-800" />
        <StatCard icon="⏳" label="Pending" value={stats?.pending || 0} color="text-yellow-600" />
        <StatCard icon="🔄" label="In Progress" value={stats?.inProgress || 0} color="text-blue-600" />
        <StatCard icon="✅" label="Resolved" value={stats?.resolved || 0} color="text-green-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon="📌" label="Assigned" value={stats?.assigned || 0} color="text-indigo-600" />
        <StatCard icon="✔️" label="Completed" value={stats?.completed || 0} color="text-teal-600" />
        <StatCard icon="❌" label="Rejected" value={stats?.rejected || 0} color="text-red-600" />
      </div>

      <div className="card p-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickActionLink to="/department/dashboard/reports" icon="📋" label="View All Reports" />
          <QuickActionLink to="/department/dashboard/reports?status=Submitted" icon="⏳" label="New Reports" />
          <QuickActionLink to="/department/dashboard/reports?status=Assigned" icon="📌" label="Assigned to Me" />
          <QuickActionLink to="/department/dashboard/reports?status=In%20Progress" icon="🔄" label="In Progress" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="card p-5 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function QuickActionLink({ to, icon, label }) {
  return (
    <Link to={to} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-center transition-colors">
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
    </Link>
  );
}
