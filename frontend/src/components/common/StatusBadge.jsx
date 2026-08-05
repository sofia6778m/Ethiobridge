import { useTranslation } from 'react-i18next';

const STATUS_KEYS = {
  Pending:               'dashboard.statusPending',
  Submitted:             'dashboard.statusPending',
  'Under Review':        'dashboard.statusUnderReview',
  Approved:              'dashboard.statusApproved',
  Assigned:              'dashboard.statusAssigned',
  'In Progress':         'dashboard.statusInProgress',
  Accepted:              'dashboard.statusAccepted',
  Completed:             'dashboard.statusCompleted',
  'Citizen Verification':'dashboard.statusCitizenVerification',
  'Waiting for Parts':   'dashboard.statusWaitingParts',
  Resolved:              'dashboard.statusResolved',
  'Forwarded to Subcity':'dashboard.statusForwarded',
  'Resolved by Subcity': 'dashboard.statusResolvedBySubcity',
  Reopened:              'dashboard.statusReopened',
  Active:                'dashboard.statusActive',
  Found:                 'dashboard.statusFound',
  Rejected:              'dashboard.statusRejected',
  Missing:               'dashboard.statusMissing',
  'Under Investigation': 'dashboard.statusUnderInvestigation',
  Closed:                'dashboard.statusClosed',
};

const BADGE_MAP = {
  Pending:               'badge-pending',
  Submitted:             'badge-pending',
  'Under Review':        'badge-review',
  Approved:              'badge-active',
  Assigned:              'badge-review',
  'In Progress':         'badge-progress',
  Accepted:              'badge-active',
  Completed:             'badge-progress',
  'Citizen Verification':'badge-pending',
  'Waiting for Parts':   'badge-pending',
  Resolved:              'badge-resolved',
  'Forwarded to Subcity':'badge-review',
  'Resolved by Subcity': 'badge-resolved',
  Reopened:              'badge-pending',
  Active:                'badge-active',
  Found:                 'badge-resolved',
  Rejected:              'badge-rejected',
  Missing:               'badge-pending',
  'Under Investigation': 'badge-review',
  Closed:                'badge-rejected',
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status;
  return <span className={BADGE_MAP[status] || 'badge-pending'}>{label}</span>;
}
