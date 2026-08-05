import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { governanceComplaintAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import { fmtShortDate } from '../../../../components/governance/governanceMeta';

function StatCard({ label, value, icon, tone }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${tone || 'bg-primary-100 dark:bg-primary-900/40'}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      </div>
    </div>
  );
}

function BarList({ title, items, tone = 'bg-amber-500' }) {
  const max = items.length ? Math.max(...items.map((i) => i.count || 0)) : 0;
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No data yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i._id || i.name || i.office}>
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                <span className="truncate mr-2">{i._id}</span>
                <span className="font-medium shrink-0">{i.count}</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? Math.max(6, (i.count / max) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GovernanceAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await governanceComplaintAPI.getAnalytics();
      setAnalytics(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load governance analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;

  const a = analytics || {};
  const byCategory = a.byCategory || [];
  const byWoreda = a.byWoreda || [];
  const topOffices = a.topOffices || [];
  const monthlyTrend = a.monthlyTrend || [];

  const maxTrend = monthlyTrend.length ? Math.max(...monthlyTrend.map((m) => m.count || 0)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Governance Analytics</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Insight into governance complaints, escalation and corruption reporting across the subcity.
          </p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard label="Total Complaints" value={a.total ?? 0} icon="⚖️" tone="bg-amber-100 dark:bg-amber-900/40" />
        <StatCard label="Pending" value={a.pendingTotal ?? 0} icon="🕐" tone="bg-blue-100 dark:bg-blue-900/40" />
        <StatCard label="Overdue / Due Soon" value={a.overdueComplaints?.length ?? 0} icon="⏰" tone="bg-red-100 dark:bg-red-900/40" />
        <StatCard label="Escalation Rate" value={a.escalationRate != null ? `${a.escalationRate}%` : '—'} icon="🚨" tone="bg-red-100 dark:bg-red-900/40" />
        <StatCard label="Corruption Reports" value={a.corruptionCount ?? 0} icon="🧾" tone="bg-violet-100 dark:bg-violet-900/40" />
        <StatCard label="Anti-Corruption Referrals" value={a.antiCorruptionReferrals ?? 0} icon="🏛️" tone="bg-indigo-100 dark:bg-indigo-900/40" />
        <StatCard
          label="Avg Resolution Time"
          value={a.averageResolutionHours != null ? `${a.averageResolutionHours}h` : '—'}
          icon="⏱️"
          tone="bg-emerald-100 dark:bg-emerald-900/40"
        />
      </div>

      {(a.averageFirstResponseHours != null || (a.pendingByStatus?.length || 0) > 0 || (a.overdueComplaints?.length || 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {a.averageFirstResponseHours != null && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Average First Response Time</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">From submission to first officer response</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{a.averageFirstResponseHours}h</p>
            </div>
          )}
          {(a.pendingByStatus?.length || 0) > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Pending by Status</h3>
              <div className="space-y-3">
                {a.pendingByStatus.map((s) => (
                  <div key={s._id}>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                      <span className="truncate mr-2">{s._id}</span>
                      <span className="font-medium shrink-0">{s.count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${a.pendingTotal ? Math.max(6, (s.count / a.pendingTotal) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(a.overdueComplaints?.length || 0) > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Overdue / Due Soon</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {a.overdueComplaints.map((c) => (
                  <div key={c._id} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 dark:border-gray-700 pb-2">
                    <div className="min-w-0">
                      <p className="font-mono text-gray-700 dark:text-gray-200 truncate">{c.trackingId} — {c.office}</p>
                      <p className="text-gray-400">{c.status} · {c.isOverdue ? 'Overdue' : `Due ${fmtShortDate(c.slaDueAt)}`}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(a.officerPerformance?.length || 0) > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Officer Performance (responses on resolved complaints)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {a.officerPerformance.map((o) => (
              <div key={o._id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{o._id}</p>
                <p className="text-xs text-gray-500 mt-1">{o.responses} response(s)</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarList title="Complaints by Category" items={byCategory} tone="bg-amber-500" />
        <BarList title="Complaints by Woreda" items={byWoreda} tone="bg-blue-500" />
        <BarList title="Top Offices" items={topOffices} tone="bg-emerald-500" />
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Monthly Trend</h3>
          {monthlyTrend.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {monthlyTrend.map((m) => (
                <div key={m._id}>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                    <span className="font-mono">{m._id}</span>
                    <span className="font-medium">{m.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${maxTrend ? Math.max(4, (m.count / maxTrend) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!a.total && (
        <EmptyState icon="📈" title="No analytics available" message="Analytics appear once governance complaints have been submitted." />
      )}
    </div>
  );
}
