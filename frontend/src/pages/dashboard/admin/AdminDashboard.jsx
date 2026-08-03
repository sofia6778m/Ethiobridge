import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import AdminOverview from './AdminOverview';
import AdminUsers from './AdminUsers';
import AdminReports from './AdminReports';
import AdminApprovals from './AdminApprovals';
import AdminNews from './AdminNews';
import AdminActivity from './AdminActivity';
import AdminDepartments from './AdminDepartments';
import GovAnalytics from '../government/GovAnalytics';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';
import AdminCampaigns from './AdminCampaigns';
import AdminSubcityManagement from './AdminSubcityManagement';
import AdminWoredas from './AdminWoredas';
import AdminIssueTypes from './AdminIssueTypes';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import AdminComplaints from './AdminComplaints';

export default function AdminDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/admin',              icon: '📊', label: t('dashboard.overview') },
    { path: '/dashboard/admin/approvals',    icon: '✅', label: t('dashboard.pendingApprovals') },
    { path: '/dashboard/admin/campaigns',    icon: '❤️', label: 'Campaigns' },
    { path: '/dashboard/admin/users',        icon: '👥', label: t('dashboard.userManagement') },
    { path: '/dashboard/admin/reports',      icon: '📋', label: t('dashboard.reportManagement') },
    { path: '/dashboard/admin/complaints', icon: '🏛️', label: 'Complaint Management' },
    { path: '/dashboard/admin/activity',     icon: '📜', label: t('admin.activityLog') },
    { path: '/dashboard/admin/departments',  icon: '🏛️', label: t('admin.deptManagement') },
    { path: '/dashboard/admin/subcities',    icon: '🏙️', label: 'Subcity Management' },
    { path: '/dashboard/admin/woredas',      icon: '🗺️', label: t('admin.woredaManagement') },
    { path: '/dashboard/admin/issue-types',  icon: '🏷️', label: 'Issue Types' },
    { path: '/dashboard/admin/news',         icon: '📰', label: t('dashboard.newsManagement') },
    { path: '/dashboard/admin/analytics',    icon: '📈', label: t('dashboard.analyticsTitle') },
    { path: '/dashboard/admin/messages',     icon: '💬', label: t('dashboard.messages') },
    { path: '/dashboard/admin/profile',      icon: '👤', label: t('dashboard.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={t('dashboard.adminDashboard')}>
      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="approvals"  element={<AdminApprovals />} />
        <Route path="campaigns"  element={<AdminCampaigns />} />
        <Route path="users"      element={<AdminUsers />} />
        <Route path="reports"    element={<AdminReports />} />
        <Route path="complaints" element={<AdminComplaints />} />
        <Route path="municipal-complaints" element={<MunicipalComplaintList basePath="/dashboard/admin/municipal-complaints" />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="activity"   element={<AdminActivity />} />
        <Route path="departments" element={<AdminDepartments />} />
        <Route path="subcities"  element={<AdminSubcityManagement />} />
        <Route path="woredas"       element={<AdminWoredas />} />
        <Route path="issue-types"   element={<AdminIssueTypes />} />
        <Route path="news"          element={<AdminNews />} />
        <Route path="analytics"  element={<GovAnalytics />} />
        <Route path="messages"   element={<CitizenMessages />} />
        <Route path="profile"    element={<CitizenProfile />} />
        <Route path="*"          element={<Navigate to="/dashboard/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
