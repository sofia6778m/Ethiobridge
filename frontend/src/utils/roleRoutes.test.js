import { describe, it, expect } from 'vitest';
import { normalizeRole, getRoleDashboard } from './roleRoutes';

describe('normalizeRole', () => {
  it('maps legacy camelCase roles to canonical values', () => {
    expect(normalizeRole('subcityAdmin')).toBe('subcity_admin');
    expect(normalizeRole('woredaAdmin')).toBe('woreda_admin');
    expect(normalizeRole('departmentOfficer')).toBe('department_officer');
  });

  it('leaves canonical and hierarchy roles untouched', () => {
    expect(normalizeRole('subcity_admin')).toBe('subcity_admin');
    expect(normalizeRole('woreda_admin')).toBe('woreda_admin');
    expect(normalizeRole('department_officer')).toBe('department_officer');
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('SUBCITY_ADMIN')).toBe('SUBCITY_ADMIN');
    expect(normalizeRole('WOREDA_ADMIN')).toBe('WOREDA_ADMIN');
  });
});

describe('getRoleDashboard', () => {
  it('routes subcity_admin to the dedicated subcity dashboard', () => {
    expect(getRoleDashboard({ role: 'subcity_admin' })).toBe('/dashboard/subcity');
  });

  it('routes the legacy subcityAdmin spelling to the subcity dashboard', () => {
    expect(getRoleDashboard({ role: 'subcityAdmin' })).toBe('/dashboard/subcity');
  });

  it('routes woreda_admin to the dedicated woreda dashboard', () => {
    expect(getRoleDashboard({ role: 'woreda_admin' })).toBe('/dashboard/woreda');
  });

  it('routes department_officer to the dedicated department dashboard', () => {
    expect(getRoleDashboard({ role: 'department_officer' })).toBe('/department/dashboard');
  });

  it('routes the legacy woredaAdmin spelling to the dedicated woreda dashboard', () => {
    expect(getRoleDashboard({ role: 'woredaAdmin' })).toBe('/dashboard/woreda');
  });

  it('routes derived subcity_* roles to the dedicated subcity dashboard', () => {
    expect(getRoleDashboard({ role: 'subcity_bole' })).toBe('/dashboard/subcity');
    expect(getRoleDashboard({ role: 'subcity_koye' })).toBe('/dashboard/subcity');
  });

  it('routes admin to the admin dashboard', () => {
    expect(getRoleDashboard({ role: 'admin' })).toBe('/dashboard/admin');
  });

  it('falls back to home for unknown or missing roles', () => {
    expect(getRoleDashboard({ role: 'unknown_role' })).toBe('/');
    expect(getRoleDashboard(null)).toBe('/');
    expect(getRoleDashboard({})).toBe('/');
  });
});
