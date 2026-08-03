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
  federal_ministry: {
    title: 'Federal Ministry Dashboard',
    icon: '🏛️',
    gradient: 'from-red-700 to-red-600',
    subtitleColor: 'text-red-100',
  },
};

export default function FederalDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/federal',               icon: '📊', label: 'Dashboard' },
    { path: '/dashboard/federal/incoming',       icon: '📥', label: 'Incoming Reports' },
    { path: '/dashboard/federal/assigned',       icon: '👤', label: 'Assigned Reports' },
    { path: '/dashboard/federal/resolved',       icon: '✅', label: 'Resolved Reports' },
    { path: '/dashboard/federal/forwarded',      icon: '➡️', label: 'Forwarded Reports' },
    { path: '/dashboard/federal/history',        icon: '📜', label: 'Report History' },
    { path: '/dashboard/federal/notifications',  icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/federal/profile',        icon: '👤', label: t('nav.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Federal Ministry Dashboard">
      <Routes>
        <Route index element={<WorkflowOverview levelConfig={LEVEL_CONFIG.federal_ministry} />} />
        <Route path="incoming" element={<IncomingReports />} />
        <Route path="assigned" element={<AssignedReports />} />
        <Route path="resolved" element={<ResolvedReports />} />
        <Route path="forwarded" element={<ForwardedReports />} />
        <Route path="history" element={<ReportHistory />} />
        <Route path="notifications" element={<WorkflowNotifications />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/federal" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
