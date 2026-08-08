import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import DepartmentOverview from './DepartmentOverview';
import DepartmentReports from './DepartmentReports';
import DepartmentReportDetail from './DepartmentReportDetail';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';
import DepartmentSettings from './DepartmentSettings';
import WorkflowComplaintList from '../workflow/WorkflowComplaintList';
import WorkflowComplaintDetail from '../workflow/WorkflowComplaintDetail';
import WorkflowDashboard from '../workflow/WorkflowDashboard';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import { notifAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import { toast } from 'react-toastify';
import ConfirmModal from '../../../components/common/ConfirmModal';

function DepartmentNotifications() {
  const { on } = useSocket() || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteManyTarget, setDeleteManyTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNotifications = useCallback(() => {
    notifAPI.get({ limit: 50 })
      .then(res => { setNotifications(res.data.notifications); setLoading(false); })
      .catch(() => { setLoading(false); });
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
    try { await notifAPI.markRead(id); setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n)); } catch (err) { toast.error('Failed'); }
  };

  const markAllRead = async () => {
    try { await notifAPI.markAllRead(); setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); toast.success('All marked as read'); } catch (err) { toast.error('Failed'); }
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

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  const allSelected = notifications.length > 0 && selected.length === notifications.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
        <div className="flex items-center gap-3">
          {notifications.some(n => !n.isRead) && <button onClick={markAllRead} className="text-sm text-primary-600 font-medium">Mark all as read</button>}
          {selected.length > 0 && (
            <button onClick={() => setDeleteManyTarget([...selected])} className="text-sm text-red-600 font-medium">
              🗑️ Delete selected ({selected.length})
            </button>
          )}
        </div>
      </div>
      {notifications.length === 0 ? (
        <div className="card p-12 text-center text-gray-400"><p className="text-4xl mb-3">🔔</p><p>No notifications</p></div>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-primary-600" />
              Select all
            </label>
          </div>
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n._id}
                className={`card p-4 cursor-pointer ${!n.isRead ? 'border-l-4 border-l-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : ''} ${selected.includes(n._id) ? 'ring-2 ring-primary-400' : ''}`}
                onClick={() => !n.isRead && markRead(n._id)}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(n._id)}
                    onChange={() => toggleSelect(n._id)}
                    onClick={e => e.stopPropagation()}
                    className="accent-primary-600 mt-1 flex-shrink-0"
                    aria-label={`Select ${n.title}`}
                  />
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-primary-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.isRead ? 'text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(n); }}
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
        </div>
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

export default function DepartmentDashboard() {
  const { t } = useTranslation();
  const base = '/department/dashboard';

  const navItems = [
    { path: base,                          icon: '📊', label: t('dashboard.overview') },
    { path: `${base}/reports`,             icon: '📋', label: 'Reports' },
    { path: `${base}/municipal-complaints`, icon: '🏛️', label: 'Municipal Complaints' },
    { path: `${base}/workflow-complaints`, icon: '⚙️', label: 'Workflow Complaints' },
    { path: `${base}/workflow-analytics`,  icon: '📈', label: 'Analytics' },
    { path: `${base}/notifications`,       icon: '🔔', label: 'Notifications' },
    { path: `${base}/messages`,            icon: '💬', label: t('dashboard.messages') },
    { path: `${base}/profile`,             icon: '👤', label: t('dashboard.profile') },
    { path: `${base}/settings`,            icon: '⚙️', label: t('dashboard.settings') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Department Dashboard">
      <Routes>
        <Route index element={<DepartmentOverview />} />
        <Route path="reports" element={<DepartmentReports />} />
        <Route path="reports/:id" element={<DepartmentReportDetail />} />
        <Route path="municipal-complaints" element={<MunicipalComplaintList basePath={`${base}/municipal-complaints`} />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="workflow-complaints" element={<WorkflowComplaintList basePath={base} />} />
        <Route path="workflow-complaints/:id" element={<WorkflowComplaintDetail basePath={`${base}/workflow-complaints`} />} />
        <Route path="workflow-analytics" element={<WorkflowDashboard />} />
        <Route path="notifications" element={<DepartmentNotifications />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="settings" element={<DepartmentSettings />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
