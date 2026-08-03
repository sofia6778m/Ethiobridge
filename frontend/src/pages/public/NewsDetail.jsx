import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { newsAPI } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function NewsDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    newsAPI.getOne(id).then(r => { setNews(r.data.news); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner fullPage />;
  if (!news) return <div className="text-center py-20 text-gray-500">{t('news.articleNotFound')}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/news" className="text-primary-600 hover:underline text-sm mb-6 inline-block">{t('news.backToNews')}</Link>
      <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{news.category}</span>
      <h1 className="text-3xl font-bold text-gray-900 mt-3 mb-3">{news.title}</h1>
      <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
        <span>📅 {new Date(news.publishedAt || news.createdAt).toLocaleDateString()}</span>
        {news.organizationName && <span>🏛️ {news.organizationName}</span>}
        <span>👁️ {news.views} {t('news.views')}</span>
      </div>
      {news.featuredImage && <img src={news.featuredImage} alt="" className="w-full h-64 object-cover rounded-xl mb-8" />}
      <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">{news.content}</div>
      {news.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-8">
          {news.tags.map(t => <span key={t} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">#{t}</span>)}
        </div>
      )}
    </div>
  );
}
