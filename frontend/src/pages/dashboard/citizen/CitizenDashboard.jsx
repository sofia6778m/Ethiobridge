import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import CitizenOverview from './CitizenOverview';
import ReportSelection from './ReportSelection';
import CreateReport from './CreateReport';
import CitizenMessages from './CitizenMessages';
import CitizenProfile from './CitizenProfile';
import MyComplaints from './MyComplaints';
import PublicComplaints from './PublicComplaints';
import CitizenComplaintDetail from './CitizenComplaintDetail';
import CitizenGovernanceComplaintForm from './CitizenGovernanceComplaintForm';
import CitizenAlerts from './CitizenAlerts';
import MyDonations from './MyDonations';
import SavedCampaigns from './SavedCampaigns';

export default function CitizenDashboard() {
  const { t } = useTranslation();

  const navItems = [
    { path: '/dashboard/citizen',                 icon: '📊', label: t('dashboard.overview') },
    { path: '/dashboard/citizen/create-report',   icon: '📝', label: t('dashboard.createReport') },
    { path: '/dashboard/citizen/my-complaints',   icon: '🗂️', label: 'My Complaints' },
    { path: '/dashboard/citizen/public-complaints', icon: '🏛️', label: 'Public Complaints' },
    { path: '/dashboard/citizen/alerts',          icon: '📢', label: 'Public Alerts' },

    // ── Campaigns & Fundraising ─────────────────────────────────────────────
    { path: '/dashboard/citizen/my-donations',    icon: '💰', label: 'My Donations' },
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
        <Route path="create-report/governance" element={<CitizenGovernanceComplaintForm />} />
        <Route path="my-complaints" element={<MyComplaints />} />
        <Route path="public-complaints" element={<PublicComplaints />} />
        <Route path="complaints/:type/:id" element={<CitizenComplaintDetail />} />
        <Route path="governance-complaints" element={<Navigate to="/dashboard/citizen/my-complaints" replace />} />
        <Route path="governance-complaints/new" element={<CitizenGovernanceComplaintForm />} />
        <Route path="alerts" element={<CitizenAlerts />} />
        <Route path="my-donations" element={<MyDonations />} />
        <Route path="saved-campaigns" element={<SavedCampaigns />} />
        <Route path="messages" element={<CitizenMessages />} />
        <Route path="profile" element={<CitizenProfile />} />
        <Route path="*" element={<Navigate to="/dashboard/citizen" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
