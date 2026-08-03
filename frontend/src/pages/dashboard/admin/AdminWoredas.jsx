import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const EMPTY_FORM = { name: '', subcity: '', description: '', status: 'Active' };

export default function AdminWoredas() {
  const { t } = useTranslation();

  // ── Woreda list state ──────────────────────────────────────────────────────
  const [woredas, setWoredas]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterSubcity, setFilterSubcity] = useState('');
  const [status, setStatus]     = useState('');
  const [page, setPage]         = useState(1);
  const [pages, setPages]       = useState(1);
  const [total, setTotal]       = useState(0);

  // ── Subcity list — fetched live from the DB every time the modal opens ─────
  const [subcities, setSubcities]         = useState([]);
  const [subcitiesLoading, setSubcitiesLoading] = useState(false);

  // ── Modal / form state ─────────────────────────────────────────────────────
  const [modal, setModal]   = useState(null); // null | 'create' | { type:'edit', id }
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [delConfirm, setDelConfirm] = useState(null);

  // ── Fetch woreda list ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminAPI.getWoredas({
        search,
        subcity: filterSubcity,
        status,
        page,
        limit: 10,
      });
      setWoredas(r.data.woredas || []);
      setPages(r.data.pages || 1);
      setTotal(r.data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, filterSubcity, status, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Fetch subcities from DB (called every time a modal opens) ─────────────
  const fetchSubcities = async () => {
    setSubcitiesLoading(true);
    try {
      const res = await adminAPI.getSubcities();
      setSubcities(res.data.subcities || []);
    } catch {
      toast.error('Failed to load subcities');
    } finally {
      setSubcitiesLoading(false);
    }
  };

  // Also fetch once on mount so the filter bar dropdown is populated
  useEffect(() => { fetchSubcities(); }, []);

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openCreate = async () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setModal('create');
    await fetchSubcities(); // always refresh when opening
  };

  const openEdit = async (w) => {
    setForm({
      name:        w.name,
      subcity:     w.subcity,
      description: w.description || '',
      status:      w.status,
    });
    setErrors({});
    setModal({ type: 'edit', id: w._id });
    await fetchSubcities(); // always refresh when opening
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = t('admin.woredaNameRequired');
    if (!form.subcity)     errs.subcity = t('admin.subcity') + ' is required';

    // Client-side duplicate check (server also validates)
    const editingId = modal?.type === 'edit' ? modal.id : null;
    const dup = woredas.some(
      (w) =>
        w._id !== editingId &&
        w.name?.toLowerCase()   === form.name.trim().toLowerCase() &&
        w.subcity?.toLowerCase() === form.subcity?.toLowerCase()
    );
    if (form.name.trim() && dup) errs.name = t('admin.woredaNameExists');

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await adminAPI.createWoreda(form);
        toast.success(t('admin.woredaCreated'));
      } else {
        await adminAPI.updateWoreda(modal.id, form);
        toast.success(t('admin.woredaUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || t('dashboard.actionFailed');
      if (/already exists/i.test(msg)) setErrors((prev) => ({ ...prev, name: t('admin.woredaNameExists') }));
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle status ──────────────────────────────────────────────────────────
  const handleToggleStatus = async (w) => {
    try {
      const next = w.status === 'Active' ? 'Inactive' : 'Active';
      await adminAPI.updateWoreda(w._id, { status: next });
      toast.success(
        next === 'Inactive' ? t('admin.woredaDeactivated') : t('admin.woredaActivated')
      );
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.actionFailed'));
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteWoreda(id);
      toast.success(t('admin.woredaDeleted'));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.deleteFailed'));
    }
    setDelConfirm(null);
  };

  const isCreateModal = modal === 'create';
  const isEditModal   = modal?.type === 'edit';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
          {t('admin.woredaManagement')}{' '}
          <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">
            ({total})
          </span>
        </h2>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4">
          + {t('admin.addWoreda')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={t('admin.searchWoredas')}
          className="input-field flex-1 min-w-[180px]"
        />

        {/* Subcity filter — live from DB */}
        <select
          value={filterSubcity}
          onChange={(e) => { setFilterSubcity(e.target.value); setPage(1); }}
          className="input-field w-auto"
        >
          <option value="">{t('admin.allSubcities')}</option>
          {subcities.map((sc) => (
            <option key={sc._id} value={sc.name}>{sc.name}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input-field w-auto"
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="Active">{t('admin.deptActive')}</option>
          <option value="Inactive">{t('admin.deptInactive')}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : woredas.length === 0 ? (
        <EmptyState icon="🏙️" title={t('admin.noWoredasYet')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.woredaName')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.subcity')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.deptCreatedCol')}</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {woredas.map((w) => (
                <tr key={w._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs">
                        {w.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{w.name}</span>
                        {w.description && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1 max-w-[220px]">
                            {w.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {/* Display the subcity name exactly as stored — no mapping needed */}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      {w.subcity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${
                      w.status === 'Active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {w.status === 'Active' ? t('admin.deptActive') : t('admin.deptInactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(w)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleToggleStatus(w)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium ${
                          w.status === 'Active'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40'
                            : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                        }`}
                      >
                        {w.status === 'Active' ? t('dashboard.deactivate') : t('dashboard.activate')}
                      </button>
                      <button
                        onClick={() => setDelConfirm({ id: w._id, name: w.name })}
                        className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                      >
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

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!delConfirm}
        title={t('admin.deleteWoreda')}
        message={t('admin.deleteWoredaConfirm', { name: delConfirm?.name })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => handleDelete(delConfirm.id)}
        onCancel={() => setDelConfirm(null)}
      />

      {/* Create / Edit modal */}
      {(isCreateModal || isEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4 text-gray-800 dark:text-gray-200">
              {isCreateModal ? t('admin.addWoreda') : t('admin.editWoreda')}
            </h3>
            <form onSubmit={handleSave} noValidate className="space-y-3">

              {/* Subcity selector — populated from live DB data */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('admin.subcity')} <span className="text-red-500">*</span>
                </label>
                {subcitiesLoading ? (
                  <div className="input-field flex items-center gap-2 text-gray-400 text-sm">
                    <span className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin inline-block" />
                    Loading subcities…
                  </div>
                ) : subcities.length === 0 ? (
                  <div className="input-field text-sm text-amber-600 dark:text-amber-400">
                    No subcities found — create one in Subcity Management first.
                  </div>
                ) : (
                  <select
                    value={form.subcity}
                    onChange={(e) => setForm((p) => ({ ...p, subcity: e.target.value }))}
                    className="input-field w-full"
                  >
                    <option value="">{t('admin.selectSubcity')}</option>
                    {subcities.map((sc) => (
                      <option key={sc._id} value={sc.name}>
                        {sc.name}
                      </option>
                    ))}
                  </select>
                )}
                {errors.subcity && (
                  <p className="text-xs text-red-500 mt-1">{errors.subcity}</p>
                )}
              </div>

              {/* Woreda name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('admin.woredaName')} <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="input-field w-full"
                  placeholder="e.g. Woreda 07"
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('admin.deptDescription')}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="input-field w-full resize-none"
                  placeholder={t('admin.deptDescriptionPlaceholder')}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('admin.deptStatus')}
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="Active">{t('admin.deptActive')}</option>
                  <option value="Inactive">{t('admin.deptInactive')}</option>
                </select>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="btn-secondary flex-1"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || subcitiesLoading || subcities.length === 0}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {saving
                    ? t('dashboard.processing')
                    : isCreateModal
                    ? t('admin.addWoreda')
                    : t('admin.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
