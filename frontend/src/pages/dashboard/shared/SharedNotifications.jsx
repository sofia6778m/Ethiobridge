import { useState, useEffect } from 'react';
import { notifAPI } from '../../../services/api';
import { toast } from 'react-toastify';

export default function SharedNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await notifAPI.get();
        setNotifications(res.data.notifications);
      } catch (err) {
        toast.error('Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const markRead = async (id) => {
    try {
      await notifAPI.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
    } catch (err) {
      toast.error('Failed to mark as read');
    }
  };

  const markAllRead = async () => {
    try {
      await notifAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
        {notifications.some(n => !n.read) && (
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
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n._id}
              className={`card p-4 cursor-pointer transition-colors ${!n.read ? 'border-l-4 border-l-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
              onClick={() => !n.read && markRead(n._id)}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.read ? 'bg-transparent' : 'bg-primary-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.read ? 'text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
