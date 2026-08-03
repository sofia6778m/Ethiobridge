export const STATUS_COLORS = {
  'Submitted': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'In Review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Assigned': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'In Progress': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Completed': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Forwarded to Subcity': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Escalated': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Resolved': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Rejected': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Closed': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export const PRIORITY_COLORS = {
  Low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  High: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const LEVEL_COLORS = {
  Woreda: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  Subcity: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

export const fmtShortDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export const isClosed = (status) => ['Resolved', 'Rejected', 'Closed'].includes(status);
