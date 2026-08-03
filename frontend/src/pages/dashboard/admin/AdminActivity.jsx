import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';

const ACTION_LABELS = {
  report_created: { icon: '📝', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  report_approved: { icon: '✅', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  report_rejected: { icon: '❌', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  report_assigned: { icon: '📋', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  report_status_changed: { icon: '🔄', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  report_deleted: { icon: '🗑️', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  report_verified: { icon: '✔️', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  citizen_verification: { icon: '👤', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  feedback_added: { icon: '⭐', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  comment_added: { icon: '💬', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  user_login: { icon: '🔑', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  user_register: { icon: '👤', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  user_approved: { icon: '✅', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  user_deactivated: { icon: '⚠️', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  media_uploaded: { icon: '📷', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  export_performed: { icon: '📤', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
};

const ACTION_OPTIONS = [
  '', 'report_created', 'report_approved', 'report_rejected', 'report_assigned',
  'report_status_changed', 'report_deleted', 'report_verified', 'citizen_verification',
  'feedback_added', 'comment_added', 'user_login', 'user_register', 'user_approved',
  'user_deactivated', 'media_uploaded', 'export_performed',
];

export default function AdminActivity() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (actionFilter) params.action = actionFilter;
      const r = await adminAPI.getActivityLogs(params);
      setLogs(r.data.logs);
      setPages(r.data.pages);
      setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [page, actionFilter]);

  const formatAction = (a) => a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('admin.activityLog')} <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">({total})</span></h2>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">{t('admin.allActions')}</option>
          {ACTION_OPTIONS.filter(Boolean).map(a => <option key={a} value={a}>{formatAction(a)}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : logs.length === 0 ? <EmptyState icon="📜" title={t('admin.noActivity')} /> : (
        <div className="space-y-2">
          {logs.map(log => {
            const meta = ACTION_LABELS[log.action] || { icon: '📌', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
            return (
              <div key={log._id} className="card p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${meta.color}`}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{formatAction(log.action)}</span>
                    {log.resource && <span className="text-xs text-gray-400 dark:text-gray-500">{log.resource}</span>}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    <span className="font-medium">{log.userName || 'System'}</span>
                    {log.userRole && <span className="text-gray-400 dark:text-gray-500 ml-1">({log.userRole})</span>}
                  </p>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                    </p>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 shrink-0 text-right">
                  <p>{new Date(log.createdAt).toLocaleDateString()}</p>
                  <p>{new Date(log.createdAt).toLocaleTimeString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}
