import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { campaignAPI } from '../../services/api';
import { getCategory, progressPct, formatETB, timeAgo, STATUS_STYLES } from '../../utils/campaignMeta';
import { useCitizenGuard } from '../../utils/roleGuard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import DonateModal from '../../components/campaigns/DonateModal';

export default function PublicCampaignDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const requireCitizen = useCitizenGuard();
  const [campaign, setCampaign] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [donateOpen, setDonateOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    campaignAPI.getOne(id)
      .then((res) => {
        setCampaign(res.data?.data?.campaign || null);
        setUpdates(res.data?.data?.updates || []);
        setProofs(res.data?.data?.proofs || []);
      })
      .catch((e) => toast.error(e.response?.data?.message || t('campaign.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  useEffect(() => {
    if (!isAuthenticated || !id) return;
    campaignAPI.getSaved({ limit: 50 })
      .then((res) => {
        const list = res.data?.data?.campaigns || [];
        setSaved(list.some((c) => c._id === id));
      })
      .catch(() => { /* silent */ });
  }, [isAuthenticated, id]);

  if (loading) return <LoadingSpinner fullPage />;
  if (!campaign) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('campaign.notFound')}</p>
      </div>
    );
  }

  const cat = getCategory(campaign.category);
  const pct = progressPct(campaign);
  const location = [campaign.location?.subcity, campaign.location?.woreda].filter(Boolean).join(', ') || campaign.location?.region || t('campaign.addisAbaba');

  const handleSave = async () => {
    if (!requireCitizen({ returnUrl: `/campaigns/${id}` })) return;
    try {
      if (saved) await campaignAPI.unSave(id);
      else await campaignAPI.save(id);
      setSaved(!saved);
      toast.success(saved ? t('campaign.removedFromSaved') : t('campaign.savedCampaign'));
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    }
  };

  const handleReport = async () => {
    if (!requireCitizen({ returnUrl: `/campaigns/${id}` })) return;
    const reason = window.prompt(t('campaign.reportPrompt'));
    if (!reason) return;
    setReporting(true);
    try {
      await campaignAPI.report(id, { reason });
      toast.success(t('campaign.reportSubmitted'));
    } catch (e) {
      toast.error(e.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setReporting(false);
    }
  };

  const handleDonateSuccess = () => {
    campaignAPI.getOne(id).then((res) => setCampaign(res.data?.data?.campaign));
  };

  return (
    <div className="min-h-[60vh]">
      <section className="relative overflow-hidden">
        {campaign.image && (
          <img src={campaign.image} alt="" className="w-full h-64 sm:h-80 object-cover" />
        )}
        {!campaign.image && (
          <div className="w-full h-64 sm:h-80 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-8xl">{cat.icon}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 w-full">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs font-semibold bg-black/50 text-white px-2.5 py-1 rounded-full">{cat.icon} {cat.label}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[campaign.status] || ''}`}>{campaign.status}</span>
            </div>
            <h1 className="text-3xl font-bold text-white drop-shadow">{campaign.title}</h1>
            <p className="text-white/80 text-sm mt-1">📍 {location} • {campaign.campaignLevel} campaign</p>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="card p-5 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">{formatETB(campaign.raisedAmount)}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('campaign.raisedOfGoal', { amount: formatETB(campaign.goalAmount) })}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {campaign.status === 'active' && (
                <button onClick={() => setDonateOpen(true)} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors">
                  💝 {t('campaign.donateNow')}
                </button>
              )}
              <button onClick={handleSave} className="btn-secondary text-sm py-2.5 px-4">
                {saved ? '🔖 ' : '🤍 '}{saved ? t('campaign.saved') : t('campaign.saveCampaign')}
              </button>
              <button onClick={handleReport} disabled={reporting} className="btn-secondary text-sm py-2.5 px-4 text-red-600">
                🚩 {t('campaign.reportCampaign')}
              </button>
            </div>
          </div>
          <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-gradient-to-r from-primary-600 to-primary-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span>{t('campaign.percentRaised', { pct })}</span>
            {campaign.endDate && <span>⏳ {t('campaign.endsOn')} {new Date(campaign.endDate).toLocaleDateString()}</span>}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">{t('campaign.aboutCampaign')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.description}</p>
          </div>

          {updates.length > 0 && (
            <div className="card p-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">📣 {t('campaign.updates')}</h2>
              <div className="space-y-4">
                {updates.map((u) => (
                  <div key={u._id} className="border-l-2 border-primary-200 dark:border-primary-800 pl-4">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="font-semibold text-gray-600 dark:text-gray-300">{u.authorName}</span>
                      <span>•</span>
                      <span>{timeAgo(u.createdAt)}</span>
                    </div>
                    {u.title && <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm mt-1">{u.title}</p>}
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">{u.message}</p>
                    {u.images?.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {u.images.map((img, i) => (
                          <img key={i} src={img} alt="" className="w-24 h-20 object-cover rounded-lg" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">🏛️ {t('campaign.organizedBy')}</h2>
            <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
              {campaign.createdBy?.fullName || campaign.createdByName || '—'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{campaign.createdByRole || ''}</p>
            {campaign.createdAt && (
              <p className="text-xs text-gray-400 mt-2">{t('campaign.startedOn')} {new Date(campaign.createdAt).toLocaleDateString()}</p>
            )}
          </div>

          {proofs.length > 0 && (
            <div className="card p-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">✅ {t('campaign.verifiedProof')}</h2>
              <div className="grid grid-cols-3 gap-2">
                {proofs.map((p) => (
                  <div key={p._id} className="text-center">
                    {p.files?.[0] ? (
                      <a href={p.files[0]} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={p.files[0]} alt="" className="w-full h-20 object-cover rounded-lg" />
                      </a>
                    ) : (
                      <div className="w-full h-20 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-2xl">📄</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <DonateModal campaign={campaign} open={donateOpen} onClose={() => setDonateOpen(false)} onSuccess={handleDonateSuccess} />
    </div>
  );
}
