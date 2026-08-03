/**
 * Subcity-scoped Department management (Admin only).
 *
 * Endpoints (all mounted under /api/admin/subcities/:id/departments):
 *   GET    /api/admin/subcities/:id/departments
 *   POST   /api/admin/subcities/:id/departments
 *   PUT    /api/admin/subcities/:id/departments/:deptId
 *   DELETE /api/admin/subcities/:id/departments/:deptId
 *
 * Every department belongs to a subcity. Duplicate prevention is scoped to the
 * (subcityId, normalizedDepartmentName) pair — the same name may exist in
 * different subcities but never twice inside one subcity.
 */
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Subcity = require('../models/Subcity');
const { normalizeDepartmentName, escapeRegExp } = require('../utils/departmentNames');

const resolveSubcity = async (subcityId) => {
  if (!mongoose.isValidObjectId(subcityId)) return null;
  return Subcity.findById(subcityId).lean();
};

// Application-layer duplicate check mirroring the unique index semantics.
// subcityId null matches legacy/global departments too.
const findDepartmentDup = (subcityId, normalizedName, excludeId) => {
  const filter = {
    subcityId: subcityId || null,
    normalizedDepartmentName: normalizedName,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  // Fall back to a case-insensitive regex on `name` so records that predate
  // the normalizedDepartmentName backfill are still caught.
  return Department.findOne({
    $or: [
      filter,
      { subcityId: subcityId || null, name: { $regex: `^${escapeRegExp(normalizedName)}$`, $options: 'i' } },
    ],
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
};

const validateDepartmentName = (name) => {
  if (!name || !String(name).trim()) {
    return { error: 'Department name is required' };
  }
  const normalizedDepartmentName = normalizeDepartmentName(name);
  if (normalizedDepartmentName.length > 100) {
    return { error: 'Department name must be 100 characters or fewer' };
  }
  return { normalizedDepartmentName };
};

// GET /api/admin/subcities/:id/departments
const getSubcityDepartments = async (req, res) => {
  try {
    const subcity = await resolveSubcity(req.params.id);
    if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found' });

    const departments = await Department.find({ subcityId: subcity._id })
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, subcity: { _id: subcity._id, name: subcity.name }, departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/subcities/:id/departments
const createSubcityDepartment = async (req, res) => {
  try {
    const subcity = await resolveSubcity(req.params.id);
    if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found' });

    const { name, description, status } = req.body;
    const check = validateDepartmentName(name);
    if (check.error) return res.status(400).json({ success: false, message: check.error });

    const existing = await findDepartmentDup(subcity._id, check.normalizedDepartmentName);
    if (existing) {
      if (existing.status === 'Inactive') {
        return res.status(409).json({
          success: false,
          code: 'DEPARTMENT_EXISTS_INACTIVE',
          message: `An inactive "${existing.name}" department already exists in ${subcity.name}`,
          department: { _id: existing._id, name: existing.name, status: existing.status },
        });
      }
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_NAME_EXISTS',
        message: `A "${existing.name}" department already exists in ${subcity.name}`,
        department: { _id: existing._id, name: existing.name, status: existing.status },
      });
    }

    const department = await Department.create({
      name: check.normalizedDepartmentName, // already trimmed + normalized casing
      normalizedDepartmentName: check.normalizedDepartmentName,
      subcityId: subcity._id,
      subcityName: subcity.name,
      createdByAdmin: req.user?._id || undefined,
      description: String(description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
    });

    res.status(201).json({ success: true, message: 'Department created successfully', department });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, code: 'DEPARTMENT_NAME_EXISTS', message: 'A department with this name already exists in this subcity' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/admin/subcities/:id/departments/:deptId
const updateSubcityDepartment = async (req, res) => {
  try {
    const subcity = await resolveSubcity(req.params.id);
    if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found' });

    const department = await Department.findOne({ _id: req.params.deptId, subcityId: subcity._id });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found in this subcity' });

    const { name, description, status } = req.body;
    const updates = {};

    if (name !== undefined) {
      const check = validateDepartmentName(name);
      if (check.error) return res.status(400).json({ success: false, message: check.error });
      const existing = await findDepartmentDup(subcity._id, check.normalizedDepartmentName, department._id);
      if (existing) {
        return res.status(409).json({
          success: false,
          code: 'DEPARTMENT_NAME_EXISTS',
          message: `A "${existing.name}" department already exists in ${subcity.name}`,
        });
      }
      updates.name = check.normalizedDepartmentName;
      updates.normalizedDepartmentName = check.normalizedDepartmentName;
    }
    if (description !== undefined) updates.description = String(description).trim();
    if (status !== undefined) updates.status = status === 'Inactive' ? 'Inactive' : 'Active';

    const updated = await Department.findByIdAndUpdate(department._id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Department updated successfully', department: updated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, code: 'DEPARTMENT_NAME_EXISTS', message: 'A department with this name already exists in this subcity' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/admin/subcities/:id/departments/:deptId
const deleteSubcityDepartment = async (req, res) => {
  try {
    const subcity = await resolveSubcity(req.params.id);
    if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found' });

    const department = await Department.findOneAndDelete({ _id: req.params.deptId, subcityId: subcity._id });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found in this subcity' });

    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSubcityDepartments,
  createSubcityDepartment,
  updateSubcityDepartment,
  deleteSubcityDepartment,
  findDepartmentDup,
};
