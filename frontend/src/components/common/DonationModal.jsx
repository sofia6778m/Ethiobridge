import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  FaTimes, FaCheckCircle, FaDownload, FaHeart, FaShieldAlt,
  FaMobileAlt, FaUniversity, FaCcVisa, FaCcMastercard, FaMoneyCheckAlt, FaQrcode,
} from 'react-icons/fa';
import { campaignAPI } from '../../services/api';
import { toast } from 'react-toastify';

const PRESET_AMOUNTS = [100, 250, 500, 1000, 5000];

const PAYMENT_METHODS = [
  { id: 'telebirr', label: 'Telebirr', icon: FaMobileAlt, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { id: 'cbe_birr', label: 'CBE Birr', icon: FaUniversity, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'chapa', label: 'Chapa', icon: FaMoneyCheckAlt, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
  { id: 'visa', label: 'Visa', icon: FaCcVisa, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { id: 'mastercard', label: 'MasterCard', icon: FaCcMastercard, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  { id: 'bank_transfer', label: 'Bank Transfer', icon: FaUniversity, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-700' },
  { id: 'qr_code', label: 'QR Code', icon: FaQrcode, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
];

export default function DonationModal({ campaign, onClose }) {
  const [step, setStep] = useState('donate');
  const [amount, setAmount] = useState(250);
  const [customAmount, setCustomAmount] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [donationResult, setDonationResult] = useState(null);
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');

  const handleAmountSelect = (val) => {
    setAmount(val);
    setCustomAmount('');
  };

  const handleDonate = async () => {
    const finalAmount = customAmount ? parseFloat(customAmount) : amount;
    if (!finalAmount || finalAmount < 10) {
      toast.error('Minimum donation is 10 ETB');
      return;
    }
    if (!paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }

    if (paymentMethod === 'qr_code') {
      setStep('qr');
      return;
    }

    setLoading(true);
    try {
      const res = await campaignAPI.donate({
        campaignId: campaign._id,
        amount: finalAmount,
        isAnonymous,
        message,
        paymentMethod,
        donorName: donorName || undefined,
        donorEmail: donorEmail || undefined,
      });
      setDonationResult(res.data.data);
      setStep('success');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Donation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQRComplete = async () => {
    const finalAmount = customAmount ? parseFloat(customAmount) : amount;
    setLoading(true);
    try {
      const res = await campaignAPI.donate({
        campaignId: campaign._id,
        amount: finalAmount,
        isAnonymous,
        message,
        paymentMethod: 'qr_code',
        donorName: donorName || undefined,
        donorEmail: donorEmail || undefined,
      });
      setDonationResult(res.data.data);
      setStep('success');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadReceipt = () => {
    if (!donationResult?.receipt) return;
    const receipt = donationResult.receipt;
    const content = `
╔══════════════════════════════════════╗
║     ZDA DONATION RECEIPT     ║
╠══════════════════════════════════════╣
║                                       ║
║  Receipt #: ${receipt.receiptNumber.padEnd(20)}║
║  Date: ${new Date(receipt.createdAt).toLocaleString().padEnd(26)}║
║  Campaign: ${(receipt.campaignTitle || '').substring(0, 28).padEnd(28)}║
║  Amount: ${(receipt.amount + ' ' + receipt.currency).padEnd(29)}║
║  Payment: ${receipt.paymentMethod.replace('_', ' ').padEnd(26)}║
║  Donor: ${(receipt.isAnonymous ? 'Anonymous' : receipt.donorName || 'Anonymous').padEnd(27)}║
║                                       ║
╠══════════════════════════════════════╣
║   Thank you for your support! 🇪🇹     ║
╚══════════════════════════════════════╝
    `.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EthioBridge-Receipt-${receipt.receiptNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-500">
                <FaHeart />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  {step === 'donate' && 'Make a Donation'}
                  {step === 'qr' && 'QR Code Payment'}
                  {step === 'success' && '🎉 Payment Successful!'}
                </h2>
                {step === 'donate' && <p className="text-xs text-gray-400">Support this campaign</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
              <FaTimes />
            </button>
          </div>

          <div className="p-5">
            {step === 'donate' && (
              <div className="space-y-5">
                {/* Campaign Info */}
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600">
                  <img
                    src={campaign.image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=100&q=80'}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 line-clamp-1">{campaign.title}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-green-600 dark:text-green-400">{campaign.raisedAmount?.toLocaleString()} ETB</span> raised of {campaign.goalAmount?.toLocaleString()} ETB
                    </p>
                  </div>
                </div>

                {/* Amount Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Select Amount</label>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_AMOUNTS.map((val) => (
                      <button
                        key={val}
                        onClick={() => handleAmountSelect(val)}
                        className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                          amount === val && !customAmount
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shadow-md'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-red-300 hover:bg-red-50/50'
                        }`}
                      >
                        {val >= 1000 ? `${val / 1000}k` : val}
                        <span className="block text-[9px] font-normal opacity-70">ETB</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">ETB</span>
                      <input
                        type="number"
                        placeholder="Custom Amount"
                        value={customAmount}
                        onChange={(e) => { setCustomAmount(e.target.value); setAmount(0); }}
                        className="input-field text-sm pl-10"
                        min="10"
                      />
                    </div>
                  </div>
                </div>

                {/* Donor Info */}
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Your Name (optional)"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    className="input-field text-sm"
                  />
                  <input
                    type="email"
                    placeholder="Your Email (optional)"
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">
                      <FaShieldAlt className="inline mr-1.5 text-gray-400" />
                      Donate Anonymously
                    </span>
                  </label>
                  <textarea
                    placeholder="Leave a message of support (optional)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input-field text-sm resize-none"
                    rows={2}
                    maxLength={500}
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Payment Method</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PAYMENT_METHODS.map((pm) => {
                      const Icon = pm.icon;
                      return (
                        <button
                          key={pm.id}
                          onClick={() => setPaymentMethod(pm.id)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium border-2 transition-all ${
                            paymentMethod === pm.id
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shadow-md'
                              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:bg-red-50/50'
                          }`}
                        >
                          <Icon className={`text-lg ${paymentMethod === pm.id ? pm.color : ''}`} />
                          <span className="font-medium">{pm.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Donate Button */}
                <button
                  onClick={handleDonate}
                  disabled={loading || (!amount && !customAmount) || !paymentMethod}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <FaHeart /> Donate {customAmount || amount} ETB
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 text-center">
                  🔒 Secure payment. Your information is protected.
                </p>
              </div>
            )}

            {step === 'qr' && (
              <div className="text-center space-y-5 py-4">
                <div className="inline-flex p-5 bg-white rounded-2xl shadow-lg border-2 border-dashed border-gray-200">
                  <QRCodeSVG
                    value={JSON.stringify({
                      campaignId: campaign._id,
                      amount: customAmount || amount,
                      currency: 'ETB',
                      timestamp: Date.now(),
                      merchant: 'EthioBridge',
                    })}
                    size={220}
                    level="H"
                    includeMargin
                  />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Scan to Pay</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Scan this QR code with your <strong>Telebirr</strong>, <strong>CBE Birr</strong>, or any banking app
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-sm text-gray-600 dark:text-gray-400">
                  <p>Amount: <strong className="text-gray-800 dark:text-gray-200">{customAmount || amount} ETB</strong></p>
                  <p>Campaign: <strong className="text-gray-800 dark:text-gray-200">{campaign.title}</strong></p>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleQRComplete}
                    disabled={loading}
                    className="btn-primary py-2.5 px-6 flex items-center gap-2 shadow-lg"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>✅ I've Completed the Payment</>
                    )}
                  </button>
                  <button
                    onClick={() => setStep('donate')}
                    className="btn-secondary py-2.5 px-6"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="text-center space-y-5 py-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto"
                >
                  <FaCheckCircle className="text-4xl text-green-500" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">Thank You! 🙏</h3>
                  <p className="text-gray-500 dark:text-gray-400">Your donation has been received successfully.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">You'll receive a receipt shortly.</p>
                </motion.div>
                {donationResult?.receipt && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl p-4 text-left space-y-2 border border-green-200 dark:border-green-800"
                  >
                    <p className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase tracking-wider">Receipt Summary</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex justify-between">
                      <span>Receipt #</span>
                      <span className="font-mono font-medium text-gray-800 dark:text-gray-200">{donationResult.receipt.receiptNumber}</span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex justify-between">
                      <span>Amount</span>
                      <span className="font-bold text-green-600">{donationResult.receipt.amount} ETB</span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex justify-between">
                      <span>Campaign</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[200px] truncate">{donationResult.receipt.campaignTitle}</span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex justify-between">
                      <span>Date</span>
                      <span>{new Date(donationResult.receipt.createdAt).toLocaleString()}</span>
                    </p>
                  </motion.div>
                )}
                <div className="flex gap-3 justify-center pt-2">
                  <button
                    onClick={downloadReceipt}
                    className="btn-primary py-2.5 px-6 flex items-center gap-2 shadow-lg"
                  >
                    <FaDownload /> Download Receipt
                  </button>
                  <button
                    onClick={onClose}
                    className="btn-secondary py-2.5 px-6"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
