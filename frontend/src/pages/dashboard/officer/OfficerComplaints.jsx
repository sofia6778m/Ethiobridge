import { useState, useEffect, useCallback } from 'react';
import { hierarchyAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
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
  'Forwarded to Subcity': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

export default function OfficerComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const [verifyModal, setVerifyModal] = useState(null); // complaint
  const [verifyNote, setVerifyNote] = useState('');
  const [assignModal, setAssignModal] = useState(null); // complaint
  const [technicians, setTechnicians] = useState([]);
  const [assignForm, setAssignForm] = useState({ technicianId: '', workOrderNotes: '', dueAt: '' });
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await hierarchyAPI.getOfficerComplaints(params);
      setComplaints(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  const fetchTechnicians = useCallback(async () => {
    try {
      const res = await hierarchyAPI.getOfficerTechnicians();
      setTechnicians(res.data.data || []);
    } catch {
      setTechnicians([]);
    }
  }, []);

  // ── Verify resolution ─────────────────────────────────────────────────────

  const openVerify = (c) => {
    setVerifyModal(c);
    setVerifyNote('');
    setActionError('');
  };

  const handleVerify = async (verified) => {
    if (!verifyNote.trim()) {
      setActionError('A verification note is required.');
      return;
    }
    setActing(true);
    try {
      await hierarchyAPI.verifyComplaint(verifyModal._id, { note: verifyNote.trim(), verified });
      toast.success(verified ? 'Complaint resolved' : 'Complaint sent back for rework');
      setVerifyModal(null);
      fetchComplaints();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Verification failed');
    } finally {
      setActing(false);
    }
  };

  // ── Assign technician ─────────────────────────────────────────────────────

  const openAssign = async (c) => {
    setAssignModal(c);
    setAssignForm({ technicianId: '', workOrderNotes: '', dueAt: '' });
    setActionError('');
    await fetchTechnicians();
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignForm.technicianId) {
      setActionError('Please select a technician.');
      return;
    }
    setActing(true);
    try {
      await hierarchyAPI.officerAssignTechnician(assignModal._id, {
        technicianId: assignForm.technicianId,
        workOrderNotes: assignForm.workOrderNotes.trim(),
        dueAt: assignForm.dueAt || undefined,
      });
      toast.success('Technician assigned');
      setAssignModal(null);
      fetchComplaints();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Assignment failed');
    } finally {
      setActing(false);
    }
  };

  const canAssign = (c) => ['Submitted', 'In Review', 'Assigned'].includes(c.status);
  const canVerify = (c) => c.status === 'Completed';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">My Complaints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Complaints assigned to you and within your woreda
          </p>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-44">
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : complaints.length === 0 ? (
        <EmptyState icon="📝" title="No complaints found" description="Adjust the status filter or check back later." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Tracking ID</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Title</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Technician</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {complaints.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{c.trackingId}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 max-w-[220px] truncate">{c.title}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{c.department || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{c.technicianName || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {canAssign(c) && (
                        <button
                          onClick={() => openAssign(c)}
                          className="text-xs py-1 px-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40 font-medium transition-colors"
                        >
                          Assign Technician
                        </button>
                      )}
                      {canVerify(c) && (
                        <button
                          onClick={() => openVerify(c)}
                          className="text-xs py-1 px-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 font-medium transition-colors"
                        >
                          Verify Work
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

      {/* Verify modal */}
      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">Verify Work</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {verifyModal.trackingId} · {verifyModal.title}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verification Note <span className="text-red-500">*</span></label>
                <textarea
                  value={verifyNote}
                  onChange={(e) => { setVerifyNote(e.target.value); setActionError(''); }}
                  rows={3}
                  placeholder="Describe the inspection result…"
                  className="input-field w-full resize-none"
                />
              </div>
              {actionError && <p className="text-xs text-red-500">{actionError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setVerifyModal(null)} className="btn-secondary flex-1" disabled={acting}>Cancel</button>
                <button onClick={() => handleVerify(false)} disabled={acting} className="btn-secondary flex-1">Reject (Rework)</button>
                <button onClick={() => handleVerify(true)} disabled={acting} className="btn-primary flex-1">Approve</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign technician modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">Assign Technician</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {assignModal.trackingId} · {assignModal.title}
            </p>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Technician <span className="text-red-500">*</span></label>
                <select
                  value={assignForm.technicianId}
                  onChange={(e) => setAssignForm((p) => ({ ...p, technicianId: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="">Select a technician…</option>
                  {technicians.map((tech) => (
                    <option key={tech._id} value={tech._id}>{tech.fullName}{tech.department ? ` · ${tech.department}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work Order Notes</label>
                <textarea
                  value={assignForm.workOrderNotes}
                  onChange={(e) => setAssignForm((p) => ({ ...p, workOrderNotes: e.target.value }))}
                  rows={3}
                  placeholder="Instructions for the technician…"
                  className="input-field w-full resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={assignForm.dueAt}
                  onChange={(e) => setAssignForm((p) => ({ ...p, dueAt: e.target.value }))}
                  className="input-field w-full"
                />
              </div>
              {actionError && <p className="text-xs text-red-500">{actionError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setAssignModal(null)} className="btn-secondary flex-1" disabled={acting}>Cancel</button>
                <button type="submit" disabled={acting} className="btn-primary flex-1">{acting ? 'Assigning…' : 'Assign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
