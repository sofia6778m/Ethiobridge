import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { emergencyAPI } from '../../../services/api';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import { toast } from 'react-toastify';

export default function GovEmergency() {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [assistance, setAssistance] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await emergencyAPI.getGovernmentReports({ search, status, page, limit: 10 });
      setReports(r.data.reports);
      setPages(r.data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [search, status, page]);

  const handleUpdate = async () => {
    if (!newStatus) { toast.error(t('dashboard.noSelectStatus')); return; }
    setSaving(true);
    try {
      await emergencyAPI.updateStatus(selected._id, { status: newStatus, note, assistanceProvided: assistance });
      toast.success(t('dashboard.emergencyUpdated'));
      setSelected(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.updateFailed')); }
    finally { setSaving(false); }
  };

  const priorityColor = { High: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', Medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', Low: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.emergencyRequests')}</h2>
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('common.search')} className="input-field flex-1 min-w-[180px]" />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">{t('common.all')}</option>
          {[{v:'Pending',l:t('dashboard.statusPending')},{v:'Under Review',l:t('dashboard.statusUnderReview')},{v:'Active',l:t('dashboard.statusActive')},{v:'In Progress',l:t('dashboard.statusInProgress')},{v:'Resolved',l:t('dashboard.statusResolved')},{v:'Rejected',l:t('dashboard.statusRejected')}].map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : reports.length === 0 ? <EmptyState icon="🚨" title={t('dashboard.noEmergencyReports')} /> : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r._id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelected(r); setNewStatus(r.status); setNote(''); setAssistance(r.assistanceProvided || ''); }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{r.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[r.priorityLevel] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{r.priorityLevel}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{r.emergencyType} • {r.region} • {r.reportId}</p>
                  {r.numberOfPeopleAffected && <p className="text-xs text-gray-400 dark:text-gray-500">👥 {r.numberOfPeopleAffected} {t('common.peopleAffectedLower')}</p>}
                </div>
                <StatusBadge status={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-1 dark:text-gray-200">{selected.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{selected.emergencyType} • {selected.region} • {t('common.priority')}: {selected.priorityLevel}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">{selected.description}</p>
            {selected.photos?.length > 0 && <div className="flex gap-2 mb-4">{selected.photos.map((p, i) => <img key={i} src={p} alt="" className="h-20 rounded-lg object-cover" />)}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.updateStatus')}</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="input-field">
                  {[{v:'Under Review',l:t('dashboard.statusUnderReview')},{v:'Active',l:t('dashboard.statusActive')},{v:'In Progress',l:t('dashboard.statusInProgress')},{v:'Resolved',l:t('dashboard.statusResolved')},{v:'Rejected',l:t('dashboard.statusRejected')}].map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.assistanceProvided')}</label>
                <input value={assistance} onChange={e => setAssistance(e.target.value)} className="input-field" placeholder={t('dashboard.assistancePlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.note')}</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input-field" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              <button onClick={handleUpdate} disabled={saving} className="btn-primary flex-1">{saving ? t('dashboard.saving') : t('dashboard.update')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}