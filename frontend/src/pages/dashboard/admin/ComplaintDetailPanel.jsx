import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { complaintAPI, userAPI, adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ImageLightbox from '../../../components/common/ImageLightbox';
import { toast } from 'react-toastify';

const STATUSES = [
  'Submitted', 'Pending', 'Under Review', 'Assigned', 'Inspector Assigned',
  'Technician Assigned', 'Technician Requested', 'In Progress',
  'Awaiting Verification', 'Rework Required', 'Escalated to Subcity',
  'Resolved', 'Rejected', 'Closed', 'Reopened',
];

const STATUS_STYLES = {
  'Submitted':             'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Pending':               'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'Under Review':          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Assigned':              'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Inspector Assigned':    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Technician Assigned':   'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Technician Requested':  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'In Progress':           'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Awaiting Verification': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Rework Required':       'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'Escalated to Subcity':  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Resolved':              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Rejected':              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Closed':                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'Reopened':              'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
};

const priorityStyle = (p) => p === 'Urgent' || p === 'High'
  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  : p === 'Medium'
    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

const TIMELINE_META = {
  created:                     { icon: '📝', dot: 'bg-blue-500' },
  status_changed:              { icon: '🔄', dot: 'bg-indigo-500' },
  officer_assigned:            { icon: '👤', dot: 'bg-cyan-500' },
  technician_assigned:         { icon: '🔧', dot: 'bg-teal-500' },
  officer_accepted:            { icon: '✅', dot: 'bg-emerald-500' },
  technician_work_state:       { icon: '🛠️', dot: 'bg-purple-500' },
  verified:                    { icon: '✔️', dot: 'bg-green-500' },
  rework_required:             { icon: '♻️', dot: 'bg-rose-500' },
  closed:                      { icon: '🗂️', dot: 'bg-gray-400' },
  escalated_to_subcity:        { icon: '↗️', dot: 'bg-orange-500' },
  escalated_to_subcity_admin:  { icon: '🏛️', dot: 'bg-red-500' },
  note_added:                  { icon: '📌', dot: 'bg-yellow-500' },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString() : '—');

const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv|avi)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|heic|avif)$/i;
const extOf = (u) => String(u || '').split('?')[0];
const isImage = (u) => IMAGE_EXT.test(extOf(u));
const isVideo = (u) => VIDEO_EXT.test(extOf(u));

const Badge = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${className}`}>
    {children}
  </span>
);

const InfoItem = ({ label, children }) => (
  <div className="rounded-xl bg-gray-50 dark:bg-gray-700/40 p-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
    <p className="text-sm text-gray-800 dark:text-gray-200 break-words">{children}</p>
  </div>
);

const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-2.5">
    <span className="w-1 h-5 rounded-full bg-primary-600" />
    <h4 className="font-bold text-gray-900 dark:text-gray-100">{children}</h4>
  </div>
);

function PanelModal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-[2px] px-4 py-6 overflow-y-auto eb-overlay-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-2xl dark:bg-gray-800 shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 my-8 eb-panel-in`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ModalField = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
    {children}
  </div>
);

