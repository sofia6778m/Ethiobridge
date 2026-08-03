import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../../services/api';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ReportTimeline from '../../../components/common/ReportTimeline';
import GovernmentAssignment from '../../../components/common/GovernmentAssignment';
import ReportComments from '../../../components/common/ReportComments';
import BeforeAfterGallery from '../../../components/common/BeforeAfterGallery';
import ReportExport from '../../../components/common/ReportExport';
import { toast } from 'react-toastify';
import { useAuth } from '../../../context/AuthContext';

const REGIONS = ['Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama','Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella','Benishangul-Gumuz','Harari','Dire Dawa'];

const CATEGORIES = [
  { v: 'road_issue', l: 'Road Issue' },
  { v: 'electricity_issue', l: 'Electricity Issue' },
  { v: 'water_supply_issue', l: 'Water Supply Issue' },
];

const STATUS_OPTIONS = [
  { v: 'Pending', l: 'statusPending' },
  { v: 'Under Review', l: 'statusUnderReview' },
  { v: 'Approved', l: 'statusApproved' },
  { v: 'Assigned', l: 'statusAssigned' },
  { v: 'In Progress', l: 'statusInProgress' },
  { v: 'Completed', l: 'statusCompleted' },
  { v: 'Citizen Verification', l: 'statusCitizenVerification' },
  { v: 'Resolved', l: 'statusResolved' },
  { v: 'Rejected', l: 'statusRejected' },
  { v: 'Reopened', l: 'statusReopened' },
];

const SEVERITY_OPTIONS = [
  { v: 'Low', l: 'Low' },
  { v: 'Medium', l: 'Medium' },
  { v: 'High', l: 'High' },
  { v: 'Critical', l: 'Critical' },
];

