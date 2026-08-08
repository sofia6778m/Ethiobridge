import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { publicAPI, newsAPI, campaignAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AlertBanner from '../../components/common/AlertBanner';
import CampaignCard from '../../components/campaigns/CampaignCard';
import DonateModal from '../../components/campaigns/DonateModal';

const REGIONS = ['Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama','Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella','Benishangul-Gumuz','Harari','Dire Dawa'];

export default function Home() {
  const { t } = useTranslation();
  const [stats, setStats]           = useState(null);
  const [latestNews, setLatestNews] = useState([]);
  const [featured, setFeatured]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [donateCampaign, setDonateCampaign] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, n, c] = await Promise.all([
          publicAPI.getStats(),
          newsAPI.getPublic({ limit: 4 }),
          campaignAPI.getFeatured({ limit: 12 }).catch(() => ({ data: { data: { campaigns: [] } } })),
        ]);
        setStats(s.data.stats);
        setLatestNews(n.data.news || []);
        setFeatured(c.data?.data?.campaigns || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Live refresh: reload active campaigns when anything changes so raised
  // amounts and newly-activated campaigns appear (and deleted/deactivated/
  // completed/expired ones disappear) without a manual refresh.
  const { on } = useSocket() || {};
  const loadFeatured = async () => {
    try {
      const c = await campaignAPI.getFeatured({ limit: 12 }).catch(() => ({ data: { data: { campaigns: [] } } }));
      setFeatured(c.data?.data?.campaigns || []);
    } catch (e) {
      console.error(e);
    }
  };
  const loadFeaturedRef = useRef(loadFeatured);
  loadFeaturedRef.current = loadFeatured;
  useEffect(() => {
    if (!on) return;
    const events = ['campaign:new', 'campaign:updated', 'campaign:statusUpdate', 'campaign:deleted'];
    const cleanups = events.map((e) => on(e, () => loadFeaturedRef.current()));
    return () => cleanups.forEach((off) => off && off());
  }, [on]);

  const statItems = stats ? [
    { icon:'📋', label:t('home.totalReports'),       value: stats.totalReports,       color:'bg-blue-100 dark:bg-blue-900/30',   iconColor:'text-blue-600 dark:text-blue-400' },
    { icon:'⚡', label:t('home.activeReports'),      value: stats.activeReports,      color:'bg-orange-100 dark:bg-orange-900/30', iconColor:'text-orange-600 dark:text-orange-400' },
    { icon:'✅', label:t('home.resolvedReports'),    value: stats.resolvedReports,    color:'bg-green-100 dark:bg-green-900/20',  iconColor:'text-green-600 dark:text-green-400' },
    { icon:'👥', label:t('home.registeredCitizens'), value: stats.registeredCitizens, color:'bg-purple-100 dark:bg-purple-900/30', iconColor:'text-purple-600 dark:text-purple-400' },
    { icon:'🏛️', label:t('home.govOrgs'),            value: stats.govOrgs,            color:'bg-yellow-100 dark:bg-yellow-900/30', iconColor:'text-yellow-600 dark:text-yellow-400' },
    { icon:'🤝', label:t('home.ngoOrgs'),            value: stats.ngoOrgs,            color:'bg-pink-100 dark:bg-pink-900/30',   iconColor:'text-pink-600 dark:text-pink-400' },
    { icon:'🙋', label:t('home.volunteers'),         value: stats.volunteers,         color:'bg-teal-100 dark:bg-teal-900/30',   iconColor:'text-teal-600 dark:text-teal-400' },
    { icon:'🗺️', label:t('home.regionsCovered'),     value: stats.regionsCovered,     color:'bg-indigo-100 dark:bg-indigo-900/30', iconColor:'text-indigo-600 dark:text-indigo-400' },
  ] : [];

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Background Image - Community Working Together */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/community-teamwork.jpg')" }}
        />
        {/* Dark Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary-900/80 via-primary-800/70 to-primary-900/80" />
        {/* Additional gradient for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        
        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-8 tracking-wide border border-white/20">
            <span>🇪🇹</span>
            <span>{t('hero.badge')}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-white drop-shadow-lg">
            {t('hero.heading')} <span className="text-yellow-300">{t('hero.headingHighlight')}</span> {t('hero.headingEnd')}
          </h1>
          <p className="text-lg sm:text-xl text-white/90 mb-10 leading-relaxed max-w-2xl mx-auto drop-shadow">
            {t('hero.description')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/report"
              className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors shadow-lg"
            >
              Create Report
            </Link>
            <Link
              to="/track"
              className="bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Check Status
            </Link>
            <Link to="/about" className="bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors">
              {t('hero.learnMore')}
            </Link>

          </div>
        </div>
      </section>

      {/* Live Public Alerts Banner */}
      <AlertBanner />

      {/* Quick Report Cards */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('home.reportTitle')}</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">{t('home.reportDesc')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon:'🏗️', title:'Infrastructure Report', desc:'Report damaged roads, bridges, water supply, electricity, drainage, schools, hospitals, and other public infrastructure.', btnText:'Create Infrastructure Report', to:'/report/infrastructure', color:'bg-blue-600', light:'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
              { icon:'⚖️', title:'Public Complaint', desc:'Report corruption, service delays, staff misconduct, poor government service, lack of transparency, office-related complaints, and other governance issues.', btnText:'Create Public Complaint', to:'/report/governance-complaint', color:'bg-emerald-600', light:'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
              { icon:'📢', title:'Public Alerts & Broadcasts', desc:'Receive real-time weather updates and public service advisories directly from government authorities.', btnText:'View Active Alerts', to:'/alerts', color:'bg-red-600', light:'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400', badge: true },
            ].map((c, i) => (
              <div key={i} className="card hover:shadow-lg transition-shadow group">
                <div className={`w-14 h-14 rounded-xl ${c.light} flex items-center justify-center text-2xl mb-4`}>{c.icon}</div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">{c.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">{c.desc}</p>
                {c.badge && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {['🌊 Flood','🌧️ Rainfall','🚧 Road','🏥 Health','⚡ Power'].map(tag => (
                      <span key={tag} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                <Link to={c.to} className={`${c.color} hover:opacity-90 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-opacity inline-block ${c.badge ? 'mt-auto' : ''}`}>
                  {c.btnText}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Campaigns */}
      {featured.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('home.featuredCampaigns')}</h2>
                <p className="text-gray-500 dark:text-gray-400">{t('home.featuredCampaignsDesc')}</p>
              </div>
              <Link to="/campaigns" className="text-primary-600 hover:underline text-sm font-medium whitespace-nowrap">{t('home.viewAllCampaigns')} →</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((c) => <CampaignCard key={c._id} campaign={c} onDonate={setDonateCampaign} />)}
            </div>
          </div>
        </section>
      )}

      <DonateModal
        campaign={donateCampaign}
        open={!!donateCampaign}
        onClose={() => setDonateCampaign(null)}
        onSuccess={loadFeatured}
      />

      {/* Statistics */}
      {loading ? <LoadingSpinner /> : stats && (
        <section className="py-16 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('home.statsTitle')}</h2>
              <p className="text-gray-500 dark:text-gray-400">{t('home.statsDesc')}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {statItems.map((s, i) => (
                <div key={i} className="card text-center">
                  <div className={`w-12 h-12 rounded-xl ${s.color} ${s.iconColor} flex items-center justify-center text-2xl mx-auto mb-3`}>{s.icon}</div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{s.value?.toLocaleString() ?? 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Interactive Map, Risk Level Map, Latest Reports, and Success Stories removed */}

      {/* News */}
      {latestNews.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('home.newsTitle')}</h2>
              <Link to="/news" className="text-primary-600 hover:underline text-sm font-medium">{t('home.allNews')}</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {latestNews.map((n) => (
                <Link key={n._id} to={`/news/${n._id}`} className="card hover:shadow-md transition-shadow group">
                  {n.featuredImage && <img src={n.featuredImage} alt="" className="w-full h-36 object-cover rounded-lg mb-3" />}
                  <span className="text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full">{n.category}</span>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-2 group-hover:text-primary-600 transition-colors line-clamp-2">{n.title}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{new Date(n.publishedAt || n.createdAt).toLocaleDateString()}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Partners */}
      <section className="py-12 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-6 font-medium">{t('home.partners')}</p>
          <div className="flex flex-wrap justify-center gap-6">
            {['Ministry of Infrastructure','FDRE Government','Ethiopian Red Cross','UNICEF Ethiopia','WFP Ethiopia','Volunteer Ethiopia'].map((p) => (
              <div key={p} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-3 text-sm text-gray-600 dark:text-gray-400 font-medium shadow-sm">{p}</div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary-700 text-white text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">{t('home.ctaTitle')}</h2>
          <p className="text-primary-100 mb-8">{t('home.ctaDesc')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/register" className="bg-white text-primary-700 hover:bg-primary-50 font-semibold py-3 px-8 rounded-xl transition-colors">{t('home.registerNow')}</Link>
            <Link to="/about" className="border border-white/40 hover:bg-white/10 text-white font-semibold py-3 px-8 rounded-xl transition-colors">{t('hero.learnMore')}</Link>
          </div>
        </div>
      </section>

    </div>
  );
}
