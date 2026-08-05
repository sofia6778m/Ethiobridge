import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { alertAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';

const ACTION_ICONS = {
  alert_create: '🆕',
  alert_update: '✏️',
  alert_published: '📢',
  alert_scheduled: '📅',
  alert_active: '✅',
  alert_expired: '⏰',
  alert_archived: '📦',
  alert_delete: '🗑️',
  alert_reactivated: '🔄',
};

export default function AdminAlertAudit() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await alertAPI.getAuditLogs();
      setLogs(res.data?.data?.logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📜 Alert Audit Trail</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Every create, publish, expire and delete action</p>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : logs.length === 0 ? (
        <EmptyState icon="📜" title="No alert activity yet" description="Alert create/publish/expire/delete actions will appear here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {logs.map((log) => (
              <div key={log._id} className="p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <span className="text-xl shrink-0 mt-0.5">{ACTION_ICONS[log.action] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 capitalize">
                      {(log.action || 'alert_event').replace('alert_', '').replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      by <span className="font-medium">{log.userName || 'System'}</span> ({log.userRole || 'system'})
                    </span>
                  </div>
                  {log.details && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {typeof log.details === 'object'
                        ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' • ')
                        : String(log.details)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(log.createdAt).toLocaleString()} {log.ipAddress ? `• ${log.ipAddress}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
