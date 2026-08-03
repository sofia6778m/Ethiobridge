import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaCheck, FaTimes, FaEye, FaSearch, FaBan, FaChartLine, FaShieldAlt } from 'react-icons/fa';
import { campaignAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showFraud, setShowFraud] = useState(false);
  const [fraudData, setFraudData] = useState(null);
  const [showFinancial, setShowFinancial] = useState(false);
  const [financialReport, setFinancialReport] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await campaignAPI.getAll({ limit: 100 });
      setCampaigns(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await campaignAPI.approve(id);
      toast.success('Campaign approved and is now active');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    }
  };

  const handleReject = async (id) => {
    if (!confirm('Reject this campaign? It will be closed.')) return;
    try {
      await campaignAPI.reject(id);
      toast.success('Campaign rejected and closed');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Rejection failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this campaign permanently?')) return;
    try {
      await campaignAPI.delete(id);
      toast.success('Campaign deleted');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleFraudDetection = async () => {
    try {
      const res = await campaignAPI.detectFraud();
      setFraudData(res.data.data || []);
      setShowFraud(true);
    } catch (err) {
      toast.error('Failed to load fraud data');
    }
  };

  const handleFinancialReport = async () => {
    try {
      const res = await campaignAPI.getFinancialReports();
      setFinancialReport(res.data.data || {});
      setShowFinancial(true);
    } catch (err) {
      toast.error('Failed to load financial report');
    }
  };

  const filtered = campaigns.filter((c) => {
    if (filter === 'pending') return c.status === 'pending';
    if (filter === 'active') return c.status === 'active';
    if (filter === 'completed') return c.status === 'completed';
    return true;
  }).filter((c) =>
    !search || c.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  const pendingCount = campaigns.filter((c) => c.status === 'pending').length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Campaign Management</h2>
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? (
              <span className="text-amber-600 font-medium">{pendingCount} pending approval</span>
            ) : 'All campaigns'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleFraudDetection} className="btn-secondary flex items-center gap-2 text-sm">
            <FaShieldAlt /> Fraud Check
          </button>
          <button onClick={handleFinancialReport} className="btn-secondary flex items-center gap-2 text-sm">
            <FaChartLine /> Financial Report
          </button>
          <div className="relative w-full sm:w-56">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'all', label: `All (${campaigns.length})` },
          { id: 'pending', label: `Pending (${pendingCount})` },
          { id: 'active', label: `Active (${campaigns.filter(c => c.status === 'active').length})` },
          { id: 'completed', label: `Completed (${campaigns.filter(c => c.status === 'completed').length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filter === t.id
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-3 font-medium">Campaign</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Raised</th>
              <th className="pb-3 font-medium">Goal</th>
              <th className="pb-3 font-medium">Donors</th>
              <th className="pb-3 font-medium">Created</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">No campaigns found</td>
              </tr>
            ) : filtered.map((c, i) => (
              <motion.tr
                key={c._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={c.image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=60&q=80'}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]">{c.title}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{c.description}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    c.campaignType === 'emergency' ? 'bg-red-100 dark:bg-red-900/20 text-red-700' :
                    c.campaignType === 'infrastructure' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700' :
                    'bg-purple-100 dark:bg-purple-900/30 text-purple-700'
                  }`}>{c.campaignType}</span>
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    c.status === 'active' ? 'badge-active' : c.status === 'pending' ? 'badge-pending' : c.status === 'completed' ? 'badge-resolved' : 'badge-rejected'
                  }`}>{c.status}</span>
                </td>
                <td className="py-3 pr-4 font-medium text-gray-800 dark:text-gray-200">{c.raisedAmount?.toLocaleString()} ETB</td>
                <td className="py-3 pr-4 text-gray-500">{c.goalAmount?.toLocaleString()} ETB</td>
                <td className="py-3 pr-4 text-gray-500">{c.donors || 0}</td>
                <td className="py-3 pr-4 text-gray-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    {c.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(c._id)}
                          className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600"
                          title="Approve"
                        >
                          <FaCheck />
                        </button>
                        <button
                          onClick={() => handleReject(c._id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          title="Reject"
                        >
                          <FaBan />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSelected(selected === c._id ? null : c._id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                      title="View Details"
                    >
                      <FaEye />
                    </button>
                    <button
                      onClick={() => handleDelete(c._id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                      title="Delete"
                    >
                      <FaTimes />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6">
            <CampaignDetail campaign={campaigns.find(c => c._id === selected)} onClose={() => setSelected(null)} onApprove={handleApprove} onReject={handleReject} onDelete={handleDelete} />
          </div>
        </div>
      )}

      {/* Fraud Detection Modal */}
      {showFraud && fraudData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowFraud(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100"><FaShieldAlt className="inline mr-2 text-red-500" />Fraud Detection</h3>
              <button onClick={() => setShowFraud(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
            </div>
            {fraudData.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No suspicious activity detected.</p>
            ) : (
              <div className="space-y-3">
                {fraudData.map((item, i) => (
                  <div key={i} className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                    <p className="font-semibold text-red-700 dark:text-red-400">{item.campaign?.title || 'Unknown'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.reason}</p>
                    <p className="text-xs text-gray-500 mt-1">Confidence: {(item.confidence * 100).toFixed(0)}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Financial Report Modal */}
      {showFinancial && financialReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowFinancial(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100"><FaChartLine className="inline mr-2 text-primary-500" />Financial Report</h3>
              <button onClick={() => setShowFinancial(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="card p-4 text-center">
                <p className="text-xs text-gray-500">Total Raised</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{(financialReport.totalRaised || 0).toLocaleString()} ETB</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-gray-500">Total Donors</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{financialReport.totalDonors || 0}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-gray-500">Active Campaigns</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{financialReport.activeCampaigns || 0}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-gray-500">Completed</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{financialReport.completedCampaigns || 0}</p>
              </div>
            </div>
            {financialReport.campaigns?.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Campaign Breakdown</h4>
                <div className="space-y-2">
                  {financialReport.campaigns.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="text-gray-700 dark:text-gray-300 truncate mr-4">{c.title}</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{c.raisedAmount?.toLocaleString()} ETB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignDetail({ campaign, onClose, onApprove, onReject, onDelete }) {
  if (!campaign) return null;
  const progress = campaign.goalAmount > 0 ? Math.min((campaign.raisedAmount / campaign.goalAmount) * 100, 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Campaign Details</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
      </div>
      <img
        src={campaign.image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400&q=80'}
        alt=""
        className="w-full h-48 object-cover rounded-xl mb-4"
      />
      <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-lg mb-2">{campaign.title}</h4>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{campaign.description}</p>
      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div className="card py-3 px-4 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-xs">Raised</p>
          <p className="font-bold text-gray-800 dark:text-gray-200">{campaign.raisedAmount?.toLocaleString()} ETB</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-xs">Goal</p>
          <p className="font-bold text-gray-800 dark:text-gray-200">{campaign.goalAmount?.toLocaleString()} ETB</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-xs">Donors</p>
          <p className="font-bold text-gray-800 dark:text-gray-200">{campaign.donors || 0}</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-xs">Type</p>
          <p className="font-bold text-gray-800 dark:text-gray-200 capitalize">{campaign.campaignType}</p>
        </div>
      </div>
      <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-4 overflow-hidden">
        <div className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex gap-2">
        {campaign.status === 'pending' && (
          <>
            <button onClick={() => { onApprove(campaign._id); onClose(); }} className="btn-primary flex-1 py-2 flex items-center justify-center gap-2">
              <FaCheck /> Approve
            </button>
            <button onClick={() => { onReject(campaign._id); onClose(); }} className="btn-danger flex-1 py-2 flex items-center justify-center gap-2">
              <FaBan /> Reject
            </button>
          </>
        )}
        <button onClick={() => { onDelete(campaign._id); onClose(); }} className="btn-danger flex-1 py-2 flex items-center justify-center gap-2">
          <FaTimes /> Delete
        </button>
      </div>
    </div>
  );
}
