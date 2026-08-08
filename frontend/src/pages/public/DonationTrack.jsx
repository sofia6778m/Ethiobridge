import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { donationAPI } from '../../services/api';
import { formatETB } from '../../utils/campaignMeta';
import LoadingSpinner from '../../components/common/LoadingSpinner';

// Public donation receipt lookup — no login required. The tracking reference
// (e.g. DON-2026-000123) acts as the proof of payment.
export default function DonationTrack() {
  const { t } = useTranslation();
  const { ref } = useParams();
  const [query, setQuery] = useState(ref || '');
  const [donation, setDonation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (value) => {
    const refValue = String(value || '').trim();
    if (!refValue) { setError(t('campaign.trackEmpty')); return; }
    setLoading(true);
    setError('');
    setDonation(null);
    try {
      const res = await donationAPI.trackByRef(refValue);
      setDonation(res.data?.data?.donation || null);
    } catch (err) {
      setError(err.response?.data?.message || t('campaign.trackNotFound'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ref) search(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  const locationText = donation?.campaign?.location
    ? [donation.campaign.location.subcity, donation.campaign.location.woreda].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">🧾 {t('campaign.trackTitle')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('campaign.trackSubtitle')}</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); search(query); }}
        className="max-w-lg mx-auto mb-10 flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="DON-2026-000123"
          className="input-field flex-1 text-center font-mono uppercase"
        />
        <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5 shrink-0">
          {loading ? t('common.working') : t('campaign.track')}
        </button>
      </form>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="card text-center py-10 max-w-lg mx-auto">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
          <p className="text-xs text-gray-400 mt-3">{t('campaign.trackNotFoundHint')}</p>
        </div>
      )}

      {donation && (
        <div className="card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{t('campaign.receiptRef')}</p>
              <p className="font-mono text-lg font-bold text-primary-600 dark:text-primary-400">{donation.donationRef}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize self-start ${
              donation.status === 'verified'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            }`}>
              {donation.status}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Row label={t('campaign.donorName')} value={donation.donorName} />
            <Row label={t('campaign.donorPhone')} value={donation.donorPhone} />
            {donation.type === 'money' ? (
              <>
                <Row label={t('campaign.amount')} value={donation.amount ? formatETB(donation.amount) : '—'} />
                <Row label={t('campaign.paymentMethod')} value={donation.paymentMethod} capitalize />
              </>
            ) : (
              <Row label={t('campaign.pledgedItems')} value={donation.items?.length ? donation.items.map((it) => `${it.name} ×${it.quantity}`).join(', ') : '—'} />
            )}
            <Row label={t('campaign.date')} value={donation.createdAt ? new Date(donation.createdAt).toLocaleDateString() : '—'} />
            {donation.message && <Row label={t('campaign.message')} value={donation.message} />}
          </div>

          {donation.campaign && (
            <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{t('campaign.campaign')}</p>
                <Link to={`/campaigns/${donation.campaign._id}`} className="font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400">
                  {donation.campaign.title}
                </Link>
                {locationText && <p className="text-xs text-gray-400 mt-0.5">{locationText}</p>}
              </div>
              <Link to={`/campaigns/${donation.campaign._id}`} className="btn-secondary text-sm py-2 px-4 shrink-0">
                {t('campaign.viewCampaign')}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, capitalize }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-gray-800 dark:text-gray-200 mt-0.5 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
}
