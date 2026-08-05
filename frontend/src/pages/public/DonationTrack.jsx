import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  FaSearch, FaReceipt, FaCheckCircle, FaTimesCircle, FaClock, FaHeart,
  FaDownload,
} from 'react-icons/fa';
import { donationAPI } from '../../services/api';
import { paymentMethodIcon } from './Donate';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { toast } from 'react-toastify';

const STATUS_STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending_verification', label: 'Verification' },
  { key: 'verified', label: 'Verified' },
];

export default function DonationTrack() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('ref') || '');
  const [input, setInput] = useState(searchParams.get('ref') || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (ref) => {
    const term = String(ref || '').trim();
    if (!term) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await donationAPI.track(term);
      setData(res.data.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(t('donate.trackNotFound'));
      } else {
        setError(err.response?.data?.message || t('donate.trackNotFound'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) search(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const stepIndex = data
    ? data.verificationStatus === 'rejected' ? 1
      : data.verificationStatus === 'verified' ? 2 : 1
    : 0;

  const statusBadge = data && (
    data.verificationStatus === 'verified'
      ? <span className="badge-resolved">{t('donate.statusVerified')}</span>
      : data.verificationStatus === 'rejected'
        ? <span className="badge-rejected">{t('donate.statusRejected')}</span>
        : <span className="badge-pending">{t('donate.statusPending')}</span>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10">
      <div className="max-w-2xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 mx-auto mb-3">
              <FaSearch className="text-xl" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('donate.trackTitle')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t('donate.trackDesc')}</p>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); search(input); }}
            className="flex flex-col sm:flex-row gap-3 mb-8"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('donate.trackPlaceholder')}
              className="input-field font-mono flex-1"
            />
            <button type="submit" disabled={loading} className="btn-primary inline-flex items-center justify-center gap-2">
              <FaSearch /> {t('donate.trackBtn')}
            </button>
          </form>

          {loading && <LoadingSpinner />}

          {error && (
            <div className="card text-center border-red-200 dark:border-red-900 py-12">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">{error}</p>
              <p className="text-sm text-gray-400 mt-1">{t('donate.trackNotFoundDesc')}</p>
            </div>
          )}

          {data && !error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs text-gray-400">Reference</p>
                  <p className="font-mono font-bold text-gray-800 dark:text-gray-200">{data.referenceNumber}</p>
                </div>
                {statusBadge}
              </div>

              {/* Progress steps */}
              <div className="flex items-center mb-8">
                {STATUS_STEPS.map((s, i) => (
                  <div key={s.key} className="flex-1 flex items-center last:flex-none">
                    <div className="flex flex-col items-center w-full">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm border-2 ${
                        i < stepIndex ? 'bg-green-500 border-green-500 text-white'
                          : i === stepIndex
                            ? (data.verificationStatus === 'rejected' ? 'bg-red-500 border-red-500 text-white' : 'bg-primary-600 border-primary-600 text-white')
                            : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400'
                      }`}>
                        {i < stepIndex ? <FaCheckCircle /> : i === stepIndex && data.verificationStatus === 'rejected' ? <FaTimesCircle /> : i + 1}
                      </div>
                      <span className="text-[11px] mt-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.label}</span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 mb-5 rounded ${i < stepIndex ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`} />
                    )}
                  </div>
                ))}
              </div>

              {data.verificationStatus === 'rejected' && data.rejectionReason && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-6">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Reason for rejection</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{data.rejectionReason}</p>
                </div>
              )}

              {data.verificationStatus === 'pending_verification' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 mb-6">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                    <FaClock /> {t('donate.verificationHint')}
                  </p>
                </div>
              )}

              {/* Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 shrink-0"><FaHeart /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">{t('donate.fieldCampaign')}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{data.campaign?.title || 'EthioBridge'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600 shrink-0">ETB</div>
                  <div>
                    <p className="text-xs text-gray-400">{t('donate.fieldAmount')}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{data.amount.toLocaleString()} ETB</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-lg shrink-0">
                    {paymentMethodIcon(data.paymentMethod)?.icon}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t('donate.fieldMethod')}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{data.paymentMethod}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 shrink-0"><FaReceipt /></div>
                  <div>
                    <p className="text-xs text-gray-400">{t('donate.fieldDate')}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{new Date(data.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <FaDownload className="text-green-500" />
                  {data.receiptSubmitted ? t('donate.receiptSubmitted') : t('donate.receiptNotSubmitted')}
                </span>
                <Link to="/donate" className="text-sm text-primary-600 hover:underline font-medium">{t('donate.makeAnother')}</Link>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
