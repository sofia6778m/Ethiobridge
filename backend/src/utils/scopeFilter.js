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
  'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'department', 'citizen',
  'ADMIN', 'SUBCITY_HEAD', 'WOREDA_HEAD', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CITIZEN', 'CONTRACTOR',
];

// Build a Mongo query filter for PublicComplaint based on the logged-in user's role.
//
// Subcity names in the DB can be any casing (e.g. 'bole', 'Bole', 'BOLE').
// We use a case-insensitive regex for subcity comparisons so that subcity_*
// role users always see complaints regardless of how the subcity string was
// stored at submission time.
//
//  - admin / ADMIN        -> all complaints
//  - subcity_* / SUBCITY_HEAD -> complaints whose subcity matches (case-insensitive)
//  - woreda / WOREDA_HEAD -> complaints matching their woredaId (no subcity filter)
//  - department / DEPARTMENT_ADMIN -> complaints matching woredaId + department (case-insensitive)
//  - OFFICER              -> complaints assigned to them
//  - TECHNICIAN           -> complaints assigned to them as the work order technician
//  - citizen / CITIZEN    -> complaints they personally submitted
function buildComplaintScope(user) {
  if (!user) return {};

  switch (user.role) {
    case 'admin':
    case 'ADMIN':
      return {};

    case 'subcity_bole':
    case 'subcity_yeka':
    case 'subcity_lemmi_kura':
    case 'SUBCITY_HEAD': {
      // user.subcity may be 'bole', 'Bole', or 'BOLE' — match all variants
      const subcityName = user.subcity || SUBCITY_ROLE_MAP[user.role];
      return { subcity: { $regex: `^${subcityName}$`, $options: 'i' } };
    }

    case 'woreda':
    case 'WOREDA_HEAD':
      // Scope only by woredaId — do NOT add subcity filter because the
      // subcity string on the complaint may differ in casing from user.subcity
      return { woredaId: user.woredaId };

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

  switch (user.role) {
    case 'admin':
    case 'ADMIN': return true;

    case 'subcity_bole':
    case 'subcity_yeka':
    case 'subcity_lemmi_kura':
    case 'SUBCITY_HEAD': {
      const subcityName = user.subcity || SUBCITY_ROLE_MAP[user.role];
      return (complaint.subcity || '').toLowerCase() === subcityName.toLowerCase();
    }

    case 'woreda':
    case 'WOREDA_HEAD':
      return String(complaint.woredaId) === String(user.woredaId);

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
  'woreda',
  'department',
  'ADMIN',
  'SUBCITY_HEAD',
  'WOREDA_HEAD',
  'DEPARTMENT_ADMIN',
];

module.exports = {
  SUBCITY_ROLE_MAP,
  SUB_CITIES,
  SUB_CITY_WOREDAS,
  DEPARTMENTS,
  COMPLAINT_SCOPED_ROLES,
  COMPLAINT_MANAGER_ROLES,
  buildComplaintScope,
  isComplaintInScope,
};
