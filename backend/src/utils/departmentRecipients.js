/**
 * Department account lookup shared by the report/complaint submission flows.
 *
 * Department dashboards are served by two kinds of account:
 *   - legacy `department` role (e.g. endris, adem) — stores the department
 *     name exactly as the admin typed it;
 *   - canonical `department_officer` role (created via the admin UI) — scoped
 *     by live ObjectIds (subcityId / woredaId / departmentId) and stores the
 *     department name lower-cased in some live accounts.
 *
 * Notifications must reach BOTH. To survive the casing differences we match on
 * the departmentId ObjectId when one is available AND fall back to a
 * case-insensitive exact match on the department name.
 */
const User = require('../models/User');

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds the department match portion of a Mongo filter. Returns `null` when
// there is nothing to match on.
const departmentMatchFilter = (deptName, departmentId) => {
  const parts = [];
  const name = String(deptName || '').trim();
  if (name) parts.push({ department: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
  if (departmentId) parts.push({ departmentId });
  return parts.length === 1 ? parts[0] : parts.length > 1 ? { $or: parts } : null;
};

// Department accounts scoped to a woreda + department. Used to route
// notifications to the exact dashboard(s) that should see the new record.
const findDepartmentRecipients = async ({ woredaId, department, departmentId, isActive }) => {
  const match = departmentMatchFilter(department, departmentId);
  if (!woredaId || !match) return [];
  const filter = {
    role: { $in: ['department', 'department_officer'] },
    woredaId,
    ...match,
  };
  if (isActive) filter.isActive = true;
  return User.find(filter).select('_id');
};

module.exports = { findDepartmentRecipients, departmentMatchFilter };
