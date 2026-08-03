const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMunicipalScope,
  isComplaintInScope,
} = require('../src/controllers/municipalComplaintController');

describe('buildMunicipalScope', () => {
  it('grants admin / government full scope', () => {
    assert.deepEqual(buildMunicipalScope({ role: 'admin', _id: 'a' }), {});
    assert.deepEqual(buildMunicipalScope({ role: 'government', _id: 'g' }), {});
  });

  it('scopes subcity roles to their subcity (default from role map)', () => {
    const scope = buildMunicipalScope({ role: 'subcity_bole', _id: 's' });
    assert.equal(scope.subcity.$regex, '^BOLE$');
    assert.equal(scope.subcity.$options, 'i');
    const yeka = buildMunicipalScope({ role: 'subcity_yeka', _id: 's' });
    assert.equal(yeka.subcity.$regex, '^YEKA$');
  });

  it('prefers an explicit user.subcity for subcity roles', () => {
    const scope = buildMunicipalScope({ role: 'subcity_yeka', subcity: 'yeKa District', _id: 's' });
    assert.equal(scope.subcity.$regex, '^yeKa District$');
  });

  it('scopes woreda users to their woredaId', () => {
    assert.deepEqual(buildMunicipalScope({ role: 'woreda', woredaId: 'w1', _id: 'u' }), { woredaId: 'w1' });
  });

  it('scopes department users to their woreda department (no subcity)', () => {
    const scope = buildMunicipalScope({ role: 'department', woredaId: 'w1', department: 'Water', _id: 'u' });
    assert.deepEqual(scope, {
      $or: [
        { assignedLevel: 'Woreda', woredaId: 'w1', department: { $regex: '^Water$', $options: 'i' } },
      ],
    });
  });

  it('adds a subcity condition for department users who have a subcity', () => {
    const scope = buildMunicipalScope({
      role: 'department', woredaId: 'w1', department: 'Water', subcity: 'BOLE', _id: 'u',
    });
    assert.equal(scope.$or.length, 2);
    assert.deepEqual(scope.$or[1], {
      assignedLevel: 'Subcity',
      subcity: { $regex: '^BOLE$', $options: 'i' },
      assignedToDepartment: { $regex: '^Water$', $options: 'i' },
    });
  });

  it('scopes citizens to complaints they personally submitted', () => {
    assert.deepEqual(buildMunicipalScope({ role: 'citizen', _id: 'c1' }), { reporter: 'c1' });
  });

  it('scopes inspectors to their assigned inspections or their subcity', () => {
    const scope = buildMunicipalScope({ role: 'inspector', _id: 'i1', subcity: 'BOLE' });
    assert.deepEqual(scope.$or, [
      { inspectorId: 'i1' },
      { subcity: { $regex: '^BOLE$', $options: 'i' } },
    ]);
  });

  it('scopes technicians to their work orders or their woreda+department', () => {
    const scope = buildMunicipalScope({ role: 'technician', _id: 't1', woredaId: 'w1', department: 'Water' });
    assert.deepEqual(scope.$or, [
      { technicianId: 't1' },
      { woredaId: 'w1', department: { $regex: '^Water$', $options: 'i' } },
    ]);
  });

  it('denies unknown roles and anonymous users', () => {
    assert.deepEqual(buildMunicipalScope({ role: 'volunteer', _id: 'x' }), { _id: null });
    assert.deepEqual(buildMunicipalScope(null), { _id: null });
  });
});

describe('isComplaintInScope', () => {
  const w1 = 'w1';
  const complaint = (over = {}) => ({
    woredaId: w1,
    subcity: 'BOLE',
    department: 'Water',
    assignedLevel: 'Woreda',
    assignedToDepartment: 'Water',
    reporter: 'c1',
    ...over,
  });

  it('allows admin / government for anything', () => {
    assert.equal(isComplaintInScope({ role: 'admin', _id: 'a' }, complaint()), true);
    assert.equal(isComplaintInScope({ role: 'government', _id: 'g' }, complaint()), true);
  });

  it('matches subcity roles case-insensitively', () => {
    const user = { role: 'subcity_bole', _id: 's' };
    assert.equal(isComplaintInScope(user, complaint({ subcity: 'bole' })), true);
    assert.equal(isComplaintInScope(user, complaint({ subcity: 'YEKA' })), false);
  });

  it('matches woreda users by woredaId', () => {
    const user = { role: 'woreda', _id: 'u', woredaId: w1 };
    assert.equal(isComplaintInScope(user, complaint()), true);
    assert.equal(isComplaintInScope(user, complaint({ woredaId: 'other' })), false);
  });

  it('matches department users at woreda level by woreda + department', () => {
    const user = { role: 'department', _id: 'u', woredaId: w1, department: 'Water' };
    assert.equal(isComplaintInScope(user, complaint()), true);
    assert.equal(isComplaintInScope(user, complaint({ department: 'Roads' })), false);
    assert.equal(isComplaintInScope(user, complaint({ woredaId: 'other' })), false);
  });

  it('matches department users at subcity level by subcity + assignedToDepartment', () => {
    const user = { role: 'department', _id: 'u', woredaId: 'unused', department: 'Water', subcity: 'BOLE' };
    const subcityComplaint = complaint({ assignedLevel: 'Subcity', woredaId: 'unused' });
    assert.equal(isComplaintInScope(user, subcityComplaint), true);
    assert.equal(
      isComplaintInScope(user, complaint({ assignedLevel: 'Subcity', assignedToDepartment: 'Sanitation' })),
      false
    );
    assert.equal(isComplaintInScope(user, complaint({ assignedLevel: 'Subcity', subcity: 'YEKA' })), false);
  });

  it('matches citizens only against their own complaints', () => {
    const user = { role: 'citizen', _id: 'c1' };
    assert.equal(isComplaintInScope(user, complaint()), true);
    assert.equal(isComplaintInScope(user, complaint({ reporter: 'someone-else' })), false);
  });

  it('matches inspectors assigned to the complaint or in the same subcity', () => {
    const user = { role: 'inspector', _id: 'i1', subcity: 'BOLE' };
    assert.equal(isComplaintInScope(user, complaint({ inspectorId: 'i1' })), true);
    assert.equal(isComplaintInScope(user, complaint({ subcity: 'bole' })), true);
    assert.equal(isComplaintInScope(user, complaint({ subcity: 'YEKA' })), false);
  });

  it('matches technicians assigned to the complaint or in the same woreda+department', () => {
    const user = { role: 'technician', _id: 't1', woredaId: 'w1', department: 'Water' };
    assert.equal(isComplaintInScope(user, complaint({ technicianId: 't1' })), true);
    assert.equal(isComplaintInScope(user, complaint()), true);
    assert.equal(isComplaintInScope(user, complaint({ department: 'Roads' })), false);
    assert.equal(isComplaintInScope(user, complaint({ woredaId: 'other' })), false);
  });

  it('denies unknown roles and missing inputs', () => {
    assert.equal(isComplaintInScope({ role: 'volunteer', _id: 'x' }, complaint()), false);
    assert.equal(isComplaintInScope(null, complaint()), false);
    assert.equal(isComplaintInScope({ role: 'admin', _id: 'a' }, null), false);
  });
});
