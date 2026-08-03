import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { alertAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import { toast } from 'react-toastify';

const CATEGORIES = {
  flood:        { icon: '🌊', label: 'Flood Warning',          color: 'blue' },
  rainfall:     { icon: '🌧️', label: 'Heavy Rainfall Advisory', color: 'indigo' },
  road_closure: { icon: '🚧', label: 'Road Closure / Blockage', color: 'orange' },
  health:       { icon: '🏥', label: 'Health & Outbreak Alert', color: 'red' },
  power_outage: { icon: '⚡', label: 'Power Outage Notice',     color: 'yellow' },
};

const SEVERITY_STYLES = {
  Info:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  Warning:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  Critical: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300',
};

const STATUS_STYLES = {
  active:   'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  expired:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  archived: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500',
};

export default function GovAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ status: '', category: '', severity: '' });
  const [selected, setSelected] = useState(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (filter.status) params.status = filter.status;
      if (filter.category) params.category = filter.category;
      if (filter.severity) params.severity = filter.severity;
      const res = await alertAPI.getAll(params);
      setAlerts(res.data?.data?.alerts || []);
      setPages(res.data?.data?.pages || 1);
      setTotal(res.data?.data?.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, [page, filter]);

  const handleStatusUpdate = async (id, status) => {
    try {
      await alertAPI.updateStatus(id, { status });
      toast.success(`Alert ${status === 'active' ? 'reactivated' : status}`);
      setSelected(null);
      fetchAlerts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this alert permanently?')) return;
    try {
      await alertAPI.delete(id);
      toast.success('Alert deleted');
      setSelected(null);
      fetchAlerts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📢 Broadcast Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} total alerts</p>
        </div>
        <Link
          to="/dashboard/government/alerts/create"
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm inline-flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create New Alert
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={filter.status} onChange={e => { setFilter(p => ({ ...p, status: e.target.value })); setPage(1); }}
            className="input-field w-auto text-sm">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="archived">Archived</option>
          </select>
          <select value={filter.category} onChange={e => { setFilter(p => ({ ...p, category: e.target.value })); setPage(1); }}
            className="input-field w-auto text-sm">
            <option value="">All Categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
          <select value={filter.severity} onChange={e => { setFilter(p => ({ ...p, severity: e.target.value })); setPage(1); }}
            className="input-field w-auto text-sm">
            <option value="">All Severities</option>
            <option value="Info">ℹ️ Info</option>
            <option value="Warning">⚠️ Warning</option>
            <option value="Critical">🔴 Critical</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <LoadingSpinner />
      ) : alerts.length === 0 ? (
        <EmptyState icon="📢" title="No alerts found" description="Create your first broadcast alert to notify citizens." />
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const cat = CATEGORIES[alert.category] || {};
            return (
              <div key={alert._id}
                onClick={() => setSelected(alert)}
                className="card hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-amber-500">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg">{cat.icon}</span>
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{alert.title}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_STYLES[alert.severity] || ''}`}>
                        {alert.severity}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[alert.status] || ''}`}>
                        {alert.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{alert.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span>📍 {alert.region}{alert.zone ? `, ${alert.zone}` : ''}{alert.woreda ? `, ${alert.woreda}` : ''}</span>
                      <span>•</span>
                      <span>{new Date(alert.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>By {alert.publishedByName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">👁 {alert.views || 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{CATEGORIES[selected.category]?.icon}</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${SEVERITY_STYLES[selected.severity]}`}>
                    {selected.severity}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{selected.title}</h2>

              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4">
                <span>📍 {selected.region}{selected.zone ? `, ${selected.zone}` : ''}{selected.woreda ? `, ${selected.woreda}` : ''}</span>
                <span>•</span>
                <span>{new Date(selected.createdAt).toLocaleString()}</span>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{selected.description}</p>
              </div>

              <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                Published by {selected.publishedByName}{selected.publishedByOrg ? ` (${selected.publishedByOrg})` : ''} • {selected.views || 0} views
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
                {selected.status === 'active' ? (
                  <>
                    <button onClick={() => handleStatusUpdate(selected._id, 'expired')}
                      className="btn-secondary text-xs py-2 px-4">
                      Expire Alert
                    </button>
                    <button onClick={() => handleStatusUpdate(selected._id, 'archived')}
                      className="btn-secondary text-xs py-2 px-4">
                      Archive
                    </button>
                  </>
                ) : selected.status === 'expired' ? (
                  <button onClick={() => handleStatusUpdate(selected._id, 'active')}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors">
                    Reactivate
                  </button>
                ) : (
                  <button onClick={() => handleStatusUpdate(selected._id, 'active')}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors">
                    Reactivate
                  </button>
                )}
                <button onClick={() => handleDelete(selected._id)}
                  className="btn-danger text-xs py-2 px-4 ml-auto">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
