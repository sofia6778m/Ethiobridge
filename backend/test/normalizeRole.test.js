const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRole, LEGACY_ROLE_ALIASES } = require('../src/utils/normalizeRole');

describe('normalizeRole', () => {
  it('maps legacy camelCase roles to canonical values', () => {
    assert.equal(normalizeRole('subcityAdmin'), 'subcity_admin');
    assert.equal(normalizeRole('woredaAdmin'), 'woreda_admin');
    assert.equal(normalizeRole('departmentOfficer'), 'department_officer');
  });

  it('leaves canonical roles untouched', () => {
    assert.equal(normalizeRole('subcity_admin'), 'subcity_admin');
    assert.equal(normalizeRole('woreda_admin'), 'woreda_admin');
    assert.equal(normalizeRole('department_officer'), 'department_officer');
    assert.equal(normalizeRole('admin'), 'admin');
  });

  it('leaves hierarchy roles untouched', () => {
    assert.equal(normalizeRole('SUBCITY_ADMIN'), 'SUBCITY_ADMIN');
    assert.equal(normalizeRole('WOREDA_ADMIN'), 'WOREDA_ADMIN');
  });

  it('leaves derived subcity_* roles untouched', () => {
    assert.equal(normalizeRole('subcity_bole'), 'subcity_bole');
    assert.equal(normalizeRole('subcity_koye'), 'subcity_koye');
  });

  it('handles non-string input', () => {
    assert.equal(normalizeRole(undefined), undefined);
    assert.equal(normalizeRole(null), null);
    assert.equal(normalizeRole(123), 123);
  });

  it('exposes the alias map', () => {
    assert.deepEqual(LEGACY_ROLE_ALIASES, {
      subcityAdmin: 'subcity_admin',
      woredaAdmin: 'woreda_admin',
      departmentOfficer: 'department_officer',
    });
  });
});
