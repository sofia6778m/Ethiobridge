import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hierarchyAPI, campaignAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { formatETB } from '../../../utils/campaignMeta';
import StatCard from '../../../components/common/StatCard';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

export default function SubcityOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [campaignStats, setCampaignStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, cRes] = await Promise.all([
        hierarchyAPI.getSubcityStats(),
        campaignAPI.getDashboardStats().catch(() => null),
      ]);
      setStats(hRes.data.data);
      setCampaignStats(cRes?.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <LoadingSpinner />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          {stats.subcity} Subcity — Overview
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {user?.fullName} · Subcity Admin
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon="📥" label="Complaints" value={stats.complaints} color="bg-blue-100" iconColor="text-blue-600" />
        <StatCard icon="🕒" label="Pending" value={stats.pendingComplaints} color="bg-amber-100" iconColor="text-amber-600" />
        <StatCard icon="✅" label="Resolved" value={stats.resolvedComplaints} color="bg-green-100" iconColor="text-green-600" />
      </div>

      {campaignStats && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">🎗️ Fundraising</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon="🎗️" label="Campaigns" value={campaignStats.totalCampaigns} color="bg-amber-100" iconColor="text-amber-600" />
              <StatCard icon="✅" label="Active" value={campaignStats.activeCampaigns} color="bg-green-100" iconColor="text-green-600" />
              <StatCard icon="💌" label="Donations" value={campaignStats.totalDonations} color="bg-primary-100" iconColor="text-primary-600" />
              <StatCard icon="💰" label="Raised" value={formatETB(campaignStats.totalDonationAmount)} color="bg-teal-100" iconColor="text-teal-600" />
            </div>
          </div>

          {campaignStats.recentDonors?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🕒 Recent Donors</h3>
              <div className="space-y-2">
                {campaignStats.recentDonors.map((d) => (
                  <div key={d._id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                        {d.isAnonymous ? 'Anonymous' : d.donorName || 'Donor'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{d.campaign?.title}</p>
                    </div>
                    <span className="font-semibold text-primary-600 dark:text-primary-400 shrink-0">{formatETB(d.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <button
          onClick={() => navigate('municipal-complaints')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xl">🏛️</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Municipal Complaints</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review all complaints across the subcity's woredas.
          </p>
        </button>

        <button
          onClick={() => navigate('governance-complaints')}
          className="card p-6 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xl">⚖️</span>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Governance Complaints</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review and respond to service governance complaints.
          </p>
        </button>
      </div>
    </div>
  );
}
