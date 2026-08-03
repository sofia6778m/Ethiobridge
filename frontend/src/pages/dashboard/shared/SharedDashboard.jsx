import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import SharedOverview from './SharedOverview';
import SharedComplaints from './SharedComplaints';
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

  const subcityLabel = SUB_CITY_LABELS[role] || user?.subcity || 'Subcity';

  // Role-based menu — locality roles get no user/department management.
  const navItems = [
    { path: base, icon: '📊', label: t('dashboard.overview') },
    ...(isSubcity || isWoreda ? [{ path: `${base}/reports`, icon: '📋', label: 'Reports' }] : []),
    ...(!isInspector && !isTechnician ? [{ path: `${base}/complaints`, icon: '📝', label: 'Complaints' }] : []),
    { path: `${base}/municipal-complaints`, icon: '🏛️', label: isInspector || isTechnician ? 'My Work Orders' : 'Municipal Complaints' },
    ...(!isInspector && !isTechnician ? [
      { path: `${base}/workflow-complaints`, icon: '⚙️', label: 'Workflow Complaints' },
      { path: `${base}/workflow-analytics`, icon: '📈', label: 'Analytics' },
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
          : 'Dashboard';

  return (
    <DashboardLayout navItems={navItems} title={title}>
      <Routes>
        <Route index element={<SharedOverview />} />
        {(isSubcity || isWoreda) && <Route path="reports" element={<SharedReports />} />}
        <Route path="complaints" element={<SharedComplaints />} />
        <Route path="municipal-complaints" element={<MunicipalComplaintList basePath={`${base}/municipal-complaints`} />} />
        <Route path="municipal-complaints/:id" element={<MunicipalComplaintDetail />} />
        <Route path="workflow-complaints" element={<WorkflowComplaintList basePath={base} />} />
        <Route path="workflow-complaints/:id" element={<WorkflowComplaintDetail basePath={`${base}/workflow-complaints`} />} />
        <Route path="workflow-analytics" element={<WorkflowDashboard />} />
        <Route path="notifications" element={<SharedNotifications />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="settings" element={<SharedSettings />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
