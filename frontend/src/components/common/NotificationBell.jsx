import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notifAPI, alertAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import ConfirmModal from './ConfirmModal';

export default function NotificationBell() {
  const { t } = useTranslation();
  const { on } = useSocket() || {};
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [alertUnread, setAlertUnread] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isCitizen = user?.role === 'citizen' || user?.role === 'CITIZEN';

  const fetchNotifs = async () => {
    try {
      const res = await notifAPI.get({ limit: 10 });
      setNotifications(res.data.notifications);
      setUnread(res.data.unreadCount);
    } catch { /* silent */ }
  };

  const fetchAlertUnread = useCallback(async () => {
    if (!isCitizen) return;
    try {
      const res = await alertAPI.getUnreadCount();
      setAlertUnread(res.data?.data?.unread || 0);
    } catch { /* silent */ }
  }, [isCitizen]);

  useEffect(() => {
    fetchNotifs();
    fetchAlertUnread();
    const interval = setInterval(() => {
      fetchNotifs();
      fetchAlertUnread();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAlertUnread]);

  const handleNewNotification = useCallback((notif) => {
    setNotifications(prev => {
      const exists = prev.some(n => n._id === notif._id);
      if (exists) return prev;
      return [notif, ...prev].slice(0, 10);
    });
    setUnread(prev => prev + 1);
  }, []);

  const handleNewAlert = useCallback(() => {
    if (!isCitizen) return;
    setAlertUnread(prev => prev + 1);
  }, [isCitizen]);

  // When an alert is deleted the backend removes its notification rows. Reflect
  // that here immediately so the bell and the alert badge stay in sync.
  const handleAlertDeleted = useCallback((update) => {
    const id = update?._id;
    if (!id) return;
    setNotifications(prev => {
      const removed = prev.filter(n => n.alertId === id);
      if (removed.length > 0) {
        const unreadRemoved = removed.filter(n => !n.isRead).length;
        setUnread(count => Math.max(0, count - unreadRemoved));
      }
      return prev.filter(n => n.alertId !== id);
    });
    if (isCitizen) fetchAlertUnread();
  }, [isCitizen, fetchAlertUnread]);

  // Real-time sync: an authoritative unread count plus removal/read events let
  // every open surface (bell, pages, widgets) reflect changes made anywhere.
  const handleDeleted = useCallback((update) => {
    if (!update) return;
    setNotifications(prev => {
      if (update.all) {
        const unreadRemoved = prev.filter(n => !n.isRead).length;
        if (unreadRemoved > 0) setUnread(count => Math.max(0, count - unreadRemoved));
        return [];
      }
      const ids = update.ids || (update.id ? [update.id] : []);
      if (!ids.length) return prev;
      const idSet = new Set(ids);
      const removed = prev.filter(n => idSet.has(n._id));
      if (removed.length > 0) {
        const unreadRemoved = removed.filter(n => !n.isRead).length;
        setUnread(count => Math.max(0, count - unreadRemoved));
      }
      return prev.filter(n => !idSet.has(n._id));
    });
  }, []);

  const handleUnreadCount = useCallback((payload) => {
    if (typeof payload?.unreadCount === 'number') setUnread(payload.unreadCount);
  }, []);

  const handleRead = useCallback((payload) => {
    if (!payload?.id) return;
    setNotifications(prev => prev.map(n => n._id === payload.id ? { ...n, isRead: true } : n));
  }, []);

  const handleReadAll = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  useEffect(() => {
    if (!on) return;
    const cleanups = [
      on('notification:new', handleNewNotification),
      on('notification:deleted', handleDeleted),
      on('notification:unread', handleUnreadCount),
      on('notification:read', handleRead),
      on('notification:read-all', handleReadAll),
      on('alert:new', handleNewAlert),
      on('alert:deleted', handleAlertDeleted),
    ];
    return () => cleanups.forEach((off) => off && off());
  }, [on, handleNewNotification, handleDeleted, handleUnreadCount, handleRead, handleReadAll, handleNewAlert, handleAlertDeleted]);

  const markRead = async (id) => {
    try {
      await notifAPI.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const markAll = async () => {
    try {
      await notifAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
      toast.success(t('toast.allNotificationsRead'));
    } catch { /* silent */ }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await notifAPI.delete(deleteTarget._id);
      setNotifications(prev => prev.filter(n => n._id !== deleteTarget._id));
      if (!deleteTarget.isRead) setUnread(prev => Math.max(0, prev - 1));
      setDeleteTarget(null);
      toast.success(t('toast.notificationDeleted'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete notification');
    } finally {
      setDeleting(false);
    }
  };

  const typeIcons = {
    new_report: '🆕',
    report_status: '📋',
    assignment: '📌',
    verification: '✅',
    message: '💬',
    system: '⚙️',
    emergency_alert: '🚨',
    public_alert: '📢',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={t('common.notifications')}
      >
        <span className="text-xl">🔔</span>
        {alertUnread > 0 && (
          <span className="absolute bottom-1 right-1 w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none" title="Unread public alerts">
            {alertUnread > 9 ? '9+' : alertUnread}
          </span>
        )}
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t('common.notifications')}</h3>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">{t('common.markAllRead')}</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">{t('common.noNotifications')}</div>
              ) : notifications.map((n) => (
                <div
                  key={n._id}
                  onClick={() => !n.isRead && markRead(n._id)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!n.isRead ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base shrink-0 mt-0.5">{typeIcons[n.type] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${!n.isRead ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{n.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(n); }}
                      className="shrink-0 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete notification"
                      aria-label="Delete notification"
                    >
                      🗑️
                    </button>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
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
    </div>
  );
}
