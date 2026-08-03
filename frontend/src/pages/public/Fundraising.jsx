import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  FaHeart, FaHandHoldingHeart, FaTrophy, FaStar, FaSearch,
  FaFilter, FaGlobeAfrica, FaHospital, FaGraduationCap, FaLeaf,
  FaFire, FaBuilding, FaDonate, FaUsers, FaCheckCircle, FaArrowRight,
} from 'react-icons/fa';
import { campaignAPI } from '../../services/api';
import CampaignCard from '../../components/common/CampaignCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const TABS = [
  { id: 'all', label: 'All Campaigns' },
  { id: 'emergency', label: '🚨 Emergency' },
  { id: 'infrastructure', label: '🏗️ Infrastructure' },
  { id: 'general', label: '📋 General' },
  { id: 'completed', label: '✅ Completed' },
];

const CATEGORIES = [
  { id: 'emergency', icon: FaFire, title: 'Emergency Campaigns', desc: 'Immediate disaster relief and humanitarian aid', color: 'from-red-500 to-red-600', count: '8 Active' },
  { id: 'infrastructure', icon: FaBuilding, title: 'Infrastructure Campaigns', desc: 'Roads, bridges, water, electricity, schools', color: 'from-blue-500 to-blue-600', count: '12 Active' },
  { id: 'community', icon: FaLeaf, title: 'Community Development', desc: 'Local initiatives and community projects', color: 'from-green-500 to-green-600', count: '5 Active' },
  { id: 'health', icon: FaHospital, title: 'Health Support', desc: 'Medical facilities, equipment, and health programs', color: 'from-teal-500 to-teal-600', count: '6 Active' },
  { id: 'education', icon: FaGraduationCap, title: 'Education Support', desc: 'Schools, scholarships, and educational resources', color: 'from-purple-500 to-purple-600', count: '4 Active' },
];

function AnimatedCounter({ value, suffix = '', duration = 2 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = Math.ceil(value / (duration * 60));
    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, value, duration]);

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>;
}

