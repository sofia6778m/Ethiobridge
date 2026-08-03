import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../../components/layout/DashboardLayout';
import WorkflowOverview from '../workflow/WorkflowOverview';
import IncomingReports from '../workflow/IncomingReports';
import AssignedReports from '../workflow/AssignedReports';
import ResolvedReports from '../workflow/ResolvedReports';
import ForwardedReports from '../workflow/ForwardedReports';
import ReportHistory from '../workflow/ReportHistory';
import WorkflowNotifications from '../workflow/WorkflowNotifications';
import CitizenProfile from '../../citizen/CitizenProfile';

const LEVEL_CONFIG = {
  kebele: {
    title: 'Kebele Dashboard',
    icon: '🏘️',
    gradient: 'from-emerald-700 to-emerald-600',
    subtitleColor: 'text-emerald-100',
    navIcon: '🏘️',
    navLabelKey: 'workflow.kebele',
  },
};

export default function KebeleDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/kebele',               icon: '📊', label: 'Dashboard' },
    { path: '/dashboard/kebele/incoming',       icon: '📥', label: 'Incoming Reports' },
    { path: '/dashboard/kebele/assigned',       icon: '👤', label: 'Assigned Reports' },
    { path: '/dashboard/kebele/resolved',       icon: '✅', label: 'Resolved Reports' },
    { path: '/dashboard/kebele/forwarded',      icon: '➡️', label: 'Forwarded Reports' },
    { path: '/dashboard/kebele/history',        icon: '📜', label: 'Report History' },
    { path: '/dashboard/kebele/notifications',  icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/kebele/profile',        icon: '👤', label: t('nav.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Kebele Dashboard">
      <Routes>
        <Route index element={<WorkflowOverview levelConfig={LEVEL_CONFIG.kebele} />} />
        <Route path="incoming" element={<IncomingReports />} />
        <Route path="assigned" element={<AssignedReports />} />
        <Route path="resolved" element={<ResolvedReports />} />
        <Route path="forwarded" element={<ForwardedReports />} />
        <Route path="history" element={<ReportHistory />} />
        <Route path="notifications" element={<WorkflowNotifications />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/kebele" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
