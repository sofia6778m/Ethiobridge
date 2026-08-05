import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI, complaintAPI, adminAPI } from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const INFRA_DEPARTMENTS = [
  'Roads Authority','Bridge Authority','Water Bureau','Electric Utility',
  'Education Bureau','Health Bureau','Disaster Risk Management',
  'Fire and Emergency Service','Municipality','General Services',
];

const COMPLAINT_STATUS_COLORS = {
  Submitted:      'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  'Under Review': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'In Progress':  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Resolved:       'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300',
  Rejected:       'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-300',
  Closed:         'bg-gray-100   text-gray-600   dark:bg-gray-700      dark:text-gray-300',
};

// ── Infrastructure tab ────────────────────────────────────────────────────────

function InfraTab() {
  const { t } = useTranslation();
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('');
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [selected,   setSelected]   = useState(null);
  const [action,     setAction]     = useState('approve');
  const [note,       setNote]       = useState('');
  const [saving,     setSaving]     = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [assignForm,  setAssignForm]  = useState({ assignedTo: '', assignedDepartment: '', dueDate: '' });
  const [govUsers,    setGovUsers]    = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await infraAPI.getAll({ search, status, page, limit: 10 });
      setReports(r.data.reports);
      setPages(r.data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [search, status, page]); // eslint-disable-line

  const { on } = useSocket() || {};
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  useEffect(() => {
    if (!on) return;
    const events = ['report:created','report:updated','report:assigned','report:bulk-updated','report:bulk-assigned','report:bulk-deleted'];
    const cleanups = events.map(e => on(e, () => fetchRef.current()));
    return () => cleanups.forEach(off => off && off());
  }, [on]);

  const handleVerify = async () => {
    setSaving(true);
    try {
      await infraAPI.verify(selected._id, { action, note });
      toast.success(t('dashboard.reportUpdatedSuccess', { action }));
      setSelected(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.actionFailed')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await infraAPI.delete(id);
      toast.success(t('admin.deleteSuccess'));
      fetchData();
    } catch { toast.error(t('dashboard.deleteFailed')); }
    setDelConfirm(null);
  };

  const openAssign = async (report) => {
    setAssignModal(report);
    setAssignForm({ assignedTo: '', assignedDepartment: report.department || report.assignedDepartment || '', dueDate: '' });
    try {
      const r = await infraAPI.getGovernmentUsers();
      setGovUsers(r.data.users || []);
    } catch { setGovUsers([]); }
  };

  const handleAssign = async () => {
    setSaving(true);
    try {
      await infraAPI.assign(assignModal._id, {
        assignedTo: assignForm.assignedTo || undefined,
        assignedDepartment: assignForm.assignedDepartment || undefined,
        dueDate: assignForm.dueDate || undefined,
      });
      toast.success(t('dashboard.reportAssigned'));
      setAssignModal(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.actionFailed')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={t('common.search')} className="input-field flex-1 min-w-[180px]" />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">{t('common.allStatuses')}</option>
          {['Submitted','Pending','Under Review','In Progress','Active','Resolved','Rejected'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : reports.length === 0 ? <EmptyState icon="📋" title={t('admin.noReportsSubmittedYet')} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 dark:bg-gray-700 text-left">
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('common.report')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('common.region')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('common.submittedBy')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.assignedDept')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('common.status')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {reports.map(r => (
                <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{r.title}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{r.reportId}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.region}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.submittedBy?.fullName || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.department || r.assignedDepartment
                      ? <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 px-2 py-0.5 rounded-full">{r.department || r.assignedDepartment}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {r.status === 'Pending' && (
                        <button onClick={() => { setSelected(r); setAction('approve'); setNote(''); }}
                          className="text-xs bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 px-2 py-1 rounded-lg">
                          {t('dashboard.verify')}
                        </button>
                      )}
                      {['Pending','Under Review','Approved','Reopened'].includes(r.status) && (
                        <button onClick={() => openAssign(r)}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-1 rounded-lg">
                          {t('dashboard.assignReport')}
                        </button>
                      )}
                      <button onClick={() => setDelConfirm({ id: r._id, name: r.title })}
                        className="text-xs bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 px-2 py-1 rounded-lg">
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Verify modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1">{t('dashboard.verifyReport')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{selected.title}</p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="approve" checked={action === 'approve'} onChange={() => setAction('approve')} />
                  <span className="text-sm text-green-700 dark:text-green-300 font-medium">✓ {t('admin.approve')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="reject" checked={action === 'reject'} onChange={() => setAction('reject')} />
                  <span className="text-sm text-red-700 dark:text-red-300 font-medium">✗ {t('admin.reject')}</span>
                </label>
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input-field"
                placeholder={t('dashboard.addVerificationNote')} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              <button onClick={handleVerify} disabled={saving}
                className={`flex-1 py-2 rounded-lg font-semibold text-white ${action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {saving ? t('dashboard.processing') : action === 'approve' ? t('admin.approve') : t('admin.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">{t('dashboard.assignReport')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{assignModal.title} ({assignModal.reportId})</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.department')}</label>
                <select value={assignForm.assignedDepartment}
                  onChange={e => setAssignForm(p => ({ ...p, assignedDepartment: e.target.value }))}
                  className="input-field">
                  <option value="">{t('dashboard.selectDepartment')}</option>
                  {INFRA_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {govUsers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.assignTo')}</label>
                  <select value={assignForm.assignedTo}
                    onChange={e => setAssignForm(p => ({ ...p, assignedTo: e.target.value }))}
                    className="input-field">
                    <option value="">{t('dashboard.autoAssign')}</option>
                    {govUsers.map(u => <option key={u._id} value={u._id}>{u.fullName} — {u.organizationName || u.role}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.dueDate')}</label>
                <input type="date" value={assignForm.dueDate}
                  onChange={e => setAssignForm(p => ({ ...p, dueDate: e.target.value }))}
                  className="input-field" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAssignModal(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              <button onClick={handleAssign} disabled={saving} className="btn-primary flex-1">
                {saving ? t('dashboard.processing') : t('dashboard.assignReport')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!delConfirm}
        title={t('dashboard.deleteReport')}
        message={t('dashboard.deleteReportConfirm', { name: delConfirm?.name })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => handleDelete(delConfirm.id)}
        onCancel={() => setDelConfirm(null)}
      />
    </div>
  );
}

// ── Public Complaints tab ─────────────────────────────────────────────────────

function ComplaintsTab() {
  const { t } = useTranslation();
  const [complaints, setComplaints] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('');
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [updating,   setUpdating]   = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (status) params.status = status;
      if (search) params.search = search;
      const r = await complaintAPI.getAll(params);
      setComplaints(r.data?.data?.complaints || []);
      setPages(r.data?.data?.pages || 1);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page, status]); // eslint-disable-line

  // Live refresh: when a citizen submits a complaint (or a manager updates one)
  // anywhere in the app, the backend emits complaint:created / complaint:updated
  // over socket.io — refetch so the admin table updates immediately.
  const { on } = useSocket() || {};
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  useEffect(() => {
    if (!on) return;
    const events = ['complaint:created', 'complaint:updated'];
    const cleanups = events.map(e => on(e, () => fetchRef.current()));
    return () => cleanups.forEach(off => off && off());
  }, [on]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchData(); };

  const handleStatusChange = async (id, newStatus) => {
    setUpdating(id);
    try {
      await complaintAPI.updateStatus(id, { status: newStatus });
      toast.success(`Status updated to "${newStatus}"`);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setUpdating(null); }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search title, tracking #…" className="input-field flex-1" />
          <button type="submit" className="btn-primary px-3 py-2 text-sm">Search</button>
        </form>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">All Statuses</option>
          {['Pending','Submitted','Assigned','Under Review','In Progress','Resolved','Rejected','Closed'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : complaints.length === 0
        ? <EmptyState icon="📋" title="No public complaints found" />
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Complaint</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Location</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Priority</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {complaints.map(c => (
                  <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{c.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{c.trackingNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {[c.woredaName, c.subcity].filter(Boolean).join(' / ') || c.region || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.department
                        ? <span className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 px-2 py-0.5 rounded-full">{c.department}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        c.priority === 'Urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                        c.priority === 'High'   ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                        c.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>{c.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COMPLAINT_STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {c.status !== 'Resolved' && c.status !== 'Closed' && (
                          <button
                            disabled={updating === c._id}
                            onClick={() => handleStatusChange(c._id, 'Resolved')}
                            className="text-xs bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 px-2 py-1 rounded-lg disabled:opacity-50">
                            {updating === c._id ? '…' : 'Resolve'}
                          </button>
                        )}
                        {c.status !== 'Closed' && (
                          <button
                            disabled={updating === c._id}
                            onClick={() => handleStatusChange(c._id, 'Closed')}
                            className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 px-2 py-1 rounded-lg disabled:opacity-50">
                            {updating === c._id ? '…' : 'Close'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminReports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('infrastructure');

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('admin.reportMgmt')}</h2>

      {/* Tab bar */}
      <div className="flex gap-2">
        {[
          { key: 'infrastructure', label: '🏗️ Infrastructure Reports' },
          { key: 'complaints',     label: '📋 Public Complaints' },
        ].map(tItem => (
          <button key={tItem.key}
            onClick={() => setTab(tItem.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tItem.key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
            }`}>
            {tItem.label}
          </button>
        ))}
      </div>

      {tab === 'infrastructure' && <InfraTab />}
      {tab === 'complaints'     && <ComplaintsTab />}
    </div>
  );
}
