import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FaDownload, FaHeart, FaSearch, FaCheckCircle, FaClock, FaTimesCircle, FaFilePdf, FaReceipt } from 'react-icons/fa';
import { donationAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

function downloadReceipt(d) {
  const content = [
    '═══════════════════════════════',
    '       ZDA RECEIPT',
    '═══════════════════════════════',
    '',
    `Receipt #: ${d.receiptNumber || d.referenceNumber}`,
    `Reference: ${d.referenceNumber}`,
    `Date: ${new Date(d.createdAt).toLocaleString()}`,
    `Status: ${d.verificationStatus}`,
    '',
    `Campaign: ${d.campaign?.title || 'N/A'}`,
    `Amount: ${(d.amount || 0).toLocaleString()} ETB`,
    `Method: ${d.paymentMethodName || d.paymentMethod?.replace(/_/g, ' ') || 'N/A'}`,
    `Donor: ${d.isAnonymous ? 'Anonymous' : d.fullName || d.donorName || 'Guest'}`,
    '',
    '───────────────────────────────',
    '      Thank you for donating!',
    '═══════════════════════════════',
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${d.receiptNumber || d.referenceNumber}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_META = {
  pending_verification: { cls: 'badge-pending', icon: FaClock },
  verified: { cls: 'badge-resolved', icon: FaCheckCircle },
  rejected: { cls: 'badge-rejected', icon: FaTimesCircle },
};

export default function MyDonations() {
  const { t } = useTranslation();
  const [donations, setDonations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [listRes, sumRes] = await Promise.all([
          donationAPI.getMy({ limit: 100 }),
          donationAPI.getMySummary(),
        ]);
        setDonations(listRes.data.data || []);
        setSummary(sumRes.data.data || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = donations.filter((d) =>
    !search ||
    d.campaign?.title?.toLowerCase().includes(search.toLowerCase()) ||
    (d.referenceNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCertificate = async (d) => {
    setDownloading(d._id);
    try {
      const res = await donationAPI.getCertificate(d._id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EthioBridge-Certificate-${d.referenceNumber || d._id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Certificate downloaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Certificate unavailable');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  const stats = summary || {};

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('donate.citizen.title')}</h2>
          <p className="text-sm text-gray-500">{t('donate.citizen.desc')}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('donate.citizen.ref') + ' / ' + t('donate.fieldCampaign')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 text-sm"
          />
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">💡 {t('donate.citizen.guestHistoryNote')}</p>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: t('donate.citizen.statDonations'), value: stats.count ?? donations.length, color: 'text-gray-800 dark:text-gray-200' },
          { label: t('donate.citizen.statCommitted'), value: `${(stats.totalCommitted || 0).toLocaleString()} ETB`, color: 'text-primary-600' },
          { label: t('donate.citizen.statVerified'), value: `${(stats.totalVerified || 0).toLocaleString()} ETB`, color: 'text-green-600' },
          { label: t('donate.citizen.statVerifiedCount'), value: stats.verifiedCount ?? 0, color: 'text-emerald-600' },
          { label: t('donate.citizen.statPending'), value: stats.pendingCount ?? 0, color: 'text-yellow-600' },
          { label: t('donate.citizen.statRejected'), value: stats.rejectedCount ?? 0, color: 'text-red-500' },
        ].map((s, i) => (
          <div key={i} className="card text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 card">
          <FaHeart className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg text-gray-500 dark:text-gray-400">{t('donate.citizen.noDonations')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('donate.citizen.noDonationsDesc')}</p>
          <Link to="/donate/new" className="btn-primary inline-flex items-center gap-2 mt-5">
            <FaHeart /> {t('donate.ctaBtn')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d, i) => {
            const meta = STATUS_META[d.verificationStatus] || STATUS_META.pending_verification;
            const Icon = meta.icon;
            return (
              <motion.div
                key={d._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-500 shrink-0">
                    <FaHeart />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {d.campaign?.title || 'Unknown Campaign'}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-400 mt-0.5 items-center">
                      <span className="font-mono">{d.referenceNumber}</span>
                      <span>•</span>
                      <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className={meta.cls}><Icon className="mr-1" />{t(meta.labelKey || (d.verificationStatus === 'verified' ? 'donate.statusVerified' : d.verificationStatus === 'rejected' ? 'donate.statusRejected' : 'donate.statusPending'))}</span>
                    </div>
                    {d.verificationStatus === 'rejected' && d.rejectionReason && (
                      <p className="text-xs text-red-500 mt-1 line-clamp-1">{d.rejectionReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{d.amount?.toLocaleString()} ETB</span>
                  {d.isAnonymous && (
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">{t('donate.anonymous')}</span>
                  )}
                  {d.verificationStatus === 'verified' && (
                    <>
                      <button
                        onClick={() => downloadReceipt(d)}
                        className="btn-secondary text-xs inline-flex items-center gap-1.5"
                        title={t('donate.citizen.downloadReceipt')}
                      >
                        <FaReceipt /> {t('donate.citizen.downloadReceipt')}
                      </button>
                      <button
                        onClick={() => handleCertificate(d)}
                        disabled={downloading === d._id}
                        className="btn-success text-xs inline-flex items-center gap-1.5"
                        title={t('donate.citizen.downloadCertificate')}
                      >
                        <FaFilePdf /> {downloading === d._id ? '...' : t('donate.citizen.downloadCertificate')}
                      </button>
                    </>
                  )}
                  {d.verificationStatus === 'pending_verification' && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <FaClock /> {t('donate.statusPending')}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
