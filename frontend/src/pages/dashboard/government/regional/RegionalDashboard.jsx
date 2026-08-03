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
  regional_bureau: {
    title: 'Regional Bureau Dashboard',
    icon: '🏛️',
    gradient: 'from-amber-700 to-amber-600',
    subtitleColor: 'text-amber-100',
  },
};

export default function RegionalDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/regional',               icon: '📊', label: 'Dashboard' },
    { path: '/dashboard/regional/incoming',       icon: '📥', label: 'Incoming Reports' },
    { path: '/dashboard/regional/assigned',       icon: '👤', label: 'Assigned Reports' },
    { path: '/dashboard/regional/resolved',       icon: '✅', label: 'Resolved Reports' },
    { path: '/dashboard/regional/forwarded',      icon: '➡️', label: 'Forwarded Reports' },
    { path: '/dashboard/regional/history',        icon: '📜', label: 'Report History' },
    { path: '/dashboard/regional/notifications',  icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/regional/profile',        icon: '👤', label: t('nav.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Regional Bureau Dashboard">
      <Routes>
        <Route index element={<WorkflowOverview levelConfig={LEVEL_CONFIG.regional_bureau} />} />
        <Route path="incoming" element={<IncomingReports />} />
        <Route path="assigned" element={<AssignedReports />} />
        <Route path="resolved" element={<ResolvedReports />} />
        <Route path="forwarded" element={<ForwardedReports />} />
        <Route path="history" element={<ReportHistory />} />
        <Route path="notifications" element={<WorkflowNotifications />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/regional" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
