import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { alertAPI } from '../../services/api';
import {
  getCategory,
  getSeverity,
  SEVERITY_STYLES,
  getCategoryBadge,
  SAFETY_INSTRUCTIONS,
  locationString,
} from '../../utils/alertMeta';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function PublicAlertDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    alertAPI.getOne(id)
      .then((res) => setAlert(res.data?.data?.alert || null))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner fullPage />;

  if (notFound || !alert) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl mb-4">📢</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('alert.notFound')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{t('alert.notFoundDesc')}</p>
          <Link to="/alerts" className="btn-primary text-sm">{t('alert.backToList')}</Link>
        </div>
      </div>
    );
  }

  const cat = getCategory(alert.category);
  const sev = getSeverity(alert.severity);
  const sevStyle = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.information;
  const safety = alert.safetyInstructions?.length
    ? alert.safetyInstructions
    : SAFETY_INSTRUCTIONS[alert.category] || [];

  return (
    <div className="min-h-[60vh]">
      {/* Emergency strip */}
      {alert.severity === 'emergency' && (
        <div className="bg-red-600 text-white text-center py-2.5 px-4 text-sm font-semibold animate-pulse">
          🚨 {t('alert.emergencyNotice')}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          <Link to="/" className="hover:text-primary-600">{t('nav.home')}</Link>
          <span className="mx-2">/</span>
          <Link to="/alerts" className="hover:text-primary-600">{t('alert.pageTitle')}</Link>
        </nav>

        <div className={`rounded-2xl border ${sevStyle.border} ${sevStyle.bg} overflow-hidden`}>
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${sevStyle.badge}`}>
                {sev.icon} {sev.label}
              </span>
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${getCategoryBadge(alert.category)}`}>
                {cat.icon} {cat.label}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {alert.title}
            </h1>

            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-5 flex-wrap">
              <span>📍 {locationString(alert)}</span>
              <span>•</span>
              <span>{new Date(alert.publishedAt || alert.createdAt).toLocaleString()}</span>
              {alert.expiresAt && (
                <>
                  <span>•</span>
                  <span>{t('alert.expires', { date: new Date(alert.expiresAt).toLocaleString() })}</span>
                </>
              )}
            </div>

            <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-5 mb-6">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {alert.description}
              </p>
            </div>

            {/* Safety instructions */}
            {safety.length > 0 && (
              <div className="mb-6">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="text-xl">🛡️</span> {t('alert.safetySteps')}
                </h3>
                <ol className="space-y-2">
                  {safety.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex items-center justify-between pt-5 border-t border-gray-200/60 dark:border-gray-700/60 text-xs text-gray-400 dark:text-gray-500 flex-wrap gap-2">
              <span>
                {t('alert.publishedBy')}: <span className="font-medium text-gray-600 dark:text-gray-300">{alert.createdByName || t('alert.gov')}</span>
                {alert.createdByOrg ? ` (${alert.createdByOrg})` : ''}
              </span>
              <span>👁 {alert.views || 0} {t('alert.views')}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Link to="/alerts" className="btn-secondary text-sm">← {t('alert.backToList')}</Link>
        </div>
      </div>
    </div>
  );
}
