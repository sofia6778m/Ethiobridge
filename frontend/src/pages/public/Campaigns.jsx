import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { campaignAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { CAMPAIGN_CATEGORIES, CAMPAIGN_LEVELS } from '../../utils/campaignMeta';
import CampaignCard from '../../components/campaigns/CampaignCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Pagination from '../../components/common/Pagination';

export default function PublicCampaigns() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const category = searchParams.get('category') || '';
  const level = searchParams.get('level') || '';
  const sort = searchParams.get('sort') || '';
  const q = searchParams.get('q') || '';

  const applyFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    const pageNum = parseInt(searchParams.get('page') || '1', 10);
    setLoading(true);
    try {
      const params = { page: pageNum, limit: 9, sort };
      if (category) params.category = category;
      if (level) params.level = level;
      if (q) params.q = q;
      const res = await campaignAPI.browse(params);
      setCampaigns(res.data?.data?.campaigns || []);
      setPages(res.data?.data?.pages || 1);
      setTotal(res.data?.data?.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [searchParams, category, level, sort, q]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  // Live refresh: reload the list when campaigns change anywhere so the
  // fundraising page stays in sync without a manual refresh.
  const { on } = useSocket() || {};
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!on) return;
    const events = ['campaign:new', 'campaign:updated', 'campaign:statusUpdate', 'campaign:deleted'];
    const cleanups = events.map((e) => on(e, () => loadRef.current()));
    return () => cleanups.forEach((off) => off && off());
  }, [on]);

  const changePage = (p) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-[60vh]">
      <section className="bg-gradient-to-r from-primary-800 to-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <span className="text-4xl">🎗️</span> {t('campaign.pageTitle')}
              </h1>
              <p className="text-primary-100 mt-2 max-w-2xl">{t('campaign.pageDesc')}</p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-3 rounded-xl text-sm">
              <span className="font-semibold">{total}</span>
              <span className="text-primary-100">{t('campaign.totalCampaigns')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-5">
        <div className="card p-4 shadow-lg border-t-4 border-primary-500">
          <div className="flex flex-wrap gap-3 items-center">
            <select value={category} onChange={(e) => applyFilter('category', e.target.value)} className="input-field w-auto text-sm">
              <option value="">{t('campaign.allCategories')}</option>
              {CAMPAIGN_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
            <select value={level} onChange={(e) => applyFilter('level', e.target.value)} className="input-field w-auto text-sm">
              <option value="">{t('campaign.allLevels')}</option>
              {CAMPAIGN_LEVELS.map((l) => (
                <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => applyFilter('sort', e.target.value)} className="input-field w-auto text-sm">
              <option value="">{t('campaign.sortNewest')}</option>
              <option value="goal">{t('campaign.sortHighestGoal')}</option>
            </select>
            <input
              value={q}
              onChange={(e) => applyFilter('q', e.target.value)}
              placeholder={t('campaign.searchPlaceholder')}
              className="input-field text-sm flex-1 min-w-[200px]"
            />
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <LoadingSpinner />
        ) : campaigns.length === 0 ? (
          <EmptyState icon="🎗️" title={t('campaign.noCampaigns')} description={t('campaign.noCampaignsDesc')} />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((c) => (
                <CampaignCard key={c._id} campaign={c} />
              ))}
            </div>
            <div className="mt-8">
              <Pagination page={parseInt(searchParams.get('page') || '1', 10)} pages={pages} onPageChange={changePage} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
