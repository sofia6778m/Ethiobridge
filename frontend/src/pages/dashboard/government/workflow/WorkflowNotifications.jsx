import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { notifAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

const TYPE_ICONS = {
  report_status: '📋', new_report: '🆕', assignment: '👤',
  message: '💬', system: '⚙️', emergency_alert: '🚨', verification: '✅',
};

export default function WorkflowNotifications() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await notifAPI.get({ limit: 50 });
      setNotifications(res.data.notifications || res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const markRead = async (id) => {
    try {
      await notifAPI.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true, readAt: new Date() } : n));
    } catch (e) { toast.error('Failed to mark as read'); }
  };

  const markAllRead = async () => {
    try {
      await notifAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date() })));
      toast.success('All marked as read');
    } catch (e) { toast.error('Failed'); }
  };

  if (loading) return <LoadingSpinner />;

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Notifications</h2>
            <p className="text-yellow-100 text-sm">{unread} unread notification{unread !== 1 ? 's' : ''}</p>
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} className="bg-white/20 hover:bg-white/30 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              Mark All Read
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-4xl mb-3">🔔</p>
            <p className="text-gray-500 dark:text-gray-400">No notifications yet</p>
          </div>
        ) : (
          notifications.map(n => (
            <div key={n._id} onClick={() => !n.isRead && markRead(n._id)}
              className={`card flex items-start gap-3 cursor-pointer transition-all ${!n.isRead ? 'border-l-4 border-l-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : 'opacity-70 hover:opacity-100'}`}>
              <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[n.type] || '📋'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{n.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-2" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
