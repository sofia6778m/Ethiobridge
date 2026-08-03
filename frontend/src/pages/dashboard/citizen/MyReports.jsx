import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../../services/api';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import Pagination from '../../../components/common/Pagination';
import ReportTimeline from '../../../components/common/ReportTimeline';
import ImageLightbox from '../../../components/common/ImageLightbox';

export default function MyReports() {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const LIMIT = 50;

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter || undefined, page: 1, limit: LIMIT };
      const r = await infraAPI.getMy(params);
      setReports(r.data.reports.map(x => ({ ...x, _type: 'Infrastructure' })));
      setPages(r.data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [statusFilter, page]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t('myReports.title')}</h2>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto text-sm">
          <option value="">{t('common.allStatuses')}</option>
          {[{v:'Pending',l:t('dashboard.statusPending')},{v:'Under Review',l:t('dashboard.statusUnderReview')},{v:'In Progress',l:t('dashboard.statusInProgress')},{v:'Active',l:t('dashboard.statusActive')},{v:'Resolved',l:t('dashboard.statusResolved')},{v:'Rejected',l:t('dashboard.statusRejected')}].map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : reports.length === 0 ? (
        <EmptyState icon="📭" title={t('myReports.noReports')} description={t('myReports.noReportsDesc')} />
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r._id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded(expanded === r._id ? null : r._id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{r._type}</span>
                    <span className="text-xs text-gray-400">{r.reportId}</span>
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100 mt-1">{r.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{r.region} · {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={r.status} />
                  <span className="text-gray-400 text-xs">{expanded === r._id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === r._id && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{r.description}</p>
                  {r.timeline?.length > 0 && <ReportTimeline timeline={r.timeline} />}
                  {r.photos?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {r.photos.map((p, i) => (
                        <img key={i} src={p} alt="" className="h-20 w-auto rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); setLightbox({ images: r.photos, videos: r.videos || [], index: i }); }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {lightbox && (
        <ImageLightbox images={lightbox.images} videos={lightbox.videos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
