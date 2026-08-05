import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getCategory,
  getSeverity,
  SEVERITY_STYLES,
  STATUS_STYLES,
  getCategoryBadge,
  locationString,
} from '../../utils/alertMeta';

export default function AlertCard({ alert, link = `/alerts/${alert._id}` }) {
  const { t } = useTranslation();
  const cat = getCategory(alert.category);
  const sev = getSeverity(alert.severity);
  const sevStyle = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.information;
  const expiresSoon = alert.expiresAt && new Date(alert.expiresAt) - Date.now() < 24 * 60 * 60 * 1000;

  return (
    <Link
      to={link}
      className={`block rounded-xl border ${sevStyle.border} ${sevStyle.bg} overflow-hidden hover:shadow-lg transition-all duration-200 group`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0 mt-0.5">{cat.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-sm text-gray-800 dark:text-gray-200 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors`}>
                {alert.title}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sevStyle.badge}`}>
                {sev.icon} {sev.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getCategoryBadge(alert.category)}`}>
                {cat.label}
              </span>
              <span>📍 {locationString(alert)}</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 line-clamp-2 leading-relaxed">
          {alert.description}
        </p>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700/60 text-xs text-gray-400 dark:text-gray-500">
          <span>{new Date(alert.publishedAt || alert.createdAt).toLocaleDateString()}</span>
          {alert.expiresAt && (
            <span className={`font-medium ${expiresSoon ? 'text-red-500' : ''}`}>
              {t('alert.expires', { date: new Date(alert.expiresAt).toLocaleDateString() })}
            </span>
          )}
        </div>

        {alert.status && alert.status !== 'active' && (
          <span className={`mt-3 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[alert.status] || ''}`}>
            {alert.status}
          </span>
        )}
      </div>
    </Link>
  );
}
