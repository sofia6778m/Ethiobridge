import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { alertAPI } from '../../services/api';

const CATEGORY_ICONS = {
  flood: '🌊',
  rainfall: '🌧️',
  road_closure: '🚧',
  health: '🏥',
  power_outage: '⚡',
};

const SEVERITY_STYLES = {
  Critical: {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    border: 'border-red-500/30 dark:border-red-500/40',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    pulse: 'animate-pulse',
  },
  Warning: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    border: 'border-amber-500/30 dark:border-amber-500/40',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    pulse: '',
  },
  Info: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    border: 'border-blue-500/30 dark:border-blue-500/40',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    pulse: '',
  },
};

export default function AlertBanner() {
  const [alerts, setAlerts] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  const sortAlerts = useCallback((list) => {
    return list.sort((a, b) => {
      const sevOrder = { Critical: 0, Warning: 1, Info: 2 };
      return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3)
        || new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await alertAPI.getActive({ limit: 10, status: 'active' });
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
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('alert:new', (newAlert) => {
      setAlerts(prev => {
        const exists = prev.some(a => a._id === newAlert._id);
        if (exists) return prev;
        return sortAlerts([newAlert, ...prev]);
      });
    });

    socket.on('alert:statusUpdate', (update) => {
      if (update.status !== 'active') {
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

  const criticalCount = alerts.filter(a => a.severity === 'Critical').length;

  return (
    <section className="py-6 bg-white dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full bg-red-500 ${criticalCount > 0 ? 'animate-pulse' : ''}`} />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="text-xl">📢</span>
              Active Public Alerts
            </h2>
            <span className="text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2.5 py-0.5 rounded-full">
              {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'}
            </span>
          </div>
        </div>

        {/* Alert Cards */}
        <div className="space-y-3">
          {alerts.map(alert => {
            const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.Info;
            const icon = CATEGORY_ICONS[alert.category] || '📢';
            const isExpanded = expanded === alert._id;
            const location = [alert.region, alert.zone, alert.woreda].filter(Boolean).join(', ');

            return (
              <div key={alert._id}
                className={`rounded-xl border ${sev.border} ${sev.bg} overflow-hidden transition-all duration-200`}>
                {/* Collapsed Header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : alert._id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot} ${sev.pulse}`} />
                  <span className="text-xl shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{alert.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sev.badge}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span>📍 {location}</span>
                      <span>•</span>
                      <span>{new Date(alert.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 animate-fade-in">
                    <div className="border-t border-gray-200/50 dark:border-gray-600/50 pt-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mb-3">
                        {alert.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                        {alert.publishedByName && <span>Published by {alert.publishedByName}</span>}
                        <span>{new Date(alert.createdAt).toLocaleString()}</span>
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
