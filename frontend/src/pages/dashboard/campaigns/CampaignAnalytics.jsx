import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import { CAMPAIGN_STATUSES, CAMPAIGN_LEVELS, CAMPAIGN_CATEGORIES, getCategory, formatETB } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function CampaignAnalytics() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignAPI.getAnalytics()
      .then((res) => setData(res.data?.data))
      .catch((e) => toast.error(e.response?.data?.message || t('campaign.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <LoadingSpinner />;

  const byStatus = data?.byStatus || {};
  const byLevel = data?.byLevel || {};
  const byCategory = data?.byCategory || {};
  const statusTotal = CAMPAIGN_STATUSES.reduce((acc, s) => acc + (byStatus[s] || 0), 0) || 1;
  const levelTotal = CAMPAIGN_LEVELS.reduce((acc, l) => acc + (byLevel[l] || 0), 0) || 1;
  const catTotal = Object.values(byCategory).reduce((a, b) => a + (b || 0), 0) || 1;

  const cards = [
    { icon: '🎗️', label: t('campaign.totalCampaigns'), value: data?.total ?? 0, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' },
    { icon: '🚀', label: t('campaign.activeCampaigns'), value: data?.active ?? 0, color: 'bg-green-50 dark:bg-green-900/20 text-green-600' },
    { icon: '⏳', label: t('campaign.pendingApprovals'), value: data?.pending ?? 0, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' },
    { icon: '💰', label: t('campaign.totalRaised'), value: formatETB(data?.totalRaised ?? 0), color: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">📊 {t('campaign.analyticsTitle')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.analyticsSubtitle')}</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="card p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${c.color}`}>{c.icon}</div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">{t('campaign.byStatus')}</h2>
          <div className="space-y-3">
            {CAMPAIGN_STATUSES.map((s) => (
              <div key={s}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="capitalize text-gray-600 dark:text-gray-300">{s}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{byStatus[s] || 0}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${((byStatus[s] || 0) / statusTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">{t('campaign.byLevel')}</h2>
          <div className="space-y-3">
            {CAMPAIGN_LEVELS.map((l) => (
              <div key={l}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="capitalize text-gray-600 dark:text-gray-300">{l}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{byLevel[l] || 0}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${((byLevel[l] || 0) / levelTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('campaign.avgProgress')}</p>
            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{data?.averageProgress ?? 0}%</p>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">{t('campaign.byCategory')}</h2>
          <div className="space-y-3">
            {CAMPAIGN_CATEGORIES.map((c) => {
              const count = byCategory[c.value] || 0;
              return (
                <div key={c.value}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-300">{c.icon} {c.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{count}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${(count / catTotal) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
