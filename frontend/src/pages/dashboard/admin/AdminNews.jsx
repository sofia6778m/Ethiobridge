import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { newsAPI } from '../../../services/api';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toast } from 'react-toastify';

const CATEGORIES = ['Government Updates','NGO Activities','Success Stories','Emergency Alerts','Platform Updates','Community News'];

export default function AdminNews() {
  const { t } = useTranslation();
  const catLabels = { 'Government Updates':t('news.catGov'), 'NGO Activities':t('news.catNgo'), 'Success Stories':t('news.catSuccess'), 'Emergency Alerts':t('news.catAlert'), 'Platform Updates':t('news.catPlatform'), 'Community News':t('news.catCommunity') };
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [composing, setComposing] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [form, setForm] = useState({ title:'', content:'', summary:'', category:'', region:'' });
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const r = await newsAPI.getAll({ page, limit: 10 });
      setNews(r.data.news);
      setPages(r.data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNews(); }, [page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      if (imageFile) fd.append('featuredImage', imageFile);
      await newsAPI.create(fd);
      toast.success(t('dashboard.newsCreated'));
      setComposing(false);
      setForm({ title:'', content:'', summary:'', category:'', region:'' });
      setImageFile(null);
      fetchNews();
    } catch (err) { toast.error(err.response?.data?.message || t('dashboard.createFailed')); }
    finally { setSaving(false); }
  };

  const handlePublish = async (id) => {
    try {
      await newsAPI.publish(id);
      toast.success(t('dashboard.articlePublished'));
      fetchNews();
    } catch (err) { toast.error(t('dashboard.publishFailed')); }
  };

  const handleDelete = async (id) => {
    try {
      await newsAPI.delete(id);
      toast.success(t('dashboard.articleDeleted'));
      fetchNews();
    } catch (err) { toast.error(t('dashboard.deleteFailed')); }
    setDelConfirm(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.newsManagement')}</h2>
        <button onClick={() => setComposing(true)} className="btn-primary text-sm py-2 px-4">{t('dashboard.newArticle')}</button>
      </div>

      {composing && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('dashboard.createNewsArticle')}</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.titleLabel')}</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.categoryLabel')}</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} required className="input-field">
                  <option value="">{t('dashboard.selectPlaceholder')}</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{catLabels[c] || c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.summaryLabel')}</label>
              <input value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} className="input-field" placeholder={t('dashboard.summaryPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.contentLabel')}</label>
              <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} required rows={6} className="input-field" placeholder={t('dashboard.contentPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.featuredImage')}</label>
              <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} className="input-field py-1.5" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setComposing(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? t('dashboard.updating') : t('dashboard.saveArticle')}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <LoadingSpinner /> : news.length === 0 ? <EmptyState icon="📰" title={t('dashboard.noNewsYet')} /> : (
        <div className="space-y-3">
          {news.map(n => (
            <div key={n._id} className="card p-4 flex items-start justify-between gap-4">
              <div className="flex gap-3 flex-1 min-w-0">
                {n.featuredImage && <img src={n.featuredImage} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full">{n.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${n.isPublished ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{n.isPublished ? t('dashboard.published') : t('dashboard.draft')}</span>
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{n.title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(n.createdAt).toLocaleDateString()} • {n.views}{t('dashboard.viewsSuffix')}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {!n.isPublished && (
                  <button onClick={() => handlePublish(n._id)} className="text-xs bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40 px-3 py-1.5 rounded-lg">{t('dashboard.publishBtn')}</button>
                )}
                <button onClick={() => setDelConfirm({ id: n._id, name: n.title })} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg">{t('dashboard.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      <ConfirmModal
        isOpen={!!delConfirm}
        title={t('dashboard.deleteArticle')}
        message={t('dashboard.deleteArticleConfirm', { name: delConfirm?.name })}
        confirmLabel={t('dashboard.delete')}
        danger
        onConfirm={() => handleDelete(delConfirm.id)}
        onCancel={() => setDelConfirm(null)}
      />
    </div>
  );
}
