import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaEdit, FaTrash, FaExclamationTriangle, FaCreditCard, FaPhoneAlt, FaBuilding } from 'react-icons/fa';
import { donationAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { paymentMethodIcon } from '../../public/Donate';
import { toast } from 'react-toastify';

const EMPTY = {
  name: '',
  nameAmharic: '',
  code: '',
  type: 'mobile_money',
  accountNumber: '',
  accountHolder: '',
  branch: '',
  qrContent: '',
  instructions: '',
  sortOrder: 10,
  isActive: true,
};

export default function AdminPaymentMethods() {
  const { t } = useTranslation();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await donationAPI.getAdminPaymentMethods();
      setMethods(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(EMPTY); setEditing('new'); };
  const openEdit = (m) => {
    setForm({ name: m.name || '', nameAmharic: m.nameAmharic || '', code: m.code || '', type: m.type || 'mobile_money', accountNumber: m.accountNumber || '', accountHolder: m.accountHolder || '', branch: m.branch || '', qrContent: m.qrContent || '', instructions: m.instructions || '', sortOrder: m.sortOrder ?? 10, isActive: m.isActive });
    setEditing(m._id);
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim() || !form.accountNumber.trim()) {
      toast.error('Name, code and account number are required');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await donationAPI.createPaymentMethod({ ...form, code: form.code.trim().toLowerCase().replace(/\s+/g, '_') });
        toast.success('Payment method added');
      } else {
        await donationAPI.updatePaymentMethod(editing, form);
        toast.success('Payment method updated');
      }
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save payment method');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await donationAPI.deletePaymentMethod(deleteTarget._id);
      toast.success('Payment method deleted');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete payment method');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('donate.admin.paymentMethods.title')}</h2>
          <p className="text-sm text-gray-500">{t('donate.admin.paymentMethods.desc')}</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm inline-flex items-center gap-2">
          <FaPlus /> {t('donate.admin.paymentMethods.add')}
        </button>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 mb-6 flex items-start gap-3">
        <FaExclamationTriangle className="text-yellow-600 mt-0.5 shrink-0" />
        <p className="text-sm text-yellow-800 dark:text-yellow-300">{t('donate.admin.paymentMethods.placeholderWarning')}</p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : methods.length === 0 ? (
        <div className="text-center py-16 card">
          <div className="text-6xl mb-4">💳</div>
          <p className="text-gray-500 dark:text-gray-400">No payment methods configured yet</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {methods.map((m) => {
            const meta = paymentMethodIcon(m.code);
            return (
              <motion.div key={m._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-xl`}>{meta.icon}</span>
                    <div>
                      <p className="font-bold text-gray-800 dark:text-gray-200">{m.name}</p>
                      <p className="text-[11px] text-gray-400 capitalize">{m.type?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <FaCreditCard className="text-gray-400 text-xs" />
                    <span className="font-mono">{m.accountNumber}</span>
                  </p>
                  {m.accountHolder && <p className="text-xs text-gray-400">{m.accountHolder}</p>}
                  {m.branch && <p className="flex items-center gap-2 text-xs text-gray-400"><FaBuilding className="text-xs" /> {m.branch}</p>}
                  {m.instructions && <p className="text-xs text-gray-400 line-clamp-2">{m.instructions}</p>}
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => openEdit(m)} className="btn-secondary text-xs flex-1 inline-flex items-center justify-center gap-1.5">
                    <FaEdit /> {t('donate.admin.paymentMethods.edit')}
                  </button>
                  <button onClick={() => setDeleteTarget(m)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg" title={t('donate.admin.paymentMethods.delete')}>
                    <FaTrash />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
            <motion.form initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.98 }} onSubmit={save} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full my-8">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editing === 'new' ? t('donate.admin.paymentMethods.add') : t('donate.admin.paymentMethods.edit')}
                </h3>
                <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.name')} *</label>
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input-field text-sm" placeholder="Telebirr" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.nameAmharic')}</label>
                    <input value={form.nameAmharic} onChange={(e) => set('nameAmharic', e.target.value)} className="input-field text-sm" placeholder="ቴሌብር" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.code')} *</label>
                    <input value={form.code} onChange={(e) => set('code', e.target.value)} className="input-field text-sm font-mono" placeholder="telebirr" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.type')}</label>
                    <select value={form.type} onChange={(e) => set('type', e.target.value)} className="input-field text-sm">
                      <option value="mobile_money">{t('donate.admin.paymentMethods.typeMobile')}</option>
                      <option value="bank">{t('donate.admin.paymentMethods.typeBank')}</option>
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.accountNumber')} *</label>
                    <input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} className="input-field text-sm font-mono" placeholder="09XXXXXXXX" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.accountHolder')}</label>
                    <input value={form.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} className="input-field text-sm" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.branch')}</label>
                    <input value={form.branch} onChange={(e) => set('branch', e.target.value)} className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.sortOrder')}</label>
                    <input type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} className="input-field text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.qrContent')}</label>
                  <input value={form.qrContent} onChange={(e) => set('qrContent', e.target.value)} className="input-field text-sm" placeholder="https://pay.telebirr.et/... (optional)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('donate.admin.paymentMethods.instructions')}</label>
                  <textarea value={form.instructions} onChange={(e) => set('instructions', e.target.value)} rows={2} className="input-field text-sm" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4 accent-primary-600" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('donate.admin.paymentMethods.isActive')}</span>
                </label>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">{t('donate.admin.paymentMethods.cancel')}</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '...' : t('donate.admin.paymentMethods.save')}</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirm ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
              <div className="text-5xl mb-3">🗑️</div>
              <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">{t('donate.admin.paymentMethods.deleteConfirm')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{deleteTarget.name}</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">{t('donate.admin.close')}</button>
                <button onClick={remove} className="btn-danger flex-1">{t('donate.admin.paymentMethods.delete')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
