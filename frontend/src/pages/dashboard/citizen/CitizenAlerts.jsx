import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { alertAPI } from '../../../services/api';
import { ALERT_CATEGORIES } from '../../../utils/alertMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import AlertCard from '../../../components/common/AlertCard';

export default function CitizenAlerts() {
  const { t } = useTranslation();
  const [subs, setSubs] = useState({ enabled: true, categories: [], channels: { inApp: true, email: false, sms: false, push: false } });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, alertRes] = await Promise.all([
        alertAPI.getSubscriptions(),
        alertAPI.getMyAlerts({ limit: 6 }),
      ]);
      setSubs(subRes.data?.data?.subscriptions || { enabled: true, categories: [], channels: { inApp: true, email: false, sms: false, push: false } });
      setAlerts(alertRes.data?.data?.alerts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleCategory = (value) => {
    setSubs((p) => {
      const current = p.categories || [];
      // When subscribed to everything, clicking a chip opts OUT of just that
      // category (i.e. subscribes to all others).
      if (current.length === 0) {
        return { ...p, categories: ALERT_CATEGORIES.map((c) => c.value).filter((c) => c !== value) };
      }
      const next = current.includes(value) ? current.filter((c) => c !== value) : [...current, value];
      return { ...p, categories: next };
    });
  };

  const setChannel = (key, val) => {
    setSubs((p) => ({ ...p, channels: { ...p.channels, [key]: val } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await alertAPI.updateSubscriptions(subs);
      toast.success('Alert preferences saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const allCategories = subs.categories?.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📢 {t('alert.myAlerts')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('alert.subscriptionDesc')}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm disabled:opacity-50">
          {saving ? 'Saving...' : t('alert.savePrefs')}
        </button>
      </div>

      {/* Master toggle */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">🔔 {t('alert.enableAlerts')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('alert.enableAlertsDesc')}</p>
          </div>
          <button
            onClick={() => setSubs((p) => ({ ...p, enabled: !p.enabled }))}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${subs.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${subs.enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="mt-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400">
          🚨 {t('alert.emergencyAlways')}
        </div>
      </div>

      {/* Channels */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">📱 {t('alert.deliveryChannels')}</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { key: 'inApp', icon: '🔔', label: t('alert.channel.inApp') },
            { key: 'email', icon: '✉️', label: t('alert.channel.email') },
            { key: 'sms', icon: '💬', label: t('alert.channel.sms') },
            { key: 'push', icon: '📲', label: t('alert.channel.push') },
          ].map((ch) => (
            <label key={ch.key} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${subs.channels[ch.key] ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
              <input type="checkbox" checked={!!subs.channels[ch.key]} onChange={(e) => setChannel(ch.key, e.target.checked)} className="accent-primary-600 w-4 h-4" />
              <span className="text-lg">{ch.icon}</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{ch.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">📂 {t('alert.categoryPrefs')}</h3>
          <div className="flex gap-2">
            <button onClick={() => setSubs((p) => ({ ...p, categories: [] }))} className="text-xs text-primary-600 hover:underline">All</button>
            <span className="text-xs text-gray-300">|</span>
            <button onClick={() => setSubs((p) => ({ ...p, categories: ALERT_CATEGORIES.map((c) => c.value) }))} className="text-xs text-primary-600 hover:underline">None</button>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {allCategories ? 'You are subscribed to all categories.' : `Subscribed to ${subs.categories.length} of ${ALERT_CATEGORIES.length} categories.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {ALERT_CATEGORIES.map((c) => {
            const selected = allCategories || subs.categories.includes(c.value);
            return (
              <button key={c.value} onClick={() => toggleCategory(c.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${selected ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                {c.icon} {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live alerts preview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">🔴 {t('alert.activeNow')}</h3>
          <Link to="/alerts" className="text-sm text-primary-600 hover:underline">{t('alert.viewAll')} →</Link>
        </div>
        {alerts.length === 0 ? (
          <div className="card p-6 text-center text-sm text-gray-400 dark:text-gray-500">{t('alert.noAlerts')}</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {alerts.map((a) => <AlertCard key={a._id} alert={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}
