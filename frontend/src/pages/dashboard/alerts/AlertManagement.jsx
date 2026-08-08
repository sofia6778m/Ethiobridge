import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { alertAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import { useAuth } from '../../../context/AuthContext';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  LIVE_STATUSES,
  getCategory,
  getSeverity,
  categoryLabel,
  SEVERITY_STYLES,
  STATUS_STYLES,
  getCategoryBadge,
  canModifyAlertForUser,
  alertLabelFor,
  alertCreatedByMeFor,
  isGlobalAlertRole,
  inAlertScopeFor,
} from '../../../utils/alertMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';

// Reusable, role-scoped alert management view used by the government, admin
// and shared (subcity/woreda) dashboards. The backend scopes the list by role.
export default function AlertManagement({ createPath, onCreated }) {
  const { t } = useTranslation();
  const { user } = useAuth() || {};
  const { on } = useSocket() || {};

  // Scope isolation: global admins manage every alert in their dashboard; a
  // subcity/woreda admin may only edit/delete alerts they created themselves,
  // while alerts received from others (e.g. the System Admin) stay read-only.
  const isGlobal = isGlobalAlertRole(user?.role);
  const isLocalityAdmin = Boolean(user) && !isGlobal;
  const canManageForViewer = (alert) => {
    if (!canModifyAlertForUser(user, alert)) return false;
    if (isGlobal) return true;
    return alertCreatedByMeFor(user, alert);
  };

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState({ status: '', category: '', severity: '' });
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await alertAPI.getStats();
      setStats(res.data?.data || null);
    } catch {
      /* silent */
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
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
      toast.error(e.response?.data?.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Whether an incoming real-time alert belongs in the currently filtered list.
  const matchesFilter = useCallback((alert) => {
    if (!alert) return false;
    if (filter.status && alert.status !== filter.status) return false;
    if (filter.severity && alert.severity !== filter.severity) return false;
    if (filter.category && alert.category !== filter.category) return false;
    return true;
  }, [filter]);

  // Dynamic category filter: distinct categories from existing alerts (exact
  // values), so the dropdown always matches the data instead of a hardcoded list.
  useEffect(() => {
    alertAPI.getCategories()
      .then((res) => {
        const cats = Array.isArray(res.data?.data?.categories) ? res.data.data.categories : [];
        setCategories(cats.filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
      })
      .catch(() => { /* keep the previous list */ });
  }, []);

  // Merge a category (from a real-time alert) into the dynamic dropdown.
  const mergeCategory = useCallback((value) => {
    if (!value || typeof value !== 'string') return;
    const v = value.trim();
    if (!v) return;
    setCategories((prev) => {
      if (prev.includes(v)) return prev;
      return [...prev, v].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    });
  }, []);

  // Real-time synchronization: create, edit, delete and status changes arrive
  // over the socket so every dashboard reflects them instantly.
  useEffect(() => {
    if (!on) return;
    const cleanups = [
      on('alert:new', (incoming) => {
        if (!incoming?._id) return;
        mergeCategory(incoming.category);
        setAlerts((prev) => {
          if (prev.some((a) => a._id === incoming._id)) return prev;
          if (!inAlertScopeFor(user, incoming)) return prev;
          if (!matchesFilter(incoming)) return prev;
          return [incoming, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        });
        fetchStats();
      }),
      on('alert:updated', (incoming) => {
        if (!incoming?._id) return;
        mergeCategory(incoming.category);
        setAlerts((prev) => {
          const exists = prev.some((a) => a._id === incoming._id);
          if (!exists) {
            if (!inAlertScopeFor(user, incoming)) return prev;
            if (!matchesFilter(incoming)) return prev;
            return [incoming, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          }
          return prev.map((a) => (a._id === incoming._id ? { ...a, ...incoming } : a));
        });
      }),
      on('alert:statusUpdate', (u) => {
        if (!u?._id) return;
        setAlerts((prev) => prev.map((a) => (a._id === u._id ? { ...a, status: u.status, severity: u.severity ?? a.severity } : a)));
        fetchStats();
      }),
      on('alert:deleted', (u) => {
        const id = u?._id;
        if (!id) return;
        setAlerts((prev) => prev.filter((a) => a._id !== id));
        setSelected((prev) => (prev?._id === id ? null : prev));
        fetchStats();
      }),
    ];
    return () => cleanups.forEach((off) => off && off());
  }, [on, matchesFilter, fetchStats, mergeCategory, user]);

  const handleStatusUpdate = async (id, status) => {
    try {
      await alertAPI.updateStatus(id, { status });
      toast.success(`Alert ${status === 'active' ? 'published' : status}`);
      setSelected(null);
      fetchAlerts();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  const handlePublish = async (id) => {
    try {
      await alertAPI.publish(id);
      toast.success('Alert published');
      setSelected(null);
      fetchAlerts();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to publish');
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this alert? It will be hidden from citizens.')) return;
    try {
      await alertAPI.archive(id);
      toast.success('Alert archived');
      setSelected(null);
      fetchAlerts();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await alertAPI.delete(deleteTarget._id);
      toast.success('Alert deleted');
      setSelected(null);
      fetchAlerts();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const res = await alertAPI.exportAlerts(format, {});
      const blob = new Blob([res.data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alerts.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const statCards = stats ? [
    { label: t('alert.total'), value: stats.total, color: 'bg-blue-100 dark:bg-blue-900/30', icon: '📊' },
    { label: t('alert.activeAlerts'), value: stats.byStatus?.active || 0, color: 'bg-green-100 dark:bg-green-900/20', icon: '✅' },
    { label: t('alert.scheduled'), value: stats.byStatus?.scheduled || 0, color: 'bg-blue-100 dark:bg-blue-900/30', icon: '📅' },
    { label: t('alert.emergencyActive'), value: stats.activeEmergency || 0, color: 'bg-red-100 dark:bg-red-900/30', icon: '🚨' },
  ] : [];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📢 {t('alert.manageTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} {t('alert.totalAlerts')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button onClick={() => handleExport('csv')} disabled={exporting}
            className="btn-secondary text-sm py-2.5 px-4 inline-flex items-center gap-2">
            {exporting === 'csv' ? <Spinner /> : <span>📄</span>} CSV
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting}
            className="btn-secondary text-sm py-2.5 px-4 inline-flex items-center gap-2">
            {exporting === 'pdf' ? <Spinner /> : <span>📕</span>} PDF
          </button>
          {createPath && (
            <Link to={createPath}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('alert.createNew')}
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((s) => (
            <div key={s.label} className="card flex items-center gap-3 p-4">
              <div className={`w-11 h-11 rounded-xl ${s.color} flex items-center justify-center text-xl shrink-0`}>{s.icon}</div>
              <div>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200 leading-none">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <select value={filter.status} onChange={e => { setFilter(p => ({ ...p, status: e.target.value })); setPage(1); }}
            className="input-field w-auto text-sm">
            <option value="">{t('alert.allStatuses')}</option>
            {ALERT_STATUSES.map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select value={filter.category} onChange={e => { setFilter(p => ({ ...p, category: e.target.value })); setPage(1); }}
            className="input-field w-auto text-sm">
            <option value="">{t('alert.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={filter.severity} onChange={e => { setFilter(p => ({ ...p, severity: e.target.value })); setPage(1); }}
            className="input-field w-auto text-sm">
            <option value="">{t('alert.allSeverities')}</option>
            {ALERT_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <LoadingSpinner />
      ) : alerts.length === 0 ? (
        <EmptyState icon="📢" title={t('alert.noAlerts')} description={t('alert.noAlertsManage')} />
      ) : (
        <div className="space-y-6">
          {(() => {
            const myAlerts = alerts.filter((a) => alertCreatedByMeFor(user, a));
            const receivedAlerts = alerts.filter((a) => !alertCreatedByMeFor(user, a));
            const badgeFor = (alert) => {
              if (!isLocalityAdmin) return null;
              if (alertCreatedByMeFor(user, alert)) {
                return { text: 'Created by you', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' };
              }
              return {
                text: isGlobalAlertRole(alert.createdByRole) ? 'Received from System Admin' : `Received from ${alert.createdByName || 'Admin'}`,
                cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
              };
            };
            const renderCard = (alert) => {
              const cat = getCategory(alert.category) || { icon: '📢' };
              const sev = getSeverity(alert.severity);
              const badge = badgeFor(alert);
              return (
                <div key={alert._id}
                  onClick={() => setSelected(alert)}
                  className={`card hover:shadow-md transition-shadow cursor-pointer border-l-4 ${SEVERITY_STYLES[alert.severity]?.leftBorder || 'border-l-blue-500'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-lg">{cat.icon}</span>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{alert.title}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_STYLES[alert.severity]?.badge || ''}`}>
                          {sev.icon} {sev.label}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[alert.status] || ''}`}>
                          {alert.status}
                        </span>
                        {badge && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`} title={badge.text}>
                            {badge.text}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{alert.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                        <span>📍 {alertLabelFor(user, alert)}</span>
                        <span>•</span>
                        <span>{new Date(alert.publishedAt || alert.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>By {alert.createdByName}</span>
                        {alert.attachments?.length > 0 && <span>📎 {alert.attachments.length}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">👁 {alert.views || 0}</span>
                      {alert.source === 'complaint_cluster' && (
                        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full" title="Generated from a complaint cluster">
                          ⚙️ Cluster
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            };

            if (!isLocalityAdmin) {
              return <div className="space-y-3">{alerts.map(renderCard)}</div>;
            }
            return (
              <>
                {receivedAlerts.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">📥 Received Alerts</h3>
                    <div className="space-y-3">{receivedAlerts.map(renderCard)}</div>
                  </div>
                )}
                {myAlerts.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">📝 My Created Alerts</h3>
                    <div className="space-y-3">{myAlerts.map(renderCard)}</div>
                  </div>
                )}
              </>
            );
          })()}
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
                  <span className="text-2xl">{getCategory(selected.category)?.icon || '📢'}</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${SEVERITY_STYLES[selected.severity]?.badge || ''}`}>
                    {getSeverity(selected.severity).icon} {getSeverity(selected.severity).label}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[selected.status] || ''}`}>
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

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {selected.category && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getCategoryBadge(selected.category)}`}>
                    {getCategory(selected.category)?.icon || '📢'} {categoryLabel(selected.category, selected.customCategory)}
                  </span>
                )}
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  📍 {alertLabelFor(user, selected)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-wrap">
                <span>{new Date(selected.publishedAt || selected.createdAt).toLocaleString()}</span>
                {selected.schedule?.startAt && selected.status === 'scheduled' && (
                  <>
                    <span>•</span>
                    <span>Scheduled for {new Date(selected.schedule.startAt).toLocaleString()}</span>
                  </>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{selected.description}</p>
              </div>

              <div className="text-xs text-gray-400 dark:text-gray-500 mb-4 space-y-1">
                <p>Published by {selected.createdByName}{selected.createdByOrg ? ` (${selected.createdByOrg})` : ''} • {selected.views || 0} views</p>
                {selected.sourceAuthority && <p>Source authority: {selected.sourceAuthority}</p>}
                {selected.emergencyContact && <p>Emergency contact: {selected.emergencyContact}</p>}
                {selected.scheduledAt && selected.status === 'scheduled' && (
                  <p>Scheduled for {new Date(selected.scheduledAt).toLocaleString()}</p>
                )}
                {selected.expiresAt && <p>Expires {new Date(selected.expiresAt).toLocaleString()}</p>}
                <p>Notified citizens: {selected.deliveryStats?.notifiedCitizens || 0} (📱 {selected.deliveryStats?.inApp || 0} • ✉️ {selected.deliveryStats?.email || 0} • 💬 {selected.deliveryStats?.sms || 0} • 🔔 {selected.deliveryStats?.push || 0})</p>
              </div>

              {/* Attachments */}
              {selected.attachments?.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">📎 Attachments</p>
                  <div className="space-y-1.5">
                    {selected.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        <span className="truncate">📄 {a.fileName || a.publicId}</span>
                        <span className="text-gray-400 shrink-0 ml-2">open ↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Safety instructions */}
              {selected.safetyInstructions?.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 mb-4">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">🛡️ Safety Instructions</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {selected.safetyInstructions.map((s, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-300">{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
                {(() => {
                  const scopedOut = !canModifyAlertForUser(user, selected);
                  const receivedReadOnly = !scopedOut && !isGlobal && !alertCreatedByMeFor(user, selected);
                  const manage = canManageForViewer(selected);
                  return (
                    <>
                      {scopedOut && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 py-2 px-1 mr-auto">
                          Read-only — this alert is outside your subcity/woreda.
                        </span>
                      )}
                      {receivedReadOnly && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 py-2 px-1 mr-auto">
                          Read-only — received from {isGlobalAlertRole(selected.createdByRole) ? 'the System Admin' : selected.createdByName || 'another admin'}. Only the creating admin can edit or delete this alert.
                        </span>
                      )}
                      {manage && ['draft', 'scheduled'].includes(selected.status) && (
                        <button onClick={() => handlePublish(selected._id)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors">
                          Publish Now
                        </button>
                      )}
                      {manage && LIVE_STATUSES.includes(selected.status) && (
                        <>
                          <button onClick={() => handleStatusUpdate(selected._id, 'expired')}
                            className="btn-secondary text-xs py-2 px-4">
                            Expire Alert
                          </button>
                          <button onClick={() => handleArchive(selected._id)}
                            className="btn-secondary text-xs py-2 px-4">
                            Archive
                          </button>
                        </>
                      )}
                      {manage && ['expired', 'archived'].includes(selected.status) && (
                        <button onClick={() => handlePublish(selected._id)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors">
                          Reactivate
                        </button>
                      )}
                      {manage && createPath && (
                        <Link to={`${createPath}?edit=${selected._id}`} className="btn-secondary text-xs py-2 px-4">
                          ✏️ Edit
                        </Link>
                      )}
                      <Link to={`/alerts/${selected._id}`} className="btn-secondary text-xs py-2 px-4">
                        View Public Page
                      </Link>
                      {manage && (
                        <button onClick={() => setDeleteTarget(selected)}
                          className="btn-danger text-xs py-2 px-4 ml-auto">
                          Delete
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete this alert?"
        message={`"${deleteTarget?.title}" will be permanently removed from every public page, all dashboards, cached lists and citizen notifications. This cannot be undone.`}
        confirmLabel="Delete Alert"
        cancelLabel="Cancel"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
}

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />;
}
