import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaHeart, FaUsers, FaMapMarkerAlt, FaCalendarAlt, FaClock, FaShare,
  FaArrowLeft, FaCheckCircle, FaHandHoldingHeart, FaDonate, FaComments,
  FaBullhorn, FaImage, FaRegClock, FaBuilding, FaFire,
} from 'react-icons/fa';
import { campaignAPI } from '../../services/api';
import CampaignCard from '../../components/common/CampaignCard';
import DonationModal from '../../components/common/DonationModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

const typeColors = {
  infrastructure: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  emergency: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  general: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  ngo: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  government: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

export default function FundraisingDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDonation, setShowDonation] = useState(false);
  const [activeSection, setActiveSection] = useState('story');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await campaignAPI.getPublicCampaign(id);
        setCampaign(res.data.data);
        const allRes = await campaignAPI.getPublic({ campaignType: res.data.data.campaignType, limit: 3 });
        setRelated((allRes.data.data || []).filter(c => c._id !== id));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <LoadingSpinner fullPage />;
  if (!campaign) return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">📭</div>
      <p className="text-gray-500 text-lg">Campaign not found</p>
      <Link to="/fundraising" className="btn-primary mt-4 inline-block">Back to Fundraising</Link>
    </div>
  );

  const progress = campaign.goalAmount > 0 ? Math.min((campaign.raisedAmount / campaign.goalAmount) * 100, 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((new Date(campaign.endDate) - new Date()) / (1000 * 60 * 60 * 24)));
  const remaining = Math.max(0, (campaign.goalAmount || 0) - (campaign.raisedAmount || 0));
  const creatorName = campaign.createdBy?.organizationName || campaign.createdBy?.fullName || 'Unknown';
  const creatorRole = campaign.createdBy?.role || 'organization';

  const sections = [
    { id: 'story', label: 'Story', icon: FaBullhorn },
    { id: 'updates', label: 'Updates', icon: FaRegClock },
    { id: 'donors', label: 'Donors', icon: FaDonate },
    { id: 'comments', label: 'Comments', icon: FaComments },
    { id: 'gallery', label: 'Gallery', icon: FaImage },
  ];

  const handleShare = async () => {
    const url = `${window.location.origin}/fundraising/${campaign._id}`;
    if (navigator.share) {
      try { await navigator.share({ title: campaign.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link to="/" className="hover:text-primary-600">Home</Link>
        <span>/</span>
        <Link to="/fundraising" className="hover:text-primary-600">Fundraising</Link>
        <span>/</span>
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[200px]">{campaign.title}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* ===== MAIN CONTENT ===== */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cover Image */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden p-0">
            <div className="relative h-72 sm:h-96">
              <img
                src={campaign.image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&q=80'}
                alt={campaign.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm ${typeColors[campaign.campaignType] || typeColors.general}`}>
                  {campaign.campaignType === 'emergency' ? <><FaFire className="inline mr-1" /> Emergency</> :
                   campaign.campaignType === 'infrastructure' ? <><FaBuilding className="inline mr-1" /> Infrastructure</> : 'General'}
                </span>
                <span className="badge-active text-xs backdrop-blur-sm">{campaign.status}</span>
                {campaign.isFeatured && <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1.5 rounded-full">⭐ Featured</span>}
              </div>
            </div>
          </motion.div>

          {/* Title & Meta */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{campaign.title}</h1>
              <button onClick={handleShare} className="btn-secondary shrink-0 py-2 px-3 text-sm flex items-center gap-1.5">
                <FaShare /> Share
              </button>
            </div>

            {/* Creator */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold shrink-0">
                {creatorName[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{creatorName}</p>
                <p className="text-xs text-gray-400 capitalize">{creatorRole === 'ngo' ? '🤝 Non-Governmental Organization' : creatorRole === 'government' ? '🏛️ Government Office' : 'Organization'}</p>
              </div>
            </div>

            {/* Quick Info */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
              {campaign.location?.region && (
                <span className="flex items-center gap-1.5">
                  <FaMapMarkerAlt className="text-primary-500" />
                  {campaign.location.region}{campaign.location.city ? `, ${campaign.location.city}` : ''}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <FaCalendarAlt className="text-primary-500" />
                Started {new Date(campaign.startDate).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <FaClock className="text-primary-500" />
                {campaign.status === 'active' ? `Ends ${new Date(campaign.endDate).toLocaleDateString()}` : `Ended ${new Date(campaign.endDate).toLocaleDateString()}`}
              </span>
              <span className="flex items-center gap-1.5">
                <FaUsers className="text-primary-500" />
                {campaign.donors || 0} supporters
              </span>
              {campaign.estimatedBeneficiaries && (
                <span className="flex items-center gap-1.5">
                  <FaHandHoldingHeart className="text-primary-500" />
                  {campaign.estimatedBeneficiaries.toLocaleString()}+ beneficiaries
                </span>
              )}
            </div>
          </motion.div>

          {/* Section Tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 overflow-x-auto">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeSection === s.id
                      ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="text-xs" />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Story Section */}
          {activeSection === 'story' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">About This Campaign</h2>
              <div className="prose prose-sm max-w-none dark:prose-invert text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
                {campaign.description || 'No description provided.'}
              </div>
            </motion.div>
          )}

          {/* Updates Section */}
          {activeSection === 'updates' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Campaign Updates</h2>
              <div className="space-y-4">
                {campaign.updates?.length > 0 ? campaign.updates.map((u, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 shrink-0">
                      <FaBullhorn className="text-sm" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{u.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{u.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(u.date || u.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-gray-400 text-center py-8">No updates yet. Check back later!</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Donors Section */}
          {activeSection === 'donors' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Top Donors</h2>
              {campaign.topDonors?.length > 0 ? (
                <div className="space-y-3">
                  {campaign.topDonors.map((d, i) => (
                    <div key={d._id || i} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-colors">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                        i === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : i === 2 ? 'bg-gradient-to-br from-amber-500 to-amber-700' : 'bg-primary-500'
                      }`}>
                        {d.donor?.fullName?.[0] || '👤'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate capitalize">
                          {d.donor?.fullName || 'Anonymous'}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{d.amount?.toLocaleString()} ETB</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Be the first to donate!</p>
              )}
            </motion.div>
          )}

          {/* Comments Section */}
          {activeSection === 'comments' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Comments & Messages</h2>
              {campaign.comments?.length > 0 ? campaign.comments.map((c, i) => (
                <div key={i} className="flex gap-3 p-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm font-bold shrink-0">
                    {c.author?.[0] || '👤'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{c.author || 'Anonymous'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{c.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-400 text-center py-8">No comments yet. Be the first to leave a message of support!</p>
              )}
            </motion.div>
          )}

          {/* Gallery Section */}
          {activeSection === 'gallery' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Gallery</h2>
              <p className="text-sm text-gray-400 text-center py-8">📸 Gallery coming soon</p>
            </motion.div>
          )}
        </div>

        {/* ===== SIDEBAR ===== */}
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card sticky top-24">
            {/* Amount */}
            <div className="text-center mb-5">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{campaign.raisedAmount?.toLocaleString()} ETB</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">raised of {campaign.goalAmount?.toLocaleString()} ETB</p>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-primary-500' : 'bg-amber-500'}`}
              />
            </div>

            <div className="flex justify-between text-sm mb-5">
              <span className="text-gray-500 dark:text-gray-400 font-medium">{Math.round(progress)}% funded</span>
              {campaign.status === 'active' && (
                <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                  <FaClock /> {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                </span>
              )}
            </div>

            {/* Details */}
            <div className="space-y-2.5 text-sm mb-6">
              <div className="flex justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-500 dark:text-gray-400">Remaining</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{remaining.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-500 dark:text-gray-400">Total Donors</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{campaign.donors || 0}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-500 dark:text-gray-400">Type</span>
                <span className="font-bold text-gray-800 dark:text-gray-200 capitalize">{campaign.campaignType}</span>
              </div>
              {campaign.estimatedBeneficiaries && (
                <div className="flex justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-gray-500 dark:text-gray-400">Beneficiaries</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{campaign.estimatedBeneficiaries.toLocaleString()}+</span>
                </div>
              )}
            </div>

            {/* Buttons */}
            <button
              onClick={() => setShowDonation(true)}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 mb-2.5"
            >
              <FaHeart /> Donate Now
            </button>

            <button
              onClick={handleShare}
              className="w-full btn-secondary py-3 text-sm flex items-center justify-center gap-2 rounded-xl"
            >
              <FaShare /> Share This Campaign
            </button>

            {/* Completion badge */}
            {campaign.status === 'completed' && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-2 text-green-700 dark:text-green-300">
                <FaCheckCircle />
                <span className="text-sm font-medium">This campaign has been completed successfully</span>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Related Campaigns */}
      {related.length > 0 && (
        <section className="mt-12 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Related Campaigns</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((c) => (
              <CampaignCard key={c._id} campaign={c} />
            ))}
          </div>
        </section>
      )}

      {showDonation && (
        <DonationModal campaign={campaign} onClose={() => setShowDonation(false)} />
      )}
    </div>
  );
}
