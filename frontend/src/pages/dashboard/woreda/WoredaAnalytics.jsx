import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

export default function WoredaAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hierarchyAPI.getWoredaAnalytics();
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;
  if (!data) return null;

  const byStatus = data.byStatus || [];
  const byDepartment = data.byDepartment || [];
  const byOfficer = data.byOfficer || [];
  const recent = data.recent || [];
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));
  const maxDept = Math.max(1, ...byDepartment.map((d) => d.count));
  const maxOfficer = Math.max(1, ...byOfficer.map((o) => o.count));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Woreda Analytics</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {data.total} complaint(s) in this woreda
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">By Status</h3>
          <div className="space-y-3">
            {byStatus.length === 0 && <p className="text-sm text-gray-500">No data yet.</p>}
            {byStatus.map((s) => (
              <div key={s._id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-300">{s._id}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{s.count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-2 rounded-full bg-primary-500" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">By Department</h3>
          <div className="space-y-3">
            {byDepartment.length === 0 && <p className="text-sm text-gray-500">No data yet.</p>}
            {byDepartment.map((d) => (
              <div key={d._id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-300">{d._id || 'General'}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{d.count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">By Officer</h3>
          <div className="space-y-3">
            {byOfficer.length === 0 && <p className="text-sm text-gray-500">No data yet.</p>}
            {byOfficer.map((o) => (
              <div key={o._id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-300">{o.name || 'Unassigned'}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{o.count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(o.count / maxOfficer) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Recent Complaints</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No recent complaints.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="p-3">Tracking ID</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c._id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-300">{c.trackingId}</td>
                    <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{c.title}</td>
                    <td className="p-3">{c.department}</td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{c.status}</span>
                    </td>
                    <td className="p-3 text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
