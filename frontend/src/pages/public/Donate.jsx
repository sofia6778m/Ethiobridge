import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  FaHeart, FaHandHoldingHeart, FaQrcode, FaShieldAlt, FaReceipt, FaSearch,
  FaUsers, FaDonate, FaCheckCircle, FaArrowRight, FaPhoneAlt, FaCopy,
  FaBullhorn, FaHandshake,
} from 'react-icons/fa';
import { donationAPI } from '../../services/api';
import EmergencyDonationBanner from '../../components/common/EmergencyDonationBanner';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export const PAYMENT_ICONS = {
  telebirr: { icon: '📱', color: 'from-green-500 to-emerald-600' },
  cbe_birr: { icon: '💚', color: 'from-green-400 to-lime-500' },
  cbe_bank: { icon: '🏦', color: 'from-blue-600 to-indigo-600' },
  awash_bank: { icon: '🔵', color: 'from-sky-500 to-blue-600' },
  dashen_bank: { icon: '🟣', color: 'from-purple-500 to-violet-600' },
  amole: { icon: '🟠', color: 'from-amber-400 to-orange-500' },
  bank: { icon: '🏛️', color: 'from-slate-500 to-slate-700' },
};

export function paymentMethodIcon(code) {
  return PAYMENT_ICONS[code] || PAYMENT_ICONS.bank;
}

