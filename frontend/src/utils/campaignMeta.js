// Shared frontend metadata for the Campaigns & Fundraising module.
// Mirrors backend/src/models/Campaign.js and Donation.js so the UI and API
// never drift.

export const CAMPAIGN_STATUSES = ['draft', 'pending', 'active', 'rejected', 'completed', 'suspended', 'cancelled'];
export const CAMPAIGN_LEVELS = ['subcity', 'woreda'];
export const LIVE_STATUSES = ['active', 'completed'];

export const CAMPAIGN_CATEGORIES = [
  { value: 'health',          icon: '🏥', label: 'Health' },
  { value: 'education',       icon: '🎓', label: 'Education' },
  { value: 'emergency_relief', icon: '🚨', label: 'Emergency Relief' },
  { value: 'community',       icon: '🤝', label: 'Community' },
  { value: 'infrastructure',  icon: '🏗️', label: 'Infrastructure' },
  { value: 'other',           icon: '📦', label: 'Other' },
];

export const DONATION_STATUSES = ['pending', 'verified', 'failed', 'refunded'];
export const PAYMENT_METHODS = [
  { value: 'telebirr',    icon: '📱', label: 'TeleBirr' },
  { value: 'chapa',       icon: '💳', label: 'Chapa' },
  { value: 'cbe_birr',    icon: '🏦', label: 'CBE Birr' },
  { value: 'cash',        icon: '💵', label: 'Cash' },
  { value: 'bank_transfer', icon: '🏛️', label: 'Bank Transfer' },
];

export const getCategory = (value) =>
  CAMPAIGN_CATEGORIES.find((c) => c.value === value) || { value: value || 'other', icon: '📦', label: value || 'Other' };

export const getPaymentMethod = (value) =>
  PAYMENT_METHODS.find((m) => m.value === value) || { value, icon: '💳', label: value || '—' };

// A campaign is "expired" once its end date has passed, even when its stored
// status is still `active`. Expired campaigns never surface on the public site
// and are shown as "expired" in dashboards.
export const isExpired = (campaign) =>
  Boolean(campaign?.endDate && new Date(campaign.endDate).getTime() < Date.now());

export const displayStatus = (campaign) => (isExpired(campaign) ? 'expired' : campaign?.status || '');

// Campaigns that may be hard-deleted: never been live and never received any
// donation. Mirrors DELETABLE_STATUSES in campaignController.js — anything
// else must be suspended / cancelled first and even then only with zero
// donations.
export const DELETABLE_STATUSES = ['draft', 'rejected', 'suspended', 'cancelled'];

// Whether a campaign is safe to delete (dead status AND zero donations).
export const canDeleteCampaign = (campaign) =>
  Boolean(campaign) &&
  DELETABLE_STATUSES.includes(campaign.status) &&
  (campaign.donationCount ?? 0) === 0;

// Localized reason a campaign cannot be deleted, for the blocked-delete modal.
// Returns { key, options } for i18n (mirrors the backend 403 messages) or null
// when deletion is permitted.
export const deleteBlockReason = (campaign) => {
  if (!campaign) return { key: 'campaign.deleteBlockedStatus', options: { status: '' } };
  if ((campaign.donationCount ?? 0) > 0) return { key: 'campaign.deleteBlockedDonations' };
  if (campaign.status === 'active') return { key: 'campaign.deleteBlockedActive' };
  return { key: 'campaign.deleteBlockedStatus', options: { status: campaign.status } };
};

export const progressPct = (campaign) => {
  if (!campaign || !campaign.goalAmount) return 0;
  return Math.min(100, Math.round(((campaign.raisedAmount || 0) / campaign.goalAmount) * 100));
};

export const formatETB = (n) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'ETB', maximumFractionDigits: 0 }).format(Number(n) || 0);

export const timeAgo = (date) => {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

export const STATUS_STYLES = {
  draft:     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  pending:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  active:    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rejected:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  completed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  suspended: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  cancelled: 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  expired:   'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

export const DONATION_STATUS_STYLES = {
  pending:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  verified: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  failed:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  refunded: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

export const PROOF_STATUS_STYLES = {
  pending:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  verified: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

export const FRAUD_STATUS_STYLES = {
  open:      'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  dismissed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  confirmed: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
};
