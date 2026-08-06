import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { governanceManagementAPI, governanceComplaintAPI } from '../../../../services/api';

function StatCard({ label, value, icon, tone, to }) {
  return (
    <Link to={to} className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${tone || 'bg-primary-100 dark:bg-primary-900/40'}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      </div>
    </Link>
  );
}

export default function GovernanceManagementOverview() {
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        governanceManagementAPI.getSummary(),
        governanceComplaintAPI.getAnalytics().catch(() => null),
      ]);
      setSummary(s.data.data);
      setAnalytics(a?.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load governance summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const byCategory = analytics?.byCategory || [];

  const maxCategoryCount = byCategory.length
    ? Math.max(...byCategory.map((c) => c.count || 0))
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Governance Management</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Manage offices, complaint categories and officers that power the public service governance complaint system.
        </p>
      </div>

      {loading && !summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse"><div className="h-8 w-10 rounded bg-gray-200 dark:bg-gray-700 mb-2" /><div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard to="./offices"    label="Government Offices"   value={summary?.offices    ?? 0} icon="🏛️" tone="bg-emerald-100 dark:bg-emerald-900/40" />
          <StatCard to="./categories" label="Complaint Categories" value={summary?.categories  ?? 0} icon="🏷️" tone="bg-violet-100 dark:bg-violet-900/40" />
          <StatCard to="./users"      label="Governance Officers"  value={summary?.officers    ?? 0} icon="🧑‍💼" tone="bg-indigo-100 dark:bg-indigo-900/40" />
          <StatCard to="../governance-complaints" label="Complaints Received" value={summary?.complaints ?? 0} icon="⚖️" tone="bg-amber-100 dark:bg-amber-900/40" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="./offices" className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 p-4 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors">
              <p className="text-lg mb-1">🏛️</p>
              <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">Government Offices</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add or edit the offices citizens can complain about.</p>
            </Link>
            <Link to="./categories" className="rounded-xl border-2 border-violet-200 dark:border-violet-800 p-4 hover:border-violet-400 dark:hover:border-violet-600 transition-colors">
              <p className="text-lg mb-1">🏷️</p>
              <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">Complaint Categories</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Define the issue types shown per office on the public form.</p>
            </Link>
            <Link to="./users" className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 p-4 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors">
              <p className="text-lg mb-1">🧑‍💼</p>
              <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">User Management</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create accounts for staff who process complaints.</p>
            </Link>
            <Link to="./analytics" className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 p-4 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors">
              <p className="text-lg mb-1">📈</p>
              <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">Governance Analytics</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Track categories, woredas, escalation and corruption trends.</p>
            </Link>
            <Link to="../governance-complaints" className="rounded-xl border-2 border-amber-200 dark:border-amber-800 p-4 hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
              <p className="text-lg mb-1">⚖️</p>
              <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">Complaints Inbox</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Review and respond to incoming service governance complaints.</p>
            </Link>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Complaints by Category</h3>
          {byCategory.length ? (
            <div className="space-y-3">
              {byCategory.map((c) => (
                <div key={c._id}>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                    <span>{c._id}</span><span className="font-medium">{c.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${maxCategoryCount ? Math.max(6, (c.count / maxCategoryCount) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No complaint analytics available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