export default function GovInfraReports() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('details');
  const [note, setNote] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [afterVideos, setAfterVideos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const afterPhotoRef = useRef(null);
  const afterVideoRef = useRef(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const r = await infraAPI.getGovernmentReports({ search, status, region, category, severityLevel: severity, dateFrom, dateTo, page, limit: 10 });
      setReports(r.data.reports);
      setPages(r.data.pages);
      setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [search, status, region, category, severity, dateFrom, dateTo, page]);

  const clearFilters = () => {
    setSearch(''); setStatus(''); setRegion('');
    setCategory(''); setSeverity(''); setDateFrom(''); setDateTo('');
    setPage(1);
  };

  const hasActiveFilters = status || region || category || severity || dateFrom || dateTo;

  const openDetail = (r) => {
    setSelected(r);
    setNewStatus(r.status);
    setNote('');
    setRejectionReason('');
    setAfterPhotos([]);
    setAfterVideos([]);
    setTab('details');
  };

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === selected.status) { toast.error(t('dashboard.noSelectStatus')); return; }
    setSaving(true);
    try {
      const payload = { status: newStatus, note };
      if (newStatus === 'Rejected' && rejectionReason) {
        payload.rejectionReason = rejectionReason;
      }
      if (newStatus === 'Completed' && (afterPhotos.length || afterVideos.length)) {
        const fd = new FormData();
        afterPhotos.forEach(f => fd.append('media', f));
        afterVideos.forEach(f => fd.append('media', f));
        await infraAPI.addAfterMedia(selected._id, fd);
      }
      await infraAPI.updateStatus(selected._id, payload);
      toast.success(t('dashboard.reportUpdated'));
      setSelected(null);
      fetchReports();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.updateFailed')); }
    finally { setSaving(false); }
  };

  const handleVerify = async (action) => {
    setSaving(true);
    try {
      await infraAPI.verify(selected._id, { action, note });
      toast.success(action === 'approve' ? t('dashboard.reportApproved') : t('dashboard.reportRejected'));
      setSelected(null);
      fetchReports();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.actionFailed')); }
    finally { setSaving(false); }
  };

  const canAssign = ['Approved', 'Reopened', 'Assigned'].includes(selected?.status);
  const canVerify = ['Pending', 'Under Review'].includes(selected?.status) && user?.role === 'admin';
  const canUpdateStatus = selected?.status && !['Resolved', 'Citizen Verification'].includes(selected.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{t('dashboard.infraReports')}</h2>
          {total > 0 && <p className="text-xs text-gray-400 mt-0.5">{total} reports found</p>}
        </div>
        <ReportExport filters={{ search, status, region, category, severityLevel: severity, dateFrom, dateTo }} />
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('dashboard.searchReports')} className="input-field flex-1 min-w-[180px]" />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">{t('common.allStatuses') || 'All Statuses'}</option>
          {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{t(`dashboard.${s.l}`)}</option>)}
        </select>
        <select value={region} onChange={e => { setRegion(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">{t('common.all') || 'All Regions'}</option>
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <button onClick={() => setShowFilters(!showFilters)} className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${showFilters ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          🔽 {t('common.moreFilters') || 'More Filters'}
        </button>
      </div>

      {/* Extended Filters */}
      {showFilters && (
        <div className="card bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.category') || 'Category'}</label>
              <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="input-field text-sm w-auto">
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.severity') || 'Severity'}</label>
              <select value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }} className="input-field text-sm w-auto">
                <option value="">All Severities</option>
                {SEVERITY_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.dateFrom') || 'Date From'}</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.dateTo') || 'Date To'}</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="input-field text-sm" />
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium py-2">
                ✕ Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? <LoadingSpinner /> : reports.length === 0 ? <EmptyState icon="🏗️" title={t('dashboard.noReportsFound')} /> : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r._id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(r)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{r.category}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.severityLevel === 'Critical' ? 'bg-red-100 text-red-700' :
                      r.severityLevel === 'High' ? 'bg-orange-100 text-orange-700' :
                      r.severityLevel === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>{r.severityLevel}</span>
                    <span className="text-xs text-gray-400">{r.reportId}</span>
                  </div>
                  <p className="font-semibold text-gray-800 mt-1">{r.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.region} · {new Date(r.createdAt).toLocaleDateString()} · {t('common.submittedBy')} {r.submittedBy?.fullName}</p>
                  {r.autoAssignedOrganization && <p className="text-xs text-purple-600 mt-0.5">→ {r.autoAssignedOrganization}</p>}
                </div>
                <StatusBadge status={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{selected.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{selected.reportId} · {selected.category} · {selected.severityLevel} · {selected.region}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl ml-2">×</button>
                </div>
              </div>
              {/* Tabs */}
              <div className="flex gap-1 mt-3 overflow-x-auto">
                {['details', 'timeline', 'comments', 'gallery', 'actions'].map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap ${tab === t ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Details Tab */}
              {tab === 'details' && (
                <>
                  {selected.photos?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selected.photos.map((p, i) => <img key={i} src={p} alt="" className="h-32 w-auto rounded-xl object-cover" />)}
                    </div>
                  )}
                  {selected.videos?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selected.videos.map((v, i) => <video key={i} src={v} controls className="h-32 rounded-xl" />)}
                    </div>
                  )}
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.description}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <DetailItem label={t('common.category')} value={selected.category} />
                    <DetailItem label={t('common.severity')} value={selected.severityLevel} />
                    <DetailItem label={t('common.region')} value={selected.region} />
                    <DetailItem label={t('common.city')} value={selected.city} />
                    {selected.zone && <DetailItem label="Zone" value={selected.zone} />}
                    {selected.woreda && <DetailItem label="Woreda" value={selected.woreda} />}
                    {selected.kebele && <DetailItem label="Kebele" value={selected.kebele} />}
                    <DetailItem label={t('common.location')} value={selected.specificLocation} />
                    {selected.address && <DetailItem label="Address" value={selected.address} />}
                    {selected.incidentDate && <DetailItem label="Incident Date" value={new Date(selected.incidentDate).toLocaleDateString()} />}
                    <DetailItem label={t('common.dateReported')} value={new Date(selected.createdAt).toLocaleDateString()} />
                    <DetailItem label={t('common.submittedBy')} value={selected.submittedBy?.fullName} />
                    {selected.autoAssignedOrganization && <DetailItem label={t('common.responsibleOrg')} value={selected.autoAssignedOrganization} />}
                    {selected.assignedDepartment && <DetailItem label={t('common.assignedDept')} value={selected.assignedDepartment} />}
                    {selected.assignedTo && <DetailItem label="Assigned To" value={selected.assignedTo.fullName} />}
                    {selected.rejectionReason && <DetailItem label="Rejection Reason" value={selected.rejectionReason} />}
                    {selected.latitude && selected.longitude && <DetailItem label="GPS" value={`${selected.latitude?.toFixed(4)}, ${selected.longitude?.toFixed(4)}`} />}
                  </div>
                </>
              )}

              {/* Timeline Tab */}
              {tab === 'timeline' && <ReportTimeline timeline={selected.timeline} />}

              {/* Comments Tab */}
              {tab === 'comments' && <ReportComments report={selected} userRole={user?.role} onComplete={() => openDetail(selected)} />}

              {/* Gallery Tab */}
              {tab === 'gallery' && <BeforeAfterGallery report={selected} />}

              {/* Actions Tab */}
              {tab === 'actions' && (
                <div className="space-y-5">
                  {/* Admin Verify */}
                  {canVerify && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <h4 className="font-bold text-blue-800 mb-3">{t('dashboard.verifyReport')}</h4>
                      <div className="flex gap-2 mb-3">
                        <button onClick={() => handleVerify('approve')} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">{t('dashboard.approveBtn')}</button>
                        <button onClick={() => handleVerify('reject')} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">{t('dashboard.rejectBtn')}</button>
                      </div>
                      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input-field text-sm" placeholder={t('dashboard.addVerificationNote')} />
                    </div>
                  )}

                  {/* Status Update */}
                  {canUpdateStatus && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h4 className="font-bold text-gray-800 mb-3">{t('dashboard.updateStatus')}</h4>
                      <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="input-field mb-3">
                        {STATUS_OPTIONS.filter(s => s.v !== selected.status).map(s => (
                          <option key={s.v} value={s.v}>{t(`dashboard.${s.l}`)}</option>
                        ))}
                      </select>
                      {newStatus === 'Rejected' && (
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason *</label>
                          <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={2} className="input-field text-sm" placeholder="Reason for rejection..." />
                        </div>
                      )}
                      {newStatus === 'Completed' && (
                        <div className="space-y-3 mb-3">
                          <p className="text-xs text-gray-500">Upload after-repair evidence (required for completion)</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">After Photos</label>
                              <input ref={afterPhotoRef} type="file" accept="image/*" multiple onChange={e => setAfterPhotos(Array.from(e.target.files).slice(0, 5))} className="input-field py-1.5 text-xs" />
                              {afterPhotos.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {afterPhotos.map((f, i) => (
                                    <img key={i} src={URL.createObjectURL(f)} alt="" className="h-10 w-10 rounded object-cover" />
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">After Videos</label>
                              <input ref={afterVideoRef} type="file" accept="video/mp4,video/mov,video/webm" multiple onChange={e => setAfterVideos(Array.from(e.target.files).slice(0, 3))} className="input-field py-1.5 text-xs" />
                              {afterVideos.length > 0 && (
                                <p className="text-xs text-green-600 mt-1">{afterVideos.length} video(s) selected</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input-field text-sm mb-3" placeholder={t('dashboard.notePlaceholder')} />
                      <button onClick={handleStatusUpdate} disabled={saving} className="btn-primary w-full">
                        {saving ? t('dashboard.saving') : t('dashboard.updateReport')}
                      </button>
                    </div>
                  )}

                  {/* Assignment */}
                  {canAssign && <GovernmentAssignment report={selected} onComplete={() => openDetail(selected)} />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
