import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const EMPTY_FORM = { name: '', description: '', status: 'Active', subcityId: '', woredaId: '' };

// Mirrors backend normalizeDepartmentName: case- and whitespace-insensitive.
const normalizeName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export default function AdminDepartments() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subcities, setSubcities] = useState([]);
  const [woredas, setWoredas] = useState([]);
  const [woredasLoading, setWoredasLoading] = useState(false);
  const [subcityFilter, setSubcityFilter] = useState(searchParams.get('subcity') || '');
  const [departments, setDepartments] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [delConfirm, setDelConfirm] = useState(null);
  const lastToastRef = useRef(null);

  useEffect(() => {
    adminAPI.getSubcities()
      .then((r) => setSubcities(r.data.subcities || []))
      .catch(() => setSubcities([]));
  }, []);

  // Loads only the woredas that belong to the selected subcity (matched by the
  // subcity's name — Woreda records store the subcity they were created under).
  const loadWoredas = async (subcityId, subcityName) => {
    setWoredasLoading(true);
    try {
      if (!subcityId || !subcityName) {
        setWoredas([]);
        return;
      }
      const r = await adminAPI.getWoredas({ subcity: subcityName, status: 'Active', limit: 500 });
      setWoredas(r.data.woredas || []);
    } catch (e) {
      setWoredas([]);
    } finally {
      setWoredasLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { search, status, page, limit: 10 };
      if (subcityFilter) params.subcity = subcityFilter;
      const r = await adminAPI.getDepartments(params);
      setDepartments(r.data.departments || []);
      setPages(r.data.pages || 1);
      setTotal(r.data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [search, status, subcityFilter, page]);

  // Reset the toast guard whenever the user changes the name or modal, so a new
  // attempt may toast again but repeated identical errors never spam.
  useEffect(() => { lastToastRef.current = null; }, [form.name, modal]);

  const toastOnce = (msg) => {
    if (lastToastRef.current === msg) return;
    lastToastRef.current = msg;
    toast.error(msg);
  };

  const handleSubcityFilter = (val) => {
    setSubcityFilter(val);
    setPage(1);
    setSearchParams(val ? { subcity: val } : {}, { replace: true });
  };

  const loadAll = async () => {
    try {
      const r = await adminAPI.getDepartments({ limit: 500 });
      setAllDepartments(r.data.departments || []);
    } catch (e) {
      setAllDepartments([]);
    }
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, subcityId: subcityFilter });
    setErrors({});
    setModal('create');
    const presetSubcity = subcities.find((s) => s._id === subcityFilter);
    loadWoredas(subcityFilter, presetSubcity?.name || '');
    loadAll();
  };

  const openEdit = (d) => {
    setForm({ name: d.name, description: d.description || '', status: d.status, subcityId: d.subcityId || '', woredaId: d.woredaId || '' });
    setErrors({});
    setModal({ type: 'edit', id: d._id });
    loadWoredas(d.subcityId, d.subcityName);
    loadAll();
  };

  const handleSubcityChange = (val) => {
    const sc = subcities.find((s) => s._id === val);
    setForm((p) => ({ ...p, subcityId: val, woredaId: '' }));
    setWoredas([]);
    loadWoredas(val, sc?.name || '');
  };

  // Live duplicate check against the full department list, scoped to the form's
  // subcity + woreda: the same name may exist in different scopes but never
  // twice within one (subcity, woreda) combination. The inline error appears
  // while typing (not only after submit).
  const nameValidation = useMemo(() => {
    if (!modal) return null;
    const normalized = normalizeName(form.name);
    if (!normalized) return { type: 'required' };
    const scopeId = form.subcityId || '';
    const woredaScope = form.woredaId || '';
    const match = allDepartments.find((d) => {
      if (modal !== 'create' && d._id === modal.id) return false;
      if ((d.subcityId || '') !== scopeId) return false;
      if ((d.woredaId || '') !== woredaScope) return false;
      return (d.normalizedDepartmentName && d.normalizedDepartmentName === normalized)
        || (d.normalizedName && d.normalizedName === normalized)
        || normalizeName(d.name) === normalized;
    });
    if (!match) return null;
    return match.status === 'Inactive'
      ? { type: 'inactive', department: match }
      : { type: 'exists', department: match };
  }, [form.name, form.subcityId, form.woredaId, allDepartments, modal]);

  const isDuplicate = nameValidation && (nameValidation.type === 'exists' || nameValidation.type === 'inactive');

  // A woreda may only be picked when a subcity is selected first.
  const woredaWithoutSubcity = !!(form.woredaId && !form.subcityId);

  const validateForm = () => {
    const errs = {};
    if (nameValidation) {
      if (nameValidation.type === 'required') errs.name = t('admin.deptNameRequired');
      else if (nameValidation.type === 'exists') errs.name = t('admin.deptNameInUse');
      else if (nameValidation.type === 'inactive') errs.name = t('admin.deptInactiveExists');
    }
    if (woredaWithoutSubcity) errs.subcityId = t('admin.subcityRequiredWhenWoreda');
    setErrors(errs);
    return !nameValidation && !woredaWithoutSubcity;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = { ...form, subcityId: form.subcityId || null, woredaId: form.woredaId || null };
      if (modal === 'create') {
        await adminAPI.createDepartment(payload);
        toast.success(t('admin.departmentCreated'));
      } else {
        await adminAPI.updateDepartment(modal.id, payload);
        toast.success(t('admin.departmentUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message || t('dashboard.actionFailed');
      if (code === 'DEPARTMENT_NAME_EXISTS') {
        setErrors(prev => ({ ...prev, name: t('admin.deptNameInUse') }));
        toastOnce(t('admin.deptNameInUse'));
      } else if (code === 'DEPARTMENT_EXISTS_INACTIVE') {
        setErrors(prev => ({ ...prev, name: t('admin.deptInactiveExists') }));
        toastOnce(t('admin.deptInactiveExists'));
      } else {
        toastOnce(msg);
      }
    }
    finally { setSaving(false); }
  };

  const handleReactivate = async () => {
    const dep = nameValidation?.type === 'inactive' ? nameValidation.department : null;
    if (!dep) return;
    setSaving(true);
    try {
      await adminAPI.updateDepartment(dep._id, { status: 'Active' });
      toast.success(t('admin.departmentReactivated'));
      setModal(null);
      fetchData();
    } catch (err) {
      toastOnce(err.response?.data?.message || t('dashboard.actionFailed'));
    }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (d) => {
    try {
      const next = d.status === 'Active' ? 'Inactive' : 'Active';
      await adminAPI.updateDepartment(d._id, { status: next });
      toast.success(next === 'Inactive' ? t('admin.departmentDeactivated') : t('admin.departmentActivated'));
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.actionFailed')); }
  };

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteDepartment(id);
      toast.success(t('admin.departmentDeleted'));
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.deleteFailed')); }
    setDelConfirm(null);
  };

  const isCreateModal = modal === 'create';
  const isEditModal = modal && modal.type === 'edit';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
          {t('admin.deptManagement')} <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">({total})</span>
        </h2>
        <button onClick={openCreate} className="btn-primary text-sm py-2 px-4">+ {t('admin.addDepartment')}</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('admin.searchDepartments')} className="input-field flex-1 min-w-[180px]" />
        <select value={subcityFilter} onChange={e => handleSubcityFilter(e.target.value)} className="input-field w-auto">
          <option value="">{t('admin.allSubcities')}</option>
          {subcities.map(sc => (
            <option key={sc._id} value={sc._id}>{sc.name}</option>
          ))}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">{t('common.allStatuses')}</option>
          <option value="Active">{t('admin.deptActive')}</option>
          <option value="Inactive">{t('admin.deptInactive')}</option>
        </select>
      </div>

      {loading ? <LoadingSpinner /> : departments.length === 0 ? <EmptyState icon="🏛️" title={t('admin.noDepartmentsYet')} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 dark:bg-gray-700 text-left">
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.deptName')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.subcity')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.woreda')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.deptDescription')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('common.status')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('admin.deptCreatedCol')}</th>
              <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {departments.map(d => (
                <tr key={d._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs">
                        {(d.name || 'D').charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{d.name || ''}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                      {d.subcityName || t('admin.globalDepartment')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {d.woredaName ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                        {d.woredaName}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[240px]">
                    <span className="line-clamp-2">{d.description || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${d.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                      {d.status === 'Active' ? t('admin.deptActive') : t('admin.deptInactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => openEdit(d)} className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium">{t('common.edit')}</button>
                      <button onClick={() => handleToggleStatus(d)} className={`text-xs py-1 px-2 rounded-lg font-medium ${d.status === 'Active' ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40' : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'}`}>
                        {d.status === 'Active' ? t('dashboard.deactivate') : t('dashboard.activate')}
                      </button>
                      <button onClick={() => setDelConfirm({ id: d._id, name: d.name })} className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600">{t('common.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      <ConfirmModal
        isOpen={!!delConfirm}
        title={t('admin.deleteDepartment')}
        message={t('admin.deleteDepartmentConfirm', { name: delConfirm?.name })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => handleDelete(delConfirm.id)}
        onCancel={() => setDelConfirm(null)}
      />

      {(isCreateModal || isEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl dark:bg-gray-800 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4 text-gray-800 dark:text-gray-200">{isCreateModal ? t('admin.addDepartment') : t('admin.editDepartment')}</h3>
            <form onSubmit={handleSave} noValidate className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.deptName')} *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-field" placeholder="e.g. Health, Education, Revenue" />
                {nameValidation?.type === 'required' && <p className="text-xs text-red-500 mt-1">{t('admin.deptNameRequired')}</p>}
                {nameValidation?.type === 'exists' && <p className="text-xs text-red-500 mt-1">{t('admin.deptNameInUse')}</p>}
                {nameValidation?.type === 'inactive' && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{t('admin.deptInactiveExists')}</span>
                    <button type="button" onClick={handleReactivate} disabled={saving} className="underline font-semibold disabled:opacity-50">
                      {t('admin.reactivate')}
                    </button>
                  </div>
                )}
                {errors.name && !nameValidation && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.subcity')}</label>
                <select value={form.subcityId} onChange={e => handleSubcityChange(e.target.value)} className="input-field">
                  <option value="">{t('admin.selectDeptSubcity')}</option>
                  {subcities.map(sc => (
                    <option key={sc._id} value={sc._id}>{sc.name}</option>
                  ))}
                </select>
                {woredaWithoutSubcity && <p className="text-xs text-red-500 mt-1">{t('admin.subcityRequiredWhenWoreda')}</p>}
                {errors.subcityId && !woredaWithoutSubcity && <p className="text-xs text-red-500 mt-1">{errors.subcityId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.woreda')}</label>
                <select
                  value={form.woredaId}
                  onChange={e => setForm(p => ({ ...p, woredaId: e.target.value }))}
                  disabled={!form.subcityId || woredasLoading}
                  className="input-field disabled:opacity-50"
                >
                  <option value="">{!form.subcityId ? t('admin.selectSubcityFirst') : woredasLoading ? 'Loading woredas…' : t('admin.selectDeptWoreda')}</option>
                  {!woredasLoading && woredas.map(w => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.deptDescription')}</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input-field" placeholder={t('admin.deptDescriptionPlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.deptStatus')}</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="input-field">
                  <option value="Active">{t('admin.deptActive')}</option>
                  <option value="Inactive">{t('admin.deptInactive')}</option>
                </select>
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
                <button type="submit" disabled={saving || isDuplicate} className="btn-primary flex-1 disabled:opacity-50">{saving ? t('dashboard.processing') : isCreateModal ? t('admin.addDepartment') : t('admin.saveChanges')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
