import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaPlus, FaHeart, FaExternalLinkAlt } from 'react-icons/fa';
import { campaignAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function NGOCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showReportSelector, setShowReportSelector] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        campaignAPI.getMy({ limit: 50 }),
        campaignAPI.getStats(),
      ]);
      setCampaigns(cRes.data.data || []);
      setStats(sRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Emergency Campaigns</h2>
          <p className="text-sm text-gray-500">Manage your emergency fundraising campaigns</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <FaPlus /> Create Emergency Campaign
          </button>
          <button onClick={() => setShowReportSelector(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <FaPlus /> Create from Report
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.totalCampaigns, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
            { label: 'Active', value: stats.activeCampaigns, color: 'bg-green-100 dark:bg-green-900/20 text-green-600' },
            { label: 'Raised', value: `${(stats.totalRaised || 0).toLocaleString()} ETB`, color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' },
            { label: 'Donors', value: stats.totalDonors || 0, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
          ].map((s, i) => (
            <div key={i} className="card text-center">
              <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center text-lg mx-auto mb-2`}>{s.value}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <div className="text-center py-16 card">
            <FaHeart className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No emergency campaigns yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create emergency fundraising campaigns from approved emergency reports</p>
          </div>
        ) : campaigns.map((c, i) => (
          <motion.div
            key={c._id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="card flex flex-col sm:flex-row items-start sm:items-center gap-4"
          >
            <img
              src={c.image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=100&q=80'}
              alt=""
              className="w-16 h-16 rounded-xl object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{c.title}</h3>
              <div className="flex flex-wrap gap-2 text-xs text-gray-400 mt-1">
                <span className={`px-2 py-0.5 rounded-full ${
                  c.status === 'active' ? 'badge-active' : c.status === 'pending' ? 'badge-pending' : c.status === 'completed' ? 'badge-resolved' : 'badge-rejected'
                }`}>{c.status}</span>
                <span>🚨 Emergency</span>
                <span>{c.donors || 0} donors</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-gray-800 dark:text-gray-200">{c.raisedAmount?.toLocaleString()} ETB</p>
              <p className="text-xs text-gray-400">of {c.goalAmount?.toLocaleString()} ETB</p>
            </div>
            <a
              href={`/fundraising/${c._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            >
              <FaExternalLinkAlt />
            </a>
          </motion.div>
        ))}
      </div>

      {showCreate && (
        <NGOCampaignForm
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); loadData(); }}
        />
      )}

      {showReportSelector && (
        <NGOReportSelector
          onClose={() => setShowReportSelector(false)}
          onSuccess={() => { setShowReportSelector(false); loadData(); }}
        />
      )}
    </div>
  );
}

function NGOReportSelector({ onClose, onSuccess }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [goalAmount, setGoalAmount] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await campaignAPI.getAvailableReports();
        setReports(res.data.data || []);
      } catch (err) {
        toast.error('Failed to load reports');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreate = async () => {
    if (!selected || !goalAmount || !endDate) {
      toast.error('Select a report and fill goal/end date');
      return;
    }
    setSubmitting(true);
    try {
      await campaignAPI.createFromReport({
        reportId: selected._id,
        reportType: selected.type,
        goalAmount: Number(goalAmount),
        endDate,
      });
      toast.success('Emergency campaign created from report!');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Create Campaign from Emergency Report</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="text-center text-gray-400 py-8">Loading reports...</p>
          ) : reports.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No active emergency reports available.</p>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
              {reports.map((r) => (
                <div
                  key={r._id}
                  onClick={() => setSelected(r)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selected?._id === r._id
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex gap-3">
                    {r.image && (
                      <img src={r.image} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{r.title}</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{r.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {r.location?.region && `${r.location.region}`}
                        {r.location?.city && `, ${r.location.city}`}
                        {r.victims && ` — ${r.victims} affected`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal Amount (ETB) *</label>
                <input type="number" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} className="input-field text-sm" min="1" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date *</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field text-sm" required />
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} disabled={!selected || submitting || !goalAmount || !endDate} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
              {submitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create from Report</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary py-2.5 px-6">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NGOCampaignForm({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    campaignType: 'emergency',
    goalAmount: '',
    endDate: '',
    location: { region: '', city: '', specificLocation: '' },
    image: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.goalAmount || !form.endDate) {
      toast.error('Please fill all required fields');
      return;
    }
    setLoading(true);
    try {
      await campaignAPI.create(form);
      toast.success('Emergency campaign created! Awaiting admin approval.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Create Emergency Campaign</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field text-sm resize-none" rows={4} required />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal Amount (ETB) *</label>
              <input type="number" value={form.goalAmount} onChange={(e) => setForm({ ...form, goalAmount: e.target.value })} className="input-field text-sm" min="1" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date *</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input-field text-sm" required />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Region</label>
              <input type="text" value={form.location.region} onChange={(e) => setForm({ ...form, location: { ...form.location, region: e.target.value } })} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
              <input type="text" value={form.location.city} onChange={(e) => setForm({ ...form, location: { ...form.location, city: e.target.value } })} className="input-field text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
            <input type="url" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className="input-field text-sm" placeholder="https://..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><FaPlus /> Create Emergency Campaign</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary py-2.5 px-6">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
