import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import DepartmentOverview from './DepartmentOverview';
import DepartmentReports from './DepartmentReports';
import DepartmentReportDetail from './DepartmentReportDetail';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';
import DepartmentSettings from './DepartmentSettings';
import SharedComplaints from '../shared/SharedComplaints';
import WorkflowComplaintList from '../workflow/WorkflowComplaintList';
import WorkflowComplaintDetail from '../workflow/WorkflowComplaintDetail';
import WorkflowDashboard from '../workflow/WorkflowDashboard';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import { notifAPI } from '../../../services/api';
import { toast } from 'react-toastify';

function DepartmentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notifAPI.get({ limit: 50 }).then(res => { setNotifications(res.data.notifications); setLoading(false); }).catch(() => { setLoading(false); });
  }, []);

  const markRead = async (id) => {
    try { await notifAPI.markRead(id); setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n)); } catch (err) { toast.error('Failed'); }
  };

  const markAllRead = async () => {
    try { await notifAPI.markAllRead(); setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); toast.success('All marked as read'); } catch (err) { toast.error('Failed'); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
        {notifications.some(n => !n.isRead) && <button onClick={markAllRead} className="text-sm text-primary-600 font-medium">Mark all as read</button>}
      </div>
      {notifications.length === 0 ? (
        <div className="card p-12 text-center text-gray-400"><p className="text-4xl mb-3">🔔</p><p>No notifications</p></div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n._id} className={`card p-4 cursor-pointer ${!n.isRead ? 'border-l-4 border-l-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
              onClick={() => !n.isRead && markRead(n._id)}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-primary-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.isRead ? 'text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
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

export default function DepartmentDashboard() {
  const { t } = useTranslation();
  const base = '/department/dashboard';

  const navItems = [
    { path: base,                          icon: '📊', label: t('dashboard.overview') },
    { path: `${base}/reports`,             icon: '📋', label: 'Reports' },
    { path: `${base}/complaints`,          icon: '📝', label: 'Complaints' },
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
        <Route path="complaints" element={<SharedComplaints />} />
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
