import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { alertAPI } from '../../services/api';
import { getCategory, getSeverity, SEVERITY_STYLES, locationString } from '../../utils/alertMeta';

export default function AlertBanner() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  const sortAlerts = useCallback((list) => {
    return [...list].sort((a, b) => {
      const sevOrder = { emergency: 0, warning: 1, information: 2 };
      return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3)
        || new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await alertAPI.getActive({ limit: 8 });
      const list = res.data?.data?.alerts || [];
      setAlerts(sortAlerts(list));
    } catch (e) {
      console.error('Failed to load alerts:', e);
    } finally {
      setLoading(false);
    }
  }, [sortAlerts]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Public socket connection for real-time alert updates
  const isLive = (s) => s === 'published' || s === 'active';

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('alert:new', (newAlert) => {
      if (!isLive(newAlert.status)) return;
      setAlerts(prev => {
        const exists = prev.some(a => a._id === newAlert._id);
        if (exists) return prev;
        return sortAlerts([newAlert, ...prev]).slice(0, 8);
      });
    });

    socket.on('alert:statusUpdate', (update) => {
      if (!isLive(update.status)) {
        setAlerts(prev => prev.filter(a => a._id !== update._id));
      }
    });

    socket.on('alert:deleted', (update) => {
      setAlerts(prev => prev.filter(a => a._id !== update._id));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sortAlerts]);

  if (loading || alerts.length === 0) return null;

  const emergencyCount = alerts.filter(a => a.severity === 'emergency').length;

  return (
    <section className="py-6 bg-white dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full bg-red-500 ${emergencyCount > 0 ? 'animate-pulse' : ''}`} />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="text-xl">📢</span>
              {t('alert.activeTitle')}
            </h2>
            <span className="text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2.5 py-0.5 rounded-full">
              {alerts.length} {alerts.length === 1 ? t('alert.alert') : t('alert.alerts')}
            </span>
          </div>
          <Link to="/alerts" className="text-sm font-medium text-primary-600 hover:underline shrink-0">
            {t('alert.viewAll')} →
          </Link>
        </div>

        <div className="space-y-3">
          {alerts.map(alert => {
            const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.information;
            const cat = getCategory(alert.category);
            const sevMeta = getSeverity(alert.severity);
            const isExpanded = expanded === alert._id;

            return (
              <div key={alert._id}
                className={`rounded-xl border ${sev.border} ${sev.bg} overflow-hidden transition-all duration-200`}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : alert._id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot} ${sev.pulse}`} />
                  <span className="text-xl shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{alert.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sev.badge}`}>
                        {sevMeta.icon} {sevMeta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span>📍 {locationString(alert)}</span>
                      <span>•</span>
                      <span>{new Date(alert.publishedAt || alert.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 animate-fade-in">
                    <div className="border-t border-gray-200/50 dark:border-gray-600/50 pt-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mb-3">
                        {alert.description}
                      </p>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                          {alert.createdByName && <span>By {alert.createdByName}</span>}
                          <span>{new Date(alert.publishedAt || alert.createdAt).toLocaleString()}</span>
                        </div>
                        <Link to={`/alerts/${alert._id}`}
                          className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                          {t('alert.details')} →
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
