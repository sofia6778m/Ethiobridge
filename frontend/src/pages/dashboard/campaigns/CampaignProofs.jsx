import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import { formatETB, timeAgo } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';

export default function CampaignProofs() {
  const { t } = useTranslation();

  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);
  const [preview, setPreview] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignAPI.getProofQueue({ page, limit: 8 });
      setProofs(res.data?.data?.proofs || []);
      setPages(res.data?.data?.pages || 1);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || t('campaign.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const decide = async () => {
    if (!actionTarget) return;
    setActing(true);
    try {
      const campaignId = actionTarget.campaign?._id || actionTarget.campaign;
      if (actionTarget.decision === 'verified') await campaignAPI.verifyProof(campaignId, actionTarget._id, { note });
      else await campaignAPI.rejectProof(campaignId, actionTarget._id, { note });
      toast.success(t('campaign.proofUpdated'));
      setActionTarget(null);
      setNote('');
      fetchQueue();
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const firstFile = (p) => p.files?.[0];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">🔎 {t('campaign.proofQueueTitle')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.proofQueueSubtitle')}</p>

      {loading ? (
        <LoadingSpinner />
      ) : proofs.length === 0 ? (
        <EmptyState icon="✅" title={t('campaign.noProofs')} description={t('campaign.noProofsDesc')} />
      ) : (
        <div className="space-y-3">
          {proofs.map((p) => (
            <div key={p._id} className="card p-4 flex items-center gap-4 flex-wrap">
              {firstFile(p) ? (
                <button onClick={() => setPreview(firstFile(p))} className="shrink-0">
                  <img src={firstFile(p)} alt="" className="w-16 h-16 object-cover rounded-xl" />
                </button>
              ) : (
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-2xl shrink-0">📄</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{p.campaign?.title || t('campaign.unknownCampaign')}</h3>
                  {p.campaign?.campaignLevel && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 capitalize">
                      {p.campaign.campaignLevel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.title || p.type} • {p.uploaderName || '—'} • {timeAgo(p.createdAt)}
                </p>
                {p.campaign?.location && (
                  <p className="text-xs text-gray-400">
                    {[p.campaign.location.subcity, p.campaign.location.woreda].filter(Boolean).join(', ') || '—'}
                  </p>
                )}
                {p.amount && <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 mt-0.5">{formatETB(p.amount)}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {firstFile(p) && (
                  <button onClick={() => setPreview(firstFile(p))} className="btn-secondary text-sm py-1.5 px-3">{t('campaign.viewFile')}</button>
                )}
                <button onClick={() => { setActionTarget({ ...p, decision: 'verified' }); setNote(''); }} disabled={busy === p._id} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1.5 px-4 rounded-lg transition-colors">
                  {t('campaign.verify')}
                </button>
                <button onClick={() => { setActionTarget({ ...p, decision: 'rejected' }); setNote(''); }} disabled={busy === p._id} className="btn-danger text-sm py-1.5 px-4">
                  {t('campaign.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      <ConfirmModal
        open={!!actionTarget}
        title={actionTarget?.decision === 'verified' ? t('campaign.verifyProof') : t('campaign.rejectProof')}
        message={t('campaign.decidePrompt')}
        confirmLabel={actionTarget?.decision === 'verified' ? t('campaign.verify') : t('campaign.reject')}
        cancelLabel={t('common.cancel')}
        tone={actionTarget?.decision === 'verified' ? 'primary' : 'danger'}
        loading={acting}
        onCancel={() => { if (!acting) { setActionTarget(null); setNote(''); } }}
        onConfirm={decide}
      >
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field text-sm mt-3" placeholder={t('campaign.verificationNote')} />
      </ConfirmModal>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <img src={preview} alt="" className="relative max-w-3xl max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
