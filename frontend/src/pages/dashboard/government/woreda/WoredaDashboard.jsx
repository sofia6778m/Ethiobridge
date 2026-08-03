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
  woreda: {
    title: 'Woreda/Sub-City Dashboard',
    icon: '🏙️',
    gradient: 'from-blue-700 to-blue-600',
    subtitleColor: 'text-blue-100',
  },
};

export default function WoredaDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/woreda',               icon: '📊', label: 'Dashboard' },
    { path: '/dashboard/woreda/incoming',       icon: '📥', label: 'Incoming Reports' },
    { path: '/dashboard/woreda/assigned',       icon: '👤', label: 'Assigned Reports' },
    { path: '/dashboard/woreda/resolved',       icon: '✅', label: 'Resolved Reports' },
    { path: '/dashboard/woreda/forwarded',      icon: '➡️', label: 'Forwarded Reports' },
    { path: '/dashboard/woreda/history',        icon: '📜', label: 'Report History' },
    { path: '/dashboard/woreda/notifications',  icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/woreda/profile',        icon: '👤', label: t('nav.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Woreda/Sub-City Dashboard">
      <Routes>
        <Route index element={<WorkflowOverview levelConfig={LEVEL_CONFIG.woreda} />} />
        <Route path="incoming" element={<IncomingReports />} />
        <Route path="assigned" element={<AssignedReports />} />
        <Route path="resolved" element={<ResolvedReports />} />
        <Route path="forwarded" element={<ForwardedReports />} />
        <Route path="history" element={<ReportHistory />} />
        <Route path="notifications" element={<WorkflowNotifications />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/woreda" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
