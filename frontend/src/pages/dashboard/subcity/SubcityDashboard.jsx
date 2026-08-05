import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import SubcityOverview from './SubcityOverview';
import SubcityWoredas from './SubcityWoredas';
import SubcityDepartments from './SubcityDepartments';
import SubcityUsers from './SubcityUsers';
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
import SharedNotifications from '../shared/SharedNotifications';
import SharedSettings from '../shared/SharedSettings';
import CitizenMessages from '../citizen/CitizenMessages';
import CitizenProfile from '../citizen/CitizenProfile';

export default function SubcityDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const base = '/dashboard/subcity';
  const subcityLabel = user?.subcity || 'Subcity';

  const navItems = [
    { path: base, icon: '📊', label: t('dashboard.overview') },
    { path: `${base}/woredas`, icon: '🏘️', label: 'Woredas' },
    { path: `${base}/departments`, icon: '🏛️', label: 'Departments' },
    { path: `${base}/users`, icon: '👥', label: t('dashboard.userManagement') },
    { path: `${base}/municipal-complaints`, icon: '🏛️', label: 'Municipal Complaints' },
    { path: `${base}/governance-complaints`, icon: '⚖️', label: 'Governance Complaints' },
    { path: `${base}/governance`, icon: '🗂️', label: 'Governance Management' },
    { path: `${base}/governance/analytics`, icon: '📈', label: 'Governance Analytics' },
    { path: `${base}/analytics`, icon: '📈', label: t('dashboard.analyticsTitle') },
    { path: `${base}/notifications`, icon: '🔔', label: t('dashboard.notifications') },
    { path: `${base}/messages`, icon: '💬', label: t('dashboard.messages') },
    { path: `${base}/profile`, icon: '👤', label: t('dashboard.profile') },
    { path: `${base}/settings`, icon: '⚙️', label: t('dashboard.settings') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={`${subcityLabel} Subcity Dashboard`}>
      <Routes>
        <Route index element={<SubcityOverview />} />
        <Route path="woredas" element={<SubcityWoredas />} />
        <Route path="departments" element={<SubcityDepartments />} />
        <Route path="users" element={<SubcityUsers />} />
        <Route path="municipal-complaints" element={<MunicipalComplaintList basePath={`${base}/municipal-complaints`} />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="governance-complaints" element={<GovernanceComplaintList basePath={`${base}/governance-complaints`} />} />
        <Route path="governance-complaints/:id" element={<GovernanceComplaintDetail basePath={`${base}/governance-complaints`} />} />
        <Route path="governance" element={<GovernanceManagementOverview />} />
        <Route path="governance/offices" element={<GovernanceOffices />} />
        <Route path="governance/categories" element={<GovernanceCategories />} />
        <Route path="governance/officers" element={<GovernanceOfficers />} />
        <Route path="governance/analytics" element={<GovernanceAnalytics />} />
        <Route path="analytics" element={<SubcityAnalytics />} />
        <Route path="notifications" element={<SharedNotifications />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="settings" element={<SharedSettings />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
