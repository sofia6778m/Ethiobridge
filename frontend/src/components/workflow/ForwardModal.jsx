import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { workflowAPI } from '../../services/api';

export default function ForwardModal({ report, isOpen, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [toLevel, setToLevel] = useState('');
  const [toOfficerId, setToOfficerId] = useState('');
  const [comment, setComment] = useState('');
  const [officers, setOfficers] = useState([]);
  const [loadingOfficers, setLoadingOfficers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hierarchy, setHierarchy] = useState(null);

  useEffect(() => {
    if (isOpen) {
      workflowAPI.getHierarchy().then(res => setHierarchy(res.data.hierarchy)).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!toLevel) { setOfficers([]); setToOfficerId(''); return; }
    setLoadingOfficers(true);
    workflowAPI.getOfficersAtLevel(toLevel)
      .then(res => setOfficers(res.data.officers))
      .catch(() => setOfficers([]))
      .finally(() => setLoadingOfficers(false));
  }, [toLevel]);

  if (!isOpen) return null;

  const LEVEL_LABELS = { kebele: 'Kebele', woreda: 'Woreda/Sub-City', zone: 'Zone', regional_bureau: 'Regional Bureau', federal_ministry: 'Federal Ministry' };

  // Only show the targets valid for this report's current level
  const allTargets = hierarchy?.forwardTargets || [];
  const currentTargets = allTargets.find(t => t.from === report.currentLevel);
  const targets = currentTargets
    ? currentTargets.to.map((lvl, i) => ({ level: lvl, label: currentTargets.toLabels[i] }))
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!toLevel) return toast.error('Select a target level');
    setSubmitting(true);
    try {
      await workflowAPI.forwardReport(report._id, { toLevel, toOfficerId: toOfficerId || undefined, comment });
      toast.success(`Report forwarded to ${LEVEL_LABELS[toLevel]}`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to forward report');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Forward Report</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Forward to a higher administrative level</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Level *</label>
            <select value={toLevel} onChange={e => setToLevel(e.target.value)} className="input-field">
              <option value="">Select level...</option>
              {targets.map(t => (
                <option key={t.level} value={t.level}>{t.label}</option>
              ))}
            </select>
          </div>

          {toLevel && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assign to Officer (Optional)</label>
              {loadingOfficers ? (
                <p className="text-sm text-gray-400">Loading officers...</p>
              ) : (
                <select value={toOfficerId} onChange={e => setToOfficerId(e.target.value)} className="input-field">
                  <option value="">Auto-assign</option>
                  {officers.map(o => (
                    <option key={o._id} value={o._id}>{o.fullName} - {o.organizationName || 'N/A'}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comment</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} className="input-field text-sm" placeholder="Add a forwarding note..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting || !toLevel} className="btn-primary flex-1">
              {submitting ? 'Forwarding...' : 'Forward Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
