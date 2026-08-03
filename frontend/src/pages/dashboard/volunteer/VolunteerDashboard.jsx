import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import VolunteerOverview from './VolunteerOverview';
import VolunteerTasks from './VolunteerTasks';
import VolunteerMap from './VolunteerMap';
import CitizenProfile from '../citizen/CitizenProfile';
import CitizenMessages from '../citizen/CitizenMessages';

export default function VolunteerDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/volunteer',            icon: '📊', label: t('dashboard.overview') },
    { path: '/dashboard/volunteer/tasks',      icon: '📋', label: t('dashboard.assignedTasks') },
    { path: '/dashboard/volunteer/map',        icon: '🗺️', label: t('dashboard.nearbyMap') },
    { path: '/dashboard/volunteer/messages',   icon: '💬', label: t('dashboard.messages') },
    { path: '/dashboard/volunteer/profile',    icon: '👤', label: t('dashboard.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={t('dashboard.volunteerDashboard')}>
      <Routes>
        <Route index element={<VolunteerOverview />} />
        <Route path="tasks" element={<VolunteerTasks />} />
        <Route path="map" element={<VolunteerMap />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/volunteer" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
