import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { newsAPI } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Pagination from '../../components/common/Pagination';

const CATEGORIES = ['Government Updates','NGO Activities','Success Stories','Emergency Alerts','Platform Updates','Community News'];

export default function NewsPage() {
  const { t } = useTranslation();
  const catLabels = { 'Government Updates':t('news.catGov'), 'NGO Activities':t('news.catNgo'), 'Success Stories':t('news.catSuccess'), 'Emergency Alerts':t('news.catAlert'), 'Platform Updates':t('news.catPlatform'), 'Community News':t('news.catCommunity') };
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await newsAPI.getPublic({ search, category, page, limit: 9 });
        setNews(res.data.news);
        setPages(res.data.pages);
        setTotal(res.data.total);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
  }, [search, category, page]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('news.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('news.desc')}</p>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">🔍</span>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('search.news')} className="input-field pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setCategory(''); setPage(1); }} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!category ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}>{t('news.all')}</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => { setCategory(c); setPage(1); }} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${category === c ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}>{catLabels[c] || c}</button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('news.articlesFound', { count: total })}</p>

      {loading ? <LoadingSpinner /> : news.length === 0
        ? <EmptyState icon="📰" title={t('news.noNews')} description={t('news.checkBack')} />
        : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map(n => (
              <Link key={n._id} to={`/news/${n._id}`} className="card hover:shadow-md transition-shadow group flex flex-col">
                {n.featuredImage && <img src={n.featuredImage} alt="" className="w-full h-44 object-cover rounded-lg mb-4" />}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full">{n.category}</span>
                  {n.organizationName && <span className="text-xs text-gray-400 dark:text-gray-500">{n.organizationName}</span>}
                </div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 group-hover:text-primary-600 transition-colors line-clamp-2 flex-1">{n.title}</h3>
                {n.summary && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{n.summary}</p>}
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(n.publishedAt || n.createdAt).toLocaleDateString()}</p>
                  <span className="text-xs text-primary-600 font-medium group-hover:underline">{t('news.readMore')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />
    </div>
  );
}
