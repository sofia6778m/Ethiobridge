import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { emergencyAPI } from '../../../services/api';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import { toast } from 'react-toastify';

export default function NGOEmergency() {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const r = await emergencyAPI.getAll({ page, limit: 10 });
      setReports(r.data.reports);
      setPages(r.data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page]);

  const handleAccept = async (id) => {
    try {
      await emergencyAPI.accept(id);
      toast.success(t('dashboard.taskAccepted'));
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.taskAcceptFailed')); }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await emergencyAPI.updateStatus(selected._id, { status: newStatus, note, assistanceProvided: assistance });
      toast.success(t('dashboard.reportUpdatedSuccess', { action: 'update' }));
      setSelected(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.actionFailed')); }
    finally { setSaving(false); }
  };

  const priorityBadge = { High: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', Medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', Low: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.emergencyRequests')}</h2>

      {loading ? <LoadingSpinner /> : reports.length === 0 ? <EmptyState icon="🚨" title={t('dashboard.noActiveEmergencies')} /> : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{r.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[r.priorityLevel] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{r.priorityLevel} {t('common.priority')}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{r.emergencyType} • {r.region} {r.city ? `• ${r.city}` : ''}</p>
                  {r.numberOfPeopleAffected && <p className="text-xs text-gray-400 dark:text-gray-500">👥 {r.numberOfPeopleAffected} {t('common.peopleAffectedLower')}</p>}
                  <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={r.status} />
                  {r.status === 'Active' && (
                    <button onClick={() => handleAccept(r._id)} className="btn-success text-xs py-1 px-3">{t('dashboard.accept')}</button>
                  )}
                  {['Active','In Progress'].includes(r.status) && (
                    <button onClick={() => { setSelected(r); setNewStatus(r.status); setNote(''); setAssistance(r.assistanceProvided || ''); }} className="btn-secondary text-xs py-1 px-3">{t('dashboard.update')}</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-3 dark:text-gray-200">{selected.title}</h3>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.updateStatus')}</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="input-field">
                  {['In Progress','Resolved'].map(s => <option key={s}>{s}</option>)}
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
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              <button onClick={handleUpdate} disabled={saving} className="btn-primary flex-1">{saving ? t('dashboard.updating') : t('dashboard.update')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
