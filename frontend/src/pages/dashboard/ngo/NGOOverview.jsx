import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { emergencyAPI } from '../../../services/api';
import StatCard from '../../../components/common/StatCard';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { useAuth } from '../../../context/AuthContext';

export default function NGOOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    emergencyAPI.getAll({ limit: 8 }).then(r => { setReports(r.data.reports); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const active   = reports.filter(r => ['Active','In Progress'].includes(r.status)).length;
  const resolved = reports.filter(r => r.status === 'Resolved').length;
  const urgent   = reports.filter(r => r.priorityLevel === 'High').length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-teal-600 to-teal-500 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">{t('dashboard.ngoDashboard')}</h2>
        <p className="text-teal-100 text-sm">{user?.organizationName} {t('dashboard.ngoManage')}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon="🚨" label={t('dashboard.activeEmergencies')}  value={active}   color="bg-red-100"   iconColor="text-red-600" />
        <StatCard icon="✅" label={t('dashboard.casesResolved')}      value={resolved} color="bg-green-100" iconColor="text-green-600" />
        <StatCard icon="⚡" label={t('dashboard.urgentHighPriority')} value={urgent} color="bg-orange-100" iconColor="text-orange-600" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{t('dashboard.activeEmergencyRequests')}</h3>
          <Link to="/dashboard/ngo/emergency" className="text-xs text-primary-600 hover:underline">{t('dashboard.viewAll')}</Link>
        </div>
        <div className="space-y-3">
          {reports.filter(r => ['Active','Under Review'].includes(r.status)).slice(0, 5).map(r => (
            <div key={r._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{r.title}</p>
                <p className="text-xs text-gray-500">{r.emergencyType} • {r.region}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
          {reports.filter(r => ['Active','Under Review'].includes(r.status)).length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t('dashboard.noActiveEmergencies')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
