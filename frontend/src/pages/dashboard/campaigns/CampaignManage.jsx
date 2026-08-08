import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import { CAMPAIGN_STATUSES, CAMPAIGN_LEVELS, CAMPAIGN_CATEGORIES, STATUS_STYLES, getCategory, formatETB, timeAgo, isExpired, displayStatus, canDeleteCampaign, deleteBlockReason } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import CampaignCard from '../../../components/campaigns/CampaignCard';

// Role-scoped campaign list shared by the subcity / woreda / admin / government
// dashboards. The backend scopes the results by the logged-in manager.
export default function CampaignManage({ basePath, createPath, editPath }) {
  const { t } = useTranslation();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ status: '', level: '', category: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [acting, setActing] = useState(false);
  // Campaign whose delete was refused: { campaign, key, options } from the
  // client-side check, or { campaign, backendMessage } from a 403 response.
  const [blockedDelete, setBlockedDelete] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 9 };
      if (filter.status) params.status = filter.status;
      if (filter.level) params.level = filter.level;
      if (filter.category) params.category = filter.category;
      const res = await campaignAPI.manage(params);
      setCampaigns(res.data?.data?.campaigns || []);
      setPages(res.data?.data?.pages || 1);
      setTotal(res.data?.data?.total || 0);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || t('campaign.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, filter, t]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // Live sync: join the socket room of every campaign in the list and refetch
  // whenever a campaign is created/updated/deleted by anyone, so the dashboard
  // stays in sync without a manual refresh.
  const { on, emit } = useSocket() || {};
  const fetchRef = useRef(fetchCampaigns);
  fetchRef.current = fetchCampaigns;

  useEffect(() => {
    if (!on) return;
    const events = ['campaign:new', 'campaign:updated', 'campaign:statusUpdate', 'campaign:deleted'];
    const cleanups = events.map((e) => on(e, () => fetchRef.current()));
    return () => cleanups.forEach((off) => off && off());
  }, [on]);

  useEffect(() => {
    if (!emit || !campaigns.length) return;
    campaigns.forEach((c) => emit('join', c._id));
  }, [emit, campaigns]);

  const openDetail = async (c) => {
    setSelected(c);
    setDetailLoading(true);
    setDetail(null);
    try {
      const [upd, prf] = await Promise.all([campaignAPI.getUpdates(c._id), campaignAPI.getProofs(c._id)]);
      setDetail({
        updates: upd.data?.data?.updates || [],
        proofs: prf.data?.data?.proofs || [],
      });
    } catch {
      setDetail({ updates: [], proofs: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const runAction = async () => {
    if (!actionTarget) return;
    setActing(true);
    try {
      if (actionType === 'delete') {
        // Delete removes the card from the list immediately (no refresh) and
        // only refetches afterwards to re-sync counters. On failure the
        // campaign stays visible and the error is surfaced.
        await campaignAPI.remove(actionTarget._id);
        setCampaigns((prev) => prev.filter((c) => c._id !== actionTarget._id));
        setTotal((prev) => Math.max(0, prev - 1));
        setSelected(null);
        setActionTarget(null);
        toast.success(t('campaign.deleted'));
        fetchCampaigns();
      } else {
        if (actionType === 'submit') await campaignAPI.submit(actionTarget._id);
        else if (actionType === 'activate') await campaignAPI.activate(actionTarget._id);
        else if (actionType === 'complete') await campaignAPI.complete(actionTarget._id, { note: actionNote });
        else if (actionType === 'suspend') await campaignAPI.suspend(actionTarget._id, { reason: actionNote });
        else if (actionType === 'restore') await campaignAPI.restore(actionTarget._id);
        toast.success(t('campaign.actionDone'));
        setActionTarget(null);
        setSelected(null);
        fetchCampaigns();
      }
    } catch (e) {
      if (actionType === 'delete' && e.response?.status === 403) {
        // The backend refused the delete (e.g. the campaign went live or
        // received donations since the list loaded). Surface the exact reason
        // in the blocked modal instead of a generic toast.
        setBlockedDelete({
          campaign: actionTarget,
          backendMessage: e.response.data?.message || t('campaign.deleteBlockedActive'),
        });
      } else {
        toast.error(e.response?.data?.message || t('campaign.actionFailed'));
      }
    } finally {
      setActing(false);
    }
  };

  const verifyProof = async (proof, status) => {
    const note = window.prompt(t('campaign.verificationNote'), '');
    setBusy(proof._id);
    try {
      if (status === 'verified') await campaignAPI.verifyProof(selected._id, proof._id, { note });
      else await campaignAPI.rejectProof(selected._id, proof._id, { note });
      toast.success(t('campaign.proofUpdated'));
      openDetail(selected);
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  const promptAction = (campaign, type) => {
    setActionTarget(campaign);
    setActionType(type);
    setActionNote('');
  };

  // Delete is only allowed for dead campaigns with zero donations. When it is
  // blocked, open the reason modal instead of asking for a confirmation that
  // would fail anyway.
  const promptDelete = (campaign) => {
    if (canDeleteCampaign(campaign)) {
      promptAction(campaign, 'delete');
      return;
    }
    const reason = deleteBlockReason(campaign);
    setBlockedDelete({ campaign, key: reason.key, options: reason.options });
  };

  const actionTitle = {
    submit: t('campaign.submitForApproval'),
    activate: t('campaign.activateCampaign'),
    delete: t('campaign.deleteCampaign'),
    complete: t('campaign.completeCampaign'),
    suspend: t('campaign.suspendCampaign'),
    restore: t('campaign.restoreCampaign'),
  }[actionType] || '';

  const needsNote = ['complete', 'suspend'].includes(actionType);
  const isDelete = actionType === 'delete';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🎗️ {t('campaign.manageTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} {t('campaign.totalCampaigns')}</p>
        </div>
        {createPath && (
          <Link to={createPath} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm inline-flex items-center gap-2 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('campaign.createNew')}
          </Link>
        )}
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={filter.status} onChange={(e) => { setFilter((p) => ({ ...p, status: e.target.value })); setPage(1); }} className="input-field w-auto text-sm">
            <option value="">{t('campaign.allStatuses')}</option>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select value={filter.level} onChange={(e) => { setFilter((p) => ({ ...p, level: e.target.value })); setPage(1); }} className="input-field w-auto text-sm">
            <option value="">{t('campaign.allLevels')}</option>
            {CAMPAIGN_LEVELS.map((l) => (
              <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
          <select value={filter.category} onChange={(e) => { setFilter((p) => ({ ...p, category: e.target.value })); setPage(1); }} className="input-field w-auto text-sm">
            <option value="">{t('campaign.allCategories')}</option>
            {CAMPAIGN_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : campaigns.length === 0 ? (
        <EmptyState icon="🎗️" title={t('campaign.noCampaigns')} description={t('campaign.noCampaignsManage')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const expired = isExpired(c);
            const status = displayStatus(c);
            return (
              <CampaignCard key={c._id} campaign={c} to={`${basePath}/${c._id}`} displayStatus={status} showDonate={false} onClick={(e) => { e.preventDefault(); openDetail(c); }}>
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button onClick={() => openDetail(c)} className="btn-secondary text-xs py-1.5 px-3">{t('campaign.view')}</button>
                  {['draft', 'rejected', 'suspended'].includes(c.status) && (
                    <button onClick={() => promptAction(c, 'submit')} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors">
                      {t('campaign.submit')}
                    </button>
                  )}
                  {['draft', 'rejected', 'cancelled', 'suspended'].includes(c.status) && (
                    <button onClick={() => promptAction(c, 'activate')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors">
                      ▶ {t('campaign.activate')}
                    </button>
                  )}
                  {c.status === 'active' && !expired && (
                    <button onClick={() => promptAction(c, 'complete')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors">
                      {t('campaign.complete')}
                    </button>
                  )}
                  {editPath && ['draft', 'rejected', 'suspended', 'pending', 'active'].includes(c.status) && !expired && (
                    <Link to={`${editPath}?edit=${c._id}`} className="btn-secondary text-xs py-1.5 px-3">✏️ {t('campaign.edit')}</Link>
                  )}
                  {/* Suspend is available for every active campaign (including
                      expired ones) so the owner can stop it and then delete it. */}
                  {c.status === 'active' && (
                    <button onClick={() => promptAction(c, 'suspend')} className="btn-danger text-xs py-1.5 px-3">⏸ {t('campaign.suspend')}</button>
                  )}
                  {/* Delete only applies to dead campaigns with zero donations.
                      Blocked campaigns open the reason modal instead. */}
                  <button
                    onClick={() => promptDelete(c)}
                    disabled={acting}
                    className="btn-danger text-xs py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!canDeleteCampaign(c) ? t('campaign.deleteBlockedHint') : undefined}
                  >
                    🗑 {t('campaign.delete')}
                  </button>
                  {c.status === 'suspended' && (
                    <button onClick={() => promptAction(c, 'restore')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors">
                      {t('campaign.restore')}
                    </button>
                  )}
                </div>
              </CampaignCard>
            );
          })}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCategory(selected.category).icon}</span>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selected.title}</h2>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[selected.status] || ''}`}>{selected.status}</span>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{t('campaign.raisedLabel')}</p>
                  <p className="font-bold text-primary-600 dark:text-primary-400">{formatETB(selected.raisedAmount)} / {formatETB(selected.goalAmount)}</p>
                  <p className="text-xs text-gray-400">{t('campaign.inKindPledges')}: {selected.inKindPledges || 0}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{t('campaign.location')}</p>
                  <p className="font-medium text-gray-700 dark:text-gray-200">
                    {[selected.location?.subcity, selected.location?.woreda].filter(Boolean).join(', ') || '—'}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{selected.createdByName} • {selected.createdByRole}</p>
                </div>
              </div>

              {selected.rejectReason && (
                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3 mb-4">
                  <p className="text-xs font-bold text-red-600 mb-1">{t('campaign.rejectReason')}</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{selected.rejectReason}</p>
                </div>
              )}
              {selected.suspension?.reason && (
                <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-3 mb-4">
                  <p className="text-xs font-bold text-orange-600 mb-1">{t('campaign.suspensionReason')}</p>
                  <p className="text-sm text-orange-700 dark:text-orange-300">{selected.suspension.reason}</p>
                </div>
              )}

              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">{selected.description}</p>

              <div className="space-y-4">
                {detailLoading ? (
                  <LoadingSpinner />
                ) : detail && (
                  <>
                    {detail.updates.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">📣 {t('campaign.updates')}</h3>
                        <div className="space-y-2">
                          {detail.updates.map((u) => (
                            <div key={u._id} className="border-l-2 border-primary-200 dark:border-primary-800 pl-3">
                              <p className="text-xs text-gray-400">{u.authorName} • {timeAgo(u.createdAt)}</p>
                              <p className="text-sm text-gray-700 dark:text-gray-200">{u.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {detail.proofs.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">✅ {t('campaign.proofs')}</h3>
                        <div className="space-y-2">
                          {detail.proofs.map((p) => (
                            <div key={p._id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{p.title || p.type}</p>
                                <p className="text-xs text-gray-400">{p.uploaderName} • {timeAgo(p.createdAt)} • {p.status}</p>
                              </div>
                              {p.status === 'pending' && (
                                <div className="flex gap-1.5 shrink-0">
                                  <button onClick={() => verifyProof(p, 'verified')} disabled={busy === p._id} className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg">
                                    {t('campaign.verify')}
                                  </button>
                                  <button onClick={() => verifyProof(p, 'rejected')} disabled={busy === p._id} className="btn-danger text-xs py-1.5 px-3">
                                    {t('campaign.reject')}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {detail.updates.length === 0 && detail.proofs.length === 0 && (
                      <p className="text-sm text-gray-400">{t('campaign.noUpdatesOrProofs')}</p>
                    )}
                  </>
                )}
              </div>

              {/* Campaign actions — kept consistent with the card buttons. */}
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
                {selected.status === 'active' && (
                  <button
                    onClick={() => { setSelected(null); promptAction(selected, 'suspend'); }}
                    className="btn-danger text-xs py-1.5 px-3"
                  >
                    ⏸ {t('campaign.suspend')}
                  </button>
                )}
                {selected.status === 'active' && !isExpired(selected) && (
                  <button
                    onClick={() => { setSelected(null); promptAction(selected, 'complete'); }}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                  >
                    {t('campaign.complete')}
                  </button>
                )}
                {selected.status === 'suspended' && (
                  <button
                    onClick={() => { setSelected(null); promptAction(selected, 'restore'); }}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                  >
                    {t('campaign.restore')}
                  </button>
                )}
                <button
                  onClick={() => { setSelected(null); promptDelete(selected); }}
                  disabled={acting}
                  className="btn-danger text-xs py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🗑 {t('campaign.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action prompt modal */}
      <ConfirmModal
        open={!!actionTarget}
        title={actionTitle}
        message={isDelete ? t('campaign.deleteWarning') : needsNote ? t('campaign.notePrompt') : undefined}
        confirmLabel={t('campaign.confirm')}
        cancelLabel={t('common.cancel')}
        tone={actionType === 'suspend' || actionType === 'delete' ? 'danger' : 'primary'}
        loading={acting}
        onCancel={() => { if (!acting) { setActionTarget(null); setActionType(null); setActionNote(''); } }}
        onConfirm={runAction}
      >
        {needsNote && (
          <textarea
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            className="input-field text-sm mt-3"
            rows={3}
            placeholder={t('campaign.notePlaceholder')}
          />
        )}
      </ConfirmModal>

      {/* Blocked-delete modal: shows the exact reason the campaign cannot be
          removed. No confirm button — the only way forward is to suspend /
          cancel it first. */}
      <ConfirmModal
        open={!!blockedDelete}
        title={t('campaign.deleteBlockedTitle')}
        message={blockedDelete?.backendMessage || (blockedDelete ? t(blockedDelete.key, blockedDelete.options || {}) : '')}
        cancelLabel={t('common.close')}
        onCancel={() => setBlockedDelete(null)}
      />
    </div>
  );
}
