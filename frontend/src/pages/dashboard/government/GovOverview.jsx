import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { infraAPI, emergencyAPI, workflowAPI } from '../../../services/api';
import StatCard from '../../../components/common/StatCard';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { useAuth } from '../../../context/AuthContext';

export default function GovOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [workflowStats, setWorkflowStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ir, er, wf] = await Promise.all([
          infraAPI.getGovernmentReports({ limit: 5 }),
          emergencyAPI.getGovernmentReports({ limit: 5 }),
          workflowAPI.getStats(),
        ]);
        setStats({
          totalInfra: ir.data.total,
          totalEmergency: er.data.total,
          pendingInfra: ir.data.reports.filter(r => r.status === 'Under Review').length,
        });
        setWorkflowStats(wf.data.stats);
        const combined = [
          ...ir.data.reports.map(r => ({ ...r, _type: 'Infrastructure' })),
          ...er.data.reports.map(r => ({ ...r, _type: 'Emergency' })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
        setPending(combined);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">{t('gov.title')}</h2>
        <p className="text-blue-100 text-sm">{user?.organizationName || user?.fullName} — {t('gov.desc')}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon="🏗️" label={t('gov.infraReports')}    value={stats.totalInfra}     color="bg-blue-100"   iconColor="text-blue-600" />
        <StatCard icon="🚨" label={t('gov.emergencyReq')}    value={stats.totalEmergency} color="bg-red-100"    iconColor="text-red-600" />
        <StatCard icon="⏳" label={t('gov.underReview')}      value={stats.pendingInfra}   color="bg-orange-100" iconColor="text-orange-600" />
      </div>

      {workflowStats && (
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Reports by Administrative Level</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { key: 'kebele',          icon: '🏘️', label: 'Kebele',          color: 'bg-green-100 dark:bg-green-900/30', iconColor: 'text-green-600' },
              { key: 'woreda',          icon: '🏙️', label: 'Woreda/Sub-City', color: 'bg-blue-100 dark:bg-blue-900/30',   iconColor: 'text-blue-600' },
              { key: 'zone',            icon: '🗺️', label: 'Zone',            color: 'bg-purple-100 dark:bg-purple-900/30', iconColor: 'text-purple-600' },
              { key: 'regional_bureau', icon: '🏛️', label: 'Regional Bureau', color: 'bg-orange-100 dark:bg-orange-900/30', iconColor: 'text-orange-600' },
              { key: 'federal_ministry',icon: '🏛️', label: 'Federal Ministry', color: 'bg-red-100 dark:bg-red-900/30',      iconColor: 'text-red-600' },
              { key: 'resolved',        icon: '✅',  label: 'Resolved',        color: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600' },
            ].map(item => {
              const val = workflowStats[item.key];
              const display = typeof val === 'object' && val !== null ? (val.total ?? 0) : (val ?? 0);
              return (
                <div key={item.key} className={`${item.color} rounded-xl p-3 text-center`}>
                  <p className="text-xl mb-0.5">{item.icon}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className={`text-lg font-bold ${item.iconColor}`}>{display}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{t('gov.recentReports')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-2 text-gray-600 font-medium">{t('common.type')}</th>
              <th className="px-4 py-2 text-gray-600 font-medium">{t('common.reportId')}</th>
              <th className="px-4 py-2 text-gray-600 font-medium">{t('common.region')}</th>
              <th className="px-4 py-2 text-gray-600 font-medium">{t('common.date')}</th>
              <th className="px-4 py-2 text-gray-600 font-medium">{t('common.status')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {pending.map(r => (
                <tr key={r._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r._type === 'Infrastructure' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{r._type}</span>
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{r.title}</td>
                  <td className="px-4 py-2 text-gray-500">{r.region}</td>
                  <td className="px-4 py-2 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { to:'/dashboard/government/workflow',      icon:'📋', label: 'All-Level Workflow',    color:'bg-indigo-50 dark:bg-indigo-900/20' },
          { to:'/dashboard/government/infrastructure', icon:'🏗️', label: t('gov.infraReports'),  color:'bg-blue-50 dark:bg-blue-900/20' },
          { to:'/dashboard/government/emergency',      icon:'🚨', label: t('gov.emergencyReq'),   color:'bg-red-50 dark:bg-red-900/20' },
        ].map(a => (
          <Link key={a.label} to={a.to} className={`${a.color} rounded-xl p-4 text-center hover:shadow-md transition-shadow`}>
            <div className="text-2xl mb-1">{a.icon}</div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.label}</p>
          </Link>
        ))}
      </div>

      <div>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Level-Specific Dashboards</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { to:'/dashboard/government/workflow?level=kebele',          icon:'🏘️', label: 'Kebele',          statsKey:'kebele',          color:'bg-green-50 dark:bg-green-900/20', textColor:'text-green-700 dark:text-green-400' },
            { to:'/dashboard/government/workflow?level=woreda',         icon:'🏙️', label: 'Woreda/Sub-City', statsKey:'woreda',          color:'bg-blue-50 dark:bg-blue-900/20',   textColor:'text-blue-700 dark:text-blue-400' },
            { to:'/dashboard/government/workflow?level=zone',           icon:'🗺️', label: 'Zone',            statsKey:'zone',            color:'bg-purple-50 dark:bg-purple-900/20', textColor:'text-purple-700 dark:text-purple-400' },
            { to:'/dashboard/government/workflow?level=regional_bureau',icon:'🏛️', label: 'Regional Bureau', statsKey:'regional_bureau', color:'bg-orange-50 dark:bg-orange-900/20', textColor:'text-orange-700 dark:text-orange-400' },
            { to:'/dashboard/government/workflow?level=federal_ministry',icon:'🏛️', label: 'Federal Ministry', statsKey:'federal_ministry', color:'bg-red-50 dark:bg-red-900/20',      textColor:'text-red-700 dark:text-red-400' },
          ].map(a => (
            <Link key={a.label} to={a.to} className={`${a.color} rounded-xl p-4 text-center hover:shadow-md transition-shadow`}>
              <div className="text-2xl mb-1">{a.icon}</div>
              <p className={`text-sm font-medium ${a.textColor}`}>{a.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{typeof workflowStats?.[a.statsKey] === 'object' ? (workflowStats[a.statsKey]?.total ?? 0) : (workflowStats?.[a.statsKey] ?? 0)} reports</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
