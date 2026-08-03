import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

// ── Constants ──────────────────────────────────────────────────────────────────

// Fallback lists used only if the Department / Subcity collections are empty.
const FALLBACK_DEPARTMENTS  = ['Electricity', 'Road', 'Water'];
const FALLBACK_SUBCITIES    = ['BOLE', 'YEKA', 'LEMMI_KURA'];

const DEPT_COLORS = {
  Electricity: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Road:        'bg-stone-100 text-stone-800 dark:bg-stone-700/50 dark:text-stone-300',
  Water:       'bg-cyan-100  text-cyan-800  dark:bg-cyan-900/30  dark:text-cyan-300',
};
const SUBCITY_COLORS = {
  BOLE:       'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  YEKA:       'bg-teal-100   text-teal-800   dark:bg-teal-900/30   dark:text-teal-300',
  LEMMI_KURA: 'bg-rose-100   text-rose-800   dark:bg-rose-900/30   dark:text-rose-300',
};

const canonicalSubcity = (name) =>
  String(name || '').trim().toUpperCase().replace(/\s+/g, '_');

const EMPTY_FORM = { name: '', department: '', subcity: '', description: '', isActive: true };

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminIssueTypes() {
  const [issueTypes, setIssueTypes] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [seeding, setSeeding]       = useState(false);

  // Master-data lists (DB-driven with static fallbacks)
  const [departments,   setDepartments]   = useState([]);
  const [subcityOptions, setSubcityOptions] = useState([]); // [{ value, label }]

  // filters
  const [filterDept,    setFilterDept]    = useState('');
  const [filterSubcity, setFilterSubcity] = useState('');
  const [filterActive,  setFilterActive]  = useState('');
  const [search,        setSearch]        = useState('');
  const [searchInput,   setSearchInput]   = useState('');
  const [page,          setPage]          = useState(1);
  const [pages,         setPages]         = useState(1);
  const [total,         setTotal]         = useState(0);

  // modal: null | 'create' | { type: 'edit', id, currentName }
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [errors,      setErrors]      = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // null | { id, name }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filterDept)    params.department = filterDept;
      if (filterSubcity) params.subcity    = filterSubcity;
      if (filterActive !== '') params.isActive = filterActive;
      if (search)        params.search     = search;

      const res = await adminAPI.getIssueTypes(params);
      setIssueTypes(res.data.issueTypes || []);
      setPages(res.data.pages || 1);
      setTotal(res.data.total || 0);
    } catch {
      toast.error('Failed to load issue types');
    } finally {
      setLoading(false);
    }
  }, [page, filterDept, filterSubcity, filterActive, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Load master data (departments + subcities) ─────────────────────────────
  useEffect(() => {
    const loadMaster = async () => {
      try {
        const [dres, sres] = await Promise.all([
          adminAPI.getDepartments({ status: 'Active', limit: 100 }),
          adminAPI.getSubcities(),
        ]);
        const deps = (dres.data.departments || []).map((d) => d.name).filter(Boolean);
        const subs = (sres.data.subcities || [])
          .filter((s) => !s.status || s.status === 'Active')
          .map((s) => ({ value: canonicalSubcity(s.name), label: s.name }))
          .filter((s) => s.value);
        if (deps.length) setDepartments(deps);
        if (subs.length) setSubcityOptions(subs);
      } catch {
        // Keep static fallbacks on failure — the page still works.
      }
    };
    loadMaster();
  }, []);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setModal('create');
  };

  const openEdit = (it) => {
    setForm({
      name: it.name,
      department: it.department,
      subcity: it.subcity,
      description: it.description || '',
      isActive: it.isActive,
    });
    setErrors({});
    setModal({ type: 'edit', id: it._id, currentName: it.name });
  };

  const closeModal = () => { setModal(null); setErrors({}); };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = () => {
    const errs = {};
    if (!form.name.trim())  errs.name       = 'Issue type name is required.';
    if (!form.department)   errs.department = 'Department is required.';
    if (!form.subcity)      errs.subcity    = 'Subcity is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name:        form.name.trim(),
        department:  form.department,
        subcity:     form.subcity,
        description: form.description.trim(),
        isActive:    form.isActive,
      };
      if (modal === 'create') {
        await adminAPI.createIssueType(payload);
        toast.success('Issue type created');
      } else {
        await adminAPI.updateIssueType(modal.id, payload);
        toast.success('Issue type updated');
      }
      closeModal();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      if (/already exists/i.test(msg)) {
        setErrors((p) => ({ ...p, name: msg }));
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle ─────────────────────────────────────────────────────────────────

  const handleToggle = async (it) => {
    try {
      await adminAPI.toggleIssueType(it._id);
      toast.success(`Issue type ${it.isActive ? 'deactivated' : 'activated'}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Toggle failed');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteIssueType(id);
      toast.success('Issue type deleted');
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // ── Seed ───────────────────────────────────────────────────────────────────

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await adminAPI.seedIssueTypes();
      const { created, skipped } = res.data;
      toast.success(`Seed complete — ${created} created, ${skipped} already existed`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const isCreateModal = modal === 'create';
  const isEditModal   = modal?.type === 'edit';

  const deptList = departments.length ? departments : FALLBACK_DEPARTMENTS;
  const subcityList = subcityOptions.length
    ? subcityOptions
    : FALLBACK_SUBCITIES.map((sc) => ({ value: sc, label: sc }));
  const subcityLabel = (key) =>
    subcityOptions.find((s) => s.value === key)?.label || key;

  // Group counts by subcity → department for the summary grid
  const summary = {};
  for (const sc of subcityList) {
    summary[sc.value] = {};
    for (const d of deptList) summary[sc.value][d] = 0;
  }
  issueTypes.forEach((it) => {
    if (summary[it.subcity] && summary[it.subcity][it.department] !== undefined) {
      summary[it.subcity][it.department]++;
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            Issue Type Management{' '}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">({total})</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage complaint issue types per subcity and department. Options are driven by the departments and subcities in master data.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60"
          >
            {seeding
              ? <><span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> Seeding…</>
              : '🌱 Seed 45 Issue Types'}
          </button>
          <button onClick={openCreate} className="btn-primary text-sm py-2 px-4">
            + Add Issue Type
          </button>
        </div>
      </div>

      {/* ── Summary grid ─────────────────────────────────────────────────────── */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subcityList.map((sc) => (
            <div key={sc.value} className="card p-4">
              <p className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit mb-3 ${SUBCITY_COLORS[sc.value] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                {subcityLabel(sc.value)}
              </p>
              <div className="space-y-1.5">
                {deptList.map((d) => (
                  <div key={d} className="flex items-center justify-between text-sm">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEPT_COLORS[d] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>{d}</span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{summary[sc.value][d]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
          className="flex gap-2 flex-1 min-w-[200px]"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search issue type name…"
            className="input-field flex-1 text-sm"
          />
          <button type="submit" className="btn-primary px-3 py-2 text-sm">Search</button>
        </form>

        <select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}
          className="input-field text-sm w-auto">
          <option value="">All Departments</option>
          {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <select value={filterSubcity} onChange={(e) => { setFilterSubcity(e.target.value); setPage(1); }}
          className="input-field text-sm w-auto">
          <option value="">All Subcities</option>
          {subcityList.map((sc) => <option key={sc.value} value={sc.value}>{subcityLabel(sc.value)}</option>)}
        </select>

        <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
          className="input-field text-sm w-auto">
          <option value="">All Statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        {(filterDept || filterSubcity || filterActive !== '' || search) && (
          <button
            onClick={() => { setFilterDept(''); setFilterSubcity(''); setFilterActive(''); setSearch(''); setSearchInput(''); setPage(1); }}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner />
      ) : issueTypes.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No issue types found"
          description='Click "🌱 Seed 45 Issue Types" to populate the defaults, or use "+ Add Issue Type" to create one manually.'
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Name</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Department</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Subcity</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Description</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {issueTypes.map((it) => (
                <tr key={it._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  {/* Name */}
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{it.name}</td>

                  {/* Department */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEPT_COLORS[it.department] || 'bg-gray-100 text-gray-700'}`}>
                      {it.department}
                    </span>
                  </td>

                  {/* Subcity */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUBCITY_COLORS[it.subcity] || 'bg-gray-100 text-gray-700'}`}>
                      {subcityLabel(it.subcity) || it.subcity}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[220px]">
                    <span className="line-clamp-2">{it.description || '—'}</span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      it.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-300'
                    }`}>
                      {it.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => openEdit(it)}
                        className="text-xs py-1 px-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(it)}
                        className={`text-xs py-1 px-2 rounded-lg font-medium transition-colors ${
                          it.isActive
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : 'bg-green-50  text-green-700  hover:bg-green-100  dark:bg-green-900/20  dark:text-green-400'
                        }`}
                      >
                        {it.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: it._id, name: it.name })}
                        className="text-xs py-1 px-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 font-medium transition-colors"
                      >
                        Delete
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

      {/* ── Delete confirmation ───────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Issue Type"
        message={`Delete "${deleteConfirm?.name}"? This cannot be undone and will fail if any complaints reference it.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ── Create / Edit modal ───────────────────────────────────────────────── */}
      {(isCreateModal || isEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">

            {/* Header */}
            <h3 className="font-bold text-lg mb-1 text-gray-800 dark:text-gray-200">
              {isCreateModal ? 'Add Issue Type' : `Edit — ${modal.currentName}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Each (name, department, subcity) combination must be unique.
            </p>

            <form onSubmit={handleSave} noValidate className="space-y-4">

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Issue Type Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setErrors((p) => ({ ...p, name: undefined })); }}
                  placeholder="e.g. Power Outage"
                  className={`input-field w-full ${errors.name ? 'border-red-400 dark:border-red-500' : ''}`}
                  autoFocus
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              {/* Department + Subcity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) => { setForm((p) => ({ ...p, department: e.target.value })); setErrors((p) => ({ ...p, department: undefined })); }}
                    className={`input-field w-full ${errors.department ? 'border-red-400' : ''}`}
                  >
                    <option value="">Select…</option>
                    {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subcity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.subcity}
                    onChange={(e) => { setForm((p) => ({ ...p, subcity: e.target.value })); setErrors((p) => ({ ...p, subcity: undefined })); }}
                    className={`input-field w-full ${errors.subcity ? 'border-red-400' : ''}`}
                  >
                    <option value="">Select…</option>
                    {subcityList.map((sc) => <option key={sc.value} value={sc.value}>{subcityLabel(sc.value)}</option>)}
                  </select>
                  {errors.subcity && <p className="text-xs text-red-500 mt-1">{errors.subcity}</p>}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description…"
                  className="input-field w-full resize-none"
                />
              </div>

              {/* Status toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {form.isActive ? 'Active (visible to citizens)' : 'Inactive (hidden from citizens)'}
                </span>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1" disabled={saving}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : isCreateModal ? 'Add Issue Type' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
