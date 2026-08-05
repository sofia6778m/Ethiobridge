import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaPlus, FaCheck, FaTimes, FaEye, FaSearch, FaBullseye, FaPause, FaFlag } from 'react-icons/fa';
import { campaignAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

const URGENCY_STYLES = {
  low: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  normal: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  high: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const DEPARTMENTS = ['Road', 'Water', 'Electricity', 'Public Space', 'Drainage', 'Other'];

export default function SharedCampaigns() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);

  const isWoredaRole = user?.role === 'woreda' || user?.role === 'WOREDA_HEAD';
  const officeLabel = isWoredaRole
    ? (user?.woredaName || user?.woreda || 'Woreda')
    : (user?.subcity || 'Subcity');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await campaignAPI.getAll({ limit: 100 });
      setCampaigns(res.data.data || []);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (c) => {
    if (!confirm(`Close the campaign "${c.title}"? Donations will stop being accepted.`)) return;
    try {
      await campaignAPI.update(c._id, { status: 'closed' });
      toast.success('Campaign closed');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to close campaign');
    }
  };

  const stats = {
    totalRaised: campaigns.reduce((s, c) => s + (c.raisedAmount || 0), 0),
    totalGoal: campaigns.reduce((s, c) => s + (c.goalAmount || 0), 0),
    active: campaigns.filter((c) => c.status === 'active').length,
    pending: campaigns.filter((c) => c.status === 'pending').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
  };

  const filtered = campaigns
    .filter((c) => {
      if (filter === 'active') return c.status === 'active';
      if (filter === 'pending') return c.status === 'pending';
      if (filter === 'completed') return c.status === 'completed';
      if (filter === 'closed') return c.status === 'closed';
      return true;
    })
    .filter((c) => !search || c.title?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fundraising Campaigns</h2>
          <p className="text-sm text-gray-500">
            {officeLabel} office — create and manage campaigns for your local government office
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setEditing(null); setShowCreate(true); }} className="btn-primary flex items-center gap-2 text-sm">
            <FaPlus /> New Campaign
          </button>
          <div className="relative w-full sm:w-56">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10 text-sm" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.totalRaised.toLocaleString()} ETB</p>
          <p className="text-xs text-gray-500 mt-1">Total Raised</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{stats.totalGoal.toLocaleString()} ETB</p>
          <p className="text-xs text-gray-500 mt-1">Target</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
          <p className="text-xs text-gray-500 mt-1">Active</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{stats.pending}</p>
          <p className="text-xs text-gray-500 mt-1">Pending Approval</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['all', 'active', 'pending', 'completed', 'closed'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize whitespace-nowrap transition-all ${
              filter === f
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
            }`}>
            {f} ({f === 'all' ? campaigns.length : campaigns.filter((c) => c.status === f).length})
          </button>
        ))}
      </div>

      {/* Campaign list */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3 card p-12 text-center text-gray-400">
            No campaigns found. Create your first campaign to start raising funds for {officeLabel}.
          </div>
        ) : filtered.map((c, i) => {
          const progress = c.goalAmount > 0 ? Math.min((c.raisedAmount / c.goalAmount) * 100, 100) : 0;
          return (
            <motion.div key={c._id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="card overflow-hidden flex flex-col">
              <div className="relative h-40 -mx-6 -mt-6 mb-4 overflow-hidden">
                <img src={c.image || 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=400&q=80'} alt="" className="w-full h-full object-cover" />
                <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                  c.status === 'active' ? 'badge-active' : c.status === 'pending' ? 'badge-pending' : c.status === 'completed' ? 'badge-resolved' : 'badge-rejected'
                }`}>{c.status}</span>
                <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${URGENCY_STYLES[c.urgencyLevel] || URGENCY_STYLES.normal}`}>
                  <FaFlag className="inline mr-1" />{c.urgencyLevel}
                </span>
              </div>
              <h3 className="font-bold text-gray-800 dark:text-gray-200 line-clamp-1 mb-1">{c.title}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{c.description}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {c.department && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{c.department}</span>}
                {c.woreda && <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">{c.woreda}</span>}
              </div>
              <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-2 overflow-hidden">
                <div className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{c.raisedAmount?.toLocaleString()} / {c.goalAmount?.toLocaleString()} ETB</span>
                <span>{Math.round(progress)}% · {c.donors || 0} donors</span>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button onClick={() => { setEditing(c); setShowCreate(true); }} className="btn-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1">
                  <FaPause /> Edit
                </button>
                <button onClick={() => setSelected(selected === c._id ? null : c._id)} className="btn-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1">
                  <FaEye /> Details
                </button>
                {c.status === 'active' && (
                  <button onClick={() => handleClose(c)} className="btn-danger flex-1 py-2 text-xs flex items-center justify-center gap-1">
                    <FaTimes /> Close
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6">
            {(() => {
              const c = campaigns.find((x) => x._id === selected);
              if (!c) return null;
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Campaign Details</h3>
                    <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
                  </div>
                  <img src={c.image || 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=400&q=80'} alt="" className="w-full h-48 object-cover rounded-xl mb-4" />
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-lg mb-2">{c.title}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{c.description}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                    <div className="card py-3 px-4 text-center"><p className="text-gray-500 text-xs">Raised</p><p className="font-bold">{c.raisedAmount?.toLocaleString()} ETB</p></div>
                    <div className="card py-3 px-4 text-center"><p className="text-gray-500 text-xs">Goal</p><p className="font-bold">{c.goalAmount?.toLocaleString()} ETB</p></div>
                    <div className="card py-3 px-4 text-center"><p className="text-gray-500 text-xs">Donors</p><p className="font-bold">{c.donors || 0}</p></div>
                    <div className="card py-3 px-4 text-center"><p className="text-gray-500 text-xs">Department</p><p className="font-bold capitalize">{c.department || 'General'}</p></div>
                    <div className="card py-3 px-4 text-center col-span-2"><p className="text-gray-500 text-xs">Location</p><p className="font-bold">{c.subcity}{c.woreda ? ` · ${c.woreda}` : ''}</p></div>
                  </div>
                  <p className="text-xs text-gray-400">Created: {new Date(c.createdAt).toLocaleDateString()} · Ends: {new Date(c.endDate).toLocaleDateString()}</p>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CampaignForm
              editCampaign={editing}
              officeLabel={officeLabel}
              isWoreda={isWoredaRole}
              onClose={() => setShowCreate(false)}
              onSuccess={() => { setShowCreate(false); toast.success(editing ? 'Campaign updated' : 'Campaign created — awaiting admin approval'); loadData(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignForm({ editCampaign, officeLabel, isWoreda, onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: editCampaign?.title || '',
    description: editCampaign?.description || '',
    campaignType: editCampaign?.campaignType || 'infrastructure',
    department: editCampaign?.department || '',
    goalAmount: editCampaign?.goalAmount || '',
    urgencyLevel: editCampaign?.urgencyLevel || 'normal',
    startDate: editCampaign?.startDate ? new Date(editCampaign.startDate).toISOString().split('T')[0] : '',
    endDate: editCampaign?.endDate ? new Date(editCampaign.endDate).toISOString().split('T')[0] : '',
    image: editCampaign?.image || '',
    estimatedBeneficiaries: editCampaign?.estimatedBeneficiaries || '',
    destinationAccount: {
      bankName: editCampaign?.destinationAccount?.bankName || '',
      accountNumber: editCampaign?.destinationAccount?.accountNumber || '',
      accountHolder: editCampaign?.destinationAccount?.accountHolder || '',
      walletNumber: editCampaign?.destinationAccount?.walletNumber || '',
      instructions: editCampaign?.destinationAccount?.instructions || '',
    },
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
      if (editCampaign) {
        await campaignAPI.update(editCampaign._id, form);
      } else {
        await campaignAPI.create(form);
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save campaign');
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setAccount = (k) => (e) => setForm({ ...form, destinationAccount: { ...form.destinationAccount, [k]: e.target.value } });

  return (
    <div>
      <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          <FaBullseye className="inline mr-2 text-primary-500" />{editCampaign ? 'Edit Campaign' : `New Campaign — ${officeLabel}`}
        </h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><FaTimes /></button>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
          <input type="text" value={form.title} onChange={set('title')} className="input-field text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
          <textarea value={form.description} onChange={set('description')} className="input-field text-sm resize-none" rows={4} required />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
            <select value={form.department} onChange={set('department')} className="input-field text-sm">
              <option value="">General / Mixed</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Type *</label>
            <select value={form.campaignType} onChange={set('campaignType')} className="input-field text-sm">
              <option value="infrastructure">Infrastructure</option>
              <option value="general">General</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Amount (ETB) *</label>
            <input type="number" value={form.goalAmount} onChange={set('goalAmount')} className="input-field text-sm" min="1" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Urgency Level</label>
            <select value={form.urgencyLevel} onChange={set('urgencyLevel')} className="input-field text-sm">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Est. Beneficiaries</label>
            <input type="number" value={form.estimatedBeneficiaries} onChange={set('estimatedBeneficiaries')} className="input-field text-sm" min="0" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input type="date" value={form.startDate} onChange={set('startDate')} className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date *</label>
            <input type="date" value={form.endDate} onChange={set('endDate')} className="input-field text-sm" required />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Image URL</label>
          <input type="url" value={form.image} onChange={set('image')} className="input-field text-sm" placeholder="https://..." />
        </div>

        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Bank / Wallet Destination Account</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Bank Name</label>
              <input type="text" value={form.destinationAccount.bankName} onChange={setAccount('bankName')} className="input-field text-sm" placeholder="e.g. CBE" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Account Number</label>
              <input type="text" value={form.destinationAccount.accountNumber} onChange={setAccount('accountNumber')} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Account Holder</label>
              <input type="text" value={form.destinationAccount.accountHolder} onChange={setAccount('accountHolder')} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Wallet Number (Telebirr / CBE Birr)</label>
              <input type="text" value={form.destinationAccount.walletNumber} onChange={setAccount('walletNumber')} className="input-field text-sm" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm text-gray-500 mb-1">Payment Instructions</label>
            <textarea value={form.destinationAccount.instructions} onChange={setAccount('instructions')} className="input-field text-sm resize-none" rows={2} placeholder="Optional instructions shown to donors" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><FaCheck /> {editCampaign ? 'Update' : 'Create'} Campaign</>}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary py-2.5 px-6">Cancel</button>
        </div>
      </form>
    </div>
  );
}
