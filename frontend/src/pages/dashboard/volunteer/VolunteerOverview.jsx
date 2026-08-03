import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { emergencyAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import StatCard from '../../../components/common/StatCard';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function VolunteerOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    emergencyAPI.getPublic({ limit: 10 }).then(r => { setTasks(r.data.reports); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const active    = tasks.filter(r => r.status === 'Active').length;
  const inProgress = tasks.filter(r => r.status === 'In Progress').length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">{t('dashboard.welcomeVolunteer', { name: user?.fullName })}</h2>
        <p className="text-emerald-100 text-sm">{t('dashboard.volunteerPortal')}</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          {user?.skills?.map(s => <span key={s} className="bg-white/20 text-white text-xs px-2 py-1 rounded-full">{s}</span>)}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon="🚨" label={t('dashboard.activeEmergencies')} value={active}     color="bg-red-100"   iconColor="text-red-600" />
        <StatCard icon="⚡" label={t('dashboard.inProgressTab')}      value={inProgress} color="bg-orange-100" iconColor="text-orange-600" />
        <StatCard icon="🗺️" label={t('dashboard.availableRegions')}  value={14}         color="bg-blue-100"   iconColor="text-blue-600" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{t('dashboard.availableEmergencyTasks')}</h3>
          <Link to="/dashboard/volunteer/tasks" className="text-xs text-primary-600 hover:underline">{t('dashboard.viewAll')} →</Link>
        </div>
        <div className="space-y-3">
          {tasks.filter(r => r.status === 'Active').slice(0, 5).map(r => (
            <div key={r._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{r.title}</p>
                <p className="text-xs text-gray-500">{r.emergencyType} • {r.region}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
              </div>
            </div>
          ))}
          {tasks.filter(r => r.status === 'Active').length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t('dashboard.noActiveTasks')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
