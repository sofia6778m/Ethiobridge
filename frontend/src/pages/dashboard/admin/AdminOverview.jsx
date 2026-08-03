import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import StatCard from '../../../components/common/StatCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function AdminOverview() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const r = await adminAPI.getStats();
      setStats(r.data.stats);
    } catch {
      // keep the last known stats — a refresh failure must not blank the page
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  // Live refresh: reload the counters whenever a report or complaint is
  // created/updated elsewhere so the dashboard numbers stay in sync.
  const { on } = useSocket() || {};
  const loadRef = useRef(loadStats);
  loadRef.current = loadStats;
  useEffect(() => {
    if (!on) return;
    const events = ['complaint:created', 'complaint:updated', 'report:created', 'report:updated', 'report:assigned'];
    const cleanups = events.map(e => on(e, () => loadRef.current()));
    return () => cleanups.forEach(off => off && off());
  }, [on]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-gray-800 to-gray-700 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">{t('admin.title')}</h2>
        <p className="text-gray-300 dark:text-gray-400 text-sm">{t('admin.desc')}</p>
        {stats?.pendingApprovals > 0 && (
          <div className="mt-3 bg-red-500/30 border border-red-400/40 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            <span className="text-red-300 text-sm">⚠️ {stats.pendingApprovals} {t('admin.pendingAlert')}</span>
            <Link to="/dashboard/admin/approvals" className="text-white text-xs underline">{t('common.review')}</Link>
          </div>
        )}
      </div>

      {stats && (
        <>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('admin.citizens')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard icon="👥" label={t('admin.totalUsers')}   value={stats.users.total}      color="bg-blue-100"   iconColor="text-blue-600" />
              <StatCard icon="👤" label={t('admin.citizens')}      value={stats.users.citizens}   color="bg-purple-100" iconColor="text-purple-600" />
              <StatCard icon="🏛️" label={t('admin.govOrgs')}      value={stats.users.govOrgs}    color="bg-yellow-100" iconColor="text-yellow-600" />
              <StatCard icon="🤝" label={t('admin.ngos')}          value={stats.users.ngos}       color="bg-teal-100"   iconColor="text-teal-600" />
              <StatCard icon="🙋" label={t('admin.volunteers')}    value={stats.users.volunteers} color="bg-pink-100"   iconColor="text-pink-600" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('admin.reportMgmt')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon="🏗️" label={t('adminStats.infraTotal')}     value={stats.infrastructure.total}    color="bg-blue-100"   iconColor="text-blue-600" />
              <StatCard icon="⚡" label={t('adminStats.infraActive')}    value={stats.infrastructure.active}   color="bg-orange-100" iconColor="text-orange-600" />
              <StatCard icon="✅" label={t('adminStats.infraResolved')}  value={stats.infrastructure.resolved} color="bg-green-100"  iconColor="text-green-600" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('admin.aggregates')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon="⏳" label={t('adminStats.pendingReports')}     value={stats.pendingReports}    color="bg-amber-100"  iconColor="text-amber-600" />
              <StatCard icon="✅" label={t('adminStats.resolvedReports')}    value={stats.resolvedReports}   color="bg-green-100"  iconColor="text-green-600" />
              <StatCard icon="📢" label={t('adminStats.publicComplaints')}  value={stats.publicComplaints}  color="bg-rose-100"   iconColor="text-rose-600" />
            </div>
          </div>
        </>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { to:'/dashboard/admin/users',      icon:'👥', label: t('admin.manageUsers'),       color:'bg-blue-50' },
          { to:'/dashboard/admin/approvals',  icon:'✅', label: t('admin.pendingApprovals'),  color:'bg-amber-50' },
          { to:'/dashboard/admin/reports',    icon:'📋', label: t('admin.allReports'),        color:'bg-red-50' },
          { to:'/dashboard/admin/activity',   icon:'📜', label: t('admin.activityLog'),       color:'bg-indigo-50' },
          { to:'/dashboard/admin/departments',icon:'🏛️', label: t('admin.deptManagement'),    color:'bg-teal-50' },
          { to:'/dashboard/admin/news',       icon:'📰', label: t('admin.newsTitle'),         color:'bg-green-50' },
          { to:'/dashboard/admin/analytics',  icon:'📈', label: t('dashboard.analyticsTitle'),color:'bg-purple-50' },
        ].map(a => (
          <Link key={a.label} to={a.to} className={`${a.color} dark:bg-gray-700 rounded-xl p-4 text-center hover:shadow-md transition-shadow`}>
            <div className="text-2xl mb-1">{a.icon}</div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
