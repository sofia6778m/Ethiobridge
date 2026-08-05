// Central mapping of user roles to their dashboard route.
// Keep this in sync with the `role` enum in backend/src/models/User.js.

// Legacy camelCase role spellings from older builds map to their canonical
// snake_case values. This is the same normalization the backend applies, so
// older accounts with `subcityAdmin` / `woredaAdmin` / `departmentOfficer`
// still land on the right dashboard.
const LEGACY_ROLE_ALIASES = {
  subcityAdmin: 'subcity_admin',
  woredaAdmin: 'woreda_admin',
  departmentOfficer: 'department_officer',
};

export function normalizeRole(role) {
  if (typeof role !== 'string') return role;
  return LEGACY_ROLE_ALIASES[role] || role;
}

export const ROLE_DASHBOARD_MAP = {
  citizen: '/dashboard/citizen',
  government: '/dashboard/government',
  ngo: '/dashboard/ngo',
  volunteer: '/dashboard/volunteer',
  admin: '/dashboard/admin',
  subcity_bole: '/dashboard',
  subcity_yeka: '/dashboard',
  subcity_lemmi_kura: '/dashboard',
  woreda: '/dashboard',
  department: '/department/dashboard',
  inspector: '/dashboard',
  technician: '/dashboard',
  // Complaint-management roles
  ADMIN: '/dashboard/admin',
  SUBCITY_HEAD: '/dashboard',
  WOREDA_HEAD: '/dashboard',
  DEPARTMENT_ADMIN: '/department/dashboard',
  OFFICER: '/dashboard/officer',
  TECHNICIAN: '/dashboard/technician',
  CITIZEN: '/dashboard/citizen',
  // Governance officers scoped to a Government Office — shared locality dashboard
  GOVERNANCE_OFFICER: '/dashboard',
  // Office supervisors — same single-office scope and shared dashboard
  OFFICE_SUPERVISOR: '/dashboard',
  // Real Addis Ababa government hierarchy
  SUBCITY_ADMIN: '/dashboard/subcity',
  // Canonical role for subcity admins provisioned through the admin UI. They
  // land on the dedicated SubcityDashboard (/dashboard/subcity) — the same
  // destination as the legacy SUBCITY_ADMIN role.
  subcity_admin: '/dashboard/subcity',
  WOREDA_ADMIN: '/dashboard/woreda',
  // Woreda admins and department officers provisioned by the System Admin land
  // on their dedicated dashboards.
  woreda_admin: '/dashboard/woreda',
  department_officer: '/department/dashboard',
};

// Government users get a level-specific workflow dashboard when their
// administrative level is known.
export const GOV_LEVEL_ROUTES = {
  kebele: '/dashboard/government/workflow?level=kebele',
  woreda: '/dashboard/government/workflow?level=woreda',
  zone: '/dashboard/government/workflow?level=zone',
  regional_bureau: '/dashboard/government/workflow?level=regional_bureau',
  federal_ministry: '/dashboard/government/workflow?level=federal_ministry',
};

// Resolve the destination dashboard for a (possibly partial) user object.
export function getRoleDashboard(user) {
  if (!user || !user.role) return '/';
  const role = normalizeRole(user.role);
  // The canonical `subcity_admin` role lands on the dedicated SubcityDashboard.
  if (role === 'subcity_admin' || role === 'SUBCITY_ADMIN') {
    return ROLE_DASHBOARD_MAP.subcity_admin;
  }
  // Legacy subcity-admin roles are derived from the Subcity collection (Bole →
  // subcity_bole, Koye → subcity_koye, …), so any other subcity_* role lands on
  // the shared locality dashboard.
  if (role.startsWith('subcity_')) return '/dashboard';
  const base = ROLE_DASHBOARD_MAP[role] || '/';
  if (role === 'government' && user.administrativeLevel) {
    return GOV_LEVEL_ROUTES[user.administrativeLevel] || base;
  }
  return base;
}
