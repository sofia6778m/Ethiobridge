import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import { toast } from 'react-toastify';
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
import PublicComplaintPage from './pages/public/PublicComplaintPage';
import WorkflowComplaintSubmit from './pages/public/WorkflowComplaintSubmit';
import Fundraising from './pages/public/Fundraising';
import FundraisingDetail from './pages/public/FundraisingDetail';

// Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Dashboards
import CitizenDashboard from './pages/dashboard/citizen/CitizenDashboard';
import GovernmentDashboard from './pages/dashboard/government/GovDashboard';
import NGODashboard from './pages/dashboard/ngo/NGODashboard';
import VolunteerDashboard from './pages/dashboard/volunteer/VolunteerDashboard';
import AdminDashboard from './pages/dashboard/admin/AdminDashboard';
import SharedDashboard from './pages/dashboard/shared/SharedDashboard';
import DepartmentDashboard from './pages/dashboard/department/DepartmentDashboard';

import LoadingSpinner from './components/common/LoadingSpinner';
import { getRoleDashboard } from './utils/roleRoutes';

const RoleRedirect = ({ message }) => {
  const { user } = useAuth();
  useEffect(() => {
    if (message) toast.error(message);
  }, [message]);
  return <Navigate to={getRoleDashboard(user)} replace />;
};

// Guest-only pages (login/register): an authenticated user who navigates to one
// of these is immediately sent to their own dashboard.
const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (isAuthenticated) return <Navigate to={getRoleDashboard(user)} replace />;
  return children;
};

const ProtectedRoute = ({ children, roles, accessDeniedMessage }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) {
    return <RoleRedirect message={accessDeniedMessage || `Access Denied.`} />;
  }
  return children;
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
        <Route path="/report/public-complaint" element={<PublicComplaintPage />} />
        <Route path="/report/workflow-complaint" element={<WorkflowComplaintSubmit />} />
        <Route path="/fundraising" element={<Fundraising />} />
        <Route path="/fundraising/:id" element={<FundraisingDetail />} />
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

      {/* Shared Dashboard — subcity, woreda, inspector & technician roles */}
      <Route path="/dashboard/*" element={
        <ProtectedRoute roles={['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'inspector', 'technician']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <SharedDashboard />
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
        <ProtectedRoute roles={['admin']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <AdminDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Department Dashboard */}
      <Route path="/department/dashboard/*" element={
        <ProtectedRoute roles={['department']}>
          <ErrorBoundary fallbackTitle="Dashboard error" fallbackMessage="Something went wrong loading this dashboard. Your data is safe — try again or contact support.">
            <DepartmentDashboard />
          </ErrorBoundary>
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
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
