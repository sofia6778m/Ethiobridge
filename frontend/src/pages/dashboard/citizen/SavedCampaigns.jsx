import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaBookmark, FaHeart } from 'react-icons/fa';
import { campaignAPI } from '../../../services/api';
import CampaignCard from '../../../components/common/CampaignCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function SavedCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await campaignAPI.getSavedCampaigns();
        setCampaigns(res.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Saved Campaigns</h2>
        <p className="text-sm text-gray-500">Campaigns you've bookmarked</p>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 card">
          <FaBookmark className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg text-gray-500 dark:text-gray-400">No saved campaigns</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Save campaigns to come back to them later</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((c) => (
            <CampaignCard key={c._id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
