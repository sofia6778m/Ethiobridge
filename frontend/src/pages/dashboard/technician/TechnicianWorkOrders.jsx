import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const STATUS_STYLES = {
  Submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'In Review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Assigned: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'In Progress': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  Completed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  Resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Closed: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function TechnicianWorkOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const [completeModal, setCompleteModal] = useState(null); // order
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [acting, setActing] = useState(false);
  const [startConfirm, setStartConfirm] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await hierarchyAPI.getTechnicianWorkOrders(params);
      setOrders(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStart = async (id) => {
    try {
      await hierarchyAPI.startWork(id);
      toast.success('Work started');
      setStartConfirm(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const openComplete = (o) => {
    setCompleteModal(o);
    setNotes('');
    setErrorMsg('');
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    if (!notes.trim()) {
      setErrorMsg('Work completion notes are required.');
      return;
    }
    setActing(true);
    try {
      await hierarchyAPI.completeWork(completeModal._id, { notes: notes.trim() });
      toast.success('Work completed — pending officer verification');
      setCompleteModal(null);
      fetchOrders();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const canStart = (o) => o.status === 'Assigned';
  const canComplete = (o) => o.status === 'In Progress';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">My Work Orders</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Work orders assigned to you
          </p>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-44">
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : orders.length === 0 ? (
        <EmptyState icon="🔧" title="No work orders found" description="Adjust the status filter or check back later." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Tracking ID</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Title</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Work Order Notes</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Due</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {orders.map((o) => (
                <tr key={o._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{o.trackingId}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{o.title}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{o.department || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{o.workOrderNotes || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {o.technicianDueAt ? new Date(o.technicianDueAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[o.status] || 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {canStart(o) && (
                        <button
                          onClick={() => setStartConfirm(o)}
                          className="text-xs py-1 px-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40 font-medium transition-colors"
                        >
                          Start Work
                        </button>
                      )}
                      {canComplete(o) && (
                        <button
                          onClick={() => openComplete(o)}
                          className="text-xs py-1 px-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 font-medium transition-colors"
                        >
                          Complete Work
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

      <ConfirmModal
        open={!!startConfirm}
        title="Start Work"
        message={`Start work on "${startConfirm?.title}" (${startConfirm?.trackingId})?`}
        confirmLabel="Start"
        onConfirm={() => handleStart(startConfirm._id)}
        onCancel={() => setStartConfirm(null)}
      />

      {/* Complete modal */}
      {completeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">Complete Work</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {completeModal.trackingId} · {completeModal.title}
            </p>
            <form onSubmit={handleComplete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Completion Notes <span className="text-red-500">*</span></label>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setErrorMsg(''); }}
                  rows={4}
                  placeholder="Describe the work completed…"
                  className="input-field w-full resize-none"
                  autoFocus
                />
              </div>
              {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setCompleteModal(null)} className="btn-secondary flex-1" disabled={acting}>Cancel</button>
                <button type="submit" disabled={acting} className="btn-success flex-1">{acting ? 'Submitting…' : 'Mark Complete'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
