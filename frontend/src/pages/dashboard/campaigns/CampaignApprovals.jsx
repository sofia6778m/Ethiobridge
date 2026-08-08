import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { getCategory, formatETB, timeAgo, FRAUD_STATUS_STYLES } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';

export default function CampaignApprovals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isGlobal = user?.role === 'admin' || user?.role === 'ADMIN';

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [detail, setDetail] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignAPI.getApprovals({ page, limit: 8 });
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

  const approve = async (c) => {
    setActing(true);
    try {
      await campaignAPI.approve(c._id);
      toast.success(t('campaign.approved'));
      setDetail(null);
      fetchList();
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) { toast.error(t('campaign.needReason')); return; }
    setActing(true);
    try {
      await campaignAPI.reject(rejectTarget._id, { reason: reason.trim() });
      toast.success(t('campaign.rejected'));
      setRejectTarget(null);
      setDetail(null);
      fetchList();
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const flags = detail?.fraudFlags?.filter((f) => !f.dismissed) || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">✅ {t('campaign.approvalsTitle')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.approvalsSubtitle')}</p>

      {loading ? (
        <LoadingSpinner />
      ) : campaigns.length === 0 ? (
        <EmptyState icon="✅" title={t('campaign.noPending')} description={t('campaign.noPendingDesc')} />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const cat = getCategory(c.category);
            const openFlags = (c.fraudFlags || []).filter((f) => !f.dismissed).length;
            return (
              <div key={c._id} className="card p-4 hover:border-primary-200 dark:hover:border-primary-700 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{cat.icon}</span>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{c.title}</h3>
                      {openFlags > 0 && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${FRAUD_STATUS_STYLES.flagged || 'bg-red-100 text-red-700'}`}>
                          🚩 {t('campaign.fraudFlagged', { count: openFlags })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {c.createdByName || '—'} • {c.campaignLevel} • {formatETB(c.goalAmount)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('campaign.submittedAt')} {c.createdAt ? timeAgo(c.createdAt) : '—'} • {[c.location?.subcity, c.location?.woreda].filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setDetail(c)} className="btn-secondary text-sm py-1.5 px-3">{t('campaign.review')}</button>
                    <button onClick={() => setRejectTarget(c)} className="btn-danger text-sm py-1.5 px-3">{t('campaign.reject')}</button>
                    <button onClick={() => approve(c)} disabled={acting} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1.5 px-4 rounded-lg transition-colors">
                      {t('campaign.approve')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Review modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{detail.title}</h2>
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{t('campaign.level')}</p>
                  <p className="font-medium text-gray-700 dark:text-gray-200 capitalize">{detail.campaignLevel}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{t('campaign.goalAmount')}</p>
                  <p className="font-medium text-gray-700 dark:text-gray-200">{formatETB(detail.goalAmount)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{t('campaign.createdByLabel')}</p>
                  <p className="font-medium text-gray-700 dark:text-gray-200">{detail.createdByName || '—'}</p>
                </div>
              </div>

              {flags.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-4 mb-4">
                  <p className="text-xs font-bold text-red-600 mb-2">🚩 {t('campaign.fraudChecks')}</p>
                  <ul className="space-y-1">
                    {flags.map((f) => (
                      <li key={f._id} className="text-sm text-red-700 dark:text-red-300">• {f.reason} <span className="text-xs text-red-400">(+{f.weight})</span></li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4 whitespace-pre-wrap">{detail.description}</p>

              <div className="flex items-center gap-2">
                <button onClick={() => approve(detail)} disabled={acting} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-5 rounded-lg transition-colors">
                  {t('campaign.approve')}
                </button>
                <button onClick={() => { setRejectTarget(detail); }} disabled={acting} className="btn-danger text-sm py-2 px-5">
                  {t('campaign.reject')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      <ConfirmModal
        open={!!rejectTarget}
        title={t('campaign.rejectTitle')}
        message={t('campaign.rejectPrompt')}
        confirmLabel={t('campaign.reject')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        loading={acting}
        onCancel={() => { if (!acting) { setRejectTarget(null); setReason(''); } }}
        onConfirm={reject}
      >
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input-field text-sm mt-3" placeholder={t('campaign.rejectReasonPlaceholder')} />
      </ConfirmModal>
    </div>
  );
}
