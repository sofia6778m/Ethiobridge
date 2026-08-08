import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { donationAPI } from '../../../services/api';
import { DONATION_STATUSES, formatETB, timeAgo } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';

const STATUS_DOT = {
  pending: 'bg-amber-500',
  verified: 'bg-green-500',
  failed: 'bg-red-500',
  refunded: 'bg-gray-400',
};

export default function MyDonations() {
  const { t } = useTranslation();

  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState('');

  const fetchDonations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (filter) params.status = filter;
      const res = await donationAPI.getMy(params);
      setDonations(res.data?.data?.donations || []);
      setPages(res.data?.data?.pages || 1);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || t('campaign.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, filter, t]);

  useEffect(() => { fetchDonations(); }, [fetchDonations]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">💝 {t('campaign.myDonations')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.myDonationsSubtitle')}</p>

      <div className="card mb-6">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="input-field w-auto text-sm">
          <option value="">{t('campaign.allStatuses')}</option>
          {DONATION_STATUSES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : donations.length === 0 ? (
        <EmptyState icon="💝" title={t('campaign.noMyDonations')} description={t('campaign.noMyDonationsDesc')}>
          <Link to="/campaigns" className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2 px-5 rounded-lg transition-colors mt-4 inline-block">
            {t('campaign.browseCampaigns')}
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {donations.map((d) => (
            <div key={d._id} className="card p-4 flex items-center gap-4 flex-wrap">
              {d.campaign?.image ? (
                <img src={d.campaign.image} alt="" className="w-14 h-14 object-cover rounded-xl shrink-0" />
              ) : (
                <div className="w-14 h-14 bg-primary-50 dark:bg-primary-900/20 rounded-xl flex items-center justify-center text-xl shrink-0">🎗️</div>
              )}
              <div className="min-w-0 flex-1">
                <Link to={`/campaigns/${d.campaign?._id}`} className="font-semibold text-gray-900 dark:text-gray-100 text-sm hover:text-primary-600 dark:hover:text-primary-400">
                  {d.campaign?.title || t('campaign.unknownCampaign')}
                </Link>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="font-semibold text-primary-600 dark:text-primary-400 text-sm">
                    {d.type === 'money' ? '💵' : '📦'} {formatETB(d.amount)}
                  </span>
                  <span className="text-xs text-gray-400">{d.donationRef}</span>
                  <span className="text-xs text-gray-400">• {timeAgo(d.createdAt)}</span>
                </div>
                {d.type === 'in_kind' && d.description && <p className="text-xs text-gray-400 mt-0.5">{d.description}</p>}
                {d.note && <p className="text-xs text-gray-400 mt-0.5 italic">“{d.note}”</p>}
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[d.status] || 'bg-gray-300'}`} />
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}
