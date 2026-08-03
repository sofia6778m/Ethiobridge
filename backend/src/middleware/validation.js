const { body, param, query, validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const validateReport = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }).withMessage('Title must be under 200 characters'),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 5000 }).withMessage('Description must be under 5000 characters'),
  body('category').optional({ values: 'falsy' }).trim()
    .isIn(['road_issue', 'electricity_issue', 'water_supply_issue']).withMessage('Invalid category'),
  body('severityLevel').optional()
    .isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid severity level'),
  body('region').trim().notEmpty().withMessage('Region is required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('incidentDate').optional().isISO8601().withMessage('Invalid date format'),
  handleValidation,
];

const validateVerify = [
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('note').optional().trim().isLength({ max: 1000 }).withMessage('Note too long'),
  handleValidation,
];

const validateAssign = [
  body('assignedTo').notEmpty().withMessage('Assignee is required').isMongoId().withMessage('Invalid assignee ID'),
  body('dueDate').optional().isISO8601().withMessage('Invalid date format'),
  body('assignedDepartment').optional().trim().isLength({ max: 200 }),
  handleValidation,
];

const validateStatusUpdate = [
  body('status').notEmpty().withMessage('Status is required')
    .isIn(['Pending', 'Under Review', 'Approved', 'Rejected', 'Assigned', 'In Progress', 'Completed', 'Citizen Verification', 'Resolved', 'Reopened']).withMessage('Invalid status'),
  body('note').optional().trim().isLength({ max: 1000 }),
  handleValidation,
];

const validateFeedback = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('feedback').optional().trim().isLength({ max: 1000 }).withMessage('Feedback too long'),
  handleValidation,
];

const validateComment = [
  body('text').trim().notEmpty().withMessage('Comment text is required').isLength({ max: 2000 }).withMessage('Comment too long'),
  handleValidation,
];

const validateCitizenVerify = [
  body('verified').isBoolean().withMessage('Verified field is required'),
  body('note').optional().trim().isLength({ max: 1000 }),
  handleValidation,
];

const validateIdParam = [
  param('id').isMongoId().withMessage('Invalid report ID'),
  handleValidation,
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidation,
];

const validateRegister = [
  body('fullName').trim().notEmpty().withMessage('Full name is required').isLength({ max: 100 }).withMessage('Full name must be under 100 characters'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['citizen', 'volunteer']).withMessage('Only citizen and volunteer roles are allowed for self-registration'),
  handleValidation,
];

const validateLogin = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation,
];

const COMPLAINT_CATEGORIES = [
  'Government Service Complaint',
  'Project Delay',
  'Poor Work Quality',
  'Public Property Damage',
  'Other',
];
const COMPLAINT_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const COMPLAINT_STATUSES = [
  'Pending', 'Submitted', 'Under Review', 'Assigned', 'In Progress',
  'Resolved', 'Rejected', 'Closed',
];

// ── Public complaint submission validation ─────────────────────────────────────
// Runs AFTER multer has parsed the multipart body, so body() sees the real
// text fields. All checks are defensive — the controller normalises subcity,
// woreda and department against the live master data afterwards.
const validateComplaint = [
  body('title').trim().notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be under 200 characters'),
  body('category').optional({ values: 'falsy' }).trim()
    .isIn(COMPLAINT_CATEGORIES).withMessage('Invalid category'),
  body('description').trim().notEmpty().withMessage('Description is required')
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters'),
  body('region').trim().notEmpty().withMessage('Region is required'),
  body('priority').optional().isIn(COMPLAINT_PRIORITIES).withMessage('Invalid priority'),
  body('subcity').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Subcity too long'),
  body('woredaId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid woreda'),
  body('woredaName').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Woreda name too long'),
  body('department').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Department too long'),
  body('reporterPhone').optional({ values: 'falsy' })
    .matches(/^\+?\d{9,15}$/).withMessage('Please provide a valid phone number'),
  body('reporterEmail').optional({ values: 'falsy' }).isEmail().withMessage('Please provide a valid email'),
  body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  handleValidation,
];

// ── Public complaint status update validation ────────────────────────────────
const validateComplaintStatus = [
  body('status').notEmpty().withMessage('Status is required')
    .isIn(COMPLAINT_STATUSES).withMessage('Invalid status'),
  body('comment').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Comment too long'),
  handleValidation,
];

module.exports = {
  handleValidation,
  validateReport,
  validateVerify,
  validateAssign,
  validateStatusUpdate,
  validateFeedback,
  validateComment,
  validateCitizenVerify,
  validateIdParam,
  validatePagination,
  validateRegister,
  validateLogin,
  validateComplaint,
  validateComplaintStatus,
};
