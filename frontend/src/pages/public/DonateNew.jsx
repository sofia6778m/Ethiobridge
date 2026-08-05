import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  FaHeart, FaUser, FaPhoneAlt, FaEnvelope, FaCommentDots, FaQrcode,
  FaCheckCircle, FaCopy, FaUpload, FaFileImage, FaSearch, FaHandHoldingHeart,
} from 'react-icons/fa';
import { donationAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DonationQRPanel from '../../components/common/DonationQRPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { paymentMethodIcon } from './Donate';
import { toast } from 'react-toastify';

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

export default function DonateNew() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [campaigns, setCampaigns] = useState([]);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    campaign: searchParams.get('campaign') || '',
    amount: '',
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    email: user?.email || '',
    message: '',
    paymentMethod: '',
    isAnonymous: false,
    recurringMonthly: false,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ovRes, pmRes] = await Promise.all([
          donationAPI.getOverview(),
          donationAPI.getPaymentMethods(),
        ]);
        setCampaigns(ovRes.data.data?.campaigns || []);
        setMethods(pmRes.data.data || []);
        const preselected = searchParams.get('campaign');
        if (preselected) {
          setForm((f) => ({ ...f, campaign: preselected }));
        }
        if (!pmRes.data.data?.length) {
          // fallback placeholder methods so the form renders offline-friendly
          setMethods([
            { _id: 'telebirr', code: 'telebirr', name: 'Telebirr', nameAmharic: 'ቴሌብር', type: 'mobile_money', isActive: true },
            { _id: 'cbe_birr', code: 'cbe_birr', name: 'CBE Birr', nameAmharic: 'ሲቢኢ ብር', type: 'mobile_money', isActive: true },
          ]);
        }
      } catch (err) {
        console.error('Failed to load donation setup', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.campaign) e.campaign = t('donate.validation.campaignRequired');
    const amt = Number(form.amount);
    if (!form.amount) e.amount = t('donate.validation.amountRequired');
    else if (!Number.isFinite(amt) || amt <= 0) e.amount = t('donate.validation.amountInvalid');
    else if (amt < 10) e.amount = t('donate.validation.amountMin');
    if (!form.fullName?.trim()) e.fullName = t('donate.validation.nameRequired');
    if (!form.phone?.trim()) e.phone = t('donate.validation.phoneRequired');
    else if (!/^\+?[0-9]{9,15}$/.test(String(form.phone).replace(/[\s\-().]/g, ''))) e.phone = t('donate.validation.phoneInvalid');
    if (!form.paymentMethod) e.paymentMethod = t('donate.validation.methodRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    setSubmitting(true);
    try {
      const res = await donationAPI.create({
        campaign: form.campaign,
        amount: Number(form.amount),
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
        paymentMethod: form.paymentMethod,
        isAnonymous: form.isAnonymous,
        recurringMonthly: form.recurringMonthly,
      });
      setResult(res.data.data);
      toast.success(t('donate.successTitle'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('donate.validation.amountInvalid'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      await donationAPI.uploadReceipt(result.donation.referenceNumber, fd);
      setReceiptUploaded(true);
      toast.success(t('donate.receiptUploaded'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (result) {
    const { donation, qr } = result;
    const reference = donation.referenceNumber;
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10">
        <div className="max-w-3xl mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="card text-center mb-6 border-green-200 dark:border-green-800">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                <FaCheckCircle className="text-4xl text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('donate.successTitle')}</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">{t('donate.successDesc')}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(reference); toast.success(t('donate.copied')); }}
                className="mt-4 inline-flex items-center gap-2 font-mono text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg mx-auto"
              >
                {reference} <FaCopy className="text-xs" />
              </button>
            </div>

            <div className="card mb-6">
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
                  <FaQrcode className="text-primary-500" /> {t('donate.qrTitle')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('donate.qrDesc')}</p>
              </div>
              <DonationQRPanel payload={qr?.payload} method={qr?.method} amountLabel={`${donation.amount.toLocaleString()} ETB`} reference={reference} />
            </div>

            {/* Receipt upload */}
            <div className="card mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{t('donate.uploadReceiptTitle')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('donate.uploadReceiptDesc')}</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || receiptUploaded}
                className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2"
              >
                <FaUpload /> {uploading ? t('donate.uploading') : receiptUploaded ? t('donate.receiptUploaded') : t('donate.uploadBtn')}
              </button>
              {receiptUploaded && (
                <p className="mt-3 text-sm text-green-600 flex items-center gap-2">
                  <FaCheckCircle /> {t('donate.receiptUploaded')}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={`/donate/track?ref=${reference}`} className="btn-secondary inline-flex items-center justify-center gap-2">
                <FaSearch /> {t('donate.trackCta')}
              </Link>
              <button onClick={() => { setResult(null); setReceiptUploaded(false); setForm((f) => ({ ...f, amount: '', paymentMethod: '', message: '', isAnonymous: false, recurringMonthly: false })); window.scrollTo(0, 0); }}
                className="btn-primary inline-flex items-center justify-center gap-2">
                <FaHeart /> {t('donate.makeAnother')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10">
      <div className="max-w-3xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-500 mx-auto mb-3">
              <FaHandHoldingHeart className="text-2xl" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('donate.formTitle')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t('donate.formSubtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-6">
            {/* Campaign */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {t('donate.campaignLabel')} *
              </label>
              <select value={form.campaign} onChange={(e) => set('campaign', e.target.value)} className={`input-field ${errors.campaign ? 'border-red-400' : ''}`}>
                <option value="">{t('donate.campaignPlaceholder')}</option>
                {campaigns.map((c) => (
                  <option key={c._id} value={c._id}>{c.title}</option>
                ))}
              </select>
              {errors.campaign && <p className="text-xs text-red-500 mt-1">{errors.campaign}</p>}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {t('donate.amountLabel')} *
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_AMOUNTS.map((a) => (
                  <button key={a} type="button" onClick={() => set('amount', String(a))}
                    className={`px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                      Number(form.amount) === a
                        ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
                    }`}>
                    {a.toLocaleString()} ETB
                  </button>
                ))}
              </div>
              <div className="relative">
                <input type="number" min="10" value={form.amount} onChange={(e) => set('amount', e.target.value)}
                  placeholder={t('donate.amountPlaceholder')} className={`input-field pl-10 ${errors.amount ? 'border-red-400' : ''}`} />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">ETB</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('donate.amountMin')}</p>
              {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
            </div>

            {/* Donor details */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('donate.fullNameLabel')} *
                </label>
                <div className="relative">
                  <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                  <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
                    placeholder={t('donate.fullNamePlaceholder')} className={`input-field pl-9 ${errors.fullName ? 'border-red-400' : ''}`} />
                </div>
                {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('donate.phoneLabel')} *
                </label>
                <div className="relative">
                  <FaPhoneAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                    placeholder={t('donate.phonePlaceholder')} className={`input-field pl-9 ${errors.phone ? 'border-red-400' : ''}`} />
                </div>
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {t('donate.emailLabel')}
              </label>
              <div className="relative">
                <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                  placeholder={t('donate.emailPlaceholder')} className="input-field pl-9" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {t('donate.messageLabel')}
              </label>
              <div className="relative">
                <FaCommentDots className="absolute left-3 top-3 text-gray-400 text-sm" />
                <textarea value={form.message} onChange={(e) => set('message', e.target.value)} rows={3}
                  placeholder={t('donate.messagePlaceholder')} className="input-field pl-9" />
              </div>
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {t('donate.paymentMethodLabel')} *
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                {methods.map((m) => {
                  const meta = paymentMethodIcon(m.code);
                  return (
                    <button key={m._id} type="button" onClick={() => set('paymentMethod', m.code)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        form.paymentMethod === m.code
                          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 shadow-md'
                          : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
                      }`}>
                      <span className={`w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-lg shrink-0`}>{meta.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">{m.name}</span>
                        {m.accountHolder && <span className="block text-[11px] text-gray-400 truncate">{m.accountHolder}</span>}
                      </span>
                      {form.paymentMethod === m.code && <FaCheckCircle className="ml-auto text-primary-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {errors.paymentMethod && <p className="text-xs text-red-500 mt-1">{errors.paymentMethod}</p>}
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isAnonymous} onChange={(e) => set('isAnonymous', e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-600" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('donate.anonymousLabel')}</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.recurringMonthly} onChange={(e) => set('recurringMonthly', e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-600" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('donate.recurringLabel')}</span>
              </label>
            </div>

            <button type="submit" disabled={submitting}
              className="btn-primary w-full py-3 text-base inline-flex items-center justify-center gap-2">
              <FaQrcode /> {submitting ? t('donate.submitting') : t('donate.submitBtn')}
            </button>

            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
              <FaFileImage /> {t('donate.uploadReceiptDesc')}
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
