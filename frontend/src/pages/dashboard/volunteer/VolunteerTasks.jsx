import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { emergencyAPI } from '../../../services/api';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import { toast } from 'react-toastify';

export default function VolunteerTasks() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [tab, setTab] = useState('available');

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const statusFilter = tab === 'available' ? 'Active' : 'In Progress';
      const r = await emergencyAPI.getPublic({ status: statusFilter, page, limit: 8 });
      setTasks(r.data.reports);
      setPages(r.data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTasks(); }, [tab, page]);

  const handleAccept = async (id) => {
    try {
      await emergencyAPI.accept(id);
      toast.success(t('dashboard.taskAccepted'));
      fetchTasks();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.taskAcceptFailed')); }
  };

  const priorityBadge = { High: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', Medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', Low: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.emergencyTasks')}</h2>

      <div className="flex gap-2">
        {[{ key:'available', label:t('dashboard.availableTasks') }, { key:'accepted', label:t('dashboard.inProgressTab') }].map(tabItem => (
          <button key={tabItem.key} onClick={() => { setTab(tabItem.key); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === tabItem.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'}`}>
            {tabItem.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : tasks.length === 0 ? <EmptyState icon="📋" title={t('dashboard.noTasksFound')} description={tab === 'available' ? t('dashboard.noActiveEmergenciesNow') : t('dashboard.noTasksInProgress')} /> : (
        <div className="space-y-3">
          {tasks.map(r => (
            <div key={r._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{r.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[r.priorityLevel] || ''}`}>{r.priorityLevel}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{r.emergencyType} • {r.region} {r.city ? `• ${r.city}` : ''}</p>
                  {r.numberOfPeopleAffected && <p className="text-xs text-gray-400 dark:text-gray-500">👥 {r.numberOfPeopleAffected} {t('common.peopleAffectedLower')}</p>}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{r.description}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">📅 {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={r.status} />
                  {r.status === 'Active' && (
                    <button onClick={() => handleAccept(r._id)} className="btn-success text-xs py-1.5 px-3">{t('dashboard.acceptTask')}</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}