function AnimatedCounter({ value, suffix = '', duration = 2 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = Math.max(1, Math.ceil(value / (duration * 60)));
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

const HOW_IT_WORKS = [
  { icon: FaHeart, titleKey: 'donate.howStep1Title', descKey: 'donate.howStep1Desc' },
  { icon: FaQrcode, titleKey: 'donate.howStep2Title', descKey: 'donate.howStep2Desc' },
  { icon: FaReceipt, titleKey: 'donate.howStep3Title', descKey: 'donate.howStep3Desc' },
  { icon: FaCheckCircle, titleKey: 'donate.howStep4Title', descKey: 'donate.howStep4Desc' },
];

export default function Donate() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState(null);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ovRes, pmRes] = await Promise.all([
          donationAPI.getOverview(),
          donationAPI.getPaymentMethods(),
        ]);
        setOverview(ovRes.data.data);
        setMethods(pmRes.data.data || []);
      } catch (err) {
        console.error('Failed to load donation overview', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner fullPage />;

  const stats = overview?.stats || {};
  const campaigns = overview?.campaigns || [];
  const emergencyCampaigns = overview?.emergencyCampaigns || [];
  const recent = overview?.recentVerified || [];
  const stories = overview?.successStories || [];

  return (
    <div>
      <EmergencyDonationBanner campaigns={emergencyCampaigns} />

      {/* ========== HERO ========== */}
      <section className="relative min-h-[540px] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=1600&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-900/95 via-primary-800/85 to-primary-900/95" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"80\" height=\"80\" viewBox=\"0 0 80 80\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"white\" fill-opacity=\"0.1\"%3E%3Cpath d=\"M40 10L44 28H62L48 40L54 58L40 48L26 58L32 40L18 28H36Z\" /%3E%3C/g%3E%3C/svg%3E')" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center py-24">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-4 py-2 rounded-full text-sm mb-6 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/90 font-medium">{t('donate.heroBadge')}</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-white drop-shadow-lg">
            {t('donate.heroTitle')} <br className="hidden sm:block" /> <span className="text-yellow-300">{t('donate.heroTitleHighlight')}</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-lg sm:text-xl text-white/90 mb-3 max-w-2xl mx-auto">
            ለግስ ያድርጉ፣ ያረጋግጡ፣ ተጽዕኖ ይፍጠሩ
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-white/70 max-w-xl mx-auto mb-8 text-sm">
            {t('donate.heroDesc')}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex flex-wrap justify-center gap-4">
            <Link to="/donate/new"
              className="inline-flex items-center gap-2 bg-white text-primary-700 hover:bg-primary-50 font-bold py-3 px-8 rounded-xl transition-all shadow-xl hover:shadow-2xl active:scale-95"
            >
              <FaHeart /> {t('donate.heroCta')}
            </Link>
            <Link to="/donate/track"
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-all"
            >
              <FaSearch /> {t('donate.heroCtaSecondary')}
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ========== ANIMATED STATISTICS ========== */}
      <section className="relative z-20 -mt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: FaDonate, label: t('donate.statRaised'), value: stats.totalRaised || 0, suffix: ' ETB', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/20' },
              { icon: FaUsers, label: t('donate.statDonors'), value: stats.totalDonors || 0, suffix: '', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
              { icon: FaHandHoldingHeart, label: t('donate.statDonations'), value: stats.totalDonations || 0, suffix: '', color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/20' },
              { icon: FaHeart, label: t('donate.statCampaigns'), value: campaigns.length, suffix: '', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.08 }} className="card text-center backdrop-blur-sm bg-white/90 dark:bg-gray-800/90">
                  <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.color} flex items-center justify-center text-xl mx-auto mb-2`}><Icon /></div>
                  <p className="text-xl font-bold text-gray-800 dark:text-gray-200"><AnimatedCounter value={s.value} suffix={s.suffix} /></p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========== CAMPAIGNS ========== */}
      <section id="campaigns" className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('donate.campaignsTitle')}</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">{t('donate.campaignsDesc')}</p>
            </div>
            <Link to="/fundraising" className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm font-medium whitespace-nowrap">
              View all <FaArrowRight className="text-xs" />
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-16 card">
              <div className="text-6xl mb-4">💝</div>
              <p className="text-gray-500 dark:text-gray-400">{t('donate.campaignsEmpty')}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((c, i) => (
                <motion.div key={c._id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                  className="card group hover:shadow-lg transition-all overflow-hidden flex flex-col">
                  {c.image ? (
                    <div className="relative h-44 -mx-6 -mt-6 mb-4 overflow-hidden">
                      <img src={c.image} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      {c.campaignType === 'emergency' && (
                        <span className="absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg">🚨 Emergency</span>
                      )}
                    </div>
                  ) : (
                    <div className={`h-24 -mx-6 -mt-6 mb-4 bg-gradient-to-r ${c.campaignType === 'emergency' ? 'from-red-500 to-red-600' : 'from-primary-500 to-primary-700'} flex items-center justify-center text-4xl`}>💝</div>
                  )}
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 line-clamp-1 mb-1">{c.title}</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Raised <span className="font-semibold text-green-600">{(c.raisedAmount || 0).toLocaleString()} ETB</span> of {(c.goalAmount || 0).toLocaleString()} ETB
                  </p>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(100, ((c.raisedAmount || 0) / (c.goalAmount || 1)) * 100)}%` }} />
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-xs text-gray-400">{c.donors || 0} donors</span>
                    <div className="flex gap-2">
                      <Link to={`/fundraising/${c._id}`} className="text-xs text-primary-600 hover:underline font-medium self-end">Details →</Link>
                      <Link to={`/donate/new?campaign=${c._id}`} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                        <FaHeart /> Donate
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========== PAYMENT METHODS ========== */}
      {methods.length > 0 && (
        <section className="py-14 bg-gray-50 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Payment Methods</h2>
            <p className="text-center text-gray-500 dark:text-gray-400 mb-10 text-sm">Pay how you want — every method generates a unique QR code</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {methods.map((m, i) => {
                const meta = paymentMethodIcon(m.code);
                return (
                  <motion.div key={m._id} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                    className="card text-center hover:shadow-lg transition-all cursor-default">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-2xl mx-auto mb-2`}>{meta.icon}</div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{m.name}</p>
                    {m.accountHolder && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{m.accountHolder}</p>}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ========== HOW IT WORKS ========== */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('donate.howTitle')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('donate.transparencyDesc')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card text-center">
                  <div className="relative w-14 h-14 mx-auto mb-3">
                    <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                      <Icon className="text-2xl" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-1">{t(step.titleKey)}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t(step.descKey)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========== RECENT VERIFIED DONATIONS ========== */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600"><FaCheckCircle /></div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('donate.recentTitle')}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{t('donate.recentDesc')}</p>
            </div>
          </div>
          {recent.length === 0 ? (
            <p className="text-center text-gray-400 py-10">{t('donate.recentEmpty')}</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recent.map((d, i) => (
                <motion.div key={d._id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-500 text-sm shrink-0"><FaHeart /></div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">{d.isAnonymous ? t('donate.anonymous') : d.donorName}</p>
                      <p className="text-[11px] text-gray-400 truncate">{d.campaign?.title || ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-green-600">{d.amount.toLocaleString()} ETB</span>
                    <span className="text-[10px] text-gray-400">{new Date(d.verifiedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-400 px-2 py-1 rounded-lg truncate">{d.referenceNumber}</p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========== IMPACT STORIES ========== */}
      {stories.length > 0 && (
        <section className="py-16 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-amber-600"><FaHandshake /></div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('donate.storiesTitle')}</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{t('donate.storiesDesc')}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {stories.map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                  className="card group overflow-hidden flex flex-col">
                  <div className="relative h-44 -mx-6 -mt-6 mb-4 overflow-hidden">
                    <img src={s.image || s.campaignImage || 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=600&q=80'} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <span className="absolute top-3 left-3 bg-black/50 text-white text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">{s.campaignTitle}</span>
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 line-clamp-1 mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 flex-1">{s.description}</p>
                  {s.date && (
                    <p className="text-[11px] text-gray-400 mt-3">{new Date(s.date).toLocaleDateString()}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========== TRANSPARENCY / TRUST ========== */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FaShieldAlt className="text-4xl text-green-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{t('donate.transparencyTitle')}</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">{t('donate.transparencyDesc')}</p>
          <div className="grid sm:grid-cols-3 gap-4 text-left">
            {[t('donate.transparencyPoint1'), t('donate.transparencyPoint2'), t('donate.transparencyPoint3')].map((point, i) => (
              <div key={i} className="card border-green-100 dark:border-green-900">
                <div className="flex items-start gap-2">
                  <FaCheckCircle className="text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-600 dark:text-gray-300">{point}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="py-20 bg-gradient-to-r from-primary-800 via-primary-700 to-primary-600 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M30 5L35 20H50L38 30L42 45L30 36L18 45L22 30L10 20H25Z\" fill=\"white\" /%3E%3C/svg%3E')" }} />
        <div className="relative z-10 max-w-2xl mx-auto px-4">
          <FaHandHoldingHeart className="text-6xl mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">{t('donate.ctaTitle')}</h2>
          <p className="text-primary-100/90 mb-8 max-w-lg mx-auto">{t('donate.ctaDesc')}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/donate/new" className="inline-flex items-center gap-2 bg-white text-primary-700 hover:bg-primary-50 font-bold py-3.5 px-8 rounded-xl transition-all shadow-xl hover:shadow-2xl active:scale-95">
              <FaHeart /> {t('donate.ctaBtn')}
            </Link>
            <Link to="/donate/track" className="inline-flex items-center gap-2 border-2 border-white/40 hover:bg-white/10 text-white font-semibold py-3.5 px-8 rounded-xl transition-all">
              <FaSearch /> {t('donate.heroCtaSecondary')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
