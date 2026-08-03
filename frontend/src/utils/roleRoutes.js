// Central mapping of user roles to their dashboard route.
// Keep this in sync with the `role` enum in backend/src/models/User.js.
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
  const base = ROLE_DASHBOARD_MAP[user.role] || '/';
  if (user.role === 'government' && user.administrativeLevel) {
    return GOV_LEVEL_ROUTES[user.administrativeLevel] || base;
  }
  return base;
}
