// Maps role-based scoping helpers for the complaint management system.
// All complaint queries MUST pass through these helpers so that no user
// can read or mutate data outside their assigned scope.

const SUBCITY_ROLE_MAP = {
  subcity_bole: 'BOLE',
  subcity_yeka: 'YEKA',
  subcity_lemmi_kura: 'LEMMI_KURA',
};

// SUB_CITIES is kept for backward compatibility with non-admin code
// (complaint scope filters, workflow controller, etc.) that still uses
// the three original subcity keys. It is NOT used for Woreda/User
// creation validation — those now query the Subcity collection live.
const SUB_CITIES = ['BOLE', 'YEKA', 'LEMMI_KURA'];

const SUB_CITY_WOREDAS = {
  BOLE: ['Woreda 01', 'Woreda 02'],
  YEKA: ['Woreda 03', 'Woreda 04'],
  LEMMI_KURA: ['Woreda 05', 'Woreda 06'],
};

const DEPARTMENTS = ['Electricity', 'Road', 'Water', 'Health', 'Education', 'Revenue'];

const COMPLAINT_SCOPED_ROLES = [
  'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'subcity_admin', 'woreda', 'department', 'citizen',
  'ADMIN', 'SUBCITY_HEAD', 'SUBCITY_ADMIN', 'WOREDA_HEAD', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CITIZEN', 'CONTRACTOR',
  'woreda_admin', 'department_officer',
];

// Helper: is this role a subcity-administrator flavor? Subcity roles are derived
// from the live Subcity collection (subcity_bole, subcity_koye, …) plus the
// canonical `subcity_admin` and the legacy `SUBCITY_ADMIN` / `SUBCITY_HEAD`.
const isSubcityAdminRole = (role) =>
  !!role &&
  (role.startsWith('subcity_') || role === 'SUBCITY_ADMIN' || role === 'SUBCITY_HEAD');

// Resolve the subcity name a subcity-admin user is scoped to. Prefers the
// denormalized `subcity` string on the account, falling back to the legacy
// hard-coded role map for pre-existing subcity_bole / yeka / lemmi_kura roles.
const subcityNameFor = (user) =>
  user.subcity || (user.role && SUBCITY_ROLE_MAP[user.role]) || '';

// Build a Mongo query filter for PublicComplaint based on the logged-in user's role.
//
// Subcity names in the DB can be any casing (e.g. 'bole', 'Bole', 'BOLE').
// We use a case-insensitive regex for subcity comparisons so that subcity_*
// role users always see complaints regardless of how the subcity string was
// stored at submission time.
//
//  - admin / ADMIN        -> all complaints
//  - subcity_* / SUBCITY_ADMIN / SUBCITY_HEAD -> complaints whose subcity matches (case-insensitive)
//  - woreda / WOREDA_HEAD -> complaints matching their woredaId (no subcity filter)
//  - department / DEPARTMENT_ADMIN -> complaints matching woredaId + department (case-insensitive)
//  - OFFICER              -> complaints assigned to them
//  - TECHNICIAN           -> complaints assigned to them as the work order technician
//  - citizen / CITIZEN    -> complaints they personally submitted
function buildComplaintScope(user) {
  if (!user) return {};

  // Subcity-admin roles are derived, never enumerated — this covers subcity_bole,
  // subcity_koye, subcity_admin, SUBCITY_ADMIN and SUBCITY_HEAD alike.
  if (isSubcityAdminRole(user.role)) {
    const subcityName = subcityNameFor(user);
    const scope = {};
    if (user.subcityId) scope.subcityId = user.subcityId;
    if (subcityName) scope.subcity = { $regex: `^${subcityName}$`, $options: 'i' };
    return scope;
  }

  switch (user.role) {
    case 'admin':
    case 'ADMIN':
      return {};

    case 'woreda':
    case 'WOREDA_HEAD':
    case 'woreda_admin':
      // Scope only by woredaId — do NOT add subcity filter because the
      // subcity string on the complaint may differ in casing from user.subcity.
      // A woreda belongs to exactly one subcity, so woredaId alone fully
      // satisfies the "subcity + woreda" scope for woreda_admin accounts.
      return { woredaId: user.woredaId };

    case 'department_officer':
      // Scope on the three live ObjectId references: the complaint must belong
      // to the officer's subcity AND woreda AND department.
      return {
        subcityId: user.subcityId,
        woredaId: user.woredaId,
        departmentId: user.departmentId,
      };

    case 'department':
    case 'DEPARTMENT_ADMIN':
      return {
        woredaId: user.woredaId,
        // Department name is stored exactly as the admin created it; use
        // case-insensitive match to survive any capitalisation differences.
        department: { $regex: `^${user.department}$`, $options: 'i' },
      };

    case 'OFFICER':
      return { assignedOfficerId: user._id };

    case 'TECHNICIAN':
    case 'CONTRACTOR':
      return { assignedTechnicianId: user._id };

    case 'citizen':
    case 'CITIZEN':
      return { reporter: user._id };

    default:
      return {};
  }
}

