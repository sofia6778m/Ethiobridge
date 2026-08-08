import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { donationAPI } from '../../services/api';
import { PAYMENT_METHODS, formatETB } from '../../utils/campaignMeta';

// Donation / pledge modal for an active campaign. Open to everyone — guests and
// every logged-in role. Guests fill in their name + phone; logged-in users get
// their profile data pre-filled. There is no login gate: clicking Donate Now
// always opens this form.
export default function DonateModal({ campaign, open, onClose, onSuccess }) {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [tab, setTab] = useState('money');
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState('telebirr');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([{ name: '', quantity: 1 }]);
  const [itemNotes, setItemNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    if (open) {
      setReceipt(null);
      setMessage('');
      setDonorName(user?.fullName || '');
      setDonorPhone(user?.phone || '');
      setTab('money');
    }
  }, [open, user]);

  if (!open) return null;

  const updateItem = (i, patch) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const handleSubmit = async () => {
    if (tab === 'money' && !isAnonymous) {
      if (!String(donorName || '').trim()) {
        toast.error(t('campaign.donorNameRequired'));
        return;
      }
      if (!String(donorPhone || '').trim()) {
        toast.error(t('campaign.donorPhoneRequired'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = tab === 'in_kind' && isAuthenticated
        ? await donationAPI.create({
            campaignId: campaign._id,
            type: 'in_kind',
            items: items.filter((it) => it.name && String(it.name).trim()).map((it) => ({ name: it.name.trim(), quantity: Number(it.quantity) || 1 })),
            itemNotes,
          })
        : await donationAPI.create({
            campaignId: campaign._id,
            type: 'money',
            amount: Number(amount),
            paymentMethod: method,
            isAnonymous,
            donorName,
            donorPhone,
            message,
          });

      const donation = res.data?.data?.donation;
      setReceipt(donation || { donationRef: res.data?.data?.donationRef });
      toast.success(res.data?.message || t('campaign.donationRecorded'));
      onSuccess?.(donation);
    } catch (err) {
      toast.error(err.response?.data?.message || t('campaign.donationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const receiptStatus = receipt?.status || 'verified';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">💝 {t('campaign.donateTitle')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{campaign.title}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {receipt ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-3xl mb-4">✅</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{t('campaign.donationThankYou')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                {t('campaign.receiptRef')}:
                <span className="font-mono font-semibold text-primary-600 dark:text-primary-400 ml-1">{receipt.donationRef}</span>
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-left text-sm space-y-2 mb-6">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">{t('campaign.amount')}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{receipt.amount ? formatETB(receipt.amount) : '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">{t('campaign.paymentMethod')}</span>
                  <span className="capitalize font-medium text-gray-900 dark:text-gray-100">{receipt.paymentMethod || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">{t('campaign.status')}</span>
                  <span className={`font-semibold capitalize ${receiptStatus === 'verified' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {receiptStatus}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-5">{t('campaign.receiptHint')}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Link to={`/donations/track/${receipt.donationRef}`} className="btn-primary text-sm py-2 px-5">{t('campaign.trackDonation')}</Link>
                <button onClick={onClose} className="btn-secondary text-sm py-2 px-5">{t('common.close')}</button>
              </div>
            </div>
          ) : (
            <>
              {isAuthenticated && (
                <div className="flex gap-2 mb-5">
                  <button
                    onClick={() => setTab('money')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === 'money' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                  >
                    💵 {t('campaign.donateMoney')}
                  </button>
                  <button
                    onClick={() => setTab('in_kind')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === 'in_kind' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                  >
                    📦 {t('campaign.pledgeItems')}
                  </button>
                </div>
              )}

              {tab === 'money' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.amount')} *</label>
                    <div className="flex gap-2">
                      {[500, 1000, 2000, 5000].map((v) => (
                        <button
                          key={v}
                          onClick={() => setAmount(v)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${Number(amount) === v ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                        >
                          {v.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="input-field mt-2 text-sm"
                      placeholder={t('campaign.amountPlaceholder')}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.donorName')} *</label>
                      <input value={donorName} onChange={(e) => setDonorName(e.target.value)} className="input-field text-sm" placeholder={t('campaign.donorNamePlaceholder')} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.donorPhone')} *</label>
                      <input value={donorPhone} onChange={(e) => setDonorPhone(e.target.value)} className="input-field text-sm" placeholder="09..." />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.paymentMethod')}</label>
                    <select value={method} onChange={(e) => setMethod(e.target.value)} className="input-field text-sm">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.message')}</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} className="input-field text-sm" placeholder={t('campaign.messagePlaceholder')} />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="rounded" />
                    {t('campaign.donateAnonymously')}
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.pledgedItems')}</label>
                    <div className="space-y-2">
                      {items.map((it, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            value={it.name}
                            onChange={(e) => updateItem(i, { name: e.target.value })}
                            className="input-field text-sm flex-1"
                            placeholder={t('campaign.itemName')}
                          />
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => updateItem(i, { quantity: e.target.value })}
                            className="input-field text-sm w-20"
                            placeholder={t('campaign.qty')}
                          />
                          {items.length > 1 && (
                            <button onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 px-2">✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setItems((prev) => [...prev, { name: '', quantity: 1 }])} className="text-xs text-primary-600 font-medium mt-2">
                      + {t('campaign.addItem')}
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('campaign.itemNotes')}</label>
                    <textarea value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} rows={2} className="input-field text-sm" />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={onClose} disabled={submitting} className="btn-secondary text-sm py-2 px-4">{t('common.cancel')}</button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm py-2 px-5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? t('common.working') : t('campaign.confirmDonation')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
