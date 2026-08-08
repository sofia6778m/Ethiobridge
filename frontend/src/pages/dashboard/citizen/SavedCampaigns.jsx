import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import CampaignCard from '../../../components/campaigns/CampaignCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';

export default function SavedCampaigns() {
  const { t } = useTranslation();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(null);

  const fetchSaved = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignAPI.getSaved({ page, limit: 9 });
      setCampaigns(res.data?.data?.campaigns || []);
      setPages(res.data?.data?.pages || 1);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || t('campaign.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const remove = async (id) => {
    setBusy(id);
    try {
      await campaignAPI.unSave(id);
      toast.success(t('campaign.removedFromSaved'));
      setCampaigns((prev) => prev.filter((c) => c._id !== id));
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">🔖 {t('campaign.savedTitle')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.savedSubtitle')}</p>

      {loading ? (
        <LoadingSpinner />
      ) : campaigns.length === 0 ? (
        <EmptyState icon="🔖" title={t('campaign.noSaved')} description={t('campaign.noSavedDesc')}>
          <Link to="/campaigns" className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2 px-5 rounded-lg transition-colors mt-4 inline-block">
            {t('campaign.browseCampaigns')}
          </Link>
        </EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <CampaignCard key={c._id} campaign={c} to={`/campaigns/${c._id}`}>
              <button
                onClick={() => remove(c._id)}
                disabled={busy === c._id}
                className="mt-4 btn-danger text-xs py-1.5 px-3"
              >
                {busy === c._id ? t('common.saving') : `❌ ${t('campaign.removeSaved')}`}
              </button>
            </CampaignCard>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}
