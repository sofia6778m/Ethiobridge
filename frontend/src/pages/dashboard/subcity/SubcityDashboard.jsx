import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import SubcityOverview from './SubcityOverview';
import SubcityAnalytics from './SubcityAnalytics';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import GovernanceComplaintList from '../governance/GovernanceComplaintList';
import GovernanceComplaintDetail from '../governance/GovernanceComplaintDetail';
import GovernanceManagementOverview from './governance/GovernanceManagementOverview';
import GovernanceOffices from './governance/GovernanceOffices';
import GovernanceCategories from './governance/GovernanceCategories';
import GovernanceOfficers from './governance/GovernanceOfficers';
import GovernanceAnalytics from './governance/GovernanceAnalytics';
import SlaRules from './governance/SlaRules';
import SharedNotifications from '../shared/SharedNotifications';
import SharedSettings from '../shared/SharedSettings';
import CitizenMessages from '../citizen/CitizenMessages';
import CitizenProfile from '../citizen/CitizenProfile';
import SubcityAlerts from './SubcityAlerts';
import PublicAlertForm from '../alerts/PublicAlertForm';
import CampaignManage from '../campaigns/CampaignManage';
import CampaignForm from '../campaigns/CampaignForm';
import CampaignAnalytics from '../campaigns/CampaignAnalytics';
import CampaignApprovals from '../campaigns/CampaignApprovals';
import CampaignDonations from '../campaigns/CampaignDonations';
import CampaignProofs from '../campaigns/CampaignProofs';

export default function SubcityDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const base = '/dashboard/subcity';
  const subcityLabel = user?.subcity || 'Subcity';

  const navItems = [
    { path: base,                             icon: '📊', label: t('dashboard.overview') },
    { path: `${base}/municipal-complaints`,  icon: '🏛️', label: 'Municipal Complaints' },
    { path: `${base}/governance-complaints`, icon: '⚖️', label: 'Governance Complaints' },

    // ── Governance Management section ──────────────────────────────────────
    // Owned exclusively by this Subcity Admin — not accessible from the Admin
    // Dashboard. Each sub-page listed individually for clear sidebar grouping.
    { path: `${base}/governance`,            icon: '🗂️', label: 'Governance Management', sectionHeader: true },
    { path: `${base}/governance/users`,      icon: '🧑‍💼', label: 'User Management',      indent: true },
    { path: `${base}/governance/offices`,    icon: '🏛️', label: 'Government Offices',    indent: true },
    { path: `${base}/governance/categories`, icon: '🏷️', label: 'Complaint Categories',  indent: true },
    { path: `${base}/governance/sla-rules`, icon: '⏳', label: 'SLA Rules',             indent: true },
    { path: `${base}/governance/analytics`,  icon: '📈', label: 'Governance Analytics',   indent: true },

    { path: `${base}/analytics`,    icon: '📈', label: t('dashboard.analyticsTitle') },
    { path: `${base}/alerts`,       icon: '📢', label: 'Public Alerts' },

    // ── Campaigns & Fundraising ─────────────────────────────────────────────
    { path: `${base}/campaigns`,       icon: '🎗️', label: 'Campaigns', sectionHeader: true },
    { path: `${base}/campaigns`,       icon: '🎗️', label: 'Manage Campaigns', indent: true },
    { path: `${base}/campaigns/new`,   icon: '➕', label: 'Create Campaign', indent: true },
    { path: `${base}/campaigns/approvals`, icon: '✅', label: 'Approvals', indent: true },
    { path: `${base}/campaigns/donations`, icon: '💰', label: 'Donations', indent: true },
    { path: `${base}/campaigns/proofs`, icon: '🔎', label: 'Proof Verification', indent: true },
    { path: `${base}/campaigns/analytics`, icon: '📈', label: 'Campaign Analytics', indent: true },

    { path: `${base}/notifications`, icon: '🔔', label: t('dashboard.notifications') },
    { path: `${base}/messages`,     icon: '💬', label: t('dashboard.messages') },
    { path: `${base}/profile`,      icon: '👤', label: t('dashboard.profile') },
    { path: `${base}/settings`,     icon: '⚙️', label: t('dashboard.settings') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={`${subcityLabel} Subcity Dashboard`}>
      <Routes>
        <Route index element={<SubcityOverview />} />

        {/* Removed routes — redirect to dashboard so direct URL visits are safe */}
        <Route path="woredas"     element={<Navigate to={base} replace />} />
        <Route path="departments" element={<Navigate to={base} replace />} />
        <Route path="users"       element={<Navigate to={base} replace />} />

        <Route path="municipal-complaints"     element={<MunicipalComplaintList basePath={`${base}/municipal-complaints`} />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="governance-complaints"     element={<GovernanceComplaintList basePath={`${base}/governance-complaints`} />} />
        <Route path="governance-complaints/:id" element={<GovernanceComplaintDetail basePath={`${base}/governance-complaints`} />} />

        {/* ── Governance Management — owned by this Subcity Admin ── */}
        <Route path="governance"            element={<GovernanceManagementOverview />} />
        <Route path="governance/offices"    element={<GovernanceOffices />} />
        <Route path="governance/categories" element={<GovernanceCategories />} />
        <Route path="governance/sla-rules"  element={<SlaRules />} />
        {/* governance/users = User Management page (governance officers/supervisors) */}
        <Route path="governance/users"      element={<GovernanceOfficers />} />
        <Route path="governance/analytics"  element={<GovernanceAnalytics />} />

        <Route path="analytics"    element={<SubcityAnalytics />} />
        <Route path="alerts"       element={<SubcityAlerts />} />
        <Route path="alerts/create" element={<PublicAlertForm homePath="/dashboard/subcity/alerts" />} />
        <Route path="campaigns"          element={<CampaignManage basePath={`${base}/campaigns`} createPath={`${base}/campaigns/new`} editPath={`${base}/campaigns/new`} />} />
        <Route path="campaigns/new"      element={<CampaignForm listPath={`${base}/campaigns`} />} />
        <Route path="campaigns/approvals" element={<CampaignApprovals />} />
        <Route path="campaigns/donations" element={<CampaignDonations />} />
        <Route path="campaigns/proofs"   element={<CampaignProofs />} />
        <Route path="campaigns/analytics" element={<CampaignAnalytics />} />
        <Route path="notifications" element={<SharedNotifications />} />
        <Route path="messages"     element={<CitizenMessages />} />
        <Route path="profile"      element={<CitizenProfile />} />
        <Route path="settings"     element={<SharedSettings />} />
        <Route path="*"            element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
