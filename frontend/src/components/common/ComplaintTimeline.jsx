import { useTranslation } from 'react-i18next';

const ACTION_CONFIG = {
  created: { icon: '📝', color: 'bg-blue-100 text-blue-600' },
  accepted: { icon: '👍', color: 'bg-green-100 text-green-600' },
  rejected: { icon: '❌', color: 'bg-red-100 text-red-600' },
  closed: { icon: '🔒', color: 'bg-gray-100 text-gray-600' },
  reopened: { icon: '🔁', color: 'bg-amber-100 text-amber-600' },
  escalated_to_subcity: { icon: '⬆️', color: 'bg-orange-100 text-orange-600' },
  escalated: { icon: '🚨', color: 'bg-red-100 text-red-600' },
  status_changed: { icon: '🔄', color: 'bg-yellow-100 text-yellow-600' },
  officer_assigned: { icon: '👤', color: 'bg-purple-100 text-purple-600' },
  technician_assigned: { icon: '🔧', color: 'bg-cyan-100 text-cyan-600' },
  assigned: { icon: '👤', color: 'bg-purple-100 text-purple-600' },
  verified: { icon: '✅', color: 'bg-green-100 text-green-600' },
  resolved: { icon: '✅', color: 'bg-green-100 text-green-600' },
  resolved_by_subcity: { icon: '✅', color: 'bg-green-100 text-green-600' },
  note_added: { icon: '📌', color: 'bg-gray-100 text-gray-600' },
  info_requested: { icon: '❓', color: 'bg-amber-100 text-amber-600' },
  request_info: { icon: '❓', color: 'bg-amber-100 text-amber-600' },
  waiting_parts: { icon: '📦', color: 'bg-orange-100 text-orange-600' },
  forwarded_to_subcity: { icon: '➡️', color: 'bg-blue-100 text-blue-600' },
  response_sent: { icon: '💬', color: 'bg-teal-100 text-teal-600' },
  evidence_added: { icon: '📎', color: 'bg-indigo-100 text-indigo-600' },
  request_woreda: { icon: '🤝', color: 'bg-cyan-100 text-cyan-600' },
  woreda_responded: { icon: '📨', color: 'bg-teal-100 text-teal-600' },
  action_recorded: { icon: '🗂️', color: 'bg-violet-100 text-violet-600' },
  document_uploaded: { icon: '📄', color: 'bg-slate-100 text-slate-600' },
  citizen_confirmed: { icon: '⭐', color: 'bg-green-100 text-green-600' },
  comment_added: { icon: '💬', color: 'bg-gray-100 text-gray-600' },
  media_uploaded: { icon: '📷', color: 'bg-indigo-100 text-indigo-600' },
  feedback_added: { icon: '⭐', color: 'bg-yellow-100 text-yellow-600' },
  work_started: { icon: '🔧', color: 'bg-orange-100 text-orange-600' },
  work_completed: { icon: '🎉', color: 'bg-green-100 text-green-600' },
};

/**
 * ComplaintTimeline
 * ─────────────────
 * Renders the unified timeline produced by complaintService.normalizeTimeline.
 * Every entry has { title, description, note, previousStatus, newStatus,
 * performedByName, performedByRole, at } regardless of source type.
 */
export default function ComplaintTimeline({ timeline = [] }) {
  const { t } = useTranslation();

  if (!timeline.length) return null;

  const sorted = [...timeline].reverse();

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('dashboard.timelineHistory')}</h3>
      <div className="relative ml-4">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
        {sorted.map((event, i) => {
          const config = ACTION_CONFIG[event.action] || ACTION_CONFIG.status_changed;
          return (
            <div key={event.id || i} className="relative pl-8 pb-5 last:pb-0">
              <div className={`absolute left-[-7px] top-0 w-4 h-4 rounded-full ${config.color} flex items-center justify-center text-[10px] border-2 border-white dark:border-gray-900 z-10`}>
                {config.icon}
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {event.title || event.description}
                  </p>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(event.at).toLocaleString()}
                  </span>
                </div>
                {event.description && event.title !== event.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{event.description}</p>
                )}
                {event.note && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{event.note}</p>}
                {event.previousStatus && event.newStatus && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                    <span>{event.previousStatus}</span>
                    <span>→</span>
                    <span className="font-medium text-gray-600 dark:text-gray-300">{event.newStatus}</span>
                  </div>
                )}
                {event.performedByName && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {event.performedByName}
                    {event.performedByRole ? ` (${event.performedByRole})` : ''}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
