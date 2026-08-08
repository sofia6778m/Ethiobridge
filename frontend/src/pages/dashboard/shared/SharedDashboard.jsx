import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import SharedOverview from './SharedOverview';
import SharedReports from './SharedReports';
import SharedNotifications from './SharedNotifications';
import SharedSettings from './SharedSettings';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';
import WorkflowComplaintList from '../workflow/WorkflowComplaintList';
import WorkflowComplaintDetail from '../workflow/WorkflowComplaintDetail';
import WorkflowDashboard from '../workflow/WorkflowDashboard';
import MunicipalComplaintList from '../municipal/MunicipalComplaintList';
import MunicipalComplaintDetail from '../municipal/MunicipalComplaintDetail';
import GovernanceComplaintList from '../governance/GovernanceComplaintList';
import GovernanceComplaintDetail from '../governance/GovernanceComplaintDetail';
import SharedAlerts from './SharedAlerts';
import PublicAlertForm from '../alerts/PublicAlertForm';

const SUB_CITY_LABELS = {
  subcity_bole: 'Bole',
  subcity_yeka: 'Yeka',
  subcity_lemmi_kura: 'Lemmi Kura',
};

// Single shared dashboard for the locality roles (subcity & woreda). The
// content and menu adapt automatically to the logged-in user's role.
export default function SharedDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const base = '/dashboard';
  const role = user?.role;
  const isSubcity = role?.startsWith('subcity_');
  const isWoreda = role === 'woreda';
  const isInspector = role === 'inspector';
  const isTechnician = role === 'technician';
  const isSubcityHead = role === 'SUBCITY_HEAD';
  const isWoredaHead = role === 'WOREDA_HEAD';
  const isWoredaAdmin = role === 'woreda_admin';
  const isDepartmentOfficer = role === 'department_officer';
  const isOfficer = role === 'OFFICER';
  const isFieldTech = role === 'TECHNICIAN';
  const isGovernanceOfficer = role === 'GOVERNANCE_OFFICER' || role === 'OFFICE_SUPERVISOR';

  const subcityLabel = SUB_CITY_LABELS[role] || user?.subcity || 'Subcity';

  // Role-based menu — locality roles get no user/department management.
  const navItems = [
    { path: base, icon: '📊', label: t('dashboard.overview') },
    ...(isSubcity || isWoreda || isSubcityHead || isWoredaHead ? [{ path: `${base}/reports`, icon: '📋', label: 'Reports' }] : []),
    ...(!isInspector && !isTechnician && !isWoredaAdmin && !isDepartmentOfficer && !isGovernanceOfficer ? [
      { path: `${base}/municipal-complaints`, icon: '🏛️', label: isOfficer || isFieldTech ? 'My Work Orders' : 'Municipal Complaints' },
      { path: `${base}/workflow-complaints`, icon: '⚙️', label: 'Workflow Complaints' },
      { path: `${base}/workflow-analytics`, icon: '📈', label: 'Analytics' },
    ] : []),
    ...(!isInspector && !isTechnician && !isWoredaAdmin && !isDepartmentOfficer ? [
      { path: `${base}/governance-complaints`, icon: '⚖️', label: 'Governance Complaints' },
    ] : []),
    ...(!isInspector && !isTechnician && !isWoredaAdmin && !isDepartmentOfficer && !isGovernanceOfficer ? [
      { path: `${base}/alerts`, icon: '📢', label: 'Public Alerts' },
    ] : []),
    { path: `${base}/notifications`, icon: '🔔', label: t('dashboard.notifications') },
    ...(!isInspector && !isTechnician ? [{ path: `${base}/messages`, icon: '💬', label: t('dashboard.messages') }] : []),
    { path: `${base}/profile`, icon: '👤', label: t('dashboard.profile') },
    { path: `${base}/settings`, icon: '⚙️', label: t('dashboard.settings') },
  ];

  const title = isSubcity
    ? `${subcityLabel} Subcity Dashboard`
    : isWoreda
      ? 'Woreda Dashboard'
      : isInspector
        ? 'Inspector Dashboard'
        : isTechnician
          ? 'Technician Dashboard'
          : isSubcityHead
            ? `${subcityLabel} Subcity Dashboard`
            : isWoredaHead
              ? 'Woreda Dashboard'
              : isWoredaAdmin
                ? 'Woreda Dashboard'
                : isDepartmentOfficer
                  ? 'Department Dashboard'
                  : isOfficer
                  ? 'Officer Dashboard'
                  : isFieldTech
                    ? 'Field Technician Dashboard'
                    : isGovernanceOfficer
                      ? 'Governance Officer Dashboard'
                      : 'Dashboard';

  return (
    <DashboardLayout navItems={navItems} title={title}>
      <Routes>
        <Route index element={<SharedOverview />} />
        {(isSubcity || isWoreda) && <Route path="reports" element={<SharedReports />} />}
        {!isGovernanceOfficer && (
          <>
            <Route path="municipal-complaints" element={<MunicipalComplaintList basePath={`${base}/municipal-complaints`} />} />
            <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
          </>
        )}
        <Route path="governance-complaints" element={<GovernanceComplaintList basePath={`${base}/governance-complaints`} />} />
        <Route path="governance-complaints/:id" element={<GovernanceComplaintDetail basePath={`${base}/governance-complaints`} />} />
        {!isGovernanceOfficer && (
          <>
            <Route path="workflow-complaints" element={<WorkflowComplaintList basePath={base} />} />
            <Route path="workflow-complaints/:id" element={<WorkflowComplaintDetail basePath={`${base}/workflow-complaints`} />} />
            <Route path="workflow-analytics" element={<WorkflowDashboard />} />
          </>
        )}
        {(isSubcity || isWoreda || isSubcityHead || isWoredaHead) && (
          <>
            <Route path="alerts" element={<SharedAlerts />} />
            <Route path="alerts/create" element={<PublicAlertForm homePath="/dashboard/alerts" />} />
          </>
        )}
        <Route path="notifications" element={<SharedNotifications />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="settings" element={<SharedSettings />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
