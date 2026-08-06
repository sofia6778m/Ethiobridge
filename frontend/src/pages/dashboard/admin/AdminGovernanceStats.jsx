/**
 * AdminGovernanceStats
 *
 * Read-only governance statistics page for the System Admin dashboard.
 * Shows platform-wide totals (offices, categories, officers, complaints) and
 * per-subcity breakdowns. No create / edit / delete actions — governance master
 * data is owned exclusively by each Subcity Admin.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { governanceManagementAPI, governanceComplaintAPI, publicAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

function StatTile({ icon, label, value, sub, tone }) {
  return (
    <div className={`card p-4 flex items-center gap-3 ${tone || ''}`}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-white/60 dark:bg-gray-900/30 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-tight">{value ?? '—'}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
        {sub != null && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub} active</p>
        )}
      </div>
    </div>
  );
}

export default function AdminGovernanceStats() {
  const [summary, setSummary] = useState(null);
  const [subcities, setSubcities] = useState([]);
  const [perSubcity, setPerSubcity] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summRes, subcityRes, analyticsRes] = await Promise.all([
        governanceManagementAPI.getAdminSummary().catch(() => null),
        publicAPI.getSubcities().catch(() => null),
        governanceComplaintAPI.getAnalytics().catch(() => null),
      ]);

      setSummary(summRes?.data?.data || null);
      setAnalytics(analyticsRes?.data?.data || null);

      const list = subcityRes?.data?.subcities || [];
      setSubcities(list);

      // Fetch per-subcity summaries in parallel (best-effort)
      if (list.length) {
        const results = await Promise.allSettled(
          list.map((s) =>
            governanceManagementAPI.getAdminSummary({ subcity: s.name })
              .then((r) => ({ subcity: s.name, ...r.data.data }))
              .catch(() => ({ subcity: s.name, offices: 0, categories: 0, officers: 0, complaints: 0 }))
          )
        );
        setPerSubcity(results.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load governance statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <LoadingSpinner />;

  const bySubcity = analytics?.bySubcity || [];
  const maxComplaints = bySubcity.length
    ? Math.max(...bySubcity.map((s) => s.count || 0))
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Governance Statistics</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Platform-wide read-only overview of all subcity governance offices, categories, officers and complaints.
            Governance master data is managed exclusively by each Subcity Admin.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="btn-secondary text-sm shrink-0"
        >
          Refresh
        </button>
      </div>

      {/* Platform totals */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Platform totals
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon="🏛️" label="Government Offices"   value={summary?.offices}    sub={summary?.activeOffices}    tone="" />
          <StatTile icon="🏷️" label="Complaint Categories" value={summary?.categories}  sub={summary?.activeCategories} tone="" />
          <StatTile icon="🧑‍💼" label="Governance Officers"  value={summary?.officers}   sub={summary?.activeOfficers}   tone="" />
          <StatTile icon="⚖️" label="Governance Complaints" value={summary?.complaints}  tone="" />
        </div>
      </div>

      {/* Per-subcity breakdown table */}
      {perSubcity.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Per-subcity breakdown
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium text-center">Offices</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium text-center">Categories</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium text-center">Officers</th>
                  <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium text-center">Complaints</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {perSubcity.map((row) => (
                  <tr key={row.subcity} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{row.subcity}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{row.offices ?? 0}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{row.categories ?? 0}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{row.officers ?? 0}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{row.complaints ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Complaints by subcity bar chart */}
      {bySubcity.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Complaints by subcity
          </p>
          <div className="card p-5 space-y-3">
            {bySubcity.map((s) => (
              <div key={s._id}>
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                  <span className="truncate mr-2">{s._id || 'Unknown'}</span>
                  <span className="font-medium shrink-0">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${maxComplaints ? Math.max(4, (s.count / maxComplaints) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Governance management note */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
          ℹ️ Governance master data is managed by each Subcity Admin
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
          Government offices, complaint categories and governance officers are created and maintained
          exclusively by the Subcity Admin for each subcity. System Admins can view statistics and
          audit logs here but cannot create, edit or delete these records.
        </p>
      </div>
    </div>
  );
}
