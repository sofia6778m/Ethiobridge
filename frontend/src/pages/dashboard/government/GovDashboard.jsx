import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import GovOverview from './GovOverview';
import GovWorkflowPage from './GovWorkflowPage';
import GovInfraReports from './GovInfraReports';
import GovEmergency from './GovEmergency';
import GovAnalytics from './GovAnalytics';
import GovMessages from './GovMessages';
import GovDepartments from './GovDepartments';
import GovAlerts from './GovAlerts';
import PublicAlertForm from '../alerts/PublicAlertForm';
import CitizenProfile from '../citizen/CitizenProfile';
import NotificationBell from '../../../components/common/NotificationBell';
import GovFundraising from './GovFundraising';
import GovDonations from './GovDonations';

export default function GovernmentDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/government',                icon: '📊', label: t('gov.title') },
    { path: '/dashboard/government/workflow',       icon: '📋', label: 'All-Level Workflow' },
    { path: '/dashboard/government/infrastructure', icon: '🏗️', label: t('gov.infraReports') },
    { path: '/dashboard/government/emergency',      icon: '🚨', label: t('gov.emergencyReq') },
    { path: '/dashboard/government/fundraising',    icon: '❤️', label: 'Fundraising' },
    { path: '/dashboard/government/donations',      icon: '💰', label: 'Donations' },
    { path: '/dashboard/government/alerts',         icon: '📢', label: 'Broadcast Alerts' },
    { path: '/dashboard/government/analytics',      icon: '📈', label: t('gov.analytics') },
    { path: '/dashboard/government/messages',       icon: '💬', label: t('messages.title') },
    { path: '/dashboard/government/notifications',  icon: '🔔', label: 'Notifications' },
    { path: '/dashboard/government/profile',        icon: '👤', label: t('nav.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={t('gov.title')}>
      <Routes>
        <Route index element={<GovOverview />} />
        <Route path="workflow" element={<GovWorkflowPage />} />
        <Route path="departments" element={<GovDepartments />} />
        <Route path="infrastructure" element={<GovInfraReports />} />
        <Route path="emergency" element={<GovEmergency />} />
        <Route path="fundraising" element={<GovFundraising />} />
        <Route path="donations" element={<GovDonations />} />
        <Route path="alerts" element={<GovAlerts />} />
        <Route path="alerts/create" element={<PublicAlertForm homePath="/dashboard/government/alerts" />} />
        <Route path="analytics" element={<GovAnalytics />} />
        <Route path="messages" element={<GovMessages />} />
        <Route path="notifications" element={<NotificationBell />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/government" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
