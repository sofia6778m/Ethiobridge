import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import NGOOverview from './NGOOverview';
import NGOEmergency from './NGOEmergency';
import NGOVolunteers from './NGOVolunteers';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';
import NGOCampaigns from './NGOCampaigns';

export default function NGODashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/ngo',               icon: '📊', label: t('dashboard.overview') },
    { path: '/dashboard/ngo/emergency',     icon: '🚨', label: t('dashboard.emergencyRequests') },
    { path: '/dashboard/ngo/campaigns',     icon: '❤️', label: 'Emergency Campaigns' },
    { path: '/dashboard/ngo/volunteers',    icon: '🙋', label: t('dashboard.volunteers') },
    { path: '/dashboard/ngo/messages',      icon: '💬', label: t('dashboard.messages') },
    { path: '/dashboard/ngo/profile',       icon: '👤', label: t('dashboard.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={t('dashboard.ngoDashboard')}>
      <Routes>
        <Route index element={<NGOOverview />} />
        <Route path="emergency" element={<NGOEmergency />} />
        <Route path="campaigns" element={<NGOCampaigns />} />
        <Route path="volunteers" element={<NGOVolunteers />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/ngo" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
