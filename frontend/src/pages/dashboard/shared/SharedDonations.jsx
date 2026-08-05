import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FaHandHoldingHeart, FaCheckCircle, FaTimesCircle, FaClock, FaUsers,
  FaBullseye, FaSearch, FaFileCsv, FaFileExcel, FaFilePdf,
} from 'react-icons/fa';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { donationAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

const CHART_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_BADGE = {
  pending_verification: 'badge-pending',
  verified: 'badge-resolved',
  rejected: 'badge-rejected',
};

export default function SharedDonations() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState('');

  const isWoredaRole = user?.role === 'woreda' || user?.role === 'WOREDA_HEAD';
  const officeLabel = isWoredaRole
    ? (user?.woredaName || user?.woreda || 'Woreda')
    : (user?.subcity || 'Subcity');

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        donationAPI.getOfficeStats(),
        donationAPI.getOffice({ limit: 100, sort: 'newest' }),
      ]);
      setStats(statsRes.data.data || {});
      setDonations(listRes.data.data || []);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to load donations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const res = await donationAPI.exportOffice(format, {
        status: status || undefined,
        campaign: campaignFilter || undefined,
        search: search || undefined,
      });
      const date = new Date().toISOString().split('T')[0];
      downloadBlob(res.data, `ethiobridge-office-donations-${date}.${format === 'pdf' ? 'pdf' : format}`);
      toast.success(`${format.toUpperCase()} exported`);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting('');
    }
  };

  const filtered = donations.filter((d) => {
    if (status && d.verificationStatus !== status) return false;
    if (campaignFilter && d.campaign?._id !== campaignFilter) return false;
    if (search && !`${d.referenceNumber} ${d.fullName} ${d.phone} ${d.campaign?.title}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading && !stats) return <LoadingSpinner />;

  const campaigns = stats?.performance?.length
    ? stats.performance.map((p) => ({ _id: p._id, title: p.title }))
    : [];

  const statCards = [
    { label: 'Verified Raised', value: `${(stats?.totalRaised || 0).toLocaleString()} ETB`, color: 'text-green-600', icon: <FaCheckCircle /> },
    { label: 'Total Committed', value: `${(stats?.totalCommitted || 0).toLocaleString()} ETB`, color: 'text-gray-800 dark:text-gray-200', icon: <FaHandHoldingHeart /> },
    { label: 'Pending Verification', value: stats?.pendingCount || 0, color: 'text-amber-500', icon: <FaClock /> },
    { label: 'Donors', value: stats?.donorCount || 0, color: 'text-blue-600', icon: <FaUsers /> },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Office Donations</h2>
          <p className="text-sm text-gray-500">
            Donations collected for the {officeLabel} office — <FaBullseye className="inline" /> target {stats ? `${(stats.totalGoal || 0).toLocaleString()} ETB` : '—'} across {stats?.activeCampaigns || 0} active campaign(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { f: 'csv', icon: <FaFileCsv /> },
            { f: 'excel', icon: <FaFileExcel /> },
            { f: 'pdf', icon: <FaFilePdf /> },
          ].map(({ f, icon }) => (
            <button key={f} onClick={() => handleExport(f)} disabled={!!exporting} className="btn-secondary flex items-center gap-2 text-sm">
              {exporting === f ? <span className="w-4 h-4 border-2 border-gray-400 border-t-primary-600 rounded-full animate-spin" /> : icon} {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-4">
            <div className={`w-10 h-10 rounded-xl bg-primary-50 dark:bg-gray-700 flex items-center justify-center text-lg mb-2 ${s.color}`}>{s.icon}</div>
            <p className="text-base font-bold text-gray-800 dark:text-gray-200 truncate">{s.value}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Campaign performance chart */}
      {stats?.performance?.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FaBullseye className="text-primary-500" />
            <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Campaign Performance (verified)</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.performance.map((p) => ({ ...p, name: p.title || 'General' }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ETB`} />
              <Bar dataKey="total" name="Raised" radius={[4, 4, 0, 0]}>
                {stats.performance.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field text-sm">
            <option value="">All Statuses</option>
            <option value="pending_verification">Pending Verification</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="input-field text-sm col-span-2 lg:col-span-2">
            <option value="">All Campaigns</option>
            {(campaigns.length ? campaigns : donations.filter((d) => d.campaign).map((d) => d.campaign)).map((c) => (
              <option key={c._id} value={c._id}>{c.title || c.name || 'General'}</option>
            ))}
          </select>
          <div className="relative col-span-2 lg:col-span-3">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search reference, donor, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10 text-sm" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-3 font-medium">Reference</th>
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
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No donations found for the {officeLabel} office</td></tr>
            ) : filtered.map((d) => (
              <tr key={d._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="py-3 pr-4 font-mono text-xs text-primary-600 dark:text-primary-400">{d.referenceNumber}</td>
                <td className="py-3 pr-4 text-gray-800 dark:text-gray-200 max-w-[220px] truncate">{d.campaign?.title || 'General'}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{d.isAnonymous ? 'Anonymous' : (d.fullName || d.donorName || 'Guest')}</td>
                <td className="py-3 pr-4 font-semibold text-gray-800 dark:text-gray-200">{d.amount?.toLocaleString()} ETB</td>
                <td className="py-3 pr-4 text-gray-500 capitalize">{d.paymentMethodName || d.paymentMethod?.replace(/_/g, ' ')}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[d.verificationStatus] || 'badge-pending'}`}>{d.verificationStatus?.replace(/_/g, ' ')}</span>
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
