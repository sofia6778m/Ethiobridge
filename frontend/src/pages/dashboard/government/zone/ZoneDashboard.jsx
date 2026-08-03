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
  zone: {
    title: 'Zone Dashboard',
    icon: '🗺️',
    gradient: 'from-violet-700 to-violet-600',
    subtitleColor: 'text-violet-100',
  },
};

export default function ZoneDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/zone',               icon: '📊', label: 'Dashboard' },
    { path: '/dashboard/zone/incoming',       icon: '📥', label: 'Incoming Reports' },
    { path: '/dashboard/zone/assigned',       icon: '👤', label: 'Assigned Reports' },
    { path: '/dashboard/zone/resolved',       icon: '✅', label: 'Resolved Reports' },
    { path: '/dashboard/zone/forwarded',      icon: '➡️', label: 'Forwarded Reports' },
    { path: '/dashboard/zone/history',        icon: '📜', label: 'Report History' },
    { path: '/dashboard/zone/notifications',  icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/zone/profile',        icon: '👤', label: t('nav.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Zone Dashboard">
      <Routes>
        <Route index element={<WorkflowOverview levelConfig={LEVEL_CONFIG.zone} />} />
        <Route path="incoming" element={<IncomingReports />} />
        <Route path="assigned" element={<AssignedReports />} />
        <Route path="resolved" element={<ResolvedReports />} />
        <Route path="forwarded" element={<ForwardedReports />} />
        <Route path="history" element={<ReportHistory />} />
        <Route path="notifications" element={<WorkflowNotifications />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/zone" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
