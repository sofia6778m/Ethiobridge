import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../../context/AuthContext';
import { governanceManagementAPI } from '../../../../services/api';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import EmptyState from '../../../../components/common/EmptyState';
import ConfirmModal from '../../../../components/common/ConfirmModal';

const EMPTY_FORM = { categoryName: '', responseDays: '', description: '' };

const isSubcityManager = (role) =>
  ['SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_admin'].includes(role) ||
  (typeof role === 'string' && role.startsWith('subcity_'));

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function SlaRules() {
  const { user } = useAuth();
  const canEdit = isSubcityManager(user?.role);

  const [rules, setRules] = useState([]);
  const [subcities, setSubcities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const [editRule, setEditRule] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const subcityName = useMemo(() => {
    const own = String(user?.subcity || '').trim().toLowerCase();
    const match = subcities.find((s) => String(s.name || '').trim().toLowerCase() === own);
    return match?.name || user?.subcity || 'Your subcity';
  }, [subcities, user]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleRes, subRes] = await Promise.all([
        governanceManagementAPI.getSlaRules(),
        governanceManagementAPI.getSubcities().catch(() => ({ data: { data: [] } })),
      ]);
      setRules(ruleRes.data.data?.rules || []);
      setSubcities(subRes.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load SLA rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: '' }));
  };

  const validate = (values) => {
    const errs = {};
    if (!values.categoryName.trim()) errs.categoryName = 'Category name is required (blank = global default).';
    const days = Number(values.responseDays);
    if (!values.responseDays || !Number.isFinite(days) || days < 1 || days > 365) {
      errs.responseDays = 'Response days must be between 1 and 365.';
    }
    return errs;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await governanceManagementAPI.upsertSlaRule({
        categoryName: form.categoryName.trim(),
        responseDays: Number(form.responseDays),
        description: form.description.trim(),
      });
      toast.success('SLA rule saved');
      setForm(EMPTY_FORM);
      setErrors({});
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save SLA rule');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (r) => {
    setEditRule({
      id: r._id,
      categoryName: r.categoryName || '',
      responseDays: r.responseDays ?? '',
      description: r.description || '',
      scope: r.subcityId ? 'subcity' : 'global',
    });
    setEditErrors({});
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    const errs = validate({ categoryName: editRule.categoryName, responseDays: editRule.responseDays });
    setEditErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await governanceManagementAPI.upsertSlaRule({
        categoryName: editRule.categoryName.trim(),
        responseDays: Number(editRule.responseDays),
        description: editRule.description.trim(),
      });
      toast.success('SLA rule updated');
      setEditRule(null);
      setEditErrors({});
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update SLA rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await governanceManagementAPI.deleteSlaRule(deleteConfirm._id);
      toast.success('SLA rule deleted');
      setDeleteConfirm(null);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete SLA rule');
      setDeleteConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const scopeLabel = (r) => {
    if (!r.subcityId) return 'Global';
    const id = String(r.subcityId);
    const match = subcities.find((s) => String(s._id) === id);
    return match?.name || 'Subcity';
  };

  const scopeOfRule = (r) => (r.subcityId ? 'subcity' : 'global');

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 px-4 py-3 text-sm text-teal-800 dark:text-teal-300">
        <span className="font-semibold">Response deadlines (SLA).</span> Complaints are due after the configured number of
        days. A rule for a specific category in your subcity overrides the global rule for that category; the
        <span className="font-semibold"> Default </span>
        rule (blank category) applies when no category rule matches. Base deadline: 48 hours.
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <span className="font-semibold">Read-only view.</span> SLA rules are managed exclusively by the Subcity Admin.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            SLA Rules <span className="text-sm font-normal text-gray-400 ml-1">({rules.length})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Category-based response deadlines for governance complaints in {subcityName}
          </p>
        </div>
      </div>

      {/* Create / edit rule form */}
      {canEdit && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Add SLA Rule</h3>
          <form onSubmit={handleCreate} noValidate className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Complaint Category <span className="text-red-500">*</span>
              </label>
              <input
                name="categoryName"
                value={form.categoryName}
                onChange={handleChange}
                placeholder="e.g. Corruption / Bribery — leave blank for Default"
                className={`input-field w-full ${errors.categoryName ? 'border-red-400 dark:border-red-500' : ''}`}
              />
              {errors.categoryName && <p className="text-xs text-red-500 mt-1">{errors.categoryName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Response Days (1–365) <span className="text-red-500">*</span>
              </label>
              <input
                name="responseDays"
                type="number"
                min="1"
                max="365"
                value={form.responseDays}
                onChange={handleChange}
                placeholder="e.g. 5"
                className={`input-field w-full ${errors.responseDays ? 'border-red-400 dark:border-red-500' : ''}`}
              />
              {errors.responseDays && <p className="text-xs text-red-500 mt-1">{errors.responseDays}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Optional note"
                className="input-field w-full"
              />
            </div>
            <div className="pt-6">
              <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4">
                {saving ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <LoadingSpinner />
      ) : rules.length === 0 ? (
        <EmptyState icon="⏳" title="No SLA rules yet" description="Add a rule above or ask a System Admin to seed the global defaults." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Category</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Scope</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Response Deadline</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Updated</th>
                {canEdit && <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {rules.map((r) => {
                const global = scopeOfRule(r) === 'global';
                return (
                  <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                      {r.categoryName || 'Default'}
                      {global && <span className="ml-2 text-[10px] uppercase tracking-wide text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 rounded">default</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        global ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                      }`}>
                        {global ? 'Global' : scopeLabel(r)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{r.responseDays} day(s)</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[260px] truncate">{r.description || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(r.updatedAt || r.createdAt)}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium transition-colors"
                          >
                            Edit
                          </button>
                          {!global && (
                            <button
                              onClick={() => setDeleteConfirm(r)}
                              className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 font-medium transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">Edit SLA Rule</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {editRule.scope === 'global'
                ? 'Editing the global rule — it applies to every subcity that has no override.'
                : `Editing the ${scopeLabel({ subcityId: editRule.subcityId })} subcity rule.`}
            </p>
            <form onSubmit={handleEditSave} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Complaint Category <span className="text-red-500">*</span>
                </label>
                <input
                  name="categoryName"
                  value={editRule.categoryName}
                  onChange={(e) => { setEditRule((p) => ({ ...p, categoryName: e.target.value })); setEditErrors((p) => ({ ...p, categoryName: '' })); }}
                  className={`input-field w-full ${editErrors.categoryName ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {editErrors.categoryName && <p className="text-xs text-red-500 mt-1">{editErrors.categoryName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Response Days (1–365) <span className="text-red-500">*</span>
                </label>
                <input
                  name="responseDays"
                  type="number"
                  min="1"
                  max="365"
                  value={editRule.responseDays}
                  onChange={(e) => { setEditRule((p) => ({ ...p, responseDays: e.target.value })); setEditErrors((p) => ({ ...p, responseDays: '' })); }}
                  className={`input-field w-full ${editErrors.responseDays ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {editErrors.responseDays && <p className="text-xs text-red-500 mt-1">{editErrors.responseDays}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  name="description"
                  value={editRule.description}
                  onChange={(e) => setEditRule((p) => ({ ...p, description: e.target.value }))}
                  className="input-field w-full"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setEditRule(null); setEditErrors({}); }} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete SLA Rule"
        message={`Delete the "${deleteConfirm?.categoryName || 'Default'}" rule for ${deleteConfirm?.subcityId ? scopeLabel(deleteConfirm) : 'the global scope'}? Complaints already created keep their existing deadline.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
