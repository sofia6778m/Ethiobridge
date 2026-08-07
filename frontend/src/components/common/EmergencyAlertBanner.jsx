import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { alertAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { getCategory, locationString } from '../../utils/alertMeta';

// Sticky banner shown while there is at least one ACTIVE emergency alert.
// Listens to the socket so it appears/disappears in real time.
export default function EmergencyAlertBanner() {
  const { t } = useTranslation();
  const { on } = useSocket() || {};
  const [emergencies, setEmergencies] = useState([]);

  const fetchEmergencies = useCallback(async () => {
    try {
      const res = await alertAPI.getActive({ limit: 10, severity: 'emergency' });
      setEmergencies(res.data?.data?.alerts || []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchEmergencies();
  }, [fetchEmergencies]);

  const upsert = useCallback((alert) => {
    if (alert.severity !== 'emergency' || alert.status !== 'active') return;
    setEmergencies((prev) => {
      const exists = prev.some((a) => a._id === alert._id);
      if (exists) return prev;
      return [alert, ...prev];
    });
  }, []);

  useEffect(() => {
    if (!on) return;
    const cleanupNew = on('alert:new', upsert);
    const cleanupStatus = on('alert:statusUpdate', (update) => {
      if (update.severity === 'emergency' && update.status !== 'active') {
        setEmergencies((prev) => prev.filter((a) => a._id !== update._id));
      }
    });
    const cleanupDelete = on('alert:deleted', (update) => {
      setEmergencies((prev) => prev.filter((a) => a._id !== update._id));
    });
    return () => {
      cleanupNew?.();
      cleanupStatus?.();
      cleanupDelete?.();
    };
  }, [on, upsert]);

  if (emergencies.length === 0) return null;

  const primary = emergencies[0];

  return (
    <div className="sticky top-16 z-40 bg-red-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
        <Link to={`/alerts/${primary._id}`} className="font-semibold text-sm hover:underline shrink-0">
          🚨 {t('alert.emergencyBanner')}
        </Link>
        <span className="text-sm text-red-100 min-w-0 truncate flex-1">
          {(getCategory(primary.category) || { icon: '📢' }).icon} {primary.title}
          <span className="hidden sm:inline text-red-200"> — {locationString(primary)}</span>
        </span>
        {emergencies.length > 1 && (
          <Link to="/alerts" className="text-xs bg-red-500 hover:bg-red-400 px-2.5 py-1 rounded-full shrink-0">
            +{emergencies.length - 1} {t('alert.more')}
          </Link>
        )}
      </div>
    </div>
  );
}
