import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { donationAPI } from '../../../services/api';
import { DONATION_STATUSES, PAYMENT_METHODS, formatETB, timeAgo } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';

const STATUS_DOT = {
  pending: 'bg-amber-500',
  verified: 'bg-green-500',
  failed: 'bg-red-500',
  refunded: 'bg-gray-400',
};

export default function CampaignDonations() {
  const { t } = useTranslation();

  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [busy, setBusy] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchDonations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (filter.status) params.status = filter.status;
      if (filter.type) params.type = filter.type;
      const res = await donationAPI.getAll(params);
      setDonations(res.data?.data?.donations || []);
      setPages(res.data?.data?.pages || 1);
      setTotal(res.data?.data?.total || 0);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || t('campaign.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, filter, t]);

  useEffect(() => { fetchDonations(); }, [fetchDonations]);

  const decide = async () => {
    if (!actionTarget) return;
    setActing(true);
    try {
      await donationAPI.verify(actionTarget._id, { status: actionTarget.decision, note });
      toast.success(t('campaign.donationUpdated'));
      setActionTarget(null);
      setNote('');
      fetchDonations();
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await donationAPI.exportDonations('csv');
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `donations-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t('campaign.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const donorName = (d) => (d.anon ? t('campaign.anonymous') : d.donorName || d.donor?.fullName || d.donor?.email || '—');

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">💝 {t('campaign.donationsTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{total} {t('campaign.totalDonations')}</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-secondary text-sm py-2 px-4 shrink-0">
          📤 {exporting ? t('common.exporting') : t('campaign.export')}
        </button>
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={filter.status} onChange={(e) => { setFilter((p) => ({ ...p, status: e.target.value })); setPage(1); }} className="input-field w-auto text-sm">
            <option value="">{t('campaign.allStatuses')}</option>
            {DONATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select value={filter.type} onChange={(e) => { setFilter((p) => ({ ...p, type: e.target.value })); setPage(1); }} className="input-field w-auto text-sm">
            <option value="">{t('campaign.allTypes')}</option>
            <option value="money">💵 {t('campaign.money')}</option>
            <option value="in_kind">📦 {t('campaign.inKind')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : donations.length === 0 ? (
        <EmptyState icon="💝" title={t('campaign.noDonations')} description={t('campaign.noDonationsDesc')} />
      ) : (
        <div className="space-y-3">
          {donations.map((d) => (
            <div key={d._id} className="card p-4 flex items-center gap-4 flex-wrap">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[d.status] || 'bg-gray-300'} shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    {d.type === 'money' ? '💵' : '📦'} {formatETB(d.amount)}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{d.donationRef}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300">{d.status}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {donorName(d)} • {t('campaign.to')} “{d.campaign?.title || t('campaign.unknownCampaign')}” • {timeAgo(d.createdAt)}
                </p>
                {d.type === 'in_kind' && d.description && <p className="text-xs text-gray-400 mt-0.5">{d.description}</p>}
                {d.note && <p className="text-xs text-gray-400 mt-0.5 italic">“{d.note}”</p>}
              </div>
              {d.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => { setActionTarget({ ...d, decision: 'verified' }); setNote(''); }} disabled={busy === d._id} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1.5 px-4 rounded-lg transition-colors">
                    {t('campaign.verify')}
                  </button>
                  <button onClick={() => { setActionTarget({ ...d, decision: 'failed' }); setNote(''); }} disabled={busy === d._id} className="btn-danger text-sm py-1.5 px-4">
                    {t('campaign.fail')}
                  </button>
                  <button onClick={() => { setActionTarget({ ...d, decision: 'refunded' }); setNote(''); }} disabled={busy === d._id} className="btn-secondary text-sm py-1.5 px-4">
                    {t('campaign.refund')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      <ConfirmModal
        open={!!actionTarget}
        title={actionTarget?.decision === 'verified' ? t('campaign.verifyDonation') : t('campaign.setDonation', { status: actionTarget?.decision })}
        message={t('campaign.decidePrompt')}
        confirmLabel={actionTarget?.decision === 'verified' ? t('campaign.verify') : actionTarget?.decision}
        cancelLabel={t('common.cancel')}
        tone={actionTarget?.decision === 'verified' ? 'primary' : 'danger'}
        loading={acting}
        onCancel={() => { if (!acting) { setActionTarget(null); setNote(''); } }}
        onConfirm={decide}
      >
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field text-sm mt-3" placeholder={t('campaign.verificationNote')} />
      </ConfirmModal>
    </div>
  );
}
