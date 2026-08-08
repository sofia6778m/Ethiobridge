import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import AdminOverview from './AdminOverview';
import AdminUsers from './AdminUsers';
import AdminReports from './AdminReports';
import AdminApprovals from './AdminApprovals';
import AdminNews from './AdminNews';
import AdminActivity from './AdminActivity';
import GovAnalytics from '../government/GovAnalytics';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';
import AdminSubcityManagement from './AdminSubcityManagement';
import AdminWoredaManagement from './AdminWoredaManagement';
import AdminDepartmentManagement from './AdminDepartmentManagement';
import AdminIssueTypes from './AdminIssueTypes';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import GovernanceComplaintList from '../governance/GovernanceComplaintList';
import GovernanceComplaintDetail from '../governance/GovernanceComplaintDetail';
import AdminGovernanceStats from './AdminGovernanceStats';
import AdminAlerts from './AdminAlerts';
import PublicAlertForm from '../alerts/PublicAlertForm';
import AdminAlertAudit from './AdminAlertAudit';
import CampaignAnalytics from '../campaigns/CampaignAnalytics';

export default function AdminDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/admin',              icon: '📊', label: t('dashboard.overview') },
    { path: '/dashboard/admin/approvals',    icon: '✅', label: t('dashboard.pendingApprovals') },

    // ── Campaign Reports (view-only analytics — management is done by the
    //    owning Subcity / Woreda admins) ────────────────────────────────────
    { path: '/dashboard/admin/campaigns/analytics', icon: '📈', label: 'Campaign Reports', sectionHeader: true },

    { path: '/dashboard/admin/users',        icon: '👥', label: t('dashboard.userManagement') },
    { path: '/dashboard/admin/reports',      icon: '📋', label: t('dashboard.reportManagement') },
    { path: '/dashboard/admin/governance-complaints', icon: '⚖️', label: 'Governance Complaints' },
    { path: '/dashboard/admin/governance-stats', icon: '🗂️', label: 'Governance Statistics' },
    { path: '/dashboard/admin/activity',     icon: '📜', label: t('admin.activityLog') },
    { path: '/dashboard/admin/subcities',    icon: '🏙️', label: 'Subcity Management' },
    { path: '/dashboard/admin/woredas',      icon: '🏘️', label: 'Woreda Management' },
    { path: '/dashboard/admin/departments',  icon: '🏢', label: 'Department Management' },
    { path: '/dashboard/admin/issue-types',  icon: '🏷️', label: 'Issue Types' },
    { path: '/dashboard/admin/news',         icon: '📰', label: t('dashboard.newsManagement') },
    { path: '/dashboard/admin/alerts',       icon: '📢', label: 'Public Alerts' },
    { path: '/dashboard/admin/alerts/audit', icon: '📜', label: 'Alert Audit' },
    { path: '/dashboard/admin/analytics',    icon: '📈', label: t('dashboard.analyticsTitle') },
    { path: '/dashboard/admin/messages',     icon: '💬', label: t('dashboard.messages') },
    { path: '/dashboard/admin/profile',      icon: '👤', label: t('dashboard.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={t('dashboard.adminDashboard')}>
      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="approvals"  element={<AdminApprovals />} />
        <Route path="campaigns/analytics" element={<CampaignAnalytics />} />
        <Route path="users"      element={<AdminUsers />} />
        <Route path="reports"    element={<AdminReports />} />
        <Route path="municipal-complaints" element={<MunicipalComplaintList basePath="/dashboard/admin/municipal-complaints" />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="governance-complaints" element={<GovernanceComplaintList basePath="/dashboard/admin/governance-complaints" />} />
        <Route path="governance-complaints/:id" element={<GovernanceComplaintDetail basePath="/dashboard/admin/governance-complaints" />} />
        {/* Read-only governance statistics — management (create/edit/delete) is
            owned exclusively by each Subcity Admin via the Subcity Dashboard. */}
        <Route path="governance-stats" element={<AdminGovernanceStats />} />
        <Route path="activity"   element={<AdminActivity />} />
        <Route path="subcities"  element={<AdminSubcityManagement />} />
        <Route path="woredas"    element={<AdminWoredaManagement />} />
        <Route path="departments" element={<AdminDepartmentManagement />} />
        <Route path="issue-types"   element={<AdminIssueTypes />} />
        <Route path="news"          element={<AdminNews />} />
        <Route path="alerts"        element={<AdminAlerts />} />
        <Route path="alerts/create" element={<PublicAlertForm homePath="/dashboard/admin/alerts" />} />
        <Route path="alerts/audit"  element={<AdminAlertAudit />} />
        <Route path="analytics"  element={<GovAnalytics />} />
        <Route path="messages"   element={<CitizenMessages />} />
        <Route path="profile"    element={<CitizenProfile />} />
        <Route path="*"          element={<Navigate to="/dashboard/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