export default function Fundraising() {
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState(null);
  const [topDonors, setTopDonors] = useState([]);
  const [successStories, setSuccessStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [cRes, dRes, sRes] = await Promise.all([
          campaignAPI.getPublic({ limit: 50 }),
          campaignAPI.getTopDonors(),
          campaignAPI.getSuccessStories(),
        ]);
        setCampaigns(cRes.data.data || []);
        setStats(cRes.data.stats);
        setTopDonors(dRes.data.data || []);
        setSuccessStories(sRes.data.data || []);
      } catch (err) {
        console.error('Failed to load fundraising data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = campaigns.filter((c) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'completed') return c.status === 'completed';
    return c.campaignType === activeTab && c.status !== 'completed';
  }).filter((c) =>
    !search || c.title?.toLowerCase().includes(search.toLowerCase())
  );

  const featured = campaigns.filter(c => c.isFeatured || c.status === 'active').slice(0, 3);
  const emergency = campaigns.filter(c => c.campaignType === 'emergency' && c.status === 'active').slice(0, 6);
  const infrastructure = campaigns.filter(c => c.campaignType === 'infrastructure' && c.status === 'active').slice(0, 6);
  const completed = campaigns.filter(c => c.status === 'completed').slice(0, 3);

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div>
      {/* ========== HERO ========== */}
      <section className="relative min-h-[520px] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-900/90 via-primary-800/80 to-primary-900/90" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"80\" height=\"80\" viewBox=\"0 0 80 80\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"white\" fill-opacity=\"0.1\"%3E%3Cpath d=\"M40 10L44 28H62L48 40L54 58L40 48L26 58L32 40L18 28H36Z\" /%3E%3C/g%3E%3C/svg%3E')" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center py-24">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-4 py-2 rounded-full text-sm mb-6 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/90 font-medium">EthioBridge Fundraising Platform</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-white drop-shadow-lg">
            ❤️ Emergency & Infrastructure <br className="hidden sm:block" />Fundraising
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-lg sm:text-xl text-white/90 mb-3 max-w-2xl mx-auto">
            የአደጋና የመሠረተ ልማት የገንዘብ ማሰባሰቢያ
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-white/70 max-w-xl mx-auto mb-8 text-sm">
            Support emergency response and infrastructure development across Ethiopia through transparent community fundraising. Every contribution builds a stronger Ethiopia.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex flex-wrap justify-center gap-4">
            <a href="#campaigns" onClick={(e) => { e.preventDefault(); document.getElementById('campaigns')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="inline-flex items-center gap-2 bg-white text-primary-700 hover:bg-primary-50 font-bold py-3 px-8 rounded-xl transition-all shadow-xl hover:shadow-2xl active:scale-95"
            >
              <FaHeart /> Donate Now
            </a>
            <a href="#categories" onClick={(e) => { e.preventDefault(); document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-all"
            >
              View Campaigns
            </a>
          </motion.div>
        </div>
      </section>

      {/* ========== ANIMATED STATISTICS ========== */}
      {stats && (
        <section className="relative z-20 -mt-12 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { icon: FaDonate, label: 'Total Campaigns', value: stats.totalCampaigns || 0, suffix: '', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
                { icon: FaHeart, label: 'Total Donations', value: stats.totalDonors || 0, suffix: '', color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/20' },
                { icon: FaUsers, label: 'Total Donors', value: stats.totalDonors || 0, suffix: '', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
                { icon: FaDonate, label: 'Total Raised', value: stats.totalRaised || 0, suffix: ' ETB', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/20' },
                { icon: FaCheckCircle, label: 'Completed', value: stats.totalCampaigns ? Math.floor(stats.totalCampaigns * 0.3) : 0, suffix: '', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
                { icon: FaGlobeAfrica, label: 'People Helped', value: (stats.totalDonors || 0) * 5, suffix: '+', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.08 }} className="card text-center backdrop-blur-sm bg-white/90 dark:bg-gray-800/90"
                  >
                    <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.color} flex items-center justify-center text-xl mx-auto mb-2`}>
                      <Icon />
                    </div>
                    <p className="text-xl font-bold text-gray-800 dark:text-gray-200">
                      <AnimatedCounter value={s.value} suffix={s.suffix} />
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>
      )}

      {/* ========== CATEGORIES ========== */}
      <section id="categories" className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">Campaign Categories</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">Find campaigns that match your passion</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {CATEGORIES.map((cat, i) => {
              const Icon = cat.icon;
              return (
                <motion.button
                  key={cat.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => { setActiveTab(cat.id); document.getElementById('campaigns')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="group relative overflow-hidden rounded-2xl p-6 text-white text-left min-h-[180px] hover:shadow-xl transition-all active:scale-[0.98]"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${cat.color} opacity-90`} />
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="relative z-10 flex flex-col h-full">
                    <Icon className="text-3xl mb-3" />
                    <h3 className="font-bold text-lg mb-1">{cat.title}</h3>
                    <p className="text-sm text-white/80">{cat.desc}</p>
                    <div className="mt-auto pt-3 flex items-center justify-between">
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{cat.count}</span>
                      <FaArrowRight className="text-sm opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========== FEATURED CAMPAIGNS ========== */}
      {featured.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">⭐ Featured Campaigns</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Top priority campaigns needing your support</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((c) => (
                <CampaignCard key={c._id} campaign={{ ...c, isFeatured: true }} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========== ALL CAMPAIGNS ========== */}
      <section id="campaigns" className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">All Campaigns</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">{filtered.length} campaign{filtered.length !== 1 ? 's' : ''} found</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1.5">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-56">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-7xl mb-5">📭</div>
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No campaigns found</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((campaign) => (
                <CampaignCard key={campaign._id} campaign={campaign} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========== EMERGENCY CAMPAIGNS ========== */}
      {emergency.length > 0 && (
        <section className="py-16 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-500"><FaFire /></div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">🚨 Emergency Campaigns</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Immediate relief and humanitarian aid</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {emergency.map((c) => <CampaignCard key={c._id} campaign={c} />)}
            </div>
            {campaigns.filter(c => c.campaignType === 'emergency' && c.status === 'active').length > 6 && (
              <div className="text-center mt-8">
                <button onClick={() => setActiveTab('emergency')} className="btn-secondary text-sm py-2.5 px-6">View All Emergency Campaigns</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========== INFRASTRUCTURE CAMPAIGNS ========== */}
      {infrastructure.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500"><FaBuilding /></div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">🏗️ Infrastructure Campaigns</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Building Ethiopia's future</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {infrastructure.map((c) => <CampaignCard key={c._id} campaign={c} />)}
            </div>
            {campaigns.filter(c => c.campaignType === 'infrastructure' && c.status === 'active').length > 6 && (
              <div className="text-center mt-8">
                <button onClick={() => setActiveTab('infrastructure')} className="btn-secondary text-sm py-2.5 px-6">View All Infrastructure Campaigns</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========== COMPLETED CAMPAIGNS ========== */}
      {completed.length > 0 && (
        <section className="py-16 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">✅ Recently Completed</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Campaigns that reached their goals</p>
              </div>
              <Link to="/fundraising" onClick={() => setActiveTab('completed')} className="text-primary-600 hover:underline text-sm font-medium">View All</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {completed.map((c) => (
                <motion.div key={c._id} className="card border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <FaCheckCircle />
                    <span className="text-sm font-semibold">Campaign Complete</span>
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-1">{c.title}</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Raised <span className="font-semibold text-green-600">{c.raisedAmount?.toLocaleString()} ETB</span> of {c.goalAmount?.toLocaleString()} ETB goal
                  </p>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-green-500" style={{ width: '100%' }} />
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                    <span>{c.donors || 0} donors</span>
                    <Link to={`/fundraising/${c._id}`} className="text-primary-600 hover:underline font-medium">View Details →</Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========== TOP DONORS ========== */}
      {topDonors.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="w-14 h-14 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-3">
                <FaTrophy className="text-2xl text-yellow-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">🏆 Top Donors</h2>
              <p className="text-gray-500 dark:text-gray-400">Our most generous supporters</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {topDonors.slice(0, 8).map((donor, i) => (
                <motion.div
                  key={donor._id || i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className={`card flex items-center gap-3 ${i < 3 ? 'ring-2 ring-yellow-400/30 shadow-md' : ''}`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                      i === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : i === 2 ? 'bg-gradient-to-br from-amber-500 to-amber-700' : 'bg-primary-500'
                    }`}>
                      {donor.donor?.fullName?.[0] || '👤'}
                    </div>
                    {i < 3 && (
                      <span className="absolute -top-2 -right-2 text-sm drop-shadow-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate capitalize">
                      {donor.donor?.fullName || 'Anonymous Hero'}
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-yellow-600">{(donor.totalDonated || 0).toLocaleString()} ETB</span> • {donor.donationCount || 0} donation{(donor.donationCount || 0) > 1 ? 's' : ''}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========== SUCCESS STORIES ========== */}
      {successStories.length > 0 && (
        <section className="py-16 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <FaStar className="text-3xl text-yellow-500 mx-auto mb-2" />
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Success Stories</h2>
              <p className="text-gray-500 dark:text-gray-400">Real impact your donations have made possible</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {successStories.map((story, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="card hover:shadow-lg transition-shadow group"
                >
                  {story.image && (
                    <div className="relative h-44 -mx-6 -mt-6 mb-4 overflow-hidden rounded-t-xl">
                      <img src={story.image} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full">
                      {story.campaignType || 'General'}
                    </span>
                    {story.date && (
                      <span className="text-xs text-gray-400">{new Date(story.date).toLocaleDateString()}</span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-1">{story.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3">{story.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========== CTA ========== */}
      <section className="py-20 bg-gradient-to-r from-primary-800 via-primary-700 to-primary-600 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M30 5L35 20H50L38 30L42 45L30 36L18 45L22 30L10 20H25Z\" fill=\"white\" /%3E%3C/svg%3E')" }} />
        <div className="relative z-10 max-w-2xl mx-auto px-4">
          <FaHandHoldingHeart className="text-6xl mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">Together We Can Rebuild Ethiopia</h2>
          <p className="text-primary-100/90 mb-8 max-w-lg mx-auto">
            Your donation, no matter the size, helps build roads, schools, hospitals, and provides emergency relief to those who need it most.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/fundraising"
              className="inline-flex items-center gap-2 bg-white text-primary-700 hover:bg-primary-50 font-bold py-3.5 px-8 rounded-xl transition-all shadow-xl hover:shadow-2xl active:scale-95"
            >
              <FaHeart /> Make a Donation
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 border-2 border-white/40 hover:bg-white/10 text-white font-semibold py-3.5 px-8 rounded-xl transition-all"
            >
              Join the Movement
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
