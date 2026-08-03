import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import { toast } from 'react-toastify';

export default function GovernmentAssignment({ report, onComplete }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [assignedTo, setAssignedTo] = useState(report.assignedTo?._id || '');
  const [department, setDepartment] = useState(report.assignedDepartment || '');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    infraAPI.getGovernmentUsers().then(r => setUsers(r.data.users || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assignedTo) return toast.error('Please select a person');
    setSaving(true);
    try {
      await infraAPI.assign(report._id, { assignedTo, assignedDepartment: department, dueDate, notes });
      toast.success(t('dashboard.reportAssigned') || 'Report assigned successfully');
      onComplete?.();
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.actionFailed'));
    } finally { setSaving(false); }
  };

  const canAssign = ['Approved', 'Reopened', 'Assigned'].includes(report.status);

  if (!canAssign) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
      <h3 className="font-bold text-purple-800 mb-2">{t('dashboard.assignReport') || 'Assign Report'}</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.assignTo') || 'Assign to'} *</label>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} required className="input-field">
            <option value="">Select person...</option>
            {users.map(u => (
              <option key={u._id} value={u._id}>{u.fullName} — {u.organizationName || u.region}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.department') || 'Department'}</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} className="input-field" placeholder={report.autoAssignedOrganization || 'e.g. Roads Authority'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.dueDate') || 'Due Date'}</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input-field" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.notes') || 'Notes'}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input-field" placeholder="Assignment instructions..." />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? t('dashboard.saving') : t('dashboard.assignReport') || 'Assign Report'}
        </button>
      </form>
    </div>
  );
}
