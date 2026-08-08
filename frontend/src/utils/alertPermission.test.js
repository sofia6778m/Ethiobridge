import { describe, it, expect } from 'vitest';
import { canModifyAlertForUser } from './alertMeta';

const admin = { role: 'admin', fullName: 'System Admin' };
const government = { role: 'government', fullName: 'Gov User' };
const boleAdmin = { role: 'subcity_bole', subcity: 'Bole', subcityId: 's-bole' };
const yekaAdmin = { role: 'subcity_yeka', subcity: 'Yeka', subcityId: 's-yeka' };
const woreda01 = { role: 'woreda', subcity: 'Bole', subcityId: 's-bole', woredaName: 'Woreda 01', woredaId: 'w-01' };
const woreda02 = { role: 'woreda', subcity: 'Bole', subcityId: 's-bole', woredaName: 'Woreda 02', woredaId: 'w-02' };

const cityWide = { scope: 'all', targetType: 'city' };
const subcityBole = { scope: 'subcity', subcityIds: ['s-bole'], subcityNames: ['Bole'] };
const subcityYeka = { scope: 'subcity', subcityIds: ['s-yeka'], subcityNames: ['Yeka'] };
const woreda01Alert = { scope: 'woreda', subcityIds: ['s-bole'], woredaIds: ['w-01'], woredaNames: ['Woreda 01'] };
const woreda02Alert = { scope: 'woreda', subcityIds: ['s-bole'], woredaIds: ['w-02'], woredaNames: ['Woreda 02'] };

describe('canModifyAlertForUser — global roles', () => {
  it('System Admin may modify any alert (city-wide, subcity, woreda)', () => {
    expect(canModifyAlertForUser(admin, cityWide)).toBe(true);
    expect(canModifyAlertForUser(admin, subcityBole)).toBe(true);
    expect(canModifyAlertForUser(admin, woreda01Alert)).toBe(true);
  });

  it('government role is treated as global', () => {
    expect(canModifyAlertForUser(government, cityWide)).toBe(true);
    expect(canModifyAlertForUser(government, woreda01Alert)).toBe(true);
  });
});

describe('canModifyAlertForUser — subcity admins', () => {
  it('may modify only alerts that specifically target their subcity', () => {
    expect(canModifyAlertForUser(boleAdmin, subcityBole)).toBe(true);
    expect(canModifyAlertForUser(boleAdmin, subcityYeka)).toBe(false);
  });

  it('cannot modify a city-wide alert', () => {
    expect(canModifyAlertForUser(boleAdmin, cityWide)).toBe(false);
  });

  it('matches by subcityName even without ids', () => {
    const byName = { scope: 'subcity', subcityNames: ['Bole'] };
    expect(canModifyAlertForUser(boleAdmin, byName)).toBe(true);
  });
});

describe('canModifyAlertForUser — woreda officers', () => {
  it('may modify only alerts targeting their own woreda', () => {
    expect(canModifyAlertForUser(woreda01, woreda01Alert)).toBe(true);
    expect(canModifyAlertForUser(woreda01, woreda02Alert)).toBe(false);
  });

  it('cannot modify a whole-subcity alert (not their woreda)', () => {
    expect(canModifyAlertForUser(woreda01, subcityBole)).toBe(false);
  });

  it('cannot modify a city-wide alert', () => {
    expect(canModifyAlertForUser(woreda01, cityWide)).toBe(false);
  });
});

describe('canModifyAlertForUser — edge cases', () => {
  it('returns false without a user or without an alert', () => {
    expect(canModifyAlertForUser(null, cityWide)).toBe(false);
    expect(canModifyAlertForUser(admin, null)).toBe(false);
    expect(canModifyAlertForUser(undefined, undefined)).toBe(false);
  });

  it('returns false for roles outside the alert permission set', () => {
    expect(canModifyAlertForUser({ role: 'citizen' }, subcityBole)).toBe(false);
    expect(canModifyAlertForUser({ role: 'ngo' }, cityWide)).toBe(false);
  });
});
