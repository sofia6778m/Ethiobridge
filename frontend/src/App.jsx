import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import ErrorBoundary from './components/common/ErrorBoundary';

// Public Layout & Pages
import PublicLayout from './components/layout/PublicLayout';
import Home from './pages/public/Home';
import About from './pages/public/About';
import InfrastructureReports from './pages/public/InfrastructureReports';
import EmergencyRequests from './pages/public/EmergencyRequests';
import NewsPage from './pages/public/NewsPage';
import NewsDetail from './pages/public/NewsDetail';
import FAQ from './pages/public/FAQ';
import Contact from './pages/public/Contact';
import PrivacyPolicy from './pages/public/PrivacyPolicy';
import Terms from './pages/public/Terms';
import ReportDetail from './pages/public/ReportDetail';
import TrackReport from './pages/public/TrackReport';
import PublicReportSelection from './pages/public/PublicReportSelection';
import PublicInfrastructureReport from './pages/public/PublicInfrastructureReport';
import PublicGovernanceComplaint from './pages/public/PublicGovernanceComplaint';
import GovernanceTrack from './pages/public/GovernanceTrack';
import PublicTrack from './pages/public/PublicTrack';
import WorkflowComplaintSubmit from './pages/public/WorkflowComplaintSubmit';
import Fundraising from './pages/public/Fundraising';
import FundraisingDetail from './pages/public/FundraisingDetail';
import Donate from './pages/public/Donate';
import DonateNew from './pages/public/DonateNew';
import DonationTrack from './pages/public/DonationTrack';
import Alerts from './pages/public/Alerts';
import AlertDetail from './pages/public/AlertDetail';

// Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Dashboards
import CitizenDashboard from './pages/dashboard/citizen/CitizenDashboard';
import GovernmentDashboard from './pages/dashboard/government/GovDashboard';
import NGODashboard from './pages/dashboard/ngo/NGODashboard';
import VolunteerDashboard from './pages/dashboard/volunteer/VolunteerDashboard';
import AdminDashboard from './pages/dashboard/admin/AdminDashboard';
import DepartmentDashboard from './pages/dashboard/department/DepartmentDashboard';
import SubcityDashboard from './pages/dashboard/subcity/SubcityDashboard';
import WoredaDashboard from './pages/dashboard/woreda/WoredaDashboard';
import OfficerDashboard from './pages/dashboard/officer/OfficerDashboard';
import TechnicianDashboard from './pages/dashboard/technician/TechnicianDashboard';

import LoadingSpinner from './components/common/LoadingSpinner';
import DashboardRouter from './pages/dashboard/DashboardRouter';
import UnauthorizedPage from './pages/dashboard/UnauthorizedPage';
import { getRoleDashboard } from './utils/roleRoutes';

// Guest-only pages (login/register): an authenticated user who navigates to one
// of these is immediately sent to their own dashboard.
const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (isAuthenticated) return <Navigate to={getRoleDashboard(user)} replace />;
  return children;
};

// Authenticated-only route guard. Optional `roles` list: when provided and the
// user's role isn't allowed, show a friendly UnauthorizedPage instead of an
// "Access Denied" toast. Role mismatches redirect back to the user's own
// dashboard via getRoleDashboard.
// Optional `roleCheck` function overrides `roles` for wildcard pattern matching.
const ProtectedRoute = ({ children, roles, roleCheck }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roleCheck && !roleCheck(user?.role)) {
    console.warn(`[AUTH] Role '${user?.role}' is not allowed for this route`);
    return <UnauthorizedPage />;
  }
  if (!roleCheck && roles && !roles.includes(user?.role)) {
    console.warn(`[AUTH] Role '${user?.role}' is not allowed for this route`);
    return <UnauthorizedPage />;
  }
  return children;
};

// Catch-all for unknown paths: send authenticated users to their own dashboard
// instead of a blank page, and unauthenticated users to login.
const FallbackRoute = () => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (isAuthenticated) return <Navigate to={getRoleDashboard(user)} replace />;
  return <Navigate to="/login" replace />;
};

