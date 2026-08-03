import { useState, useEffect } from 'react';
import { FaDownload, FaSearch } from 'react-icons/fa';
import { campaignAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

function exportCSV(donations) {
  const headers = ['Campaign', 'Donor', 'Amount (ETB)', 'Method', 'Status', 'Date', 'Receipt'];
  const rows = donations.map(d => [
    `"${(d.campaign?.title || 'N/A').replace(/"/g, '""')}"`,
    d.isAnonymous ? 'Anonymous' : `"${(d.donor?.fullName || 'Guest').replace(/"/g, '""')}"`,
    d.amount || 0,
    d.paymentMethod?.replace(/_/g, ' ') || 'N/A',
    d.paymentStatus,
    new Date(d.createdAt).toLocaleDateString(),
    d.receiptNumber || '',
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donations-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exported');
}

export default function GovDonations() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await campaignAPI.getDonationHistory({ limit: 100 });
        setDonations(res.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const total = donations.reduce((s, d) => s + (d.amount || 0), 0);
  const filtered = donations.filter((d) =>
    !search || d.campaign?.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Donations</h2>
          <p className="text-sm text-gray-500">View donations received for your campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          {donations.length > 0 && (
            <button onClick={() => exportCSV(filtered)} className="btn-secondary flex items-center gap-2 text-sm">
              <FaDownload /> Export CSV
            </button>
          )}
          <div className="relative w-full sm:w-64">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10 text-sm" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{donations.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Donations</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{total.toLocaleString()} ETB</p>
          <p className="text-xs text-gray-500 mt-1">Total Amount</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-3 font-medium">Campaign</th>
              <th className="pb-3 font-medium">Donor</th>
              <th className="pb-3 font-medium">Amount</th>
              <th className="pb-3 font-medium">Method</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No donations yet</td></tr>
            ) : filtered.map((d) => (
              <tr key={d._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{d.campaign?.title || 'N/A'}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                  {d.isAnonymous ? 'Anonymous' : (d.donor?.fullName || 'Guest')}
                </td>
                <td className="py-3 pr-4 font-semibold text-gray-800 dark:text-gray-200">{d.amount?.toLocaleString()} ETB</td>
                <td className="py-3 pr-4 text-gray-500 capitalize">{d.paymentMethod?.replace('_', ' ')}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    d.paymentStatus === 'completed' ? 'badge-resolved' : d.paymentStatus === 'pending' ? 'badge-pending' : 'badge-rejected'
                  }`}>{d.paymentStatus}</span>
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
