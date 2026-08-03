import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import CitizenOverview from './CitizenOverview';
import ReportSelection from './ReportSelection';
import CreateReport from './CreateReport';
import CitizenComplaint from './CitizenComplaint';
import MyReports from './MyReports';
import CitizenMessages from './CitizenMessages';
import CitizenProfile from './CitizenProfile';
import NotificationBell from '../../../components/common/NotificationBell';
import MyDonations from './MyDonations';
import SavedCampaigns from './SavedCampaigns';
import CitizenMunicipalComplaints from './CitizenMunicipalComplaints';
import CitizenMunicipalComplaintDetail from './CitizenMunicipalComplaintDetail';
import MunicipalComplaintForm from './MunicipalComplaintForm';

export default function CitizenDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/citizen',                 icon: '📊', label: t('dashboard.overview') },
    { path: '/dashboard/citizen/create-report',   icon: '📝', label: t('dashboard.createReport') },
    { path: '/dashboard/citizen/my-reports',      icon: '📋', label: t('dashboard.myReports') },
    { path: '/dashboard/citizen/municipal-complaints', icon: '🏛️', label: 'Municipal Complaints' },
    { path: '/dashboard/citizen/my-donations',    icon: '❤️', label: 'My Donations' },
    { path: '/dashboard/citizen/saved-campaigns', icon: '🔖', label: 'Saved Campaigns' },
    { path: '/dashboard/citizen/messages',        icon: '💬', label: t('dashboard.messages') },
    { path: '/dashboard/citizen/profile',         icon: '👤', label: t('dashboard.profile') },
  ];

  return (
    <DashboardLayout navItems={navItems} title={t('dashboard.citizenDashboard')}>
      <Routes>
        <Route index element={<CitizenOverview />} />
        <Route path="create-report" element={<ReportSelection />} />
        <Route path="create-report/infrastructure" element={<CreateReport />} />
        <Route path="create-report/complaint" element={<CitizenComplaint />} />
        <Route path="create-complaint" element={<Navigate to="/dashboard/citizen/create-report/complaint" replace />} />
        <Route path="my-reports" element={<MyReports />} />
        <Route path="municipal-complaints" element={<CitizenMunicipalComplaints />} />
        <Route path="municipal-complaints/new" element={<MunicipalComplaintForm />} />
        <Route path="municipal-complaints/:id" element={<CitizenMunicipalComplaintDetail />} />
        <Route path="my-donations" element={<MyDonations />} />
        <Route path="saved-campaigns" element={<SavedCampaigns />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/citizen" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