const AppRoutes = () => {
  const { loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;

  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/infrastructure-reports" element={<InfrastructureReports />} />
        <Route path="/infrastructure-reports/:id" element={<ReportDetail type="infrastructure" />} />
        <Route path="/emergency-requests" element={<EmergencyRequests />} />
        <Route path="/emergency-requests/:id" element={<ReportDetail type="emergency" />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/news/:id" element={<NewsDetail />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/track-report" element={<TrackReport />} />
        <Route path="/report" element={<PublicReportSelection />} />
        <Route path="/report/infrastructure" element={<PublicInfrastructureReport />} />
        <Route path="/report/governance-complaint" element={<PublicGovernanceComplaint />} />
        <Route path="/track/governance/:trackingId" element={<GovernanceTrack />} />
        <Route path="/track" element={<PublicTrack />} />
        <Route path="/report/workflow-complaint" element={<WorkflowComplaintSubmit />} />
        <Route path="/fundraising" element={<Fundraising />} />
        <Route path="/fundraising/:id" element={<FundraisingDetail />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/donate/new" element={<DonateNew />} />
        <Route path="/donate/track" element={<DonationTrack />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/alerts/:id" element={<AlertDetail />} />
      </Route>

      {/* Auth Routes — guest only: authenticated users are auto-redirected */}
      <Route path="/login" element={
        <PublicOnlyRoute>
          <Login />
        </PublicOnlyRoute>
      } />
      <Route path="/register" element={
        <PublicOnlyRoute>
          <Register />
        </PublicOnlyRoute>
      } />

      {/* Unified Dashboard entry — any authenticated user lands here and is
          dispatched to the correct dashboard for their role. No role lists or
          block lists on this route: DashboardRouter handles the dispatch. */}
      <Route path="/dashboard/*" element={
        <ProtectedRoute>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <DashboardRouter />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Citizen Dashboard */}
      <Route path="/dashboard/citizen/*" element={
        <ProtectedRoute roles={['citizen']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <CitizenDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Government Dashboard — single dashboard for all levels */}
      <Route path="/dashboard/government/*" element={
        <ProtectedRoute roles={['government']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <GovernmentDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* NGO Dashboard */}
      <Route path="/dashboard/ngo/*" element={
        <ProtectedRoute roles={['ngo']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <NGODashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Volunteer Dashboard */}
      <Route path="/dashboard/volunteer/*" element={
        <ProtectedRoute roles={['volunteer']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <VolunteerDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Admin Dashboard */}
      <Route path="/dashboard/admin/*" element={
        <ProtectedRoute roles={['admin', 'ADMIN']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <AdminDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Subcity Admin Dashboard — all subcity_* roles (subcity_admin, SUBCITY_ADMIN,
          and derived roles: subcity_bole, subcity_yeka, subcity_koye, …) land here.
          Each admin sees only their own subcity's data (enforced by the backend). */}
      <Route path="/dashboard/subcity/*" element={
        <ProtectedRoute roleCheck={(role) =>
          role === 'subcity_admin' ||
          role === 'SUBCITY_ADMIN' ||
          (typeof role === 'string' && role.startsWith('subcity_'))
        }>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <SubcityDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Woreda Admin Dashboard — legacy WOREDA_ADMIN and canonical woreda_admin */}
      <Route path="/dashboard/woreda/*" element={
        <ProtectedRoute roles={['WOREDA_ADMIN', 'woreda_admin']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <WoredaDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Officer Dashboard */}
      <Route path="/dashboard/officer/*" element={
        <ProtectedRoute roles={['OFFICER']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <OfficerDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Technician Dashboard */}
      <Route path="/dashboard/technician/*" element={
        <ProtectedRoute roles={['TECHNICIAN']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <TechnicianDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Department Dashboard — legacy department + canonical department_officer */}
      <Route path="/department/dashboard/*" element={
        <ProtectedRoute roles={['department', 'DEPARTMENT_ADMIN', 'department_officer']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <DepartmentDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      <Route path="*" element={<FallbackRoute />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <SocketProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </SocketProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
