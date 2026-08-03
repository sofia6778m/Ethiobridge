import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaDownload, FaHeart, FaSearch } from 'react-icons/fa';
import { campaignAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

function downloadReceipt(d) {
  const content = [
    '═══════════════════════════════',
    '       ZDA RECEIPT',
    '═══════════════════════════════',
    '',
    `Receipt #: ${d.receiptNumber}`,
    `Date: ${new Date(d.createdAt).toLocaleString()}`,
    `Status: ${d.paymentStatus}`,
    '',
    `Campaign: ${d.campaign?.title || 'N/A'}`,
    `Amount: ${(d.amount || 0).toLocaleString()} ETB`,
    `Method: ${d.paymentMethod?.replace(/_/g, ' ') || 'N/A'}`,
    `Donor: ${d.isAnonymous ? 'Anonymous' : `${d.donor?.fullName || 'Guest'}`}`,
    '',
    '───────────────────────────────',
    '      Thank you for donating!',
    '═══════════════════════════════',
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${d.receiptNumber}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MyDonations() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await campaignAPI.getDonationHistory({ limit: 50 });
        setDonations(res.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalDonated = donations.reduce((s, d) => s + (d.amount || 0), 0);

  const filtered = donations.filter((d) =>
    !search || d.campaign?.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Donations</h2>
          <p className="text-sm text-gray-500">View your donation history</p>
        </div>
        <div className="relative w-full sm:w-64">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by campaign..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 text-sm"
          />
        </div>
      </div>

      {donations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{donations.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total Donations</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-green-600">{totalDonated.toLocaleString()} ETB</p>
            <p className="text-xs text-gray-500 mt-1">Total Donated</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-primary-600">{donations.filter(d => d.paymentStatus === 'completed').length}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 card">
          <FaHeart className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg text-gray-500 dark:text-gray-400">No donations yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Your donation history will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d, i) => (
            <motion.div
              key={d._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-500 shrink-0">
                  <FaHeart />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {d.campaign?.title || 'Unknown Campaign'}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-400 mt-0.5">
                    <span>Receipt: {d.receiptNumber}</span>
                    <span>•</span>
                    <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className={`capitalize ${
                      d.paymentStatus === 'completed' ? 'text-green-500' : d.paymentStatus === 'pending' ? 'text-yellow-500' : 'text-red-500'
                    }`}>{d.paymentStatus}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{d.amount?.toLocaleString()} ETB</span>
                {d.isAnonymous && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">Anonymous</span>
                )}
                {d.paymentStatus === 'completed' && (
                  <button
                    onClick={() => downloadReceipt(d)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    title="Download Receipt"
                  >
                    <FaDownload />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
