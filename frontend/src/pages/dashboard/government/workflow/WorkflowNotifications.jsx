import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notifAPI } from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import ConfirmModal from '../../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const TYPE_ICONS = {
  report_status: '📋', new_report: '🆕', assignment: '👤',
  message: '💬', system: '⚙️', emergency_alert: '🚨', verification: '✅',
};

export default function WorkflowNotifications() {
  const { t } = useTranslation();
  const { on } = useSocket() || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteManyTarget, setDeleteManyTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notifAPI.get({ limit: 50 });
      setNotifications(res.data.notifications || res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Real-time sync: reflect notifications created, deleted or read anywhere.
  useEffect(() => {
    if (!on) return;
    const cleanups = [
      on('notification:new', fetchNotifications),
      on('notification:deleted', fetchNotifications),
      on('notification:read', fetchNotifications),
      on('notification:read-all', fetchNotifications),
    ];
    return () => cleanups.forEach((off) => off && off());
  }, [on, fetchNotifications]);

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

  const toggleSelect = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleSelectAll = () =>
    setSelected(prev => (prev.length === notifications.length ? [] : notifications.map(n => n._id)));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await notifAPI.delete(deleteTarget._id);
      setNotifications(prev => prev.filter(n => n._id !== deleteTarget._id));
      setSelected(prev => prev.filter(id => id !== deleteTarget._id));
      setDeleteTarget(null);
      toast.success('Notification deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete notification');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteMany = async () => {
    if (!deleteManyTarget || !deleteManyTarget.length) return;
    setDeleting(true);
    try {
      await notifAPI.deleteMany(deleteManyTarget);
      const idSet = new Set(deleteManyTarget);
      setNotifications(prev => prev.filter(n => !idSet.has(n._id)));
      setSelected([]);
      setDeleteManyTarget(null);
      toast.success('Notifications deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete notifications');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const unread = notifications.filter(n => !n.isRead).length;
  const allSelected = notifications.length > 0 && selected.length === notifications.length;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Notifications</h2>
            <p className="text-yellow-100 text-sm">{unread} unread notification{unread !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button onClick={markAllRead} className="bg-white/20 hover:bg-white/30 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Mark All Read
              </button>
            )}
            {selected.length > 0 && (
              <button
                onClick={() => setDeleteManyTarget([...selected])}
                className="bg-red-500/90 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                🗑️ Delete selected ({selected.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-gray-500 dark:text-gray-400">No notifications yet</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-primary-600" />
              Select all
            </label>
          </div>
          <div className="space-y-2">
            {notifications.map(n => (
              <div
                key={n._id}
                className={`card flex items-start gap-3 cursor-pointer transition-all ${!n.isRead ? 'border-l-4 border-l-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : 'opacity-70 hover:opacity-100'} ${selected.includes(n._id) ? 'ring-2 ring-primary-400' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(n._id)}
                  onChange={() => toggleSelect(n._id)}
                  onClick={e => e.stopPropagation()}
                  className="accent-primary-600 mt-2 flex-shrink-0"
                  aria-label={`Select ${n.title}`}
                />
                <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[n.type] || '📋'}</span>
                <div className="flex-1 min-w-0" onClick={() => !n.isRead && markRead(n._id)}>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setDeleteTarget(n)}
                  className="shrink-0 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete notification"
                  aria-label={`Delete ${n.title}`}
                >
                  🗑️
                </button>
                {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-2" />}
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete notification?"
        message={`"${deleteTarget?.title || 'This notification'}" will be removed from your inbox. The related alert, report or message is not affected.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />

      <ConfirmModal
        open={deleteManyTarget && deleteManyTarget.length > 0}
        title="Delete selected notifications?"
        message={`${deleteManyTarget?.length || 0} notification(s) will be removed from your inbox. Nothing else is affected.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
        onConfirm={handleDeleteMany}
        onCancel={() => { if (!deleting) setDeleteManyTarget(null); }}
      />
    </div>
  );
}
