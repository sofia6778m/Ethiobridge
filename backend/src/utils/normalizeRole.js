// ── Role-name standardization ────────────────────────────────────────────────
//
// Canonical role values (used everywhere in the app):
//   admin, subcity_admin, woreda_admin, department_officer,
//   citizen, ngo, government, volunteer, …
//
// Legacy camelCase values from older builds (subcityAdmin, woredaAdmin,
// departmentOfficer) are normalized to their canonical snake_case form so old
// accounts keep working after the rename — no account ever hits an "Access
// Denied" wall just because its stored role uses the old spelling.
//
// The hierarchy roles SUBCITY_ADMIN / WOREDA_ADMIN are intentionally left
// untouched — they are distinct roles with their own dashboards and routes.

const LEGACY_ROLE_ALIASES = {
  subcityAdmin: 'subcity_admin',
  woredaAdmin: 'woreda_admin',
  departmentOfficer: 'department_officer',
};

const normalizeRole = (role) => {
  if (typeof role !== 'string') return role;
  return LEGACY_ROLE_ALIASES[role] || role;
};

module.exports = { normalizeRole, LEGACY_ROLE_ALIASES };
