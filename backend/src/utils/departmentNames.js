/**
 * Department-name normalization shared by the Department model, the admin
 * controller, and the migration script.
 *
 * Departments are identified case- and whitespace-insensitively: "Water",
 * "water", " WATER  " and "wa ter" all refer to the same department. Every
 * department record stores a `normalizedDepartmentName` (lower-cased,
 * whitespace collapsed); uniqueness is enforced per subcity via the compound
 * unique index { subcityId, normalizedDepartmentName }.
 */

// Collapse any run of whitespace to a single space, then lower-case.
const normalizeDepartmentName = (name) =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

// Escape user input for use inside a RegExp literal.
const escapeRegExp = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { normalizeDepartmentName, escapeRegExp };
