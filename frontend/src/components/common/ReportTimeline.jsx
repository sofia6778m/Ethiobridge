import { useTranslation } from 'react-i18next';

const ACTION_CONFIG = {
  created: { icon: '📝', color: 'bg-blue-100 text-blue-600' },
  approved: { icon: '✅', color: 'bg-green-100 text-green-600' },
  rejected: { icon: '❌', color: 'bg-red-100 text-red-600' },
  assigned: { icon: '👤', color: 'bg-purple-100 text-purple-600' },
  status_changed: { icon: '🔄', color: 'bg-yellow-100 text-yellow-600' },
  work_started: { icon: '🔧', color: 'bg-orange-100 text-orange-600' },
  work_completed: { icon: '🎉', color: 'bg-green-100 text-green-600' },
  citizen_verified: { icon: '👍', color: 'bg-green-100 text-green-600' },
  citizen_rejected: { icon: '👎', color: 'bg-red-100 text-red-600' },
  reopened: { icon: '🔁', color: 'bg-amber-100 text-amber-600' },
  comment_added: { icon: '💬', color: 'bg-gray-100 text-gray-600' },
  media_uploaded: { icon: '📷', color: 'bg-indigo-100 text-indigo-600' },
  feedback_added: { icon: '⭐', color: 'bg-yellow-100 text-yellow-600' },
  forwarded: { icon: '➡️', color: 'bg-blue-100 text-blue-600' },
  received: { icon: '📥', color: 'bg-teal-100 text-teal-600' },
  resolved_at_level: { icon: '✅', color: 'bg-green-100 text-green-600' },
  accepted: { icon: '👍', color: 'bg-green-100 text-green-600' },
  officer_assigned: { icon: '👤', color: 'bg-purple-100 text-purple-600' },
  technician_assigned: { icon: '🔧', color: 'bg-cyan-100 text-cyan-600' },
  officer_accepted: { icon: '✅', color: 'bg-green-100 text-green-600' },
  technician_work_state: { icon: '🛠️', color: 'bg-orange-100 text-orange-600' },
  verified: { icon: '✅', color: 'bg-green-100 text-green-600' },
  rework_required: { icon: '🔁', color: 'bg-rose-100 text-rose-600' },
  closed: { icon: '🔒', color: 'bg-gray-100 text-gray-600' },
  escalated_to_subcity: { icon: '⬆️', color: 'bg-orange-100 text-orange-600' },
  escalated_to_subcity_admin: { icon: '🚨', color: 'bg-red-100 text-red-600' },
  note_added: { icon: '📌', color: 'bg-gray-100 text-gray-600' },
  info_requested: { icon: '❓', color: 'bg-amber-100 text-amber-600' },
  waiting_parts: { icon: '📦', color: 'bg-orange-100 text-orange-600' },
  forwarded_to_subcity: { icon: '➡️', color: 'bg-blue-100 text-blue-600' },
  resolved_by_subcity: { icon: '✅', color: 'bg-green-100 text-green-600' },
};

export default function ReportTimeline({ timeline = [] }) {
  const { t } = useTranslation();

  if (!timeline.length) return null;

  const sorted = [...timeline].reverse();

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('dashboard.timelineHistory')}</h3>
      <div className="relative ml-4">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
        {sorted.map((event, i) => {
          const config = ACTION_CONFIG[event.action] || ACTION_CONFIG.status_changed;
          return (
            <div key={event._id || i} className="relative pl-8 pb-5 last:pb-0">
              <div className={`absolute left-[-7px] top-0 w-4 h-4 rounded-full ${config.color} flex items-center justify-center text-[10px] border-2 border-white z-10`}>
                {config.icon}
              </div>
              <div className="bg-white border border-gray-100 rounded-lg p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-800">{event.description}</p>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {new Date(event.createdAt || event.updatedAt).toLocaleString()}
                  </span>
                </div>
                {event.note && <p className="text-xs text-gray-500 mt-1">{event.note}</p>}
                {event.previousStatus && event.newStatus && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                    <span>{event.previousStatus}</span>
                    <span>→</span>
                    <span className="font-medium text-gray-600">{event.newStatus}</span>
                  </div>
                )}
                {event.performedByName && (
                  <p className="text-xs text-gray-400 mt-1">
                    {event.performedByName} ({event.performedByRole})
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
