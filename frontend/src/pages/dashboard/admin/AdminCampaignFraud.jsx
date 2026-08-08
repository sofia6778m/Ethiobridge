import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import { getCategory, FRAUD_STATUS_STYLES, timeAgo } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';

function scoreColor(score) {
  if (score >= 70) return 'bg-red-600';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-green-500';
}

export default function AdminCampaignFraud() {
  const { t } = useTranslation();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [detail, setDetail] = useState(null);
  const [acting, setActing] = useState(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignAPI.getFraudReview({ page, limit: 8 });
      setCampaigns(res.data?.data?.campaigns || []);
      setPages(res.data?.data?.pages || 1);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || t('campaign.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const decide = async (flag, decision) => {
    setActing(flag._id);
    try {
      const note = decision === 'confirmed'
        ? window.prompt(t('campaign.fraudConfirmNote'), '') || ''
        : window.prompt(t('campaign.fraudDismissNote'), '') || '';
      await campaignAPI.reviewFraudFlag(flag._id, { decision, note });
      toast.success(t('campaign.actionDone'));
      const fresh = await campaignAPI.getFraudReview({ page, limit: 8 });
      setCampaigns(fresh.data?.data?.campaigns || []);
      if (detail) {
        const updated = fresh.data?.data?.campaigns?.find((c) => c._id === detail._id);
        if (updated) setDetail(updated);
      }
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setActing(null);
    }
  };

  const openFlags = (c) => (c.fraudFlags || []).filter((f) => f.status === 'open' || f.status === 'confirmed');

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">🕵️ {t('campaign.fraudReviewTitle')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.fraudReviewSubtitle')}</p>

      {loading ? (
        <LoadingSpinner />
      ) : campaigns.length === 0 ? (
        <EmptyState icon="🕵️" title={t('campaign.noFraud')} description={t('campaign.noFraudDesc')} />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const cat = getCategory(c.category);
            const open = openFlags(c);
            return (
              <div key={c._id} className="card p-4 flex items-center gap-4 flex-wrap">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${scoreColor(c.fraudScore)} shrink-0`}>
                  {c.fraudScore}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to="/dashboard/admin/campaigns" className="font-semibold text-gray-900 dark:text-gray-100 text-sm hover:text-primary-600 dark:hover:text-primary-400">
                    {cat.icon} {c.title}
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {open.length} {t('campaign.openFlags')} • {c.createdByName || '—'} • {[c.location?.subcity, c.location?.woreda].filter(Boolean).join(', ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap shrink-0 justify-end">
                  {open.slice(0, 2).map((f) => (
                    <span key={f._id} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${FRAUD_STATUS_STYLES[f.status] || ''}`}>
                      {f.status} (+{f.weight})
                    </span>
                  ))}
                  {open.length > 2 && <span className="text-[10px] text-gray-400">+{open.length - 2}</span>}
                  <button onClick={() => setDetail(c)} className="btn-secondary text-sm py-1.5 px-3 ml-1">{t('campaign.review')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{detail.title}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{detail.createdByName || '—'} • {detail.campaignLevel} • {timeAgo(detail.createdAt)}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${scoreColor(detail.fraudScore)} shrink-0`}>
                  {detail.fraudScore}
                </div>
              </div>

              <div className="space-y-3 mb-4">
                {openFlags(detail).map((f) => (
                  <div key={f._id} className={`rounded-xl p-4 ${f.status === 'confirmed' ? 'bg-red-50 dark:bg-red-900/10' : 'bg-amber-50 dark:bg-amber-900/10'}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{f.reason}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {t('campaign.source')}: {f.source} • +{f.weight} • {f.status}
                        </p>
                        {f.reviewNote && <p className="text-xs text-gray-400 mt-1 italic">“{f.reviewNote}”</p>}
                      </div>
                      {f.status === 'open' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => decide(f, 'confirmed')} disabled={!!acting} className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors">
                            {t('campaign.confirmFlag')}
                          </button>
                          <button onClick={() => decide(f, 'dismissed')} disabled={!!acting} className="btn-secondary text-xs py-1.5 px-3">
                            {t('campaign.dismissFlag')}
                          </button>
                        </div>
                      )}
                      {f.status !== 'open' && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${FRAUD_STATUS_STYLES[f.status] || ''}`}>{f.status}</span>
                      )}
                    </div>
                  </div>
                ))}
                {openFlags(detail).length === 0 && (
                  <p className="text-sm text-gray-400">{t('campaign.noFlagsResolved')}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Link to="/dashboard/admin/campaigns" className="btn-secondary text-sm py-2 px-5">
                  {t('campaign.viewCampaign')}
                </Link>
                <button onClick={() => setDetail(null)} className="btn-secondary text-sm py-2 px-5">{t('common.close')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
