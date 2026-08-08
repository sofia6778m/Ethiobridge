import { useState, useEffect, useCallback } from 'react';
import { notifAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import { toast } from 'react-toastify';
import ConfirmModal from '../../../components/common/ConfirmModal';

export default function SharedNotifications() {
  const { on } = useSocket() || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteManyTarget, setDeleteManyTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notifAPI.get();
      setNotifications(res.data.notifications);
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Real-time sync: reflect notifications created, deleted or read anywhere
  // (bell, other pages, socket broadcasts) without a manual refresh.
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
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      toast.error('Failed to mark as read');
    }
  };

  const markAllRead = async () => {
    try {
      await notifAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast.success('All marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const allSelected = notifications.length > 0 && selected.length === notifications.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
          {unreadCount > 0 && <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>}
        </div>
        {notifications.some(n => !n.isRead) && (
          <button onClick={markAllRead} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-3">🔔</p>
          <p>No notifications</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3 gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="accent-primary-600"
              />
              Select all
            </label>
            {selected.length > 0 && (
              <button
                onClick={() => setDeleteManyTarget([...selected])}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                🗑️ Delete selected ({selected.length})
              </button>
            )}
          </div>

          <div className="space-y-2">
            {notifications.map(n => (
              <div
                key={n._id}
                className={`card p-4 transition-colors ${!n.isRead ? 'border-l-4 border-l-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : ''} ${selected.includes(n._id) ? 'ring-2 ring-primary-400' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(n._id)}
                    onChange={() => toggleSelect(n._id)}
                    onClick={e => e.stopPropagation()}
                    className="accent-primary-600 mt-1 flex-shrink-0"
                    aria-label={`Select ${n.title}`}
                  />
                  <div
                    className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-primary-500'}`}
                  />
                  <div className={`flex-1 min-w-0 cursor-pointer ${!n.isRead ? 'cursor-pointer' : ''}`} onClick={() => !n.isRead && markRead(n._id)}>
                    <p className={`text-sm ${n.isRead ? 'text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(n)}
                    className="shrink-0 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete notification"
                    aria-label={`Delete ${n.title}`}
                  >
                    🗑️
                  </button>
                </div>
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
