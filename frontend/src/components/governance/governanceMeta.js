export const URGENCY_LEVELS = [
  { value: 'Low', emoji: '🟢', desc: 'Minor — can wait' },
  { value: 'Medium', emoji: '🟡', desc: 'Needs attention soon' },
  { value: 'High', emoji: '🔴', desc: 'Urgent / ongoing harm' },
];

export const ADMIN_ACTIONS = [
  'Warning',
  'Written Warning',
  'Service Correction Order',
  'Training Required',
  'Disciplinary Referral',
  'Anti-Corruption Referral',
  'Close Without Action',
];

export const STATUSES = [
  'Submitted',
  'Under Review',
  'Need More Information',
  'In Progress',
  'Investigation in Progress',
  'Awaiting Woreda Response',
  'Action Taken',
  'Resolved',
  'Rejected',
  'Reopened',
  'Escalated',
  'Closed',
];

export const CLOSED_STATUSES = ['Resolved', 'Rejected', 'Closed'];

export const ACTIVE_STATUSES = [
  'Submitted',
  'Under Review',
  'Need More Information',
  'In Progress',
  'Investigation in Progress',
  'Awaiting Woreda Response',
  'Action Taken',
  'Reopened',
];

export const STATUS_COLORS = {
  'Submitted': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Under Review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Need More Information': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'In Progress': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Investigation in Progress': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Awaiting Woreda Response': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Action Taken': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Resolved': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Rejected': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Reopened': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  'Escalated': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Closed': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export const REQUEST_STATUS_COLORS = {
  Pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Responded: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Cancelled: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

export const fmtShortDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export const isClosed = (status) => CLOSED_STATUSES.includes(status);