// Check whether a complaint document falls inside the user's scope.
// Uses case-insensitive string comparison for subcity and department.
function isComplaintInScope(user, complaint) {
  if (!user || !complaint) return false;

  if (isSubcityAdminRole(user.role)) {
    const subcityName = subcityNameFor(user);
    return subcityName
      ? (complaint.subcity || '').toLowerCase() === subcityName.toLowerCase()
      : !complaint.subcityId || String(complaint.subcityId) === String(user.subcityId);
  }

  switch (user.role) {
    case 'admin':
    case 'ADMIN': return true;

    case 'woreda':
    case 'WOREDA_HEAD':
    case 'woreda_admin':
      return String(complaint.woredaId) === String(user.woredaId);

    case 'department_officer':
      return (
        String(complaint.subcityId) === String(user.subcityId) &&
        String(complaint.woredaId) === String(user.woredaId) &&
        String(complaint.departmentId) === String(user.departmentId)
      );

    case 'department':
    case 'DEPARTMENT_ADMIN':
      return (
        String(complaint.woredaId) === String(user.woredaId) &&
        (complaint.department || '').toLowerCase() === (user.department || '').toLowerCase()
      );

    case 'OFFICER':
      return String(complaint.assignedOfficerId) === String(user._id);

    case 'TECHNICIAN':
    case 'CONTRACTOR':
      return String(complaint.assignedTechnicianId) === String(user._id);

    case 'citizen':
    case 'CITIZEN':
      return String(complaint.reporter) === String(user._id);

    default:
      return false;
  }
}

// Roles that are allowed to manage complaint status updates.
const COMPLAINT_MANAGER_ROLES = [
  'admin',
  'government',
  'subcity_bole',
  'subcity_yeka',
  'subcity_lemmi_kura',
  'subcity_admin',
  'woreda',
  'department',
  'ADMIN',
  'SUBCITY_HEAD',
  'SUBCITY_ADMIN',
  'WOREDA_HEAD',
  'DEPARTMENT_ADMIN',
  'woreda_admin',
  'department_officer',
];

// Roles allowed to drive the operational complaint workflow (assign officer /
// technician, accept / reject / forward / resolve actions). Woreda admins can
// view and monitor but never assign or mutate the workflow.
const COMPLAINT_OFFICER_ROLES = COMPLAINT_MANAGER_ROLES.filter((r) => r !== 'woreda_admin');

// Roles allowed to accept / resolve complaints at the Subcity level.
const SUBCITY_RESOLVE_ROLES = [
  'admin',
  'government',
  'subcity_bole',
  'subcity_yeka',
  'subcity_lemmi_kura',
  'subcity_admin',
  'SUBCITY_ADMIN',
  'SUBCITY_HEAD',
  'woreda',
  'WOREDA_HEAD',
];

module.exports = {
  SUBCITY_ROLE_MAP,
  SUB_CITIES,
  SUB_CITY_WOREDAS,
  DEPARTMENTS,
  COMPLAINT_SCOPED_ROLES,
  COMPLAINT_MANAGER_ROLES,
  COMPLAINT_OFFICER_ROLES,
  SUBCITY_RESOLVE_ROLES,
  buildComplaintScope,
  isComplaintInScope,
};
