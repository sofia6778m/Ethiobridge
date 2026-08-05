import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import TechnicianOverview from './TechnicianOverview';
import TechnicianWorkOrders from './TechnicianWorkOrders';
import SharedNotifications from '../shared/SharedNotifications';
import SharedSettings from '../shared/SharedSettings';
import CitizenProfile from '../citizen/CitizenProfile';

export default function TechnicianDashboard() {
  const { t } = useTranslation();
  const base = '/dashboard/technician';

  const navItems = [
    { path: base, icon: '📊', label: t('dashboard.overview') },
    { path: `${base}/work-orders`, icon: '🔧', label: 'Work Orders' },
    { path: `${base}/notifications`, icon: '🔔', label: t('dashboard.notifications') },
    { path: `${base}/profile`, icon: '👤', label: t('dashboard.profile') },
    { path: `${base}/settings`, icon: '⚙️', label: t('dashboard.settings') },
  ];

  return (
    <DashboardLayout navItems={navItems} title="Technician Dashboard">
      <Routes>
        <Route index element={<TechnicianOverview />} />
        <Route path="work-orders" element={<TechnicianWorkOrders />} />
        <Route path="notifications" element={<SharedNotifications />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="settings" element={<SharedSettings />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </DashboardLayout>
  );
}
