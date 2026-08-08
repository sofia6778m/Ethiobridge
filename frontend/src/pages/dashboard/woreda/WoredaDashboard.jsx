import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import WoredaOverview from './WoredaOverview';
import WoredaDepartments from './WoredaDepartments';
import WoredaStaff from './WoredaStaff';
import WoredaAnalytics from './WoredaAnalytics';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import GovernanceComplaintList from '../governance/GovernanceComplaintList';
import GovernanceComplaintDetail from '../governance/GovernanceComplaintDetail';
import SharedNotifications from '../shared/SharedNotifications';
import SharedSettings from '../shared/SharedSettings';
import CitizenMessages from '../citizen/CitizenMessages';
import CitizenProfile from '../citizen/CitizenProfile';
import WoredaAlerts from './WoredaAlerts';
import PublicAlertForm from '../alerts/PublicAlertForm';
import CampaignManage from '../campaigns/CampaignManage';
import CampaignForm from '../campaigns/CampaignForm';
import CampaignAnalytics from '../campaigns/CampaignAnalytics';
import CampaignDonations from '../campaigns/CampaignDonations';
import CampaignProofs from '../campaigns/CampaignProofs';

export default function WoredaDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const base = '/dashboard/woreda';
  const woredaLabel = user?.woredaName || 'Woreda';

  const navItems = [
    { path: base, icon: '📊', label: t('dashboard.overview') },
    { path: `${base}/departments`, icon: '🏛️', label: 'Departments' },
    { path: `${base}/staff`, icon: '👥', label: t('dashboard.userManagement') },
    { path: `${base}/municipal-complaints`, icon: '📝', label: 'Municipal Complaints' },
    { path: `${base}/governance-complaints`, icon: '⚖️', label: 'Governance Complaints' },
    { path: `${base}/analytics`, icon: '📈', label: t('dashboard.analyticsTitle') },
    { path: `${base}/alerts`, icon: '📢', label: 'Public Alerts' },

    // ── Campaigns & Fundraising ─────────────────────────────────────────────
    { path: `${base}/campaigns`,    icon: '🎗️', label: 'Campaigns', sectionHeader: true },
    { path: `${base}/campaigns`,    icon: '🎗️', label: 'Manage Campaigns', indent: true },
    { path: `${base}/campaigns/new`, icon: '➕', label: 'Create Campaign', indent: true },
    { path: `${base}/campaigns/donations`, icon: '💰', label: 'Donations', indent: true },
    { path: `${base}/campaigns/proofs`, icon: '🔎', label: 'Proof Verification', indent: true },
    { path: `${base}/campaigns/analytics`, icon: '📈', label: 'Campaign Analytics', indent: true },

    { path: `${base}/notifications`, icon: '🔔', label: t('dashboard.notifications') },
    { path: `${base}/messages`, icon: '💬', label: t('dashboard.messages') },
    { path: `${base}/profile`, icon: '👤', label: t('dashboard.profile') },
    { path: `${base}/settings`, icon: '⚙️', label: t('dashboard.settings') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={`${woredaLabel} Woreda Dashboard`}>
      <Routes>
        <Route index element={<WoredaOverview />} />
        <Route path="departments" element={<WoredaDepartments />} />
        <Route path="staff" element={<WoredaStaff />} />
        <Route path="municipal-complaints" element={<MunicipalComplaintList basePath={`${base}/municipal-complaints`} />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="governance-complaints" element={<GovernanceComplaintList basePath={`${base}/governance-complaints`} />} />
        <Route path="governance-complaints/:id" element={<GovernanceComplaintDetail basePath={`${base}/governance-complaints`} />} />
        <Route path="analytics" element={<WoredaAnalytics />} />
        <Route path="alerts" element={<WoredaAlerts />} />
        <Route path="alerts/create" element={<PublicAlertForm homePath="/dashboard/woreda/alerts" />} />
        <Route path="campaigns"          element={<CampaignManage basePath={`${base}/campaigns`} createPath={`${base}/campaigns/new`} editPath={`${base}/campaigns/new`} />} />
        <Route path="campaigns/new"      element={<CampaignForm listPath={`${base}/campaigns`} />} />
        <Route path="campaigns/donations" element={<CampaignDonations />} />
        <Route path="campaigns/proofs"   element={<CampaignProofs />} />
        <Route path="campaigns/analytics" element={<CampaignAnalytics />} />
        <Route path="notifications" element={<SharedNotifications />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="settings" element={<SharedSettings />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
