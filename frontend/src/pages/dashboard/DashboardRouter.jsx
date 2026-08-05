import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SharedDashboard from './shared/SharedDashboard';
import UnauthorizedPage from './UnauthorizedPage';
import { normalizeRole, getRoleDashboard } from '../../utils/roleRoutes';

// Roles that render the shared locality dashboard directly under /dashboard.
// These are the only roles whose canonical base path is /dashboard itself.
const SHARED_ROLES = [
  'woreda',
  'inspector',
  'technician',
  'SUBCITY_HEAD',
  'WOREDA_HEAD',
  'OFFICER',
  'TECHNICIAN',
  'department',
  'DEPARTMENT_ADMIN',
  'GOVERNANCE_OFFICER',
  'OFFICE_SUPERVISOR',
];

// Single entry point for /dashboard/*. Dispatches the logged-in role to its
// correct dashboard component. Dedicated dashboards live under their own base
// path (e.g. /dashboard/subcity, /dashboard/woreda), so we redirect to them so
// their internal nested routes keep working. The shared locality roles are
// rendered in place because their base path IS /dashboard.
export default function DashboardRouter() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);

  console.log(`[DASHBOARD] Routing role '${role}' to its dashboard`);

  if (!role) {
    return <UnauthorizedPage />;
  }

  // Derived subcity-admin roles (subcity_bole, subcity_koye, …) share the
  // shared dashboard; the canonical subcity_admin uses the dedicated one.
  if (role.startsWith('subcity_') || SHARED_ROLES.includes(role)) {
    return <SharedDashboard />;
  }

  const destination = getRoleDashboard({ role });
  if (!destination || destination === '/' || destination === '/dashboard') {
    console.warn(`[DASHBOARD] No dashboard destination for role '${role}'`);
    return <UnauthorizedPage />;
  }

  return <Navigate to={destination} replace />;
}
