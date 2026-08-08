import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCategory, progressPct, formatETB, STATUS_STYLES } from '../../utils/campaignMeta';

// Reusable campaign card used across the public site and every dashboard.
// `to` overrides the default link target so manager views can point at their
// own detail/action routes.
export default function CampaignCard({ campaign, to, showStatus = true, showDonate = true, children }) {
  const { t } = useTranslation();
  if (!campaign) return null;

  const cat = getCategory(campaign.category);
  const target = to || `/campaigns/${campaign._id}`;
  const pct = progressPct(campaign);
  const location = [campaign.location?.subcity, campaign.location?.woreda].filter(Boolean).join(', ');
  const daysLeft = campaign.endDate ? Math.ceil((new Date(campaign.endDate).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="card overflow-hidden hover:shadow-lg transition-shadow group flex flex-col">
      <Link to={target} className="block relative">
        {campaign.image ? (
          <img src={campaign.image} alt={campaign.title} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-6xl bg-primary-50 dark:bg-primary-900/20">
            {cat.icon}
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="text-[10px] font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full backdrop-blur">
            {cat.icon} {cat.label}
          </span>
          {showStatus && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[campaign.status] || STATUS_STYLES.draft}`}>
              {campaign.status}
            </span>
          )}
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col">
        <Link to={target} className="font-semibold text-gray-800 dark:text-gray-200 line-clamp-1 group-hover:text-primary-600 transition-colors">
          {campaign.title}
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
          <span>📍</span>
          {location || campaign.location?.region || t('campaign.addisAbaba')}
        </p>
        {campaign.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mt-2">{campaign.description}</p>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-primary-600 dark:text-primary-400">{formatETB(campaign.raisedAmount)}</span>
            <span className="text-gray-400">{t('campaign.ofGoal', { amount: formatETB(campaign.goalAmount) })}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary-600 to-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
            <span>{t('campaign.percentRaised', { pct })}</span>
            {campaign.endDate && daysLeft !== null && (
              <span className={daysLeft < 0 ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'}>
                ⏳ {daysLeft < 0 ? t('campaign.ended') : t('campaign.daysLeft', { days: daysLeft })}
              </span>
            )}
          </div>
        </div>

        {campaign.createdByName && (
          <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
            <span>👤</span>{campaign.createdByName}
          </p>
        )}

        {children}

        {showDonate && campaign.status === 'active' && (
          <Link
            to={`/campaigns/${campaign._id}`}
            className="mt-3 block text-center bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            💖 {t('campaign.donateNow')}
          </Link>
        )}
      </div>
    </div>
  );
}