export default function ComplaintDetailPanel({ complaintId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const [assigning, setAssigning] = useState(null);           // null | 'officer' | 'technician'
  const [assignable, setAssignable] = useState({ officers: [], technicians: [] });
  const [assignableLoading, setAssignableLoading] = useState(false);
  const [assignForm, setAssignForm] = useState({ officerId: '', technicianId: '', dueDate: '', workInstruction: '' });

  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardForm, setForwardForm] = useState({ reason: '', targetDepartment: '' });
  const [departmentOptions, setDepartmentOptions] = useState([]);

  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const noteRef = useRef(null);

  const refreshDetail = useCallback(async () => {
    try {
      const r = await complaintAPI.getOne(complaintId);
      setDetail(r.data?.data?.complaint);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to refresh complaint');
    }
  }, [complaintId, onChanged]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const r = await complaintAPI.getOne(complaintId);
      setDetail(r.data?.data?.complaint);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load complaint');
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Close on Escape — sub-modals close first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (assigning) { setAssigning(null); return; }
      if (forwardOpen) { setForwardOpen(false); return; }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assigning, forwardOpen, onClose]);

  // Disable page scroll while the panel is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const timeline = useMemo(() => (detail?.timeline ? [...detail.timeline].reverse() : []), [detail]);
  const notes = detail?.internalNotes || [];

  const attachments = detail?.attachments || [];
  const images = attachments.filter(isImage);
  const videos = attachments.filter(isVideo);
  const files = attachments.filter(a => !isImage(a) && !isVideo(a));

  const changeStatus = async (newStatus) => {
    if (!newStatus || newStatus === detail.status) return;
    setStatusSaving(true);
    try {
      await complaintAPI.updateStatus(detail._id, { status: newStatus });
      toast.success(`Status updated to "${newStatus}"`);
      await refreshDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleResolve = () => changeStatus('Resolved');

  const handleClose = async () => {
    if (!window.confirm('Close this complaint?')) return;
    setSaving(true);
    try {
      await complaintAPI.closeComplaint(detail._id, {});
      toast.success('Complaint closed');
      await refreshDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to close complaint');
    } finally {
      setSaving(false);
    }
  };

  const openAssign = async (type) => {
    setAssigning(type);
    setAssignableLoading(true);
    setAssignable({ officers: [], technicians: [] });
    setAssignForm(f => ({ ...f, officerId: '', technicianId: '', dueDate: '', workInstruction: '' }));
    try {
      const [officersRes, techniciansRes] = await Promise.all([
        userAPI.getOfficers({ complaintId: detail._id }),
        userAPI.getTechnicians({ complaintId: detail._id }),
      ]);
      setAssignable({
        officers: officersRes.data?.data?.officers || [],
        technicians: techniciansRes.data?.data?.technicians || [],
      });
    } catch (err) {
      console.error('Failed to load assignable users:', err);
      toast.error(err.response?.data?.message || 'Failed to load assignable users');
    } finally {
      setAssignableLoading(false);
    }
  };

  const handleAssignOfficer = async () => {
    if (!assignForm.officerId) { toast.error('Select an officer'); return; }
    setSaving(true);
    try {
      await complaintAPI.assignOfficer(detail._id, { officerId: assignForm.officerId });
      toast.success('Officer assigned');
      setAssigning(null);
      await refreshDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign officer');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignTechnician = async () => {
    if (!assignForm.technicianId) { toast.error('Select a technician'); return; }
    setSaving(true);
    try {
      await complaintAPI.assignTechnician(detail._id, {
        technicianId: assignForm.technicianId,
        dueDate: assignForm.dueDate || undefined,
        workInstruction: assignForm.workInstruction || undefined,
      });
      toast.success('Technician assigned');
      setAssigning(null);
      await refreshDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign technician');
    } finally {
      setSaving(false);
    }
  };

  const openForward = async () => {
    setForwardForm({ reason: '', targetDepartment: detail.department || '' });
    setForwardOpen(true);
    try {
      const r = await adminAPI.getLocations();
      setDepartmentOptions(r.data?.departments || []);
    } catch (err) {
      console.error('Failed to load departments:', err);
      setDepartmentOptions([detail.department].filter(Boolean));
    }
  };

  const submitForward = async () => {
    if (!forwardForm.reason.trim()) { toast.error('An escalation reason is required'); return; }
    setSaving(true);
    try {
      await complaintAPI.escalate(detail._id, {
        reason: forwardForm.reason.trim(),
        targetDepartment: forwardForm.targetDepartment || undefined,
      });
      toast.success('Complaint forwarded to subcity');
      setForwardOpen(false);
      await refreshDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to forward complaint');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) { toast.error('Note cannot be empty'); return; }
    setNoteSaving(true);
    try {
      await complaintAPI.addInternalNote(detail._id, { note: noteText.trim() });
      toast.success('Internal note added');
      setNoteText('');
      await refreshDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add note');
    } finally {
      setNoteSaving(false);
    }
  };

  const focusNoteBox = () => {
    noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => noteRef.current?.focus(), 250);
  };

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-[3px]">
        <div className="card">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px] eb-overlay-in" />

      {/* Panel */}
      <div
        className="absolute inset-0 overflow-y-auto"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="min-h-full flex items-start sm:items-center justify-center sm:p-6">
          <div className="relative w-full bg-white dark:bg-gray-800 shadow-2xl sm:rounded-2xl max-w-[1100px] sm:max-w-[90%] lg:max-w-[1100px] h-[100dvh] sm:h-[92vh] flex flex-col overflow-hidden eb-panel-in">

            {/* Header */}
            <header className="shrink-0 px-5 sm:px-7 py-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-100 dark:border-gray-700 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">{detail.trackingNumber}</span>
                  <Badge className={STATUS_STYLES[detail.status] || 'bg-gray-100 text-gray-600'}>{detail.status}</Badge>
                  {detail.priority && <Badge className={priorityStyle(detail.priority)}>⚑ {detail.priority}</Badge>}
                  {detail.assignedLevel && (
                    <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      Level: {detail.assignedLevel}
                    </Badge>
                  )}
                </div>
                <h3 className="mt-2 text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 break-words">{detail.title}</h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 text-2xl leading-none transition-colors">
                ×
              </button>
            </header>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-7">
              {/* Citizen info */}
              <section>
                <SectionTitle>Citizen Information</SectionTitle>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoItem label="Full Name">{detail.reporterName || '—'}</InfoItem>
                  <InfoItem label="Phone">{detail.reporterPhone || '—'}</InfoItem>
                  <InfoItem label="Email">{detail.reporterEmail || '—'}</InfoItem>
                  <InfoItem label="Category">{detail.category || '—'}</InfoItem>
                  <InfoItem label="Subcity">{detail.subcity || '—'}</InfoItem>
                  <InfoItem label="Woreda">{detail.woredaName || '—'}</InfoItem>
                  <InfoItem label="Department">{detail.department || '—'}</InfoItem>
                  <InfoItem label="Address / Location">
                    {[detail.district, detail.city, detail.region].filter(Boolean).join(', ') || '—'}
                    {(detail.latitude && detail.longitude) && (
                      <span className="block mt-0.5 text-xs text-gray-400 font-mono">
                        {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
                      </span>
                    )}
                  </InfoItem>
                  <InfoItem label="Submitted">{fmtDateTime(detail.submittedAt || detail.createdAt)}</InfoItem>
                  <InfoItem label="Due Date">{fmtDate(detail.dueDate)}</InfoItem>
                  {detail.resolvedAt && <InfoItem label="Resolved At">{fmtDateTime(detail.resolvedAt)}</InfoItem>}
                  {detail.closedAt && <InfoItem label="Closed At">{fmtDateTime(detail.closedAt)}</InfoItem>}
                </div>
              </section>

              {/* Assignment summary */}
              {(detail.assignedOfficerName || detail.assignedTechnicianName || detail.workInstruction || detail.closedByAdminName || detail.escalationReason) && (
                <section>
                  <SectionTitle>Assignment</SectionTitle>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoItem label="Officer">
                      {detail.assignedOfficerName || '—'}
                      {detail.officerAccepted && (
                        <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">(accepted)</span>
                      )}
                    </InfoItem>
                    <InfoItem label="Technician">
                      {detail.assignedTechnicianName || '—'}
                      {detail.technicianWorkState && (
                        <span className="ml-1.5 text-xs text-gray-500">({String(detail.technicianWorkState).replace(/_/g, ' ')})</span>
                      )}
                    </InfoItem>
                    {detail.workInstruction && (
                      <div className="sm:col-span-2"><InfoItem label="Work Instruction">{detail.workInstruction}</InfoItem></div>
                    )}
                    {detail.closedByAdminName && (
                      <div className="sm:col-span-2"><InfoItem label="Closed By">{detail.closedByAdminName}</InfoItem></div>
                    )}
                    {detail.escalationReason && (
                      <div className="sm:col-span-2"><InfoItem label="Escalation Reason">{detail.escalationReason}</InfoItem></div>
                    )}
                  </div>
                </section>
              )}

              {/* Description */}
              <section>
                <SectionTitle>Complaint Description</SectionTitle>
                <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{detail.description || '—'}</p>
              </section>

              {/* Attachments */}
              <section>
                <SectionTitle>Attachments</SectionTitle>
                {attachments.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-400">No attachments uploaded</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {images.map((src, i) => (
                      <button
                        key={`img-${i}`}
                        onClick={() => setLightbox({ images, videos, index: i })}
                        className="group relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-primary-500 transition"
                        title="Open image">
                        <img src={src} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center text-white text-lg opacity-0 group-hover:opacity-100">⤢</span>
                      </button>
                    ))}
                    {videos.map((src, i) => (
                      <div key={`vid-${i}`} className="relative w-64 sm:w-80 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                        <video src={src} controls preload="metadata" className="w-full max-h-44 object-contain bg-black" />
                      </div>
                    ))}
                    {files.map((src, i) => (
                      <a key={`file-${i}`} href={src} target="_blank" rel="noopener noreferrer"
                        className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                        <span className="text-3xl">📄</span>
                        <span className="text-[11px] px-2 truncate max-w-full">Attachment {i + 1}</span>
                      </a>
                    ))}
                  </div>
                )}
              </section>

              {/* Timeline */}
              <section>
                <SectionTitle>Timeline</SectionTitle>
                {timeline.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-400">No activity yet.</p>
                ) : (
                  <ol className="mt-4 ml-1.5 space-y-0">
                    {timeline.map((t, i) => {
                      const meta = TIMELINE_META[t.action] || { icon: '•', dot: 'bg-gray-400' };
                      return (
                        <li key={i} className="relative pb-6 pl-10 last:pb-0">
                          <span className={`absolute left-0 top-0.5 w-7 h-7 rounded-full flex items-center justify-center text-sm ${meta.dot}`} />
                          {i < timeline.length - 1 && (
                            <span className="absolute left-[13px] top-8 bottom-0 w-px bg-gray-200 dark:bg-gray-600" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{titleCase(t.action)}</p>
                            {t.description && <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{t.description}</p>}
                            {(t.previousStatus || t.newStatus) && (
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500">
                                {t.previousStatus && <span>{t.previousStatus}</span>}
                                {t.previousStatus && t.newStatus && <span> → </span>}
                                {t.newStatus && <span className="font-medium text-gray-700 dark:text-gray-300">{t.newStatus}</span>}
                              </p>
                            )}
                            <p className="mt-1 text-[11px] text-gray-400">
                              {[t.performedByName, t.performedByRole].filter(Boolean).join(' · ') || 'System'}
                              {t.at ? ` · ${fmtDateTime(t.at)}` : ''}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              {/* Internal notes */}
              <section ref={noteRef}>
                <SectionTitle>Internal Notes</SectionTitle>
                {notes.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-400">No internal notes yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {notes.map((n, i) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{n.body}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {n.authorName || 'Unknown'}
                          {n.authorRole ? ` · ${titleCase(n.authorRole)}` : ''}
                          {n.createdAt ? ` · ${fmtDateTime(n.createdAt)}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={3}
                    placeholder="Add an internal note (not visible to the citizen)…"
                    className="input-field"
                  />
                  <div className="mt-2 flex justify-end">
                    <button onClick={handleAddNote} disabled={noteSaving || !noteText.trim()} className="btn-primary px-4 py-1.5 text-sm">
                      {noteSaving ? 'Adding…' : 'Add Note'}
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Sticky action bar */}
            <footer className="shrink-0 px-5 sm:px-7 py-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-t border-gray-100 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={detail.status}
                  onChange={e => changeStatus(e.target.value)}
                  disabled={statusSaving}
                  className="input-field w-auto text-sm">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => openAssign('officer')} className="btn-secondary px-3 py-1.5 text-sm">👤 Assign Officer</button>
                <button onClick={() => openAssign('technician')} className="btn-secondary px-3 py-1.5 text-sm">🔧 Assign Technician</button>
                <button onClick={focusNoteBox} className="btn-secondary px-3 py-1.5 text-sm">📝 Add Note</button>
                {detail.status !== 'Escalated to Subcity' && (
                  <button onClick={openForward} className="bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-300 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors">
                    ↗️ Forward to Subcity
                  </button>
                )}
                {detail.status !== 'Resolved' && detail.status !== 'Closed' && (
                  <button onClick={handleResolve} disabled={statusSaving} className="btn-success px-3 py-1.5 text-sm">✅ Resolve</button>
                )}
                {detail.status === 'Resolved' && (
                  <button onClick={handleClose} disabled={saving} className="bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-300 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors">
                    🗂️ Close Complaint
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </div>

      {/* Image / video lightbox */}
      {lightbox && (
        <ImageLightbox images={lightbox.images} videos={lightbox.videos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {/* Assign officer modal */}
      {assigning === 'officer' && (
        <PanelModal title="Assign Officer" onClose={() => setAssigning(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{detail.title} ({detail.trackingNumber})</p>
          <ModalField label="Officer">
            {assignableLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">Loading officers…</p>
            ) : assignable.officers.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                No {detail.department || 'department'} officer available
                {detail.subcity ? ` for ${detail.subcity}` : ''}{detail.woredaName ? ` Woreda ${detail.woredaName}` : ''}.
                Create an officer for this department in User Management, then try again.
              </div>
            ) : (
              <select value={assignForm.officerId} onChange={e => setAssignForm(f => ({ ...f, officerId: e.target.value }))} className="input-field">
                <option value="">Select officer…</option>
                {assignable.officers.map(o => (
                  <option key={o._id} value={o._id}>{o.fullName} {o.department ? `— ${o.department}` : ''}</option>
                ))}
              </select>
            )}
          </ModalField>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setAssigning(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleAssignOfficer} disabled={saving || assignableLoading || assignable.officers.length === 0} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? '…' : 'Assign'}
            </button>
          </div>
        </PanelModal>
      )}

      {/* Assign technician modal */}
      {assigning === 'technician' && (
        <PanelModal title="Assign Technician" onClose={() => setAssigning(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{detail.title} ({detail.trackingNumber})</p>
          <div className="space-y-3">
            <ModalField label="Technician">
              {assignableLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">Loading technicians…</p>
              ) : assignable.technicians.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                  No {detail.department || 'department'} technician available
                  {detail.subcity ? ` for ${detail.subcity}` : ''}{detail.woredaName ? ` Woreda ${detail.woredaName}` : ''}.
                  Create a technician for this department in User Management, then try again.
                </div>
              ) : (
                <select value={assignForm.technicianId} onChange={e => setAssignForm(f => ({ ...f, technicianId: e.target.value }))} className="input-field">
                  <option value="">Select technician…</option>
                  {assignable.technicians.map(t => (
                    <option key={t._id} value={t._id}>{t.fullName} {t.department ? `— ${t.department}` : ''}</option>
                  ))}
                </select>
              )}
            </ModalField>
            <ModalField label="Due date">
              <input type="date" value={assignForm.dueDate} onChange={e => setAssignForm(f => ({ ...f, dueDate: e.target.value }))} className="input-field" />
            </ModalField>
            <ModalField label="Work instruction">
              <textarea value={assignForm.workInstruction} onChange={e => setAssignForm(f => ({ ...f, workInstruction: e.target.value }))} rows={3}
                placeholder="What should the technician do?" className="input-field" />
            </ModalField>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setAssigning(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleAssignTechnician} disabled={saving || assignableLoading || assignable.technicians.length === 0} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? '…' : 'Assign'}
            </button>
          </div>
        </PanelModal>
      )}

      {/* Forward to subcity modal */}
      {forwardOpen && (
        <PanelModal title="Forward to Subcity" onClose={() => setForwardOpen(false)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{detail.title} ({detail.trackingNumber})</p>
          <div className="space-y-3">
            <ModalField label="Reason (required)">
              <textarea value={forwardForm.reason} onChange={e => setForwardForm(f => ({ ...f, reason: e.target.value }))} rows={3}
                placeholder="Why is this being escalated to the subcity?" className="input-field" />
            </ModalField>
            <ModalField label="Target department">
              <select value={forwardForm.targetDepartment} onChange={e => setForwardForm(f => ({ ...f, targetDepartment: e.target.value }))} className="input-field">
                <option value="">Keep current department</option>
                {departmentOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </ModalField>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setForwardOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submitForward} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg font-semibold flex-1 disabled:opacity-50">
              {saving ? '…' : 'Forward'}
            </button>
          </div>
        </PanelModal>
      )}
    </div>
  );
}
