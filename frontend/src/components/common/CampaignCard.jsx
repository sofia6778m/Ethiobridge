import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaHeart, FaShare, FaEye, FaUsers, FaMapMarkerAlt, FaCalendarAlt,
  FaClock, FaBookmark, FaRegBookmark, FaBuilding, FaHandHoldingHeart,
} from 'react-icons/fa';
import { campaignAPI } from '../../services/api';
import DonationModal from './DonationModal';
import { toast } from 'react-toastify';

const typeColors = {
  infrastructure: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  emergency: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  general: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  ngo: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  government: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

const typeLabels = {
  infrastructure: 'Infrastructure',
  emergency: 'Emergency',
  general: 'General',
  ngo: 'NGO',
  government: 'Government',
};

const statusConfig = {
  pending: { label: 'Pending', class: 'badge-pending' },
  active: { label: 'Active', class: 'badge-active' },
  completed: { label: 'Completed', class: 'badge-resolved' },
  closed: { label: 'Closed', class: 'badge-rejected' },
};

export default function CampaignCard({ campaign, showActions = true }) {
  const [showDonation, setShowDonation] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const progress = campaign.goalAmount > 0
    ? Math.min((campaign.raisedAmount / campaign.goalAmount) * 100, 100)
    : 0;

  const daysLeft = Math.max(0, Math.ceil((new Date(campaign.endDate) - new Date()) / (1000 * 60 * 60 * 24)));
  const remaining = Math.max(0, (campaign.goalAmount || 0) - (campaign.raisedAmount || 0));
  const creatorName = campaign.createdBy?.organizationName || campaign.createdBy?.fullName || 'Unknown';
  const creatorRole = campaign.createdBy?.role || 'organization';

  const handleShare = async (e) => {
    e.preventDefault();
    const url = `${window.location.origin}/fundraising/${campaign._id}`;
    if (navigator.share) {
      try { await navigator.share({ title: campaign.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  const handleBookmark = async (e) => {
    e.preventDefault();
    if (!localStorage.getItem('zda_token')) {
      toast.error('Please login to save campaigns');
      return;
    }
    setSaving(true);
    try {
      const res = await campaignAPI.saveCampaign(campaign._id);
      setSaved(res.data.saved);
      toast.success(res.data.saved ? 'Campaign saved!' : 'Campaign removed from saved');
    } catch (err) {
      toast.error('Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.4 }}
        className="card hover:shadow-xl transition-all duration-300 group overflow-hidden relative"
      >
        {/* Image */}
        <div className="relative h-48 -mx-6 -mt-6 mb-4 overflow-hidden">
          <img
            src={campaign.image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&q=80'}
            alt={campaign.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm ${typeColors[campaign.campaignType] || typeColors.general}`}>
              {typeLabels[campaign.campaignType] || campaign.campaignType}
            </span>
            <span className={`${statusConfig[campaign.status]?.class} text-xs backdrop-blur-sm`}>
              {statusConfig[campaign.status]?.label || campaign.status}
            </span>
          </div>
          {campaign.isFeatured && (
            <div className="absolute top-3 left-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg">
              ⭐ Featured
            </div>
          )}
          <button
            onClick={handleBookmark}
            disabled={saving}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors"
          >
            {saved ? <FaBookmark className="text-yellow-400 text-sm" /> : <FaRegBookmark className="text-white text-sm" />}
          </button>
        </div>

        {/* Creator & Meta */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xs font-bold shrink-0">
            {creatorName[0]}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {creatorRole === 'ngo' ? '🤝 ' : '🏛️ '}{creatorName}
          </span>
        </div>

        {/* Title */}
        <Link to={`/fundraising/${campaign._id}`}>
          <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-1.5 line-clamp-1 hover:text-primary-600 transition-colors">
            {campaign.title}
          </h3>
        </Link>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2 leading-relaxed">
          {campaign.description}
        </p>

        {/* Location & Dates */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-xs text-gray-400 dark:text-gray-500">
          {campaign.location?.region && (
            <span className="flex items-center gap-1">
              <FaMapMarkerAlt className="shrink-0" />
              {campaign.location.region}{campaign.location.city ? `, ${campaign.location.city}` : ''}
            </span>
          )}
          <span className="flex items-center gap-1">
            <FaCalendarAlt className="shrink-0" />
            {new Date(campaign.startDate).toLocaleDateString()}
          </span>
          {daysLeft > 0 && campaign.status === 'active' && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <FaClock className="shrink-0" />
              {daysLeft}d left
            </span>
          )}
        </div>

        {/* Goal & Raised */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <div>
              <span className="font-bold text-gray-800 dark:text-gray-200">
                {campaign.raisedAmount?.toLocaleString()} <span className="text-gray-400 font-normal">ETB</span>
              </span>
            </div>
            <span className="text-gray-400 text-xs">
              Goal: {campaign.goalAmount?.toLocaleString()} ETB
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${progress}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-primary-500' : 'bg-amber-500'
              }`}
            />
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {Math.round(progress)}%
            </span>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <FaUsers className="shrink-0" /> {campaign.donors || 0}
              </span>
              {campaign.estimatedBeneficiaries && (
                <span className="flex items-center gap-1">
                  <FaHandHoldingHeart className="shrink-0" /> {campaign.estimatedBeneficiaries.toLocaleString()}+ helped
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Remaining Amount */}
        {remaining > 0 && campaign.status === 'active' && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 font-medium bg-amber-50 dark:bg-amber-900/10 px-2 py-1 rounded-lg inline-block">
            Remaining: {remaining.toLocaleString()} ETB
          </p>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 mt-3">
            <button
              onClick={(e) => { e.preventDefault(); setShowDonation(true); }}
              className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <FaHeart className="animate-pulse" /> Donate
            </button>
            <button
              onClick={handleShare}
              className="btn-secondary text-sm py-2.5 px-3.5 rounded-xl"
              title="Share"
            >
              <FaShare />
            </button>
            <Link
              to={`/fundraising/${campaign._id}`}
              className="btn-secondary text-sm py-2.5 px-3.5 rounded-xl"
              title="View Details"
            >
              <FaEye />
            </Link>
          </div>
        )}
      </motion.div>

      {showDonation && (
        <DonationModal
          campaign={campaign}
          onClose={() => setShowDonation(false)}
        />
      )}
    </>
  );
}
