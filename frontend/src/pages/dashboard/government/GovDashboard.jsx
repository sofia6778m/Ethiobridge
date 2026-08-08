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
import CampaignManage from '../campaigns/CampaignManage';
import CampaignForm from '../campaigns/CampaignForm';
import CampaignAnalytics from '../campaigns/CampaignAnalytics';
import CampaignApprovals from '../campaigns/CampaignApprovals';
import CampaignDonations from '../campaigns/CampaignDonations';
import CampaignProofs from '../campaigns/CampaignProofs';

export default function GovernmentDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/government',                icon: '📊', label: t('gov.title') },
    { path: '/dashboard/government/workflow',       icon: '📋', label: 'All-Level Workflow' },
    { path: '/dashboard/government/infrastructure', icon: '🏗️', label: t('gov.infraReports') },
    { path: '/dashboard/government/emergency',      icon: '🚨', label: t('gov.emergencyReq') },
    { path: '/dashboard/government/alerts',         icon: '📢', label: 'Broadcast Alerts' },

    // ── Campaigns & Fundraising ─────────────────────────────────────────────
    { path: '/dashboard/government/campaigns',      icon: '🎗️', label: 'Campaigns', sectionHeader: true },
    { path: '/dashboard/government/campaigns',      icon: '🎗️', label: 'Manage Campaigns', indent: true },
    { path: '/dashboard/government/campaigns/new',  icon: '➕', label: 'Create Campaign', indent: true },
    { path: '/dashboard/government/campaigns/approvals', icon: '✅', label: 'Approvals', indent: true },
    { path: '/dashboard/government/campaigns/donations', icon: '💰', label: 'Donations', indent: true },
    { path: '/dashboard/government/campaigns/proofs', icon: '🔎', label: 'Proof Verification', indent: true },
    { path: '/dashboard/government/campaigns/analytics', icon: '📈', label: 'Campaign Analytics', indent: true },

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
        <Route path="alerts" element={<GovAlerts />} />
        <Route path="alerts/create" element={<PublicAlertForm homePath="/dashboard/government/alerts" />} />
        <Route path="campaigns"          element={<CampaignManage basePath="/dashboard/government/campaigns" createPath="/dashboard/government/campaigns/new" editPath="/dashboard/government/campaigns/new" allowSuspend />} />
        <Route path="campaigns/new"      element={<CampaignForm listPath="/dashboard/government/campaigns" />} />
        <Route path="campaigns/approvals" element={<CampaignApprovals />} />
        <Route path="campaigns/donations" element={<CampaignDonations />} />
        <Route path="campaigns/proofs"   element={<CampaignProofs />} />
        <Route path="campaigns/analytics" element={<CampaignAnalytics />} />
        <Route path="analytics" element={<GovAnalytics />} />
        <Route path="messages" element={<GovMessages />} />
        <Route path="notifications" element={<NotificationBell />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/government" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
